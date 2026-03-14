import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import DownloadServiceModule from '../modules/DownloadServiceModule';
import { emitDownloadEvent } from './downloadEvents';
import { notifyDownload } from './downloadNotifications';
import { ensureDownloadDir, guessFileExtension, persistDownloadRecord, removeDownloadRecord, persistPartialDownload, updateDownloadRecord, markDownloadCompleted, getAllDownloads } from './fileUtils';
import { downloadHlsPlaylist } from './hlsDownloader';
import { getProfileScopedKey } from './profileStorage';

export type DownloadJobStatus = 'queued' | 'preparing' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';

export type QueueDownloadParams = {
  title: string;
  mediaId?: number;
  mediaType: 'movie' | 'tv' | 'music';
  subtitle?: string | null;
  runtimeMinutes?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  releaseDate?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string | null;
  artist?: string | null;
  videoId?: string;

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
  mediaType: 'movie' | 'tv' | 'music';
  subtitle?: string | null;
  runtimeMinutes?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  releaseDate?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string | null;
  artist?: string | null;
  videoId?: string;

  downloadType: 'file' | 'hls';
  sourceUrl: string;
  headers?: Record<string, string>;
  qualityLabel?: string;

  destination?: string;
  containerPath?: string;
  resumeData?: string | null;

  bytesWritten?: number;
  totalBytes?: number;
  completedUnits?: number;
  totalUnits?: number;
};

const QUEUE_KEY = 'downloadQueue';
const DOWNLOAD_SPEED_KEY = 'downloadSettings:speed';
const MAX_CONCURRENT = 3;
type DownloadSpeed = 'high' | 'medium';
const DOWNLOAD_SPEED_DEFAULT: DownloadSpeed = 'high';

let initialized = false;
let jobs: PersistedJob[] = [];

const activeFileDownloads = new Map<string, any>();
const cancelFlags = new Map<string, { mode: 'none' | 'pause' | 'cancel' }>();
const activeJobs = new Set<string>();
let pumping = false;
let isServiceRunning = false;

function normalizeResumeData(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const maybe = (value as { resumeData?: unknown }).resumeData;
    if (typeof maybe === 'string') return maybe;
  }
  return null;
}

async function getDownloadConcurrency() {
  try {
    const key = await getProfileScopedKey(DOWNLOAD_SPEED_KEY);
    const raw = await AsyncStorage.getItem(key);
    let parsed: unknown = raw;
    if (raw != null) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }
    const value = typeof parsed === 'string' ? parsed : typeof raw === 'string' ? raw : '';
    const normalized = value.trim().toLowerCase();
    if (normalized === 'medium') return 4;
    if (normalized === 'high') return 6;
  } catch {
    // ignore
  }
  return DOWNLOAD_SPEED_DEFAULT === 'medium' ? 4 : 6;
}

async function getMaxConcurrentJobs() {
  try {
    const key = await getProfileScopedKey(DOWNLOAD_SPEED_KEY);
    const raw = await AsyncStorage.getItem(key);
    let parsed: unknown = raw;
    if (raw != null) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }
    const value = typeof parsed === 'string' ? parsed : typeof raw === 'string' ? raw : '';
    const normalized = value.trim().toLowerCase();
    if (normalized === 'medium') return 2;
    if (normalized === 'high') return 3;
  } catch {
    // ignore
  }
  return DOWNLOAD_SPEED_DEFAULT === 'medium' ? 2 : MAX_CONCURRENT;
}

function updateForegroundService() {
  const count = activeJobs.size;
  try {
    if (count > 0) {
      DownloadServiceModule?.startService?.('Downloading', `${count} item${count > 1 ? 's' : ''} remaining`);
      isServiceRunning = true;
    } else if (isServiceRunning) {
      DownloadServiceModule?.stopService?.();
      isServiceRunning = false;
    }
  } catch (err) {
    console.warn('[DownloadManager] Native service error:', err);
  }
}

const lastPersistBySession = new Map<string, { ts: number; progress: number }>();

function shouldPersist(sessionId: string, progress?: number) {
  const st = lastPersistBySession.get(sessionId) ?? { ts: 0, progress: -1 };
  const now = Date.now();
  const timeOk = now - st.ts > 12_000;
  const ratioOk = typeof progress === 'number' ? Math.abs(progress - st.progress) >= 0.05 : false;
  return timeOk || ratioOk;
}

async function persistProgressMaybe(sessionId: string, progress?: number) {
  if (!shouldPersist(sessionId, progress)) return;
  lastPersistBySession.set(sessionId, { ts: Date.now(), progress: typeof progress === 'number' ? progress : -1 });
  await saveQueue();
}

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
    const normalizedResumeData = normalizeResumeData(job.resumeData);
    const withResumeData = normalizedResumeData !== job.resumeData ? { ...job, resumeData: normalizedResumeData } : job;
    if (job.status === 'downloading' || job.status === 'preparing') {
      return { ...withResumeData, status: 'queued' };
    }
    return withResumeData;
  });
}

async function reconcileCompletedJobs() {
  const downloadsRoot = await ensureDownloadDir();

  // First, scan the downloads folder for any files that weren't persisted
  // This handles the case where download completed but app closed before persisting
  try {
    const files = await FileSystem.readDirectoryAsync(downloadsRoot);
    const persistedKey = await getProfileScopedKey('downloads');
    const persistedRaw = await AsyncStorage.getItem(persistedKey);
    const persisted: any[] = persistedRaw ? JSON.parse(persistedRaw) : [];
    const persistedIds = new Set(persisted.map(p => p.id));

    for (const fileOrDir of files) {
      const fullPath = `${downloadsRoot}/${fileOrDir}`;
      const info = await FileSystem.getInfoAsync(fullPath);
      
      // Skip if already persisted
      if (persistedIds.has(fileOrDir) || persistedIds.has(fileOrDir.split('.')[0])) continue;
      
      // Check if it's a completed download (file or HLS directory)
      if (info.exists) {
        // Check for HLS directory (contains index.m3u8)
        if (info.isDirectory) {
          const playlistPath = `${fullPath}/index.m3u8`;
          const playlistInfo = await FileSystem.getInfoAsync(playlistPath);
          if (playlistInfo.exists && !playlistInfo.isDirectory) {
            // Found orphaned HLS download - try to recover from queue
            const matchingJob = jobs.find(j => j.sessionId === fileOrDir);
            if (matchingJob) {
              await persistDownloadRecord({
                id: matchingJob.sessionId,
                mediaId: matchingJob.mediaId,
                title: matchingJob.title,
                mediaType: matchingJob.mediaType,
                subtitle: matchingJob.subtitle,
                runtimeMinutes: matchingJob.runtimeMinutes,
                releaseDate: matchingJob.releaseDate,
                posterPath: matchingJob.posterPath,
                backdropPath: matchingJob.backdropPath,
                overview: matchingJob.overview,
                artist: matchingJob.artist ?? null,
                videoId: matchingJob.videoId,
                seasonNumber: matchingJob.seasonNumber,
                episodeNumber: matchingJob.episodeNumber,
                sourceUrl: matchingJob.sourceUrl,
                downloadType: 'hls',
                localUri: playlistPath,
                containerPath: fullPath,
                createdAt: matchingJob.createdAt,
              } as any);
              jobs = jobs.filter(j => j.sessionId !== fileOrDir);
              continue;
            }
          }
        } else {
          // It's a file - check if it's a video file
          const ext = fileOrDir.split('.').pop()?.toLowerCase();
          if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'].includes(ext || '')) {
            // Found orphaned file download - try to recover from queue
            const sessionId = fileOrDir.split('.')[0];
            const matchingJob = jobs.find(j => j.sessionId === sessionId);
            if (matchingJob) {
              await persistDownloadRecord({
                id: sessionId,
                mediaId: matchingJob.mediaId,
                title: matchingJob.title,
                mediaType: matchingJob.mediaType,
                subtitle: matchingJob.subtitle,
                runtimeMinutes: matchingJob.runtimeMinutes,
                releaseDate: matchingJob.releaseDate,
                posterPath: matchingJob.posterPath,
                backdropPath: matchingJob.backdropPath,
                overview: matchingJob.overview,
                artist: matchingJob.artist ?? null,
                videoId: matchingJob.videoId,
                seasonNumber: matchingJob.seasonNumber,
                episodeNumber: matchingJob.episodeNumber,
                sourceUrl: matchingJob.sourceUrl,
                downloadType: 'file',
                localUri: fullPath,
                containerPath: fullPath,
                createdAt: matchingJob.createdAt,
                bytesWritten: info.size,
              } as any);
              jobs = jobs.filter(j => j.sessionId !== sessionId);
              continue;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[DownloadManager] Failed to scan for orphaned downloads:', e);
  }

  const stillQueued: PersistedJob[] = [];
  for (const job of jobs) {
    try {
      if (job.downloadType === 'hls') {
        const containerPath = job.containerPath ?? `${downloadsRoot}/${job.sessionId}`;
        const playlistPath = job.destination ?? `${containerPath}/index.m3u8`;
        const info = await FileSystem.getInfoAsync(playlistPath);
        if (info.exists && !info.isDirectory) {
          await persistDownloadRecord({
            id: job.sessionId,
            mediaId: job.mediaId,
            title: job.title,
            mediaType: job.mediaType,
            subtitle: job.subtitle,
            runtimeMinutes: job.runtimeMinutes,
            releaseDate: job.releaseDate,
            posterPath: job.posterPath,
            backdropPath: job.backdropPath,
            overview: job.overview,
            artist: job.artist ?? null,
            videoId: job.videoId,
            seasonNumber: job.seasonNumber,
            episodeNumber: job.episodeNumber,
            sourceUrl: job.sourceUrl,
            downloadType: 'hls',
            localUri: playlistPath,
            containerPath,
            createdAt: job.createdAt,
          } as any);
          emit(job, 'completed', 1);
          continue;
        }
      }

      if (job.downloadType === 'file') {
        const dest = job.destination;
        if (dest) {
          const info = await FileSystem.getInfoAsync(dest);
          // Check if file exists and has reasonable size (> 1KB)
          if (info.exists && !info.isDirectory && Number(info.size ?? 0) > 1024) {
            // If we have totalBytes, verify; otherwise assume complete if file exists
            const isComplete = typeof job.totalBytes === 'number' && job.totalBytes > 0
              ? Number(info.size) >= job.totalBytes - 1024
              : true; // Assume complete if no totalBytes recorded
              
            if (isComplete) {
              await persistDownloadRecord({
                id: job.sessionId,
                mediaId: job.mediaId,
                title: job.title,
                mediaType: job.mediaType,
                subtitle: job.subtitle,
                runtimeMinutes: job.runtimeMinutes,
                releaseDate: job.releaseDate,
                posterPath: job.posterPath,
                backdropPath: job.backdropPath,
                overview: job.overview,
                artist: job.artist ?? null,
                videoId: job.videoId,
                seasonNumber: job.seasonNumber,
                episodeNumber: job.episodeNumber,
                sourceUrl: job.sourceUrl,
                downloadType: 'file',
                localUri: dest,
                containerPath: dest,
                createdAt: job.createdAt,
                bytesWritten: Number(info.size),
              } as any);
              emit(job, 'completed', 1);
              continue;
            }
          }
        }
      }
    } catch {
      // ignore and keep job
    }

    stillQueued.push(job);
  }

  if (stillQueued.length !== jobs.length) {
    jobs = stillQueued;
    await saveQueue();
  }
}

function getAbortController(sessionId: string) {
  const state = cancelFlags.get(sessionId) ?? { mode: 'none' as const };
  cancelFlags.set(sessionId, state);
  return state;
}

function emit(
  job: PersistedJob,
  status: DownloadJobStatus,
  progress?: number,
  errorMessage?: string,
  progressExtras?: {
    bytesWritten?: number;
    totalBytes?: number;
    completedUnits?: number;
    totalUnits?: number;
  },
) {
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
    {
      overview: job.overview ?? null,
      posterPath: job.posterPath ?? null,
      ...(progressExtras ?? null),
    },
  );
}

function updateJob(sessionId: string, patch: Partial<PersistedJob>) {
  jobs = jobs.map((j) => (j.sessionId === sessionId ? { ...j, ...patch } : j));
}

function pickNextRunnableJob(): PersistedJob | null {
  return jobs.find((j) => j.status === 'queued') ?? null;
}

async function finalizeAndRemoveJob(job: PersistedJob) {
  // First, verify the download record was persisted
  try {
    const key = await getProfileScopedKey('downloads');
    const stored = await AsyncStorage.getItem(key);
    const existing: any[] = stored ? JSON.parse(stored) : [];
    const hasRecord = existing.some(item => item?.id === job.sessionId);
    
    if (!hasRecord) {
      // Record wasn't persisted - try to save it now
      const downloadsRoot = await ensureDownloadDir();
      
      if (job.downloadType === 'hls') {
        const containerPath = job.containerPath ?? `${downloadsRoot}/${job.sessionId}`;
        const playlistPath = job.destination ?? `${containerPath}/index.m3u8`;
        const info = await FileSystem.getInfoAsync(playlistPath);
        if (info.exists) {
          await persistDownloadRecord({
            id: job.sessionId,
            mediaId: job.mediaId,
            title: job.title,
            mediaType: job.mediaType,
            subtitle: job.subtitle,
            runtimeMinutes: job.runtimeMinutes,
            releaseDate: job.releaseDate,
            posterPath: job.posterPath,
            backdropPath: job.backdropPath,
            overview: job.overview,
            artist: job.artist ?? null,
            videoId: job.videoId,
            seasonNumber: job.seasonNumber,
            episodeNumber: job.episodeNumber,
            sourceUrl: job.sourceUrl,
            downloadType: 'hls',
            localUri: playlistPath,
            containerPath,
            createdAt: job.createdAt,
          } as any);
        }
      } else if (job.destination) {
        const info = await FileSystem.getInfoAsync(job.destination);
        if (info.exists && !info.isDirectory) {
          await persistDownloadRecord({
            id: job.sessionId,
            mediaId: job.mediaId,
            title: job.title,
            mediaType: job.mediaType,
            subtitle: job.subtitle,
            runtimeMinutes: job.runtimeMinutes,
            releaseDate: job.releaseDate,
            posterPath: job.posterPath,
            backdropPath: job.backdropPath,
            overview: job.overview,
            artist: job.artist ?? null,
            videoId: job.videoId,
            seasonNumber: job.seasonNumber,
            episodeNumber: job.episodeNumber,
            sourceUrl: job.sourceUrl,
            downloadType: 'file',
            localUri: job.destination,
            containerPath: job.destination,
            createdAt: job.createdAt,
            bytesWritten: Number(info.size),
          } as any);
        }
      }
    }
  } catch (e) {
    console.warn('[DownloadManager] Failed to verify/restore download record:', e);
  }
  
  // Now safe to remove from queue
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

    const containerPath = job.containerPath ?? `${downloadsRoot}/${sessionName}`;
    const playlistPath = job.destination ?? `${containerPath}/index.m3u8`;
    updateJob(job.sessionId, { containerPath, destination: playlistPath });
    await saveQueue();

    const concurrency = await getDownloadConcurrency();
    let lastPartialPersist = 0;
    
    const res = await downloadHlsPlaylist({
      playlistUrl: job.sourceUrl,
      headers: job.headers,
      rootDir: downloadsRoot,
      sessionName,
      concurrency,
      shouldCancel: () => {
        const mode = getAbortMode();
        return mode === 'none' ? false : mode;
      },
      onProgress: (completed, total) => {
        if (shouldAbort()) return;
        const progress = total > 0 ? completed / total : 0;
        updateJob(job.sessionId, { progress, completedUnits: completed, totalUnits: total });
        void persistProgressMaybe(job.sessionId, progress).catch(() => { });
        emit(job, 'downloading', progress, undefined, {
          completedUnits: completed,
          totalUnits: total,
        });
        
        // Save partial download every 10% progress (for preview functionality)
        const progressPercent = Math.floor(progress * 10) / 10;
        if (progress >= 0.1 && progressPercent > lastPartialPersist) {
          lastPartialPersist = progressPercent;
          void persistPartialDownload({
            id: job.sessionId,
            mediaId: job.mediaId,
            title: job.title,
            mediaType: job.mediaType,
            localUri: `${containerPath}/index.m3u8`,
            containerPath,
            createdAt: job.createdAt,
            posterPath: job.posterPath,
            backdropPath: job.backdropPath,
            overview: job.overview,
            seasonNumber: job.seasonNumber,
            episodeNumber: job.episodeNumber,
            sourceUrl: job.sourceUrl,
            downloadType: 'hls',
            segmentCount: completed,
            totalSegments: total,
            partialProgress: progress,
            playableDuration: Math.floor((progress * (job.runtimeMinutes || 90)) * 60), // Estimate playable duration
            downloadStatus: 'downloading',
          }).catch(() => {});
        }
      },
    });

    // IMPORTANT: downloadHlsPlaylist returns null for any failure (including pause/cancel).
    // Always check the abort mode first so pausing doesn't surface as an error and disappear from the UI.
    if (getAbortMode() === 'pause') throw new Error('Paused');
    if (getAbortMode() === 'cancel') throw new Error('Cancelled');
    if (!res) throw new Error('HLS download failed');

    await persistDownloadRecord({
      id: job.sessionId,
      mediaId: job.mediaId,
      title: job.title,
      mediaType: job.mediaType,
      artist: job.artist ?? null,
      videoId: job.videoId,
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
  
  let lastPartialPersist = 0;

  const onProgress = (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
    if (shouldAbort()) return;
    if (progress.totalBytesExpectedToWrite > 0) {
      const ratio = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
      updateJob(job.sessionId, {
        progress: ratio,
        destination,
        bytesWritten: progress.totalBytesWritten,
        totalBytes: progress.totalBytesExpectedToWrite,
      });
      void persistProgressMaybe(job.sessionId, ratio).catch(() => { });
      emit(job, 'downloading', ratio, undefined, {
        bytesWritten: progress.totalBytesWritten,
        totalBytes: progress.totalBytesExpectedToWrite,
      });
      
      // Save partial download every 10% progress (for preview functionality)
      const progressPercent = Math.floor(ratio * 10) / 10;
      if (ratio >= 0.1 && progressPercent > lastPartialPersist) {
        lastPartialPersist = progressPercent;
        void persistPartialDownload({
          id: job.sessionId,
          mediaId: job.mediaId,
          title: job.title,
          mediaType: job.mediaType,
          localUri: destination,
          containerPath: destination,
          createdAt: job.createdAt,
          bytesWritten: progress.totalBytesWritten,
          totalBytes: progress.totalBytesExpectedToWrite,
          posterPath: job.posterPath,
          backdropPath: job.backdropPath,
          overview: job.overview,
          seasonNumber: job.seasonNumber,
          episodeNumber: job.episodeNumber,
          sourceUrl: job.sourceUrl,
          downloadType: 'file',
          partialProgress: ratio,
          playableDuration: Math.floor((ratio * (job.runtimeMinutes || 90)) * 60), // Estimate playable duration
          downloadStatus: 'downloading',
        }).catch(() => {});
      }
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
          .then((resumeData: any) => {
            updateJob(job.sessionId, { resumeData: normalizeResumeData(resumeData) });
            void saveQueue().catch(() => { });
          })
          .catch(() => { })
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
      artist: job.artist ?? null,
      videoId: job.videoId,
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
    const maxConcurrent = await getMaxConcurrentJobs();
    while (activeJobs.size < maxConcurrent) {
      const next = pickNextRunnableJob();
      if (!next) return;
      const job = next;
      activeJobs.add(job.sessionId);
      updateForegroundService();
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
          const latest = jobs.find((j) => j.sessionId === job.sessionId) ?? job;
          if (paused) {
            updateJob(job.sessionId, { status: 'paused' });
            await saveQueue();
            emit(job, 'paused', latest.progress, msg);
            
            // Save as partial download for preview
            if (latest.progress && latest.progress >= 0.1) {
              void updateDownloadRecord(job.sessionId, {
                downloadStatus: 'paused',
                partialProgress: latest.progress,
                isPartial: true,
              }).catch(() => {});
            }
            return;
          }
          const nextStatus: DownloadJobStatus = cancelled ? 'cancelled' : 'error';
          updateJob(job.sessionId, { status: nextStatus });
          await saveQueue();
          emit(job, nextStatus, 0, msg);
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
          updateForegroundService();
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
  await reconcileCompletedJobs();
  for (const job of jobs) {
    if (job.status === 'queued' || job.status === 'paused') {
      emit(job, job.status, job.progress);
    }
  }
  void pumpQueue();
}

export async function setDownloadSpeed(speed: 'high' | 'medium') {
  const key = await getProfileScopedKey(DOWNLOAD_SPEED_KEY);
  await AsyncStorage.setItem(key, JSON.stringify(speed));
}

export async function getDownloadSpeed(): Promise<'high' | 'medium'> {
  try {
    const key = await getProfileScopedKey(DOWNLOAD_SPEED_KEY);
    const raw = await AsyncStorage.getItem(key);
    let parsed: unknown = raw;
    if (raw != null) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }
    const value = typeof parsed === 'string' ? parsed : typeof raw === 'string' ? raw : '';
    const normalized = value.trim().toLowerCase();
    if (normalized === 'medium') return 'medium';
    return 'high';
  } catch {
    return DOWNLOAD_SPEED_DEFAULT;
  }
}

export async function tickDownloadQueue() {
  await initializeDownloadManager();
  void pumpQueue();
  return jobs.some((j) => j.status === 'queued' || j.status === 'preparing' || j.status === 'downloading');
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
    updateJob(sessionId, { resumeData: normalizeResumeData(resumeData) });
    await saveQueue();
  } catch {
    // ignore
  }
}

export async function resumeDownload(sessionId: string) {
  const job = jobs.find((j) => j.sessionId === sessionId);
  if (!job) {
    // Check if this is a partial download that needs to be re-queued
    const downloads = await getAllDownloads();
    const partial = downloads.find(d => d.id === sessionId && d.isPartial);
    if (partial && partial.sourceUrl) {
      // Re-enqueue the partial download
      await enqueueDownload({
        title: partial.title,
        mediaId: partial.mediaId,
        mediaType: partial.mediaType,
        subtitle: partial.subtitle || null,
        runtimeMinutes: partial.runtimeMinutes,
        seasonNumber: partial.seasonNumber,
        episodeNumber: partial.episodeNumber,
        releaseDate: partial.releaseDate,
        posterPath: partial.posterPath,
        backdropPath: partial.backdropPath,
        overview: partial.overview,
        sourceUrl: partial.sourceUrl,
        downloadType: partial.downloadType || 'file',
      });
    }
    return;
  }
  if (job.status !== 'paused') return;
  const state = getAbortController(sessionId);
  state.mode = 'none';
  updateJob(sessionId, { status: 'queued' });
  await saveQueue();
  emit(job, 'queued', job.progress);
  
  // Update the download record
  await updateDownloadRecord(sessionId, { downloadStatus: 'downloading' });
  
  void pumpQueue();
}

export async function cancelDownload(sessionId: string) {
  const flag = getAbortController(sessionId);
  flag.mode = 'cancel';

  const resumable = activeFileDownloads.get(sessionId);
  if (resumable) {
    try {
    const resumeData = await resumable.pauseAsync();
    updateJob(sessionId, { resumeData: normalizeResumeData(resumeData) });
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
