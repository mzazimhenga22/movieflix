import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { cert, getApps, initializeApp } from 'npm:firebase-admin/app';
import { getFirestore } from 'npm:firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import { corsHeaders } from '../_shared/cors.ts';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FIREBASE_PROJECT_ID = (Deno.env.get('FIREBASE_PROJECT_ID') ?? 'movieflixreactnative').trim();
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

const jsonResponse = (payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const uniq = <T,>(arr: T[]) => Array.from(new Set((arr || []).filter(Boolean))) as T[];

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const parseCsv = (value: string | undefined) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const DEFAULT_BROADCAST_ADMIN_EMAILS = ['vivescharris8@gmail.com'];

const getBroadcastAdminEmails = () => {
  const fromEnv = parseCsv(Deno.env.get('BROADCAST_ADMIN_EMAILS')).map((e) => e.toLowerCase());
  return uniq([...DEFAULT_BROADCAST_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv]);
};

const getBroadcastAdminUids = () => uniq(parseCsv(Deno.env.get('BROADCAST_ADMIN_UIDS')));

function isBroadcastAdmin(decoded: { uid?: string; email?: string | null }) {
  const uid = decoded.uid;
  const email = String(decoded.email || '').toLowerCase();
  const allowedUids = getBroadcastAdminUids();
  const allowedEmails = getBroadcastAdminEmails();
  return (uid && allowedUids.includes(uid)) || (email && allowedEmails.includes(email));
}

function pickDisplayName(userData: any) {
  if (!userData || typeof userData !== 'object') return 'MovieFlix';
  return userData.displayName || userData.username || userData.name || 'MovieFlix';
}

function parseNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

function buildUrl(pathname: string, params: Record<string, unknown>) {
  const entries = Object.entries(params || {}).filter(([, v]) => v != null && String(v).length);
  if (!entries.length) return pathname;
  const query = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${pathname}?${query}`;
}

function getUserExpoTokens(userDoc: any): string[] {
  const data = (userDoc && typeof userDoc.data === 'function' ? userDoc.data() : userDoc) || {};
  const tokens: string[] = [];
  if (typeof data.expoPushToken === 'string' && data.expoPushToken) tokens.push(data.expoPushToken);
  if (Array.isArray(data.expoPushTokens)) tokens.push(...data.expoPushTokens);
  return uniq(tokens).filter(
    (t) => typeof t === 'string' && (t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken')),
  );
}

async function sendExpoPush(messages: any[]) {
  if (!messages.length) return { ok: true, receipts: [] };

  const results: any[] = [];
  for (const batch of chunk(messages, 100)) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    results.push({ status: res.status, body: data });
  }

  return { ok: true, receipts: results };
}

async function requireFirebaseAuth(req: Request) {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) throw new HttpError(401, 'Missing Authorization Bearer token');

  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    issuer: FIREBASE_ISSUER,
    audience: FIREBASE_PROJECT_ID,
  });

  const uid = (payload as any)?.user_id ?? (payload as any)?.sub;
  if (!uid) throw new HttpError(401, 'Invalid Firebase token (missing uid)');

  const email = (payload as any)?.email ? String((payload as any).email) : null;
  return { uid: String(uid), email };
}

let adminFirestore: Firestore | null = null;

function initFirestore() {
  if (adminFirestore) return adminFirestore;

  const json = (Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ?? Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? '').trim();
  const b64 = (Deno.env.get('FIREBASE_SERVICE_ACCOUNT_BASE64') ?? '').trim();

  if (!json && !b64) {
    throw new HttpError(500, 'Missing Firebase service account env (FIREBASE_SERVICE_ACCOUNT_JSON/BASE64)');
  }

  const raw = json || atob(b64);
  const credentials = JSON.parse(raw);

  const app = getApps()[0] ?? initializeApp({ credential: cert(credentials as Record<string, unknown>) });
  adminFirestore = getFirestore(app);
  return adminFirestore;
}

async function loadRecipientsFromUserIds(db: Firestore, userIds: unknown[]) {
  const ids = uniq((userIds || []).filter((id): id is string => typeof id === 'string' && id.length));
  if (!ids.length) return { ids: [] as string[], userDocs: [] as any[] };
  const userDocs = await Promise.all(ids.map((id) => db.collection('users').doc(id).get()));
  return { ids, userDocs };
}

function buildExpoMessagesForRecipients(
  recipients: { ids: string[]; userDocs: any[] },
  payload: { title: string; body: string; data?: Record<string, unknown> },
) {
  const expoMessages: any[] = [];
  recipients.userDocs.forEach((snap, idx) => {
    const userId = recipients.ids[idx];
    const tokens = getUserExpoTokens(snap);
    tokens.forEach((to) => {
      expoMessages.push({
        to,
        title: payload.title,
        body: payload.body,
        sound: 'default',
        channelId: 'default',
        priority: 'high',
        data: { ...(payload.data || {}), toUserId: userId },
      });
    });
  });
  return expoMessages;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'POST,OPTIONS' });
  }

  try {
    const db = initFirestore();
    const decoded = await requireFirebaseAuth(req);

    const body = await req.json().catch(() => ({}));
    const kind = (body && body.kind) || '';
    const uid = decoded.uid;
    if (!uid) throw new HttpError(401, 'Auth missing uid');

    const isAdmin = isBroadcastAdmin(decoded);

    if (kind === 'message') {
      const conversationId = String(body.conversationId || '');
      const messageId = String(body.messageId || '');
      if (!conversationId || !messageId) throw new HttpError(400, 'Missing conversationId/messageId');

      const convRef = db.collection('conversations').doc(conversationId);
      const convSnap = await convRef.get();
      if (!convSnap.exists) throw new HttpError(404, 'Conversation not found');

      const conv = convSnap.data() || {};
      const members = Array.isArray((conv as any).members) ? (conv as any).members : [];
      if (!members.includes(uid)) throw new HttpError(403, 'Not a member of this conversation');

      const msgRef = convRef.collection('messages').doc(messageId);
      const msgSnap = await msgRef.get();
      if (!msgSnap.exists) throw new HttpError(404, 'Message not found');

      const msg = msgSnap.data() || {};
      const from = (msg as any).from || (msg as any).sender;
      if (from !== uid) throw new HttpError(403, 'Not the sender of this message');

      const senderSnap = await db.collection('users').doc(uid).get();
      const sender = senderSnap.exists ? senderSnap.data() || {} : {};
      const senderName = (sender as any).displayName || (sender as any).username || 'New message';

      const isGroup = !!(conv as any).isGroup;
      const title = isGroup ? ((conv as any).name || (conv as any).conversationName || 'Group') : senderName;

      const preview = (() => {
        if (typeof (msg as any).text === 'string' && (msg as any).text.trim()) return (msg as any).text.trim();
        if ((msg as any).mediaType === 'image') return 'Photo';
        if ((msg as any).mediaType === 'video') return 'Video';
        if ((msg as any).mediaType === 'audio') return 'Audio message';
        if ((msg as any).mediaUrl) return 'Attachment';
        return 'New message';
      })();

      const bodyText = isGroup ? `${senderName}: ${preview}` : preview;

      const recipients = uniq(members).filter((m: any) => m && m !== uid);
      const userDocs = await Promise.all(recipients.map((id: string) => db.collection('users').doc(id).get()));

      const expoMessages: any[] = [];
      userDocs.forEach((snap, idx) => {
        const userId = recipients[idx];
        const tokens = getUserExpoTokens(snap);
        tokens.forEach((to) => {
          expoMessages.push({
            to,
            title,
            body: bodyText,
            sound: 'default',
            channelId: 'messages',
            priority: 'high',
            data: { type: 'message', conversationId, messageId, from: uid, toUserId: userId },
          });
        });
      });

      const result = await sendExpoPush(expoMessages);
      return jsonResponse({ ok: true, kind, sent: expoMessages.length, result });
    }

    if (kind === 'call') {
      const callId = String(body.callId || '');
      if (!callId) throw new HttpError(400, 'Missing callId');

      const callSnap = await db.collection('calls').doc(callId).get();
      if (!callSnap.exists) throw new HttpError(404, 'Call not found');
      const call = callSnap.data() || {};

      if ((call as any).initiatorId !== uid) throw new HttpError(403, 'Not the initiator of this call');
      const members = Array.isArray((call as any).members) ? (call as any).members : [];

      const recipients = uniq(members).filter((m: any) => m && m !== uid);
      const userDocs = await Promise.all(recipients.map((id: string) => db.collection('users').doc(id).get()));

      const callType = (call as any).type === 'video' ? 'video' : 'voice';
      const title = callType === 'video' ? 'Incoming video call' : 'Incoming voice call';
      const bodyText = (call as any).conversationName || 'MovieFlix';

      const expoMessages: any[] = [];
      userDocs.forEach((snap, idx) => {
        const userId = recipients[idx];
        const tokens = getUserExpoTokens(snap);
        tokens.forEach((to) => {
          expoMessages.push({
            to,
            title,
            body: bodyText,
            sound: 'default',
            channelId: 'calls',
            priority: 'high',
            data: { type: 'call', callId, from: uid, toUserId: userId },
          });
        });
      });

      const result = await sendExpoPush(expoMessages);
      return jsonResponse({ ok: true, kind, sent: expoMessages.length, result });
    }

    if (kind === 'notification') {
      const notificationId = String(body.notificationId || '');
      if (!notificationId) throw new HttpError(400, 'Missing notificationId');

      const notifSnap = await db.collection('notifications').doc(notificationId).get();
      if (!notifSnap.exists) throw new HttpError(404, 'Notification not found');
      const notif = notifSnap.data() || {};

      const actorId = String((notif as any).actorId || '');
      const targetUid = String((notif as any).targetUid || (notif as any).targetUserId || '');
      if (!targetUid) throw new HttpError(400, 'Notification missing targetUid');

      // Only the actor (or an admin) can fan out a push for this notification.
      if (!isAdmin && actorId && actorId !== uid) throw new HttpError(403, 'Not allowed to send this notification');

      const actorName = String((notif as any).actorName || (notif as any).fromName || 'Someone');
      const type = String((notif as any).type || 'notification');
      const message = String((notif as any).message || '').trim();

      const title =
        type === 'like'
          ? `${actorName} liked your post`
          : type === 'comment'
            ? `${actorName} commented`
            : type === 'follow'
              ? `${actorName} started following you`
              : 'MovieFlix';
      const bodyText = message || 'Tap to view';

      const rec = await loadRecipientsFromUserIds(db, [targetUid]);
      const expoMessages = buildExpoMessagesForRecipients(rec, {
        title,
        body: bodyText,
        data: {
          type: 'notification',
          notificationId,
          url: '/social-feed/notifications',
        },
      });

      const result = await sendExpoPush(expoMessages);
      return jsonResponse({ ok: true, kind, sent: expoMessages.length, result });
    }

    if (kind === 'story') {
      const storyId = String(body.storyId || '');
      if (!storyId) throw new HttpError(400, 'Missing storyId');

      const storySnap = await db.collection('stories').doc(storyId).get();
      if (!storySnap.exists) throw new HttpError(404, 'Story not found');
      const story = storySnap.data() || {};
      if (String((story as any).userId || '') !== uid) throw new HttpError(403, 'Not the owner of this story');

      const senderSnap = await db.collection('users').doc(uid).get();
      const sender = senderSnap.exists ? senderSnap.data() || {} : {};
      const senderName = pickDisplayName(sender) || (story as any).username || 'Someone';

      const followers = Array.isArray((sender as any).followers) ? (sender as any).followers : [];
      const blocked = Array.isArray((sender as any).blockedUsers) ? (sender as any).blockedUsers : [];
      const recipients = uniq(followers)
        .filter((m: any) => m && m !== uid)
        .filter((m: any) => !blocked.includes(m));

      const rec = await loadRecipientsFromUserIds(db, recipients);

      const caption = typeof (story as any).caption === 'string' ? (story as any).caption.trim() : '';
      const overlayText = typeof (story as any).overlayText === 'string' ? (story as any).overlayText.trim() : '';
      const bodyText = caption || overlayText || 'Tap to view';

      const url = `/story/${encodeURIComponent(storyId)}`;
      const expoMessages = buildExpoMessagesForRecipients(rec, {
        title: `${senderName} posted a story`,
        body: bodyText,
        data: { type: 'story', storyId, from: uid, url },
      });

      const result = await sendExpoPush(expoMessages);
      return jsonResponse({ ok: true, kind, sent: expoMessages.length, result });
    }

    if (kind === 'reel') {
      const reviewId = String(body.reviewId || '');
      if (!reviewId) throw new HttpError(400, 'Missing reviewId');

      const reviewSnap = await db.collection('reviews').doc(reviewId).get();
      if (!reviewSnap.exists) throw new HttpError(404, 'Review not found');
      const review = reviewSnap.data() || {};
      if (String((review as any).userId || '') !== uid) throw new HttpError(403, 'Not the owner of this review');

      const senderSnap = await db.collection('users').doc(uid).get();
      const sender = senderSnap.exists ? senderSnap.data() || {} : {};
      const senderName = pickDisplayName(sender) || 'Someone';

      const followers = Array.isArray((sender as any).followers) ? (sender as any).followers : [];
      const blocked = Array.isArray((sender as any).blockedUsers) ? (sender as any).blockedUsers : [];
      const recipients = uniq(followers)
        .filter((m: any) => m && m !== uid)
        .filter((m: any) => !blocked.includes(m));

      const rec = await loadRecipientsFromUserIds(db, recipients);

      const titleValue = typeof (review as any).title === 'string' && (review as any).title.trim() ? (review as any).title.trim() : 'Reel';
      const videoUrl = (review as any).videoUrl || (review as any).mediaUrl || null;

      const queueItem = {
        id: String(reviewId),
        mediaType: 'feed',
        title: titleValue,
        videoUrl,
        avatar: (review as any).userAvatar || (sender as any).photoURL || null,
        user: uid,
        docId: String(reviewId),
        likes: typeof (review as any).likes === 'number' ? (review as any).likes : 0,
        commentsCount: typeof (review as any).commentsCount === 'number' ? (review as any).commentsCount : 0,
        likerAvatars: [],
        music: `Original Sound - ${senderName}`,
      };
      const listParam = JSON.stringify([queueItem]);
      const url = buildUrl('/reels/feed', { list: listParam, id: String(reviewId) });

      const preview = (() => {
        if (typeof (review as any).review === 'string' && (review as any).review.trim()) return (review as any).review.trim();
        if (typeof (review as any).type === 'string' && (review as any).type === 'video') return 'New video';
        return 'Tap to watch';
      })();

      const expoMessages = buildExpoMessagesForRecipients(rec, {
        title: `${senderName} posted a reel`,
        body: preview,
        data: { type: 'reel', reviewId, from: uid, url },
      });

      const result = await sendExpoPush(expoMessages);
      return jsonResponse({ ok: true, kind, sent: expoMessages.length, result });
    }

    if (kind === 'continue_watching') {
      const tmdbId = String(body.tmdbId || '');
      if (!tmdbId) throw new HttpError(400, 'Missing tmdbId');

      const toUserId = String(body.toUserId || uid);
      if (toUserId !== uid && !isAdmin) throw new HttpError(403, 'Not allowed to notify other users');

      const mediaType = String(body.mediaType || 'movie') === 'tv' ? 'tv' : 'movie';
      const resumeMillis = parseNumber(body.resumeMillis);
      const seasonNumber = parseNumber(body.seasonNumber);
      const episodeNumber = parseNumber(body.episodeNumber);
      const titleValue = typeof body.title === 'string' ? body.title.trim() : '';

      const url = buildUrl('/video-player', {
        mediaType,
        tmdbId,
        resumeMillis: resumeMillis != null ? Math.max(0, Math.floor(resumeMillis)) : undefined,
        seasonNumber: seasonNumber != null ? Math.max(1, Math.floor(seasonNumber)) : undefined,
        episodeNumber: episodeNumber != null ? Math.max(1, Math.floor(episodeNumber)) : undefined,
      });

      const rec = await loadRecipientsFromUserIds(db, [toUserId]);
      const expoMessages = buildExpoMessagesForRecipients(rec, {
        title: 'Continue watching',
        body: titleValue || 'Tap to resume',
        data: { type: 'continue_watching', tmdbId, mediaType, resumeMillis: resumeMillis ?? undefined, url },
      });

      const result = await sendExpoPush(expoMessages);
      return jsonResponse({ ok: true, kind, sent: expoMessages.length, result });
    }

    if (kind === 'new_movie') {
      if (!isAdmin) throw new HttpError(403, 'Admin only');

      const tmdbId = String(body.tmdbId || '');
      if (!tmdbId) throw new HttpError(400, 'Missing tmdbId');
      const mediaType = String(body.mediaType || 'movie') === 'tv' ? 'tv' : 'movie';
      const titleValue = typeof body.title === 'string' ? body.title.trim() : '';
      const releaseYear = parseNumber(body.releaseYear);

      let recipients = Array.isArray(body.userIds) ? body.userIds : [];
      const audience = String(body.audience || '').toLowerCase();
      const maxUsers = Math.max(1, Math.min(1000, parseNumber(body.maxUsers) || 250));
      if (!recipients.length && audience === 'all') {
        const snap = await db.collection('users').limit(maxUsers).get();
        recipients = snap.docs.map((d) => d.id);
      }

      const rec = await loadRecipientsFromUserIds(db, recipients);

      const url = buildUrl(`/details/${encodeURIComponent(tmdbId)}`, { mediaType });
      const bodyText = titleValue
        ? `${titleValue}${releaseYear ? ` (${releaseYear})` : ''} is now available.`
        : 'A new movie is now available.';

      const expoMessages = buildExpoMessagesForRecipients(rec, {
        title: 'New movie drop',
        body: bodyText,
        data: { type: 'new_movie', tmdbId, mediaType, url },
      });

      const result = await sendExpoPush(expoMessages);
      return jsonResponse({ ok: true, kind, sent: expoMessages.length, result });
    }

    if (kind === 'app_update') {
      if (!isAdmin) throw new HttpError(403, 'Admin only');

      const titleValue = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Update available';
      const bodyText =
        typeof body.body === 'string' && body.body.trim() ? body.body.trim() : 'A new update is ready. Tap to open the app.';

      let recipients = Array.isArray(body.userIds) ? body.userIds : [];
      const audience = String(body.audience || '').toLowerCase();
      const maxUsers = Math.max(1, Math.min(1000, parseNumber(body.maxUsers) || 250));
      if (!recipients.length && audience === 'all') {
        const snap = await db.collection('users').limit(maxUsers).get();
        recipients = snap.docs.map((d) => d.id);
      }

      const rec = await loadRecipientsFromUserIds(db, recipients);

      const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : '/settings';
      const externalUrl = typeof body.externalUrl === 'string' && body.externalUrl.trim() ? body.externalUrl.trim() : undefined;

      const expoMessages = buildExpoMessagesForRecipients(rec, {
        title: titleValue,
        body: bodyText,
        data: { type: 'app_update', url, externalUrl },
      });

      const result = await sendExpoPush(expoMessages);
      return jsonResponse({ ok: true, kind, sent: expoMessages.length, result });
    }

    throw new HttpError(400, 'Unsupported kind');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Failed to send notification';
    return jsonResponse({ error: message }, status);
  }
});
