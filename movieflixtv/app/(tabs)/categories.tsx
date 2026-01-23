import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, FlatList, InteractionManager, Platform, StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL, API_KEY } from '@/constants/api';
import { getAccentFromPosterPath } from '@/constants/theme';
import type { Genre, Media } from '@/types';
import { useTvAccent } from '../components/TvAccentContext';
import TvGlassPanel from '../components/TvGlassPanel';
import TvPosterCard from '../components/TvPosterCard';
import { TvFocusable } from '../components/TvSpatialNavigation';
import AmbientGlow from '../components/AmbientGlow';
import { useRouter } from 'expo-router';

const GenreChip = memo(function GenreChip({
  item,
  active,
  onToggle,
  index,
}: {
  item: Genre;
  active: boolean;
  onToggle: (id: number) => void;
  index: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 70,
        useNativeDriver: true,
        delay: index * 40,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        delay: index * 40,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacityAnim, scaleAnim]);

  return (
    <Animated.View style={{ opacity: opacityAnim, transform: [{ scale: scaleAnim }] }}>
      <TvFocusable
        onPress={() => onToggle(item.id)}
        isTVSelectable={true}
        accessibilityLabel={item.name}
        style={({ focused }: any) => [
          styles.genreChip,
          active ? styles.genreChipActive : null,
          focused ? styles.genreChipFocused : null,
        ]}
      >
        {active && (
          <LinearGradient
            colors={['rgba(229,9,20,0.55)', 'rgba(229,9,20,0.25)']}
            style={[StyleSheet.absoluteFill, { borderRadius: 999 }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}
        <Text style={[styles.genreText, active ? styles.genreTextActive : null]}>
          {item.name}
        </Text>
      </TvFocusable>
    </Animated.View>
  );
});

export default function CategoriesTv() {
  const router = useRouter();
  const { setAccentColor } = useTvAccent();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [items, setItems] = useState<Media[]>([]);
  const [genresLoading, setGenresLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const gridRef = useRef<FlatList<Media> | null>(null);
  const gridScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGridScrollIndexRef = useRef<number | null>(null);

  const GRID_COLUMNS = 6;
  const CARD_WIDTH = 170;
  const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.5);
  const GRID_ROW_GAP = 14;
  const GRID_ROW_HEIGHT = CARD_HEIGHT + GRID_ROW_GAP;
  const getGridItemLayout = useCallback(
    (_: ArrayLike<Media> | null | undefined, index: number) => {
      const row = Math.floor(index / GRID_COLUMNS);
      return { length: GRID_ROW_HEIGHT, offset: GRID_ROW_HEIGHT * row, index };
    },
    [GRID_ROW_HEIGHT],
  );

  useEffect(() => {
    let alive = true;
    setGenresLoading(true);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const runFetch = () => {
      void fetch(`${API_BASE_URL}/genre/movie/list?api_key=${API_KEY}`)
        .then((r) => r.json())
        .then((json) => {
          if (!alive) return;
          setGenres((json?.genres || []) as Genre[]);
        })
        .catch(() => {
          if (!alive) return;
          setGenres([]);
        })
        .finally(() => {
          if (alive) setGenresLoading(false);
        });
    };

    // On web, `InteractionManager.runAfterInteractions` can fail to fire.
    const handle = Platform.OS === 'web' ? null : InteractionManager.runAfterInteractions(runFetch);
    if (Platform.OS === 'web') timeoutId = setTimeout(runFetch, 0);

    return () => {
      alive = false;
      // @ts-ignore - cancel exists at runtime on InteractionManager handle
      handle?.cancel?.();
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (gridScrollTimerRef.current) clearTimeout(gridScrollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (!selected) {
      setItems([]);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setItemsLoading(true);

    void fetch(`${API_BASE_URL}/discover/movie?api_key=${API_KEY}&with_genres=${selected}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        setItems((json?.results || []) as Media[]);
      })
      .catch(() => {
        setItems([]);
      })
      .finally(() => {
        setItemsLoading(false);
      });
  }, [selected]);

  const accent = useMemo(
    () => getAccentFromPosterPath(items[0]?.poster_path) ?? '#e50914',
    [items],
  );

  useEffect(() => {
    setAccentColor(accent);
  }, [accent, setAccentColor]);

  const selectedName = useMemo(
    () => (selected ? genres.find((g) => g.id === selected)?.name ?? 'Genre' : null),
    [genres, selected],
  );

  const toggle = useCallback((id: number) => {
    setSelected((prev) => (prev === id ? null : id));
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[accent, '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <AmbientGlow color={accent} intensity={0.2} />

      <View style={styles.shell}>
        <TvGlassPanel accent={accent} style={styles.panel} glowIntensity="medium">
          <View style={styles.panelInner}>
            <View style={styles.topBar}>
              <View style={styles.titleRow}>
                <View style={styles.iconWrap}>
                  <Ionicons name="grid" size={22} color="#fff" />
                </View>
                <View style={styles.titleStack}>
                  <Text style={styles.title}>Categories</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {selectedName ? `Showing: ${selectedName}` : 'Pick a genre to explore'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.genreRowWrap}>
              {genresLoading ? (
                <View style={styles.genreLoading}>
                  <ActivityIndicator color="#e50914" size="large" />
                  <Text style={styles.genreLoadingText}>Loading genres…</Text>
                </View>
              ) : (
                <FlatList
                  data={genres}
                  keyExtractor={(g) => String(g.id)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.genreRow}
                  renderItem={({ item, index }) => (
                    <GenreChip
                      item={item}
                      active={selected === item.id}
                      onToggle={toggle}
                      index={index}
                    />
                  )}
                />
              )}
            </View>

            <View style={styles.body}>
              {itemsLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator color="#fff" size="large" />
                  <Text style={styles.centerText}>Loading titles…</Text>
                </View>
              ) : !selected ? (
                <View style={styles.center}>
                  <Ionicons name="apps-outline" size={48} color="rgba(255,255,255,0.4)" />
                  <Text style={styles.centerTitle}>Pick a genre</Text>
                  <Text style={styles.centerText}>Use the row above to filter.</Text>
                </View>
              ) : items.length === 0 ? (
                <View style={styles.center}>
                  <Ionicons name="film-outline" size={48} color="rgba(255,255,255,0.4)" />
                  <Text style={styles.centerTitle}>No titles</Text>
                  <Text style={styles.centerText}>Try another category.</Text>
                  <TvFocusable
                    onPress={() => setSelected(null)}
                    tvPreferredFocus
                    isTVSelectable={true}
                    accessibilityLabel="Clear selection"
                    style={({ focused }: any) => [styles.clearSelectionBtn, focused && styles.clearSelectionBtnFocused]}
                  >
                    <Ionicons name="arrow-back-outline" size={18} color="#fff" />
                    <Text style={styles.clearSelectionBtnText}>Pick another genre</Text>
                  </TvFocusable>
                </View>
              ) : (
                <FlatList
                  ref={(r) => {
                    gridRef.current = r;
                  }}
                  data={items}
                  keyExtractor={(it, idx) => String(it.id ?? idx)}
                  numColumns={GRID_COLUMNS}
                  columnWrapperStyle={styles.gridRow}
                  contentContainerStyle={styles.grid}
                  getItemLayout={getGridItemLayout}
                  initialNumToRender={18}
                  maxToRenderPerBatch={18}
                  updateCellsBatchingPeriod={50}
                  windowSize={5}
                  removeClippedSubviews
                  renderItem={({ item, index }) => (
                    <TvPosterCard
                      item={{ ...item, media_type: (item.media_type ?? 'movie') as any }}
                      width={CARD_WIDTH}
                      onFocus={() => {
                        if (lastGridScrollIndexRef.current === index) return;
                        lastGridScrollIndexRef.current = index;

                        if (gridScrollTimerRef.current) clearTimeout(gridScrollTimerRef.current);
                        gridScrollTimerRef.current = setTimeout(() => {
                          try {
                            gridRef.current?.scrollToIndex({ index, viewPosition: 0.35, animated: false });
                          } catch {}
                        }, 60);
                      }}
                      onPress={(selectedItem) =>
                        router.push(`/details/${selectedItem.id}?mediaType=${selectedItem.media_type || 'movie'}`)
                      }
                    />
                  )}
                />
              )}
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
  topBar: { paddingHorizontal: 8, paddingBottom: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(229,9,20,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleStack: { flex: 1, minWidth: 0 },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 14, fontWeight: '700', marginTop: 4 },
  genreRowWrap: { paddingHorizontal: 6, paddingBottom: 12 },
  genreRow: { gap: 14, paddingRight: 28 },
  genreChip: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(15,18,30,0.65)',
    overflow: 'hidden',
  },
  genreChipActive: { borderColor: 'rgba(229,9,20,0.8)' },
  genreChipFocused: { transform: [{ scale: 1.06 }], borderColor: '#fff' },
  genreText: { color: 'rgba(255,255,255,0.75)', fontWeight: '900', fontSize: 15 },
  genreTextActive: { color: '#fff' },
  genreLoading: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  genreLoadingText: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 6, paddingBottom: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 12,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  centerText: { color: 'rgba(255,255,255,0.7)', fontSize: 17, fontWeight: '600' },
  clearSelectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(229,9,20,0.8)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  clearSelectionBtnFocused: {
    transform: [{ scale: 1.08 }],
    borderColor: '#fff',
    borderWidth: 3,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 10,
  },
  clearSelectionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  grid: { paddingTop: 12, paddingBottom: 24 },
  gridRow: { gap: 16, marginBottom: 16 },
});
