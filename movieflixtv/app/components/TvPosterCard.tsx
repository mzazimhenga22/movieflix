import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { IMAGE_BASE_URL } from '../../constants/api';
import type { Media } from '../../types';
import { TvFocusable } from './TvSpatialNavigation';

type Props = {
  item: Media;
  width?: number;
  variant?: 'poster' | 'landscape';
  showTitle?: boolean;
  showProgress?: boolean;
  onPress?: (item: Media) => void;
  onFocus?: (item: Media) => void;
};

function TvPosterCard({
  item,
  width = 168,
  variant = 'poster',
  showTitle = true,
  showProgress = true,
  onPress,
  onFocus,
}: Props) {
  const uri = item?.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : null;
  const backdropUri = item?.backdrop_path ? `${IMAGE_BASE_URL}${item.backdrop_path}` : null;
  const imageUri = variant === 'landscape' ? backdropUri || uri : uri;
  const progress = item?.watchProgress?.progress;
  const showProgressBar =
    showProgress && typeof progress === 'number' && Number.isFinite(progress) && progress > 0 && progress < 1;

  const height = useMemo(() => {
    if (variant === 'landscape') return Math.round(width * (9 / 16));
    return Math.round(width * 1.5);
  }, [variant, width]);

  const normalizedProgress =
    typeof progress === 'number' && Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : null;

  const title = item?.title || item?.name || 'Untitled';
  const rating = typeof item?.vote_average === 'number' ? item.vote_average : 0;

  return (
    <TvFocusable
      onPress={() => onPress?.(item)}
      onFocus={() => onFocus?.(item)}
      style={({ focused }: any) => [
        styles.card,
        { width, height },
        focused ? styles.focused : null,
      ]}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={styles.imageFallback} />
      )}

      <View style={styles.overlay} />

      {showTitle ? (
        <View style={[styles.meta, showProgressBar ? styles.metaWithProgress : null]}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>HD</Text>
            </View>
            <View style={[styles.pill, styles.pillSecondary]}>
              <Text style={styles.pillText}>⭐ {rating.toFixed(1)}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {showProgressBar && normalizedProgress && normalizedProgress > 0 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${normalizedProgress * 100}%` }]} />
        </View>
      ) : null}
    </TvFocusable>
  );
}

export default memo(TvPosterCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  focused: {
    transform: [{ scale: 1.06 }],
    borderColor: 'rgba(255,255,255,0.8)',
    shadowOpacity: 0.18,
    elevation: 8,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  imageFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  meta: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    gap: 6,
  },
  metaWithProgress: {
    bottom: 22,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  pillSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  progressTrack: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.26)',
    overflow: 'hidden',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: '#e50914',
  },
  title: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
