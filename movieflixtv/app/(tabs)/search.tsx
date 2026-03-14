import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  Animated,
  Easing,
} from 'react-native';

import { API_BASE_URL, API_KEY } from '@/constants/api';
import { getAccentFromPosterPath } from '@/constants/theme';
import type { Media } from '@/types';
import { useTvAccent } from '../components/TvAccentContext';
import TvGlassPanel from '../components/TvGlassPanel';
import TvPosterCard from '../components/TvPosterCard';
import { TvFocusable } from '../components/TvSpatialNavigation';
import TvVirtualKeyboard from '../components/TvVirtualKeyboard';
import NativeTvGlowView from '../components/NativeTvGlowView';
import { LiquidChipView, LiquidShimmer, LiquidGlassCard } from '../../components/app-components/LiquidNativeViews';

export default function SearchTv() {
  const router = useRouter();
  const { accentColor, setAccentColor } = useTvAccent();
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState<Media[]>([]);
  const [shows, setShows] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const listRef = useRef<FlatList<Media> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollIndexRef = useRef<number | null>(null);
  
  // Animation for search pulse
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const GRID_COLUMNS = 4;
  const CARD_WIDTH = 180;
  const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.5);
  const GRID_ROW_GAP = 20;
  const GRID_ROW_HEIGHT = CARD_HEIGHT + GRID_ROW_GAP;
  
  const getGridItemLayout = useCallback(
    (_: ArrayLike<Media> | null | undefined, index: number) => {
      const row = Math.floor(index / GRID_COLUMNS);
      return { length: GRID_ROW_HEIGHT, offset: GRID_ROW_HEIGHT * row, index };
    },
    [GRID_ROW_HEIGHT],
  );

  useEffect(() => {
    setAccentColor('#e50914');
    
    // Load search history
    const loadHistory = async () => {
      // Could use AsyncStorage here
    };
    loadHistory();
  }, [setAccentColor]);

  // Pulse animation when searching
  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [loading]);

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
            name: t.name ?? t.original_name ?? '',
            first_air_date: t.first_air_date ?? null,
          }));
          
          setMovies(movieResults);
          setShows(tvResults);
          setLoading(false);
        } catch (e: any) {
          if (e.name === 'AbortError') return;
          if (requestId !== requestIdRef.current) return;
          setLoading(false);
        }
      };
      run();
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [query]);

  const handleKeyPress = (value: string) => {
    if (value === 'DEL') {
      setQuery((prev) => prev.slice(0, -1));
      return;
    }
    if (value === 'CLEAR') {
      setQuery('');
      return;
    }
    setQuery((prev) => (prev + value).slice(0, 48));
  };

  const allResults = useMemo(() => {
    const results = [...movies, ...shows];
    return results;
  }, [movies, shows]);

  const queryHint = query.trim().length ? query : 'Search movies, shows, artists...';

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient colors={['#0a0c1a', '#030408']} style={StyleSheet.absoluteFill} />
        <NativeTvGlowView color={accentColor} style={StyleSheet.absoluteFill} />
        <View style={[styles.bgCircle, { top: -200, right: -200, backgroundColor: `${accentColor}15` }]} />
      </View>

      <View style={styles.shell}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text style={styles.headerSubtitle}>SEARCH</Text>
            <Text style={styles.headerTitle}>Find Anything</Text>
          </View>
          
          {/* Search Stats */}
          <View style={styles.statsContainer}>
            {!loading && allResults.length > 0 && (
              <>
                <LiquidChipView text={`${movies.length} Movies`} size="small" />
                <LiquidChipView text={`${shows.length} Shows`} size="small" />
              </>
            )}
          </View>
        </View>

        <View style={styles.mainContent}>
          <View style={styles.leftPane}>
            <TvGlassPanel accent={accentColor} native borderRadius={28} glowIntensity="subtle" style={styles.keyboardGlass}>
              <TvVirtualKeyboard onKeyPress={handleKeyPress} />
            </TvGlassPanel>
            
            {/* Search History */}
            {searchHistory.length > 0 && (
              <View style={styles.sideSection}>
                <Text style={styles.sideTitle}>Recent Searches</Text>
                <View style={styles.historyList}>
                  {searchHistory.slice(0, 5).map((term, i) => (
                    <TvFocusable
                      key={i}
                      onPress={() => setQuery(term)}
                      style={({ focused }: any) => [styles.historyItem, focused && styles.glassFocus]}
                    >
                      <TvGlassPanel accent={accentColor} native compact borderRadius={12} glowIntensity="subtle" style={styles.historyGlass}>
                        <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.5)" />
                        <Text style={styles.historyText}>{term}</Text>
                      </TvGlassPanel>
                    </TvFocusable>
                  ))}
                </View>
              </View>
            )}

            {/* Quick Categories */}
            <View style={styles.sideSection}>
              <Text style={styles.sideTitle}>Quick Search</Text>
              <View style={styles.quickSearchGrid}>
                {['Trending', 'Netflix', 'Action', 'Comedy', 'Drama', 'Horror'].map(cat => (
                  <LiquidChipView
                    key={cat}
                    text={cat}
                    size="medium"
                    onPress={() => setQuery(cat)}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.rightPane}>
            {/* Search Query Display */}
            <Animated.View style={[styles.queryDisplay, { transform: [{ scale: pulseAnim] }] }]}>
              <TvGlassPanel accent={accentColor} native borderRadius={20} glowIntensity={loading ? "strong" : "subtle"} style={styles.queryGlass}>
                <Ionicons name="search" size={28} color={loading ? accentColor : 'rgba(255,255,255,0.6)'} />
                <Text style={[styles.queryText, loading && { color: '#fff' }]}>{queryHint}</Text>
                {query.length > 0 && (
                  <TvFocusable onPress={() => setQuery('')} style={({ focused }: any) => [styles.clearBtn, focused && { backgroundColor: accentColor }]}>
                    <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.5)" />
                  </TvFocusable>
                )}
              </TvGlassPanel>
            </Animated.View>

            {loading ? (
              <View style={styles.loadingContainer}>
                {/* Shimmer Skeletons */}
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                  <View key={i} style={styles.shimmerCard}>
                    <LiquidShimmer width={CARD_WIDTH} height={CARD_HEIGHT} cornerRadius={16} />
                    <LiquidShimmer width={CARD_WIDTH * 0.8} height={20} cornerRadius={8} style={{ marginTop: 12 }} />
                    <LiquidShimmer width={CARD_WIDTH * 0.5} height={16} cornerRadius={8} style={{ marginTop: 8 }} />
                  </View>
                ))}
              </View>
            ) : allResults.length === 0 && query.length > 2 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={80} color="rgba(255,255,255,0.15)" />
                <Text style={styles.emptyTitle}>No results found</Text>
                <Text style={styles.emptyText}>Try different keywords or browse categories</Text>
              </View>
            ) : allResults.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="film-outline" size={80} color="rgba(255,255,255,0.15)" />
                <Text style={styles.emptyTitle}>Start Searching</Text>
                <Text style={styles.emptyText}>Use the keyboard to search for movies and shows</Text>
              </View>
            ) : (
              <FlatList
                ref={(r) => { listRef.current = r; }}
                data={allResults}
                keyExtractor={(it, idx) => `${it.id}-${it.media_type}-${idx}`}
                numColumns={GRID_COLUMNS}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.grid}
                getItemLayout={getGridItemLayout}
                showsVerticalScrollIndicator={false}
                renderItem={({ item, index }) => (
                  <TvPosterCard
                    item={item}
                    width={CARD_WIDTH}
                    onFocus={() => {
                      const newAccent = getAccentFromPosterPath(item.poster_path);
                      if (newAccent) setAccentColor(newAccent);
                      
                      if (lastScrollIndexRef.current === index) return;
                      lastScrollIndexRef.current = index;
                      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
                      scrollTimerRef.current = setTimeout(() => {
                        try { listRef.current?.scrollToIndex({ index, viewPosition: 0.25, animated: true }); } catch { }
                      }, 120);
                    }}
                    onPress={(selected) => {
                      const mediaType = selected.media_type || 'movie';
                      router.push(`/details/${selected.id}?mediaType=${mediaType}`);
                    }}
                  />
                )}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030408' },
  bgCircle: { position: 'absolute', width: 600, height: 600, borderRadius: 300, filter: 'blur(100px)' as any },
  shell: { flex: 1, paddingHorizontal: 50, paddingVertical: 35 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 25, gap: 20 },
  titleContainer: { marginRight: 20 },
  headerSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  headerTitle: { color: '#fff', fontSize: 38, fontWeight: '900' },
  statsContainer: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  mainContent: { flex: 1, flexDirection: 'row', gap: 35 },
  leftPane: { width: 580 },
  keyboardGlass: { height: 380, padding: 20 },
  sideSection: { marginTop: 20 },
  sideTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '900', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' },
  historyList: { gap: 8 },
  historyItem: { borderRadius: 12 },
  historyGlass: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  historyText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  quickSearchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  rightPane: { flex: 1 },
  queryDisplay: { marginBottom: 20 },
  queryGlass: { flexDirection: 'row', alignItems: 'center', height: 65, paddingHorizontal: 25, gap: 15 },
  queryText: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '600' },
  clearBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  glassFocus: { transform: [{ scale: 1.04 }], shadowColor: '#fff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 8 },
  loadingContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingVertical: 10 },
  shimmerCard: { marginBottom: 20 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15, minHeight: 400 },
  emptyTitle: { color: '#fff', fontSize: 28, fontWeight: '900' },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  grid: { paddingBottom: 80 },
  gridRow: { gap: GRID_ROW_GAP, justifyContent: 'flex-start' },
});
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

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

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
        <TvGlassPanel accent={accent} native style={styles.panel}>
          <View style={styles.panelInner}>
            <View style={styles.topBar}>
              <View style={styles.titleRow}>
                <Ionicons name="search" size={20} color="#fff" />
                <Text style={styles.title}>Search</Text>
              </View>

              <TvGlassPanel accent={accent} native compact borderRadius={999} glowIntensity="subtle" style={styles.searchPill}>
                <Ionicons name="search" size={16} color="rgba(255,255,255,0.82)" />
                <Text style={styles.searchText} numberOfLines={1}>
                  {queryHint}
                </Text>
              </TvGlassPanel>

              <TvFocusable
                onPress={() => setQuery('')}
                isTVSelectable={true}
                accessibilityLabel="Clear search"
                style={({ focused }: any) => [styles.clearBtnWrap, focused ? styles.clearBtnFocused : null]}
              >
                <TvGlassPanel accent={accent} native compact borderRadius={14} glowIntensity="subtle" style={styles.clearBtn}>
                  <Text style={styles.clearText}>Clear</Text>
                </TvGlassPanel>
              </TvFocusable>
            </View>

            <View style={styles.columns}>
              <TvGlassPanel accent={accent} native borderRadius={24} glowIntensity="subtle" style={styles.leftPane}>
                <TvVirtualKeyboard onKeyPress={handleKeyPress} />
                <Text style={styles.tip}>Tip: press Delete to erase, Clear to reset.</Text>
              </TvGlassPanel>

              <View style={styles.rightPane}>
                {loading ? (
                  <View style={styles.center}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.centerText}>Searching…</Text>
                  </View>
                ) : query.trim().length <= 2 ? (
                  <View style={styles.center}>
                    <Ionicons name="search-outline" size={48} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.centerTitle}>Start typing</Text>
                    <Text style={styles.centerText}>Use the keyboard to enter a title.</Text>
                  </View>
                ) : combined.length === 0 ? (
                  <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.centerTitle}>No results</Text>
                    <Text style={styles.centerText}>Try a different spelling.</Text>
                    <TvFocusable
                      onPress={() => setQuery('')}
                      tvPreferredFocus
                      isTVSelectable={true}
                      accessibilityLabel="Clear and try again"
                      style={({ focused }: any) => [styles.retryBtnWrap, focused && styles.retryBtnFocused]}
                    >
                      <TvGlassPanel accent={accent} native compact borderRadius={16} glowIntensity="medium" style={styles.retryBtn}>
                        <Ionicons name="refresh-outline" size={18} color="#fff" />
                        <Text style={styles.retryBtnText}>Clear and try again</Text>
                      </TvGlassPanel>
                    </TvFocusable>
                  </View>
                ) : (
                  <FlatList
                    ref={(r) => {
                      listRef.current = r;
                    }}
                    data={combined}
                    keyExtractor={(it, idx) => `${it.media_type ?? 'm'}:${it.id ?? idx}`}
                    numColumns={GRID_COLUMNS}
                    columnWrapperStyle={styles.gridRow}
                    contentContainerStyle={styles.grid}
                    getItemLayout={getGridItemLayout}
                    initialNumToRender={12}
                    maxToRenderPerBatch={12}
                    updateCellsBatchingPeriod={50}
                    windowSize={5}
                    removeClippedSubviews
                    renderItem={({ item, index }) => (
                      <TvPosterCard
                        item={item}
                        width={CARD_WIDTH}
                        onFocus={() => {
                          if (lastScrollIndexRef.current === index) return;
                          lastScrollIndexRef.current = index;

                          if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
                          scrollTimerRef.current = setTimeout(() => {
                            try {
                              listRef.current?.scrollToIndex({ index, viewPosition: 0.35, animated: false });
                            } catch {}
                          }, 60);
                        }}
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
  container: { flex: 1, backgroundColor: '#030408' },
  shell: { flex: 1, paddingLeft: 108, paddingRight: 40, paddingTop: 28, paddingBottom: 28, alignItems: 'center' },
  panel: { flex: 1, width: '100%', maxWidth: 1560 },
  panelInner: { flex: 1, padding: 22 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 8, paddingBottom: 18 },
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
  },
  searchText: { flex: 1, color: 'rgba(255,255,255,0.86)', fontSize: 13, fontWeight: '900' },
  columns: { flex: 1, flexDirection: 'row', gap: 18 },
  leftPane: {
    width: 560,
    borderRadius: 24,
    padding: 18,
  },
  clearBtnWrap: {
    borderRadius: 14,
  },
  clearBtn: {
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderColor: 'rgba(255,255,255,0.14)',
  clearBtnFocused: { transform: [{ scale: 1.03 }] },
  clearBtnFocused: { transform: [{ scale: 1.03 }], borderColor: '#fff' },
  clearText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  tip: { marginTop: 12, color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 12 },
  centerText: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '700' },
  retryBtnWrap: {
    borderRadius: 16,
    marginTop: 16,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
  },
  retryBtnFocused: {
    transform: [{ scale: 1.08 }],
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 10,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  grid: { paddingTop: 10, paddingBottom: 20 },
  gridRow: { gap: 14 },
});
