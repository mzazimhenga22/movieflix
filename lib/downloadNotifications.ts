import { IMAGE_BASE_URL } from '@/constants/api';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

type Status = 'queued' | 'preparing' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error';

type NotifState = {
  id?: string;
  lastRatio?: number;
  lastTs?: number;
  posterUri?: string;
  lastStatus?: Status;
};

const stateBySession = new Map<string, NotifState>();

const getNotificationIdentifier = (sessionId: string) => `download:${sessionId}`;

const upsert = async (identifier: string, content: any) => {
  // Using a stable identifier prevents spammy "new" notifications; subsequent calls replace the same request.
  return Notifications.scheduleNotificationAsync({
    identifier,
    content: content as any,
    trigger: null as any,
  });
};

const maybeDismiss = async (identifier?: string) => {
  if (!identifier) return;
  try {
    await Notifications.dismissNotificationAsync(identifier);
  } catch {
    // ignore
  }
};

function now() {
  return Date.now();
}

function shouldUpdate(sessionId: string, status: Status, ratio?: number) {
  const st = stateBySession.get(sessionId) ?? {};

  // If status changed, always update
  if (st.lastStatus !== status) return true;

  // If status is same:
  // For downloading, we ONLY update if we haven't shown it yet (effectively suppressing updates)
  // OR if we wanted throttle logic, we'd put it here.
  // User requested "comes on start ... comes again on pause".
  // This implies NO progress updates.
  if (status === 'downloading') {
    // If we already have a record with 'downloading' status, do NOT update.
    // This keeps the notification static.
    if (st.lastStatus === 'downloading') return false;
  }

  // logic for other statuses (usually they don't fire rapidly)
  return true;
}

function formatBytes(bytes?: number) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  const dp = v >= 100 || u === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(dp)} ${units[u]}`;
}

function makeBar(ratio?: number) {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
  const clamped = Math.max(0, Math.min(1, ratio));
  const width = 14;
  const filled = Math.round(clamped * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

async function resolvePosterAttachment(sessionId: string, posterPath?: string | null) {
  if (Platform.OS !== 'ios') return { attachment: undefined as any, posterUri: undefined as any };
  if (!posterPath) return { attachment: undefined as any, posterUri: undefined as any };

  const existing = stateBySession.get(sessionId)?.posterUri;
  if (existing) {
    return {
      posterUri: existing,
      attachment: { identifier: 'poster', url: existing, typeHint: 'public.jpeg' },
    };
  }

  try {
    const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!base) return { attachment: undefined as any, posterUri: undefined as any };
    const dir = `${base}notif-posters/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => { });

    const target = `${dir}${encodeURIComponent(sessionId)}.jpg`;
    const info = await FileSystem.getInfoAsync(target);
    if (!info.exists) {
      const url = posterPath.startsWith('http') ? posterPath : `${IMAGE_BASE_URL}${posterPath}`;
      await FileSystem.downloadAsync(url, target);
    }

    stateBySession.set(sessionId, { ...(stateBySession.get(sessionId) ?? {}), posterUri: target });
    return {
      posterUri: target,
      attachment: { identifier: 'poster', url: target, typeHint: 'public.jpeg' },
    };
  } catch {
    return { attachment: undefined as any, posterUri: undefined as any };
  }
}

type DownloadNotifExtras = {
  overview?: string | null;
  posterPath?: string | null;
  bytesWritten?: number;
  totalBytes?: number;
  completedUnits?: number;
  totalUnits?: number;
};

function stripHlsLabel(value?: string | null) {
  if (!value) return null;
  const cleaned = String(value)
    .replace(/\bhls\b/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s•\s•\s/g, ' • ')
    .trim();
  return cleaned || null;
}

export async function notifyDownload(
  sessionId: string,
  title: string,
  status: Status,
  progress?: number,
  subtitle?: string | null,
  errorMessage?: string,
  extras?: DownloadNotifExtras,
) {
  try {
    const bodyBase = stripHlsLabel(subtitle) ?? '';
    const cleanErrorMessage = stripHlsLabel(errorMessage) ?? errorMessage;
    const identifier = getNotificationIdentifier(sessionId);

    const percent = typeof progress === 'number' ? Math.round(progress * 100) : 0;
    const bar = makeBar(progress);
    const bytesA = formatBytes(extras?.bytesWritten);
    const bytesB = formatBytes(extras?.totalBytes);
    // e.g. "120 MB / 400 MB"
    const bytesLine = bytesA && bytesB ? `${bytesA} / ${bytesB}` : bytesA ? `${bytesA}` : null;
    const overview = typeof extras?.overview === 'string' && extras.overview.trim() ? extras.overview.trim() : null;
    const overviewSnippet = overview ? overview.slice(0, 120) : null;

    const { attachment } = await resolvePosterAttachment(sessionId, extras?.posterPath);

    if (status === 'downloading') {
      if (!shouldUpdate(sessionId, status, progress)) return;

      const lines = [
        bodyBase || null,
        // Since we are suppressing progress updates, showing "0%" or whatever static value is fine.
        // It serves as a "Yes, this is downloading" marker.
        bytesLine ? `${bytesLine} • ${percent}%` : `${percent}%`,
        bar,
      ].filter(Boolean);

      await upsert(identifier, {
        title: `Downloading: ${title}`,
        subtitle: bodyBase || undefined,
        body: lines.join('\n'),
        sound: undefined, // No sound for progress updates
        channelId: 'downloads-progress', // Silent channel
        sticky: true,
        autoDismiss: false,
        attachments: attachment ? [attachment] : undefined,
        data: { sessionId, kind: 'download', status, posterPath: extras?.posterPath ?? null },
      });
      stateBySession.set(sessionId, { ...(stateBySession.get(sessionId) ?? {}), id: identifier, lastRatio: progress, lastTs: now(), lastStatus: status });
      return;
    }

    if (status === 'queued') {
      await upsert(identifier, {
        title: `Queued: ${title}`,
        subtitle: bodyBase || undefined,
        body: overviewSnippet || bodyBase || 'Ready to download',
        sound: undefined,
        channelId: 'downloads-progress',
        sticky: true,
        autoDismiss: false,
        attachments: attachment ? [attachment] : undefined,
        data: { sessionId, kind: 'download', status, posterPath: extras?.posterPath ?? null },
      });
      stateBySession.set(sessionId, { ...(stateBySession.get(sessionId) ?? {}), id: identifier, lastRatio: progress, lastTs: now(), lastStatus: status });
      return;
    }

    if (status === 'preparing') {
      await upsert(identifier, {
        title: `Preparing: ${title}`,
        subtitle: bodyBase || undefined,
        body: bodyBase || 'Starting…',
        sound: undefined,
        channelId: 'downloads-progress',
        sticky: true,
        autoDismiss: false,
        attachments: attachment ? [attachment] : undefined,
        data: { sessionId, kind: 'download', status, posterPath: extras?.posterPath ?? null },
      });
      stateBySession.set(sessionId, { ...(stateBySession.get(sessionId) ?? {}), id: identifier, lastRatio: progress, lastTs: now(), lastStatus: status });
      return;
    }

    if (status === 'paused') {
      await upsert(identifier, {
        title: `Paused: ${title} (${percent}%)`,
        subtitle: bodyBase || undefined,
        body: [bodyBase || null, 'Tap to resume in app'].filter(Boolean).join('\n'),
        sound: 'default',
        channelId: 'downloads', // Use standard channel for pause to alert user
        sticky: true,
        autoDismiss: false,
        attachments: attachment ? [attachment] : undefined,
        data: { sessionId, kind: 'download', status, posterPath: extras?.posterPath ?? null },
      });
      stateBySession.set(sessionId, { ...(stateBySession.get(sessionId) ?? {}), id: identifier, lastRatio: progress, lastTs: now(), lastStatus: status });
      return;
    }

    if (status === 'completed') {
      const st = stateBySession.get(sessionId);
      await maybeDismiss(st?.id ?? identifier);

      await upsert(identifier, {
        title: 'Download complete',
        subtitle: bodyBase || undefined,
        body: [title, 'Tap to watch'].filter(Boolean).join('\n'),
        sound: 'default',
        channelId: 'downloads',
        sticky: false,
        autoDismiss: true,
        attachments: attachment ? [attachment] : undefined,
        data: { sessionId, kind: 'download', status, posterPath: extras?.posterPath ?? null },
      });
      stateBySession.delete(sessionId);
      return;
    }

    if (status === 'cancelled') {
      const st = stateBySession.get(sessionId);
      await maybeDismiss(st?.id ?? identifier);
      await upsert(identifier, {
        title: `Download cancelled`,
        subtitle: bodyBase || undefined,
        body: title,
        sound: 'default',
        channelId: 'downloads',
        sticky: false,
        autoDismiss: true,
        data: { sessionId, kind: 'download', status },
      });
      stateBySession.delete(sessionId);
      return;
    }

    if (status === 'error') {
      const st = stateBySession.get(sessionId);
      await maybeDismiss(st?.id ?? identifier);
      await upsert(identifier, {
        title: `Download failed`,
        subtitle: bodyBase || undefined,
        body: cleanErrorMessage ? [title, cleanErrorMessage].filter(Boolean).join('\n') : title,
        sound: 'default',
        channelId: 'downloads',
        sticky: false,
        autoDismiss: true,
        data: { sessionId, kind: 'download', status },
      });
      stateBySession.delete(sessionId);
    }
  } catch {
    // Notifications are best-effort.
  }
}
