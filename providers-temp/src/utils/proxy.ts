import { FeatureMap, flags } from '@/entrypoint/utils/targets';
import { Stream } from '@/providers/streams';

// Default proxy URL for general purpose proxying
const DEFAULT_PROXY_URL = 'https://proxy.nsbx.ru/proxy';
const ABSOLUTE_URL_REGEX = /^https?:\/\//i;
// Default M3U8 proxy URL for HLS stream proxying — prefer environment override
// `NEXT_PUBLIC_PSTREAM_M3U8_PROXY_URL` for browser builds, otherwise default to local API path.
function defaultM3U8Proxy(): string {
  try {
    // NEXT_PUBLIC_* env vars are inlined for client builds in Next/Vite
    const env = (process && (process.env as any)?.NEXT_PUBLIC_PSTREAM_M3U8_PROXY_URL) as string | undefined;
    if (env) return env;
  } catch (e) {
    // ignore
  }
  return '/api/proxy';
}

let CONFIGURED_M3U8_PROXY_URL = defaultM3U8Proxy();

const getLocationOrigin = (): string | null => {
  try {
    if (typeof globalThis === 'undefined') return null;
    const maybeLocation = (globalThis as any)?.location;
    if (maybeLocation && typeof maybeLocation.origin === 'string') {
      return maybeLocation.origin;
    }
  } catch (e) {
    // ignore
  }
  return null;
};

const resolveProxyBase = (): string => {
  const candidate = CONFIGURED_M3U8_PROXY_URL?.trim();
  if (candidate) {
    if (ABSOLUTE_URL_REGEX.test(candidate)) {
      return candidate;
    }

    if (candidate.startsWith('//')) {
      return `https:${candidate}`;
    }

    if (candidate.startsWith('/')) {
      const origin = getLocationOrigin();
      if (origin) {
        return `${origin}${candidate}`;
      }
      return DEFAULT_PROXY_URL;
    }

    const sanitized = candidate.replace(/^\/*/, '');
    if (sanitized) {
      if (sanitized.startsWith('localhost')) {
        return `http://${sanitized}`;
      }
      if (sanitized.includes('.')) {
        return `https://${sanitized}`;
      }
    }
  }

  return DEFAULT_PROXY_URL;
};

/**
 * Set a custom M3U8 proxy URL to use for all M3U8 proxy requests
 * @param proxyUrl - The base URL of the M3U8 proxy
 */
export function setM3U8ProxyUrl(proxyUrl: string): void {
  CONFIGURED_M3U8_PROXY_URL = proxyUrl;
}

/**
 * Get the currently configured M3U8 proxy URL
 * @returns The configured M3U8 proxy URL
 */
export function getM3U8ProxyUrl(): string {
  return CONFIGURED_M3U8_PROXY_URL;
}

export function requiresProxy(stream: Stream): boolean {
  if (!stream.flags.includes(flags.CORS_ALLOWED) || !!(stream.headers && Object.keys(stream.headers).length > 0))
    return true;
  return false;
}

export function setupProxy(stream: Stream): Stream {
  const headers = stream.headers && Object.keys(stream.headers).length > 0 ? stream.headers : undefined;

  const options = {
    ...(stream.type === 'hls' && { depth: stream.proxyDepth ?? 0 }),
  };

  const payload: {
    type?: 'hls' | 'mp4';
    url?: string;
    headers?: Record<string, string>;
    options?: { depth?: 0 | 1 | 2 };
  } = {
    headers,
    options,
  };

  if (stream.type === 'hls') {
    payload.type = 'hls';
    payload.url = stream.playlist;
    // Use configured M3U8 proxy URL which expects `url` as base64 and optional `h` headers param
    stream.playlist = createM3U8ProxyUrl(stream.playlist, undefined, headers);
  }

  if (stream.type === 'file') {
    payload.type = 'mp4';
    Object.entries(stream.qualities).forEach((entry) => {
      payload.url = entry[1].url;
      // Use the M3U8 proxy URL format for file URLs as well so the same server-side proxy can stream segments
      entry[1].url = createM3U8ProxyUrl(entry[1].url, undefined, headers);
    });
  }

  stream.headers = {};
  stream.flags = [flags.CORS_ALLOWED];
  return stream;
}

/**
 * Creates a proxied M3U8 URL using the configured M3U8 proxy
 * @param url - The original M3U8 URL to proxy
 * @param features - Feature map to determine if local proxy (extension/native) is available
 * @param headers - Headers to include with the request
 * @returns The proxied M3U8 URL or original URL if local proxy is available
 */
export function createM3U8ProxyUrl(url: string, features?: FeatureMap, headers: Record<string, string> = {}): string {
  // If we have features and local proxy is available (no CORS restrictions), return original URL
  // The stream headers will handle the proxying through the extension/native environment
  if (features && !features.requires.includes(flags.CORS_ALLOWED)) {
    return url;
  }

  // Otherwise, use the configured M3U8 proxy. New proxy signature expected by the app's
  // Next.js route: `/api/proxy?url=<base64(original)>&h=<base64(encodedHeaders)>`.
  const b64Url = Buffer.from(url).toString('base64');
  const hdr = headers && Object.keys(headers).length ? `&h=${encodeURIComponent(Buffer.from(JSON.stringify(headers)).toString('base64'))}` : '';
  // Ensure the proxy base is an absolute URL so native fetchers don't error on relative paths.
  const proxyBase = resolveProxyBase();
  return `${proxyBase}?url=${encodeURIComponent(b64Url)}${hdr}`;
}

/**
 * Updates an existing M3U8 proxy URL to use the currently configured proxy
 * @param url - The M3U8 proxy URL to update
 * @returns The updated M3U8 proxy URL
 */
export function updateM3U8ProxyUrl(url: string): string {
  // Replace any old /m3u8-proxy host with the currently-configured proxy base
  if (url.includes('/m3u8-proxy?url=')) {
    const proxyBase = resolveProxyBase();
    return url.replace(/https?:\/\/[^/]+\/m3u8-proxy/, `${proxyBase}`);
  }
  return url;
}
