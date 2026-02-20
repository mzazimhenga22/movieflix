import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { firestore } from '../../constants/firebase';
import { useUser } from '../../hooks/use-user';
import type { Media } from '../../types';
import {
  buildProfileScopedKey,
  getStoredActiveProfile,
  type StoredProfile,
} from '../profileStorage';

/* -------------------------------------------------------------------------- */
/*                             Types & Constants                              */
/* -------------------------------------------------------------------------- */

export type RemoteEntry = {
  tmdbId?: number | string;
  title?: string;
  mediaType?: string;
  genres?: number[];
  progress?: number;
  posterPath?: string | null;
  releaseYear?: string | number | null;
  updatedAt?: number;
  id?: string | number;
};

export type RemoteMatchProfile = {
  id: string;
  userId?: string;
  profileId?: string;
  profileName?: string;
  avatarColor?: string;
  photoURL?: string | null;
  entries?: RemoteEntry[];
  topGenres?: number[];
  movieCount?: number;
  showCount?: number;
};

export type MatchVibe = 'cinephile' | 'bingewatcher' | 'trendsetter';

export type ComputedMatch = {
  id: string;
  profileName: string;
  avatarColor?: string;
  photoURL?: string | null;
  matchScore: number;
  sharedTitles: string[];
  sharedGenres: number[];
  rankLabel: 'Top 5' | 'Top 10' | 'Rising';
  bestPick?: RemoteEntry;
  vibe: MatchVibe;
};

export type MovieMatchTotals = {
  total: number;
  qualified: number;
};

// Lower the qualification threshold slightly to increase the chance of finding overlaps,
// especially for users with short watch histories.
export const MIN_PROGRESS = 0.55;
const MIN_MATCHING_PROGRESS = 0.35;
const MIN_MATCH_SCORE = 12;

const GENRE_LABELS: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Doc',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

export const vibeLabel: Record<MatchVibe, string> = {
  cinephile: 'Cinephile',
  bingewatcher: 'Binge watcher',
  trendsetter: 'Trendsetter',
};

export const getGenreName = (id: number) => GENRE_LABELS[id] ?? `Genre ${id}`;

export const formatSharedTitles = (titles: string[]) => {
  if (!titles.length) return 'Shared picks ready';
  if (titles.length === 1) return `Both loved ${titles[0]}`;
  if (titles.length === 2) return `Shared: ${titles.join(' & ')}`;
  return `Shared: ${titles.slice(0, 2).join(', ')} +${titles.length - 2}`;
};

const deriveVibe = (
  profile: RemoteMatchProfile,
  totalEntries: number,
): MatchVibe => {
  const movies = profile.movieCount ?? 0;
  const shows = profile.showCount ?? 0;
  if (movies >= shows * 1.5) return 'cinephile';
  if (shows > movies) return 'bingewatcher';
  return totalEntries > 20 ? 'trendsetter' : 'cinephile';
};

/* -------------------------------------------------------------------------- */
/*                            Matching calculation                            */
/* -------------------------------------------------------------------------- */

export const computeMatches = (
  localEntries: Media[],
  remoteProfiles: RemoteMatchProfile[],
  currentUserId?: string,
  currentProfileId?: string,
): ComputedMatch[] => {
  if (localEntries.length === 0) return [];

  const getLocalKey = (entry: Media) => {
    const mediaType = String((entry as any)?.media_type || (entry as any)?.mediaType || 'movie');
    const id = entry.id ?? (entry as any)?.tmdbId ?? entry.title ?? entry.name;
    return `${mediaType}:${String(id)}`;
  };
  const getRemoteKey = (entry: RemoteEntry) => {
    const mediaType = String(entry.mediaType || 'movie');
    const id = entry.tmdbId ?? entry.title ?? entry.id;
    return `${mediaType}:${String(id)}`;
  };

  const localMetaById = new Map<
    string,
    { updatedAtMs: number; progress: number; title: string | null }
  >();
  const localIds = new Set(
    localEntries.map((entry) => getLocalKey(entry)),
  );
  localEntries.forEach((entry) => {
    const key = getLocalKey(entry);
    localMetaById.set(key, {
      updatedAtMs: entry.watchProgress?.updatedAt ?? 0,
      progress: entry.watchProgress?.progress ?? 0,
      title: entry.title || entry.name || null,
    });
  });
  const localGenres = new Set<number>();
  localEntries.forEach((entry) => {
    (entry.genre_ids ?? []).forEach((genre) => {
      if (typeof genre === 'number') {
        localGenres.add(genre);
      }
    });
  });
  const baseCount = Math.max(localIds.size, 1);

  const matches: ComputedMatch[] = [];

  remoteProfiles.forEach((profile) => {
    if (!Array.isArray(profile.entries) || profile.entries.length === 0) return;
    if (currentUserId && profile.userId === currentUserId) {
      if (!profile.profileId || profile.profileId === currentProfileId) {
        return;
      }
    }
    const remoteQualified = profile.entries.filter((entry) => (entry.progress ?? 1) >= MIN_PROGRESS);
    if (!remoteQualified.length) return;

    const remoteIds = new Set(remoteQualified.map((entry) => getRemoteKey(entry)));
    const remoteMetaById = new Map<string, { updatedAtMs: number; title: string }>();
    remoteQualified.forEach((entry) => {
      remoteMetaById.set(getRemoteKey(entry), {
        updatedAtMs: entry.updatedAt ?? 0,
        title: entry.title || 'Untitled',
      });
    });
    const sharedTitleIds = [...localIds].filter((id) => remoteIds.has(id));

    const remoteGenres = new Set<number>();
    remoteQualified.forEach((entry) => {
      (entry.genres ?? []).forEach((genre) => {
        if (typeof genre === 'number') {
          remoteGenres.add(genre);
        }
      });
    });
    const sharedGenreIds = [...localGenres].filter((genre) => remoteGenres.has(genre));

    if (!sharedTitleIds.length && !sharedGenreIds.length) return;

    // Use the smaller list as the denominator to avoid penalizing users with short histories.
    const titleOverlap =
      sharedTitleIds.length / Math.max(1, Math.min(baseCount, remoteIds.size || 1));
    const genreOverlap =
      sharedGenreIds.length / Math.max(1, Math.min(localGenres.size || 1, remoteGenres.size || 1));

    const volumeBonus = Math.min(0.16, (remoteQualified.length || 1) / 70);

    const now = Date.now();
    const recencyWindowMs = 21 * 24 * 60 * 60 * 1000;
    const recencyAvg = sharedTitleIds.length
      ?
        sharedTitleIds
          .map((id) => {
            const localTs = localMetaById.get(id)?.updatedAtMs ?? 0;
            const remoteTs = remoteMetaById.get(id)?.updatedAtMs ?? 0;
            const ts = Math.max(localTs, remoteTs);
            if (!ts) return 0;
            const age = Math.max(0, now - ts);
            return 1 - Math.min(1, age / recencyWindowMs);
          })
          .reduce((a, b) => a + b, 0) / sharedTitleIds.length
      : 0;
    const recencyBoost = Math.min(0.12, recencyAvg * 0.12);

    const rawScore = Math.min(
      1,
      titleOverlap * 0.55 + genreOverlap * 0.33 + volumeBonus + recencyBoost,
    );
    const matchScore = Math.round(rawScore * 100);
    if (matchScore < MIN_MATCH_SCORE) return;

    const sharedTitles = remoteQualified
      .filter((entry) => sharedTitleIds.includes(getRemoteKey(entry)))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .map((entry) => entry.title || 'Untitled');

    const bestPick = [...remoteQualified]
      .filter((entry) => sharedTitleIds.includes(getRemoteKey(entry)))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];

    matches.push({
      id: profile.id,
      profileName: profile.profileName || 'Movie lover',
      avatarColor: profile.avatarColor,
      photoURL: profile.photoURL ?? null,
      matchScore,
      sharedTitles,
      sharedGenres: sharedGenreIds,
      bestPick,
      rankLabel: 'Rising',
      vibe: deriveVibe(profile, remoteQualified.length),
    });
  });

  matches.sort((a, b) => b.matchScore - a.matchScore);
  return matches.map((match, index) => ({
    ...match,
    rankLabel: index < 5 ? 'Top 5' : index < 10 ? 'Top 10' : 'Rising',
  }));
};

/* -------------------------------------------------------------------------- */
/*                              Shared data hook                              */
/* -------------------------------------------------------------------------- */

export function useMovieMatchData() {
  const { user } = useUser();
  const [profileMeta, setProfileMeta] = useState<StoredProfile | null>(null);
  const [localMatching, setLocalMatching] = useState<Media[]>([]);
  const [localQualified, setLocalQualified] = useState<Media[]>([]);
  const [localTotals, setLocalTotals] = useState<MovieMatchTotals>({ total: 0, qualified: 0 });
  const [activeProfileId, setActiveProfileId] = useState('default');
  const [remoteProfiles, setRemoteProfiles] = useState<RemoteMatchProfile[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [localLoading, setLocalLoading] = useState(true);
  const [errorCopy, setErrorCopy] = useState<string | null>(null);

  const refreshLocalHistory = useCallback(async () => {
    setLocalLoading(true);
    try {
      const profile = await getStoredActiveProfile();
      setProfileMeta(profile ?? null);
      const key = buildProfileScopedKey('watchHistory', profile?.id ?? undefined);
      const stored = await AsyncStorage.getItem(key);
      const parsed: Media[] = stored ? JSON.parse(stored) : [];
      const mergedById = new Map<string, Media>();
      parsed.forEach((entry) => {
        const mediaType = String((entry as any)?.media_type || (entry as any)?.mediaType || 'movie');
        const id = entry?.id ?? (entry as any)?.tmdbId ?? entry?.title ?? entry?.name;
        if (id == null) return;
        mergedById.set(`${mediaType}:${String(id)}`, entry);
      });

      if (user?.uid) {
        try {
          const profileId = profile?.id ?? 'default';
          const ref = collection(firestore, 'users', user.uid, 'watchHistory');
          const q = query(ref, orderBy('updatedAtMs', 'desc'), limit(140));
          const snap = await getDocs(q);
          snap.docs.forEach((docSnap) => {
            const data = docSnap.data() as any;
            if (data?.profileId && data.profileId !== profileId) return;
            const tmdbId = data?.tmdbId;
            if (!tmdbId) return;
            const mediaType = (data?.mediaType || 'movie') as string;
            const key = `${String(mediaType)}:${String(tmdbId)}`;
            const existing = mergedById.get(key);
            const existingTs = existing?.watchProgress?.updatedAt ?? 0;
            const incomingTs = data?.watchProgress?.updatedAtMs ?? data?.updatedAtMs ?? 0;
            if (existing && existingTs >= incomingTs) return;

            mergedById.set(key, {
              id: tmdbId,
              title: data?.title ?? undefined,
              name: data?.title ?? undefined,
              media_type: mediaType,
              poster_path: data?.posterPath ?? undefined,
              backdrop_path: data?.backdropPath ?? undefined,
              genre_ids: Array.isArray(data?.genreIds) ? data.genreIds : undefined,
              vote_average: typeof data?.voteAverage === 'number' ? data.voteAverage : undefined,
              seasonNumber: typeof data?.seasonNumber === 'number' ? data.seasonNumber : undefined,
              episodeNumber: typeof data?.episodeNumber === 'number' ? data.episodeNumber : undefined,
              seasonTitle: typeof data?.seasonTitle === 'string' ? data.seasonTitle : undefined,
              watchProgress: {
                positionMillis: data?.watchProgress?.positionMillis ?? 0,
                durationMillis: data?.watchProgress?.durationMillis ?? 0,
                progress: data?.watchProgress?.progress ?? 0,
                updatedAt: incomingTs || Date.now(),
              },
            } as Media);
          });
        } catch (err) {
          console.warn('[MovieMatch] failed to load remote watch history', err);
        }
      }

      const merged = [...mergedById.values()];

      const matching = merged.filter((entry) => {
        const progress = entry.watchProgress?.progress ?? 0;
        return progress >= MIN_MATCHING_PROGRESS;
      });

      const qualified = merged.filter((entry) => {
        const progress = entry.watchProgress?.progress ?? 0;
        return progress >= MIN_PROGRESS && progress < 0.985;
      });
      setActiveProfileId(profile?.id ?? 'default');
      setLocalMatching(matching);
      setLocalQualified(qualified);
      setLocalTotals({ total: merged.length, qualified: qualified.length });
    } catch (err) {
      console.warn('[MovieMatch] failed to load local history', err);
      setLocalQualified([]);
      setLocalMatching([]);
      setLocalTotals({ total: 0, qualified: 0 });
    } finally {
      setLocalLoading(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      refreshLocalHistory();
    }, [refreshLocalHistory]),
  );

  useEffect(() => {
    const profilesRef = collection(firestore, 'movieMatchProfiles');
    const q = query(profilesRef, orderBy('updatedAt', 'desc'), limit(160));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            userId: data.userId,
            profileId: data.profileId,
            profileName: data.profileName,
            avatarColor: data.avatarColor,
            photoURL: data.photoURL,
            entries: Array.isArray(data.entries) ? data.entries : [],
            topGenres: data.topGenres,
            movieCount: data.movieCount,
            showCount: data.showCount,
          } as RemoteMatchProfile;
        });
        setRemoteProfiles(docs);
        setRemoteLoading(false);
        setErrorCopy(null);
      },
      (err) => {
        console.warn('[MovieMatch] failed to fetch profiles', err);
        setRemoteProfiles([]);
        setRemoteLoading(false);
        setErrorCopy('Unable to load community data right now.');
      },
    );

    return () => unsubscribe();
  }, []);

  const matches = useMemo(
    () => computeMatches(localMatching, remoteProfiles, user?.uid ?? undefined, activeProfileId),
    [localMatching, remoteProfiles, user?.uid, activeProfileId],
  );

  const viewerName = profileMeta?.name || user?.displayName || user?.email?.split('@')[0] || 'You';

  return {
    matches,
    heroMatch: matches[0] ?? null,
    localTotals,
    profileMeta,
    viewerName,
    loading: localLoading || remoteLoading,
    localLoading,
    remoteLoading,
    errorCopy,
    refreshLocalHistory,
  } as const;
}
