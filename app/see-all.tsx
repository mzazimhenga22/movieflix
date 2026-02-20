import React, { useMemo, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenWrapper from '../components/ScreenWrapper';
import { Media } from '../types';
import { getAccentFromPosterPath } from '../constants/theme';
import MovieList from '../components/MovieList';

const SeeAllScreen: React.FC = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const title = (params.title as string) || 'All titles';
  const listParam = params.list as string | undefined;

  const rawMovies: Media[] = useMemo(() => {
    if (!listParam || typeof listParam !== 'string') return [];
    try {
      const parsed = JSON.parse(decodeURIComponent(listParam));
      return Array.isArray(parsed) ? (parsed as Media[]) : [];
    } catch (e) {
      console.warn('Failed to parse see-all list', e);
      return [];
    }
  }, [listParam]);

  const [sortMode, setSortMode] = useState<'popular' | 'top' | 'new' | 'az'>('popular');

  const movies = useMemo(() => {
    const base = [...rawMovies];
    switch (sortMode) {
      case 'top':
        return base.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
      case 'new':
        return base.sort((a, b) =>
          String(b.release_date || b.first_air_date || '').localeCompare(
            String(a.release_date || a.first_air_date || '')
          )
        );
      case 'az':
        return base.sort((a, b) =>
          String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''))
        );
      default:
        return base;
    }
  }, [rawMovies, sortMode]);

  const accentColor = getAccentFromPosterPath(movies[0]?.poster_path);

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={[accentColor, '#150a13', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>{'‹'}</Text>
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {title}
                </Text>
                <View style={styles.countPill}>
                  <Text style={styles.countText}>{movies.length}</Text>
                </View>
              </View>
              <Text style={styles.headerSubtitle}>
                {movies.length} title{movies.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>

          {/* Sort / filter chips */}
          <View style={styles.sortRow}>
            {[
              { key: 'popular', label: 'Popular' },
              { key: 'top', label: 'Top Rated' },
              { key: 'new', label: 'Newest' },
              { key: 'az', label: 'A–Z' },
            ].map((chip) => {
              const active = sortMode === chip.key;
              return (
                <TouchableOpacity
                  key={chip.key}
                  style={[styles.sortChip, active && styles.sortChipActive]}
                  onPress={() => setSortMode(chip.key as any)}
                >
                  <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.listContent}>
            <MovieList title={title} movies={movies} carousel={false} />
          </View>
        </ScrollView>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 8,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    marginRight: 10,
  },
  backText: {
    color: '#fff',
    fontSize: 20,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  countText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    gap: 8,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  sortChipActive: {
    backgroundColor: 'rgba(229,9,20,0.9)',
    borderColor: '#e50914',
  },
  sortChipText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  sortChipTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingBottom: 24,
  },
});

export default SeeAllScreen;
