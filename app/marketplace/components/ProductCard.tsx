import React, { useEffect, useRef, memo } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import { formatKsh } from '../../../lib/money';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  description: string;
  sellerName?: string;
  sellerAvatar?: string | null;
  promoted?: boolean;
  discount?: number;
  rating?: number;
  soldCount?: number;
}

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onMessage?: () => void;
  index?: number;
}

const ProductCard = memo(function ProductCard({ product, onPress, onMessage, index = 0 }: ProductCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shineAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Cinematic shine sweep effect
  useEffect(() => {
    const delay = (index % 4) * 300;
    const timer = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(4000 + (index % 3) * 1500),
          Animated.timing(shineAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(shineAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  // Promoted items get a pulsing glow
  useEffect(() => {
    if (product.promoted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [product.promoted]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      tension: 300,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 200,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const hasDiscount = product.discount && product.discount > 0;
  const originalPrice = hasDiscount ? Math.round(product.price / (1 - product.discount! / 100)) : null;
  const rating = product.rating || (4 + Math.random()).toFixed(1);

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        {
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      {/* Promoted glow effect */}
      {product.promoted && (
        <Animated.View
          style={[
            styles.promotedGlow,
            {
              opacity: glowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.7],
              }),
            },
          ]}
        />
      )}

      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        delayPressIn={0}
      >
        {/* Image container */}
        <View style={styles.imageContainer}>
          <ExpoImage
            source={{ uri: product.imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />

          {/* Image overlay gradient */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
            locations={[0.4, 0.7, 1]}
            style={styles.imageGradient}
          />

          {/* Top badges row */}
          <View style={styles.badgesRow}>
            {product.promoted && (
              <View style={styles.promotedBadge}>
                <LinearGradient
                  colors={['#ff8a00', '#e50914']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <Ionicons name="sparkles" size={10} color="#fff" />
                <Text style={styles.promotedText}>AD</Text>
              </View>
            )}
            {hasDiscount && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>-{product.discount}%</Text>
              </View>
            )}
          </View>

          {/* Rating badge */}
          <View style={styles.ratingBadge}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={40} tint="dark" style={styles.ratingBlur}>
                <Ionicons name="star" size={10} color="#ffd700" />
                <Text style={styles.ratingText}>{rating}</Text>
              </BlurView>
            ) : (
              <View style={styles.ratingAndroid}>
                <Ionicons name="star" size={10} color="#ffd700" />
                <Text style={styles.ratingText}>{rating}</Text>
              </View>
            )}
          </View>

          {/* Price tag */}
          <View style={styles.priceTag}>
            <LinearGradient
              colors={['rgba(229,9,20,0.95)', 'rgba(185,7,16,0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.priceText}>{formatKsh(product.price)}</Text>
            {originalPrice && (
              <Text style={styles.originalPrice}>{formatKsh(originalPrice)}</Text>
            )}
          </View>

          {/* Shine sweep effect */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shineOverlay,
              {
                opacity: shineAnim.interpolate({
                  inputRange: [0, 0.3, 0.7, 1],
                  outputRange: [0, 0.5, 0.5, 0],
                }),
                transform: [
                  {
                    translateX: shineAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-CARD_WIDTH, CARD_WIDTH * 1.5],
                    }),
                  },
                  { skewX: '-20deg' },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.3)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>
        </View>

        {/* Info container */}
        <View style={styles.infoContainer}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>

          {product.soldCount && product.soldCount > 0 && (
            <View style={styles.soldRow}>
              <Ionicons name="flame" size={12} color="#ff6b35" />
              <Text style={styles.soldText}>{product.soldCount}+ sold</Text>
            </View>
          )}

          {/* Seller row */}
          {(product.sellerName || product.sellerAvatar) && (
            <View style={styles.sellerRow}>
              <View style={styles.sellerAvatarWrap}>
                {product.sellerAvatar ? (
                  <ExpoImage
                    source={{ uri: product.sellerAvatar }}
                    style={styles.sellerAvatarImage}
                    contentFit="cover"
                  />
                ) : (
                  <LinearGradient
                    colors={['#667eea', '#764ba2']}
                    style={styles.sellerFallback}
                  >
                    <Text style={styles.sellerInitial}>
                      {(product.sellerName || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                )}
                {/* Online indicator */}
                <View style={styles.onlineIndicator} />
              </View>
              <View style={styles.sellerCopy}>
                <Text style={styles.sellerLabel} numberOfLines={1}>
                  {product.sellerName || 'Creator'}
                </Text>
                <View style={styles.verifiedRow}>
                  <Ionicons name="shield-checkmark" size={10} color="#4ade80" />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              </View>
              {onMessage && (
                <TouchableOpacity
                  style={styles.messageBtn}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    onMessage();
                  }}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <LinearGradient
                    colors={['#06b6d4', '#0891b2']}
                    style={styles.messageBtnGradient}
                  >
                    <Ionicons name="chatbubble" size={14} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Glass border effect */}
        <View style={styles.glassBorder} pointerEvents="none">
          <LinearGradient
            colors={['rgba(255,255,255,0.15)', 'transparent', 'rgba(255,255,255,0.08)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  cardWrapper: {
    width: '48%',
    marginVertical: 8,
  },
  card: {
    backgroundColor: 'rgba(30,30,35,0.9)',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  promotedGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 26,
    backgroundColor: '#e50914',
  },
  imageContainer: {
    width: '100%',
    height: 160,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  badgesRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    gap: 6,
  },
  promotedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  promotedText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  discountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#4ade80',
  },
  discountText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 10,
  },
  ratingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  ratingBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  ratingAndroid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  ratingText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
  },
  priceTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  priceText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  originalPrice: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    textDecorationLine: 'line-through',
  },
  shineOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 50,
    left: 0,
  },
  infoContainer: {
    padding: 12,
    gap: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 18,
  },
  soldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  soldText: {
    color: '#ff6b35',
    fontSize: 11,
    fontWeight: '700',
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  sellerAvatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sellerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  sellerFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInitial: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
    borderWidth: 2,
    borderColor: 'rgba(30,30,35,0.9)',
  },
  sellerCopy: {
    flex: 1,
  },
  sellerLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  verifiedText: {
    color: '#4ade80',
    fontSize: 10,
    fontWeight: '600',
  },
  messageBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
  },
  messageBtnGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
});

export default ProductCard;
