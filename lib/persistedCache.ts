import AsyncStorage from '@react-native-async-storage/async-storage';

type CacheEnvelope<T> = {
  v: T;
  t: number; // savedAtMs
};

const MEMORY_KEY = '__movieflix_persisted_cache__';

function getMemory(): Map<string, CacheEnvelope<any>> {
  const g = globalThis as any;
  if (!g[MEMORY_KEY]) g[MEMORY_KEY] = new Map();
  return g[MEMORY_KEY] as Map<string, CacheEnvelope<any>>;
}

export async function getPersistedCache<T>(
  key: string,
  options?: { maxAgeMs?: number },
): Promise<{ value: T; savedAtMs: number } | null> {
  const maxAgeMs = options?.maxAgeMs;
  const mem = getMemory();
  const memEntry = mem.get(key) as CacheEnvelope<T> | undefined;
  const now = Date.now();

  const isValid = (entry?: CacheEnvelope<T> | null) => {
    if (!entry) return false;
    if (!entry.t || typeof entry.t !== 'number') return false;
    if (typeof maxAgeMs === 'number' && maxAgeMs >= 0 && now - entry.t > maxAgeMs) return false;
    return true;
  };

  if (isValid(memEntry)) return { value: memEntry!.v as T, savedAtMs: memEntry!.t };

  const raw = await AsyncStorage.getItem(key).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!isValid(parsed)) return null;
    mem.set(key, parsed as CacheEnvelope<any>);
    return { value: parsed.v as T, savedAtMs: parsed.t };
  } catch {
    return null;
  }
}

export async function setPersistedCache<T>(key: string, value: T): Promise<void> {
  const envelope: CacheEnvelope<T> = { v: value, t: Date.now() };
  getMemory().set(key, envelope as CacheEnvelope<any>);
  await AsyncStorage.setItem(key, JSON.stringify(envelope)).catch(() => {});
}

export async function deletePersistedCache(key: string): Promise<void> {
  getMemory().delete(key);
  await AsyncStorage.removeItem(key).catch(() => {});
}
