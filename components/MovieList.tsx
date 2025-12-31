import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IMAGE_BASE_URL } from '@/constants/api';
import { Media } from '@/types';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfileScopedKey } from '@/lib/profileStorage';

interface MovieListProps {
  title: string;
  movies: Media[];
  carousel?: boolean; // Make carousel optional
  onItemPress?: (item: Media) => void;
  showProgress?: boolean;
  myListIds?: number[];
  onToggleMyList?: (item: Media) => void;
}

const MovieList: React.FC<MovieListProps> = ({
  title,
  movies,
  carousel = true,
  onItemPress,
  showProgress = false,
  myListIds: externalMyListIds,
  onToggleMyList,
}) => {
  const router = useRouter();

  const [myListIds, setMyListIds] = useState<number[]>([]);
  const effectiveMyListIds = externalMyListIds ?? myListIds;

  useEffect(() => {
    if (externalMyListIds) return;
    const loadMyList = async () => {
      try {
        const key = await getProfileScopedKey('myList');
        const stored = await AsyncStorage.getItem(key);
        const parsed: Media[] = stored ? JSON.parse(stored) : [];
        setMyListIds(parsed.map((m) => m.id));
      } catch (err) {
        console.error('Failed to load My List', err);
        setMyListIds([]);
      }
    };
    loadMyList();
  }, [externalMyListIds]);

  const toggleMyList = async (item: Media) => {
    if (onToggleMyList) {
      onToggleMyList(item);
      return;
    }
    try {
      const key = await getProfileScopedKey('myList');
      const stored = await AsyncStorage.getItem(key);
      const existing: Media[] = stored ? JSON.parse(stored) : [];
      const exists = existing.find((m) => m.id === item.id);
      let updated: Media[];
      if (exists) {
        updated = existing.filter((m) => m.id !== item.id);
      } else {
        updated = [...existing, item];
      }
      setMyListIds(updated.map((m) => m.id));
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to update My List', err);
    }
  };

  const handlePress = (movieId: number, mediaType: 'movie' | 'tv' | undefined) => {
    router.push(`/details/${movieId}?mediaType=${mediaType || 'movie'}`);
  };

  // Return null if movies array is empty or undefined
  if (!movies || movies.length === 0) {
    return null;
  }

  const renderCarouselItem = ({ item }: { item: Media }) => {
    const progressValue = showProgress ? item.watchProgress?.progress ?? null : null;
    const normalizedProgress =
      typeof progressValue === 'number' ? Math.min(Math.max(progressValue, 0), 1) : null;
    const seasonLabel =
      item.media_type === 'tv' && typeof item.seasonNumber === 'number'
        ? `S${String(item.seasonNumber).padStart(2, '0')}`
        : null;
    const episodeLabel =
      item.media_type === 'tv' && typeof item.episodeNumber === 'number'
        ? `E${String(item.episodeNumber).padStart(2, '0')}`
        : null;
    const showEpisodeMeta = showProgress && item.media_type === 'tv' && (seasonLabel || episodeLabel);

    return (
    <TouchableOpacity
      style={[styles.carouselMovieCard, styles.glassCard]}
      onPress={() => (onItemPress ? onItemPress(item) : handlePress(item.id, item.media_type))}
    >
      <Image
        source={{ uri: `${IMAGE_BASE_URL}${item.poster_path}` }}
        style={styles.carouselMovieImage}
      />
      <View style={styles.carouselOverlay} />
      <TouchableOpacity
        style={styles.myListButton}
        onPress={() => toggleMyList(item)}
      >
        <Ionicons
          name={effectiveMyListIds.includes(item.id) ? 'checkmark' : 'add'}
          size={18}
          color="#fff"
        />
      </TouchableOpacity>
      <View style={[styles.carouselMeta, showProgress && styles.carouselMetaWithProgress]}>
        <Text style={styles.movieTitle} numberOfLines={1}>
          {item.title || item.name}
        </Text>
        {showEpisodeMeta ? (
          <Text style={styles.episodeBadgeText} numberOfLines={1}>
            {[seasonLabel, episodeLabel].filter(Boolean).join(' • ')}
            {item.episodeTitle ? `  ${item.episodeTitle}` : ''}
          </Text>
        ) : null}
        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>HD</Text>
          </View>
          <View style={[styles.pill, styles.pillSecondary]}>
            <Text style={styles.pillText}>⭐ {(item.vote_average || 0).toFixed(1)}</Text>
          </View>
        </View>
      </View>
      {showProgress && normalizedProgress && normalizedProgress > 0 ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${normalizedProgress * 100}%`,
              },
            ]}
          />
        </View>
      ) : null}
    </TouchableOpacity>
  );
  };

  const renderVerticalItem = (item: Media) => {
    const progressValue = showProgress ? item.watchProgress?.progress ?? null : null;
    const normalizedProgress =
      typeof progressValue === 'number' ? Math.min(Math.max(progressValue, 0), 1) : null;
    const seasonLabel =
      item.media_type === 'tv' && typeof item.seasonNumber === 'number'
        ? `S${String(item.seasonNumber).padStart(2, '0')}`
        : null;
    const episodeLabel =
      item.media_type === 'tv' && typeof item.episodeNumber === 'number'
        ? `E${String(item.episodeNumber).padStart(2, '0')}`
        : null;
    const showEpisodeMeta = showProgress && item.media_type === 'tv' && (seasonLabel || episodeLabel);

    return (
    <TouchableOpacity
      key={item.id}
      style={[styles.verticalMovieCard, styles.glassCard]}
      onPress={() => (onItemPress ? onItemPress(item) : handlePress(item.id, item.media_type))}
    >
      <View style={styles.verticalImageWrap}>
        <Image
          source={{ uri: `${IMAGE_BASE_URL}${item.poster_path}` }}
          style={styles.verticalMovieImage}
        />
        {showProgress && normalizedProgress && normalizedProgress > 0 ? (
          <View style={styles.progressTrackVertical}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${normalizedProgress * 100}%`,
                },
              ]}
            />
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.myListButtonVertical}
          onPress={() => toggleMyList(item)}
        >
          <Ionicons
            name={effectiveMyListIds.includes(item.id) ? 'checkmark' : 'add'}
            size={18}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
      <View style={styles.verticalMovieInfo}>
        <Text style={styles.verticalMovieTitle} numberOfLines={2} ellipsizeMode="tail">
          {item.title || item.name}
        </Text>
        {showEpisodeMeta ? (
          <Text style={styles.episodeBadgeText} numberOfLines={1}>
            {[seasonLabel, episodeLabel].filter(Boolean).join(' • ')}
            {item.episodeTitle ? `  ${item.episodeTitle}` : ''}
          </Text>
        ) : null}
        <Text style={styles.verticalMovieOverview} numberOfLines={3}>
          {item.overview}
        </Text>
      </View>
    </TouchableOpacity>
  );
  };

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {carousel && (
          <TouchableOpacity
            style={styles.seeAllButton}
            onPress={() => {
              const payload = movies.slice(0, 40);
              const listParam = encodeURIComponent(JSON.stringify(payload));
              const titleParam = encodeURIComponent(title);
              router.push(`/see-all?title=${titleParam}&list=${listParam}`);
            }}
          >
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        )}
      </View>

      {carousel ? (
        <FlatList
          data={movies}
          renderItem={renderCarouselItem}
          keyExtractor={(item) => item.id.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          removeClippedSubviews
          initialNumToRender={8}
          windowSize={5}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          getItemLayout={(_, index) => ({ length: 155, offset: 155 * index, index })}
          contentContainerStyle={styles.carouselContent}
        />
      ) : (
        <View style={styles.verticalListContainer}>
          {movies.map(renderVerticalItem)}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.25,
    flexShrink: 1,
    minWidth: 0,
  },
  seeAllButton: {
    marginLeft: 'auto',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  seeAllText: {
    color: '#7dd8ff',
    fontSize: 14,
  },
  movieTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  // Carousel-specific styles
  carouselContent: {
    paddingLeft: 16,
    paddingVertical: 10,
  },
  carouselMovieCard: {
    marginRight: 15,
    width: 140,
    borderRadius: 16,
    overflow: 'hidden',
  },
  carouselMovieImage: {
    width: 140,
    height: 210,
    borderRadius: 16,
  },
  carouselOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  carouselMeta: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    gap: 6,
  },
  carouselMetaWithProgress: {
    bottom: 24,
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
  episodeBadgeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
  // Vertical list-specific styles
  verticalListContainer: {
    paddingHorizontal: 16,
  },
  verticalMovieCard: {
    flexDirection: 'row',
    marginBottom: 15,
    borderRadius: 16,
    overflow: 'hidden',
  },
  verticalImageWrap: {
    position: 'relative',
    marginRight: 12,
  },
  verticalMovieImage: {
    width: 100,
    height: 150,
  },
  verticalMovieInfo: {
    flex: 1,
    padding: 12,
  },
  verticalMovieTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 5,
    letterSpacing: 0.1,
  },
  verticalMovieOverview: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
  },
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  myListButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  myListButtonVertical: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  progressTrack: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.26)',
    overflow: 'hidden',
  },
  progressTrackVertical: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
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
});

export default MovieList;
