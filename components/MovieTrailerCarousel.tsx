import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Media } from '../types';
import { API_BASE_URL, API_KEY } from '../constants/api';

const { width } = Dimensions.get('window');
const TRAILER_WIDTH = 280;
const TRAILER_HEIGHT = 160;
const SPACING = 12;

interface MovieTrailerCarouselProps {
  trailers: (Media & { trailerUrl: string })[];
  onTrailerPress: (movie: Media) => void;
}

const MovieTrailerCarousel: React.FC<MovieTrailerCarouselProps> = ({
  trailers,
  onTrailerPress,
}) => {
  const [playingIndex, setPlayingIndex] = useState(0);
  const router = useRouter();

  const handleScrollEnd = useCallback((event: any) => {
    const scrollX = event.nativeEvent.contentOffset.x;
    const currentIndex = Math.round(scrollX / (TRAILER_WIDTH + SPACING));
    setPlayingIndex(Math.min(currentIndex, trailers.length - 1));
  }, [trailers.length]);

  const createTrailerReels = useCallback((movie: Media & { trailerUrl: string }, allTrailers: (Media & { trailerUrl: string })[]) => {
    // Create a reel queue with the clicked movie's trailer first, then others
    const reelQueue = allTrailers.map((trailerMovie) => ({
      id: `trailer-${trailerMovie.id}`,
      mediaType: 'trailer',
      title: `${trailerMovie.title || trailerMovie.name} - Official Trailer`,
      videoUrl: trailerMovie.trailerUrl,
      avatar: trailerMovie.poster_path ? `https://image.tmdb.org/t/p/w200${trailerMovie.poster_path}` : null,
      user: 'MovieFlix',
      likes: Math.floor(Math.random() * 1000) + 100,
      comments: [],
      commentsCount: Math.floor(Math.random() * 50) + 5,
      likerAvatars: [],
      music: `${trailerMovie.title || trailerMovie.name} Soundtrack`,
      movieData: trailerMovie, // Store movie data for navigation
    }));

    return reelQueue;
  }, []);

  const handleTrailerPress = useCallback((movie: Media & { trailerUrl: string }) => {
    console.log('Opening trailer reel for:', movie.title);

    // Create reel queue with all available trailers
    const reelQueue = createTrailerReels(movie, trailers);

    // Find the index of the clicked movie to start from there
    const startIndex = trailers.findIndex(t => t.id === movie.id);
    const startFromIndex = startIndex >= 0 ? startIndex : 0;

    const listParam = encodeURIComponent(JSON.stringify(reelQueue));
    router.push(
      `/reels/trailer-reels?id=${movie.id}&title=${encodeURIComponent(movie.title || movie.name || 'Trailer')}&list=${listParam}&startIndex=${startFromIndex}`
    );
  }, [createTrailerReels, trailers, router]);

  if (!trailers.length) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerDot} />
          <Text style={styles.headerTitle}>Movie Trailers</Text>
        </View>
        <TouchableOpacity style={styles.headerAction}>
          <Text style={styles.headerActionText}>See All</Text>
          <Ionicons name="chevron-forward" size={14} color="#e50914" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onMomentumScrollEnd={handleScrollEnd}
        decelerationRate="fast"
        snapToInterval={TRAILER_WIDTH + SPACING}
        snapToAlignment="start"
      >
        {trailers.map((movie, index) => (
          <TouchableOpacity
            key={movie.id}
            style={styles.trailerCard}
            onPress={() => onTrailerPress(movie)}
            activeOpacity={0.9}
          >
            <View style={styles.videoContainer}>
              <Video
                source={{ uri: movie.trailerUrl }}
                style={styles.video}
                resizeMode={ResizeMode.COVER}
                shouldPlay={index === playingIndex}
                isLooping={true}
                isMuted={true}
                useNativeControls={false}
              />

              {/* Dynamic gradient overlay */}
              <LinearGradient
                colors={[
                  'rgba(0,0,0,0.1)',
                  'rgba(0,0,0,0.3)',
                  'rgba(0,0,0,0.8)',
                ]}
                locations={[0, 0.6, 1]}
                style={styles.videoOverlay}
              />

              {/* Play indicator */}
              <View style={styles.playIndicator}>
                <View style={styles.playIconBg}>
                  <Ionicons
                    name={index === playingIndex ? "pause-circle" : "play-circle"}
                    size={32}
                    color="#fff"
                  />
                </View>
              </View>

              {/* Movie info overlay */}
              <View style={styles.movieInfo}>
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={10} color="#ffd700" />
                  <Text style={styles.ratingText}>
                    {movie.vote_average ? (movie.vote_average * 10).toFixed(0) : 'N/A'}
                  </Text>
                </View>

                <View style={styles.durationBadge}>
                  <Ionicons name="time-outline" size={10} color="#fff" />
                  <Text style={styles.durationText}>
                    {movie.release_date ? movie.release_date.slice(0, 4) : 'TBA'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.cardContent}>
              <Text style={styles.movieTitle} numberOfLines={2}>
                {movie.title || movie.name}
              </Text>

              <View style={styles.cardFooter}>
                <View style={styles.genreTags}>
                  {movie.genre_ids?.slice(0, 2).map((genreId, idx) => (
                    <View key={genreId} style={styles.genreTag}>
                      <Text style={styles.genreText}>
                        {getGenreName(genreId)}
                      </Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity style={styles.watchNowBtn} onPress={() => handleTrailerPress(movie)}>
                  <Text style={styles.watchNowText}>Watch Now</Text>
                  <Ionicons name="play" size={12} color="#e50914" />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Progress indicators */}
      <View style={styles.indicators}>
        {trailers.map((_, index) => (
          <View
            key={index}
            style={[
              styles.indicator,
              index === playingIndex && styles.indicatorActive
            ]}
          />
        ))}
      </View>
    </View>
  );
};

// Helper function to get genre names
const getGenreName = (genreId: number): string => {
  const genreMap: Record<number, string> = {
    28: 'Action',
    12: 'Adventure',
    16: 'Animation',
    35: 'Comedy',
    80: 'Crime',
    99: 'Documentary',
    18: 'Drama',
    10751: 'Family',
    14: 'Fantasy',
    36: 'History',
    27: 'Horror',
    10402: 'Music',
    9648: 'Mystery',
    10749: 'Romance',
    878: 'Sci-Fi',
    10770: 'TV Movie',
    53: 'Thriller',
    10752: 'War',
    37: 'Western',
  };
  return genreMap[genreId] || 'Movie';
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e50914',
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  headerActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e50914',
    marginRight: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  trailerCard: {
    width: TRAILER_WIDTH,
    marginRight: SPACING,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  videoContainer: {
    width: '100%',
    height: TRAILER_HEIGHT,
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  videoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  playIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -20 }, { translateY: -20 }],
  },
  playIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  movieInfo: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
  },
  ratingText: {
    color: '#ffd700',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  durationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  cardContent: {
    padding: 16,
  },
  movieTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    lineHeight: 22,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  genreTags: {
    flexDirection: 'row',
    gap: 6,
  },
  genreTag: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  genreText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '600',
  },
  watchNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229,9,20,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.3)',
  },
  watchNowText: {
    color: '#e50914',
    fontSize: 12,
    fontWeight: '700',
    marginRight: 4,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  indicatorActive: {
    backgroundColor: '#e50914',
    width: 20,
  },
});

export default MovieTrailerCarousel;
