import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { FeedCardItem } from '../../../types/social-feed';

type Shape = 'card' | 'featured' | 'minimal' | 'story';
type SizeVariant = 'sm' | 'md' | 'lg';

export type CollageVariant = {
  shape: Shape;
  size: SizeVariant;
  accentColor: string;
};

const ACCENT_COLORS = [
  '#e50914', // Netflix red
  '#7dd8ff', // Cyan
  '#ff6b35', // Orange
  '#a855f7', // Purple
  '#22c55e', // Green
  '#f59e0b', // Amber
  '#ec4899', // Pink
];

function stableHash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getCollageVariant(id: string): CollageVariant {
  const h = stableHash(id);
  const shapes: Shape[] = ['card', 'featured', 'minimal', 'story'];
  const sizes: SizeVariant[] = ['sm', 'md', 'lg'];

  const shape = shapes[h % shapes.length];
  const size = sizes[(h >>> 2) % sizes.length];
  const accentColor = ACCENT_COLORS[(h >>> 4) % ACCENT_COLORS.length];
  return { shape, size, accentColor };
}

type Props = {
  item: FeedCardItem;
  columnWidth: number;
  onPress: () => void;
};

function computeTileHeight(width: number, shape: Shape, size: SizeVariant) {
  if (shape === 'story') return Math.round(width * 1.6);
  if (shape === 'featured') return Math.round(width * 1.3);
  if (shape === 'minimal') return Math.round(width * 0.85);
  switch (size) {
    case 'sm': return Math.round(width * 1.1);
    case 'md': return Math.round(width * 1.35);
    case 'lg': return Math.round(width * 1.55);
  }
}

function FeedCollageTile({ item, columnWidth, onPress }: Props) {
  const variant = useMemo(() => getCollageVariant(String(item.id)), [item.id]);
  const height = useMemo(
    () => computeTileHeight(columnWidth, variant.shape, variant.size),
    [columnWidth, variant.shape, variant.size]
  );

  // Animations
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle glow pulse for featured items
    if (variant.shape === 'featured') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, []);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      tension: 100,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 80,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const isVideo = !!item.videoUrl;
  const hasImage = !!item.image || !!item.avatar;
  const likes = (item as any).likes || 0;
  const comments = (item as any).commentsCount || 0;

  // Render based on shape variant
  const renderContent = () => {
    switch (variant.shape) {
      case 'featured':
        return (
          <View style={[styles.tileInner, { borderRadius: 20 }]}>
            {/* Background */}
            {hasImage ? (
              <Image
                source={item.image || { uri: String(item.avatar) }}
                style={[styles.media, { borderRadius: 20 }]}
                blurRadius={isVideo ? 8 : 0}
              />
            ) : (
              <LinearGradient
                colors={[variant.accentColor, 'rgba(10,12,24,0.95)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.media, { borderRadius: 20 }]}
              />
            )}

            {/* Cinematic gradient */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)']}
              locations={[0, 0.5, 1]}
              style={styles.overlay}
            />

            {/* Animated accent glow */}
            <Animated.View
              style={[
                styles.featuredGlow,
                {
                  backgroundColor: variant.accentColor,
                  opacity: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.15, 0.35],
                  }),
                },
              ]}
            />

            {/* Top badges */}
            <View style={styles.topRow}>
              <View style={[styles.featuredBadge, { backgroundColor: variant.accentColor }]}>
                <Ionicons name="star" size={10} color="#fff" />
                <Text style={styles.featuredBadgeText}>FEATURED</Text>
              </View>
              {isVideo && (
                <View style={styles.videoBadge}>
                  <Ionicons name="play" size={12} color="#fff" />
                </View>
              )}
            </View>

            {/* Bottom content */}
            <View style={styles.featuredContent}>
              <View style={styles.avatarRow}>
                <View style={[styles.miniAvatar, { borderColor: variant.accentColor }]}>
                  {item.avatar ? (
                    <Image source={{ uri: String(item.avatar) }} style={styles.miniAvatarImg} />
                  ) : (
                    <Ionicons name="person" size={12} color="#fff" />
                  )}
                </View>
                <Text style={styles.username} numberOfLines={1}>{item.user || 'watcher'}</Text>
              </View>
              <Text style={styles.featuredCaption} numberOfLines={2}>
                {item.movie || item.review || ''}
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="heart" size={12} color="#ff4757" />
                  <Text style={styles.statText}>{likes}</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="chatbubble" size={11} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.statText}>{comments}</Text>
                </View>
              </View>
            </View>

            {/* Glass border */}
            <View style={[styles.glassBorder, { borderRadius: 20 }]} />
          </View>
        );

      case 'story':
        return (
          <View style={[styles.tileInner, { borderRadius: 18 }]}>
            {/* Full bleed image */}
            {hasImage ? (
              <Image
                source={item.image || { uri: String(item.avatar) }}
                style={[styles.media, { borderRadius: 18 }]}
              />
            ) : (
              <LinearGradient
                colors={['rgba(30,30,40,1)', variant.accentColor + '40']}
                style={[styles.media, { borderRadius: 18 }]}
              />
            )}

            {/* Gradient overlay */}
            <LinearGradient
              colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.8)']}
              locations={[0, 0.4, 1]}
              style={styles.overlay}
            />

            {/* Story ring avatar at top */}
            <View style={styles.storyTop}>
              <View style={[styles.storyRing, { borderColor: variant.accentColor }]}>
                {item.avatar ? (
                  <Image source={{ uri: String(item.avatar) }} style={styles.storyAvatar} />
                ) : (
                  <View style={[styles.storyAvatarPlaceholder, { backgroundColor: variant.accentColor }]}>
                    <Ionicons name="person" size={14} color="#fff" />
                  </View>
                )}
              </View>
              {isVideo && (
                <View style={[styles.storyPlayBadge, { backgroundColor: variant.accentColor }]}>
                  <Ionicons name="play" size={10} color="#fff" />
                </View>
              )}
            </View>

            {/* Bottom content */}
            <View style={styles.storyBottom}>
              <Text style={styles.storyUser} numberOfLines={1}>{item.user || 'watcher'}</Text>
              <Text style={styles.storyCaption} numberOfLines={2}>
                {item.movie || item.review || ''}
              </Text>
            </View>

            {/* Accent line */}
            <View style={[styles.storyAccentLine, { backgroundColor: variant.accentColor }]} />
          </View>
        );

      case 'minimal':
        return (
          <View style={[styles.tileInner, styles.minimalTile, { borderRadius: 14 }]}>
            {/* Blurred background */}
            {Platform.OS === 'ios' ? (
              <BlurView intensity={30} tint="dark" style={[styles.media, { borderRadius: 14 }]} />
            ) : (
              <View style={[styles.media, styles.androidMinimalBg, { borderRadius: 14 }]} />
            )}

            {/* Small thumbnail */}
            <View style={styles.minimalContent}>
              <View style={[styles.minimalThumb, { borderColor: variant.accentColor + '40' }]}>
                {hasImage ? (
                  <Image
                    source={item.image || { uri: String(item.avatar) }}
                    style={styles.minimalThumbImg}
                  />
                ) : (
                  <LinearGradient
                    colors={[variant.accentColor, '#1a1a2e']}
                    style={styles.minimalThumbImg}
                  />
                )}
                {isVideo && (
                  <View style={styles.minimalPlayIcon}>
                    <Ionicons name="play" size={14} color="#fff" />
                  </View>
                )}
              </View>
              <View style={styles.minimalText}>
                <Text style={styles.minimalUser} numberOfLines={1}>{item.user || 'watcher'}</Text>
                <Text style={styles.minimalCaption} numberOfLines={1}>
                  {item.movie || item.review || ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
            </View>
          </View>
        );

      default: // 'card'
        return (
          <View style={[styles.tileInner, { borderRadius: 16 }]}>
            {/* Background */}
            {hasImage ? (
              <Image
                source={item.image || { uri: String(item.avatar) }}
                style={[styles.media, { borderRadius: 16 }]}
                blurRadius={isVideo ? 6 : 0}
              />
            ) : (
              <LinearGradient
                colors={[variant.accentColor + '30', 'rgba(15,15,25,0.95)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.media, { borderRadius: 16 }]}
              />
            )}

            {/* Overlay */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.75)']}
              style={styles.overlay}
            />

            {/* Video indicator */}
            {isVideo && (
              <View style={styles.cardVideoBadge}>
                <View style={[styles.cardPlayCircle, { backgroundColor: variant.accentColor }]}>
                  <Ionicons name="play" size={16} color="#fff" style={{ marginLeft: 2 }} />
                </View>
              </View>
            )}

            {/* Content */}
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardAvatar, { borderColor: variant.accentColor }]}>
                  {item.avatar ? (
                    <Image source={{ uri: String(item.avatar) }} style={styles.cardAvatarImg} />
                  ) : (
                    <Ionicons name="person" size={10} color="#fff" />
                  )}
                </View>
                <Text style={styles.cardUser} numberOfLines={1}>{item.user || 'watcher'}</Text>
              </View>
              <Text style={styles.cardCaption} numberOfLines={2}>
                {item.movie || item.review || ''}
              </Text>
              {likes > 0 && (
                <View style={styles.cardLikes}>
                  <Ionicons name="heart" size={10} color="#ff4757" />
                  <Text style={styles.cardLikesText}>{likes}</Text>
                </View>
              )}
            </View>

            {/* Subtle border */}
            <View style={[styles.cardBorder, { borderRadius: 16 }]} />
          </View>
        );
    }
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={`Open post by ${item.user || 'watcher'}`}
    >
      <Animated.View
        style={[
          styles.tileWrap,
          {
            width: columnWidth,
            height,
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {renderContent()}
      </Animated.View>
    </Pressable>
  );
}

export const FeedCollageTilePlaceholder = memo(function FeedCollageTilePlaceholder({
  columnWidth,
  index,
}: {
  columnWidth: number;
  index: number;
}) {
  const variant = useMemo(() => getCollageVariant(String(index)), [index]);
  const height = computeTileHeight(columnWidth, variant.shape, variant.size);
  
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const borderRadius = variant.shape === 'story' ? 18 : variant.shape === 'featured' ? 20 : variant.shape === 'minimal' ? 14 : 16;

  return (
    <View style={[styles.skeleton, { width: columnWidth, height, borderRadius }]}>
      <Animated.View
        style={[
          styles.shimmer,
          {
            transform: [{
              translateX: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-columnWidth, columnWidth],
              }),
            }],
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.05)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
    </View>
  );
});

export default memo(FeedCollageTile);

const styles = StyleSheet.create({
  tileWrap: {
    overflow: 'visible',
  },
  tileInner: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  media: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },

  // Featured variant
  featuredGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    height: 80,
    borderRadius: 40,
  },
  topRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  featuredBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  videoBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredContent: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  miniAvatarImg: {
    width: '100%',
    height: '100%',
  },
  username: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  featuredCaption: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },

  // Story variant
  storyTop: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  storyRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    padding: 2,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  storyAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  storyAvatarPlaceholder: {
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyPlayBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
    marginBottom: -2,
  },
  storyBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
  },
  storyUser: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  storyCaption: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  storyAccentLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },

  // Minimal variant
  minimalTile: {
    backgroundColor: 'rgba(25,25,35,0.9)',
  },
  androidMinimalBg: {
    backgroundColor: 'rgba(30,30,45,0.95)',
  },
  minimalContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
  },
  minimalThumb: {
    width: 50,
    height: 50,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
  },
  minimalThumbImg: {
    width: '100%',
    height: '100%',
  },
  minimalPlayIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  minimalText: {
    flex: 1,
    minWidth: 0,
  },
  minimalUser: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  minimalCaption: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '500',
  },

  // Card variant
  cardVideoBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPlayCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  cardContent: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cardAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  cardAvatarImg: {
    width: '100%',
    height: '100%',
  },
  cardUser: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  cardCaption: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  cardLikes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  cardLikesText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
  },
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  // Skeleton
  skeleton: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
  },
});
