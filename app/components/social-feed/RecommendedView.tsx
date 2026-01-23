import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import { getPersistedCache, setPersistedCache } from '@/lib/persistedCache';

import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../../../constants/api';
import { authPromise, firestore } from '../../../constants/firebase';
import { getProfileScopedKey } from '../../../lib/profileStorage';
import type { Media } from '../../../types';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';

type RankedRecommendation = Media & {
  score: number;
  reason: string;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const toTitle = (m: Media) => m.title || m.name || 'Untitled';

const stableMediaKey = (m: Media) => `${m.media_type ?? 'movie'}:${m.id}`;

const buildPreferenceWeights = (continueWatching: Media[], myList: Media[]) => {
  const weights = new Map<number, number>();

  const add = (genreId: number, value: number) => {
    if (!Number.isFinite(genreId)) return;
    weights.set(genreId, (weights.get(genreId) ?? 0) + value);
  };

  const addFromList = (
    items: Media[],
    baseWeight: number,
    opts?: { progressBoost?: boolean },
  ) => {
    const count = Math.min(items.length, 14);
    for (let idx = 0; idx < count; idx++) {
      const item = items[idx];
      const genres = (item.genre_ids || []) as number[];
      if (!genres.length) continue;

      const recency = 1 - idx / Math.max(1, count) * 0.55;
      const progress = item.watchProgress?.progress;
      const progressIsMid =
        typeof progress === 'number' && progress >= 0.05 && progress <= 0.95;
      const progressFactor = opts?.progressBoost && progressIsMid ? 1.25 : 1;
      const rating = typeof item.vote_average === 'number' ? item.vote_average : 0;
      const ratingFactor = clamp(0.9 + rating / 20, 0.9, 1.35);
      const weight = baseWeight * recency * progressFactor * ratingFactor;
      genres.forEach((genreId) => add(genreId, weight));
    }
  };

  addFromList(continueWatching, 2.2, { progressBoost: true });
  addFromList(myList, 1.6);

  const sorted = [...weights.entries()].sort((a, b) => b[1] - a[1]);
  const topGenreIds = sorted.slice(0, 6).map(([id]) => id);
  return { weights, topGenreIds };
};

const scoreCandidate = (candidate: Media, weights: Map<number, number>) => {
  const genres = (candidate.genre_ids || []) as number[];
  if (!genres.length || weights.size === 0) return 0;
  let raw = 0;
  genres.forEach((g) => {
    raw += weights.get(g) ?? 0;
  });
  const max = Math.max(...[...weights.values()]);
  if (!Number.isFinite(max) || max <= 0) return 0;
  // normalize: more matching genres + stronger preferences => higher score
  const normalized = (raw / (max * 3.2)) * 100;
  return clamp(Math.round(normalized), 0, 100);
};

export default function RecommendedView() {
  const router = useRouter();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<RankedRecommendation[]>([]);

  const load = useCallback(async () => {
    setError(null);

    try {
      const [watchKey, myListKey] = await Promise.all([
        getProfileScopedKey('watchHistory'),
        getProfileScopedKey('myList'),
      ]);

      const cacheKey = `__movieflix_recommended_v1:${watchKey}:${myListKey}`;
      const cached = await getPersistedCache<RankedRecommendation[]>(cacheKey, { maxAgeMs: 2 * 60 * 60 * 1000 });
      if (cached?.value?.length) {
        setRecommendations(cached.value);
        setLoading(false);
        // If cache is still fresh, don't hit network.
        return;
      }

      setLoading(true);

      const [watchRaw, myListRaw] = await Promise.all([
        AsyncStorage.getItem(watchKey).catch(() => null),
        AsyncStorage.getItem(myListKey).catch(() => null),
      ]);

      const mergedByKey = new Map<string, Media>();

      const continueWatchingLocal: Media[] = watchRaw ? JSON.parse(watchRaw) : [];
      continueWatchingLocal.forEach((entry) => {
        const mediaType = String((entry as any)?.media_type || (entry as any)?.mediaType || 'movie');
        mergedByKey.set(`${mediaType}:${String(entry.id)}`, entry);
      });

      try {
        const auth = await authPromise;
        const uid = auth?.currentUser?.uid;
        if (uid) {
          const ref = collection(firestore, 'users', uid, 'watchHistory');
          const q = query(ref, orderBy('updatedAtMs', 'desc'), limit(80));
          const snap = await getDocs(q);

          snap.docs.forEach((docSnap) => {
            const data = docSnap.data() as any;
            if (data?.completed === true) return;
            const tmdbId = data?.tmdbId;
            if (!tmdbId) return;
            const mediaType = String(data?.mediaType || 'movie');
            const key = `${mediaType}:${String(tmdbId)}`;

            const existing = mergedByKey.get(key);
            const existingTs = existing?.watchProgress?.updatedAt ?? 0;
            const incomingTs = data?.watchProgress?.updatedAtMs ?? data?.updatedAtMs ?? 0;
            if (existing && existingTs >= incomingTs) return;

            mergedByKey.set(key, {
              id: tmdbId,
              title: data?.title ?? undefined,
              name: data?.title ?? undefined,
              media_type: mediaType,
              poster_path: data?.posterPath ?? undefined,
              backdrop_path: data?.backdropPath ?? undefined,
              genre_ids: Array.isArray(data?.genreIds) ? data.genreIds : undefined,
              watchProgress: {
                positionMillis: data?.watchProgress?.positionMillis ?? 0,
                durationMillis: data?.watchProgress?.durationMillis ?? 0,
                progress: data?.watchProgress?.progress ?? 0,
                updatedAt: incomingTs || Date.now(),
              },
            } as Media);
          });
        }
      } catch {
        // best-effort only
      }

      const continueWatching: Media[] = [...mergedByKey.values()]
        .filter((entry) => (entry.watchProgress?.progress ?? 0) < 0.985)
        .sort((a, b) => (b.watchProgress?.updatedAt ?? 0) - (a.watchProgress?.updatedAt ?? 0))
        .slice(0, 40);
      const myList: Media[] = myListRaw ? JSON.parse(myListRaw) : [];

      const { weights, topGenreIds } = buildPreferenceWeights(continueWatching, myList);
      const seedIds = new Set<number>([
        ...continueWatching.map((m) => m.id),
        ...myList.map((m) => m.id),
      ]);

      const fetchCandidates = async (): Promise<Media[]> => {
        // If we have no profile signals, fall back to trending.
        if (!topGenreIds.length) {
          const res = await fetch(`${API_BASE_URL}/trending/movie/week?api_key=${API_KEY}`);
          const json = await res.json();
          return (json?.results || []) as Media[];
        }

        const genreOr = encodeURIComponent(topGenreIds.join('|'));
        const base = `${API_BASE_URL}/discover/movie?api_key=${API_KEY}&sort_by=popularity.desc&include_adult=false&with_genres=${genreOr}`;
        const [p1, p2] = await Promise.all([
          fetch(`${base}&page=1`).then((r) => r.json()).catch(() => null),
          fetch(`${base}&page=2`).then((r) => r.json()).catch(() => null),
        ]);
        const all = [...((p1?.results || []) as Media[]), ...((p2?.results || []) as Media[])];
        return all;
      };

      const candidatesRaw = await fetchCandidates();
      const dedup = new Map<string, Media>();
      candidatesRaw.forEach((m) => {
        if (!m || typeof m.id !== 'number') return;
        if (seedIds.has(m.id)) return;
        if (!m.poster_path) return;
        dedup.set(stableMediaKey(m), { ...m, media_type: m.media_type ?? 'movie' });
      });

      const ranked = [...dedup.values()]
        .map((m) => {
          const score = scoreCandidate(m, weights);
          const rating = typeof m.vote_average === 'number' ? m.vote_average : 0;
          const blended = clamp(Math.round(score * 0.75 + rating * 5), 0, 100);
          return {
            ...m,
            score: blended,
            reason:
              topGenreIds.length > 0
                ? 'Based on Continue Watching + My List'
                : 'Trending now',
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 24);

      setRecommendations(ranked);
      void setPersistedCache(cacheKey, ranked);
    } catch (e: any) {
      setRecommendations([]);
      setError(e?.message || 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const headerCopy = useMemo(() => {
    if (loading) return { title: 'Recommended', subtitle: 'Tuning your picks…' };
    if (error) return { title: 'Recommended', subtitle: 'Could not load picks' };
    if (!recommendations.length)
      return { title: 'Recommended', subtitle: 'Add items to Continue Watching or My List' };
    return { title: 'Your Picks', subtitle: 'Based on Continue Watching + My List' };
  }, [error, loading, recommendations.length]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(255, 75, 75, 0.15)', 'rgba(255, 75, 75, 0.05)']}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{headerCopy.title}</Text>
          <Text style={styles.subtitle}>{headerCopy.subtitle}</Text>
        </View>

        {error ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>Loading recommendations…</Text>
          </View>
        ) : recommendations.length === 0 ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>
              Start watching something or add a few titles to My List to personalize this.
            </Text>
          </View>
        ) : (
          recommendations.map((movie) => (
            <TouchableOpacity
              key={stableMediaKey(movie)}
              style={styles.movieCard}
              activeOpacity={0.9}
              onPress={() =>
                deferNav(() => router.push(`/details/${movie.id}?mediaType=${movie.media_type || 'movie'}`))
              }
            >
              <BlurView intensity={30} tint="dark" style={styles.cardContent}>
                <Image
                  source={{ uri: `${IMAGE_BASE_URL}${movie.poster_path}` }}
                  style={styles.poster}
                />

                <View style={styles.movieInfo}>
                  <Text style={styles.movieTitle} numberOfLines={1}>
                    {toTitle(movie)}
                  </Text>
                  <Text style={styles.movieGenre} numberOfLines={1}>
                    {movie.reason}
                  </Text>
                  <View style={styles.ratingContainer}>
                    <Ionicons name="star" size={16} color="#FFD700" />
                    <Text style={styles.rating}>
                      {typeof movie.vote_average === 'number'
                        ? movie.vote_average.toFixed(1)
                        : '—'}
                    </Text>
                  </View>
                </View>

                <View style={styles.matchContainer}>
                  <Text style={styles.matchPercentage}>{movie.score}%</Text>
                  <Text style={styles.matchLabel}>match</Text>
                </View>
              </BlurView>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  movieCard: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 75, 75, 0.3)',
  },
  cardContent: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  poster: {
    width: 56,
    height: 84,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  movieInfo: {
    flex: 1,
  },
  movieTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  movieGenre: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    marginLeft: 4,
    color: '#FFD700',
    fontWeight: '600',
  },
  matchContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 75, 75, 0.15)',
    padding: 12,
    borderRadius: 12,
    marginLeft: 12,
  },
  matchPercentage: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ff4b4b',
  },
  matchLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  stateBox: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  stateText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 20,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 75, 75, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 75, 75, 0.35)',
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
  },
});
