import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  PixelRatio,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { recommendProducts } from '@/lib/algo';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useActiveProfile } from '../../hooks/use-active-profile';
import { useMarketplaceCart } from '../../hooks/use-marketplace-cart';
import { formatKsh } from '../../lib/money';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { useAccent } from '../components/AccentContext';
import FlixyAssistant from '../components/FlixyAssistant';
import { findOrCreateConversation, getProfileById, type Profile } from '../messaging/controller';
import { Product as APIProduct, getProducts, trackPromotionClick } from './api';
import ProductCard from './components/ProductCard';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MarketplaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();
  const isCompactLayout = screenWidth < 360 || fontScale > 1.2;
  const headerTopMargin = Math.max(10, insets.top + 8);
  const params = useLocalSearchParams<{ category?: string }>();
  const categoryParam = typeof params.category === 'string' ? params.category : '';
  const cart = useMarketplaceCart();
  const [products, setProducts] = React.useState<APIProduct[]>([]);
  const [algoProducts, setAlgoProducts] = React.useState<APIProduct[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Apply algorithm to products
  useEffect(() => {
    if (products.length > 0) {
      void recommendProducts(products).then(setAlgoProducts);
    }
  }, [products]);

  const CATEGORY_KEYS = React.useMemo(
    () => new Set(['merch', 'digital', 'services', 'promos', 'events', 'lifestyle']),
    []
  );
  const [activeCategory, setActiveCategory] = React.useState(() =>
    CATEGORY_KEYS.has(categoryParam) ? categoryParam : 'merch'
  );
  const [fabExpanded, setFabExpanded] = React.useState(false);
  const activeProfile = useActiveProfile();
  const activeProfileName = activeProfile?.name ?? 'creator';
  const [messagingBusy, setMessagingBusy] = React.useState(false);

  const { setAccentColor } = useAccent();
  const { currentPlan } = useSubscription();

  // Animation values
  const headerAnim = useRef(new Animated.Value(0)).current;
  const heroAnim = useRef(new Animated.Value(0)).current;
  const tabsAnim = useRef(new Animated.Value(0)).current;
  const productsAnim = useRef(new Animated.Value(0)).current;
  const fabAnim = useRef(new Animated.Value(0)).current;
  const fabRotateAnim = useRef(new Animated.Value(0)).current;
  const fabPulseAnim = useRef(new Animated.Value(1)).current;

  // Floating particles
  const particles = useRef(
    Array.from({ length: 12 }, () => ({
      x: new Animated.Value(Math.random() * 100),
      y: new Animated.Value(Math.random() * 100),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.3 + Math.random() * 0.7),
    }))
  ).current;

  // Ambient orbs
  const orbAnim1 = useRef(new Animated.Value(0)).current;
  const orbAnim2 = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  const categories = [
    { key: 'merch', label: 'Movies & Merch', icon: 'film-outline' },
    { key: 'digital', label: 'Digital', icon: 'color-palette-outline' },
    { key: 'services', label: 'Services', icon: 'videocam-outline' },
    { key: 'promos', label: 'Promos', icon: 'megaphone-outline' },
    { key: 'events', label: 'Events', icon: 'ticket-outline' },
    { key: 'lifestyle', label: 'Lifestyle', icon: 'bag-outline' },
  ];

  const monetizationHighlights = [
    { icon: 'sparkles', label: 'Top sellers earn KSh 500k+/mo', color: '#FFD166' },
    { icon: 'flash', label: 'Instant payouts weekly', color: '#4ADE80' },
    { icon: 'shield-checkmark', label: 'Safer checkout & support', color: '#93C5FD' },
  ];

  // Start entrance animations
  useEffect(() => {
    Animated.stagger(100, [
      Animated.spring(headerAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(heroAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(tabsAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(productsAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(fabAnim, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
    ]).start();

    // Floating particles animation
    particles.forEach((particle, i) => {
      const animateParticle = () => {
        particle.y.setValue(110);
        particle.opacity.setValue(0);
        particle.x.setValue(5 + Math.random() * 90);

        Animated.parallel([
          Animated.timing(particle.y, {
            toValue: -10,
            duration: 10000 + Math.random() * 5000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(particle.opacity, { toValue: 0.6, duration: 2000, useNativeDriver: true }),
            Animated.delay(5000),
            Animated.timing(particle.opacity, { toValue: 0, duration: 3000, useNativeDriver: true }),
          ]),
        ]).start(() => animateParticle());
      };

      setTimeout(animateParticle, i * 800);
    });

    // FAB pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulseAnim, { toValue: 1.1, duration: 1500, useNativeDriver: true }),
        Animated.timing(fabPulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();

    // Ambient orbs
    Animated.loop(
      Animated.sequence([
        Animated.timing(orbAnim1, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(orbAnim1, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(orbAnim2, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(orbAnim2, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  React.useEffect(() => {
    const fetchProducts = async () => {
      try {
        const fetchedProducts = await getProducts();
        setProducts(fetchedProducts);
      } catch (error: any) {
        console.error('Error fetching products:', error);
        Alert.alert('Error', 'Failed to load products. Please try again later.');
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  React.useEffect(() => {
    if (CATEGORY_KEYS.has(categoryParam)) setActiveCategory(categoryParam);
  }, [CATEGORY_KEYS, categoryParam]);

  const showPlaceholders = loading && products.length === 0;

  const handleMessageSeller = React.useCallback(
    async (product: APIProduct) => {
      if (messagingBusy) return;
      if (!product.sellerProfileId && !product.sellerId) {
        Alert.alert('Unavailable', 'Seller messaging is unavailable for this listing.');
        return;
      }
      setMessagingBusy(true);
      try {
        const profile =
          (product.sellerProfileId && (await getProfileById(product.sellerProfileId))) ||
          (await getProfileById(product.sellerId));

        if (!profile) {
          Alert.alert('Unavailable', 'Seller profile not found yet.');
          return;
        }

        const sellerProfile: Profile = {
          id: profile.id,
          displayName: profile.displayName || product.sellerName || 'Seller',
          photoURL: profile.photoURL || product.sellerAvatar || product.imageUrl,
        };

        const conversationId = await findOrCreateConversation(sellerProfile);
        router.push({ pathname: '/messaging/chat/[id]', params: { id: conversationId } });
      } catch (err) {
        console.error('[marketplace] message seller failed', err);
        Alert.alert('Unable to start chat', 'Please try again in a moment.');
      } finally {
        setMessagingBusy(false);
      }
    },
    [messagingBusy, router]
  );

  const validProducts = algoProducts.filter((p): p is APIProduct & { id: string } => !!p.id);

  const grouped = categories.reduce((acc, cat) => {
    acc[cat.key] = validProducts.filter(p => (p.categoryKey || p.category) === cat.key);
    return acc;
  }, {} as Record<string, APIProduct[]>);

  const getEndsAtMs = (value: any): number | null => {
    if (!value) return null;
    if (value instanceof Date) return value.getTime();
    if (typeof value?.toDate === 'function') {
      try {
        const d = value.toDate();
        return d instanceof Date ? d.getTime() : null;
      } catch {
        return null;
      }
    }
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const ms = Date.parse(value);
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  };

  const nowMs = Date.now();
  const activeCategoryProducts = grouped[activeCategory] || [];
  const promotedActive = activeCategoryProducts
    .filter((p) => {
      if (!p.promoted) return false;
      const endsAt = getEndsAtMs((p as any).promotionEndsAt);
      return typeof endsAt === 'number' ? endsAt > nowMs : true;
    })
    .sort((a, b) => ((b as any).promotionBid || 0) - ((a as any).promotionBid || 0));

  const promotedIds = new Set(promotedActive.map((p: any) => p.id));
  const nonPromoted = activeCategoryProducts.filter((p: any) => !promotedIds.has(p.id));
  const featured = [...promotedActive, ...nonPromoted].slice(0, 4);

  const handleFabPress = useCallback(() => {
    Animated.parallel([
      Animated.spring(fabPulseAnim, { toValue: 0.9, tension: 200, friction: 10, useNativeDriver: true }),
      Animated.timing(fabRotateAnim, { toValue: fabExpanded ? 0 : 1, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      Animated.spring(fabPulseAnim, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }).start();
      setFabExpanded(!fabExpanded);
    });
  }, [fabExpanded]);

  return (
    <ScreenWrapper>
      <StatusBar barStyle="light-content" backgroundColor="#0E0E0E" />
      <LinearGradient
        colors={['#e50914', '#150a13', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.gradient}
      >
        {/* Animated ambient orbs */}
        <Animated.View
          style={[
            styles.bgOrbPrimary,
            {
              transform: [
                { translateY: orbAnim1.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
                { translateX: orbAnim1.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(125,216,255,0.25)', 'rgba(255,255,255,0)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.bgOrbSecondary,
            {
              transform: [
                { translateY: orbAnim2.interpolate({ inputRange: [0, 1], outputRange: [0, -25] }) },
                { translateX: orbAnim2.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(229,9,20,0.2)', 'rgba(255,255,255,0)']}
            start={{ x: 0.8, y: 0 }}
            end={{ x: 0.2, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>

        {/* Floating particles */}
        {particles.map((particle, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.floatingParticle,
              {
                backgroundColor: i % 3 === 0 ? '#e50914' : i % 3 === 1 ? '#7dd8ff' : '#ffd700',
                opacity: particle.opacity,
                transform: [
                  { translateX: particle.x.interpolate({ inputRange: [0, 100], outputRange: [0, screenWidth] }) },
                  { translateY: particle.y.interpolate({ inputRange: [0, 100], outputRange: [0, SCREEN_HEIGHT] }) },
                  { scale: particle.scale },
                ],
              },
            ]}
          />
        ))}

        <View style={styles.container}>
          {/* Liquid Glass Header */}
          <Animated.View
            style={[
              styles.headerWrap,
              { marginTop: headerTopMargin },
              {
                opacity: headerAnim,
                transform: [
                  { translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) },
                ],
              },
            ]}
          >
            {Platform.OS === 'ios' ? (
              <BlurView intensity={40} tint="dark" style={styles.headerBlur}>
                <HeaderContent
                  isCompactLayout={isCompactLayout}
                  activeProfileName={activeProfileName}
                  cart={cart}
                  router={router}
                  showPlaceholders={showPlaceholders}
                  validProducts={validProducts}
                  categories={categories}
                />
              </BlurView>
            ) : (
              <View style={styles.headerAndroid}>
                <HeaderContent
                  isCompactLayout={isCompactLayout}
                  activeProfileName={activeProfileName}
                  cart={cart}
                  router={router}
                  showPlaceholders={showPlaceholders}
                  validProducts={validProducts}
                  categories={categories}
                />
              </View>
            )}

            {/* Glass border highlights */}
            <View style={styles.headerBorderTop} pointerEvents="none" />
            <View style={styles.headerBorderBottom} pointerEvents="none" />
          </Animated.View>

          {currentPlan === 'free' && (
            <Animated.View
              style={[
                styles.upgradeBanner,
                {
                  opacity: heroAnim,
                  transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                },
              ]}
            >
              <LinearGradient
                colors={['rgba(229,9,20,0.9)', 'rgba(185,7,16,0.9)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.upgradeBannerGradient}
              >
                <View style={styles.upgradeBannerContent}>
                  <Ionicons name="star" size={20} color="#fff" />
                  <View style={styles.upgradeBannerText}>
                    <Text style={styles.upgradeBannerTitle}>Upgrade to Plus</Text>
                    <Text style={styles.upgradeBannerSubtitle}>
                      Unlock unlimited profiles & premium features
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.upgradeBannerButton}
                    onPress={() => router.push('/premium?source=marketplace')}
                  >
                    <Text style={styles.upgradeBannerButtonText}>Upgrade</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Animated.View>
          )}

          <ScrollView contentContainerStyle={styles.scrollViewContent} showsVerticalScrollIndicator={false}>
            {/* Hero Promo Section */}
            <Animated.View
              style={[
                styles.heroPromo,
                {
                  opacity: heroAnim,
                  transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
                },
              ]}
            >
              <LinearGradient
                colors={['rgba(229,9,20,0.15)', 'rgba(0,0,0,0.4)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.heroCopy}>
                <View style={styles.heroEyebrowRow}>
                  <View style={styles.heroEyebrowDot} />
                  <Text style={styles.heroEyebrow}>Earn on MovieFlix</Text>
                </View>
                <Text style={styles.heroTitle}>Sell merch, drops & services</Text>
                <Text style={styles.heroSubtitle}>Launch in minutes. Keep more of what you earn.</Text>
                <View style={styles.heroBadges}>
                  {monetizationHighlights.map((h) => (
                    <View key={h.label} style={[styles.heroBadge, { borderColor: `${h.color}40`, backgroundColor: `${h.color}15` }]}>
                      <Ionicons name={h.icon as any} size={14} color={h.color} />
                      <Text style={[styles.heroBadgeText, { color: h.color }]}>{h.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.heroCtas}>
                  <TouchableOpacity style={styles.sellCta} onPress={() => router.push('/marketplace/sell')}>
                    <LinearGradient
                      colors={['#e50914', '#b20710']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <Text style={styles.sellCtaText}>Start selling</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.promoteCta} onPress={() => router.push('/marketplace/promote')}>
                    <Text style={styles.promoteCtaText}>Promote a drop</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.heroStats}>
                {[
                  { value: '2.4k', label: 'Active sellers' },
                  { value: formatKsh(120_000_000, { compact: true }), label: 'GMV last 30d' },
                  { value: '4.9★', label: 'Buyer trust' },
                ].map((stat, idx) => (
                  <View key={stat.label} style={styles.heroStatCard}>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <Text style={styles.heroStatNumber}>{stat.value}</Text>
                    <Text style={styles.heroStatLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>

              {/* Glass border */}
              <View style={styles.heroBorder} pointerEvents="none" />
            </Animated.View>

            {/* Category Tabs */}
            <Animated.View
              style={[
                styles.tabsContainer,
                {
                  opacity: tabsAnim,
                  transform: [{ translateY: tabsAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                },
              ]}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabsRow}
              >
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.tab, activeCategory === cat.key && styles.tabActive]}
                    onPress={() => setActiveCategory(cat.key)}
                    activeOpacity={0.8}
                  >
                    {activeCategory === cat.key && (
                      <LinearGradient
                        colors={['#e50914', '#b20710']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                      />
                    )}
                    <Ionicons
                      name={cat.icon as any}
                      size={16}
                      color={activeCategory === cat.key ? '#fff' : 'rgba(255,255,255,0.7)'}
                    />
                    <Text style={[styles.tabText, activeCategory === cat.key && styles.tabTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>

            {/* Featured Section */}
            <Animated.View
              style={[
                styles.sectionBlock,
                {
                  opacity: productsAnim,
                  transform: [{ translateY: productsAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={styles.sectionAccent} />
                  <View>
                    <Text style={styles.sectionHeader}>Featured</Text>
                    <Text style={styles.sectionSub}>Curated drops for high intent buyers</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.seeAllBtn}>
                  <Text style={styles.seeAllText}>See all</Text>
                  <Ionicons name="chevron-forward" size={14} color="#e50914" />
                </TouchableOpacity>
              </View>
              <View style={styles.productsGrid}>
                {showPlaceholders
                  ? Array.from({ length: 4 }).map((_, idx) => (
                    <SkeletonCard key={`featured-skel-${idx}`} />
                  ))
                  : featured.map((product, idx) => (
                    <ProductCard
                      key={product.id}
                      product={product as any}
                      index={idx}
                      onPress={() => {
                        if ((product as any)?.id && (product as any)?.promoted) {
                          const placement = ((product as any).promotionPlacement || 'feed') as any;
                          void trackPromotionClick({ productId: String((product as any).id), placement }).catch(() => { });
                        }
                        router.push((`/marketplace/${product.id}`) as any);
                      }}
                      onMessage={() => handleMessageSeller(product as any)}
                    />
                  ))}
              </View>
            </Animated.View>

            {/* Category Section */}
            <Animated.View
              style={[
                styles.sectionBlock,
                {
                  opacity: productsAnim,
                  transform: [{ translateY: productsAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.sectionAccent, { backgroundColor: '#7dd8ff' }]} />
                  <View>
                    <Text style={styles.sectionHeader}>
                      {categories.find(c => c.key === activeCategory)?.label}
                    </Text>
                    <Text style={styles.sectionSub}>Browse sellers, book services, or buy merch</Text>
                  </View>
                </View>
              </View>
              <View style={styles.productsGrid}>
                {showPlaceholders
                  ? Array.from({ length: 6 }).map((_, idx) => (
                    <SkeletonCard key={`cat-skel-${idx}`} />
                  ))
                  : grouped[activeCategory]?.map((product, idx) => (
                    <ProductCard
                      key={product.id}
                      product={product as any}
                      index={idx}
                      onPress={() => {
                        if ((product as any)?.id && (product as any)?.promoted) {
                          const placement = ((product as any).promotionPlacement || 'feed') as any;
                          void trackPromotionClick({ productId: String((product as any).id), placement }).catch(() => { });
                        }
                        router.push((`/marketplace/${product.id}`) as any);
                      }}
                      onMessage={() => handleMessageSeller(product as any)}
                    />
                  ))}
                {!loading && grouped[activeCategory]?.length === 0 && (
                  <View style={styles.emptyState}>
                    <Ionicons name="cube-outline" size={48} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.emptyText}>No products yet in this category</Text>
                  </View>
                )}
              </View>
            </Animated.View>

            {/* Rules Section */}
            <View style={styles.rulesSection}>
              <LinearGradient
                colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.rulesHeader}>
                <Ionicons name="shield-checkmark" size={20} color="#4ade80" />
                <Text style={styles.rulesTitle}>Marketplace Rules & Safety</Text>
              </View>
              <Text style={styles.rulesText}>
                No pirated content, account sharing, adult/drugs/weapons, scams, or fake giveaways. Only fan-made/original designs allowed. All listings are moderated.
              </Text>
            </View>
          </ScrollView>

          {/* Animated FAB */}
          <Animated.View
            style={[
              styles.fabContainer,
              {
                transform: [
                  { scale: Animated.multiply(fabAnim, fabPulseAnim) },
                  { rotate: fabRotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] }) },
                ],
              },
            ]}
          >
            <TouchableOpacity style={styles.fab} onPress={handleFabPress} activeOpacity={1}>
              <LinearGradient
                colors={['#ff8a00', '#e50914']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fabGradient}
              >
                <Ionicons name="add" size={28} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Sub FABs */}
          {fabExpanded && (
            <>
              <TouchableOpacity
                style={[styles.subFab, { bottom: 190 }]}
                onPress={() => {
                  setFabExpanded(false);
                  router.push('/marketplace/sell');
                }}
                activeOpacity={0.9}
              >
                <LinearGradient colors={['#ff8a00', '#ff416c']} style={styles.subFabGradient}>
                  <Ionicons name="pricetag-outline" size={20} color="#fff" />
                </LinearGradient>
                <View style={styles.subFabLabel}>
                  <Text style={styles.subFabLabelText}>Sell</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subFab, { bottom: 260 }]}
                onPress={() => {
                  setFabExpanded(false);
                  router.push('/marketplace/promote');
                }}
                activeOpacity={0.9}
              >
                <LinearGradient colors={['#43cea2', '#185a9d']} style={styles.subFabGradient}>
                  <Ionicons name="megaphone-outline" size={20} color="#fff" />
                </LinearGradient>
                <View style={styles.subFabLabel}>
                  <Text style={styles.subFabLabelText}>Promote</Text>
                </View>
              </TouchableOpacity>
            </>
          )}

          {/* Flixy Assistant - Surprise helper in marketplace! */}
          <FlixyAssistant screen="marketplace" position="bottom-left" />
        </View>
      </LinearGradient>
    </ScreenWrapper>
  );
}

// Header Content Component
function HeaderContent({
  isCompactLayout,
  activeProfileName,
  cart,
  router,
  showPlaceholders,
  validProducts,
  categories,
}: any) {
  return (
    <>
      <View style={[styles.headerBar, isCompactLayout && styles.headerBarCompact]}>
        <View style={styles.titleRow}>
          <View style={styles.accentDot} />
          <View>
            <Text style={styles.headerEyebrow}>Fan Marketplace</Text>
            <Text style={[styles.headerGreeting, isCompactLayout && styles.headerGreetingCompact]}>
              Hey, {activeProfileName}
            </Text>
            <Text style={[styles.headerText, isCompactLayout && styles.headerTextCompact]}>
              Collectibles & Creators
            </Text>
          </View>
        </View>

        <View style={[styles.headerIcons, isCompactLayout && styles.headerIconsCompact]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/marketplace/cart')}>
            <LinearGradient colors={['#e50914', '#b20710']} style={styles.iconBg}>
              <Ionicons name="cart" size={20} color="#fff" />
              {cart.count > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cart.count > 9 ? '9+' : String(cart.count)}</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/search')}>
            <LinearGradient colors={['#e50914', '#b20710']} style={styles.iconBg}>
              <Ionicons name="search" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/profile')}>
            <LinearGradient colors={['#e50914', '#b20710']} style={styles.iconBg}>
              <Ionicons name="person-circle" size={22} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.headerMetaRow}>
        <View style={styles.metaPill}>
          <Ionicons name="storefront" size={12} color="#fff" />
          {showPlaceholders ? (
            <View style={styles.metaSkeletonBar} />
          ) : (
            <Text style={styles.metaText}>{validProducts.length} items</Text>
          )}
        </View>
        <View style={[styles.metaPill, styles.metaPillSoft]}>
          <Ionicons name="grid-outline" size={12} color="#fff" />
          <Text style={styles.metaText}>{categories.length} categories</Text>
        </View>
        <View style={[styles.metaPill, styles.metaPillOutline]}>
          <Ionicons name="shield-checkmark" size={12} color="#4ade80" />
          <Text style={styles.metaText}>Verified</Text>
        </View>
      </View>
    </>
  );
}

// Skeleton Card Component
function SkeletonCard() {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.skeletonCard}>
      <Animated.View
        style={[
          styles.skeletonImage,
          {
            opacity: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }),
          },
        ]}
      />
      <View style={styles.skeletonInfo}>
        <Animated.View
          style={[
            styles.skeletonLine,
            { opacity: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.5] }) },
          ]}
        />
        <Animated.View
          style={[
            styles.skeletonLine,
            styles.skeletonLineShort,
            { opacity: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.5] }) },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    top: -80,
    left: -100,
    overflow: 'hidden',
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 350,
    height: 350,
    borderRadius: 175,
    bottom: 50,
    right: -80,
    overflow: 'hidden',
  },
  floatingParticle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  container: {
    flex: 1,
  },
  headerWrap: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  headerBlur: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  headerAndroid: {
    backgroundColor: 'rgba(20,20,25,0.85)',
    borderRadius: 20,
  },
  headerBorderTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerBorderBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  headerBar: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBarCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    rowGap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e50914',
    shadowColor: '#e50914',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headerGreeting: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  headerGreetingCompact: {
    fontSize: 12,
  },
  headerText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerTextCompact: {
    fontSize: 17,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconsCompact: {
    justifyContent: 'flex-start',
  },
  iconBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  iconBg: {
    padding: 10,
    borderRadius: 12,
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#ff8a00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  headerMetaRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexWrap: 'wrap',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  metaPillSoft: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  metaPillOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
  },
  metaText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  metaSkeletonBar: {
    width: 40,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  scrollViewContent: {
    paddingBottom: 180,
    paddingHorizontal: 12,
  },
  heroPromo: {
    marginBottom: 16,
    borderRadius: 20,
    padding: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroCopy: {
    gap: 8,
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroEyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ade80',
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  heroBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  heroBadgeText: {
    fontWeight: '700',
    fontSize: 11,
  },
  heroCtas: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  sellCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    overflow: 'hidden',
  },
  sellCtaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  promoteCta: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  promoteCtaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  heroStatCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroStatNumber: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 2,
  },
  tabsContainer: {
    marginBottom: 16,
  },
  tabsRow: {
    paddingHorizontal: 4,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  tabActive: {
    borderColor: '#e50914',
  },
  tabText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  sectionBlock: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionAccent: {
    width: 4,
    height: 36,
    borderRadius: 2,
    backgroundColor: '#e50914',
  },
  sectionHeader: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  sectionSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(229,9,20,0.15)',
  },
  seeAllText: {
    color: '#e50914',
    fontSize: 12,
    fontWeight: '700',
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  emptyState: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  rulesSection: {
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  rulesTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  rulesText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    lineHeight: 18,
  },
  fabContainer: {
    position: 'absolute',
    right: 18,
    bottom: 120,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#e50914',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subFab: {
    position: 'absolute',
    right: 22,
    flexDirection: 'row',
    alignItems: 'center',
  },
  subFabGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  subFabLabel: {
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  subFabLabelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  skeletonCard: {
    width: '48%',
    borderRadius: 16,
    marginVertical: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  skeletonImage: {
    width: '100%',
    height: 160,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skeletonInfo: {
    padding: 12,
    gap: 8,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skeletonLineShort: {
    width: '60%',
  },
  upgradeBanner: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  upgradeBannerGradient: {
    padding: 14,
  },
  upgradeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upgradeBannerText: {
    flex: 1,
    marginLeft: 12,
  },
  upgradeBannerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  upgradeBannerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    marginTop: 2,
  },
  upgradeBannerButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  upgradeBannerButtonText: {
    color: '#e50914',
    fontWeight: '700',
    fontSize: 12,
  },
});
