import type { PStreamPlayback } from '@/src/pstream/usePStream';

type PrefetchEntry = {
  playback: PStreamPlayback;
  title?: string;
};

// Prefetching is not used on TV (kept for compatibility with shared player code).
export function consumePrefetchedPlayback(_key: string): PrefetchEntry | null {
  return null;
}
