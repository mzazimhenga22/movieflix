import { useCallback, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type {
  ProviderControls,
  Qualities,
  RunOutput,
  ScrapeMedia,
  Stream,
} from '../../providers-temp/lib/index.js';
import {
  makeProviders,
  makeStandardFetcher,
  targets,
  setM3U8ProxyUrl,
} from '../../providers-temp/lib/index.js';
import { firestore } from '../../constants/firebase';

/* ───────── TYPES ───────── */

export type PStreamPlayback = {
  uri: string;
  headers?: Record<string, string>;
  stream: Stream;
  sourceId: string;
  embedId?: string;
};

export type PStreamScrapeOptions = {
  sourceOrder?: string[];
  debugTag?: string;
};

type Embed = {
  id: string;
  embedScraperId: string;
};

type RunOutputWithEmbeds = RunOutput & { embeds?: Embed[] };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/* ───────── FETCHER ───────── */

const fetchLike: FetchLike = async (url, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.google.com/',
        ...(init?.headers as Record<string, string>),
      },
    });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

const sharedFetcher = makeStandardFetcher(fetchLike as any);

/* ───────── PROVIDERS ───────── */

let cachedProviders: ProviderControls | null = null;
let proxyConfigured = false;

function ensureProxyConfigured() {
  if (proxyConfigured || typeof setM3U8ProxyUrl !== 'function') return;

  const envProxy = (
    (typeof process !== 'undefined' && (process.env as any)?.EXPO_PUBLIC_PSTREAM_M3U8_PROXY_URL) ||
    (typeof process !== 'undefined' && (process.env as any)?.NEXT_PUBLIC_PSTREAM_M3U8_PROXY_URL) ||
    (typeof process !== 'undefined' && (process.env as any)?.PSTREAM_M3U8_PROXY_URL)
  ) as string | undefined;

  const normalizedProxy = envProxy?.trim();
  if (normalizedProxy) {
    setM3U8ProxyUrl(normalizedProxy);
    proxyConfigured = true;
    return;
  }

  const maybeWindow = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
  const origin = maybeWindow?.location?.origin;
  if (origin) {
    try {
      setM3U8ProxyUrl(`${origin}/api/proxy`);
      proxyConfigured = true;
    } catch {
      // ignore
    }
  }
}

function getProviders(): ProviderControls {
  if (!cachedProviders) {
    ensureProxyConfigured();
    cachedProviders = makeProviders({
      fetcher: sharedFetcher,
      proxiedFetcher: sharedFetcher,
      target: targets.NATIVE,
      consistentIpForRequests: true,
      proxyStreams: false,
      externalSources: 'all',
    });
  }
  return cachedProviders;
}

/* ───────── LAST-KNOWN PROVIDERS ───────── */

type LastKnownProvider = {
  sourceId?: string;
  embedId?: string | null;
  updatedAt?: number;
  type?: string;
};

const LAST_KNOWN_COLLECTION = 'pstreamLastKnown';

const MEMORY_CACHE_TTL_MS = 2 * 60 * 1000;
const playbackMemoryCache = new Map<string, { playback: PStreamPlayback; storedAt: number }>();
const inflightScrapes = new Map<string, Promise<PStreamPlayback>>();
const lastKnownMemoryCache = new Map<string, { value: LastKnownProvider; storedAt: number }>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), ms);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

function normalizeKeySegment(value: string | number | undefined | null) {
  if (value === undefined || value === null) return 'na';
  return String(value).replace(/[^a-zA-Z0-9-_:.]/g, '_');
}

function buildMediaKey(media: ScrapeMedia): string {
  if (!media) return 'unknown';
  if ((media as any).type === 'show') {
    const base = [
      'show',
      normalizeKeySegment((media as any)?.tmdbId ?? (media as any)?.imdbId ?? media.title ?? 'untitled'),
      `s${normalizeKeySegment((media as any)?.season?.number ?? '0')}`,
      `e${normalizeKeySegment((media as any)?.episode?.number ?? '0')}`,
    ];
    return base.join('-');
  }
  const base = [
    (media as any)?.type ?? 'movie',
    normalizeKeySegment((media as any)?.tmdbId ?? (media as any)?.imdbId ?? media.title ?? 'untitled'),
  ];
  return base.join('-');
}

async function fetchLastKnownProvider(media: ScrapeMedia): Promise<LastKnownProvider | null> {
  const key = buildMediaKey(media);
  const cached = lastKnownMemoryCache.get(key);
  if (cached && Date.now() - cached.storedAt < MEMORY_CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const ref = doc(firestore, LAST_KNOWN_COLLECTION, key);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as LastKnownProvider;
    lastKnownMemoryCache.set(key, { value: data, storedAt: Date.now() });
    return data;
  } catch (err) {
    console.warn('[PStream] Last-known lookup failed', err);
    return null;
  }
}

function persistLastKnownProvider(media: ScrapeMedia, playback: PStreamPlayback) {
  try {
    const key = buildMediaKey(media);
    lastKnownMemoryCache.set(
      key,
      {
        value: {
          sourceId: playback.sourceId,
          embedId: playback.embedId ?? null,
          updatedAt: Date.now(),
          type: (media as any)?.type ?? 'unknown',
        },
        storedAt: Date.now(),
      },
    );

    const ref = doc(firestore, LAST_KNOWN_COLLECTION, key);
    void setDoc(
      ref,
      {
        sourceId: playback.sourceId,
        embedId: playback.embedId ?? null,
        updatedAt: Date.now(),
        type: (media as any)?.type ?? 'unknown',
      },
      { merge: true },
    );
  } catch (err) {
    console.warn('[PStream] Failed to persist last-known provider', err);
  }
}

function reorderWithPreference(order: string[], preferred?: string | null): string[] {
  if (!preferred) return order;
  const deduped: string[] = [];
  const seen = new Set<string>();
  const normalizedPreferred = preferred.trim();

  const push = (id: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    deduped.push(id);
  };

  push(normalizedPreferred);
  order.forEach((id) => {
    if (id === normalizedPreferred) return;
    push(id);
  });
  return deduped;
}

function prioritizeEmbeds(embeds: Embed[], preferred?: string | null): Embed[] {
  if (!preferred) return embeds;
  const normalized = preferred.trim().toLowerCase();
  const prioritized: Embed[] = [];
  const others: Embed[] = [];
  embeds.forEach((embed) => {
    if (embed.embedScraperId?.toLowerCase() === normalized) prioritized.push(embed);
    else others.push(embed);
  });
  return [...prioritized, ...others];
}

/* ───────── STREAM HELPERS ───────── */

const QUALITY_ORDER: Qualities[] = ['4k', '1080', '720', '480', '360', 'unknown'];

function sanitizeStreamHeaders(incoming?: Record<string, string>) {
  if (!incoming) return undefined;
  const out: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(incoming)) {
    if (!rawKey) continue;
    if (rawValue === undefined || rawValue === null) continue;
    const value = String(rawValue);
    if (!value) continue;
    const lower = rawKey.trim().toLowerCase();
    if (!lower) continue;

    // Avoid pinning Host; native players/CDN redirects may require Host to change.
    if (lower === 'host' || lower === 'content-length') continue;

    switch (lower) {
      case 'user-agent':
        out['User-Agent'] = value;
        break;
      case 'referer':
        out.Referer = value;
        break;
      case 'origin':
        out.Origin = value;
        break;
      default:
        out[rawKey] = value;
        break;
    }
  }

  return Object.keys(out).length ? out : undefined;
}

function mergeHeaders(stream: Stream) {
  const merged = { ...(stream.headers ?? {}), ...(stream.preferredHeaders ?? {}) };
  return sanitizeStreamHeaders(merged);
}

function pickFileQuality(stream: Stream): string | null {
  if (stream.type !== 'file') return null;
  for (const q of QUALITY_ORDER) {
    const f = stream.qualities?.[q];
    if (f?.url) return f.url;
  }
  return Object.values(stream.qualities ?? {}).find(v => v?.url)?.url ?? null;
}

function normalizeBase64(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return raw;
  let normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  if (pad) normalized += '='.repeat(4 - pad);
  return normalized;
}

function tryDecodeBase64ToUtf8(input: string): string | null {
  try {
    return Buffer.from(normalizeBase64(input), 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

function tryUnproxyM3U8ProxyUrl(
  uri: string,
  headers: Record<string, string> | undefined,
): { uri: string; headers: Record<string, string> | undefined } {
  try {
    const urlObj = new URL(uri);
    if (!urlObj.pathname.includes('m3u8-proxy')) return { uri, headers };

    const encodedUrl = urlObj.searchParams.get('url');
    if (!encodedUrl) return { uri, headers };

    const decodedUrl = tryDecodeBase64ToUtf8(decodeURIComponent(encodedUrl));
    if (!decodedUrl || !/^https?:/i.test(decodedUrl)) return { uri, headers };

    let mergedHeaders = headers;
    const encodedHeaders = urlObj.searchParams.get('h');
    if (encodedHeaders) {
      const decodedHeadersRaw = tryDecodeBase64ToUtf8(decodeURIComponent(encodedHeaders));
      if (decodedHeadersRaw) {
        try {
          const parsed = JSON.parse(decodedHeadersRaw);
          if (parsed && typeof parsed === 'object') {
            mergedHeaders = { ...(parsed as Record<string, string>), ...(headers ?? {}) };
          }
        } catch {
          // ignore
        }
      }
    }

    return { uri: decodedUrl, headers: mergedHeaders };
  } catch {
    return { uri, headers };
  }
}

async function validatePlayback(playback: PStreamPlayback): Promise<boolean> {
  const uri = playback?.uri;
  if (!uri) return false;
  const headers = (playback.headers ?? {}) as Record<string, string>;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const isHls = playback.stream?.type === 'hls' || uri.toLowerCase().includes('.m3u8');
    if (isHls) {
      // Try a small ranged fetch first (faster on some CDNs), fall back to full manifest.
      try {
        const res = await fetch(uri, {
          headers: { ...headers, Range: 'bytes=0-2047' },
          signal: controller.signal,
        });
        if (!res.ok) return false;
        const text = await res.text();
        return text.includes('#EXTM3U');
      } catch {
        const res = await fetch(uri, { headers, signal: controller.signal });
        if (!res.ok) return false;
        const text = await res.text();
        return text.includes('#EXTM3U');
      }
    }

    // Prefer HEAD, fall back to a small ranged GET.
    try {
      const head = await fetch(uri, { method: 'HEAD', headers, signal: controller.signal });
      if (head.ok) return true;
    } catch {
      // ignore
    }
    const ranged = await fetch(uri, {
      headers: { ...headers, Range: 'bytes=0-1023' },
      signal: controller.signal,
    });
    return ranged.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPlayback(stream: Stream, sourceId: string, embedId?: string): PStreamPlayback {
  let uri: string | null = null;
  let headers = mergeHeaders(stream);

  if (stream.type === 'hls') {
    uri = stream.playlist;
  } else if (stream.type === 'file') {
    uri = pickFileQuality(stream);

    // Native playback should prefer direct URLs (some hosts block datacenter IPs used by proxies).
    if (uri) {
      ({ uri, headers } = tryUnproxyM3U8ProxyUrl(uri, headers));
    }
  }

  if (!uri) throw new Error('No playable stream');

  return { uri, headers, stream, sourceId, embedId };
}

/* ───────── LANGUAGE PRIORITY ───────── */

function isEnglish(embedId?: string) {
  const id = embedId?.toLowerCase() ?? '';
  return id.includes('english') || id.includes('eng') || id.includes('en');
}

function orderEmbedsEnglishFirst(embeds: Embed[]): Embed[] {
  const english: Embed[] = [];
  const rest: Embed[] = [];
  for (const e of embeds) (isEnglish(e.embedScraperId) ? english : rest).push(e);
  return [...english, ...rest];
}

/* ───────── FALLBACK SOURCES ───────── */

const FALLBACK_SOURCES = ['cuevana3', 'ridomovies', 'hdrezka', 'warezcdn'];
const SOURCE_CONCURRENCY = 2;
const EMBED_CONCURRENCY = 2;

async function runWithSlidingWindow<T>(
  items: T[],
  limit: number,
  runner: (item: T) => Promise<PStreamPlayback | null>,
  onResolved?: () => void,
): Promise<PStreamPlayback | null> {
  if (!items.length) return null;

  return new Promise((resolve) => {
    let nextIndex = 0;
    let active = 0;
    let resolved = false;

    const maybeLaunchNext = () => {
      if (resolved) return;
      if (nextIndex >= items.length) {
        if (active === 0) resolve(null);
        return;
      }
      const current = items[nextIndex];
      nextIndex += 1;
      active += 1;
      runner(current)
        .then((result) => {
          active -= 1;
          if (resolved) return;
          if (result) {
            resolved = true;
            onResolved?.();
            resolve(result);
            return;
          }
          maybeLaunchNext();
          if (nextIndex >= items.length && active === 0) resolve(null);
        })
        .catch(() => {
          active -= 1;
          if (resolved) return;
          maybeLaunchNext();
          if (nextIndex >= items.length && active === 0) resolve(null);
        });
    };

    const initial = Math.min(limit, items.length);
    for (let i = 0; i < initial; i += 1) {
      maybeLaunchNext();
    }
  });
}

/* ───────── HOOK ───────── */

export function usePStream() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PStreamPlayback | null>(null);

  const scrape = useCallback(async (media: ScrapeMedia, options?: PStreamScrapeOptions) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const playback = await scrapePStream(media, options);
      setResult(playback);
      return playback;
    } catch (e: any) {
      setError(e?.message ?? 'Stream error');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, result, scrape };
}

export async function scrapePStream(media: ScrapeMedia, options?: PStreamScrapeOptions) {
  const mediaKey = buildMediaKey(media);
  const cached = playbackMemoryCache.get(mediaKey);
  if (cached && Date.now() - cached.storedAt < MEMORY_CACHE_TTL_MS) {
    return cached.playback;
  }

  const inflight = inflightScrapes.get(mediaKey);
  if (inflight) return inflight;

  const task = (async () => {
    const providers = getProviders();
    const lastKnownPromise = fetchLastKnownProvider(media);
    const baseOrder = options?.sourceOrder?.length ? [...options.sourceOrder] : [...FALLBACK_SOURCES];

    let lastKnown: LastKnownProvider | null = null;
    try {
      lastKnown = await withTimeout(lastKnownPromise, 650);
    } catch {
      lastKnown = null;
    }

    const sourceOrder = reorderWithPreference(baseOrder, lastKnown?.sourceId);
    let abortSources = false;

    if (options?.debugTag) console.log('[PStream]', options.debugTag, media);

    const tryEmbed = async (sourceId: string, embedId: string): Promise<PStreamPlayback | null> => {
      if (abortSources) return null;
      try {
        const embedRun = await providers.runAll({
          media,
          sourceOrder: [sourceId],
          embedOrder: [embedId],
          disableOpensubtitles: true,
        });
        if (embedRun?.stream) {
          const playback = buildPlayback(embedRun.stream, sourceId, embedId);
          const ok = await validatePlayback(playback);
          if (!ok) {
            console.warn('[PStream] Invalid stream (embed)', {
              sourceId,
              embedId,
              type: playback.stream?.type,
              uri: playback.uri.slice(0, 96),
            });
            return null;
          }
          return playback;
        }
      } catch (err: any) {
        console.warn('[PStream] Embed failed:', embedId, err?.message ?? err);
      }
      return null;
    };

    const trySource = async (sourceId: string): Promise<PStreamPlayback | null> => {
      if (abortSources) return null;
      try {
        const discovery: RunOutputWithEmbeds | null = await providers.runAll({
          media,
          sourceOrder: [sourceId],
          disableOpensubtitles: true,
        });

        if (!discovery) return null;

        if (discovery.stream) {
          try {
            const playback = buildPlayback(discovery.stream, sourceId);
            const ok = await validatePlayback(playback);
            if (ok) return playback;
            console.warn('[PStream] Invalid stream (source)', {
              sourceId,
              type: playback.stream?.type,
              uri: playback.uri.slice(0, 96),
            });
          } catch (err: any) {
            console.warn('[PStream] Stream build failed:', sourceId, err?.message ?? err);
          }
        }

        let embeds = orderEmbedsEnglishFirst(discovery.embeds ?? []);
        if (lastKnown?.sourceId === sourceId && lastKnown.embedId) {
          embeds = prioritizeEmbeds(embeds, lastKnown.embedId);
        }
        if (!embeds.length) return null;

        return runWithSlidingWindow(embeds, EMBED_CONCURRENCY, (embed) =>
          tryEmbed(sourceId, embed.embedScraperId),
        );
      } catch (err: any) {
        console.warn('[PStream] Source failed:', sourceId, err?.message ?? err);
        return null;
      }
    };

    const playback = await runWithSlidingWindow(sourceOrder, SOURCE_CONCURRENCY, trySource, () => {
      abortSources = true;
    });

    if (!playback) {
      throw new Error('No playable stream found');
    }

    playbackMemoryCache.set(mediaKey, { playback, storedAt: Date.now() });
    persistLastKnownProvider(media, playback);
    return playback;
  })();

  inflightScrapes.set(mediaKey, task);
  try {
    return await task;
  } finally {
    inflightScrapes.delete(mediaKey);
  }
}

export default usePStream;
