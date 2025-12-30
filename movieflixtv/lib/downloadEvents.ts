export type DownloadEvent = {
  sessionId: string;
  title: string;
  mediaId?: number;
  mediaType: 'movie' | 'tv';
  status: 'queued' | 'preparing' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error';
  progress?: number;
  subtitle?: string | null;
  runtimeMinutes?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  errorMessage?: string;
};

type Listener = (event: DownloadEvent) => void;

const listeners = new Set<Listener>();
const activeDownloads = new Map<string, DownloadEvent>();

export const subscribeToDownloadEvents = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const emitDownloadEvent = (event: DownloadEvent) => {
  if (event.status === 'completed' || event.status === 'error' || event.status === 'cancelled') {
    activeDownloads.delete(event.sessionId);
  } else {
    activeDownloads.set(event.sessionId, event);
  }
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      console.warn('[downloadEvents] listener error', err);
    }
  });
};

export const getActiveDownloads = () => Array.from(activeDownloads.values());
