import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, InteractionManager, StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL, API_KEY } from '@/constants/api';
import { getAccentFromPosterPath } from '@/constants/theme';
import type { Genre, Media } from '@/types';
import { useTvAccent } from '../components/TvAccentContext';
import TvGlassPanel from '../components/TvGlassPanel';
import TvPosterCard from '../components/TvPosterCard';
import { TvFocusable } from '../components/TvSpatialNavigation';
import { useRouter } from 'expo-router';

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

    const handle = InteractionManager.runAfterInteractions(() => {
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
    });

    return () => {
      alive = false;
      // @ts-ignore - cancel exists at runtime on InteractionManager handle
      handle?.cancel?.();
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

      <View style={styles.shell}>
        <TvGlassPanel accent={accent} style={styles.panel}>
          <View style={styles.panelInner}>
            <View style={styles.topBar}>
              <View style={styles.titleRow}>
                <Ionicons name="grid" size={20} color="#fff" />
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
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.genreLoadingText}>Loading genres…</Text>
                </View>
              ) : (
                <FlatList
                  data={genres}
                  keyExtractor={(g) => String(g.id)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.genreRow}
                  renderItem={({ item }) => {
                    const active = selected === item.id;
                    return (
                      <TvFocusable
                        onPress={() => toggle(item.id)}
                        style={({ focused }: any) => [
                          styles.genreChip,
                          active ? styles.genreChipActive : null,
                          focused ? styles.genreChipFocused : null,
                        ]}
                      >
                        <Text style={[styles.genreText, active ? styles.genreTextActive : null]}>
                          {item.name}
                        </Text>
                      </TvFocusable>
                    );
                  }}
                />
              )}
            </View>

            <View style={styles.body}>
              {itemsLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.centerText}>Loading titles…</Text>
                </View>
              ) : !selected ? (
                <View style={styles.center}>
                  <Text style={styles.centerTitle}>Pick a genre</Text>
                  <Text style={styles.centerText}>Use the row above to filter.</Text>
                </View>
              ) : items.length === 0 ? (
                <View style={styles.center}>
                  <Text style={styles.centerTitle}>No titles</Text>
                  <Text style={styles.centerText}>Try another category.</Text>
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
  container: { flex: 1 },
  shell: { flex: 1, paddingLeft: 0, paddingRight: 34, paddingTop: 22, paddingBottom: 22, alignItems: 'center' },
  panel: { flex: 1, width: '100%', maxWidth: 1520 },
  panelInner: { flex: 1, padding: 18 },
  topBar: { paddingHorizontal: 6, paddingBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleStack: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.68)', fontSize: 13, fontWeight: '800', marginTop: 2 },
  genreRowWrap: { paddingHorizontal: 6, paddingBottom: 10 },
  genreRow: { gap: 12, paddingRight: 24 },
  genreChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  genreChipActive: { backgroundColor: 'rgba(229,9,20,0.45)', borderColor: 'rgba(229,9,20,0.9)' },
  genreChipFocused: { transform: [{ scale: 1.05 }], borderColor: '#fff' },
  genreText: { color: 'rgba(255,255,255,0.8)', fontWeight: '900', fontSize: 14 },
  genreTextActive: { color: '#fff' },
  genreLoading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  genreLoadingText: { color: 'rgba(255,255,255,0.75)', fontSize: 15, fontWeight: '800' },
  body: { flex: 1, paddingHorizontal: 6, paddingBottom: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 8 },
  centerText: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '700' },
  grid: { paddingTop: 10, paddingBottom: 20 },
  gridRow: { gap: 14 },
});
