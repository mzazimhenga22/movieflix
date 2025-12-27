import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import ScreenWrapper from '../../components/ScreenWrapper';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { useAccent } from '../components/AccentContext';
import { Product as APIProduct, getProducts } from './api';
import { findOrCreateConversation, getProfileById, type Profile } from '../messaging/controller';
import ProductCard from './components/ProductCard';
import { useActiveProfile } from '../../hooks/use-active-profile';
import { useMarketplaceCart } from '../../hooks/use-marketplace-cart';
import { formatKsh } from '../../lib/money';

export default function MarketplaceScreen() {
  const router = useRouter();
  const cart = useMarketplaceCart();
  const [products, setProducts] = React.useState<APIProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeCategory, setActiveCategory] = React.useState('merch');
  const [fabExpanded, setFabExpanded] = React.useState(false);
  const activeProfile = useActiveProfile();
  const activeProfileName = activeProfile?.name ?? 'creator';
  const [messagingBusy, setMessagingBusy] = React.useState(false);

  const { setAccentColor } = useAccent();
  const { currentPlan } = useSubscription();

  React.useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  const categories = [
    { key: 'merch', label: '🎬 Movies & Fan Merch' },
    { key: 'digital', label: '🎨 Digital Creatives' },
    { key: 'services', label: '🎥 Film Services' },
    { key: 'promos', label: '📣 Promotions & Ads' },
    { key: 'events', label: '🎟️ Events & Experiences' },
    { key: 'lifestyle', label: '🛍️ Lifestyle' },
  ];

  const monetizationHighlights = [
    { icon: 'sparkles', label: 'Top sellers earn KSh 500k+/mo', color: '#FFD166' },
    { icon: 'flash', label: 'Instant payouts weekly', color: '#4ADE80' },
    { icon: 'shield-checkmark', label: 'Safer checkout & dispute support', color: '#93C5FD' },
  ];

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

  // Filter out products without an id and narrow types for TS
  const validProducts = products.filter((p): p is APIProduct & { id: string } => !!p.id);

  // Group products by category (assume product.category exists)
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

  // Featured products (first 3 in active category)
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
  const featured = [...promotedActive, ...nonPromoted].slice(0, 3);

  return (
    <ScreenWrapper>
      <StatusBar barStyle="light-content" backgroundColor="#0E0E0E" />
      <LinearGradient
        colors={['#e50914', '#150a13', '#05060f'] as const}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.gradient}
      >
        <LinearGradient
          colors={['rgba(125,216,255,0.18)', 'rgba(255,255,255,0)'] as const}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.bgOrbPrimary}
        />
        <LinearGradient
          colors={['rgba(95,132,255,0.14)', 'rgba(255,255,255,0)'] as const}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={styles.bgOrbSecondary}
        />
        <View style={styles.container}>
          {/* Header (glassy hero) */}
          <View style={styles.headerWrap}>
            <LinearGradient
              colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.4)'] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerGlow}
            />
            <View style={styles.headerBar}>
              <View style={styles.titleRow}>
                <View style={styles.accentDot} />
                <View>
                  <Text style={styles.headerEyebrow}>Fan Marketplace</Text>
                <Text style={styles.headerGreeting}>Hey, {activeProfileName}</Text>
                <Text style={styles.headerText}>Collectibles & Creators</Text>
                </View>
              </View>

              <View style={styles.headerIcons}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/marketplace/cart')}>
                  <LinearGradient
                    colors={['#e50914', '#b20710'] as const}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconBg}
                  >
                    <View>
                      <Ionicons name="cart" size={22} color="#ffffff" />
                      {cart.count > 0 && (
                        <View style={styles.cartBadge}>
                          <Text style={styles.cartBadgeText}>{cart.count > 9 ? '9+' : String(cart.count)}</Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/search')}>
                  <LinearGradient
                    colors={['#e50914', '#b20710'] as const}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconBg}
                  >
                    <Ionicons name="search" size={22} color="#ffffff" style={styles.iconMargin} />
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/profile')}>
                  <LinearGradient
                    colors={['#e50914', '#b20710'] as const}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconBg}
                  >
                    <Ionicons name="person-circle" size={24} color="#ffffff" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.headerMetaRow}>
              <View style={styles.metaPill}>
                <Ionicons name="storefront" size={14} color="#fff" />
                {showPlaceholders ? <View style={styles.metaSkeletonBar} /> : <Text style={styles.metaText}>{validProducts.length} items</Text>}
              </View>
              <View style={[styles.metaPill, styles.metaPillSoft]}>
                <Ionicons name="grid-outline" size={14} color="#fff" />
                <Text style={styles.metaText}>{categories.length} categories</Text>
              </View>
              <View style={[styles.metaPill, styles.metaPillOutline]}>
                <Ionicons name="shield-checkmark" size={14} color="#fff" />
                <Text style={styles.metaText}>Safe & Moderated</Text>
              </View>
            </View>
          </View>

          {currentPlan === 'free' && (
            <View style={styles.upgradeBanner}>
              <LinearGradient
                colors={['rgba(229,9,20,0.9)', 'rgba(185,7,16,0.9)'] as const}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.upgradeBannerGradient}
              >
                <View style={styles.upgradeBannerContent}>
                  <Ionicons name="star" size={20} color="#fff" />
                  <View style={styles.upgradeBannerText}>
                    <Text style={styles.upgradeBannerTitle}>Upgrade to Plus</Text>
                    <Text style={styles.upgradeBannerSubtitle}>
                      Unlock unlimited profiles, premium features & more
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
            </View>
          )}
          <ScrollView contentContainerStyle={styles.scrollViewContent}>
            <View style={styles.heroPromo}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>Earn on MovieFlix</Text>
                <Text style={styles.heroTitle}>Sell merch, drops, and services.</Text>
                <Text style={styles.heroSubtitle}>Launch in minutes. Keep more of what you earn.</Text>
                <View style={styles.heroBadges}>
                  {monetizationHighlights.map((h) => (
                    <View key={h.label} style={[styles.heroBadge, { borderColor: `${h.color}55`, backgroundColor: `${h.color}11` }] }>
                      <Ionicons name={h.icon as any} size={16} color={h.color} />
                      <Text style={[styles.heroBadgeText, { color: h.color }]}>{h.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.heroCtas}>
                  <TouchableOpacity style={styles.sellCta} onPress={() => router.push('/marketplace/sell')}>
                    <Text style={styles.sellCtaText}>Start selling</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.promoteCta} onPress={() => router.push('/marketplace/promote')}>
                    <Text style={styles.promoteCtaText}>Promote a drop</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.heroStats}>
                <View style={styles.heroStatCard}>
                  <Text style={styles.heroStatNumber}>2.4k</Text>
                  <Text style={styles.heroStatLabel}>Active sellers</Text>
                </View>
                <View style={styles.heroStatCard}>
                  <Text style={styles.heroStatNumber}>{formatKsh(120_000_000, { compact: true })}</Text>
                  <Text style={styles.heroStatLabel}>GMV last 30d</Text>
                </View>
                <View style={styles.heroStatCard}>
                  <Text style={styles.heroStatNumber}>4.9★</Text>
                  <Text style={styles.heroStatLabel}>Buyer trust</Text>
                </View>
              </View>
            </View>
            <View style={styles.tabsRow}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.tab, activeCategory === cat.key && styles.tabActive]}
                  onPress={() => setActiveCategory(cat.key)}
                >
                  <Text style={[styles.tabText, activeCategory === cat.key && styles.tabTextActive]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionHeader}>Featured</Text>
              <Text style={styles.sectionSub}>Limited drops curated for high intent buyers.</Text>
              <View style={styles.productsGrid}>
                {showPlaceholders
                  ? Array.from({ length: 4 }).map((_, idx) => (
                      <View key={`featured-skel-${idx}`} style={styles.skeletonCard}>
                        <View style={styles.skeletonImage} />
                        <View style={styles.skeletonInfo}>
                          <View style={styles.skeletonLine} />
                          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                          <View style={styles.skeletonSellerRow}>
                            <View style={styles.skeletonAvatar} />
                            <View style={styles.skeletonSellerCopy}>
                              <View style={[styles.skeletonLine, styles.skeletonLineThin]} />
                              <View style={[styles.skeletonLine, styles.skeletonLineThin, styles.skeletonLineShort]} />
                            </View>
                          </View>
                        </View>
                      </View>
                    ))
                  : featured.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product as any}
                        onPress={() => router.push((`/marketplace/${product.id}`) as any)}
                        onMessage={() => handleMessageSeller(product as any)}
                      />
                    ))}
              </View>
            </View>
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionHeader}>{categories.find(c => c.key === activeCategory)?.label}</Text>
              <Text style={styles.sectionSub}>Browse sellers, book services, or buy merch instantly.</Text>
              <View style={styles.productsGrid}>
                {showPlaceholders
                  ? Array.from({ length: 6 }).map((_, idx) => (
                      <View key={`cat-skel-${idx}`} style={styles.skeletonCard}>
                        <View style={styles.skeletonImage} />
                        <View style={styles.skeletonInfo}>
                          <View style={styles.skeletonLine} />
                          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                        </View>
                      </View>
                    ))
                  : grouped[activeCategory]?.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product as any}
                        onPress={() => router.push((`/marketplace/${product.id}`) as any)}
                        onMessage={() => handleMessageSeller(product as any)}
                      />
                    ))}
                {!loading && grouped[activeCategory]?.length === 0 && (
                  <Text style={styles.emptyText}>No products yet in this category.</Text>
                )}
              </View>
            </View>
            <View style={styles.rulesSection}>
              <Text style={styles.rulesHeader}>Marketplace Rules & Safety</Text>
              <Text style={styles.rulesText}>❌ No pirated movies/series, streaming account sharing, adult/drugs/weapons, scams, or fake giveaways. Only fan-made/original designs allowed. Sellers must prove rights for studio logos. All listings are moderated.</Text>
            </View>
          </ScrollView>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setFabExpanded(!fabExpanded)}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#ff8a00', '#e50914'] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabGradient}
            >
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
          {fabExpanded && (() => {
            const MAIN_FAB_BOTTOM = 120;
            const SUB_FAB_SIZE = 64;
            const SUB_FAB_GAP = 12;
            const firstOffset = SUB_FAB_SIZE + SUB_FAB_GAP;
            const spacing = SUB_FAB_SIZE + SUB_FAB_GAP;
            const items = [
              {
                key: 'sell',
                icon: 'pricetag-outline',
                colors: ['#ff8a00', '#ff416c'] as const,
                onPress: () => router.push('/marketplace/sell'),
              },
              {
                key: 'promote',
                icon: 'megaphone-outline',
                colors: ['#43cea2', '#185a9d'] as const,
                onPress: () => router.push('/marketplace/promote'),
              },
            ];

            return (
              <>
                {items.map((item, idx) => {
                  const bottom = MAIN_FAB_BOTTOM + firstOffset + idx * spacing;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.subFab, { bottom }]}
                      onPress={() => {
                        setFabExpanded(false);
                        item.onPress();
                      }}
                      activeOpacity={0.9}
                    >
                      <LinearGradient
                        colors={item.colors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.subFabGradient}
                      >
                        <Ionicons name={item.icon as any} size={20} color="#FFFFFF" />
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </>
            );
          })()}
        </View>
      </LinearGradient>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
    top: -40,
    left: -60,
    opacity: 0.6,
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    bottom: -80,
    right: -40,
    opacity: 0.55,
  },

  container: {
    flex: 1,
    paddingBottom: 0,
  },
  // Header glass hero
  headerWrap: {
    marginHorizontal: 12,
    marginTop: Platform.OS === 'ios' ? 64 : 48,
    marginBottom: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  headerBar: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e50914',
    shadowColor: '#e50914',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  headerGreeting: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginLeft: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#e50914',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  iconBg: {
    padding: 10,
    borderRadius: 12,
  },
  iconMargin: {
    marginRight: 4,
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#ff8a00',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  headerMetaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  metaPillSoft: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metaPillOutline: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  metaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  metaSkeletonBar: {
    width: 58,
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  scrollViewContent: {
    paddingBottom: 180,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 6,
    gap: 8,
    flexWrap: 'wrap',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  tabText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  sectionBlock: {
    marginBottom: 22,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  sectionHeader: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionSub: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    marginBottom: 10,
  },
  emptyText: {
    color: '#E6E6E6',
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 24,
  },
  rulesSection: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    marginHorizontal: 16,
  },
  rulesHeader: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  rulesText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    lineHeight: 18,
  },
  fab: {
    position: 'absolute',
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    right: 18,
    bottom: 120,
    backgroundColor: '#e50914',
    borderRadius: 36,
    borderWidth: 0,
    borderColor: 'transparent',
    elevation: 12,
    shadowColor: '#e50914',
    shadowOpacity: 0.36,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subFab: {
    position: 'absolute',
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    right: 18,
    backgroundColor: '#e50914',
    borderRadius: 32,
    elevation: 10,
    shadowColor: '#e50914',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  subFabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#E50914',
    marginTop: 10,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  skeletonCard: {
    width: '48%',
    borderRadius: 8,
    marginVertical: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  skeletonImage: {
    width: '100%',
    height: 150,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  skeletonInfo: {
    padding: 10,
    gap: 8,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  skeletonLineThin: {
    height: 10,
  },
  skeletonLineShort: {
    width: '55%',
  },
  skeletonSellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  skeletonAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  skeletonSellerCopy: {
    flex: 1,
    gap: 6,
  },
  heroPromo: {
    marginHorizontal: 12,
    marginBottom: 18,
    borderRadius: 18,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroCopy: {
    gap: 8,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.75)',
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
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  heroBadgeText: {
    fontWeight: '700',
    fontSize: 12,
  },
  heroCtas: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  sellCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#e50914',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  sellCtaText: {
    color: '#fff',
    fontWeight: '800',
  },
  promoteCta: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  promoteCtaText: {
    color: '#fff',
    fontWeight: '700',
  },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  heroStatCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 4,
  },
  heroStatNumber: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginTop: 2,
  },
  upgradeBanner: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  upgradeBannerGradient: {
    padding: 16,
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
    fontSize: 16,
    fontWeight: '700',
  },
  upgradeBannerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  upgradeBannerButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  upgradeBannerButtonText: {
    color: '#e50914',
    fontWeight: '700',
    fontSize: 13,
  },
});
