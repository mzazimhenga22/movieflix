import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { IMAGE_BASE_URL } from '../../constants/api';
import type { Media } from '../../types';
import { useTvCardOverlay } from './TvCardOverlay';
import { TvFocusable } from './TvSpatialNavigation';

// Portal component for rendering expanded card at document root (web only)
function ExpandedCardPortal({ children }: { children: React.ReactNode }) {
  const isWeb = Platform.OS === 'web';
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!isWeb) return;
    // Create or get the portal container
    let el = document.getElementById('tv-poster-card-portal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tv-poster-card-portal';
      el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
      document.body.appendChild(el);
    }
    setContainer(el);
    return () => {
      // Don't remove - other cards might use it
    };
  }, [isWeb]);

  if (!isWeb) return <>{children}</>;
  if (!container) return null;

  // Lazy require so native bundles don't need react-dom.
  const { createPortal } = require('react-dom') as any;
  return createPortal(children, container);
}

type Props = {
  item: Media;
  width?: number;
  variant?: 'poster' | 'landscape';
  showTitle?: boolean;
  showProgress?: boolean;
  onPress?: (item: Media) => void;
  onFocus?: (item: Media) => void;
  onBlur?: () => void;
  spotlightActive?: boolean;
};

function TvPosterCard({
  item,
  width = 136,
  variant = 'poster',
  showTitle = true,
  showProgress = true,
  onPress,
  onFocus,
  onBlur,
  spotlightActive,
}: Props) {
  const overlay = useTvCardOverlay();
  const overlayId = useMemo(() => Math.random().toString(36).slice(2, 9), []);

  const getFullUri = (path?: string | null) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${IMAGE_BASE_URL}${path}`;
  };

  const posterUri = getFullUri(item?.poster_path);
  const backdropUri = getFullUri(item?.backdrop_path);
  const imageUri = variant === 'landscape' ? backdropUri || posterUri : posterUri;
  const expandedImageUri: string | undefined = posterUri ?? backdropUri ?? undefined;
  const progress = item?.watchProgress?.progress;
  const showProgressBar =
    showProgress && typeof progress === 'number' && Number.isFinite(progress) && progress > 0 && progress < 1;

  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = spotlightActive ?? (focused || hovered);
  const isFocusActive = spotlightActive ?? focused;

  // Track card position for portal overlay
  const cardRef = useRef<any>(null);
  const [cardRect, setCardRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Pulsing glow animation for TV remote focus (native only)
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  // 3D tilt effect animations
  const tiltX = useRef(new Animated.Value(0)).current;
  const tiltY = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const tiltLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let pulseTimer: NodeJS.Timeout;

    if (isFocusActive) {
      // Scale up smoothly immediately for responsiveness
      Animated.spring(scaleAnim, {
        toValue: 1.15,
        tension: 200,
        friction: 15,
        useNativeDriver: true,
      }).start();

      // Delay heavy loop animations (pulse/tilt) to avoid jitter during rapid scrolling
      pulseTimer = setTimeout(() => {
        // Start pulsing glow
        pulseAnim.setValue(0);
        pulseLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 0,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
        pulseLoopRef.current.start();

        // Start 3D tilt animation - subtle wobble effect
        tiltLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(tiltX, {
                toValue: 0.02,
                duration: 2000,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(tiltY, {
                toValue: -0.015,
                duration: 2000,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(tiltX, {
                toValue: -0.02,
                duration: 2000,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(tiltY, {
                toValue: 0.015,
                duration: 2000,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ]),
          ])
        );
        tiltLoopRef.current.start();
      }, 50);

    } else {
      // Scale back down
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 200,
        friction: 15,
        useNativeDriver: true,
      }).start();

      // Reset tilt
      Animated.parallel([
        Animated.timing(tiltX, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(tiltY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Stop pulsing and tilt
      pulseLoopRef.current?.stop();
      tiltLoopRef.current?.stop();
      pulseAnim.setValue(0);
    }

    return () => {
      clearTimeout(pulseTimer);
      pulseLoopRef.current?.stop();
      tiltLoopRef.current?.stop();
    };
  }, [isFocusActive, pulseAnim, scaleAnim, tiltX, tiltY]);

  const height = useMemo(() => {
    if (variant === 'landscape') return Math.round(width * (9 / 16));
    return Math.round(width * 1.5);
  }, [variant, width]);

  const normalizedProgress =
    typeof progress === 'number' && Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : null;

  const title = item?.title || item?.name || 'Untitled';
  const rating = typeof item?.vote_average === 'number' ? item.vote_average : 0;
  const year = item?.release_date?.slice(0, 4) || item?.first_air_date?.slice(0, 4);
  const mediaType = item?.media_type === 'tv' ? 'Series' : item?.media_type === 'music' ? 'Song' : 'Movie';
  const matchPercent = Math.min(99, Math.max(65, Math.round(rating * 10)));

  // Calculate expanded dimensions
  const scale = 1.35;
  const expandedWidth = width * scale;
  const expandedHeight = height * scale;
  const offsetX = (expandedWidth - width) / 2;
  const offsetY = (expandedHeight - height) / 2;

  // Update card position when active (for portal positioning)
  const updatePosition = useCallback(() => {
    if (!cardRef.current) return;
    if (Platform.OS === 'web') {
      // For web, we need to get the actual DOM node
      // Animated.View may wrap the element, so try multiple approaches
      let el: HTMLElement | null = null;

      // Try direct access first
      if (typeof (cardRef.current as any).getBoundingClientRect === 'function') {
        el = cardRef.current as unknown as HTMLElement;
      } else if ((cardRef.current as any)._nativeTag) {
        // React Native Web sometimes uses _nativeTag
        el = document.querySelector(`[data-testid]`) as HTMLElement;
      } else {
        // Fallback: try to find the DOM node via findDOMNode pattern
        try {
          const { findDOMNode } = require('react-dom');
          el = findDOMNode(cardRef.current) as HTMLElement;
        } catch {
          // findDOMNode may not be available
        }
      }

      if (el && typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        if (rect) setCardRect({ x: rect.left, y: rect.top, w: rect.width, h: rect.height });
      }
      return;
    }

    // Native: measure in window so we can render an overlay in a Modal (portal-like).
    try {
      cardRef.current.measureInWindow?.((x: number, y: number, w: number, h: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return;
        setCardRect({ x, y, w, h });
      });
    } catch { }
  }, []);

  useEffect(() => {
    if (isActive) {
      updatePosition();
    }
  }, [isActive, updatePosition, focused]); // focused dependency ensures position updates on FlashList recycling

  // Web-specific style for smooth transition
  const webTransition = Platform.select({
    web: { transition: 'opacity 0.15s ease-out' } as any,
    default: {},
  });

  // Determine if high rated
  const isHighRated = rating >= 7.5;

  // Animation for expanded card entry
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const overlayScale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(overlayScale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      overlayOpacity.setValue(0);
      overlayScale.setValue(0.95);
    }
  }, [isActive, overlayOpacity, overlayScale]);

  // Expanded card content (matching phone MovieList card design)
  const expandedCardContent = useMemo(() => (
    <Animated.View style={[styles.expandedInner, { opacity: overlayOpacity, transform: [{ scale: overlayScale }] }]}>
      {/* Poster image */}
      <Image
        source={expandedImageUri ? { uri: expandedImageUri } : undefined}
        style={[styles.expandedImage, { height: expandedHeight }]}
        contentFit="cover"
      />

      {/* Gradient overlays */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.95)']}
        locations={[0, 0.45, 0.75, 1]}
        style={styles.expandedBottomGradient}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)', 'transparent']}
        locations={[0, 0.25, 0.5]}
        style={styles.expandedTopGradient}
      />

      {/* Rating badge */}
      <View style={styles.expandedRatingWrap}>
        <View style={[styles.expandedRatingBadge, isHighRated && styles.expandedRatingBadgeHigh]}>
          <Ionicons name="star" size={12} color={isHighRated ? '#ffd700' : '#fff'} />
          <Text style={[styles.expandedRatingText, isHighRated && styles.expandedRatingTextHigh]}>
            {rating.toFixed(1)}
          </Text>
        </View>
      </View>

      {/* My List button */}
      <View style={styles.expandedMyListBtn}>
        <Ionicons name="add" size={18} color="#fff" />
      </View>

      {/* Quality badges */}
      <View style={styles.expandedQualityRow}>
        <View style={styles.expandedHdBadge}>
          <Text style={styles.expandedHdText}>HD</Text>
        </View>
        {isHighRated && (
          <View style={styles.expandedTopBadge}>
            <Ionicons name="trophy" size={10} color="#ffd700" />
            <Text style={styles.expandedTopBadgeText}>TOP</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.expandedContent}>
        <Text style={styles.expandedTitle} numberOfLines={2}>{title}</Text>

        {/* Genre pills */}
        <View style={styles.expandedGenrePills}>
          <View style={styles.expandedGenrePill}>
            <Text style={styles.expandedGenrePillText}>{mediaType}</Text>
          </View>
          {year && (
            <View style={styles.expandedGenrePill}>
              <Text style={styles.expandedGenrePillText}>{year}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Progress bar */}
      {showProgressBar && normalizedProgress && normalizedProgress > 0 && (
        <View style={styles.expandedProgressContainer}>
          <View style={styles.expandedProgressTrack}>
            <View style={[styles.expandedProgressFill, { width: `${normalizedProgress * 100}%` }]} />
          </View>
          <Text style={styles.expandedProgressText}>{Math.round(normalizedProgress * 100)}%</Text>
        </View>
      )}

      {/* Accent border */}
      <LinearGradient
        colors={['transparent', 'rgba(229,9,20,0.3)', 'rgba(229,9,20,0.15)']}
        style={styles.expandedAccentBorder}
      />
    </Animated.View>
  ), [
    expandedImageUri,
    expandedHeight,
    isHighRated,
    rating,
    title,
    mediaType,
    year,
    showProgressBar,
    normalizedProgress,
    overlayOpacity,
    overlayScale
  ]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (isActive && cardRect && overlay) {
      overlay.setOverlay(overlayId, {
        x: cardRect.x - offsetX,
        y: cardRect.y - offsetY,
        width: expandedWidth,
        height: expandedHeight,
        component: (
          <View style={[styles.expandedCard, { width: expandedWidth, height: expandedHeight }]}>
            {expandedCardContent}
          </View>
        ),
      });
    } else {
      overlay?.setOverlay(overlayId, null);
    }
    return () => overlay?.setOverlay(overlayId, null);
  }, [isActive, cardRect, overlay, overlayId, expandedWidth, expandedHeight, offsetX, offsetY, expandedCardContent]);

  // Animated styles for native TV focus with 3D tilt
  const nativeFocusStyle = Platform.OS !== 'web' ? {
    transform: [
      { scale: scaleAnim },
      {
        rotateX: tiltX.interpolate({
          inputRange: [-0.02, 0, 0.02],
          outputRange: ['-2deg', '0deg', '2deg'],
        })
      },
      {
        rotateY: tiltY.interpolate({
          inputRange: [-0.015, 0, 0.015],
          outputRange: ['1.5deg', '0deg', '-1.5deg'],
        })
      },
    ],
  } : {};

  const pulseGlowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  const pulseGlowScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  return (
    <Animated.View
      ref={cardRef}
      style={[styles.cardWrapper, { width, height }, nativeFocusStyle]}
      // @ts-ignore - web only
      onMouseEnter={() => setHovered(true)}
      // @ts-ignore - web only
      onMouseLeave={() => setHovered(false)}
    >
      {/* Pulsing glow ring for native TV focus */}
      {Platform.OS !== 'web' && isFocusActive && (
        <>
          <Animated.View
            style={[
              styles.pulseGlow,
              {
                opacity: pulseGlowOpacity,
                transform: [{ scale: pulseGlowScale }],
              },
            ]}
            pointerEvents="none"
          />
          <View style={styles.focusRing} pointerEvents="none" />
        </>
      )}

      <TvFocusable
        onPress={() => onPress?.(item)}
        onFocus={() => {
          setFocused(true);
          onFocus?.(item);
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        style={[styles.card, { width, height }]}
        isTVSelectable={true}
        accessibilityLabel={item?.title || item?.name || 'Movie'}
      >
        {/* Base card - kept visible to prevent flickering during overlay transition */}
        <View style={[styles.cardInner, webTransition, { opacity: 1 }]}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              contentFit="cover"
            />
          ) : (
            <View style={styles.imageFallback}>
              <Ionicons
                name={item.media_type === 'music' ? 'musical-notes' : 'image'}
                size={40}
                color="rgba(255,255,255,0.2)"
              />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.gradient}
            start={{ x: 0.5, y: 0.2 }}
            end={{ x: 0.5, y: 1 }}
          />
          {showTitle && (
            <View style={[styles.meta, showProgressBar ? styles.metaWithProgress : null]}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
            </View>
          )}
          {showProgressBar && normalizedProgress && normalizedProgress > 0 && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${normalizedProgress * 100}%` }]} />
            </View>
          )}

        </View>
      </TvFocusable>

      {/* Expanded card - rendered through portal on web to break out of FlashList stacking context */}
      {isActive && Platform.OS === 'web' && cardRect && (
        <ExpandedCardPortal>
          <View
            style={[
              styles.expandedCard,
              {
                width: expandedWidth,
                left: cardRect.x - offsetX,
                top: cardRect.y - offsetY,
                position: 'fixed' as any,
              },
            ]}
            pointerEvents="none"
          >
            {expandedCardContent}
          </View>
        </ExpandedCardPortal>
      )}
    </Animated.View>
  );
}

export default memo(TvPosterCard);

const styles = StyleSheet.create({
  cardWrapper: {
    overflow: 'visible',
    position: 'relative',
  },
  pulseGlow: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#e50914',
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 15,
    backgroundColor: 'transparent',
  },
  card: {
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  cardInner: {
    flex: 1,
    justifyContent: 'flex-end',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#181818',
  },
  focusRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 10,
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 15,
    elevation: 12,
  },
  expandedCard: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 30,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
  },
  expandedInner: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#121215',
  },
  expandedImage: {
    width: '100%',
    borderRadius: 18,
  },
  expandedTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  expandedBottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 130,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  expandedRatingWrap: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  expandedRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  expandedRatingBadgeHigh: {
    borderColor: 'rgba(255,215,0,0.4)',
  },
  expandedRatingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  expandedRatingTextHigh: {
    color: '#ffd700',
  },
  expandedMyListBtn: {
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
  expandedQualityRow: {
    position: 'absolute',
    top: 48,
    left: 10,
    flexDirection: 'row',
    gap: 6,
  },
  expandedHdBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  expandedHdText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  expandedTopBadge: {
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
  expandedTopBadgeText: {
    color: '#ffd700',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  expandedContent: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  expandedTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    letterSpacing: 0.2,
  },
  expandedGenrePills: {
    flexDirection: 'row',
    gap: 7,
    flexWrap: 'wrap',
  },
  expandedGenrePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  expandedGenrePillText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  expandedProgressContainer: {
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
  expandedProgressTrack: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  expandedProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#e50914',
  },
  expandedProgressText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  expandedAccentBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  imageFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2f2f2f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  meta: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
  },
  metaWithProgress: {
    bottom: 14,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#e50914',
  },
  title: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
