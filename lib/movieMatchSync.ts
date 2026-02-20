import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firestore } from '../constants/firebase';

type MatchEntryInput = {
  tmdbId?: number | string;
  title?: string | null;
  mediaType?: 'movie' | 'tv' | string | null;
  progress: number;
  genres?: number[] | null;
  posterPath?: string | null;
  releaseYear?: string | number | null;
};

type SyncArgs = {
  userId: string;
  profileId?: string | null;
  profileName?: string | null;
  avatarColor?: string | null;
  photoURL?: string | null;
  entry: MatchEntryInput;
};

const ENTRY_LIMIT = 60;

const sanitizeEntry = (input: MatchEntryInput) => {
  const baseId = input.tmdbId ?? input.title ?? Date.now();
  return {
    tmdbId: baseId,
    title: input.title ?? 'Now Playing',
    mediaType: (input.mediaType ?? 'movie') as 'movie' | 'tv' | string,
    progress: input.progress,
    genres: Array.isArray(input.genres) ? input.genres.slice(0, 6) : [],
    posterPath: input.posterPath ?? null,
    releaseYear: input.releaseYear ?? null,
    updatedAt: Date.now(),
  };
};

const deriveTopGenres = (entries: any[]) => {
  const counts = new Map<number, number>();
  entries.forEach((entry) => {
    (entry.genres ?? []).forEach((genre: number) => {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([genre]) => genre);
};

export async function syncMovieMatchProfile({
  userId,
  profileId = 'default',
  profileName,
  avatarColor,
  photoURL,
  entry,
}: SyncArgs) {
  try {
    const docId = `${userId}__${profileId}`;
    const ref = doc(firestore, 'movieMatchProfiles', docId);
    const snapshot = await getDoc(ref);
    const existingEntries: any[] = snapshot.exists() ? (snapshot.data()?.entries ?? []) : [];
    const normalized = sanitizeEntry(entry);
    const filtered = existingEntries.filter((item) => item.tmdbId !== normalized.tmdbId);
    const nextEntries = [normalized, ...filtered].slice(0, ENTRY_LIMIT);
    const topGenres = deriveTopGenres(nextEntries);
    const movieCount = nextEntries.filter((item) => (item.mediaType ?? 'movie') === 'movie').length;
    const showCount = nextEntries.filter((item) => (item.mediaType ?? 'movie') === 'tv').length;

    await setDoc(
      ref,
      {
        userId,
        profileId,
        profileName: profileName ?? 'Movie fan',
        avatarColor: avatarColor ?? null,
        photoURL: photoURL ?? null,
        entries: nextEntries,
        topGenres,
        movieCount,
        showCount,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn('[movieMatchSync] Failed to sync movie match profile', err);
  }
}

