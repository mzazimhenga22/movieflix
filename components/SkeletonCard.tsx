import React, { useEffect, useRef, memo } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getResponsiveCardDimensions } from '@/hooks/useResponsive';

interface SkeletonCardProps {
  variant?: 'default' | 'large' | 'compact';
  index?: number;
}

const SkeletonCard = memo(function SkeletonCard({ variant = 'default', index = 0 }: SkeletonCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const shimmerAnim = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    // Stagger shimmer start based on index for wave effect
    const delay = (index % 4) * 150;
    const timeout = setTimeout(() => {
      Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        })
      ).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, [shimmerAnim, index]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-cardWidth * 1.5, cardWidth * 1.5],
  });

  return (
    <View style={[styles.card, { width: cardWidth, marginRight: variant === 'large' ? cardGap + 6 : cardGap, borderRadius }]}>
      <View style={[styles.cardInner, { height: cardHeight, borderRadius }]}>
        {/* Base background matching actual card */}
        <View style={[styles.posterPlaceholder, { borderRadius }]} />

        {/* Bottom gradient overlay matching actual card */}
        <LinearGradient
          colors={['transparent', 'transparent', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.95)']}
          locations={[0, 0.45, 0.75, 1]}
          style={styles.bottomGradient}
        />

        {/* Top gradient matching actual card */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)', 'transparent']}
          locations={[0, 0.25, 0.5]}
          style={styles.topGradient}
        />

        {/* Rating badge placeholder - same position as real card */}
        <View style={styles.ratingBadgeWrap}>
          <View style={styles.ratingBadgePlaceholder} />
        </View>

        {/* My List button placeholder - same position */}
        <View style={styles.myListBtnPlaceholder} />

        {/* Quality badge placeholder - same position */}
        <View style={styles.qualityBadgeRow}>
          <View style={styles.hdBadgePlaceholder} />
        </View>

        {/* Content area placeholders - matching actual card layout */}
        <View style={styles.cardContent}>
          <View style={styles.titlePlaceholder} />
          <View style={styles.genrePills}>
            <View style={styles.genrePillPlaceholder} />
            <View style={[styles.genrePillPlaceholder, { width: 40 }]} />
          </View>
        </View>

        {/* Shimmer effect */}
        <Animated.View
          style={[
            styles.shimmerOverlay,
            { transform: [{ translateX }, { skewX: '-20deg' }] },
          ]}
        >
          <LinearGradient
            colors={[
              'transparent',
              'rgba(255,255,255,0.03)',
              'rgba(255,255,255,0.06)',
              'rgba(255,255,255,0.03)',
              'transparent',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>

        {/* Accent border at bottom matching actual card */}
        <LinearGradient
          colors={['transparent', 'rgba(229,9,20,0.15)', 'rgba(229,9,20,0.08)']}
          style={styles.accentBorder}
        />
      </View>
    </View>
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
  posterPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.04)',
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
  ratingBadgePlaceholder: {
    width: 50,
    height: 26,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  myListBtnPlaceholder: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  qualityBadgeRow: {
    position: 'absolute',
    top: 48,
    left: 10,
    flexDirection: 'row',
    gap: 6,
  },
  hdBadgePlaceholder: {
    width: 30,
    height: 18,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardContent: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  titlePlaceholder: {
    height: 16,
    width: '75%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    marginBottom: 8,
  },
  genrePills: {
    flexDirection: 'row',
    gap: 7,
  },
  genrePillPlaceholder: {
    width: 50,
    height: 18,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    left: 0,
  },
});

export default SkeletonCard;
