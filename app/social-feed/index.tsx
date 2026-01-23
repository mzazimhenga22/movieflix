import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  PixelRatio,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';



type ActiveTab = 'For You' | 'Live' | 'Stories';

import { listenToBoostedLiveStreams, listenToLiveStreams } from '@/lib/live/liveService';
import type { LiveStream } from '@/lib/live/types';
import { putNavPayload } from '@/lib/navPayloadCache';
import MovieList from '../../components/MovieList';
import ScreenWrapper from '../../components/ScreenWrapper';
import { API_BASE_URL, API_KEY } from '../../constants/api';
import { useActiveProfile } from '../../hooks/use-active-profile';
import { useNavigationGuard } from '../../hooks/use-navigation-guard';
import { useUnreadMessagesBadgeCount } from '../../hooks/use-unread-messages';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { Media } from '../../types';
import { useAccent } from '../components/AccentContext';
import FeedCard from '../components/social-feed/FeedCard';
import FeedCardPlaceholder from '../components/social-feed/FeedCardPlaceholder';
import FeedCollageTile, {
  FeedCollageTilePlaceholder,
} from '../components/social-feed/FeedCollageTile';
import { ReviewItem, useSocialReactions } from '../components/social-feed/hooks';
import MovieMatchView from '../components/social-feed/MovieMatchView';
import PostMovieReview from '../components/social-feed/PostMovieReview';
import RecommendedView from '../components/social-feed/RecommendedView';
import StoriesRow from '../components/social-feed/StoriesRow';
import FeedTabs from '../components/social-feed/Tabs';
import { getProducts, isProductPromoted, type Product as MarketplaceProduct } from '../marketplace/api';
import { findOrCreateConversation, getProfileById, type Profile } from '../messaging/controller';

import NativeAdCard from '../../components/ads/NativeAdCard';
import { injectAdsWithPattern } from '../../lib/ads/sequence';
import { scrapeImdbTrailer } from '../../src/providers/scrapeImdbTrailer';
import { searchClipCafe } from '../../src/providers/shortclips';
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

async function getImdbId(tmdbId: number): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/movie/${tmdbId}/external_ids?api_key=${API_KEY}`);
    const data = await res.json();
    return data.imdb_id || null;
  } catch {
    return null;
  }
}

const SocialFeed = () => {
  const router = useRouter();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });
  const { accentColor } = useAccent();
  const { currentPlan } = useSubscription();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();
  const isCompactLayout = screenWidth < 360 || fontScale > 1.2;
  const listBottomPadding = 110 + insets.bottom;
  const headerIconSize = isCompactLayout ? 20 : 22;

  // Keep tiles larger on phones; only switch to 3 columns on *very* wide displays.
  const collageColumns = screenWidth >= 900 ? 3 : 2;
  const collageGap = 8;
  const collageSidePadding = 6;
  const collageTileWidth = Math.floor(
    (screenWidth - collageSidePadding * 2 - collageGap * (collageColumns - 1)) /
    collageColumns
  );
  const {
    reviews,
    refreshReviews,
    shuffleReviews,
    handleLike,
    handleBookmark,
    handleComment,
    handleWatch,
    handleShare,
    deleteReview,
  } = useSocialReactions();

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'Feed' | 'Recommended' | 'Live' | 'Movie Match'
  >('Feed');
  const [feedMode, setFeedMode] = useState<'timeline' | 'collage'>('collage');
  const [activeFilter, setActiveFilter] = useState<'All' | 'TopRated' | 'New' | 'ForYou'>('All');


  const [collageModalOpen, setCollageModalOpen] = useState(false);
  const [collageModalIndex, setCollageModalIndex] = useState(0);

  const [trending, setTrending] = useState<Media[]>([]);
  // Define extended type locally
  type MovieClipMedia = Media & {
    videoUrl?: string;
    headers?: Record<string, string>;
    sourceType?: string;
  };


  const [movieReels, setMovieReels] = useState<MovieClipMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [promotedProducts, setPromotedProducts] = useState<MarketplaceProduct[]>([]);
  const activeProfile = useActiveProfile();
  const activeProfileName = activeProfile?.name ?? 'watcher';
  const unreadBadgeCount = useUnreadMessagesBadgeCount();
  const [adMessagingBusy, setAdMessagingBusy] = useState(false);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [boostedLiveStreams, setBoostedLiveStreams] = useState<LiveStream[]>([]);

  // Header animations - Liquid glass effect
  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlideAnim = useRef(new Animated.Value(-30)).current;
  const glassShineAnim = useRef(new Animated.Value(0)).current;
  const statsScaleAnim = useRef(new Animated.Value(0.85)).current;
  const iconPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(headerFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(headerSlideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
      Animated.spring(statsScaleAnim, { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();

    // Continuous glass shine effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(glassShineAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(glassShineAnim, { toValue: 0, duration: 3000, useNativeDriver: true }),
      ])
    ).start();

    // Subtle icon pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulseAnim, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
        Animated.timing(iconPulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const HeaderComponent = () => (
    <Animated.View
      style={[
        styles.headerWrap,
        {
          opacity: headerFadeAnim,
          transform: [{ translateY: headerSlideAnim }],
        }
      ]}
    >
      {/* Liquid glass container */}
      <View style={styles.liquidGlassContainer}>
        {/* iOS Blur base layer */}
        {Platform.OS === 'ios' ? (
          <BlurView intensity={40} tint="dark" style={styles.blurLayer} />
        ) : (
          <View style={styles.androidGlassLayer} />
        )}

        {/* Animated gradient overlay for liquid effect */}
        <Animated.View
          style={[
            styles.liquidShine,
            {
              opacity: glassShineAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.3, 0.6, 0.3],
              }),
              transform: [{
                translateX: glassShineAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-200, 200],
                }),
              }],
            }
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>

        {/* Colored accent glow */}
        <LinearGradient
          colors={['rgba(229,9,20,0.12)', 'rgba(125,216,255,0.08)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.accentGlow}
        />

        {/* Glass border highlight */}
        <View style={styles.glassBorderTop} />
        <View style={styles.glassBorderBottom} />

        {/* Main content */}
        <View style={[styles.headerBar, isCompactLayout && styles.headerBarCompact]}>
          <View style={styles.titleRow}>
            {/* Liquid accent orb */}
            <Animated.View
              style={[
                styles.accentOrb,
                { transform: [{ scale: iconPulseAnim }] }
              ]}
            >
              <LinearGradient
                colors={['#ff4757', '#e50914', '#c0392b']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.accentOrbGradient}
              />
              <View style={styles.accentOrbShine} />
            </Animated.View>

            <View style={styles.titleContent}>
              <Text style={styles.headerEyebrow} numberOfLines={1}>
                {activeTab === 'Feed' ? 'SOCIAL' : activeTab.toUpperCase()}
              </Text>
              <Text
                style={[styles.headerText, isCompactLayout && styles.headerTextCompact]}
                numberOfLines={1}
              >
                {activeTab === 'Feed'
                  ? 'Your Feed'
                  : activeTab === 'Recommended'
                    ? 'For You'
                    : activeTab === 'Live'
                      ? 'Live Now'
                      : 'Movie Match'}
              </Text>
              <Text style={styles.headerGreeting} numberOfLines={1}>
                Hey, {activeProfileName} 👋
              </Text>
            </View>
          </View>

          <View style={[styles.headerIcons, isCompactLayout && styles.headerIconsCompact]}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => deferNav(() => router.push('/messaging'))}
              activeOpacity={0.7}
            >
              <View style={styles.iconBadgeWrap}>
                <View style={styles.glassIconBg}>
                  <Ionicons name="chatbubble" size={18} color="rgba(255,255,255,0.9)" />
                </View>
                {unreadBadgeCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {unreadBadgeCount > 99 ? '99+' : String(unreadBadgeCount)}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => deferNav(() => router.push('/search'))}
              activeOpacity={0.7}
            >
              <View style={styles.glassIconBg}>
                <Ionicons name="search" size={18} color="rgba(255,255,255,0.9)" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => deferNav(() => router.push('/profile'))}
              activeOpacity={0.7}
            >
              <View style={styles.profileGlassIcon}>
                <LinearGradient
                  colors={['rgba(229,9,20,0.9)', 'rgba(255,107,53,0.9)']}
                  style={styles.profileIconGradient}
                >
                  <FontAwesome name="user" size={16} color="#fff" />
                </LinearGradient>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats row with liquid glass cards */}
        <Animated.View
          style={[
            styles.headerMetaRow,
            { transform: [{ scale: statsScaleAnim }] }
          ]}
        >
          <View style={styles.glassStatCard}>
            <View style={[styles.statIconWrap, { backgroundColor: 'rgba(125,216,255,0.15)' }]}>
              <Ionicons name="documents" size={14} color="#7dd8ff" />
            </View>
            <Text style={styles.statValue}>{reviews.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.glassStatCard}>
            <View style={[styles.statIconWrap, { backgroundColor: 'rgba(255,107,53,0.15)' }]}>
              <Ionicons name="flame" size={14} color="#ff6b35" />
            </View>
            <Text style={styles.statValue}>{trending.length}</Text>
            <Text style={styles.statLabel}>Trending</Text>
          </View>
          <View style={styles.glassStatCard}>
            <View style={[styles.statIconWrap, { backgroundColor: 'rgba(229,9,20,0.15)' }]}>
              <Ionicons name="radio" size={14} color="#e50914" />
            </View>
            <Text style={styles.statValue}>{liveStreams.length}</Text>
            <Text style={styles.statLabel}>Live</Text>
          </View>
        </Animated.View>
      </View>
    </Animated.View>
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

  useEffect(() => {
    const unsubscribe = listenToBoostedLiveStreams((streams) => {
      setBoostedLiveStreams(streams);
    });
    return () => unsubscribe();
  }, []);

  /* ------------------------------ Fetch data ------------------------------ */

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // Fetch trending and upcoming movies
        const [t, r] = await Promise.all([
          fetch(`${API_BASE_URL}/trending/all/day?api_key=${API_KEY}`).then((x) =>
            x.json()
          ),
          fetch(`${API_BASE_URL}/movie/upcoming?api_key=${API_KEY}`).then((x) =>
            x.json()
          ),
        ]);
        const combined = [...(t.results || []), ...(r.results || [])];
        setTrending(t.results || []);

        console.log(`[MovieTrailers] Found ${combined.length} candidates. Starting batched fetch...`);

        // Helper to process a single movie
        const processMovie = async (m: any) => {
          if (!m.id) return m;
          const releaseYear = m.release_date ? m.release_date.split('-')[0] : '';

          let clip = await searchClipCafe(m.title, releaseYear);
          let source = 'clip.cafe';

          if (!clip && m.original_title && m.original_title !== m.title) {
            clip = await searchClipCafe(m.original_title, releaseYear);
          }

          if (!clip) {
            const imdbId = await getImdbId(m.id);
            if (imdbId) {
              try {
                const found = await scrapeImdbTrailer({ imdb_id: imdbId });
                if (found) {
                  clip = found;
                  source = 'imdb';
                  console.log(`[MovieTrailers] IMDB Found: ${m.title}`);
                }
              } catch (e) { }
            }
          } else {
            console.log(`[MovieTrailers] ClipCafe Found: ${m.title}`);
          }

          if (clip) {
            return {
              ...m,
              videoUrl: clip.url,
              headers: (clip as any).headers,
              mediaType: 'clip',
              sourceType: source,
              media_type: 'clip'
            };
          }
          return m;
        };

        // 1. Process top 5 immediately (Critical Path)
        const initialBatch = combined.slice(0, 5);
        const initialResults = await Promise.all(initialBatch.map(processMovie));

        // Update state immediately so user sees something
        setMovieReels(initialResults);

        // If we have at least *some* content (reviews or movie reels), stop "loading" spinner
        if (initialResults.length > 0 || reviews.length > 0) {
          setLoading(false);
        }

        // 2. Process the rest in background chunks
        const remaining = combined.slice(5);
        const CHUNK_SIZE = 3;

        // We'll process remaining items in chunks to avoid spamming the network/thread
        for (let i = 0; i < remaining.length; i += CHUNK_SIZE) {
          const chunk = remaining.slice(i, i + CHUNK_SIZE);
          const chunkResults = await Promise.all(chunk.map(processMovie));

          // Append new results incrementally
          setMovieReels(prev => [...prev, ...chunkResults]);

          // Small delay to yield to UI thread
          await new Promise(r => setTimeout(r, 500));
        }

      } catch (e) {
        console.error("Movie fetch failed", e);
        setLoading(false);
      }
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
    if (reviews.length > 0 || movieReels.length > 0) {
      setLoading(false);
    }
  }, [reviews, movieReels]);

  useEffect(() => {
    (async () => {
      try {
        await refreshReviews();
        shuffleReviews();
      } catch { }
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
        deferNav(() => router.push({ pathname: '/messaging/chat/[id]', params: { id: conversationId } } as any));
      } catch (err) {
        console.error('[social-feed] promo chat failed', err);
        Alert.alert('Unable to start chat', 'Please try again later.');
      } finally {
        setAdMessagingBusy(false);
      }
    },
    [adMessagingBusy, deferNav, router]
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
    const liveReels = boostedLiveStreams.slice(0, 5).map((s) => ({
      id: `live-${String(s.id)}`,
      mediaType: 'live',
      title: (s.title || 'Live').slice(0, 120),
      videoUrl: null,
      coverUrl: s.coverUrl ?? null,
      liveStreamId: String(s.id),
      userId: s.hostId ?? null,
      username: s.hostName ?? null,
      likes: 0,
      commentsCount: 0,
      likerAvatars: [],
      music: 'LIVE',
    }));

    const videoReels = filteredReviews
      .filter((item): item is ReviewItem => 'videoUrl' in item && !!item.videoUrl)
      .slice(0, 40)
      .map((item) => {
        let posterUrl = null;
        if (item.image && typeof item.image === 'object' && 'uri' in item.image) {
          posterUrl = (item.image as any).uri;
        }

        return {
          id: String(item.id),
          mediaType: 'feed',
          title: (item.movie || item.review || 'Reel').slice(0, 120),
          docId: (item as any).docId ?? null,
          videoUrl: item.videoUrl,
          posterUrl,
          userId: String(item.userId || 'anon'),
          username: item.user || 'User',
          userAvatar: item.avatar || null,
          likes: item.likes || 0,
          commentsCount: item.commentsCount || 0, // Using commentsCount form ReviewItem
          description: item.review || '',
          createdAt: item.date, // date string
          isLiked: false,
          likerAvatars: [],
          music: 'Original Audio',
        };
      });

    // Transform movie clips/trailers from TMDB/ClipCafe
    const movieClips = movieReels.map((m) => ({
      id: String(m.id),
      mediaType: 'clip', // distinct type
      title: m.title || 'Movie Clip',
      docId: null,
      videoUrl: m.videoUrl,
      posterUrl: m.poster_path
        ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
        : null,
      userId: 'movieflix',
      username: 'MovieFlix',
      userAvatar: null,
      likes: Math.floor(Math.random() * 500) + 50, // fake stats
      commentsCount: 0,
      description: m.overview || 'Featured Clip',
      createdAt: new Date().toISOString(),
      isLiked: false,
      likerAvatars: [],
      music: 'Movie Soundtrack',
      headers: (m as any).headers,
    }));

    // Interleave logic
    const combined = [];
    const maxLength = Math.max(videoReels.length, movieClips.length);
    for (let i = 0; i < maxLength; i++) {
      if (i < videoReels.length) combined.push(videoReels[i]);
      if (i < movieClips.length) combined.push(movieClips[i]);
    }

    return [...liveReels, ...combined];
  }, [boostedLiveStreams, filteredReviews, movieReels]);

  const openFeedReels = useCallback(
    (startId?: string) => {
      if (!reelsQueue.length) {
        Alert.alert('No reels', 'No video posts are available right now.');
        return;
      }
      const queueKey = putNavPayload('feedReels', reelsQueue);
      deferNav(() => {
        router.push({
          pathname: '/reels/feed',
          params: {
            queueKey,
            id: startId ?? reelsQueue[0].id,
            title: 'Reels',
          },
        } as any);
      });
    },
    [deferNav, reelsQueue, router]
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
          deferNav(() => router.push(`/details/${m.id}?mediaType=${m.media_type || 'movie'}`)),
      });
    }

    if (movieReels.length) {
      items.splice(5, 0, {
        type: 'movie-list',
        id: 'reels',
        title: 'Movie Reels',
        movies: movieReels,
        onItemPress: (m) =>
          deferNav(() => router.push(`/details/${m.id}?mediaType=${m.media_type || 'movie'}`)),
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
  }, [filteredReviews, trending, movieReels, prioritizedPromos, router, currentPlan, deferNav]);

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
            colors={['rgba(229,9,20,0.85)', 'rgba(185,7,16,0.85)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.upgradeBannerGradient}
          >
            <View style={styles.upgradeBannerContent}>
              <View style={styles.upgradeBannerIcon}>
                <Ionicons name="diamond" size={22} color="#fff" />
              </View>
              <View style={styles.upgradeBannerText}>
                <Text style={styles.upgradeBannerTitle}>Go Premium</Text>
                <Text style={styles.upgradeBannerSubtitle}>
                  Unlock unlimited posts & features
                </Text>
              </View>
              <TouchableOpacity
                style={styles.upgradeBannerButton}
                onPress={() => deferNav(() => router.push('/premium?source=social'))}
                activeOpacity={0.9}
              >
                <Text style={styles.upgradeBannerButtonText}>Upgrade</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      )}

      <View style={styles.feedHeaderContent}>
        {/* Mode Switcher - Redesigned */}
        <View style={styles.modeSwitcherWrap}>
          <View style={styles.modeSwitcher}>
            {([
              { key: 'timeline' as const, label: 'Timeline', icon: 'list' as const },
              { key: 'collage' as const, label: 'Grid', icon: 'grid' as const },
              { key: 'reels' as const, label: 'Reels', icon: 'play-circle' as const },
            ]).map((mode) => {
              const isActive = (feedMode as string) === mode.key && mode.key !== 'reels';
              return (
                <TouchableOpacity
                  key={mode.key}
                  onPress={() => {
                    if (mode.key === 'reels') {
                      openFeedReels();
                      return;
                    }
                    setFeedMode(mode.key);
                  }}
                  style={[styles.modeBtn, isActive && styles.modeBtnActive]}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={mode.icon}
                    size={16}
                    color={isActive ? '#fff' : 'rgba(255,255,255,0.6)'}
                  />
                  <Text style={[styles.modeBtnText, isActive && styles.modeBtnTextActive]}>
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>


        {/* Stories Row */}
        <StoriesRow showAddStory={currentPlan !== 'free'} />

        {/* Quick Actions - Redesigned */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickAction} activeOpacity={0.8}>
            <LinearGradient
              colors={['rgba(125,216,255,0.2)', 'rgba(125,216,255,0.05)']}
              style={styles.quickActionIcon}
            >
              <Ionicons name="sparkles" size={18} color="#7dd8ff" />
            </LinearGradient>
            <Text style={styles.quickActionText}>Fresh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            activeOpacity={0.8}
            onPress={() => openFeedReels()}
          >
            <LinearGradient
              colors={['rgba(229,9,20,0.2)', 'rgba(229,9,20,0.05)']}
              style={styles.quickActionIcon}
            >
              <Ionicons name="play" size={18} color="#e50914" />
            </LinearGradient>
            <Text style={styles.quickActionText}>Reels</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            activeOpacity={0.8}
            onPress={() => setActiveTab('Live')}
          >
            <LinearGradient
              colors={['rgba(255,107,53,0.2)', 'rgba(255,107,53,0.05)']}
              style={styles.quickActionIcon}
            >
              <Ionicons name="radio" size={18} color="#ff6b35" />
            </LinearGradient>
            <Text style={styles.quickActionText}>Live</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            activeOpacity={0.8}
            onPress={() => setActiveTab('Movie Match')}
          >
            <LinearGradient
              colors={['rgba(255,215,0,0.2)', 'rgba(255,215,0,0.05)']}
              style={styles.quickActionIcon}
            >
              <Ionicons name="heart" size={18} color="#ffd700" />
            </LinearGradient>
            <Text style={styles.quickActionText}>Match</Text>
          </TouchableOpacity>
        </View>

        {currentPlan !== 'free' && <PostMovieReview />}
      </View>
    </View>
  );

  // Floating particles animation
  const particles = useRef(
    Array.from({ length: 8 }, (_, i) => ({
      x: new Animated.Value(Math.random() * 100),
      y: new Animated.Value(Math.random() * 100),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.5 + Math.random() * 0.5),
    }))
  ).current;

  // FAB animation
  const fabScaleAnim = useRef(new Animated.Value(1)).current;
  const fabRotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate floating particles
    particles.forEach((particle, i) => {
      const animateParticle = () => {
        particle.y.setValue(110);
        particle.opacity.setValue(0);
        particle.x.setValue(10 + Math.random() * 80);

        Animated.parallel([
          Animated.timing(particle.y, {
            toValue: -10,
            duration: 6000 + Math.random() * 4000,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(particle.opacity, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
            Animated.timing(particle.opacity, { toValue: 0, duration: 5000, useNativeDriver: true }),
          ]),
        ]).start(() => animateParticle());
      };

      setTimeout(animateParticle, i * 800);
    });

    // FAB breathing animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabScaleAnim, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
        Animated.timing(fabScaleAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleFabPress = () => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(fabScaleAnim, { toValue: 0.85, tension: 200, friction: 10, useNativeDriver: true }),
        Animated.timing(fabRotateAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.spring(fabScaleAnim, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
    ]).start(() => {
      fabRotateAnim.setValue(0);
      deferNav(() => router.push('/social-feed/go-live'));
    });
  };

  /* -------------------------------------------------------------------------- */

  return (
    <View style={styles.root}>
      <ScreenWrapper>
        <StatusBar barStyle="light-content" />

        {/* Animated gradient background */}
        <LinearGradient
          colors={[accentColor + '40', '#120914', '#05060f']}
          locations={[0, 0.3, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Floating particles */}
        {particles.map((particle, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.floatingParticle,
              {
                backgroundColor: i % 3 === 0 ? accentColor : i % 3 === 1 ? '#7dd8ff' : '#ffd700',
                opacity: particle.opacity,
                transform: [
                  { translateX: particle.x.interpolate({ inputRange: [0, 100], outputRange: [0, screenWidth] }) },
                  { translateY: particle.y.interpolate({ inputRange: [0, 100], outputRange: [0, 800] }) },
                  { scale: particle.scale },
                ],
              },
            ]}
          />
        ))}

        <HeaderComponent />

        <View style={styles.tabsDock}>
          <FeedTabs
            active={activeTab}
            onChangeTab={(tab) => {
              if (currentPlan === 'free' && (tab === 'Live' || tab === 'Movie Match')) {
                deferNav(() => router.push('/premium'));
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
            <View style={{ flex: 1, paddingHorizontal: 12, paddingBottom: listBottomPadding }}>
              <View style={styles.liveHeaderRow}>
                <Text style={styles.liveTitle}>Live now</Text>
                <View style={styles.liveHeaderActions}>
                  <TouchableOpacity
                    style={styles.liveExploreButton}
                    onPress={() => deferNav(() => router.push('/social-feed/live'))}
                  >
                    <Ionicons name="compass-outline" size={18} color="#fff" />
                    <Text style={styles.liveExploreText}>Explore</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.liveButton, { backgroundColor: accentColor }]}
                    onPress={() => deferNav(() => router.push('/social-feed/go-live'))}
                  >
                    <Ionicons name="videocam" size={18} color="#fff" />
                    <Text style={styles.liveButtonText}>Go Live</Text>
                  </TouchableOpacity>
                </View>
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
                      onPress={() => deferNav(() => router.push(`/social-feed/live/${item.id}`))}
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
            feedMode === 'collage' ? (
              <FlashList
                data={loading ? Array.from({ length: 12 }) : filteredReviews}
                keyExtractor={(item: any, i: number) => (loading ? `placeholder-${i}` : String((item as any).id))}
                numColumns={collageColumns}
                estimatedItemSize={collageTileWidth * 1.1}
                ListHeaderComponent={FeedTimelineHeader}
                renderItem={({ item, index }: { item: any, index: number }) => {
                  const col = index % collageColumns;
                  const marginRight = col === collageColumns - 1 ? 0 : collageGap;

                  return (
                    <View style={{ width: collageTileWidth, marginRight, marginBottom: 12 }}>
                      {loading ? (
                        <FeedCollageTilePlaceholder columnWidth={collageTileWidth} index={index} />
                      ) : (
                        <FeedCollageTile
                          item={item as any}
                          columnWidth={collageTileWidth}
                          onPress={() => {
                            setCollageModalIndex(index);
                            setCollageModalOpen(true);
                          }}
                        />
                      )}
                    </View>
                  );
                }}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
                }
                contentContainerStyle={{
                  paddingTop: 0,
                  paddingBottom: listBottomPadding,
                  paddingHorizontal: collageSidePadding,
                }}
                showsVerticalScrollIndicator={false}
              />
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
                        onPress={() => deferNav(() => router.push((`/marketplace/${ad.product.id}`) as any))}
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
                        onPress={() => deferNav(() => router.push((`/marketplace/${ad.product.id}`) as any))}
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
                      onDelete={(it) => deleteReview((it as any).id)}
                      currentPlan={currentPlan}
                      enableStreaks
                    />
                  );
                }}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
                }
                contentContainerStyle={{
                  paddingTop: 0,
                  paddingBottom: listBottomPadding,
                  paddingHorizontal: 10,
                }}
                showsVerticalScrollIndicator={false}
              />
            )
          )}
        </View>

        <Modal
          visible={collageModalOpen}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setCollageModalOpen(false)}
        >
          <View style={[styles.collageModalWrap, { paddingTop: insets.top }]}>
            <View style={styles.collageModalTopBar}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setCollageModalOpen(false)}
                style={styles.collageModalClose}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>

              <Text style={styles.collageModalTitle} numberOfLines={1}>
                {filteredReviews.length ? `Post ${collageModalIndex + 1} of ${filteredReviews.length}` : 'Post'}
              </Text>
              <View style={{ width: 44 }} />
            </View>

            <FlatList
              data={filteredReviews}
              keyExtractor={(it) => String((it as any).id)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={Math.min(Math.max(collageModalIndex, 0), Math.max(0, filteredReviews.length - 1))}
              getItemLayout={(_, idx) => ({ length: screenWidth, offset: screenWidth * idx, index: idx })}
              onMomentumScrollEnd={(e) => {
                const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, screenWidth));
                setCollageModalIndex(next);
              }}
              renderItem={({ item, index }) => (
                <View style={{ width: screenWidth, paddingHorizontal: 12, alignItems: 'center' }}>
                  <View style={{ width: Math.min(screenWidth, 560) }}>
                    <FeedCard
                      item={item as any}
                      onLike={handleLike}
                      onComment={handleComment}
                      onWatch={handleWatch}
                      onShare={handleShare}
                      onBookmark={handleBookmark}
                      onDelete={(it) => deleteReview((it as any).id)}
                      currentPlan={currentPlan}
                      enableStreaks
                      active={index === collageModalIndex}
                    />
                  </View>
                </View>
              )}
            />

            <View style={styles.collageModalHintRow}>
              <Ionicons name="swap-horizontal" size={16} color="rgba(255,255,255,0.65)" />
              <Text style={styles.collageModalHintText}>Swipe to browse</Text>
            </View>
          </View>
        </Modal>

        {/* Stunning animated FAB */}
        {currentPlan !== 'free' && (
          <Animated.View
            style={[
              styles.fabContainer,
              {
                bottom: insets.bottom + 100,
                transform: [
                  { scale: fabScaleAnim },
                  { rotate: fabRotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] }) },
                ],
              },
            ]}
          >
            {/* Glow effect */}
            <View style={[styles.fabGlow, { backgroundColor: accentColor }]} />

            <TouchableOpacity
              style={styles.fab}
              onPress={handleFabPress}
              activeOpacity={1}
            >
              <LinearGradient
                colors={[accentColor, '#ff6b35']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fabGradient}
              >
                <Ionicons name="add" size={28} color="#fff" />
              </LinearGradient>
              {/* Shine effect */}
              <View style={styles.fabShine} />
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScreenWrapper>
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

const PromoAdCard = ({ product, onPress, onMessage }: PromoCardProps) => {
  const cardScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(cardScale, { toValue: 0.98, tension: 100, friction: 10, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(cardScale, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: cardScale }] }}>
      <TouchableOpacity
        style={styles.promoCard}
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {/* Glass background */}
        <View style={styles.promoGlassWrap}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={styles.promoAndroidGlass} />
          )}
        </View>

        {/* Accent glow */}
        <LinearGradient
          colors={['rgba(229,9,20,0.2)', 'transparent']}
          style={styles.promoAccentGlow}
        />

        {/* Image with overlay */}
        <View style={styles.promoImageWrap}>
          <Image source={{ uri: product.imageUrl }} style={styles.promoImage} />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.promoImageOverlay}
          />
          {/* Sponsored badge */}
          <View style={styles.promoBadgeWrap}>
            <LinearGradient
              colors={['rgba(229,9,20,0.9)', 'rgba(255,107,53,0.9)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.promoBadge}
            >
              <Ionicons name="megaphone" size={10} color="#fff" />
              <Text style={styles.promoBadgeText}>AD</Text>
            </LinearGradient>
          </View>
        </View>

        {/* Content */}
        <View style={styles.promoCopy}>
          <Text style={styles.promoTitle} numberOfLines={2}>
            {product.name}
          </Text>
          <Text numberOfLines={2} style={styles.promoDescription}>
            {product.description}
          </Text>

          {/* Footer */}
          <View style={styles.promoFooter}>
            {/* Price tag */}
            <View style={styles.promoPriceTag}>
              <Text style={styles.promoPriceCurrency}>$</Text>
              <Text style={styles.promoPrice}>{Number(product.price).toFixed(2)}</Text>
            </View>

            {/* Seller info */}
            <View style={styles.promoSellerRow}>
              <View style={styles.promoSellerAvatarWrap}>
                {product.sellerAvatar ? (
                  <Image source={{ uri: product.sellerAvatar }} style={styles.promoSellerAvatar} />
                ) : (
                  <LinearGradient
                    colors={['#e50914', '#ff6b35']}
                    style={styles.promoSellerFallback}
                  >
                    <Text style={styles.promoSellerInitial}>
                      {(product.sellerName || 'S').charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                )}
              </View>
              <Text style={styles.promoSellerName} numberOfLines={1}>
                {product.sellerName || 'Seller'}
              </Text>
            </View>

            {/* Chat button */}
            <TouchableOpacity
              style={styles.promoChatBtn}
              onPress={(e) => {
                e?.stopPropagation?.();
                onMessage();
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Glass border */}
        <View style={styles.promoGlassBorder} />
      </TouchableOpacity>
    </Animated.View>
  );
};

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

  feedHeaderContent: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },

  modeSwitcherWrap: {
    marginBottom: 12,
  },

  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },

  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },

  modeBtnActive: {
    backgroundColor: 'rgba(229,9,20,0.9)',
  },

  modeBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },

  modeBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  filterRowWrap: {
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(229,9,20,0.9)',
  },
  filterChipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  floatingParticle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    zIndex: 0,
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.3,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 18,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  fabGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabShine: {
    position: 'absolute',
    top: 4,
    left: 8,
    width: 20,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  collageModalWrap: {
    flex: 1,
    backgroundColor: '#0a0c18',
  },
  collageModalTopBar: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  collageModalClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  collageModalTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  collageModalHintRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  collageModalHintText: {
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '700',
    fontSize: 12,
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
    flexWrap: 'wrap',
    rowGap: 10,
    columnGap: 12,
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
  liveHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveExploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  liveExploreText: {
    color: '#fff',
    fontWeight: '900',
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
    gap: 10,
    marginBottom: 14,
    marginTop: 6,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    fontSize: 11,
  },

  // Header styles - Liquid Glass iOS 26 style
  headerWrap: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 8,
  },
  liquidGlassContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  blurLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  androidGlassLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,30,0.75)',
  },
  liquidShine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 150,
    zIndex: 1,
  },
  accentGlow: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  glassBorderTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  glassBorderBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  headerBar: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  headerBarCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    rowGap: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  accentOrb: {
    width: 46,
    height: 46,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  accentOrbGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  accentOrbShine: {
    position: 'absolute',
    top: 2,
    left: 4,
    width: 18,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  titleContent: {
    flex: 1,
    minWidth: 0,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  headerGreeting: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 3,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerTextCompact: {
    fontSize: 20,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  headerIconsCompact: {
    flexWrap: 'wrap',
    rowGap: 8,
    justifyContent: 'flex-start',
  },
  iconBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  glassIconBg: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileGlassIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    overflow: 'hidden',
  },
  profileIconGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeWrap: {
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(20,20,30,0.8)',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  headerMetaRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 4,
    gap: 8,
    zIndex: 2,
  },
  glassStatCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '600',
  },
  upgradeBanner: {
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 18,
    overflow: 'hidden',
  },
  upgradeBannerGradient: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  upgradeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upgradeBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBannerText: {
    flex: 1,
    minWidth: 0,
  },
  upgradeBannerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  upgradeBannerSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
  },
  upgradeBannerButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  upgradeBannerButtonText: {
    color: '#e50914',
    fontWeight: '800',
    fontSize: 13,
  },

  /* Promo Ad Card - Glass redesign */
  promoCard: {
    borderRadius: 20,
    marginHorizontal: 12,
    marginVertical: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  promoGlassWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    overflow: 'hidden',
  },
  promoAndroidGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,30,0.85)',
  },
  promoAccentGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  promoImageWrap: {
    height: 160,
    position: 'relative',
  },
  promoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  promoImageOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  promoBadgeWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  promoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  promoBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  promoCopy: {
    padding: 14,
  },
  promoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  promoDescription: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  promoFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  promoPriceTag: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(229,9,20,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  promoPriceCurrency: {
    color: '#e50914',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  promoPrice: {
    color: '#e50914',
    fontSize: 18,
    fontWeight: '800',
  },
  promoSellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  promoSellerAvatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    overflow: 'hidden',
  },
  promoSellerAvatar: {
    width: '100%',
    height: '100%',
  },
  promoSellerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoSellerInitial: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  promoSellerName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  promoChatBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoGlassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
});

export default SocialFeed;
