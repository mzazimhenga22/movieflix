import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import type { RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';
import { authPromise, firestore } from '@/constants/firebase';
import type {
  CreateLiveStreamOptions,
  LiveStream,
  LiveStreamComment,
  LiveStreamGift,
  LiveStreamSession,
  LiveStreamSignaling,
  LiveStreamViewer,
} from './types';

const liveStreamsCollection = collection(firestore, 'liveStreams');

const viewersCollection = (streamId: string) => collection(firestore, 'liveStreams', streamId, 'viewers');
const signalingDoc = (streamId: string, viewerId: string) =>
  doc(firestore, 'liveStreams', streamId, 'signaling', viewerId);
const commentsCollection = (streamId: string) => collection(firestore, 'liveStreams', streamId, 'comments');
const giftsCollection = (streamId: string) => collection(firestore, 'liveStreams', streamId, 'gifts');

const LIVE_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const LIVE_PROMOTION_THRESHOLD = 50;

const supabaseBase = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();

const normalizeStream = (
  snapshot: DocumentSnapshot<DocumentData>,
): LiveStream | null => {
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as LiveStream;
  return { ...data, id: snapshot.id };
};

export const listenToLiveStreams = (
  callback: (streams: LiveStream[]) => void,
): Unsubscribe => {
  const q = query(
    liveStreamsCollection,
    where('status', '==', 'live'),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    const streams = snap.docs
      .map((docSnap) => normalizeStream(docSnap as DocumentSnapshot<DocumentData>))
      .filter((stream): stream is LiveStream => Boolean(stream));
    callback(streams);
  });
};

export const listenToBoostedLiveStreams = (
  callback: (streams: LiveStream[]) => void,
): Unsubscribe => {
  const q = query(
    liveStreamsCollection,
    where('status', '==', 'live'),
    where('promotedToReels', '==', true),
    orderBy('updatedAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    const streams = snap.docs
      .map((docSnap) => normalizeStream(docSnap as DocumentSnapshot<DocumentData>))
      .filter((stream): stream is LiveStream => Boolean(stream));
    callback(streams);
  });
};

export const listenToLiveStream = (
  streamId: string,
  callback: (stream: LiveStream | null) => void,
): Unsubscribe => {
  const streamRef = doc(firestore, 'liveStreams', streamId);
  return onSnapshot(streamRef, (snap) => callback(normalizeStream(snap)));
};

export const createLiveStreamSession = async (
  options: CreateLiveStreamOptions,
): Promise<LiveStreamSession> => {
  const channelName = `live-${options.hostId}-${Date.now()}`;

  let playbackHlsUrl: string | null = null;
  let rtmpsUrl: string | null = null;
  let streamKey: string | null = null;
  let liveInputId: string | null = null;

  // Create (or reserve) a Cloudflare Stream Live input via Supabase Edge.
  // This enables scalable playback (HLS) for large audiences.
  try {
    if (supabaseBase) {
      const auth = await authPromise;
      const user = auth.currentUser;
      if (user?.uid && user.uid === options.hostId) {
        const idToken = await user.getIdToken(true);
        const res = await fetch(`${supabaseBase}/functions/v1/cloudflare-live`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            action: 'create',
            hostId: options.hostId,
            title: options.title,
            name: options.title,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.ok) {
          playbackHlsUrl = json?.playbackHlsUrl ? String(json.playbackHlsUrl) : null;
          rtmpsUrl = json?.rtmpsUrl ? String(json.rtmpsUrl) : null;
          streamKey = json?.streamKey ? String(json.streamKey) : null;
          liveInputId = json?.liveInputId ? String(json.liveInputId) : null;
        }
      }
    }
  } catch {
    // ignore (fallback to legacy P2P live)
  }

  const docRef = await addDoc(liveStreamsCollection, {
    title: options.title,
    channelName,
    hostId: options.hostId,
    hostName: options.hostName ?? null,
    coverUrl: options.coverUrl ?? null,
    status: 'live',
    viewersCount: 0,
    ...(playbackHlsUrl ? { playbackHlsUrl } : {}),
    ...(liveInputId || rtmpsUrl || streamKey
      ? {
          cloudflare: {
            liveInputId: liveInputId ?? null,
            rtmpsUrl: rtmpsUrl ?? null,
            streamKey: streamKey ?? null,
          },
        }
      : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    hostHeartbeatAt: serverTimestamp(),
    lastEngagementAt: serverTimestamp(),
    engagementCount: 0,
    giftsCount: 0,
    coinsCount: 0,
    promotedToReels: false,
    promotedToStories: false,
  });

  return {
    streamId: docRef.id,
    channelName,
    playbackHlsUrl,
    rtmpsUrl,
    streamKey,
    liveInputId,
  };
};

export const touchLiveEngagement = async (
  streamId: string,
  viewerId: string,
  kind: 'tap' | 'comment' = 'tap',
): Promise<void> => {
  const streamRef = doc(firestore, 'liveStreams', streamId);

  // Keep this lightweight: a single doc write.
  await updateDoc(streamRef, {
    lastEngagementAt: serverTimestamp(),
    engagementCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  // Best-effort: update viewer doc too.
  try {
    await setDoc(
      doc(firestore, 'liveStreams', streamId, 'viewers', viewerId),
      {
        lastSeenAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    // ignore
  }
};

export const promoteLiveStreamIfNeeded = async (stream: LiveStream): Promise<void> => {
  if (!stream?.id) return;
  if (stream.status !== 'live') return;
  const score = Number(stream.engagementCount ?? 0);
  if (score < LIVE_PROMOTION_THRESHOLD) return;
  if (stream.promotedToReels && stream.promotedToStories) return;

  const cover = stream.coverUrl ? String(stream.coverUrl) : null;

  const streamRef = doc(firestore, 'liveStreams', stream.id);
  await setDoc(
    streamRef,
    {
      promotedToReels: true,
      promotedToStories: Boolean(cover),
      promotedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // Create an idempotent Story promo (removed when live ends).
  const storyId = `live-${stream.id}`;
  const storyRef = doc(firestore, 'stories', storyId);
  if (!cover) return;

  await setDoc(
    storyRef,
    {
      userId: stream.hostId,
      username: stream.hostName ?? 'Live',
      photoURL: cover,
      mediaType: 'image',
      mediaUrl: cover,
      userAvatar: null,
      caption: stream.title ?? 'Live',
      overlayText: 'LIVE NOW · Tap to join',
      createdAt: serverTimestamp(),
      // custom fields consumed by story viewer
      kind: 'live_promo',
      liveStreamId: stream.id,
    },
    { merge: true },
  );
};

export const listenToLiveComments = (
  streamId: string,
  callback: (comments: LiveStreamComment[]) => void,
  options: { limitCount?: number } = {},
): Unsubscribe => {
  const limitCount = Math.max(1, Math.min(options.limitCount ?? 30, 100));
  const q = query(commentsCollection(streamId), orderBy('createdAt', 'desc'), limit(limitCount));
  return onSnapshot(q, (snap) => {
    const out: LiveStreamComment[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) } as LiveStreamComment))
      .reverse();
    callback(out);
  });
};

export const listenToLiveGifts = (
  streamId: string,
  callback: (gifts: LiveStreamGift[]) => void,
  options: { limitCount?: number } = {},
): Unsubscribe => {
  const limitCount = Math.max(1, Math.min(options.limitCount ?? 30, 100));
  const q = query(giftsCollection(streamId), orderBy('createdAt', 'desc'), limit(limitCount));
  return onSnapshot(q, (snap) => {
    const out: LiveStreamGift[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) } as LiveStreamGift))
      .reverse();
    callback(out);
  });
};

export const sendLiveComment = async (args: {
  streamId: string;
  userId: string;
  username?: string | null;
  userAvatar?: string | null;
  text: string;
}): Promise<void> => {
  const text = String(args.text ?? '').trim();
  if (!text) return;
  await addDoc(commentsCollection(args.streamId), {
    userId: args.userId,
    username: args.username ?? null,
    userAvatar: args.userAvatar ?? null,
    text,
    createdAt: serverTimestamp(),
  });
  await touchLiveEngagement(args.streamId, args.userId, 'comment');
};

export const sendLiveGift = async (args: {
  streamId: string;
  senderId: string;
  senderName?: string | null;
  senderAvatar?: string | null;
  giftId: string;
  label?: string | null;
  emoji?: string | null;
  coins?: number | null;
}): Promise<void> => {
  if (!args.streamId || !args.senderId || !args.giftId) return;

  const streamRef = doc(firestore, 'liveStreams', args.streamId);
  const coins = typeof args.coins === 'number' && Number.isFinite(args.coins) ? Math.max(0, Math.floor(args.coins)) : 0;

  await addDoc(giftsCollection(args.streamId), {
    senderId: args.senderId,
    senderName: args.senderName ?? null,
    senderAvatar: args.senderAvatar ?? null,
    giftId: String(args.giftId),
    label: args.label ?? null,
    emoji: args.emoji ?? null,
    coins: coins || null,
    createdAt: serverTimestamp(),
  });

  await updateDoc(streamRef, {
    giftsCount: increment(1),
    ...(coins ? { coinsCount: increment(coins) } : {}),
    updatedAt: serverTimestamp(),
  });

  await touchLiveEngagement(args.streamId, args.senderId, 'tap');
};

export const touchLiveStreamHeartbeat = async (streamId: string): Promise<void> => {
  const streamRef = doc(firestore, 'liveStreams', streamId);
  await updateDoc(streamRef, {
    hostHeartbeatAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const listenToLiveViewers = (
  streamId: string,
  callback: (viewers: LiveStreamViewer[]) => void,
): Unsubscribe => {
  const q = query(viewersCollection(streamId), orderBy('lastSeenAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const viewers: LiveStreamViewer[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as LiveStreamViewer));
    callback(viewers);
  });
};

export const listenToLiveSignaling = (
  streamId: string,
  viewerId: string,
  callback: (signaling: LiveStreamSignaling | null) => void,
): Unsubscribe => {
  const ref = signalingDoc(streamId, viewerId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback({ ...(snap.data() as any) } as LiveStreamSignaling);
  });
};

export const sendLiveOffer = async (
  streamId: string,
  viewerId: string,
  offer: RTCSessionDescription,
): Promise<void> => {
  await setDoc(
    signalingDoc(streamId, viewerId),
    {
      offer,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const sendLiveAnswer = async (
  streamId: string,
  viewerId: string,
  answer: RTCSessionDescription,
): Promise<void> => {
  await setDoc(
    signalingDoc(streamId, viewerId),
    {
      answer,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const sendLiveIceCandidate = async (
  streamId: string,
  viewerId: string,
  from: 'host' | 'viewer',
  candidate: RTCIceCandidate,
): Promise<void> => {
  const data = {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
  };
  await setDoc(
    signalingDoc(streamId, viewerId),
    {
      updatedAt: serverTimestamp(),
      ...(from === 'host'
        ? { hostIceCandidates: arrayUnion(data) }
        : { viewerIceCandidates: arrayUnion(data) }),
    },
    { merge: true },
  );
};

export const joinLiveStream = async (
  streamId: string,
  userId: string,
  meta?: { username?: string | null; userAvatar?: string | null },
): Promise<{
  stream: LiveStream;
  channelName: string;
}> => {
  const streamRef = doc(firestore, 'liveStreams', streamId);
  const snapshot = await getDoc(streamRef);
  if (!snapshot.exists()) {
    throw new Error('Live stream not found');
  }

  const stream = snapshot.data() as LiveStream;
  if (stream.status !== 'live') {
    throw new Error('Live stream is no longer active');
  }

  await updateDoc(streamRef, {
    viewersCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  // Best-effort viewer presence (host uses this to establish per-viewer connections).
  await setDoc(
    doc(firestore, 'liveStreams', streamId, 'viewers', userId),
    {
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      ...(meta?.username ? { username: meta.username } : {}),
      ...(meta?.userAvatar ? { userAvatar: meta.userAvatar } : {}),
    },
    { merge: true },
  );

  return {
    stream: { ...stream, id: snapshot.id },
    channelName: stream.channelName,
  };
};

export const touchLiveViewer = async (
  streamId: string,
  userId: string,
  meta?: { username?: string | null; userAvatar?: string | null },
): Promise<void> => {
  await setDoc(
    doc(firestore, 'liveStreams', streamId, 'viewers', userId),
    {
      lastSeenAt: serverTimestamp(),
      ...(meta?.username ? { username: meta.username } : {}),
      ...(meta?.userAvatar ? { userAvatar: meta.userAvatar } : {}),
    },
    { merge: true },
  );
};

export const leaveLiveStream = async (streamId: string): Promise<void> => {
  const streamRef = doc(firestore, 'liveStreams', streamId);
  const snapshot = await getDoc(streamRef);
  if (!snapshot.exists()) return;
  const current = (snapshot.data() as LiveStream).viewersCount ?? 0;
  await updateDoc(streamRef, {
    viewersCount: Math.max(current - 1, 0),
    updatedAt: serverTimestamp(),
  });
};

export const leaveLiveStreamAsViewer = async (streamId: string, userId: string): Promise<void> => {
  // Best-effort: decrement count and remove viewer doc.
  await leaveLiveStream(streamId);
  try {
    await deleteDoc(doc(firestore, 'liveStreams', streamId, 'viewers', userId));
  } catch {
    // ignore
  }
  try {
    await deleteDoc(signalingDoc(streamId, userId));
  } catch {
    // ignore
  }
};

export const endLiveStream = async (
  streamId: string,
  endedBy?: string | null,
): Promise<void> => {
  const streamRef = doc(firestore, 'liveStreams', streamId);

  // Best-effort: stop/delete the Cloudflare live input.
  try {
    if (supabaseBase && endedBy) {
      const snap = await getDoc(streamRef);
      const data = snap.exists() ? (snap.data() as any) : null;
      const liveInputId = String(data?.cloudflare?.liveInputId ?? '').trim();
      if (liveInputId) {
        const auth = await authPromise;
        const user = auth.currentUser;
        if (user?.uid && user.uid === endedBy) {
          const idToken = await user.getIdToken(true);
          await fetch(`${supabaseBase}/functions/v1/cloudflare-live`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ action: 'end', hostId: endedBy, liveInputId }),
          }).catch(() => {});
        }
      }
    }
  } catch {
    // ignore
  }

  await setDoc(
    streamRef,
    {
      status: 'ended',
      endedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      endedBy: endedBy ?? null,
    },
    { merge: true },
  );

  // Best-effort: remove promo story.
  try {
    await deleteDoc(doc(firestore, 'stories', `live-${streamId}`));
  } catch {
    // ignore
  }
};

export const shouldAutoEndLiveForIdle = (stream: LiveStream | null): boolean => {
  if (!stream || stream.status !== 'live') return false;
  const ts: any = (stream as any).lastEngagementAt;
  const lastMs = ts?.toMillis ? ts.toMillis() : 0;
  if (!lastMs) return false;
  return Date.now() - lastMs >= LIVE_IDLE_TIMEOUT_MS;
};
