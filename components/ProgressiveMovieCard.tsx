import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { IMAGE_BASE_URL } from '@/constants/api';
import { Media } from '@/types';
import { getResponsiveCardDimensions } from '@/hooks/useResponsive';

type LoadPhase = 'skeleton' | 'info' | 'complete';

interface ProgressiveMovieCardProps {
  item: Media;
  index: number;
  scrollX: Animated.Value;
  variant?: 'default' | 'large' | 'compact';
  showProgress?: boolean;
  isInList: boolean;
  accent: string;
  onPress: () => void;
  onToggleList: () => void;
  isVisible?: boolean;
}

const ProgressiveMovieCard = memo(function ProgressiveMovieCard({
  item,
  index,
  scrollX,
  variant = 'default',
  showProgress = false,
  isInList,
  accent,
  onPress,
  onToggleList,
  isVisible = true,
}: ProgressiveMovieCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('skeleton');
  const [imageLoaded, setImageLoaded] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const infoFadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

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
  const borderRadius = responsive.borderRadius;
  const cardGap = responsive.cardGap;
  const isSmallScreen = responsive.isSmallScreen;

  // Show info immediately on mount
  useEffect(() => {
    if (loadPhase === 'skeleton') {
      setLoadPhase('info');
      infoFadeAnim.setValue(1);
    }
  }, [loadPhase, infoFadeAnim]);

  // When image loads, fade it in
  useEffect(() => {
    if (imageLoaded && loadPhase !== 'complete') {
      setLoadPhase('complete');
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [imageLoaded, loadPhase, fadeAnim]);

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      tension: 300,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 200,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  const progressValue = showProgress ? item.watchProgress?.progress ?? null : null;
  const normalizedProgress = typeof progressValue === 'number' ? Math.min(Math.max(progressValue, 0), 1) : null;
  const matchPercent = Math.round((item.vote_average || 0) * 10);
  const isHighRated = (item.vote_average || 0) >= 7.5;

  const itemSpacing = variant === 'large' ? responsive.largeCardWidth + cardGap + 6 : cardWidth + cardGap;
  const shouldApplyScrollEffects = variant === 'large' || variant === 'default';

  const inputRange = [
    (index - 2) * itemSpacing,
    (index - 1) * itemSpacing,
    index * itemSpacing,
    (index + 1) * itemSpacing,
    (index + 2) * itemSpacing,
  ];

  const scale = shouldApplyScrollEffects
    ? scrollX.interpolate({
        inputRange,
        outputRange: [0.88, 0.94, 1, 0.94, 0.88],
        extrapolate: 'clamp',
      })
    : 1;

  const opacity = shouldApplyScrollEffects
    ? scrollX.interpolate({
        inputRange,
        outputRange: [0.6, 0.85, 1, 0.85, 0.6],
        extrapolate: 'clamp',
      })
    : 1;

  const translateY = shouldApplyScrollEffects
    ? scrollX.interpolate({
        inputRange,
        outputRange: [4, 1, -3, 1, 4],
        extrapolate: 'clamp',
      })
    : 0;

  // Always render the card - skeleton shows as background until image loads
  // This prevents gaps when scrolling fast

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
        style={[styles.card, { width: cardWidth, borderRadius }]}
        delayPressIn={0}
      >
        <View style={[styles.cardInner, { height: cardHeight, borderRadius }]}>
          {/* Skeleton background - always present as fallback */}
          <View style={styles.skeletonBg} />

          {/* Image layer with fade-in */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
            <ExpoImage
              source={{ uri: `${IMAGE_BASE_URL}${item.poster_path}` }}
              style={[styles.posterImage, { height: cardHeight, borderRadius }]}
              contentFit="cover"
              transition={0}
              cachePolicy="memory-disk"
              onLoad={handleImageLoad}
              recyclingKey={`progressive-${String(item.media_type ?? 'media')}-${String(item.id ?? 'na')}`}
            />
          </Animated.View>

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

          {/* Info layer - fades in during 'info' phase */}
          <Animated.View style={{ opacity: infoFadeAnim }}>
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
          </Animated.View>

          {/* Accent border */}
          <LinearGradient
            colors={['transparent', `${accent}30`, `${accent}15`]}
            style={styles.accentBorder}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.isInList === nextProps.isInList &&
    prevProps.variant === nextProps.variant &&
    prevProps.accent === nextProps.accent &&
    prevProps.isVisible === nextProps.isVisible
  );
});

const styles = StyleSheet.create({
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
  skeletonBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.04)',
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
});

export default ProgressiveMovieCard;
