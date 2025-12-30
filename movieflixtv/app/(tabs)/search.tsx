import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { API_BASE_URL, API_KEY } from '@/constants/api';
import { getAccentFromPosterPath } from '@/constants/theme';
import type { Media } from '@/types';
import { useTvAccent } from '../components/TvAccentContext';
import TvGlassPanel from '../components/TvGlassPanel';
import TvPosterCard from '../components/TvPosterCard';
import TvVirtualKeyboard from '../components/TvVirtualKeyboard';

export default function SearchTv() {
  const router = useRouter();
  const { setAccentColor } = useTvAccent();
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState<Media[]>([]);
  const [shows, setShows] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    const q = query.trim();
    if (q.length <= 2) {
      requestIdRef.current += 1;
      setLoading(false);
      setMovies([]);
      setShows([]);
      return;
    }

    setLoading(true);
    const requestId = (requestIdRef.current += 1);

    debounceRef.current = setTimeout(() => {
      const run = async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const encoded = encodeURIComponent(q);
          const [movieRes, tvRes] = await Promise.all([
            fetch(`${API_BASE_URL}/search/movie?api_key=${API_KEY}&query=${encoded}`, {
              signal: controller.signal,
            }),
            fetch(`${API_BASE_URL}/search/tv?api_key=${API_KEY}&query=${encoded}`, {
              signal: controller.signal,
            }),
          ]);

          const movieJson = movieRes.ok ? await movieRes.json() : { results: [] };
          const tvJson = tvRes.ok ? await tvRes.json() : { results: [] };
          if (requestId !== requestIdRef.current) return;

          const movieResults: Media[] = (movieJson.results || []).map((m: any) => ({
            ...m,
            media_type: 'movie',
            title: m.title ?? m.original_title ?? '',
            release_date: m.release_date ?? null,
          }));
          const tvResults: Media[] = (tvJson.results || []).map((t: any) => ({
            ...t,
            media_type: 'tv',
            title: t.name ?? t.original_name ?? '',
            release_date: t.first_air_date ?? null,
          }));

          setMovies(movieResults.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0)));
          setShows(tvResults.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0)));
        } catch {
          if (requestId !== requestIdRef.current) return;
          setMovies([]);
          setShows([]);
        } finally {
          if (requestId === requestIdRef.current) setLoading(false);
        }
      };

      void run();
    }, 320);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query]);

  const accent = useMemo(
    () => getAccentFromPosterPath(movies[0]?.poster_path || shows[0]?.poster_path) ?? '#e50914',
    [movies, shows],
  );

  useEffect(() => {
    setAccentColor(accent);
  }, [accent, setAccentColor]);

  const combined = useMemo(() => {
    // Interleave so the grid feels mixed.
    const out: Media[] = [];
    const max = Math.max(movies.length, shows.length);
    for (let i = 0; i < max; i++) {
      if (movies[i]) out.push(movies[i]);
      if (shows[i]) out.push(shows[i]);
    }
    return out;
  }, [movies, shows]);

  const handleKeyPress = (value: string) => {
    if (value === 'DEL') {
      setQuery((prev) => prev.slice(0, -1));
      return;
    }
    if (value === 'CLEAR') {
      setQuery('');
      return;
    }
    setQuery((prev) => {
      const next = prev + value;
      return next.length > 48 ? next.slice(0, 48) : next;
    });
  };

  const queryHint = query.trim().length ? query : 'Search movies & TV shows…';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[accent, '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.shell}>
        <TvGlassPanel accent={accent} style={styles.panel}>
          <View style={styles.panelInner}>
            <View style={styles.topBar}>
              <View style={styles.titleRow}>
                <Ionicons name="search" size={20} color="#fff" />
                <Text style={styles.title}>Search</Text>
              </View>

              <View style={styles.searchPill}>
                <Ionicons name="search" size={16} color="rgba(255,255,255,0.82)" />
                <Text style={styles.searchText} numberOfLines={1}>
                  {queryHint}
                </Text>
              </View>

              <Pressable
                onPress={() => setQuery('')}
                style={({ focused }: any) => [styles.clearBtn, focused ? styles.clearBtnFocused : null]}
              >
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            </View>

            <View style={styles.columns}>
              <View style={styles.leftPane}>
                <TvVirtualKeyboard onKeyPress={handleKeyPress} />
                <Text style={styles.tip}>Tip: press Delete to erase, Clear to reset.</Text>
              </View>

              <View style={styles.rightPane}>
                {loading ? (
                  <View style={styles.center}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.centerText}>Searching…</Text>
                  </View>
                ) : query.trim().length <= 2 ? (
                  <View style={styles.center}>
                    <Text style={styles.centerTitle}>Start typing</Text>
                    <Text style={styles.centerText}>Use the keyboard to enter a title.</Text>
                  </View>
                ) : combined.length === 0 ? (
                  <View style={styles.center}>
                    <Text style={styles.centerTitle}>No results</Text>
                    <Text style={styles.centerText}>Try a different spelling.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={combined}
                    keyExtractor={(it, idx) => `${it.media_type ?? 'm'}:${it.id ?? idx}`}
                    numColumns={4}
                    columnWrapperStyle={styles.gridRow}
                    contentContainerStyle={styles.grid}
                    renderItem={({ item }) => (
                      <TvPosterCard
                        item={item}
                        width={170}
                        onPress={(selected) =>
                          router.push(`/details/${selected.id}?mediaType=${selected.media_type || 'movie'}`)
                        }
                      />
                    )}
                  />
                )}
              </View>
            </View>
          </View>
        </TvGlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  shell: { flex: 1, paddingLeft: 0, paddingRight: 34, paddingTop: 22, paddingBottom: 22, alignItems: 'center' },
  panel: { flex: 1, width: '100%', maxWidth: 1520 },
  panelInner: { flex: 1, padding: 18 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6, paddingBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  searchText: { flex: 1, color: 'rgba(255,255,255,0.86)', fontSize: 13, fontWeight: '900' },
  columns: { flex: 1, flexDirection: 'row', gap: 18 },
  leftPane: {
    width: 560,
    borderRadius: 24,
    padding: 18,
    backgroundColor: 'rgba(0,0,0,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  rightPane: { flex: 1 },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  clearBtnFocused: { transform: [{ scale: 1.03 }], borderColor: '#fff' },
  clearText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  tip: { marginTop: 12, color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 8 },
  centerText: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '700' },
  grid: { paddingTop: 10, paddingBottom: 20 },
  gridRow: { gap: 14 },
});
