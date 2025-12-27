import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import MovieList from '../../components/MovieList';
import ScreenWrapper from '../../components/ScreenWrapper';
import { API_BASE_URL, API_KEY } from '../../constants/api';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { Media } from '../../types';
import { useAccent } from '../components/AccentContext';
import BottomNav from '../components/social-feed/BottomNav';
import FeedCard from '../components/social-feed/FeedCard';
import FeedCardPlaceholder from '../components/social-feed/FeedCardPlaceholder';
import { ReviewItem, useSocialReactions } from '../components/social-feed/hooks';
import PostMovieReview from '../components/social-feed/PostMovieReview';
import StoriesRow from '../components/social-feed/StoriesRow';
import FeedTabs from '../components/social-feed/Tabs';
import { getProducts, isProductPromoted, type Product as MarketplaceProduct } from '../marketplace/api';
import { useActiveProfile } from '../../hooks/use-active-profile';
import { findOrCreateConversation, getProfileById, type Profile } from '../messaging/controller';
import RecommendedView from '../components/social-feed/RecommendedView';
import MovieMatchView from '../components/social-feed/MovieMatchView';
import { listenToLiveStreams } from '@/lib/live/liveService';
import type { LiveStream } from '@/lib/live/types';

import NativeAdCard from '../../components/ads/NativeAdCard';
import { injectAdsWithPattern } from '../../lib/ads/sequence';
/* -------------------------------------------------------------------------- */
/*                                Feed types                                  */
/* -------------------------------------------------------------------------- */

type FeedItem =
  | ReviewItem
  | {
      type: 'movie-list';
      id: string;
      title: string;
      movies: Media[];
      onItemPress: (item: Media) => void;
    }
  | {
      type: 'promo-ad';
      id: string;
      product: MarketplaceProduct;
      placement: 'feed' | 'story';
    }
  | {
      type: 'native-ad';
      id: string;
      placement: 'feed';
      product: MarketplaceProduct;
    };

/* -------------------------------------------------------------------------- */
/*                                Main Feed                                   */
/* -------------------------------------------------------------------------- */

const SocialFeed = () => {
  const router = useRouter();
  const { accentColor } = useAccent();
  const { currentPlan } = useSubscription();
  const {
    reviews,
    refreshReviews,
    shuffleReviews,
    handleLike,
    handleBookmark,
    handleComment,
    handleWatch,
    handleShare,
  } = useSocialReactions();

  const scrollY = useRef(new Animated.Value(0)).current;
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'Feed' | 'Recommended' | 'Live' | 'Movie Match'
  >('Feed');
  const [feedMode, setFeedMode] = useState<'timeline' | 'reels'>('timeline');
  const [activeFilter, setActiveFilter] = useState<'All' | 'TopRated' | 'New' | 'ForYou'>('All');

  const [trending, setTrending] = useState<Media[]>([]);
  const [movieReels, setMovieReels] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [promotedProducts, setPromotedProducts] = useState<MarketplaceProduct[]>([]);
  const activeProfile = useActiveProfile();
  const activeProfileName = activeProfile?.name ?? 'watcher';
  const [adMessagingBusy, setAdMessagingBusy] = useState(false);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);

  const HeaderComponent = () => (
    <View style={styles.headerWrap}>
      <LinearGradient
        colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.4)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGlow}
      />
      <View style={styles.headerBar}>
        <View style={styles.titleRow}>
          <View style={styles.accentDot} />
          <View>
            <Text style={styles.headerEyebrow} numberOfLines={1} ellipsizeMode="tail">
              Connect & Share
            </Text>
            <Text style={styles.headerGreeting} numberOfLines={1} ellipsizeMode="tail">
              Welcome, {activeProfileName}
            </Text>
            <Text style={styles.headerText} numberOfLines={1} ellipsizeMode="tail">
              {activeTab === 'Feed'
                ? 'Social Feed'
                : activeTab === 'Recommended'
                  ? 'Recommended'
                  : activeTab === 'Live'
                    ? 'Live'
                    : 'Movie Match'}
            </Text>
          </View>
        </View>

        <View style={styles.headerIcons}>
          <Link href="/messaging" asChild>
            <TouchableOpacity style={styles.iconBtn}>
              <LinearGradient
                colors={['#e50914', '#b20710']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBg}
              >
                <Ionicons name="chatbubble-outline" size={22} color="#ffffff" style={styles.iconMargin} />
              </LinearGradient>
            </TouchableOpacity>
          </Link>
          <Link href="/search" asChild>
            <TouchableOpacity style={styles.iconBtn}>
              <LinearGradient
                colors={['#e50914', '#b20710']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBg}
              >
                <Ionicons name="search" size={22} color="#ffffff" style={styles.iconMargin} />
              </LinearGradient>
            </TouchableOpacity>
          </Link>

          <Link href="/profile" asChild>
            <TouchableOpacity style={styles.iconBtn}>
              <LinearGradient
                colors={['#e50914', '#b20710']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBg}
              >
                <FontAwesome name="user-circle" size={24} color="#ffffff" />
              </LinearGradient>
            </TouchableOpacity>
          </Link>
        </View>
      </View>

      <View style={styles.headerMetaRow}>
        <View style={styles.metaPill}>
          <Ionicons name="people" size={14} color="#fff" />
          <Text style={styles.metaText}>{reviews.length} posts</Text>
        </View>
        <View style={[styles.metaPill, styles.metaPillSoft]}>
          <Ionicons name="flame" size={14} color="#fff" />
          <Text style={styles.metaText}>trending</Text>
        </View>
        <View style={[styles.metaPill, styles.metaPillOutline]}>
          <Ionicons name="star" size={14} color="#fff" />
          <Text style={styles.metaText}>featured</Text>
        </View>
      </View>
    </View>
  );

  useEffect(() => {
    if (activeFilter === 'ForYou') {
      try {
        shuffleReviews();
      } catch {
        // ignore
      }
    }
  }, [activeFilter, shuffleReviews]);

  useEffect(() => {
    if (activeTab !== 'Live') return;
    setLiveLoading(true);
    let didFirst = false;
    const unsubscribe = listenToLiveStreams((streams) => {
      setLiveStreams(streams);
      if (!didFirst) {
        didFirst = true;
        setLiveLoading(false);
      }
    });
    return () => unsubscribe();
  }, [activeTab]);

  /* ------------------------------ Fetch data ------------------------------ */

  useEffect(() => {
    (async () => {
      try {
        const [t, r] = await Promise.all([
          fetch(`${API_BASE_URL}/trending/all/day?api_key=${API_KEY}`).then((x) =>
            x.json()
          ),
          fetch(`${API_BASE_URL}/movie/upcoming?api_key=${API_KEY}`).then((x) =>
            x.json()
          ),
        ]);
        setTrending(t.results || []);
        setMovieReels(r.results || []);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const catalog = await getProducts();
        if (!alive) return;
        setPromotedProducts(catalog.filter((product) => isProductPromoted(product)));
      } catch (err) {
        console.warn('[social-feed] failed to load marketplace promos', err);
        if (alive) setPromotedProducts([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setLoading(!reviews.length);
  }, [reviews]);

  useEffect(() => {
    (async () => {
      try {
        await refreshReviews();
        shuffleReviews();
      } catch {}
    })();
  }, [refreshReviews, shuffleReviews]);

  const handlePromoMessage = useCallback(
    async (product: MarketplaceProduct) => {
      if (adMessagingBusy) return;
      setAdMessagingBusy(true);
      try {
        const profile =
          (product.sellerProfileId && (await getProfileById(product.sellerProfileId))) ||
          (await getProfileById(product.sellerId));
        if (!profile) {
          Alert.alert('Seller offline', 'This seller profile is unavailable right now.');
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
        console.error('[social-feed] promo chat failed', err);
        Alert.alert('Unable to start chat', 'Please try again later.');
      } finally {
        setAdMessagingBusy(false);
      }
    },
    [adMessagingBusy, router]
  );

  /* ------------------------------ Feed items ------------------------------ */

  const prioritizedPromos = useMemo(() => buildPromoPipeline(promotedProducts), [promotedProducts]);

  const filteredReviews = useMemo(() => {
    if (!Array.isArray(reviews)) return [];
    if (activeFilter === 'TopRated') {
      return [...reviews].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    }
    return reviews;
  }, [reviews, activeFilter]);

  const reelsQueue = useMemo(() => {
    return filteredReviews
      .filter((item): item is ReviewItem => 'videoUrl' in item && !!item.videoUrl)
      .slice(0, 40)
      .map((item) => ({
        id: String(item.id),
        mediaType: 'feed',
        title: (item.movie || item.review || 'Reel').slice(0, 120),
        docId: (item as any).docId ?? null,
        videoUrl: item.videoUrl ?? null,
        avatar: (item as any).avatar ?? null,
        user: (item as any).user ?? null,
        likes: (item as any).likes ?? 0,
        commentsCount: (item as any).commentsCount ?? 0,
        likerAvatars: [],
        music: `Original Sound - ${(item as any).user ?? 'MovieFlix'}`,
      }));
  }, [filteredReviews]);

  const openFeedReels = useCallback(
    (startId?: string) => {
      if (!reelsQueue.length) {
        Alert.alert('No reels', 'No video posts are available right now.');
        return;
      }
      const list = JSON.stringify(reelsQueue);
      router.push({
        pathname: '/reels/feed',
        params: {
          list,
          id: startId ?? reelsQueue[0].id,
          title: 'Reels',
        },
      } as any);
    },
    [reelsQueue, router]
  );

  const adPatternStartRef = useRef(Math.floor(Math.random() * 3));

  const feedItems: FeedItem[] = useMemo(() => {
    let items: FeedItem[] = [...filteredReviews];

    if (trending.length) {
      items.splice(2, 0, {
        type: 'movie-list',
        id: 'trending',
        title: 'Trending',
        movies: trending,
        onItemPress: (m) =>
          router.push(`/details/${m.id}?mediaType=${m.media_type || 'movie'}`),
      });
    }

    if (movieReels.length) {
      items.splice(5, 0, {
        type: 'movie-list',
        id: 'reels',
        title: 'Movie Reels',
        movies: movieReels,
        onItemPress: () => {},
      });
    }

    if (currentPlan === 'free' && prioritizedPromos.length) {
      const adSlots = [3, 8];
      prioritizedPromos.slice(0, adSlots.length).forEach((product, idx) => {
        const slot = adSlots[idx];
        items.splice(Math.min(slot, items.length), 0, {
          type: 'promo-ad',
          id: `promo-${product.id}-${idx}`,
          product,
          placement: 'feed',
        });
      });

      items = injectAdsWithPattern(items, {
        pattern: [3, 2, 4],
        startPatternIndex: adPatternStartRef.current,
        isCountedItem: (it) => !(it as any)?.type,
        isInsertionBlockedAfter: (it) => (it as any)?.type === 'promo-ad',
        createAdItem: (seq) => ({
          type: 'native-ad',
          id: `native-ad-${seq}`,
          placement: 'feed',
          product: prioritizedPromos[seq % prioritizedPromos.length],
        }),
      }) as FeedItem[];
    }

    return items;
  }, [filteredReviews, trending, movieReels, prioritizedPromos, router, currentPlan]);

  /* ------------------------------ Refresh ------------------------------ */

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshReviews();
    try {
      // reshuffle the feed using hook helper
      shuffleReviews();
    } catch (e) {
      // ignore
    }
    setRefreshing(false);
  }, [refreshReviews, shuffleReviews]);

  const FeedTimelineHeader = () => (
    <View>
      {currentPlan === 'free' && (
        <View style={styles.upgradeBanner}>
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
                  Unlock unlimited posts, premium features & more
                </Text>
              </View>
              <TouchableOpacity
                style={styles.upgradeBannerButton}
                onPress={() => router.push('/premium?source=social')}
              >
                <Text style={styles.upgradeBannerButtonText}>Upgrade</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      )}

      <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
        <View style={styles.modeSwitcher}>
          {(
            [
              { key: 'timeline' as const, label: 'Timeline' },
              { key: 'reels' as const, label: 'Reels' },
            ]
          ).map((mode) => (
            <TouchableOpacity
              key={mode.key}
              onPress={() => {
                if (mode.key === 'reels') {
                  openFeedReels();
                  return;
                }
                setFeedMode('timeline');
              }}
              style={[styles.modeBtn, feedMode === mode.key && styles.modeBtnActive]}
            >
              <Text
                style={{
                  color: feedMode === mode.key ? '#fff' : '#aaa',
                  fontWeight: '700',
                }}
              >
                {mode.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.filterRow}>
          {['All', 'TopRated', 'New', 'ForYou'].map((key) => {
            const labelMap: Record<string, string> = {
              All: 'All',
              TopRated: 'Top Rated',
              New: 'New',
              ForYou: 'For You',
            };
            const isActive = activeFilter === (key as any);
            return (
              <TouchableOpacity
                key={key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(key as any)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {labelMap[key]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <StoriesRow showAddStory={currentPlan !== 'free'} />

        <View style={styles.quickActionsRow}>
          <View style={styles.quickAction}>
            <Ionicons name="sparkles-outline" size={18} color="#fff" />
            <Text style={styles.quickActionText}>Fresh</Text>
          </View>
          <View style={styles.quickAction}>
            <Ionicons name="flash-outline" size={18} color="#fff" />
            <Text style={styles.quickActionText}>Reels</Text>
          </View>
          <View style={styles.quickAction}>
            <Ionicons name="tv-outline" size={18} color="#fff" />
            <Text style={styles.quickActionText}>Live</Text>
          </View>
        </View>

        {currentPlan !== 'free' && <PostMovieReview />}
      </View>
    </View>
  );

  /* -------------------------------------------------------------------------- */

  return (
    <View style={styles.root}>
      <ScreenWrapper>
        <StatusBar barStyle="light-content" />

        <LinearGradient
          colors={[accentColor, '#120914', '#05060f']}
          style={StyleSheet.absoluteFillObject}
        />

        <HeaderComponent />

        <View style={styles.tabsDock}>
          <FeedTabs
            active={activeTab}
            onChangeTab={(tab) => {
              if (currentPlan === 'free' && (tab === 'Live' || tab === 'Movie Match')) {
                router.push('/premium');
                return;
              }
              setActiveTab(tab);
            }}
          />
        </View>

        <View style={styles.body}>
          {activeTab === 'Recommended' ? (
            <RecommendedView />
          ) : activeTab === 'Movie Match' ? (
            <MovieMatchView />
          ) : activeTab === 'Live' ? (
            <View style={{ flex: 1, paddingHorizontal: 12, paddingBottom: 160 }}>
            <View style={styles.liveHeaderRow}>
              <Text style={styles.liveTitle}>Live now</Text>
              <TouchableOpacity
                style={[styles.liveButton, { backgroundColor: accentColor }]}
                onPress={() => router.push('/social-feed/go-live')}
              >
                <Ionicons name="videocam" size={18} color="#fff" />
                <Text style={styles.liveButtonText}>Go Live</Text>
              </TouchableOpacity>
            </View>

            {liveLoading ? (
              <View style={styles.liveEmpty}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : liveStreams.length === 0 ? (
              <View style={styles.liveEmpty}>
                <Ionicons name="radio-outline" size={44} color="rgba(255,255,255,0.6)" />
                <Text style={styles.liveEmptyTitle}>No live streams right now</Text>
                <Text style={styles.liveEmptyText}>Start one and invite your friends.</Text>
              </View>
            ) : (
              <FlatList
                data={liveStreams}
                keyExtractor={(item) => String(item.id)}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                contentContainerStyle={{ paddingBottom: 40 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.liveCard}
                    activeOpacity={0.9}
                    onPress={() => router.push(`/social-feed/live/${item.id}`)}
                  >
                    <LinearGradient
                      colors={['rgba(229,9,20,0.18)', 'rgba(10,12,24,0.7)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View style={styles.liveCardCopy}>
                      <Text style={styles.liveCardTitle} numberOfLines={1} ellipsizeMode="tail">
                        {item.title || 'Live on MovieFlix'}
                      </Text>
                      <Text style={styles.liveCardSubtitle} numberOfLines={1} ellipsizeMode="tail">
                        {item.hostName || 'Host'} · {item.viewersCount ?? 0} watching
                      </Text>
                    </View>
                    <View style={styles.liveChip}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveChipText}>LIVE</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
          ) : (
            <Animated.FlatList<FeedItem | undefined>
              style={{ flex: 1 }}
              data={loading ? Array.from({ length: 3 }) : feedItems}
              keyExtractor={(item, i) =>
                item && typeof item === 'object' && 'id' in item
                  ? String((item as any).id)
                  : String(i)
              }
              ListHeaderComponent={FeedTimelineHeader}
              ItemSeparatorComponent={() => <View style={styles.feedGap} />}
              renderItem={({ item, index }: { item?: FeedItem | null; index: number }) => {
                if (!item || loading) return <FeedCardPlaceholder />;

                if ('type' in (item as any) && (item as any).type === 'movie-list') {
                  const movieList = item as Extract<FeedItem, { type: 'movie-list' }>;
                  return (
                    <MovieList
                      title={movieList.title}
                      movies={movieList.movies}
                      onItemPress={movieList.onItemPress}
                    />
                  );
                }

                if ('type' in (item as any) && (item as any).type === 'promo-ad') {
                  const ad = item as Extract<FeedItem, { type: 'promo-ad' }>;
                  return (
                    <PromoAdCard
                      product={ad.product}
                      onPress={() => router.push((`/marketplace/${ad.product.id}`) as any)}
                      onMessage={() => handlePromoMessage(ad.product)}
                    />
                  );
                }

                if ('type' in (item as any) && (item as any).type === 'native-ad') {
                  const ad = item as Extract<FeedItem, { type: 'native-ad' }>;
                  if (!ad.product?.id) return null;
                  return (
                    <NativeAdCard
                      product={ad.product as any}
                      onPress={() => router.push((`/marketplace/${ad.product.id}`) as any)}
                    />
                  );
                }

                return (
                  <FeedCard
                    item={item as any}
                    onLike={handleLike}
                    onComment={handleComment}
                    onWatch={handleWatch}
                    onShare={handleShare}
                    onBookmark={handleBookmark}
                    currentPlan={currentPlan}
                    enableStreaks
                  />
                );
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#fff"
                />
              }
              contentContainerStyle={{
                paddingTop: 0,
                paddingBottom: 160,
                paddingHorizontal: 10,
              }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        {currentPlan !== 'free' && (
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: accentColor }]}
            onPress={() => router.push('/social-feed/go-live')}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        )}
      </ScreenWrapper>

      <BottomNav />
    </View>
  );
};

export const options = {
  headerShown: false,
};

type PromoCardProps = {
  product: MarketplaceProduct;
  onPress: () => void;
  onMessage: () => void;
};

const PromoAdCard = ({ product, onPress, onMessage }: PromoCardProps) => (
  <TouchableOpacity style={styles.promoCard} activeOpacity={0.92} onPress={onPress}>
    <LinearGradient
      colors={['rgba(229,9,20,0.15)', 'rgba(10,12,24,0.65)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.promoGlow}
    />
    <Image source={{ uri: product.imageUrl }} style={styles.promoImage} />
    <View style={styles.promoCopy}>
      <Text style={styles.promoBadge}>Sponsored</Text>
      <Text style={styles.promoTitle}>{product.name}</Text>
      <Text numberOfLines={2} style={styles.promoDescription}>
        {product.description}
      </Text>
      <View style={styles.promoFooter}>
        <Text style={styles.promoPrice}>${Number(product.price).toFixed(2)}</Text>
        <View style={styles.promoSellerRow}>
          {product.sellerAvatar ? (
            <Image source={{ uri: product.sellerAvatar }} style={styles.promoSellerAvatar} />
          ) : (
            <View style={styles.promoSellerFallback}>
              <Text style={styles.promoSellerInitial}>
                {(product.sellerName || 'Seller').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.promoSellerName}>{product.sellerName || 'Marketplace seller'}</Text>
        </View>
        <TouchableOpacity style={styles.promoChatBtn} onPress={onMessage}>
          <Ionicons name="chatbubble-outline" size={16} color="#fff" />
          <Text style={styles.promoChatText}>Chat</Text>
        </TouchableOpacity>
      </View>
    </View>
  </TouchableOpacity>
);

const buildPromoPipeline = (products: MarketplaceProduct[]) => {
  const now = Date.now();
  return products
    .filter((product) => isProductPromoted(product))
    .map((product) => {
      const bid = Number(product.promotionBid ?? 0);
      const createdAtMs = product.createdAt?.toMillis
        ? product.createdAt.toMillis()
        : new Date(product.createdAt || now).getTime();
      const ageHours = Math.max(1, (now - createdAtMs) / (1000 * 60 * 60));
      const freshnessBoost = Math.max(0.2, 1 - ageHours / 72);
      const weight = Number(product.promotionWeight ?? 1);
      const randomJitter = Math.random() * 0.35;
      const score = bid * 0.6 + weight * 0.25 + freshnessBoost * 0.15 + randomJitter;
      return { product, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.product);
};

/* -------------------------------------------------------------------------- */
/*                                   Styles                                   */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05060f' },

  tabsDock: {
    paddingBottom: 2,
  },

  body: {
    flex: 1,
  },

  overlayTop: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    padding: 12,
    gap: 12,
  },

  modeSwitcher: {
    flexDirection: 'row',
    gap: 8,
  },

  modeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },

  modeBtnActive: {
    backgroundColor: 'rgba(229,9,20,0.8)',
  },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  filterChipActive: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  filterChipText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },

  fab: {
    position: 'absolute',
    right: 18,
    bottom: 120,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },

  /* Reels */
  reelsVideoContainer: { width: '100%', height: '100%' },
  reelsVideo: { width: '100%', height: '100%' },
  reelsVideoOverlay: { ...StyleSheet.absoluteFillObject },
  reelsVideoInfo: {
    position: 'absolute',
    bottom: 120,
    left: 16,
    right: 80,
  },
  reelsVideoUser: { color: '#fff', fontWeight: '700', fontSize: 16 },
  reelsVideoCaption: { color: '#fff', marginTop: 6 },
  reelsActions: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    alignItems: 'center',
    gap: 20,
  },
  reelsActionBtn: { alignItems: 'center' },
  reelsActionText: { color: '#fff', fontSize: 12 },

  reelsEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelsEmptyText: { color: '#666', marginTop: 12 },

  liveHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 12,
  },
  liveTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  liveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  liveButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  liveEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
  },
  liveEmptyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
  },
  liveEmptyText: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
    textAlign: 'center',
  },
  liveCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveCardCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  liveCardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  liveCardSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(229,9,20,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.35)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e50914',
  },
  liveChipText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.6,
  },

  feedGap: {
    height: 10,
  },

  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    marginTop: 4,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },

  // Header styles
  headerWrap: {
    marginHorizontal: 12,
    marginTop: Platform.OS === 'ios' ? 42 : 28,
    marginBottom: 6,
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
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
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
    flexShrink: 0,
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
  headerMetaRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    rowGap: 10,
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
    maxWidth: '100%',
    flexShrink: 1,
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
    flexShrink: 1,
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

  /* Promo Ad Card */
  promoCard: {
    backgroundColor: 'rgba(10,12,24,0.8)',
    borderRadius: 16,
    marginHorizontal: 12,
    marginVertical: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  promoGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  promoImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  promoCopy: {
    padding: 16,
  },
  promoBadge: {
    backgroundColor: '#e50914',
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  promoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  promoDescription: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  promoFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promoPrice: {
    color: '#e50914',
    fontSize: 18,
    fontWeight: '700',
  },
  promoSellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 12,
  },
  promoSellerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  promoSellerFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  promoSellerInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  promoSellerName: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  promoChatBtn: {
    backgroundColor: '#e50914',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  promoChatText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default SocialFeed;
