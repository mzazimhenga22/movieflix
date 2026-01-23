import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { Media } from '@/types';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfileScopedKey } from '@/lib/profileStorage';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import { useAccent } from '@/app/components/AccentContext';
import { getResponsiveCardDimensions } from '@/hooks/useResponsive';
import * as Haptics from 'expo-haptics';
import ProgressiveMovieCard from './ProgressiveMovieCard';
import SkeletonCard from './SkeletonCard';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

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
  } catch {}
};

const triggerScrollFeedback = () => {
  const now = Date.now();
  if (now - lastFeedbackTime > FEEDBACK_THROTTLE_MS) {
    lastFeedbackTime = now;
    Haptics.selectionAsync();
    if (tickSound) {
      tickSound.setPositionAsync(0).then(() => tickSound?.playAsync()).catch(() => {});
    }
  }
};

loadTickSound();

interface ProgressiveMovieListProps {
  title: string;
  movies: Media[];
  carousel?: boolean;
  onItemPress?: (item: Media) => void;
  showProgress?: boolean;
  myListIds?: number[];
  onToggleMyList?: (item: Media) => void;
  variant?: 'default' | 'large' | 'compact';
}

// See All Card with expansion effect
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

  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.85, 1, 1.15],
    extrapolate: 'clamp',
  });

  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.4, 1, 1],
    extrapolate: 'clamp',
  });

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
        transform: [{ scale }, { translateX }],
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[styles.seeAllCard, { width: cardWidth, height: cardHeight, borderRadius, borderColor: `${accent}40` }]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>
            <LinearGradient colors={[`${accent}35`, 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />
            <View style={styles.seeAllCardContent}>
              <View style={[styles.seeAllIconCircle, { backgroundColor: accent }]}>
                <Ionicons name="arrow-forward" size={26} color="#fff" />
              </View>
              <Text style={styles.seeAllCardText}>View All</Text>
            </View>
          </BlurView>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,20,25,0.95)' }]}>
            <LinearGradient colors={[`${accent}25`, 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />
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

const ProgressiveMovieList: React.FC<ProgressiveMovieListProps> = ({
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

  const responsive = getResponsiveCardDimensions(screenWidth);
  const { cardWidth, largeCardWidth, cardGap, horizontalPadding, isSmallScreen } = responsive;

  const [myListIds, setMyListIds] = useState<number[]>([]);
  const effectiveMyListIds = externalMyListIds ?? myListIds;
  const scrollX = useRef(new Animated.Value(0)).current;
  const lastCardIndex = useRef(-1);
  const itemWidth = variant === 'large' ? largeCardWidth + cardGap + 6 : cardWidth + cardGap;

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
    } catch {}
  }, [onToggleMyList]);

  const handlePress = useCallback((movieId: number, mediaType: 'movie' | 'tv' | undefined) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deferNav(() => router.push(`/details/${movieId}?mediaType=${mediaType || 'movie'}`));
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
    return [...movies, { id: 'see-all-sentinel', isSeeAll: true } as any];
  }, [movies, carousel]);

  const renderItem = useCallback(({ item, index }: { item: Media; index: number }) => {
    if ((item as any).isSeeAll) {
      return (
        <SeeAllCard
          scrollX={scrollX}
          index={index}
          itemWidth={itemWidth}
          cardWidth={itemWidth - cardGap}
          cardHeight={variant === 'large' ? responsive.largeCardHeight : responsive.cardHeight}
          borderRadius={responsive.borderRadius}
          accent={accent}
          onPress={handleSeeAll}
        />
      );
    }

    const isInList = effectiveMyListIds.includes(item.id);

    return (
      <View style={{ width: itemWidth }}>
        <ProgressiveMovieCard
          item={item}
          index={index}
          scrollX={scrollX}
          variant={variant}
          showProgress={showProgress}
          isInList={isInList}
          accent={accent}
          onPress={() => onItemPress ? deferNav(() => onItemPress(item)) : handlePress(item.id, item.media_type)}
          onToggleList={() => toggleMyList(item)}
          isVisible={true}
        />
      </View>
    );
  }, [variant, effectiveMyListIds, showProgress, accent, scrollX, onItemPress, deferNav, handlePress, toggleMyList, itemWidth, cardGap, responsive, handleSeeAll]);

  // Native key extractor with stable keys
  const keyExtractor = useCallback((item: Media, index: number) => {
    if ((item as any).isSeeAll) return `see-all-${title}`;
    const type = String(item?.media_type ?? 'media');
    const id = item?.id;
    if (id == null || id === '') return `${type}-idx-${index}`;
    return `${type}-${String(id)}`;
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
          scrollEventThrottle={16}
          decelerationRate={0.992}
          removeClippedSubviews={false}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={9}
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
    marginTop: 16,
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

export default memo(ProgressiveMovieList);
