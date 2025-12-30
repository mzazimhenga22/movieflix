import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { emitDownloadEvent } from './downloadEvents';
import { notifyDownload } from './downloadNotifications';
import { ensureDownloadDir, guessFileExtension, persistDownloadRecord, removeDownloadRecord } from './fileUtils';
import { downloadHlsPlaylist } from './hlsDownloader';
import { getProfileScopedKey } from './profileStorage';

export type DownloadJobStatus = 'queued' | 'preparing' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';

export type QueueDownloadParams = {
  title: string;
  mediaId?: number;
  mediaType: 'movie' | 'tv';
  subtitle?: string | null;
  runtimeMinutes?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  releaseDate?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string | null;

  downloadType: 'file' | 'hls';
  sourceUrl: string;
  headers?: Record<string, string>;

  qualityLabel?: string;
};

type PersistedJob = {
  sessionId: string;
  createdAt: number;
  status: DownloadJobStatus;
  progress: number;

  title: string;
  mediaId?: number;
  mediaType: 'movie' | 'tv';
  subtitle?: string | null;
  runtimeMinutes?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  releaseDate?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string | null;

  downloadType: 'file' | 'hls';
  sourceUrl: string;
  headers?: Record<string, string>;
  qualityLabel?: string;

  destination?: string;
  resumeData?: string | null;
};

const QUEUE_KEY = 'downloadQueue';
const MAX_CONCURRENT = 3;

let initialized = false;
let jobs: PersistedJob[] = [];

const activeFileDownloads = new Map<string, FileSystem.DownloadResumable>();
const cancelFlags = new Map<string, { mode: 'none' | 'pause' | 'cancel' }>();
const activeJobs = new Set<string>();
let pumping = false;

async function getQueueStorageKey() {
  return getProfileScopedKey(QUEUE_KEY);
}

async function saveQueue() {
  const key = await getQueueStorageKey();
  await AsyncStorage.setItem(key, JSON.stringify(jobs));
}

async function loadQueue() {
  const key = await getQueueStorageKey();
  const raw = await AsyncStorage.getItem(key);
  const parsed = raw ? (JSON.parse(raw) as PersistedJob[]) : [];
  jobs = parsed.map((job) => {
    if (job.status === 'downloading' || job.status === 'preparing') {
      return { ...job, status: 'queued' };
    }
    return job;
  });
}

function getAbortController(sessionId: string) {
  const state = cancelFlags.get(sessionId) ?? { mode: 'none' as const };
  cancelFlags.set(sessionId, state);
  return state;
}

function emit(job: PersistedJob, status: DownloadJobStatus, progress?: number, errorMessage?: string) {
  emitDownloadEvent({
    sessionId: job.sessionId,
    title: job.title,
    mediaId: job.mediaId,
    mediaType: job.mediaType,
    subtitle: job.subtitle ?? null,
    runtimeMinutes: job.runtimeMinutes,
    seasonNumber: job.seasonNumber,
    episodeNumber: job.episodeNumber,
    status,
    progress,
    errorMessage,
  } as any);

  void notifyDownload(
    job.sessionId,
    job.title,
    status,
    progress,
    job.subtitle ?? null,
    errorMessage,
  );
}

function updateJob(sessionId: string, patch: Partial<PersistedJob>) {
  jobs = jobs.map((j) => (j.sessionId === sessionId ? { ...j, ...patch } : j));
}

function pickNextRunnableJob(): PersistedJob | null {
  return jobs.find((j) => j.status === 'queued') ?? null;
}

async function finalizeAndRemoveJob(job: PersistedJob) {
  jobs = jobs.filter((j) => j.sessionId !== job.sessionId);
  await saveQueue();
}

async function runJob(job: PersistedJob) {
  const startProgress = typeof job.progress === 'number' && job.progress > 0 ? job.progress : 0;
  updateJob(job.sessionId, { status: 'downloading', progress: startProgress });
  await saveQueue();
  emit(job, 'downloading', startProgress);

  const abortState = getAbortController(job.sessionId);
  const getAbortMode = () => abortState.mode;
  const shouldAbort = () => getAbortMode() !== 'none';

  if (job.downloadType === 'hls') {
    const downloadsRoot = await ensureDownloadDir();
    const sessionName = job.sessionId;
    const res = await downloadHlsPlaylist({
      playlistUrl: job.sourceUrl,
      headers: job.headers,
      rootDir: downloadsRoot,
      sessionName,
      concurrency: 4,
      shouldCancel: () => {
        const mode = getAbortMode();
        return mode === 'none' ? false : mode;
      },
      onProgress: (completed, total) => {
        if (shouldAbort()) return;
        const progress = total > 0 ? completed / total : 0;
        updateJob(job.sessionId, { progress });
        emit(job, 'downloading', progress);
      },
    });

    if (!res) throw new Error('HLS download failed');
    if (getAbortMode() === 'pause') throw new Error('Paused');
    if (getAbortMode() === 'cancel') throw new Error('Cancelled');

    await persistDownloadRecord({
      id: job.sessionId,
      mediaId: job.mediaId,
      title: job.title,
      mediaType: job.mediaType,
      localUri: res.playlistPath,
      containerPath: res.directory,
      createdAt: job.createdAt,
      bytesWritten: res.totalBytes,
      runtimeMinutes: job.runtimeMinutes,
      releaseDate: job.releaseDate,
      posterPath: job.posterPath,
      backdropPath: job.backdropPath,
      overview: job.overview,
      seasonNumber: job.seasonNumber,
      episodeNumber: job.episodeNumber,
      sourceUrl: job.sourceUrl,
      downloadType: 'hls',
      segmentCount: res.segmentCount,
    });
    emit(job, 'completed', 1);
    await finalizeAndRemoveJob(job);
    return;
  }

  // file download
  const downloadsRoot = await ensureDownloadDir();
  const extension = guessFileExtension(job.sourceUrl || '');
  const destination = job.destination ?? `${downloadsRoot}/${job.sessionId}.${extension}`;

  // keep destination discoverable for cancellation cleanup
  updateJob(job.sessionId, { destination });

  const onProgress = (progress: FileSystem.DownloadProgressData) => {
    if (shouldAbort()) return;
    if (progress.totalBytesExpectedToWrite > 0) {
      const ratio = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
      updateJob(job.sessionId, { progress: ratio, destination });
      emit(job, 'downloading', ratio);
    }
  };

  const resumable = FileSystem.createDownloadResumable(
    job.sourceUrl,
    destination,
    {
      ...(job.headers ? { headers: job.headers } : null),
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
    },
    onProgress,
    job.resumeData ?? undefined,
  );
  activeFileDownloads.set(job.sessionId, resumable);

  try {
    const downloadPromise = resumable.downloadAsync();
    let abortInterval: ReturnType<typeof setInterval> | null = null;
    const abortPromise = new Promise<never>((_, reject) => {
      let settled = false;
      abortInterval = setInterval(() => {
        if (settled) return;
        const mode = getAbortMode();
        if (mode === 'none') return;
        settled = true;
        if (abortInterval) clearInterval(abortInterval);
        void resumable
          .pauseAsync()
          .then((resumeData) => {
            updateJob(job.sessionId, { resumeData: (resumeData as any) ?? null });
            void saveQueue().catch(() => {});
          })
          .catch(() => {})
          .finally(() => {
            reject(new Error(mode === 'pause' ? 'Paused' : 'Cancelled'));
          });
      }, 250);
    });

    let result: any;
    try {
      result = await Promise.race([downloadPromise, abortPromise]);
    } catch (err) {
      await downloadPromise.catch(() => null);
      throw err;
    } finally {
      if (abortInterval) clearInterval(abortInterval);
    }

    if (getAbortMode() === 'pause') throw new Error('Paused');
    if (getAbortMode() === 'cancel') throw new Error('Cancelled');
    if (!result || result.status >= 400) throw new Error('Download did not complete.');

    const info = await FileSystem.getInfoAsync(destination);

    await persistDownloadRecord({
      id: job.sessionId,
      mediaId: job.mediaId,
      title: job.title,
      mediaType: job.mediaType,
      localUri: result.uri,
      containerPath: destination,
      createdAt: job.createdAt,
      bytesWritten: info.exists && !info.isDirectory ? info.size : undefined,
      runtimeMinutes: job.runtimeMinutes,
      releaseDate: job.releaseDate,
      posterPath: job.posterPath,
      backdropPath: job.backdropPath,
      overview: job.overview,
      seasonNumber: job.seasonNumber,
      episodeNumber: job.episodeNumber,
      sourceUrl: job.sourceUrl,
      downloadType: 'file',
    });

    emit(job, 'completed', 1);
    await finalizeAndRemoveJob(job);
  } finally {
    activeFileDownloads.delete(job.sessionId);
  }
}

async function pumpQueue() {
  if (pumping) return;
  pumping = true;
  try {
    while (activeJobs.size < MAX_CONCURRENT) {
      const next = pickNextRunnableJob();
      if (!next) return;
      const job = next;
      activeJobs.add(job.sessionId);
      updateJob(job.sessionId, { status: 'preparing' });
      await saveQueue();
      emit(job, 'preparing', job.progress);

      void (async () => {
        try {
          await runJob(job);
        } catch (err: any) {
          const msg = err?.message ?? 'Download failed';
          const lower = String(msg).toLowerCase();
          const paused = lower.includes('paused');
          const cancelled = lower.includes('cancel');
          const nextStatus: DownloadJobStatus = paused ? 'paused' : cancelled ? 'cancelled' : 'error';
          const latest = jobs.find((j) => j.sessionId === job.sessionId) ?? job;
          updateJob(job.sessionId, { status: nextStatus });
          await saveQueue();
          emit(job, nextStatus, paused ? latest.progress : 0, msg);
          if (cancelled) {
            try {
              if (job.downloadType === 'hls') {
                const root = await ensureDownloadDir();
                await FileSystem.deleteAsync(`${root}/${job.sessionId}`, { idempotent: true });
              } else if (latest.destination) {
                await FileSystem.deleteAsync(latest.destination, { idempotent: true });
              }
            } catch {
              // ignore
            }
            await finalizeAndRemoveJob(job);
          }
        } finally {
          cancelFlags.delete(job.sessionId);
          activeJobs.delete(job.sessionId);
          void pumpQueue();
        }
      })();

      // let the loop continue and start more jobs up to MAX_CONCURRENT
    }
  } finally {
    pumping = false;
  }
}

export async function initializeDownloadManager() {
  if (initialized) return;
  initialized = true;
  await loadQueue();
  for (const job of jobs) {
    if (job.status === 'queued' || job.status === 'paused') {
      emit(job, job.status, job.progress);
    }
  }
  void pumpQueue();
}

export async function enqueueDownload(params: QueueDownloadParams): Promise<string> {
  await initializeDownloadManager();
  const sessionId = `${params.mediaId ?? 'download'}-${Date.now()}`;
  const job: PersistedJob = {
    sessionId,
    createdAt: Date.now(),
    status: 'queued',
    progress: 0,
    ...params,
    resumeData: null,
  };
  jobs = [job, ...jobs];
  await saveQueue();
  emit(job, 'queued', 0);
  void pumpQueue();
  return sessionId;
}

export async function pauseDownload(sessionId: string) {
  const job = jobs.find((j) => j.sessionId === sessionId);
  if (job && (job.status === 'queued' || job.status === 'preparing')) {
    updateJob(sessionId, { status: 'paused' });
    await saveQueue();
    emit(job, 'paused', job.progress);
    return;
  }

  if (job?.downloadType === 'hls' && activeJobs.has(sessionId)) {
    const state = getAbortController(sessionId);
    state.mode = 'pause';
    updateJob(sessionId, { status: 'paused' });
    await saveQueue();
    emit(job, 'paused', job.progress);
    return;
  }

  const resumable = activeFileDownloads.get(sessionId);
  if (!resumable) return;

  const state = getAbortController(sessionId);
  state.mode = 'pause';
  updateJob(sessionId, { status: 'paused' });
  await saveQueue();
  if (job) emit(job, 'paused', job.progress);

  try {
    const resumeData = await resumable.pauseAsync();
    updateJob(sessionId, { resumeData: (resumeData as any) ?? null });
    await saveQueue();
  } catch {
    // ignore
  }
}

export async function resumeDownload(sessionId: string) {
  const job = jobs.find((j) => j.sessionId === sessionId);
  if (!job) return;
  if (job.status !== 'paused') return;
  const state = getAbortController(sessionId);
  state.mode = 'none';
  updateJob(sessionId, { status: 'queued' });
  await saveQueue();
  emit(job, 'queued', job.progress);
  void pumpQueue();
}

export async function cancelDownload(sessionId: string) {
  const flag = getAbortController(sessionId);
  flag.mode = 'cancel';

  const resumable = activeFileDownloads.get(sessionId);
  if (resumable) {
    try {
      const resumeData = await resumable.pauseAsync();
      updateJob(sessionId, { resumeData: (resumeData as any) ?? null });
    } catch {
      // ignore
    }
  }

  const job = jobs.find((j) => j.sessionId === sessionId);
  if (!job) return;

  // If it's actively running, let the worker observe the cancel flag and clean up.
  if (activeJobs.has(sessionId)) {
    updateJob(sessionId, { status: 'cancelled' });
    await saveQueue();
    emit(job, 'cancelled', job.progress);
    return;
  }

  // best-effort cleanup
  try {
    if (job.downloadType === 'hls') {
      const root = await ensureDownloadDir();
      await FileSystem.deleteAsync(`${root}/${sessionId}`, { idempotent: true });
    } else if (job.destination) {
      await FileSystem.deleteAsync(job.destination, { idempotent: true });
    }
  } catch {
    // ignore
  }

  // remove any completed record if it exists (id is stable)
  try {
    await removeDownloadRecord(sessionId);
  } catch {
    // ignore
  }

  updateJob(sessionId, { status: 'cancelled', progress: 0 });
  await finalizeAndRemoveJob(job);
  emit(job, 'cancelled', 0);
}

export async function getQueuedDownloads(): Promise<PersistedJob[]> {
  await initializeDownloadManager();
  return jobs;
}
