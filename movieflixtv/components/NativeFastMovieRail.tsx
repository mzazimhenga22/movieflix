import React, { useCallback, useMemo } from 'react';
import { Platform, requireNativeComponent, StyleSheet, View, Text, processColor } from 'react-native';
import type { Media } from '@/types';

type FastMovieRailProps = {
  title: string;
  movies: string; // JSON string
  accentColor?: string;
  onItemPress?: (event: { nativeEvent: { id: string; media_type: string; id_number: number } }) => void;
  onSeeAllPress?: () => void;
  style?: any;
};

const NativeFastMovieRail = Platform.OS === 'android' 
  ? requireNativeComponent<FastMovieRailProps>('FastMovieRail')
  : null;

type Props = {
  title: string;
  items: Media[];
  accent?: string;
  onPressItem?: (item: Media) => void;
  onSeeAll?: () => void;
};

export default function NativeFastMovieRail({
  title,
  items,
  accent = '#e50914',
  onPressItem,
  onSeeAll,
}: Props) {
  // Convert items to JSON string for native
  const moviesJson = useMemo(() => {
    if (!items || items.length === 0) return '[]';
    return JSON.stringify(items.map(item => ({
      id: item.id,
      title: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      media_type: item.media_type || 'movie',
      release_date: item.release_date || item.first_air_date,
    })));
  }, [items]);

  const handleItemPress = useCallback((event: { nativeEvent: { id: string; media_type: string; id_number: number } }) => {
    if (!onPressItem) return;
    const { id, media_type, id_number } = event.nativeEvent;
    // Find the original item
    const item = items.find(i => String(i.id) === id || i.id === id_number);
    if (item) {
      onPressItem(item);
    }
  }, [items, onPressItem]);

  const handleSeeAllPress = useCallback(() => {
    onSeeAll?.();
  }, [onSeeAll]);

  // Fallback for non-Android
  if (Platform.OS !== 'android' || !NativeFastMovieRail) {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackTitle}>{title}</Text>
        <Text style={styles.fallbackText}>Native rail not available</Text>
      </View>
    );
  }

  return (
    <NativeFastMovieRail
      style={styles.rail}
      title={title}
      movies={moviesJson}
      accentColor={accent}
      onItemPress={handleItemPress}
      onSeeAllPress={handleSeeAllPress}
    />
  );
}

const styles = StyleSheet.create({
  rail: {
    height: 260,
    width: '100%',
  },
  fallbackContainer: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  fallbackTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  fallbackText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 8,
  },
});
