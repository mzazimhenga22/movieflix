import type { PStreamPlayback } from '../src/pstream/usePStream';

type PrefetchEntry = {
  playback: PStreamPlayback;
  title?: string | null;
  storedAt: number;
};

const PREFETCH_CACHE = new Map<string, PrefetchEntry>();
const PREFETCH_TTL_MS = 2 * 60 * 1000; // 2 minutes

const stableSerialize = (input: Record<string, any> = {}): string => {
  const sorted = Object.keys(input)
    .sort()
    .reduce<Record<string, any>>((acc, key) => {
      const value = input[key];
      if (value === undefined) return acc;
      acc[key] = value;
      return acc;
    }, {});
  return JSON.stringify(sorted);
};

export function createPrefetchKey(target: { pathname: string; params?: Record<string, any> }): string {
  const base = `${target.pathname}|${stableSerialize(target.params ?? {})}`;
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${base}|${nonce}`;
}

export function storePrefetchedPlayback(key: string, payload: { playback: PStreamPlayback; title?: string | null }) {
  if (!key) return;
  PREFETCH_CACHE.set(key, {
    playback: payload.playback,
    title: payload.title ?? null,
    storedAt: Date.now(),
  });
}

export function consumePrefetchedPlayback(key: string): { playback: PStreamPlayback; title?: string | null } | null {
  if (!key) return null;
  const entry = PREFETCH_CACHE.get(key);
  if (!entry) return null;
  PREFETCH_CACHE.delete(key);
  if (Date.now() - entry.storedAt > PREFETCH_TTL_MS) {
    return null;
  }
  return { playback: entry.playback, title: entry.title };
}

export function clearExpiredPrefetchEntries() {
  const now = Date.now();
  for (const [key, entry] of PREFETCH_CACHE.entries()) {
    if (now - entry.storedAt > PREFETCH_TTL_MS) {
      PREFETCH_CACHE.delete(key);
    }
  }
}
