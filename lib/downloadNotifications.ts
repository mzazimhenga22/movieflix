import * as Notifications from 'expo-notifications';

type Status = 'queued' | 'preparing' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error';

type NotifState = {
  id?: string;
  lastPct?: number;
  lastTs?: number;
};

const stateBySession = new Map<string, NotifState>();

function now() {
  return Date.now();
}

function shouldUpdate(sessionId: string, pct?: number) {
  const st = stateBySession.get(sessionId) ?? {};
  const ts = st.lastTs ?? 0;
  const lastPct = st.lastPct ?? -1;
  const curr = typeof pct === 'number' ? pct : lastPct;
  const timeOk = now() - ts > 12_000;
  const pctOk = typeof pct === 'number' ? Math.abs(pct - lastPct) >= 5 : false;
  return timeOk || pctOk;
}

export async function notifyDownload(
  sessionId: string,
  title: string,
  status: Status,
  progress?: number,
  subtitle?: string | null,
  errorMessage?: string,
) {
  try {
    const pct = typeof progress === 'number' ? Math.round(progress * 100) : undefined;
    const bodyBase = subtitle ? `${subtitle}` : '';

    if (status === 'downloading') {
      if (!shouldUpdate(sessionId, pct)) return;
      const body = `${bodyBase}${bodyBase ? ' • ' : ''}${pct ?? 0}%`;
      const id = await Notifications.presentNotificationAsync({
        title: `Downloading: ${title}`,
        body,
        sound: 'default',
        channelId: 'downloads',
        data: { sessionId, kind: 'download', status },
      });
      stateBySession.set(sessionId, { id, lastPct: pct, lastTs: now() });
      return;
    }

    if (status === 'queued') {
      const id = await Notifications.presentNotificationAsync({
        title: `Queued: ${title}`,
        body: bodyBase || 'Ready to download',
        sound: 'default',
        channelId: 'downloads',
        data: { sessionId, kind: 'download', status },
      });
      stateBySession.set(sessionId, { id, lastPct: pct, lastTs: now() });
      return;
    }

    if (status === 'preparing') {
      const id = await Notifications.presentNotificationAsync({
        title: `Preparing: ${title}`,
        body: bodyBase || 'Starting…',
        sound: 'default',
        channelId: 'downloads',
        data: { sessionId, kind: 'download', status },
      });
      stateBySession.set(sessionId, { id, lastPct: pct, lastTs: now() });
      return;
    }

    if (status === 'paused') {
      const id = await Notifications.presentNotificationAsync({
        title: `Paused: ${title}`,
        body: bodyBase || 'Paused',
        sound: 'default',
        channelId: 'downloads',
        data: { sessionId, kind: 'download', status },
      });
      stateBySession.set(sessionId, { id, lastPct: pct, lastTs: now() });
      return;
    }

    if (status === 'completed') {
      await Notifications.presentNotificationAsync({
        title: 'Download complete',
        body: bodyBase ? `${title} • ${bodyBase}` : title,
        sound: 'default',
        channelId: 'downloads',
        data: { sessionId, kind: 'download', status },
      });
      stateBySession.delete(sessionId);
      return;
    }

    if (status === 'cancelled') {
      await Notifications.presentNotificationAsync({
        title: `Download cancelled`,
        body: title,
        sound: 'default',
        channelId: 'downloads',
        data: { sessionId, kind: 'download', status },
      });
      stateBySession.delete(sessionId);
      return;
    }

    if (status === 'error') {
      await Notifications.presentNotificationAsync({
        title: `Download failed`,
        body: errorMessage ? `${title} • ${errorMessage}` : title,
        sound: 'default',
        channelId: 'downloads',
        data: { sessionId, kind: 'download', status },
      });
      stateBySession.delete(sessionId);
    }
  } catch {
    // Notifications are best-effort.
  }
}
