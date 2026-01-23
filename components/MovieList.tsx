import { useAccent } from '@/app/components/AccentContext';
import { SongCard } from '@/app/components/SongItem';
import { IMAGE_BASE_URL } from '@/constants/api';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import { getResponsiveCardDimensions } from '@/hooks/useResponsive';
import { getProfileScopedKey } from '@/lib/profileStorage';
import { Media } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';

// Scroll feedback with haptics and sound
let lastFeedbackTime = 0;
const FEEDBACK_THROTTLE_MS = 70;
let tickSound: Audio.Sound | null = null;

const loadTickSound = async () => {
  if (tickSound) return;
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(
      require('@/assets/sounds/tick.wav'),
      { volume: 0.12, shouldPlay: false }
    );
    tickSound = sound;
  } catch { }
};

const triggerScrollFeedback = () => {
  const now = Date.now();
  if (now - lastFeedbackTime > FEEDBACK_THROTTLE_MS) {
    lastFeedbackTime = now;
    Haptics.selectionAsync();
    // Play tick sound
    if (tickSound) {
      tickSound.setPositionAsync(0).then(() => tickSound?.playAsync()).catch(() => { });
    }
  }
};

// Preload sound
loadTickSound();

interface MovieListProps {
  title: string;
  movies: Media[];
  carousel?: boolean;
  onItemPress?: (item: Media) => void;
  showProgress?: boolean;
  myListIds?: number[];
  onToggleMyList?: (item: Media) => void;
  variant?: 'default' | 'large' | 'compact' | 'spotlight';
}

// Memoized Movie Card for optimal performance - NO animations on mount
const MovieCard = memo(function MovieCard({
  item,
  index,
  scrollX,
  variant,
  showProgress,
  isInList,
  accent,
  onPress,
  onToggleList,
  cardWidth,
  cardHeight,
  cardGap,
  borderRadius,
  isSmallScreen,
}: {
  item: Media;
  index: number;
  scrollX: Animated.Value;
  variant: string;
  showProgress: boolean;
  isInList: boolean;
  accent: string;
  onPress: () => void;
  onToggleList: () => void;
  cardWidth: number;
  cardHeight: number;
  cardGap: number;
  borderRadius: number;
  isSmallScreen: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shineAnim = useRef(new Animated.Value(0)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      tension: 300,
      friction: 10,
      useNativeDriver: true
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 200,
      friction: 8,
      useNativeDriver: true
    }).start();
  }, [scaleAnim]);

  const progressValue = showProgress ? item.watchProgress?.progress ?? null : null;
  const normalizedProgress = typeof progressValue === 'number' ? Math.min(Math.max(progressValue, 0), 1) : null;
  const matchPercent = Math.round((item.vote_average || 0) * 10);
  const isHighRated = (item.vote_average || 0) >= 7.5;

  const itemSpacing = cardWidth + cardGap;

  // Clean cinematic scroll transforms
  const shouldApplyScrollEffects = variant === 'large' || variant === 'default';

  const inputRange = [
    (index - 2) * itemSpacing,
    (index - 1) * itemSpacing,
    index * itemSpacing,
    (index + 1) * itemSpacing,
    (index + 2) * itemSpacing,
  ];

  // Subtle scale for depth
  const scale = shouldApplyScrollEffects ? scrollX.interpolate({
    inputRange,
    outputRange: [0.88, 0.94, 1, 0.94, 0.88],
    extrapolate: 'clamp',
  }) : 1;

  // Smooth opacity falloff
  const opacity = shouldApplyScrollEffects ? scrollX.interpolate({
    inputRange,
    outputRange: [0.6, 0.85, 1, 0.85, 0.6],
    extrapolate: 'clamp',
  }) : 1;

  // Gentle lift on center card
  const translateY = shouldApplyScrollEffects ? scrollX.interpolate({
    inputRange,
    outputRange: [4, 1, -3, 1, 4],
    extrapolate: 'clamp',
  }) : 0;

  return (
    <Animated.View
      style={{
        opacity,
        transform: [
          { translateY },
          { scale: Animated.multiply(scaleAnim, typeof scale === 'number' ? scale : scale) },
        ],
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={[styles.card, { width: cardWidth, marginRight: cardGap, borderRadius }]}
        delayPressIn={0}
      >
        <View style={[styles.cardInner, { height: cardHeight, borderRadius }]}>
          {/* Poster image */}
          <ExpoImage
            source={{ uri: `${IMAGE_BASE_URL}${item.poster_path}` }}
            style={[styles.posterImage, { height: cardHeight, borderRadius }]}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            recyclingKey={`poster-${String(item.media_type ?? 'media')}-${String(item.id ?? 'na')}`}
          />

          {/* Gradient overlays */}
          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.95)']}
            locations={[0, 0.45, 0.75, 1]}
            style={styles.bottomGradient}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)', 'transparent']}
            locations={[0, 0.25, 0.5]}
            style={styles.topGradient}
          />

          {/* Rating badge */}
          <View style={styles.ratingBadgeWrap}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={40} tint="dark" style={[styles.ratingBadge, isHighRated && styles.ratingBadgeHigh]}>
                <Text style={[styles.ratingText, isHighRated && styles.ratingTextHigh]}>
                  {matchPercent}% Match
                </Text>
              </BlurView>
            ) : (
              <View style={[styles.ratingBadge, styles.ratingBadgeAndroid, isHighRated && styles.ratingBadgeHigh]}>
                <Text style={[styles.ratingText, isHighRated && styles.ratingTextHigh]}>
                  {matchPercent}% Match
                </Text>
              </View>
            )}
          </View>

          {/* My List button */}
          <TouchableOpacity
            style={[styles.myListBtn, isInList && { backgroundColor: accent, borderColor: accent }]}
            onPress={onToggleList}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={isInList ? 'checkmark' : 'add'} size={17} color="#fff" />
          </TouchableOpacity>

          {/* Quality badge */}
          <View style={styles.qualityBadgeRow}>
            <View style={styles.hdBadge}>
              <Text style={styles.hdText}>HD</Text>
            </View>
            {isHighRated && (
              <View style={styles.topBadge}>
                <Ionicons name="trophy" size={9} color="#ffd700" />
                <Text style={styles.topBadgeText}>TOP</Text>
              </View>
            )}
          </View>

          {/* Content */}
          <View style={[styles.cardContent, { padding: isSmallScreen ? 8 : 12 }]}>
            <Text
              style={[styles.cardTitle, { fontSize: isSmallScreen ? 13 : 15 }]}
              numberOfLines={variant === 'large' ? 2 : 1}
            >
              {item.title || item.name}
            </Text>

            {showProgress && item.media_type === 'tv' && (
              <Text style={[styles.episodeLabel, { fontSize: isSmallScreen ? 10 : 11 }]}>
                S{String(item.seasonNumber || 1).padStart(2, '0')} E{String(item.episodeNumber || 1).padStart(2, '0')}
              </Text>
            )}

            {variant === 'large' && (
              <Text style={[styles.cardOverview, { fontSize: isSmallScreen ? 10 : 11 }]} numberOfLines={2}>
                {item.overview}
              </Text>
            )}

            {/* Genre pills */}
            <View style={styles.genrePills}>
              <View style={[styles.genrePill, { paddingHorizontal: isSmallScreen ? 6 : 8 }]}>
                <Text style={[styles.genrePillText, { fontSize: isSmallScreen ? 9 : 10 }]}>
                  {item.media_type === 'tv' ? 'Series' : 'Movie'}
                </Text>
              </View>
              {Boolean(item.release_date || item.first_air_date) && (
                <View style={[styles.genrePill, { paddingHorizontal: isSmallScreen ? 6 : 8 }]}>
                  <Text style={[styles.genrePillText, { fontSize: isSmallScreen ? 9 : 10 }]}>
                    {(item.release_date || item.first_air_date || '').slice(0, 4)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Progress bar */}
          {showProgress && normalizedProgress != null && normalizedProgress > 0 && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${normalizedProgress * 100}%`, backgroundColor: accent }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(normalizedProgress * 100)}%</Text>
            </View>
          )}

          {/* Cinematic light sweep effect */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shineOverlay,
              {
                opacity: shineAnim.interpolate({
                  inputRange: [0, 0.3, 0.7, 1],
                  outputRange: [0, 0.4, 0.4, 0],
                }),
                transform: [
                  {
                    translateX: shineAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-cardWidth * 1.5, cardWidth * 1.5],
                    }),
                  },
                  { skewX: '-20deg' },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.25)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>

          {/* Subtle accent border at bottom */}
          <LinearGradient
            colors={['transparent', `${accent}30`, `${accent}15`]}
            style={styles.accentBorder}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render if these change
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.isInList === nextProps.isInList &&
    prevProps.variant === nextProps.variant &&
    prevProps.accent === nextProps.accent &&
    prevProps.cardWidth === nextProps.cardWidth
  );
});

// Spotlight Card for featured items
const SpotlightCard = memo(function SpotlightCard({
  item,
  index,
  isInList,
  accent,
  onPress,
  onToggleList,
  screenWidth,
}: {
  item: Media;
  index: number;
  isInList: boolean;
  accent: string;
  onPress: () => void;
  onToggleList: () => void;
  screenWidth: number;
}) {
  const rating = (item.vote_average || 0).toFixed(1);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.spotlightCard, { width: screenWidth - 32 }]}
      delayPressIn={0}
    >
      <ExpoImage
        source={{ uri: `${IMAGE_BASE_URL}${item.backdrop_path || item.poster_path}` }}
        style={styles.spotlightImage}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={`spotlight-${String(item.media_type ?? 'media')}-${String(item.id ?? 'na')}`}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.95)']}
        locations={[0.3, 1]}
        style={styles.spotlightGradient}
      />

      {/* Rank badge */}
      <View style={[styles.rankBadge, { backgroundColor: accent }]}>
        <Text style={styles.rankText}>#{index + 1}</Text>
      </View>

      <View style={styles.spotlightContent}>
        <View style={styles.spotlightMeta}>
          <View style={styles.spotlightRating}>
            <Ionicons name="star" size={14} color="#ffd700" />
            <Text style={styles.spotlightRatingText}>{rating}</Text>
          </View>
          <TouchableOpacity
            style={[styles.spotlightListBtn, isInList && { backgroundColor: accent }]}
            onPress={onToggleList}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={isInList ? 'checkmark' : 'add'} size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.spotlightTitle} numberOfLines={2}>{item.title || item.name}</Text>
        <Text style={styles.spotlightOverview} numberOfLines={2}>{item.overview}</Text>

        <View style={styles.spotlightActions}>
          <View style={[styles.spotlightPlayBtn, { backgroundColor: accent }]}>
            <Ionicons name="play" size={16} color="#fff" />
            <Text style={styles.spotlightPlayText}>Play</Text>
          </View>
          <View style={styles.spotlightInfoBtn}>
            <Ionicons name="information-circle-outline" size={18} color="#fff" />
            <Text style={styles.spotlightInfoText}>Info</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// See All Card with Google Photos expansion effect
const SeeAllCard = memo(function SeeAllCard({
  scrollX,
  index,
  itemWidth,
  cardWidth,
  cardHeight,
  borderRadius,
  accent,
  onPress,
}: {
  scrollX: Animated.Value;
  index: number;
  itemWidth: number;
  cardWidth: number;
  cardHeight: number;
  borderRadius: number;
  accent: string;
  onPress: () => void;
}) {
  const inputRange = [
    (index - 1) * itemWidth,
    index * itemWidth,
    (index + 0.5) * itemWidth,
  ];

  // Expansion effect as it enters the viewport
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.8, 1, 1.15],
    extrapolate: 'clamp',
  });

  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.4, 1, 1],
    extrapolate: 'clamp',
  });

  // Pull-to-expand width simulation using translateX and scaleX
  const translateX = scrollX.interpolate({
    inputRange: [(index - 1) * itemWidth, index * itemWidth],
    outputRange: [40, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={{
        width: itemWidth,
        opacity,
        justifyContent: 'center',
        transform: [
          { scale },
          { translateX },
        ],
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[styles.seeAllCard, { width: cardWidth, height: cardHeight, borderRadius, borderColor: `${accent}40` }]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={[`${accent}35`, 'rgba(0,0,0,0.85)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.seeAllCardContent}>
              <View style={[styles.seeAllIconCircle, { backgroundColor: accent }]}>
                <Ionicons name="arrow-forward" size={26} color="#fff" />
              </View>
              <Text style={styles.seeAllCardText}>View All</Text>
            </View>
          </BlurView>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,20,25,0.95)' }]}>
            <LinearGradient
              colors={[`${accent}25`, 'rgba(0,0,0,0.85)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.seeAllCardContent}>
              <View style={[styles.seeAllIconCircle, { backgroundColor: accent }]}>
                <Ionicons name="arrow-forward" size={26} color="#fff" />
              </View>
              <Text style={styles.seeAllCardText}>View All</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
});

const MovieList: React.FC<MovieListProps> = ({
  title,
  movies,
  carousel = true,
  onItemPress,
  showProgress = false,
  myListIds: externalMyListIds,
  onToggleMyList,
  variant = 'default',
}) => {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';

  // Get responsive dimensions
  const responsive = getResponsiveCardDimensions(screenWidth);
  const cardWidth = variant === 'large'
    ? responsive.largeCardWidth
    : variant === 'compact'
      ? responsive.compactCardWidth
      : responsive.cardWidth;
  const cardHeight = variant === 'large'
    ? responsive.largeCardHeight
    : variant === 'compact'
      ? responsive.compactCardHeight
      : responsive.cardHeight;
  const { cardGap, horizontalPadding, borderRadius, isSmallScreen } = responsive;

  const [myListIds, setMyListIds] = useState<number[]>([]);
  const effectiveMyListIds = externalMyListIds ?? myListIds;
  const scrollX = useRef(new Animated.Value(0)).current;
  const lastCardIndex = useRef(-1);
  const itemWidth = cardWidth + cardGap;

  // Haptic feedback on card transitions
  useEffect(() => {
    const listenerId = scrollX.addListener(({ value }) => {
      const currentIndex = Math.round(value / itemWidth);
      if (currentIndex !== lastCardIndex.current && currentIndex >= 0) {
        lastCardIndex.current = currentIndex;
        triggerScrollFeedback();
      }
    });
    return () => scrollX.removeListener(listenerId);
  }, [scrollX, itemWidth]);

  useEffect(() => {
    if (externalMyListIds) return;
    const loadMyList = async () => {
      try {
        const key = await getProfileScopedKey('myList');
        const stored = await AsyncStorage.getItem(key);
        const parsed: Media[] = stored ? JSON.parse(stored) : [];
        setMyListIds(parsed.map((m) => m.id));
      } catch {
        setMyListIds([]);
      }
    };
    loadMyList();
  }, [externalMyListIds]);

  const toggleMyList = useCallback(async (item: Media) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    } catch { }
  }, [onToggleMyList]);

  const handlePress = useCallback((item: Media) => {
    const movieId = item.id;
    const mediaType = item.media_type;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (mediaType === 'music') {
      deferNav(() => router.push({
        pathname: '/(tabs)/music',
        params: {
          trackId: item.videoId || String(movieId),
          mediaType: 'music',
          title: item.title,
          thumbnail: item.poster_path
        }
      }));
    } else {
      deferNav(() => router.push(`/details/${movieId}?mediaType=${mediaType || 'movie'}`));
    }
  }, [deferNav, router]);

  const handleSeeAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const payload = movies.slice(0, 40);
    const listParam = encodeURIComponent(JSON.stringify(payload));
    const titleParam = encodeURIComponent(title);
    deferNav(() => router.push(`/see-all?title=${titleParam}&list=${listParam}`));
  }, [movies, title, deferNav, router]);

  const listData = useMemo(() => {
    if (!carousel || movies.length < 3) return movies;
    // Append a sentinel for the animated View All card
    return [...movies, { id: 'see-all-sentinel', isSeeAll: true } as any];
  }, [movies, carousel]);

  const renderItem = useCallback(({ item, index }: { item: Media; index: number }) => {
    if ((item as any).isSeeAll) {
      return (
        <SeeAllCard
          scrollX={scrollX}
          index={index}
          itemWidth={itemWidth}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          borderRadius={borderRadius}
          accent={accent}
          onPress={handleSeeAll}
        />
      );
    }

    const isInList = effectiveMyListIds.includes(item.id);

    if (variant === 'spotlight') {
      return (
        <SpotlightCard
          item={item}
          index={index}
          isInList={isInList}
          accent={accent}
          onPress={() => onItemPress ? deferNav(() => onItemPress(item)) : handlePress(item)}
          onToggleList={() => toggleMyList(item)}
          screenWidth={screenWidth}
        />
      );
    }

    if (item.media_type === 'music') {
      return (
        <SongCard
          item={item}
          accentColor={accent}
          onPress={() => onItemPress ? deferNav(() => onItemPress(item)) : handlePress(item)}
          width={cardWidth}
        />
      );
    }

    return (
      <MovieCard
        item={item}
        index={index}
        scrollX={scrollX}
        variant={variant}
        showProgress={showProgress}
        isInList={isInList}
        accent={accent}
        onPress={() => onItemPress ? deferNav(() => onItemPress(item)) : handlePress(item)}
        onToggleList={() => toggleMyList(item)}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        cardGap={cardGap}
        borderRadius={borderRadius}
        isSmallScreen={isSmallScreen}
      />
    );
  }, [variant, effectiveMyListIds, showProgress, accent, scrollX, onItemPress, deferNav, handlePress, toggleMyList, cardWidth, cardHeight, cardGap, borderRadius, isSmallScreen, screenWidth, itemWidth, handleSeeAll]);

  const keyExtractor = useCallback((item: Media, index: number) => {
    if ((item as any).isSeeAll) return `see-all-${title}`;
    const type = String((item as any)?.media_type ?? (item as any)?.type ?? 'media');
    const id = (item as any)?.id;
    // Some feeds can contain duplicate IDs (or mixed movie/tv without media_type);
    // include index to guarantee uniqueness and avoid React duplicate-key warnings.
    if (id == null || id === '') return `${type}-idx-${index}`;
    return `${type}-${String(id)}-${index}`;
  }, [title]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: itemWidth,
    offset: itemWidth * index,
    index,
  }), [itemWidth]);

  if (!movies || movies.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={[styles.header, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerAccent, { backgroundColor: accent }]} />
          <Text style={[styles.headerTitle, { fontSize: isSmallScreen ? 18 : 21 }]}>{title}</Text>
        </View>
        {carousel && (
          <TouchableOpacity style={styles.seeAllBtn} onPress={handleSeeAll} activeOpacity={0.7}>
            <Text style={[styles.seeAllText, { color: accent, fontSize: isSmallScreen ? 12 : 13 }]}>See All</Text>
            <Ionicons name="chevron-forward" size={isSmallScreen ? 14 : 16} color={accent} />
          </TouchableOpacity>
        )}
      </View>

      {/* Movie list */}
      {carousel ? (
        <Animated.FlatList
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingLeft: horizontalPadding, paddingRight: horizontalPadding + 40 }]}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={32}
          snapToInterval={variant === 'large' ? cardWidth + cardGap : undefined}
          decelerationRate={0.992}
          removeClippedSubviews={false}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={7}
          updateCellsBatchingPeriod={16}
          getItemLayout={getItemLayout}
        />
      ) : (
        <View style={[styles.gridContainer, { paddingHorizontal: horizontalPadding }]}>
          {movies.map((item, index) => (
            <View key={keyExtractor(item, index)} style={{ width: (screenWidth - horizontalPadding * 2 - 24) / 3 }}>
              {renderItem({ item, index })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerAccent: {
    width: 4,
    height: 22,
    borderRadius: 2,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingVertical: 10,
  },
  card: {
    borderRadius: 18,
  },
  cardInner: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#121215',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  posterImage: {
    width: '100%',
    borderRadius: 18,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 130,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  ratingBadgeWrap: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  ratingBadgeAndroid: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  ratingBadgeHigh: {
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  ratingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  ratingTextHigh: {
    color: '#ffd700',
  },
  myListBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  qualityBadgeRow: {
    position: 'absolute',
    top: 48,
    left: 10,
    flexDirection: 'row',
    gap: 6,
  },
  hdBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  hdText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  topBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
  },
  topBadgeText: {
    color: '#ffd700',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cardContent: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 5,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    letterSpacing: 0.2,
  },
  cardOverview: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  episodeLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 5,
    letterSpacing: 0.3,
  },
  genrePills: {
    flexDirection: 'row',
    gap: 7,
    flexWrap: 'wrap',
  },
  genrePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  genrePillText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  accentBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  shineOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
    left: 0,
  },
  // Spotlight styles
  spotlightCard: {
    height: 200,
    marginRight: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1a1a1e',
  },
  spotlightImage: {
    width: '100%',
    height: '100%',
  },
  spotlightGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  rankBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  rankText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  spotlightContent: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  spotlightMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  spotlightRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  spotlightRatingText: {
    color: '#ffd700',
    fontSize: 14,
    fontWeight: '800',
  },
  spotlightListBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  spotlightTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  spotlightOverview: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  spotlightActions: {
    flexDirection: 'row',
    gap: 12,
  },
  spotlightPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  spotlightPlayText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  spotlightInfoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  spotlightInfoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Grid styles
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 12,
  },
  gridItem: {
    // Width set dynamically
  },
  seeAllCard: {
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  seeAllCardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  seeAllIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  seeAllCardText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.6,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});

export default memo(MovieList);
