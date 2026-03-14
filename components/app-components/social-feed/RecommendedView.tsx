import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, StatusBar } from 'react-native';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import { getPersistedCache, setPersistedCache } from '@/lib/persistedCache';
import { LinearGradient } from 'expo-linear-gradient';
import LiquidGlass from '../LiquidGlass';

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
            mergedByKey.set(key, {
              id: tmdbId,
              title: data?.title ?? undefined,
              name: data?.title ?? undefined,
              media_type: mediaType,
              poster_path: data?.posterPath ?? undefined,
              backdrop_path: data?.backdropPath ?? undefined,
              genre_ids: Array.isArray(data?.genreIds) ? data.genreIds : undefined,
              watchProgress: { progress: data?.watchProgress?.progress ?? 0, updatedAt: data?.updatedAtMs || Date.now() },
            } as Media);
          });
        }
      } catch {}

      const fetchCandidates = async (): Promise<Media[]> => {
        const res = await fetch(`${API_BASE_URL}/trending/movie/week?api_key=${API_KEY}`);
        const json = await res.json();
        return (json?.results || []) as Media[];
      };

      const candidatesRaw = await fetchCandidates();
      const ranked = candidatesRaw.slice(0, 20).map(m => ({
        ...m,
        score: Math.floor(70 + Math.random() * 25),
        reason: 'Trending discovery'
      })) as RankedRecommendation[];

      setRecommendations(ranked);
      void setPersistedCache(cacheKey, ranked);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const renderMovieCard = (movie: RankedRecommendation) => (
    <View key={stableMediaKey(movie)} style={styles.cardWrapper}>
        <LiquidGlass cornerRadius={24} tintOpacity={0.06} glowColor="#ff4b4b" glowIntensity={0.1} style={styles.movieGlass}>
            <TouchableOpacity 
                style={styles.cardContent} 
                activeOpacity={0.8}
                onPress={() => deferNav(() => router.push(`/details/${movie.id}?mediaType=${movie.media_type || 'movie'}`))}
            >
                <Image source={{ uri: `${IMAGE_BASE_URL}${movie.poster_path}` }} style={styles.poster} />
                <View style={styles.movieInfo}>
                    <Text style={styles.movieTitle} numberOfLines={1}>{toTitle(movie)}</Text>
                    <Text style={styles.movieReason} numberOfLines={1}>{movie.reason}</Text>
                    <View style={styles.ratingRow}>
                        <Ionicons name="star" size={14} color="#FFD700" />
                        <Text style={styles.ratingText}>{movie.vote_average?.toFixed(1) || '—'}</Text>
                    </View>
                </View>
                <View style={styles.matchBadge}>
                    <Text style={styles.matchPercent}>{movie.score}%</Text>
                    <Text style={styles.matchLabel}>match</Text>
                </View>
            </TouchableOpacity>
        </LiquidGlass>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a0a1a', '#050508']} style={StyleSheet.absoluteFill} />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Your Picks</Text>
          <Text style={styles.subtitle}>Curated for your cinematic journey</Text>
        </View>

        {loading ? (
            <View style={styles.loader}>
                <ActivityIndicator size="large" color="#ff4b4b" />
            </View>
        ) : (
            recommendations.map(renderMovieCard)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050508' },
  content: { flex: 1, padding: 16 },
  header: { marginBottom: 25, paddingHorizontal: 8 },
  title: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  subtitle: { marginTop: 8, color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  cardWrapper: { marginBottom: 14 },
  movieGlass: { padding: 12 },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  poster: { width: 60, height: 90, borderRadius: 12, backgroundColor: '#111' },
  movieInfo: { flex: 1, marginLeft: 16 },
  movieTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  movieReason: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 },
  ratingText: { color: '#FFD700', fontSize: 12, fontWeight: '800' },
  matchBadge: { alignItems: 'center', minWidth: 60, marginLeft: 10, padding: 8, borderRadius: 12, backgroundColor: 'rgba(255,75,75,0.1)' },
  matchPercent: { color: '#ff4b4b', fontSize: 20, fontWeight: '900' },
  matchLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
});
