import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList as any);



type ActiveTab = 'For You' | 'Live' | 'Stories';

import { listenToBoostedLiveStreams, listenToLiveStreams } from '@/lib/live/liveService';
import type { LiveStream } from '@/lib/live/types';
import { putNavPayload } from '@/lib/navPayloadCache';
import { useAccent } from '../../components/app-components/AccentContext';
import LiquidGlass from '../../components/app-components/LiquidGlass';
import FeedCard from '../../components/app-components/social-feed/FeedCard';
import FeedCardPlaceholder from '../../components/app-components/social-feed/FeedCardPlaceholder';
import FeedCollageTile, {
  FeedCollageTilePlaceholder,
} from '../../components/app-components/social-feed/FeedCollageTile';
import { ReviewItem, useSocialReactions } from '../../components/app-components/social-feed/hooks';
import MovieMatchView from '../../components/app-components/social-feed/MovieMatchView';
import PostMovieReview from '../../components/app-components/social-feed/PostMovieReview';
import RecommendedView from '../../components/app-components/social-feed/RecommendedView';
import StoriesRow from '../../components/app-components/social-feed/StoriesRow';
import FeedTabs from '../../components/app-components/social-feed/Tabs';
import MovieList from '../../components/MovieList';
import ScreenWrapper from '../../components/ScreenWrapper';
import { API_BASE_URL, API_KEY } from '../../constants/api';
import { useActiveProfile } from '../../hooks/use-active-profile';
import { useNavigationGuard } from '../../hooks/use-navigation-guard';
import { useUnreadMessagesBadgeCount } from '../../hooks/use-unread-messages';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { Media } from '../../types';
import { getProducts, isProductPromoted, type Product as MarketplaceProduct } from '../marketplace/api';
import { findOrCreateConversation, getProfileById, type Profile } from '../messaging/controller';

import NativeAdCard from '../../components/ads/NativeAdCard';
import { injectAdsWithPattern } from '../../lib/ads/sequence';
import { ReelsModule } from '../../modules/ReelsModule';
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

  const scrollY = useRef(new Animated.Value(0)).current;

  // ==========================================
  // MIND-BLOWING HOLOGRAPHIC HEADER ANIMATIONS
  // ==========================================
  
  const headerFadeAnim = useRef(new Animated.Value(0)).current;
  const headerSlideAnim = useRef(new Animated.Value(-50)).current;
  const headerScaleAnim = useRef(new Animated.Value(0.9)).current;
  
  // Aurora wave animation
  const auroraPhase = useRef(new Animated.Value(0)).current;
  
  // Parallax depth layers
  const parallaxLayer1 = useRef(new Animated.Value(0)).current;
  const parallaxLayer2 = useRef(new Animated.Value(0)).current;
  const parallaxLayer3 = useRef(new Animated.Value(0)).current;
  
  // Morphing orb animations
  const orbPulse = useRef(new Animated.Value(1)).current;
  const orbRotate = useRef(new Animated.Value(0)).current;
  const orbGlow = useRef(new Animated.Value(0)).current;
  
  // Holographic shimmer
  const hologramShimmer = useRef(new Animated.Value(0)).current;
  
  // Prismatic gradient phase
  const prismPhase = useRef(new Animated.Value(0)).current;
  
  // Dynamic Island Animations - Enhanced
  const islandWidth = scrollY.interpolate({
    inputRange: [0, 60, 100],
    outputRange: ['100%', '85%', '55%'],
    extrapolate: 'clamp',
  });

  const islandTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -8],
    extrapolate: 'clamp',
  });
  
  const islandBlur = scrollY.interpolate({
    inputRange: [0, 50, 100],
    outputRange: [0, 0.3, 0.5],
    extrapolate: 'clamp',
  });

  const textOpacity = scrollY.interpolate({
    inputRange: [0, 30, 60],
    outputRange: [1, 0.7, 0],
    extrapolate: 'clamp',
  });
  
  const headerParallaxY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -30],
    extrapolate: 'clamp',
  });
  
  // Aurora particle system
  const auroraParticles = useRef(
    Array.from({ length: 12 }, (_, i) => ({
      x: new Animated.Value(Math.random() * screenWidth),
      y: new Animated.Value(50 + Math.random() * 100),
      scale: new Animated.Value(0.5 + Math.random() * 0.5),
      opacity: new Animated.Value(0),
      hue: new Animated.Value(Math.random() * 360),
    }))
  ).current;
  
  // Magnetic orb positions
  const magneticOrbs = useRef(
    Array.from({ length: 3 }, (_, i) => ({
      x: new Animated.Value(screenWidth * (0.2 + i * 0.3)),
      y: new Animated.Value(80 + i * 20),
      scale: new Animated.Value(1),
    }))
  ).current;

  useEffect(() => {
    // Grand entrance animation sequence
    Animated.sequence([
      // Phase 1: Header emerges from void
      Animated.parallel([
        Animated.spring(headerSlideAnim, { toValue: 0, tension: 40, friction: 8, useNativeDriver: true }),
        Animated.spring(headerScaleAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
        Animated.timing(headerFadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      // Phase 2: Aurora awakens
      Animated.stagger(50, auroraParticles.map((p) => 
        Animated.loop(
          Animated.parallel([
            Animated.sequence([
              Animated.timing(p.opacity, { toValue: 0.8, duration: 1000 + Math.random() * 500, useNativeDriver: true }),
              Animated.timing(p.opacity, { toValue: 0.2, duration: 2000 + Math.random() * 1000, useNativeDriver: true }),
            ]),
            Animated.loop(
              Animated.sequence([
                Animated.timing(p.y, { toValue: -50, duration: 8000 + Math.random() * 4000, useNativeDriver: true }),
                Animated.timing(p.y, { toValue: 150, duration: 0, useNativeDriver: true }),
              ])
            ),
            Animated.loop(
              Animated.timing(p.hue, { toValue: 360, duration: 5000 + Math.random() * 3000, useNativeDriver: true }),
            ),
          ])
        )
      )),
      // Phase 3: Magnetic orbs pulse
      Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(orbPulse, { toValue: 1.2, duration: 2000, useNativeDriver: true }),
            Animated.timing(orbPulse, { toValue: 1, duration: 2000, useNativeDriver: true }),
          ])
        ),
        Animated.loop(
          Animated.timing(orbRotate, { toValue: 1, duration: 8000, useNativeDriver: true })
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(orbGlow, { toValue: 1, duration: 1500, useNativeDriver: true }),
            Animated.timing(orbGlow, { toValue: 0.3, duration: 1500, useNativeDriver: true }),
          ])
        ),
      ]),
    ]).start();

    // Aurora wave animation
    Animated.loop(
      Animated.timing(auroraPhase, { toValue: 1, duration: 6000, useNativeDriver: true })
    ).start();
    
    // Holographic shimmer
    Animated.loop(
      Animated.timing(hologramShimmer, { toValue: 1, duration: 3000, useNativeDriver: true })
    ).start();
    
    // Prismatic phase
    Animated.loop(
      Animated.timing(prismPhase, { toValue: 1, duration: 10000, useNativeDriver: true })
    ).start();
    
    // Magnetic orb floating
    magneticOrbs.forEach((orb, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(orb.y, { toValue: 70 + i * 25, duration: 3000 + i * 500, useNativeDriver: true }),
          Animated.timing(orb.y, { toValue: 90 + i * 25, duration: 3000 + i * 500, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  const HeaderComponent = () => {
    const [touchPos, setTouchPos] = useState({ x: screenWidth / 2, y: 100 });
    
    const handleHeaderTouch = (e: any) => {
      const { locationX, locationY } = e.nativeEvent;
      setTouchPos({ x: locationX, y: locationY });
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      // Trigger magnetic pull on orbs
      magneticOrbs.forEach((orb, i) => {
        Animated.spring(orb.x, { 
          toValue: locationX + (i - 1) * 40, 
          tension: 50, 
          friction: 8, 
          useNativeDriver: true 
        }).start();
        Animated.spring(orb.y, { 
          toValue: Math.min(locationY + i * 20, 150), 
          tension: 50, 
          friction: 8, 
          useNativeDriver: true 
        }).start();
      });
      // Reset after delay
      setTimeout(() => {
        magneticOrbs.forEach((orb, i) => {
          Animated.spring(orb.x, { 
            toValue: screenWidth * (0.2 + i * 0.3), 
            tension: 30, 
            friction: 10, 
            useNativeDriver: true 
          }).start();
          Animated.spring(orb.y, { 
            toValue: 80 + i * 20, 
            tension: 30, 
            friction: 10, 
            useNativeDriver: true 
          }).start();
        });
      }, 1500);
    };
    
    return (
      <Animated.View
        style={[
          styles.headerContainerIsland,
          {
            paddingTop: Math.max(insets.top, 12),
            opacity: headerFadeAnim,
            transform: [
              { translateY: headerSlideAnim },
              { translateY: headerParallaxY },
              { scale: headerScaleAnim },
            ],
            alignItems: 'center',
            width: '100%',
            zIndex: 100,
          }
        ]}
        onTouchEnd={handleHeaderTouch}
      >
        {/* Aurora Particle System */}
        {auroraParticles.map((particle, i) => (
          <Animated.View
            key={`aurora-${i}`}
            pointerEvents="none"
            style={[
              styles.auroraParticle,
              {
                left: particle.x,
                top: particle.y,
                opacity: particle.opacity,
                transform: [{ scale: particle.scale }],
                shadowColor: `hsl(${particle.hue}, 100%, 60%)`,
                backgroundColor: `hsl(${particle.hue}, 80%, 70%)`,
              },
            ]}
          />
        ))}
        
        {/* Magnetic Glass Orbs */}
        {magneticOrbs.map((orb, i) => {
          const orbColors = [['#e50914', '#ff6b35'], ['#7dd8ff', '#22c55e'], ['#a855f7', '#ec4899']];
          const [color1, color2] = orbColors[i];
          return (
            <Animated.View
              key={`orb-${i}`}
              style={[
                styles.magneticOrb,
                {
                  left: orb.x,
                  top: orb.y,
                  transform: [
                    { translateX: orb.x.interpolate({ inputRange: [0, screenWidth], outputRange: [-25, 25] }) },
                    { translateY: orb.y.interpolate({ inputRange: [0, 200], outputRange: [-25, 25] }) },
                    { scale: orb.scale },
                    { rotate: orbRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
                  ],
                },
              ]}
            >
              <LiquidGlass
                tintOpacity={0.2}
                tintColor={color1}
                cornerRadius={25}
                borderOpacity={0.4}
                glowIntensity={orbGlow}
                glowColor={color1}
                chromaticAberration={true}
                interactive={true}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={[color1, color2]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.magneticOrbGradient}
              />
              <Animated.View style={[styles.magneticOrbCore, { opacity: orbGlow }]}>
                <Ionicons 
                  name={['sparkles', 'film', 'play'][i] as any} 
                  size={16} 
                  color="#fff" 
                />
              </Animated.View>
            </Animated.View>
          );
        })}
        
        {/* Prismatic Background Shimmer */}
        <Animated.View 
          pointerEvents="none"
          style={[
            styles.prismaticShimmer,
            {
              opacity: hologramShimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.1, 0.3, 0.1] }),
              transform: [
                { translateX: hologramShimmer.interpolate({ inputRange: [0, 1], outputRange: [-screenWidth, screenWidth] }) },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(229,9,20,0.15)', 'rgba(125,216,255,0.15)', 'rgba(168,85,247,0.15)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View style={[
          styles.islandWrap,
          {
            width: islandWidth,
            transform: [{ translateY: islandTranslateY }]
          }
        ]}>
          {/* Multi-layer Glass Effect */}
          <LiquidGlass
            tintOpacity={islandBlur.interpolate({ inputRange: [0, 0.5], outputRange: [0.15, 0.35] })}
            tintColor="#000000"
            cornerRadius={34}
            borderOpacity={0.35}
            glowIntensity={0.4}
            glowColor={accentColor || '#e50914'}
            chromaticAberration={true}
            breathingEffect={true}
            interactive={true}
            style={StyleSheet.absoluteFill}
          />
          
          {/* Holographic edge glow */}
          <Animated.View 
            style={[
              styles.hologramEdge,
              {
                opacity: hologramShimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.8, 0.3] }),
              }
            ]}
          >
            <LinearGradient
              colors={['transparent', accentColor || '#e50914', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          
          <View style={styles.islandContent}>
            {/* Left: Profile with morphing aura */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => deferNav(() => router.push('/profile'))}
              style={styles.profileSectionIsland}
            >
              <Animated.View style={[
                styles.avatarAura,
                {
                  transform: [{ scale: orbPulse }],
                  opacity: orbGlow,
                }
              ]}>
                <LinearGradient
                  colors={[accentColor || '#e50914', '#ff6b35', '#ffd700']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
              <View style={[styles.avatarDot, { backgroundColor: accentColor || '#e50914' }]} />
              <Animated.View style={{ opacity: textOpacity, marginLeft: 12, overflow: 'hidden', flex: 1 }}>
                <Animated.Text style={[
                  styles.eyebrowIsland,
                  {
                    opacity: hologramShimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1, 0.6] }),
                  }
                ]}>
                  SOCIAL
                </Animated.Text>
                <Animated.Text style={[
                  styles.welcomeTextIsland, 
                  { 
                    color: accentColor || '#e50914',
                    textShadowColor: accentColor || '#e50914',
                  }
                ]} numberOfLines={1}>
                  {activeTab}
                </Animated.Text>
              </Animated.View>
            </TouchableOpacity>

            {/* Right: Holographic Action Buttons */}
            <View style={styles.actionSectionIsland}>
              <TouchableOpacity 
                style={styles.iconBtnIsland} 
                onPress={() => deferNav(() => router.push('/search'))}
                activeOpacity={0.7}
              >
                <LiquidGlass
                  tintOpacity={0.1}
                  tintColor="#7dd8ff"
                  cornerRadius={20}
                  borderOpacity={0.3}
                  glowIntensity={0.3}
                  glowColor="#7dd8ff"
                  interactive={true}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="search" size={20} color="#7dd8ff" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.iconBtnIsland} 
                onPress={() => deferNav(() => router.push('/messaging'))}
                activeOpacity={0.7}
              >
                <LiquidGlass
                  tintOpacity={0.1}
                  tintColor="#22c55e"
                  cornerRadius={20}
                  borderOpacity={0.3}
                  glowIntensity={0.3}
                  glowColor="#22c55e"
                  interactive={true}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="chatbubble-outline" size={20} color="#22c55e" />
                {unreadBadgeCount ? (
                  <Animated.View style={[
                    styles.badgeIsland,
                    {
                      transform: [{ scale: orbPulse }],
                    }
                  ]}>
                    <LinearGradient
                      colors={['#e50914', '#ff6b35']}
                      style={StyleSheet.absoluteFill}
                    />
                    <Text style={styles.badgeTextIsland}>{unreadBadgeCount > 99 ? '99+' : unreadBadgeCount}</Text>
                  </Animated.View>
                ) : null}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* Floating prismatic tabs */}
        <Animated.View style={[
          styles.tabsDockIsland,
          {
            opacity: headerFadeAnim,
            transform: [
              { translateY: headerSlideAnim.interpolate({ inputRange: [-50, 0], outputRange: [20, 0] }) },
            ],
          }
        ]}>
          <FeedTabs
            active={activeTab}
            onChangeTab={(tab) => {
              if (currentPlan === 'free' && (tab === 'Live' || tab === 'Movie Match')) {
                deferNav(() => router.push('/premium'));
                return;
              }
              setActiveTab(tab);
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
            }}
          />
        </Animated.View>
      </Animated.View>
    );
  };

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

        console.log(`[MovieTrailers] Found ${combined.length} candidates. Starting native batched fetch...`);

        // 1. Process top 6 immediately (Critical Path) via native module
        const initialJson = await ReelsModule.resolveMovieReelsFromTmdb(
          API_KEY,
          API_BASE_URL,
          JSON.stringify(combined.slice(0, 6)),
          6,
        );
        const initialResults = JSON.parse(initialJson || '[]');

        setMovieReels(initialResults as any);

        // If we have at least *some* content (reviews or movie reels), stop "loading" spinner
        if (initialResults.length > 0 || reviews.length > 0) {
          setLoading(false);
        }

        // 2. Process the rest in background chunks
        const remaining = combined.slice(6);
        const CHUNK_SIZE = 6;

        // We'll process remaining items in chunks to avoid spamming the network/thread
        for (let i = 0; i < remaining.length; i += CHUNK_SIZE) {
          const chunk = remaining.slice(i, i + CHUNK_SIZE);
          const chunkJson = await ReelsModule.resolveMovieReelsFromTmdb(
            API_KEY,
            API_BASE_URL,
            JSON.stringify(chunk),
            chunk.length,
          );
          const chunkResults = JSON.parse(chunkJson || '[]');
          setMovieReels(prev => [...prev, ...(chunkResults as any[])]);

          // Small delay to yield to UI thread
          await new Promise(r => setTimeout(r, 450));
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

  const FeedTimelineHeader = () => {
    // Cinematic entrance animations
    const contentFadeAnim = useRef(new Animated.Value(0)).current;
    const contentSlideAnim = useRef(new Animated.Value(30)).current;
    const upgradePulseAnim = useRef(new Animated.Value(1)).current;
    const modeSlideAnim = useRef(new Animated.Value(-20)).current;
    const actionsScaleAnim = useRef(new Animated.Value(0.8)).current;
    
    useEffect(() => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(contentFadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(contentSlideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
        ]),
        Animated.stagger(100, [
          Animated.spring(modeSlideAnim, { toValue: 0, tension: 60, friction: 7, useNativeDriver: true }),
          Animated.spring(actionsScaleAnim, { toValue: 1, tension: 50, friction: 6, useNativeDriver: true }),
        ]),
      ]).start();
      
      // Premium upgrade pulse
      if (currentPlan === 'free') {
        Animated.loop(
          Animated.sequence([
            Animated.timing(upgradePulseAnim, { toValue: 1.02, duration: 1200, useNativeDriver: true }),
            Animated.timing(upgradePulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          ])
        ).start();
      }
    }, [currentPlan]);
    
    return (
      <Animated.View style={{ opacity: contentFadeAnim, transform: [{ translateY: contentSlideAnim }] }}>
        {/* Cinematic Premium Upgrade - Morphing Glass Hologram */}
        {currentPlan === 'free' && (
          <Animated.View style={[styles.upgradeBanner, { transform: [{ scale: upgradePulseAnim }] }]}>
            {/* Multi-layer holographic glass */}
            <LiquidGlass
              tintOpacity={0.25}
              tintColor="#e50914"
              cornerRadius={24}
              borderOpacity={0.4}
              glowIntensity={0.6}
              glowColor="#e50914"
              chromaticAberration={true}
              breathingEffect={true}
              interactive={true}
              style={StyleSheet.absoluteFillObject}
            />
            
            {/* Animated gradient overlay */}
            <Animated.View style={styles.upgradeGradientOverlay}>
              <LinearGradient
                colors={['rgba(229,9,20,0.4)', 'rgba(255,107,53,0.3)', 'rgba(255,215,0,0.2)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            
            {/* Particle emitter around upgrade */}
            {Array.from({ length: 6 }).map((_, i) => (
              <Animated.View
                key={`upgrade-particle-${i}`}
                style={[
                  styles.upgradeParticle,
                  {
                    left: `${15 + i * 15}%`,
                    top: `${20 + (i % 2) * 60}%`,
                    opacity: upgradePulseAnim.interpolate({ inputRange: [1, 1.02], outputRange: [0.4, 0.8] }),
                    transform: [{ scale: upgradePulseAnim }],
                  }
                ]}
              />
            ))}
            
            <View style={styles.upgradeBannerContent}>
              <View style={styles.upgradeBannerIcon}>
                <LinearGradient
                  colors={['#ffd700', '#ff6b35', '#e50914']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.upgradeIconGradient}
                >
                  <Ionicons name="diamond" size={24} color="#fff" />
                </LinearGradient>
              </View>
              <View style={styles.upgradeBannerText}>
                <Text style={styles.upgradeBannerTitle}>Unlock Premium</Text>
                <Text style={styles.upgradeBannerSubtitle}>
                  Unlimited posts, exclusive features & more
                </Text>
              </View>
              <TouchableOpacity
                style={styles.upgradeBannerButton}
                onPress={() => deferNav(() => router.push('/premium?source=social'))}
                activeOpacity={0.85}
              >
                <LiquidGlass
                  tintOpacity={0.4}
                  tintColor="#ffd700"
                  cornerRadius={16}
                  borderOpacity={0.5}
                  glowIntensity={0.7}
                  glowColor="#ffd700"
                  interactive={true}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.upgradeBannerButtonText}>Upgrade</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        <View style={styles.feedHeaderContent}>
          {/* Morphing Glass Mode Switcher */}
          <Animated.View style={[styles.modeSwitcherWrap, { transform: [{ translateX: modeSlideAnim }] }]}>
            <View style={styles.modeSwitcherContainer}>
              <LiquidGlass
                tintOpacity={0.12}
                tintColor="#000000"
                cornerRadius={18}
                borderOpacity={0.2}
                glowIntensity={0.2}
                glowColor={accentColor || '#e50914'}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.modeSwitcher}>
                {([
                  { key: 'timeline' as const, label: 'Timeline', icon: 'list' as const },
                  { key: 'collage' as const, label: 'Grid', icon: 'grid' as const },
                ]).map((mode) => {
                  const isActive = (feedMode as string) === mode.key;
                  return (
                    <TouchableOpacity
                      key={mode.key}
                      onPress={() => {
                        setFeedMode(mode.key);
                        if (Platform.OS !== 'web') {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                      }}
                      style={styles.modeBtn}
                      activeOpacity={0.8}
                    >
                      {isActive && (
                        <Animated.View style={StyleSheet.absoluteFill}>
                          <LiquidGlass
                            tintOpacity={0.35}
                            tintColor={accentColor || '#e50914'}
                            cornerRadius={12}
                            borderOpacity={0.4}
                            glowIntensity={0.6}
                            glowColor={accentColor || '#e50914'}
                            chromaticAberration={true}
                            interactive={true}
                            style={StyleSheet.absoluteFill}
                          />
                        </Animated.View>
                      )}
                      <Ionicons
                        name={mode.icon}
                        size={18}
                        color={isActive ? '#fff' : 'rgba(255,255,255,0.5)'}
                        style={{ zIndex: 1 }}
                      />
                      <Text style={[styles.modeBtnText, isActive && styles.modeBtnTextActive]}>
                        {mode.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </Animated.View>

          {/* Stories Row - Cinematic */}
          <StoriesRow showAddStory={currentPlan !== 'free'} />

          {/* Holographic Quick Actions */}
          <Animated.View style={[styles.quickActionsRow, { transform: [{ scale: actionsScaleAnim }] }]}>
            {[
              { key: 'fresh', icon: 'sparkles' as const, color: '#7dd8ff', glowColor: '#7dd8ff', action: () => {} },
              { key: 'reels', icon: 'play' as const, color: '#e50914', glowColor: '#ff4b4b', action: openFeedReels },
              { key: 'live', icon: 'radio' as const, color: '#ff6b35', glowColor: '#ff6b35', action: () => setActiveTab('Live') },
              { key: 'match', icon: 'heart' as const, color: '#ffd700', glowColor: '#ffd700', action: () => setActiveTab('Movie Match') },
            ].map((action, index) => (
              <TouchableOpacity
                key={action.key}
                style={styles.quickAction}
                activeOpacity={0.75}
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  action.action();
                }}
              >
                <View style={styles.quickActionIcon}>
                  <LiquidGlass
                    tintOpacity={0.18}
                    tintColor={action.color}
                    cornerRadius={18}
                    borderOpacity={0.35}
                    glowIntensity={0.5}
                    glowColor={action.glowColor}
                    chromaticAberration={true}
                    breathingEffect={true}
                    interactive={true}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Animated.View style={styles.quickActionCore}>
                    <Ionicons name={action.icon} size={22} color={action.color} />
                  </Animated.View>
                </View>
                <Text style={styles.quickActionText}>
                  {action.key.charAt(0).toUpperCase() + action.key.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>

          {currentPlan !== 'free' && <PostMovieReview />}
        </View>
      </Animated.View>
    );
  };

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
  
  // Live dot pulse animation
  const iconPulseAnim = useRef(new Animated.Value(1)).current;

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
    
    // Live dot pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulseAnim, { toValue: 1.05, duration: 500, useNativeDriver: true }),
        Animated.timing(iconPulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();

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

        {/* Cinematic Aurora Background */}
        <Animated.View style={StyleSheet.absoluteFillObject}>
          {/* Deep space gradient */}
          <LinearGradient
            colors={[accentColor + '25', '#0a0612', '#05060f', '#030308']}
            locations={[0, 0.2, 0.6, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          
          {/* Aurora wave layers */}
          <Animated.View 
            style={[
              styles.auroraWave,
              {
                transform: [{ translateX: auroraPhase.interpolate({ inputRange: [0, 1], outputRange: [-200, 200] }) }],
              }
            ]}
          >
            <LinearGradient
              colors={['transparent', accentColor + '20', 'rgba(125,216,255,0.15)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          
          {/* Prismatic shimmer overlay */}
          <Animated.View 
            style={[
              styles.prismaticOverlay,
              {
                opacity: prismPhase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.1, 0.2, 0.1] }),
                transform: [
                  { rotate: prismPhase.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '5deg'] }) },
                ],
              }
            ]}
          >
            <LinearGradient
              colors={['rgba(229,9,20,0.1)', 'rgba(168,85,247,0.1)', 'rgba(125,216,255,0.1)', 'rgba(255,215,0,0.1)']}
              locations={[0, 0.33, 0.66, 1]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Animated.View>

        {/* Enhanced floating particles with glow trails */}
        {particles.map((particle, i) => {
          const particleColors = [accentColor, '#7dd8ff', '#ffd700', '#a855f7', '#22c55e'];
          const particleColor = particleColors[i % particleColors.length];
          return (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[
                styles.floatingParticle,
                {
                  backgroundColor: particleColor,
                  shadowColor: particleColor,
                  opacity: particle.opacity,
                  transform: [
                    { translateX: particle.x.interpolate({ inputRange: [0, 100], outputRange: [0, screenWidth] }) },
                    { translateY: particle.y.interpolate({ inputRange: [0, 100], outputRange: [0, 800] }) },
                    { scale: particle.scale },
                  ],
                },
              ]}
            >
              {/* Glow ring */}
              <View style={[styles.particleGlow, { borderColor: particleColor }]} />
            </Animated.View>
          );
        })}

        <HeaderComponent />

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
                  keyExtractor={(item: LiveStream) => String(item.id)}
                  showsVerticalScrollIndicator={false}
                  ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  renderItem={({ item }: { item: LiveStream }) => (
                    <TouchableOpacity
                      style={styles.liveCard}
                      activeOpacity={0.9}
                      onPress={() => deferNav(() => router.push(`/social-feed/live/${item.id}`))}
                    >
                      <LiquidGlass
                        tintOpacity={0.15}
                        tintColor="#e50914"
                        cornerRadius={18}
                        borderOpacity={0.25}
                        glowIntensity={0.4}
                        glowColor="#e50914"
                        interactive={true}
                        style={StyleSheet.absoluteFillObject}
                      />
                      <View style={styles.liveCardCopy}>
                        <Text style={styles.liveCardTitle} numberOfLines={1} ellipsizeMode="tail">
                          {item.title || 'Live on MovieFlix'}
                        </Text>
                        <View style={styles.liveCardMetaRow}>
                          <Ionicons name="eye-outline" size={13} color="rgba(255,255,255,0.6)" />
                          <Text style={styles.liveCardSubtitle} numberOfLines={1} ellipsizeMode="tail">
                            {item.hostName || 'Host'} · {item.viewersCount ?? 0} watching
                          </Text>
                        </View>
                      </View>
                      <View style={styles.liveChip}>
                        <Animated.View style={[styles.liveDot, {
                          opacity: iconPulseAnim.interpolate({ inputRange: [1, 1.05], outputRange: [1, 0.4] }),
                          transform: [{ scale: iconPulseAnim }],
                        }]} />
                        <Text style={styles.liveChipText}>LIVE</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          ) : (
            feedMode === 'collage' ? (
              <AnimatedFlashList
                data={loading ? Array.from({ length: 12 }) : filteredReviews}
                keyExtractor={(item: any, i: number) => (loading ? `placeholder-${i}` : String((item as any).id))}
                numColumns={collageColumns}
                estimatedItemSize={collageTileWidth * 1.1}
                ListHeaderComponent={FeedTimelineHeader}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                  { useNativeDriver: false }
                )}
                scrollEventThrottle={16}
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
                  paddingTop: 100,
                  paddingBottom: listBottomPadding,
                  paddingHorizontal: 10,
                }}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <FlashList<FeedItem | undefined>
                data={loading ? Array.from({ length: 3 }) : feedItems}
                estimatedItemSize={600}
                keyExtractor={(item: FeedItem | undefined | null, i: number) =>
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
                  paddingTop: 100,
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
              keyExtractor={(it: any) => String((it as any).id)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={Math.min(Math.max(collageModalIndex, 0), Math.max(0, filteredReviews.length - 1))}
              getItemLayout={(_: any, idx: number) => ({ length: screenWidth, offset: screenWidth * idx, index: idx })}
              onMomentumScrollEnd={(e: any) => {
                const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, screenWidth));
                setCollageModalIndex(next);
              }}
              renderItem={({ item, index }: { item: ReviewItem; index: number }) => (
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

        {/* Stunning animated FAB - Holographic Morphing Glass */}
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
            {/* Multi-layer glow effect */}
            <Animated.View 
              style={[
                styles.fabGlow, 
                { 
                  backgroundColor: accentColor,
                  opacity: fabScaleAnim.interpolate({ inputRange: [0.85, 1, 1.08], outputRange: [0.2, 0.3, 0.5] }),
                  transform: [{ scale: fabScaleAnim }],
                }
              ]} 
            />
            
            {/* Outer aura ring */}
            <Animated.View 
              style={[
                styles.fabAuraRing,
                {
                  borderColor: accentColor,
                  opacity: fabScaleAnim.interpolate({ inputRange: [0.85, 1, 1.08], outputRange: [0.2, 0.4, 0.6] }),
                  transform: [{ scale: fabScaleAnim }],
                }
              ]}
            />

            <TouchableOpacity
              style={styles.fab}
              onPress={handleFabPress}
              activeOpacity={1}
            >
              <LiquidGlass
                tintOpacity={0.3}
                tintColor={accentColor}
                cornerRadius={22}
                borderOpacity={0.5}
                glowIntensity={0.8}
                glowColor={accentColor}
                chromaticAberration={true}
                breathingEffect={true}
                interactive={true}
                style={StyleSheet.absoluteFillObject}
              />
              
              {/* Prismatic inner glow */}
              <LinearGradient
                colors={['rgba(255,255,255,0.3)', 'transparent', 'rgba(255,255,255,0.1)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
              />
              
              <Ionicons name="add" size={30} color="#fff" style={{ zIndex: 1 }} />
              
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
  const cardGlowAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Holographic shimmer loop
    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 3000, useNativeDriver: true })
    ).start();
    
    // Pulse glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(cardGlowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(cardGlowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(cardScale, { toValue: 0.97, tension: 200, friction: 12, useNativeDriver: true }).start();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
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
        {/* Multi-layer Holographic Glass Background */}
        <View style={styles.promoGlassWrap}>
          <LiquidGlass
            glowColor="#e50914"
            tintOpacity={0.2}
            tintColor="#1a0a12"
            cornerRadius={24}
            glowIntensity={cardGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] })}
            borderOpacity={0.4}
            chromaticAberration={true}
            breathingEffect={true}
            interactive={true}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
        
        {/* Holographic edge glow */}
        <Animated.View 
          style={[
            styles.promoHologramEdge,
            {
              opacity: cardGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
            }
          ]}
        >
          <LinearGradient
            colors={['transparent', '#e50914', '#ff6b35', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Cinematic gradient accent */}
        <LinearGradient
          colors={['rgba(229,9,20,0.35)', 'rgba(255,107,53,0.2)', 'transparent']}
          style={styles.promoAccentGlow}
        />

        {/* Image with cinematic overlay */}
        <View style={styles.promoImageWrap}>
          <Image source={{ uri: product.imageUrl }} style={styles.promoImage} />
          
          {/* Multi-layer gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
            locations={[0, 0.5, 1]}
            style={styles.promoImageOverlay}
          />
          
          {/* Film grain texture */}
          <Animated.View 
            style={[
              styles.promoFilmGrain,
              {
                opacity: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.02, 0.05, 0.02] }),
              }
            ]}
          />
          
          {/* Sponsored badge - Glass morphic */}
          <View style={styles.promoBadgeWrap}>
            <LiquidGlass
              tintOpacity={0.6}
              tintColor="#e50914"
              cornerRadius={12}
              borderOpacity={0.4}
              glowIntensity={0.5}
              glowColor="#ff6b35"
              interactive={true}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.promoBadgeContent}>
              <Ionicons name="megaphone" size={11} color="#fff" />
              <Text style={styles.promoBadgeText}>SPONSORED</Text>
            </View>
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
            {/* Price tag - Glass morphic */}
            <View style={styles.promoPriceTag}>
              <LiquidGlass
                tintOpacity={0.4}
                tintColor="#e50914"
                cornerRadius={12}
                borderOpacity={0.3}
                glowIntensity={0.4}
                glowColor="#ff6b35"
                style={StyleSheet.absoluteFill}
              />
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
                    colors={['#e50914', '#ff6b35', '#ffd700']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
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

            {/* Chat button - Glass morphic */}
            <TouchableOpacity
              style={styles.promoChatBtn}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                onMessage();
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
              }}
              activeOpacity={0.8}
            >
              <LiquidGlass
                tintOpacity={0.3}
                tintColor="#22c55e"
                cornerRadius={14}
                borderOpacity={0.4}
                glowIntensity={0.5}
                glowColor="#22c55e"
                interactive={true}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="chatbubble" size={16} color="#22c55e" style={{ zIndex: 1 }} />
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

  tabsDockIsland: {
    width: '100%',
    marginTop: 10,
    zIndex: 10,
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

  /* Header Styles Matching Home */
  headerContainerIsland: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    alignItems: 'center',
    width: '100%',
  },
  islandWrap: {
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  islandContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  profileSectionIsland: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    flexShrink: 1,
  },
  avatarDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrowIsland: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    marginBottom: 1,
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  welcomeTextIsland: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  actionSectionIsland: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    paddingHorizontal: 4,
    height: 44,
  },
  iconBtnIsland: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeIsland: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ff3333',
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    zIndex: 10,
  },
  badgeTextIsland: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  headerContainer: {
    paddingTop: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  profilePill: {
    flex: 1,
    marginRight: 8,
    borderRadius: 24,
    overflow: 'hidden',
    height: 56,
  },
  profilePillContent: {
    flex: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  tonightLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    marginBottom: 1,
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  welcomeText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#e50914',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#05060f',
  },
  badgeText: {
    color: '#fff',
    fontSize: 7,
    fontWeight: 'bold',
  },
  genreBox: {
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 28,
    padding: 14,
    overflow: 'hidden',
    minHeight: 100,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 14,
    marginLeft: 2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  metaPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  modeSwitcherWrap: {
    marginBottom: 12,
  },

  modeSwitcher: {
    flexDirection: 'row',
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
    overflow: 'hidden',
  },
  modeBtnActive: {
    // Native liquid glass handles active styling now
  },
  modeBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    zIndex: 1,
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
  liveCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
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
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    fontSize: 11,
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
  
  // ==========================================
  // HOLOGRAPHIC & AURORA STYLES - MIND BLOWING
  // ==========================================
  
  // Aurora particle system
  auroraParticle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  
  // Magnetic glass orbs
  magneticOrb: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  magneticOrbGradient: {
    width: 30,
    height: 30,
    borderRadius: 15,
    opacity: 0.6,
  },
  magneticOrbCore: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Prismatic shimmer overlay
  prismaticShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
    overflow: 'hidden',
  },
  
  // Holographic edge glow
  hologramEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  
  // Avatar morphing aura
  avatarAura: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  
  // Aurora wave background
  auroraWave: {
    position: 'absolute',
    top: 0,
    left: -200,
    right: -200,
    height: 300,
    overflow: 'hidden',
  },
  
  // Prismatic background overlay
  prismaticOverlay: {
    position: 'absolute',
    top: -100,
    left: -50,
    right: -50,
    height: 400,
    overflow: 'hidden',
    transform: [{ rotate: '-5deg' }],
  },
  
  // Particle glow ring
  particleGlow: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    left: -3,
    top: -3,
  },
  
  // FAB aura ring
  fabAuraRing: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  
  // Mode switcher container
  modeSwitcherContainer: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: 4,
  },
  
  // Quick action core
  quickActionCore: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  
  // Upgrade banner gradient overlay
  upgradeGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    overflow: 'hidden',
  },
  
  // Upgrade particle
  upgradeParticle: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#ffd700',
    shadowColor: '#ffd700',
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  
  // Upgrade icon gradient
  upgradeIconGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ffd700',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  
  // Promo holographic edge
  promoHologramEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  
  // Promo film grain
  promoFilmGrain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  
  // Promo badge content
  promoBadgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});

export default SocialFeed;
