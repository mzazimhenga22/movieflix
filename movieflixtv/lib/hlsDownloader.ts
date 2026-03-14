import * as FileSystem from 'expo-file-system/legacy';

export type HlsVariantOption = {
  id: string;
  label: string;
  url: string;
  bandwidth?: number;
  resolution?: string;
};

export type DownloadHlsResult = {
  playlistPath: string;
  directory: string;
  totalBytes: number;
  segmentCount: number;
};

type DownloadHlsOptions = {
  playlistUrl: string;
  headers?: Record<string, string>;
  rootDir: string;
  sessionName: string;
  onProgress?: (completed: number, total: number) => void;
  concurrency?: number;
  shouldCancel?: () => boolean | 'pause' | 'cancel';
};

// Helpers
const stripQuotes = (value?: string) => value?.replace(/^"+/, '').replace(/"+$/, '');
const parseAttributeDictionary = (input: string): Record<string, string> => {
  const result: Record<string, string> = {};
  let buffer = '';
  let inQuotes = false;
  const flush = () => {
    if (!buffer) return;
    const [key, value] = buffer.split('=');
    if (key && value) result[key.trim()] = value.trim();
    buffer = '';
  };
  for (const char of input) {
    if (char === '"') inQuotes = !inQuotes;
    if (char === ',' && !inQuotes) flush();
    else buffer += char;
  }
  flush();
  return result;
};
const resolveUrl = (baseUrl: string, relative: string) => {
  try {
    return new URL(relative, baseUrl).toString();
  } catch {
    return relative;
  }
};
const inferExtension = (url: string, fallback: string) => {
  const sanitized = url.split('?')[0].split('#')[0];
  const last = sanitized.split('/').pop() ?? '';
  if (last.includes('.')) {
    const ext = last.split('.').pop();
    if (ext && ext.length <= 5) return ext.toLowerCase();
  }
  return fallback;
};

async function fetchPlaylist(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`Failed to load playlist (${res.status})`);
  return await res.text();
}

const getResolutionHeight = (resolution?: string) => {
  if (!resolution) return 0;
  const parts = resolution.split('x');
  if (parts.length !== 2) return 0;
  const height = parseInt(parts[1], 10);
  return Number.isFinite(height) ? height : 0;
};

const formatBandwidth = (bandwidth?: number) => {
  if (!bandwidth || !Number.isFinite(bandwidth) || bandwidth <= 0) return '';
  const kbps = bandwidth / 1000;
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  return `${Math.round(kbps)} kbps`;
};

const buildVariantLabel = (resolution?: string, bandwidth?: number) => {
  const height = getResolutionHeight(resolution);
  if (height) {
    const bw = formatBandwidth(bandwidth);
    return bw ? `${height}p • ${bw}` : `${height}p`;
  }
  const bw = formatBandwidth(bandwidth);
  return bw || 'Variant';
};

export async function getHlsVariantOptions(
  playlistUrl: string,
  headers?: Record<string, string>,
): Promise<HlsVariantOption[] | null> {
  const text = await fetchPlaylist(playlistUrl, headers);
  if (!text.includes('#EXT-X-STREAM-INF')) return null;

  const lines = text.split('\n');
  const options: HlsVariantOption[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
    const [, attrString = ''] = line.split(':', 2);
    const attrs = parseAttributeDictionary(attrString);
    const resolution = stripQuotes(attrs.RESOLUTION);
    const bandwidth = attrs.BANDWIDTH ? parseInt(attrs.BANDWIDTH, 10) : undefined;

    let j = i + 1;
    let uriLine: string | undefined;
    while (j < lines.length) {
      const candidate = lines[j].trim();
      j += 1;
      if (!candidate || candidate.startsWith('#')) continue;
      uriLine = candidate;
      break;
    }
    if (!uriLine) continue;
    const url = resolveUrl(playlistUrl, uriLine);
    options.push({
      id: `${bandwidth ?? 0}-${resolution ?? url}`,
      label: buildVariantLabel(resolution, bandwidth),
      url,
      bandwidth,
      resolution,
    });
  }

  return options.sort((a, b) => {
    const aH = getResolutionHeight(a.resolution);
    const bH = getResolutionHeight(b.resolution);
    if (aH && bH) return bH - aH;
    if (a.bandwidth && b.bandwidth) return (b.bandwidth || 0) - (a.bandwidth || 0);
    return 0;
  });
}

const pickBestVariantUrl = (playlistText: string, baseUrl: string) => {
  let bestUrl: string | null = null;
  let bestBandwidth = -1;
  const regex = /#EXT-X-STREAM-INF:([^\n]+)\n([^\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(playlistText))) {
    const attrs = parseAttributeDictionary(match[1]);
    const uri = match[2]?.trim();
    if (!uri) continue;
    const bw = parseInt(attrs.BANDWIDTH ?? '0', 10);
    if (bw > bestBandwidth) {
      bestBandwidth = bw;
      bestUrl = resolveUrl(baseUrl, uri);
    }
  }
  return bestUrl;
};

async function resolveTerminalPlaylist(url: string, headers?: Record<string, string>) {
  let currentUrl = url;
  let currentText = await fetchPlaylist(url, headers);
  let depth = 0;
  while (currentText.includes('#EXT-X-STREAM-INF')) {
    const nextUrl = pickBestVariantUrl(currentText, currentUrl);
    if (!nextUrl) throw new Error('No playable variant found for this HLS stream.');
    currentUrl = nextUrl;
    currentText = await fetchPlaylist(currentUrl, headers);
    depth += 1;
    if (depth > 6) throw new Error('HLS playlist nests too many levels.');
  }
  return { playlistUrl: currentUrl, playlistText: currentText };
}

export async function downloadHlsPlaylist({
  playlistUrl,
  headers,
  rootDir,
  sessionName,
  onProgress,
  concurrency = 3,
  shouldCancel,
}: DownloadHlsOptions): Promise<DownloadHlsResult | null> {
  try {
    const sessionDir = `${rootDir}/${sessionName}`;
    await FileSystem.makeDirectoryAsync(sessionDir, { intermediates: true });

    const resolved = await resolveTerminalPlaylist(playlistUrl, headers);
    let activePlaylistUrl = resolved.playlistUrl;
    let playlistText = resolved.playlistText;

    if (playlistText.includes('#EXT-X-KEY')) {
      console.warn('[HLS] Encrypted streams not supported yet.');
      return null;
    }

    const lines = playlistText.split('\n');
    const segmentUrls = lines.filter((line) => line.trim() && !line.startsWith('#'));
    if (!segmentUrls.length) {
      console.warn('[HLS] No media segments found.');
      return null;
    }

    let totalBytes = 0;
    let completedSegments = 0;
    const rewrittenLines: string[] = [];
    const tasks: Array<() => Promise<void>> = [];

    const downloadBinary = async (sourceUrl: string, destination: string) => {
      const cancelState = shouldCancel?.();
      if (cancelState === 'pause') throw new Error('Paused');
      if (cancelState === true || cancelState === 'cancel') throw new Error('Cancelled');
      const existing = await FileSystem.getInfoAsync(destination);
      if (existing.exists && !existing.isDirectory && existing.size > 0) {
        totalBytes += existing.size;
        return;
      }

      let lastErr: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const state = shouldCancel?.();
        if (state === 'pause') throw new Error('Paused');
        if (state === true || state === 'cancel') throw new Error('Cancelled');
        try {
          const download = FileSystem.createDownloadResumable(
            sourceUrl,
            destination,
            {
              ...(headers ? { headers } : null),
              sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
            },
          );
          const result = await download.downloadAsync();
          if (!result || result.status >= 400) throw new Error('Segment download failed');
          const info = await FileSystem.getInfoAsync(destination);
          if (info.exists && !info.isDirectory) totalBytes += info.size;
          return;
        } catch (err) {
          lastErr = err as Error;
        }
      }
      throw lastErr ?? new Error('Segment download failed');
    };

    const runPool = async () => {
      let next = 0;
      const workers = Array.from({ length: Math.max(1, concurrency) }).map(async () => {
        while (next < tasks.length) {
          const state = shouldCancel?.();
          if (state === 'pause') throw new Error('Paused');
          if (state === true || state === 'cancel') throw new Error('Cancelled');
          const idx = next;
          next += 1;
          await tasks[idx]();
          completedSegments += 1;
          onProgress?.(completedSegments, segmentUrls.length);
        }
      });
      await Promise.all(workers);
    };

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        rewrittenLines.push('');
        continue;
      }

      if (trimmed.startsWith('#EXT-X-MAP')) {
        const attrString = trimmed.split(':')[1] ?? '';
        const attrs = parseAttributeDictionary(attrString);
        const source = attrs.URI ? stripQuotes(attrs.URI) : undefined;
        if (source) {
          const resolvedUrl = resolveUrl(activePlaylistUrl, source);
          const mapName = `init-${Date.now()}-${Math.random().toString(36).slice(2)}.${inferExtension(source, 'mp4')}`;
          const localPath = `${sessionDir}/${mapName}`;
          await downloadBinary(resolvedUrl, localPath);
          attrs.URI = `"${mapName}"`;
          rewrittenLines.push(`#EXT-X-MAP:${Object.entries(attrs).map(([k,v])=>`${k}=${v}`).join(',')}`);
          continue;
        }
      }

      if (trimmed.startsWith('#')) {
        rewrittenLines.push(trimmed);
        continue;
      }

      const resolvedSegment = resolveUrl(activePlaylistUrl, trimmed);
      const ext = inferExtension(trimmed, 'ts');
      const localName = `seg-${String(tasks.length).padStart(5, '0')}.${ext}`;
      const localPath = `${sessionDir}/${localName}`;
      tasks.push(() => downloadBinary(resolvedSegment, localPath));
      rewrittenLines.push(localName);
    }

    await runPool();

    const playlistPath = `${sessionDir}/index.m3u8`;
    await FileSystem.writeAsStringAsync(playlistPath, rewrittenLines.join('\n'));

    return { playlistPath, directory: sessionDir, totalBytes, segmentCount: segmentUrls.length };
  } catch (err) {
    console.warn('[HLS] Download failed:', (err as Error).message);
    return null; // safe fallback for VideoPlayer / MovieDetails
  }
}
