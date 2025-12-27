import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import {
  collection,
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

export const MIN_PROGRESS = 0.7;

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

  const localIds = new Set(
    localEntries.map((entry) => String(entry.id ?? entry.tmdbId ?? entry.title ?? entry.name)),
  );
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

    const remoteIds = new Set(
      remoteQualified.map((entry) => String(entry.tmdbId ?? entry.title ?? entry.id)),
    );
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

    const titleOverlap = sharedTitleIds.length / Math.max(baseCount, remoteIds.size || 1);
    const genreOverlap =
      sharedGenreIds.length / Math.max(localGenres.size || 1, remoteGenres.size || 1);
    const volumeBonus = Math.min(0.15, (remoteQualified.length || 1) / 60);
    const rawScore = Math.min(1, titleOverlap * 0.7 + genreOverlap * 0.3 + volumeBonus);
    const matchScore = Math.round(rawScore * 100);
    if (matchScore < 20) return;

    const sharedTitles = remoteQualified
      .filter((entry) => sharedTitleIds.includes(String(entry.tmdbId ?? entry.title ?? entry.id)))
      .map((entry) => entry.title || 'Untitled');
    const bestPick = remoteQualified.find((entry) =>
      sharedTitleIds.includes(String(entry.tmdbId ?? entry.title ?? entry.id)),
    );

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
      const qualified = parsed.filter((entry) => (entry.watchProgress?.progress ?? 0) >= MIN_PROGRESS);
      setActiveProfileId(profile?.id ?? 'default');
      setLocalQualified(qualified);
      setLocalTotals({ total: parsed.length, qualified: qualified.length });
    } catch (err) {
      console.warn('[MovieMatch] failed to load local history', err);
      setLocalQualified([]);
      setLocalTotals({ total: 0, qualified: 0 });
    } finally {
      setLocalLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshLocalHistory();
    }, [refreshLocalHistory]),
  );

  useEffect(() => {
    const profilesRef = collection(firestore, 'movieMatchProfiles');
    const q = query(profilesRef, orderBy('updatedAt', 'desc'), limit(80));

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
    () => computeMatches(localQualified, remoteProfiles, user?.uid ?? undefined, activeProfileId),
    [localQualified, remoteProfiles, user?.uid, activeProfileId],
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
