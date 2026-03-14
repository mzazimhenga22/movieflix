import LiquidGlass from '@/components/app-components/LiquidGlass';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Easing, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Media } from '../types';

const AnyVideoView = VideoView as any;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TRAILER_WIDTH = Math.min(320, SCREEN_WIDTH * 0.85);
const TRAILER_HEIGHT = 190;
const SPACING = 14;

// Use higher quality TMDB images
const IMAGE_BASE_URL_HD = 'https://image.tmdb.org/t/p/w780';
const IMAGE_BASE_URL_POSTER = 'https://image.tmdb.org/t/p/w342';

interface MovieTrailerCarouselProps {
  trailers: (Media & { trailerUrl: string })[];
  onTrailerPress: (movie: Media) => void;
  isParentScrolling?: boolean;
}

export type MovieTrailerCarouselHandle = {
  setPaused: (paused: boolean) => void;
};

// Trailer Item component to manage its own player instance
const TrailerItem = React.memo(function TrailerItem({
  movie,
  isActive,
  effectivePaused,
  onTrailerPress,
  handleTrailerPress,
}: {
  movie: Media & { trailerUrl: string };
  isActive: boolean;
  effectivePaused: boolean;
  index: number;
  onTrailerPress: (movie: Media) => void;
  handleTrailerPress: (movie: Media & { trailerUrl: string }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });

  const player = useVideoPlayer(movie.trailerUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (isActive && !effectivePaused) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, effectivePaused, player]);

  useEffect(() => {
    const statusSub = player.addListener('statusChange', (event: any) => {
      if (event.status === 'ready') {
        setLoading(false);
        setHasError(false);
      } else if (event.status === 'loading') {
        setLoading(true);
      } else if (event.status === 'error') {
        setHasError(true);
        setLoading(false);
      }
    });
    return () => statusSub.remove();
  }, [player]);

  const thumbPath = movie.backdrop_path || movie.poster_path;
  const thumbUri = thumbPath ? `${IMAGE_BASE_URL_HD}${thumbPath}` : undefined;
  const posterUri = movie.poster_path ? `${IMAGE_BASE_URL_POSTER}${movie.poster_path}` : undefined;
  const accentColor = '#e50914';

  return (
    <View style={styles.cardWrapper}>
      <GlowRing isActive={isActive} color={accentColor} />

      <TrailerCardContainer isActive={isActive} accentColor={accentColor}>
        <TouchableOpacity
          style={[styles.trailerCard, isActive && styles.trailerCardActive]}
          onPress={() => deferNav(() => onTrailerPress(movie))}
          activeOpacity={0.95}
        >
          <View style={styles.videoContainer}>
            <ExpoImage
              source={thumbUri ? { uri: thumbUri } : undefined}
              style={[styles.video, styles.thumbnailBackground]}
              contentFit="cover"
              transition={0}
              cachePolicy="memory-disk"
              recyclingKey={`trailer-thumb-${movie.id}`}
              priority="high"
            />

            {isActive && !hasError && (
              <AnyVideoView
                player={player}
                style={[styles.video, styles.videoOverlayPlayer]}
                contentFit="cover"
                showsPlaybackControls={false}
              />
            )}

            {isActive && loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#e50914" />
              </View>
            )}

            {hasError && (
              <View style={styles.errorOverlay}>
                <Ionicons name="alert-circle" size={32} color="rgba(255,255,255,0.5)" />
                <Text style={styles.errorText}>Trailer unavailable</Text>
              </View>
            )}

            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.85)']}
              locations={[0, 0.4, 1]}
              style={styles.cinematicOverlay}
            />

            <View style={styles.topAccentLine}>
              <LinearGradient
                colors={[accentColor, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.accentLineGradient}
              />
            </View>

            <CinematicBadge
              rating={movie.vote_average}
              year={movie.release_date?.slice(0, 4)}
            />

            <LiveIndicator isPlaying={isActive && !effectivePaused} />

            <View style={styles.centerPlayContainer}>
              <PlayButton isPlaying={isActive && !effectivePaused} onPress={() => handleTrailerPress(movie)} />
            </View>

            <View style={styles.bottomOverlay}>
              <View style={styles.titleContainer}>
                <Text style={styles.movieTitle} numberOfLines={1}>
                  {movie.title || movie.name}
                </Text>
                <View style={styles.trailerBadge}>
                  <MaterialCommunityIcons name="filmstrip" size={10} color="#e50914" />
                  <Text style={styles.trailerBadgeText}>TRAILER</Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                {movie.genre_ids?.slice(0, 2).map((genreId) => (
                  <View key={genreId} style={styles.genreChip}>
                    <Text style={styles.genreChipText}>{getGenreName(genreId)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.glassFooter}>
            <View style={styles.footerLeft}>
              <View style={styles.miniPoster}>
                <ExpoImage
                  source={posterUri ? { uri: posterUri } : undefined}
                  style={styles.miniPosterImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </View>
              <View style={styles.footerInfo}>
                <Text style={styles.footerSubtitle}>Official Trailer</Text>
                <View style={styles.statsRow}>
                  <Ionicons name="eye-outline" size={12} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.statsText}>{Math.floor(Math.random() * 500 + 100)}K views</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.watchButton} onPress={() => handleTrailerPress(movie)}>
              <LiquidGlass
                glowColor="#E50914"
                tintColor="#B20710"
                tintOpacity={0.9}
                cornerRadius={14}
                glowIntensity={0.6}
                borderWidth={1}
                chromaticAberration={true}
                depthEffect={true}
                interactive={false}
                breathingEffect={false}
                optimizeForScroll
                style={styles.watchButtonGradient}
                animated={false}
              >
                <Ionicons name="play" size={14} color="#fff" />
                <Text style={styles.watchButtonText}>Watch</Text>
              </LiquidGlass>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TrailerCardContainer>
    </View>
  );
});

// Extra wrapper to use LiquidGlass properly
const TrailerCardContainer = ({ children, isActive, accentColor }: { children: React.ReactNode, isActive: boolean, accentColor: string }) => {
  return (
    <LiquidGlass
      cornerRadius={22}
      tintColor="#141623"
      tintOpacity={0.8}
      borderOpacity={isActive ? 0.4 : 0.1}
      glowColor={accentColor}
      glowIntensity={isActive ? 0.3 : 0}
      chromaticAberration={isActive}
      depthEffect={isActive}
      interactive={isActive}
      breathingEffect={isActive}
      optimizeForScroll={!isActive}
      style={styles.trailerCard}
    >
      {children}
    </LiquidGlass>
  );
};

// Animated glow ring component
const GlowRing = React.memo(function GlowRing({ isActive, color }: { isActive: boolean; color: string }) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(0);
    }
  }, [isActive, pulseAnim]);

  const opacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  const scale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });

  if (!isActive) return null;

  return (
    <Animated.View
      style={[
        styles.glowRing,
        { opacity, transform: [{ scale }], borderColor: color, shadowColor: color },
      ]}
      pointerEvents="none"
    />
  );
});

// Floating play button with ripple effect
const PlayButton = React.memo(function PlayButton({ isPlaying, onPress }: { isPlaying: boolean; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.9, useNativeDriver: true, friction: 5 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      style={styles.playButtonTouch}
    >
      <Animated.View style={[styles.playButton, { transform: [{ scale: scaleAnim }] }]}>
        <LinearGradient
          colors={['rgba(229,9,20,0.95)', 'rgba(180,0,0,0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.playButtonGradient}
        >
          <View style={styles.playButtonInner}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#fff" style={{ marginLeft: isPlaying ? 0 : 3 }} />
          </View>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
});

// Cinematic rating badge
const CinematicBadge = React.memo(function CinematicBadge({ rating, year }: { rating?: number; year?: string }) {
  return (
    <View style={styles.cinematicBadgeContainer}>
      <View style={styles.ratingBadgeNew}>
        <LinearGradient
          colors={['rgba(255,215,0,0.2)', 'rgba(255,180,0,0.1)']}
          style={StyleSheet.absoluteFillObject}
        />
        <Ionicons name="star" size={11} color="#ffd700" />
        <Text style={styles.ratingTextNew}>{rating ? (rating * 10).toFixed(0) : 'N/A'}%</Text>
      </View>
      {year && (
        <View style={styles.yearBadge}>
          <Text style={styles.yearText}>{year}</Text>
        </View>
      )}
    </View>
  );
});

// Live indicator for playing videos
const LiveIndicator = React.memo(function LiveIndicator({ isPlaying }: { isPlaying: boolean }) {
  const dotAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isPlaying, dotAnim]);

  if (!isPlaying) return null;

  return (
    <View style={styles.liveIndicator}>
      <Animated.View style={[styles.liveDot, { opacity: dotAnim }]} />
      <Text style={styles.liveText}>PLAYING</Text>
    </View>
  );
});

const MovieTrailerCarousel = React.forwardRef<MovieTrailerCarouselHandle, MovieTrailerCarouselProps>(function MovieTrailerCarousel(
  { trailers, onTrailerPress, isParentScrolling = false },
  ref,
) {
  const [playingIndex, setPlayingIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const router = useRouter();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });
  const flatListRef = useRef<any>(null);

  const setPausedSafe = useCallback((next: boolean) => {
    setPaused((prev) => (prev === next ? prev : next));
  }, []);

  useImperativeHandle(ref, () => ({ setPaused: setPausedSafe }), [setPausedSafe]);

  // Scroll to specific index
  const scrollToIndex = useCallback((index: number) => {
    if (index >= 0 && index < trailers.length) {
      flatListRef.current?.scrollToIndex({ index, animated: true });
      setPlayingIndex(index);
    }
  }, [trailers.length]);

  // Navigate to previous/next
  const goToPrevious = useCallback(() => {
    scrollToIndex(Math.max(0, playingIndex - 1));
  }, [playingIndex, scrollToIndex]);

  const goToNext = useCallback(() => {
    scrollToIndex(Math.min(trailers.length - 1, playingIndex + 1));
  }, [playingIndex, trailers.length, scrollToIndex]);

  const handleScrollEnd = useCallback((event: any) => {
    const scrollXVal = event.nativeEvent.contentOffset.x;
    const currentIndex = Math.round(scrollXVal / (TRAILER_WIDTH + SPACING));
    const next = Math.max(0, Math.min(currentIndex, trailers.length - 1));
    setPlayingIndex((prev) => (prev === next ? prev : next));
  }, [trailers.length]);

  const createTrailerReels = useCallback((movie: Media & { trailerUrl: string }, allTrailers: (Media & { trailerUrl: string })[]) => {
    return allTrailers.map((trailerMovie) => ({
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
      movieData: trailerMovie,
    }));
  }, []);

  const handleTrailerPress = useCallback((movie: Media & { trailerUrl: string }) => {
    const reelQueue = createTrailerReels(movie, trailers);
    const startIndex = trailers.findIndex(t => t.id === movie.id);
    const startFromIndex = startIndex >= 0 ? startIndex : 0;
    const listParam = encodeURIComponent(JSON.stringify(reelQueue));
    deferNav(() => {
      router.push(`/reels/trailer-reels?id=${movie.id}&title=${encodeURIComponent(movie.title || movie.name || 'Trailer')}&list=${listParam}&startIndex=${startFromIndex}`);
    });
  }, [createTrailerReels, deferNav, trailers, router]);

  const renderItem = useCallback(
    ({ item: movie, index }: { item: Media & { trailerUrl: string }; index: number }) => {
      const isActive = index === playingIndex;
      const effectivePaused = paused || isParentScrolling;

      return (
        <TrailerItem
          movie={movie}
          isActive={isActive}
          effectivePaused={effectivePaused}
          index={index}
          onTrailerPress={onTrailerPress}
          handleTrailerPress={handleTrailerPress}
        />
      );
    },
    [handleTrailerPress, isParentScrolling, onTrailerPress, paused, playingIndex],
  );

  const indicators = useMemo(() => trailers.map((_, index) => index), [trailers]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: TRAILER_WIDTH + SPACING,
    offset: (TRAILER_WIDTH + SPACING) * index,
    index,
  }), []);

  if (!trailers.length) return null;

  return (
    <View style={styles.container}>
      {/* Premium header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <LinearGradient colors={['#e50914', '#b20710']} style={styles.headerIconGradient}>
              <MaterialCommunityIcons name="filmstrip-box-multiple" size={16} color="#fff" />
            </LinearGradient>
          </View>
          <View>
            <Text style={styles.headerEyebrow}>FEATURED</Text>
            <Text style={styles.headerTitle}>Movie Trailers</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.seeAllButton}>
          <Text style={styles.seeAllText}>See All</Text>
          <LiquidGlass
            glowColor="#E50914"
            tintColor="#E50914"
            tintOpacity={0.15}
            cornerRadius={11}
            glowIntensity={0.5}
            borderWidth={1}
            chromaticAberration={false}
            breathingEffect={false}
            interactive={false}
            optimizeForScroll
            style={styles.seeAllArrowLiquid}
            animated={false}
          >
            <Ionicons name="arrow-forward" size={12} color="#e50914" />
          </LiquidGlass>
        </TouchableOpacity>
      </View>

      {/* Carousel with navigation arrows */}
      <View style={styles.carouselContainer}>
        {/* Previous button */}
        {playingIndex > 0 && (
          <TouchableOpacity style={[styles.navArrow, styles.navArrowLeft]} onPress={goToPrevious} activeOpacity={0.8}>
            <LiquidGlass
              glowColor="#FFFFFF"
              tintColor="rgba(0,0,0,0.7)"
              tintOpacity={0.9}
              cornerRadius={14}
              glowIntensity={0.5}
              borderWidth={1}
              chromaticAberration={false}
              interactive={false}
              breathingEffect={false}
              optimizeForScroll
              style={styles.navArrowGradient}
              animated={false}
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </LiquidGlass>
          </TouchableOpacity>
        )}

        {/* @ts-ignore - FlatList ref typing issue */}
        <FlatList
          ref={flatListRef}
          horizontal
          data={trailers}
          renderItem={renderItem}
          keyExtractor={(movie: any) => `trailer-${movie.id}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onMomentumScrollEnd={handleScrollEnd}
          decelerationRate="fast"
          snapToInterval={TRAILER_WIDTH + SPACING}
          snapToAlignment="start"
          getItemLayout={getItemLayout}
          removeClippedSubviews={false}
          initialNumToRender={3}
          maxToRenderPerBatch={4}
          windowSize={7}
          onScrollToIndexFailed={() => { }}
        />

        {/* Next button */}
        {playingIndex < trailers.length - 1 && (
          <TouchableOpacity style={[styles.navArrow, styles.navArrowRight]} onPress={goToNext} activeOpacity={0.8}>
            <LiquidGlass
              glowColor="#FFFFFF"
              tintColor="rgba(0,0,0,0.7)"
              tintOpacity={0.9}
              cornerRadius={14}
              glowIntensity={0.5}
              borderWidth={1}
              chromaticAberration={false}
              interactive={false}
              breathingEffect={false}
              optimizeForScroll
              style={styles.navArrowGradient}
              animated={false}
            >
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </LiquidGlass>
          </TouchableOpacity>
        )}
      </View>

      {/* Premium indicators with tap to navigate */}
      <View style={styles.indicatorContainer}>
        <View style={styles.indicatorTrack}>
          {indicators.map((index) => (
            <TouchableOpacity
              key={index}
              onPress={() => scrollToIndex(index)}
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            >
              <Animated.View
                style={[
                  styles.indicator,
                  index === playingIndex && styles.indicatorActive,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.indicatorText}>
          {playingIndex + 1} / {trailers.length}
        </Text>
      </View>
    </View>
  );
});

const getGenreName = (genreId: number): string => {
  const genreMap: Record<number, string> = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  };
  return genreMap[genreId] || 'Movie';
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
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
    gap: 12,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    overflow: 'hidden',
  },
  headerIconGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: '#e50914',
    letterSpacing: 1.5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  seeAllArrowLiquid: {
    width: 22,
    height: 22,
    borderRadius: 11,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselContainer: {
    position: 'relative',
    paddingHorizontal: 16,
    minHeight: TRAILER_HEIGHT,
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 36,
  },
  cardWrapper: {
    width: TRAILER_WIDTH,
    marginRight: SPACING,
  },
  navArrow: {
    position: 'absolute',
    top: '50%',
    width: 38,
    height: 64,
    marginTop: -32,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  navArrowLeft: {
    left: 8,
  },
  navArrowRight: {
    right: 8,
  },
  navArrowGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  glowRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 24,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  trailerCard: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  trailerCardActive: {
    // handled by container borderOpacity/glow
  },
  videoContainer: {
    width: '100%',
    height: TRAILER_HEIGHT,
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  cinematicOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  accentLineGradient: {
    flex: 1,
  },
  cinematicBadgeContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  ratingBadgeNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    overflow: 'hidden',
  },
  ratingTextNew: {
    color: '#ffd700',
    fontSize: 12,
    fontWeight: '800',
  },
  yearBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  yearText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  liveIndicator: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(229,9,20,0.9)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  centerPlayContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -30 }, { translateY: -30 }],
  },
  playButtonTouch: {
    width: 60,
    height: 60,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  playButtonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  movieTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  trailerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(229,9,20,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.4)',
  },
  trailerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#e50914',
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
  },
  genreChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  genreChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  glassFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  miniPoster: {
    width: 36,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  miniPosterImage: {
    width: '100%',
    height: '100%',
  },
  footerInfo: {
    flex: 1,
  },
  footerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statsText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  watchButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  watchButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  watchButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  indicatorTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  indicatorActive: {
    width: 18,
    backgroundColor: '#e50914',
  },
  indicatorText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  thumbnailBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  videoOverlayPlayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  errorText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
  },
});

export default MovieTrailerCarousel;
