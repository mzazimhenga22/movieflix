import { getFirebaseIdToken } from '@/lib/pushNotifications';

type NotifyPayload =
  | {
      kind: 'message';
      conversationId: string;
      messageId: string;
    }
  | {
      kind: 'call';
      callId: string;
    }
  | {
      // Send a push for an already-created Firestore `notifications/{id}` document.
      // The backend will load the document and push it to the target user.
      kind: 'notification';
      notificationId: string;
    }
  | {
      kind: 'story';
      storyId: string;
    }
  | {
      kind: 'reel';
      reviewId: string;
    }
  | {
      kind: 'continue_watching';
      tmdbId: string;
      mediaType?: 'movie' | 'tv';
      title?: string;
      resumeMillis?: number;
      seasonNumber?: number;
      episodeNumber?: number;

      // Optional target user (defaults to the authenticated user)
      toUserId?: string;
    }
  | {
      kind: 'new_movie';
      tmdbId: string;
      mediaType?: 'movie' | 'tv';
      title?: string;
      releaseYear?: number;
      userIds?: string[];
      audience?: 'all';
      maxUsers?: number;
    }
  | {
      kind: 'app_update';
      title?: string;
      body?: string;

      // Internal route to open when tapped (defaults to /settings)
      url?: string;

      // Optional external store/updates URL
      externalUrl?: string;

      userIds?: string[];
      audience?: 'all';
      maxUsers?: number;
    };

const deriveNetlifyFunctionsBase = (rawUrl: string | undefined): string | null => {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    const marker = '/.netlify/functions/';
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    return `${u.origin}${marker.slice(0, -1)}`;
  } catch {
    return null;
  }
};

const getNotifyEndpoint = (): string | null => {
  const explicit = process.env.EXPO_PUBLIC_PUSH_NOTIFY_URL;
  if (explicit) return explicit;

  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  if (supabaseUrl) return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/notify`;

  const fromSimpleProxy = deriveNetlifyFunctionsBase(process.env.EXPO_PUBLIC_PSTREAM_PROXY_URL);
  if (fromSimpleProxy) return `${fromSimpleProxy}/notify`;

  const fromM3u8Proxy = deriveNetlifyFunctionsBase(process.env.EXPO_PUBLIC_PSTREAM_M3U8_PROXY_URL);
  if (fromM3u8Proxy) return `${fromM3u8Proxy}/notify`;

  return null;
};

export const notifyPush = async (payload: NotifyPayload): Promise<void> => {
  const endpoint = getNotifyEndpoint();
  if (!endpoint) return;

  const token = await getFirebaseIdToken();
  if (!token) return;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[push] notify failed', res.status, text);
    }
  } catch (err) {
    console.warn('[push] notify failed', err);
  }
};
