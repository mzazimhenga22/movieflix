const NAV_PAYLOAD_CACHE_KEY = '__movieflix_nav_payload_cache';

type CacheEntry = {
  value: unknown;
  createdAt: number;
};

function getCache(): Record<string, CacheEntry> {
  const g = globalThis as any;
  if (!g[NAV_PAYLOAD_CACHE_KEY]) g[NAV_PAYLOAD_CACHE_KEY] = {};
  return g[NAV_PAYLOAD_CACHE_KEY] as Record<string, CacheEntry>;
}

function pruneCache(cache: Record<string, CacheEntry>, maxAgeMs: number, maxEntries: number) {
  const now = Date.now();
  for (const [key, entry] of Object.entries(cache)) {
    if (!entry || now - entry.createdAt > maxAgeMs) delete cache[key];
  }

  const keys = Object.keys(cache);
  if (keys.length <= maxEntries) return;
  keys
    .sort((a, b) => (cache[a]?.createdAt ?? 0) - (cache[b]?.createdAt ?? 0))
    .slice(0, Math.max(0, keys.length - maxEntries))
    .forEach((k) => delete cache[k]);
}

export function putNavPayload(prefix: string, value: unknown): string {
  const id = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const cache = getCache();
  pruneCache(cache, 10 * 60 * 1000, 80);
  cache[id] = { value, createdAt: Date.now() };
  return id;
}

export function getNavPayload<T>(id: string, maxAgeMs = 5 * 60 * 1000): T | null {
  const cache = getCache();
  const entry = cache[id];
  if (!entry) return null;

  const age = Date.now() - entry.createdAt;
  if (age > maxAgeMs) {
    delete cache[id];
    return null;
  }

  return entry.value as T;
}

export function deleteNavPayload(id: string): void {
  const cache = getCache();
  delete cache[id];
}

export function takeNavPayload<T>(id: string, maxAgeMs = 5 * 60 * 1000): T | null {
  const cache = getCache();
  const value = getNavPayload<T>(id, maxAgeMs);
  delete cache[id];
  return value;
}
