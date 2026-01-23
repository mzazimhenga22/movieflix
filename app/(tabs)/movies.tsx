import { FontAwesome, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  InteractionManager,
  PixelRatio,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewToken
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type MovieTrailerCarouselHandle } from '../../components/MovieTrailerCarousel';
import ScreenWrapper from '../../components/ScreenWrapper';

import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import { getResponsiveCardDimensions } from '@/hooks/useResponsive';
import AdBanner from '../../components/ads/AdBanner';
import StoryCarousel from '../../components/Story';
import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../../constants/api';
import { authPromise, firestore } from '../../constants/firebase';
import { getAccentFromPosterPath } from '../../constants/theme';
import { pushWithOptionalInterstitial } from '../../lib/ads/navigate';
import { initBackgroundScheduler, onHeavyScreenFocus } from '../../lib/backgroundScheduler';
import { getFavoriteGenre, type FavoriteGenre } from '../../lib/favoriteGenreStorage';
import { buildProfileScopedKey } from '../../lib/profileStorage';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { Media } from '../../types/index';
import { useAccent } from '../components/AccentContext';
import FlixyAssistant from '../components/FlixyAssistant';
import FlixyWalkthrough, { shouldShowWalkthrough } from '../components/FlixyWalkthrough';
import SnowOverlay from '../messaging/components/SnowOverlay';
import { onConversationsUpdate, type Conversation } from '../messaging/controller';
import FireworksOverlay from './movies/components/FireworksOverlay';
import FreshDropsOverlay from './movies/components/FreshDropsOverlay';
import LoadingSkeleton from './movies/components/LoadingSkeleton';
import {
  BecauseYouWatchedSection,
  ContinueWatchingSection,
  FavoriteGenreSection,
  FeaturedSection,
  ProgressiveMovieSection,
  SongsSection,
  TrailersSection,
} from './movies/components/MemoizedSections';
import { useMoviesData } from './movies/hooks/useMoviesData';

const PULSE_PALETTES: [string, string][] = [
  ['#ff9966', '#ff5e62'],
  ['#70e1f5', '#ffd194'],
  ['#c471f5', '#fa71cd'],
];

import { FloatingParticles } from './movies/components/FloatingParticles';


const FILTER_KEYS = ['All', 'TopRated', 'New', 'ForYou'] as const;
const FILTER_LABELS: Record<(typeof FILTER_KEYS)[number], string> = {
  All: 'All',
  TopRated: 'Top Rated',
  New: 'New',
  ForYou: 'For You',
};

const STICKY_HEADER_TOP = 25;

const REELS_COLLAPSE_MS = 650;
const PREFETCH_AHEAD_SECTIONS = 1;
const PREFETCH_MAX_IMAGES = 12;

type FilteredCollections = {
  filteredTrending: Media[];
  filteredRecommended: Media[];
  filteredNetflix: Media[];
  filteredAmazon: Media[];
  filteredHbo: Media[];
  filteredTrendingMoviesOnly: Media[];
  filteredTrendingTvOnly: Media[];
  filteredSongs: Media[];
  filteredMovieReels: Media[];
  actionPicks: Media[];
  comedyPicks: Media[];
  horrorPicks: Media[];
  romancePicks: Media[];
  sciFiPicks: Media[];
  becauseYouWatched: Media[];
};

import { recommendContent } from '../../lib/algo';

// ... (keep existing imports)

function useFilteredCollections(params: {
  activeFilter: 'All' | 'TopRated' | 'New' | 'ForYou';
  activeGenreId: number | null;
  recommended: Media[];
  trending: Media[];
  netflix: Media[];
  amazon: Media[];
  hbo: Media[];
  trendingMoviesOnly: Media[];
  trendingTvOnly: Media[];
  songs: Media[];
  movieReels: Media[];
  lastWatched: Media | null;
  userId: string | null;
}): FilteredCollections {
  const {
    activeFilter,
    activeGenreId,
    recommended,
    trending,
    netflix,
    amazon,
    hbo,
    trendingMoviesOnly,
    trendingTvOnly,
    songs,
    movieReels,
    lastWatched,
    userId,
  } = params;

  // Internal state for algo-sorted recommended
  const [algoRecommended, setAlgoRecommended] = useState<Media[]>([]);

  useEffect(() => {
    if (recommended.length > 0) {
      void recommendContent(recommended, userId).then(setAlgoRecommended);
    }
  }, [recommended, userId]);

  // Helper to filter/sort a single list
  const getFilteredList = useCallback((items: Media[]) => {
    if (!items || items.length === 0) return [];
    let base = items;
    if (activeGenreId != null) {
      base = base.filter((m) => ((m.genre_ids || []) as number[]).includes(activeGenreId));
    }
    switch (activeFilter) {
      case 'TopRated':
        return [...base].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
      case 'New':
        return [...base].sort((a, b) => {
          const da = (a.release_date || a.first_air_date || '') as string;
          const db = (b.release_date || b.first_air_date || '') as string;
          return db.localeCompare(da);
        });
      case 'ForYou':
        // Only apply algo sort if this is the "recommended" list, otherwise valid for all?
        // Actually the original code applied it generally if 'ForYou' was selected,
        // BUT it used 'algoRecommended' specifically for the 'ForYou' case in the switch.
        // The original logic returned `algoRecommended` wholesale if activeFilter === 'ForYou'.
        // This implies 'ForYou' overrides the list content entirely with `algoRecommended`?
        // Let's look at the original code:
        // case 'ForYou': return algoRecommended.length > 0 ? algoRecommended : base;
        // This means ANY list passed to `applyFilter` would return `algoRecommended` if filter is ForYou.
        // That seems wrong for lists like "Netflix", "Amazon".
        // It likely only makes sense for the main feed?
        // However, to maintain exact behavior:
        return algoRecommended.length > 0 ? algoRecommended : base;
      default:
        return base;
    }
  }, [activeFilter, activeGenreId, algoRecommended]);

  // However, the above logic for 'ForYou' replacing EVERYTHING with `algoRecommended` seems like a bug or very specific design.
  // If I select "Netflix" section and filter "For You", should it show "Recommended" items instead of Netflix items?
  // The original code:
  // const filteredNetflix = applyFilter(netflix);
  // -> if ForYou, returns algoRecommended.
  // So yes, it replaces ALL lists with the recommended list.
  // I will preserve this behavior for now to ensure "exact UI functionality", even if quirksome.

  // OPTIMIZATION: defining the filter function inside useMemo was causing recreation.
  // Now using useCallback. But `algoRecommended` changes often?
  // Actually, we can split it.

  const applyGenericFilter = useCallback((items: Media[]) => {
    if (!items || items.length === 0) return [];
    let base = items;
    if (activeGenreId != null) {
      base = base.filter((m) => ((m.genre_ids || []) as number[]).includes(activeGenreId));
    }
    if (activeFilter === 'TopRated') {
      return [...base].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    }
    if (activeFilter === 'New') {
      return [...base].sort((a, b) => {
        const da = (a.release_date || a.first_air_date || '') as string;
        const db = (b.release_date || b.first_air_date || '') as string;
        return db.localeCompare(da);
      });
    }
    // 'ForYou' is handled specifically below or just falls through if we treat it like 'All' for non-main lists
    // BUT existing behavior replaced content.
    return base;
  }, [activeGenreId, activeFilter]);

  // Memoize each list individually
  const filteredTrending = useMemo(() => {
    if (activeFilter === 'ForYou' && algoRecommended.length > 0) return algoRecommended;
    return applyGenericFilter(trending);
  }, [trending, activeFilter, algoRecommended, applyGenericFilter]);

  const filteredRecommended = useMemo(() => {
    if (activeFilter === 'ForYou' && algoRecommended.length > 0) return algoRecommended;
    return applyGenericFilter(recommended);
  }, [recommended, activeFilter, algoRecommended, applyGenericFilter]);

  const filteredNetflix = useMemo(() => {
    if (activeFilter === 'ForYou' && algoRecommended.length > 0) return algoRecommended;
    return applyGenericFilter(netflix);
  }, [netflix, activeFilter, algoRecommended, applyGenericFilter]);

  const filteredAmazon = useMemo(() => {
    if (activeFilter === 'ForYou' && algoRecommended.length > 0) return algoRecommended;
    return applyGenericFilter(amazon);
  }, [amazon, activeFilter, algoRecommended, applyGenericFilter]);

  const filteredHbo = useMemo(() => {
    if (activeFilter === 'ForYou' && algoRecommended.length > 0) return algoRecommended;
    return applyGenericFilter(hbo);
  }, [hbo, activeFilter, algoRecommended, applyGenericFilter]);

  const filteredTrendingMoviesOnly = useMemo(() => {
    if (activeFilter === 'ForYou' && algoRecommended.length > 0) return algoRecommended;
    return applyGenericFilter(trendingMoviesOnly);
  }, [trendingMoviesOnly, activeFilter, algoRecommended, applyGenericFilter]);

  const filteredTrendingTvOnly = useMemo(() => {
    if (activeFilter === 'ForYou' && algoRecommended.length > 0) return algoRecommended;
    return applyGenericFilter(trendingTvOnly);
  }, [trendingTvOnly, activeFilter, algoRecommended, applyGenericFilter]);

  const filteredSongs = useMemo(() => {
    // Songs probably shouldn't be replaced by movies in 'ForYou' mode, but preserving logic:
    if (activeFilter === 'ForYou' && algoRecommended.length > 0) return algoRecommended;
    return applyGenericFilter(songs as any);
  }, [songs, activeFilter, algoRecommended, applyGenericFilter]);

  const filteredMovieReels = useMemo(() => {
    if (activeFilter === 'ForYou' && algoRecommended.length > 0) return algoRecommended;
    return applyGenericFilter(movieReels);
  }, [movieReels, activeFilter, algoRecommended, applyGenericFilter]);

  // Genre picks - only sorted, not filtered by activeGenreId again (redundant?)
  // Original: ApplySortOnly(trendingMoviesOnly.filter(...))
  // We can memoize the base filtered lists first

  const actionMovies = useMemo(() => trendingMoviesOnly.filter(m => (m.genre_ids || []).includes(28)), [trendingMoviesOnly]);
  const comedyMovies = useMemo(() => trendingMoviesOnly.filter(m => (m.genre_ids || []).includes(35)), [trendingMoviesOnly]);
  const horrorMovies = useMemo(() => trendingMoviesOnly.filter(m => (m.genre_ids || []).includes(27)), [trendingMoviesOnly]);
  const romanceMovies = useMemo(() => trendingMoviesOnly.filter(m => (m.genre_ids || []).includes(10749)), [trendingMoviesOnly]);
  const sciFiMovies = useMemo(() => trendingMoviesOnly.filter(m => (m.genre_ids || []).includes(878)), [trendingMoviesOnly]);

  const applySortOnly = useCallback((items: Media[]) => {
    if (!items || items.length === 0) return [];
    if (activeFilter === 'TopRated') {
      return [...items].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    }
    if (activeFilter === 'New') {
      return [...items].sort((a, b) => {
        const da = (a.release_date || a.first_air_date || '') as string;
        const db = (b.release_date || b.first_air_date || '') as string;
        return db.localeCompare(da);
      });
    }
    return items;
  }, [activeFilter]);

  const actionPicks = useMemo(() => applySortOnly(actionMovies), [actionMovies, applySortOnly]);
  const comedyPicks = useMemo(() => applySortOnly(comedyMovies), [comedyMovies, applySortOnly]);
  const horrorPicks = useMemo(() => applySortOnly(horrorMovies), [horrorMovies, applySortOnly]);
  const romancePicks = useMemo(() => applySortOnly(romanceMovies), [romanceMovies, applySortOnly]);
  const sciFiPicks = useMemo(() => applySortOnly(sciFiMovies), [sciFiMovies, applySortOnly]);

  const becauseYouWatched = useMemo(() => {
    if (!lastWatched || !recommended || recommended.length === 0) return [];
    const lastGenres = (lastWatched.genre_ids || []) as number[];
    if (!lastGenres.length) return [];
    return recommended.filter((m) => {
      const genres = (m.genre_ids || []) as number[];
      return genres.some((g) => lastGenres.includes(g));
    });
  }, [lastWatched, recommended]);

  return {
    filteredTrending,
    filteredRecommended,
    filteredNetflix,
    filteredAmazon,
    filteredHbo,
    filteredTrendingMoviesOnly,
    filteredTrendingTvOnly,
    filteredSongs,
    filteredMovieReels,
    actionPicks,
    comedyPicks,
    horrorPicks,
    romancePicks,
    sciFiPicks,
    becauseYouWatched,
  };
}

// Row entrance animation component
const RowWrapper = memo(({ children, index }: { children: React.ReactNode; index: number }) => {
  const rowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rowAnim, {
      toValue: 1,
      duration: 500,
      delay: index * 60,
      useNativeDriver: true,
      easing: Easing.out(Easing.back(0.8)),
    }).start();
  }, [index, rowAnim]);

  const opacity = rowAnim.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0, 1],
  });

  const translateX = rowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 0],
  });

  const scale = rowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }, { scale }] }}>
      {children}
    </Animated.View>
  );
});

const HomeScreen: React.FC = () => {
  const { currentPlan } = useSubscription();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fontScale = PixelRatio.getFontScale();
  const isCompactLayout = screenWidth < 360 || fontScale > 1.2;

  const responsiveCards = useMemo(() => getResponsiveCardDimensions(screenWidth), [screenWidth]);

  const navHeight = isCompactLayout ? 64 : 72;
  const fabBottomOffset = navHeight + Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 10) + 36;

  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(147);
  const stickyHeaderSpacerHeight = useMemo(
    () => Math.max(0, STICKY_HEADER_TOP + stickyHeaderHeight),
    [stickyHeaderHeight],
  );
  const onStickyHeaderLayout = useCallback(
    (e: any) => {
      const next = e?.nativeEvent?.layout?.height;
      if (typeof next !== 'number' || !Number.isFinite(next) || next <= 0) return;
      if (Math.abs(next - stickyHeaderHeight) < 1) return;
      setStickyHeaderHeight(next);
    },
    [stickyHeaderHeight],
  );

  const [showPulseCards, setShowPulseCards] = useState(false);
  const [snowing, setSnowing] = useState(false);

  const [fireworksKey, setFireworksKey] = useState(0);
  const [freshDropsKey, setFreshDropsKey] = useState(0);

  const trendingPillScale = useRef(new Animated.Value(1)).current;
  const reelsPillScale = useRef(new Animated.Value(1)).current;
  const dropsPillScale = useRef(new Animated.Value(1)).current;

  const reelsCollapseAnim = useRef(new Animated.Value(0)).current;
  const reelsCollapseRunningRef = useRef(false);
  const [reelsCollapsing, setReelsCollapsing] = useState(false);

  // Walkthrough state
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [walkthroughChecked, setWalkthroughChecked] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const shouldShow = await shouldShowWalkthrough();
        setShowWalkthrough(shouldShow);
      } catch {
        // ignore
      } finally {
        setWalkthroughChecked(true);
      }
    })();
  }, []);

  // Initialize reels prefetch cache on app start
  // Initialize background scheduler
  useEffect(() => {
    initBackgroundScheduler();
  }, []);

  // Mark this as a heavy screen to pause background work
  useFocusEffect(
    useCallback(() => {
      onHeavyScreenFocus('movies');
    }, [])
  );

  const bumpPill = useCallback((v: Animated.Value) => {
    v.stopAnimation();
    v.setValue(1);
    Animated.sequence([
      Animated.timing(v, { toValue: 1.08, duration: 120, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, []);

  const triggerReelsCollapse = useCallback(() => {
    if (reelsCollapseRunningRef.current) return;
    reelsCollapseRunningRef.current = true;
    setReelsCollapsing(true);
    reelsCollapseAnim.stopAnimation();
    reelsCollapseAnim.setValue(0);
    Animated.sequence([
      // Phase 1: Quick shake before collapse
      Animated.timing(reelsCollapseAnim, {
        toValue: 0.15,
        duration: 80,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(reelsCollapseAnim, {
        toValue: 0.05,
        duration: 60,
        useNativeDriver: true,
      }),
      // Phase 2: Main collapse - TV turning off effect
      Animated.timing(reelsCollapseAnim, {
        toValue: 1,
        duration: REELS_COLLAPSE_MS,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      }),
      // Phase 3: Hold at collapsed state briefly
      Animated.delay(120),
      // Phase 4: Explosive bounce back
      Animated.spring(reelsCollapseAnim, {
        toValue: 0,
        speed: 12,
        bounciness: 14,
        useNativeDriver: true,
      }),
    ]).start(() => {
      reelsCollapseRunningRef.current = false;
      setReelsCollapsing(false);
    });
  }, [reelsCollapseAnim]);

  const screenFxStyle = useMemo(() => {
    // TV turn-off effect: shrinks vertically first, then horizontally to a line, then disappears
    const scaleX = reelsCollapseAnim.interpolate({
      inputRange: [0, 0.15, 0.5, 0.8, 1],
      outputRange: [1, 1.02, 0.95, 0.3, 0.01]
    });
    const scaleY = reelsCollapseAnim.interpolate({
      inputRange: [0, 0.15, 0.4, 0.7, 1],
      outputRange: [1, 1.01, 0.15, 0.02, 0.002]
    });
    const rotate = reelsCollapseAnim.interpolate({
      inputRange: [0, 0.1, 0.2, 1],
      outputRange: ['0deg', '1deg', '-0.5deg', '0deg']
    });
    const translateY = reelsCollapseAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 20, 0]
    });
    const opacity = reelsCollapseAnim.interpolate({
      inputRange: [0, 0.7, 0.9, 1],
      outputRange: [1, 1, 0.6, 0]
    });
    return {
      transform: [{ translateY }, { rotate }, { scaleX }, { scaleY }],
      opacity,
    } as const;
  }, [reelsCollapseAnim]);

  const [accountName, setAccountName] = useState('watcher');
  const [userId, setUserId] = useState<string | null>(null);
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isKidsProfile, setIsKidsProfile] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'All' | 'TopRated' | 'New' | 'ForYou'>('All');
  const [activeGenreId, setActiveGenreId] = useState<number | null>(null);
  const [favoriteGenre, setFavoriteGenre] = useState<FavoriteGenre | null>(null);
  const [favoriteGenreMovies, setFavoriteGenreMovies] = useState<Media[]>([]);
  const [favoriteGenreLoading, setFavoriteGenreLoading] = useState(false);
  const [fabExpanded, setFabExpanded] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const previewTranslate = useRef(new Animated.Value(320)).current;
  const [storyIndex, setStoryIndex] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  // const [isListScrolling, setIsListScrolling] = useState(false); // Removed

  const showKidsBlocked = useCallback((feature: string) => {
    Alert.alert('Kids profile', `${feature} isn\'t available on Kids profiles. Switch profiles to use it.`);
  }, []);

  // Shared My List state (avoid AsyncStorage reads in every MovieList section)
  const [myListIds, setMyListIds] = useState<number[]>([]);
  const myListItemsRef = useRef<Media[]>([]);

  // Scroll interaction guard (prevents background timers from causing jank mid-scroll)
  const isListScrollingRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailerCarouselRef = useRef<MovieTrailerCarouselHandle>(null);

  const markListScrolling = useCallback(() => {
    trailerCarouselRef.current?.setPaused(true);
    if (!isListScrollingRef.current) {
      isListScrollingRef.current = true;
      // setIsListScrolling(true); // Removed to prevent re-render
    }
    if (scrollEndTimerRef.current) {
      clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = null;
    }
  }, []);

  const markListScrollEnd = useCallback(() => {
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(() => {
      isListScrollingRef.current = false;
      // setIsListScrolling(false); // Removed to prevent re-render
      trailerCarouselRef.current?.setPaused(false);
      scrollEndTimerRef.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current) {
        clearTimeout(scrollEndTimerRef.current);
        scrollEndTimerRef.current = null;
      }
    };
  }, []);

  // Use the custom hook for data fetching
  const {
    trending,
    movieReels,
    movieTrailers,
    recommended,
    songs,
    trendingMoviesOnly,
    trendingTvOnly,
    genres,
    featuredMovie,
    setFeaturedMovie,
    stories,
    netflix,
    amazon,
    hbo,
    loading,
    error,
    continueWatching,
    lastWatched,
  } = useMoviesData(activeProfileId, isKidsProfile, profileReady);

  const router = useRouter();

  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });

  const myListKey = useMemo(() => buildProfileScopedKey('myList', activeProfileId), [activeProfileId]);
  useEffect(() => {
    let alive = true;

    if (!profileReady) {
      myListItemsRef.current = [];
      setMyListIds([]);
      return () => {
        alive = false;
      };
    }

    InteractionManager.runAfterInteractions(() => {
      void AsyncStorage.getItem(myListKey)
        .then((stored) => {
          if (!alive) return;
          const parsed: Media[] = stored ? JSON.parse(stored) : [];
          myListItemsRef.current = Array.isArray(parsed) ? parsed : [];
          setMyListIds(myListItemsRef.current.map((m) => m.id));
        })
        .catch((err) => {
          if (!alive) return;
          console.warn('[movies] Failed to load My List', err);
          myListItemsRef.current = [];
          setMyListIds([]);
        });
    });

    return () => {
      alive = false;
    };
  }, [myListKey, profileReady]);

  const toggleMyList = useCallback(
    (item: Media) => {
      if (!item?.id) return;

      const existing = myListItemsRef.current || [];
      const exists = existing.some((m) => m.id === item.id);
      const updated = exists ? existing.filter((m) => m.id !== item.id) : [...existing, item];
      myListItemsRef.current = updated;
      setMyListIds(updated.map((m) => m.id));

      void AsyncStorage.setItem(myListKey, JSON.stringify(updated)).catch((err) => {
        console.warn('[movies] Failed to persist My List', err);
      });
    },
    [myListKey],
  );



  useEffect(() => {
    let unsubAuth: (() => void) | null = null;

    const fetchUserData = async () => {
      try {
        const auth = await authPromise;
        // initial fetch
        const user = auth.currentUser;
        if (user) {
          setUserId(user.uid);
          try {
            const userDoc = await getDoc(doc(firestore, 'users', user.uid));
            if (userDoc.exists()) {
              setAccountName((userDoc.data() as any).name ?? 'watcher');
            }
          } catch (err) {
            console.error('Failed to fetch user data:', err);
          }
        }

        // subscribe to auth changes after auth is ready
        unsubAuth = onAuthStateChanged(auth, async (u) => {
          if (u) {
            setUserId(u.uid);
            try {
              const userDoc = await getDoc(doc(firestore, 'users', u.uid));
              if (userDoc.exists()) {
                setAccountName((userDoc.data() as any).name ?? 'watcher');
              } else {
                setAccountName('watcher');
              }
            } catch (err) {
              console.error('Failed to fetch user data on auth change:', err);
              setAccountName('watcher');
            }
          } else {
            setUserId(null);
            setAccountName('watcher');
          }
        });
      } catch (err) {
        console.error('Auth initialization failed in HomeScreen:', err);
      }
    };

    fetchUserData();

    return () => {
      if (unsubAuth) unsubAuth();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setUnreadMessageCount(0);
        return;
      }

      let alive = true;
      const unsub = onConversationsUpdate(
        (conversations: Conversation[]) => {
          if (!alive) return;
          const uid = userId;
          if (!uid) {
            InteractionManager.runAfterInteractions(() => {
              if (!alive) return;
              setUnreadMessageCount(0);
            });
            return;
          }

          const totalUnread = conversations.reduce((acc, c) => {
            const hasLastMessage = Boolean(c.lastMessage);
            const lastSenderIsNotMe = Boolean(c.lastMessageSenderId) && c.lastMessageSenderId !== uid;

            const lastRead = (c as any)?.lastReadAtBy?.[uid];
            const lastReadMs =
              lastRead && typeof lastRead?.toMillis === 'function' ? lastRead.toMillis() : null;

            const updatedAt = (c as any)?.updatedAt;
            const updatedAtMs =
              updatedAt && typeof updatedAt?.toMillis === 'function'
                ? updatedAt.toMillis()
                : typeof updatedAt === 'number'
                  ? updatedAt
                  : null;

            const readCoversLatest =
              lastReadMs && updatedAtMs ? lastReadMs >= updatedAtMs - 500 /* small clock skew */ : false;

            const unread = hasLastMessage && lastSenderIsNotMe && (lastReadMs ? !readCoversLatest : true);
            return acc + (unread ? 1 : 0);
          }, 0);

          InteractionManager.runAfterInteractions(() => {
            if (!alive) return;
            setUnreadMessageCount(totalUnread);
          });
        },
        { uid: userId },
      );

      return () => {
        alive = false;
        unsub?.();
      };
    }, [userId]),
  );
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const syncActiveProfile = async () => {
        try {
          const stored = await AsyncStorage.getItem('activeProfile');
          if (!isActive) return;
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.name) {
              setActiveProfileName(parsed.name);
              setActiveProfileId(typeof parsed.id === 'string' ? parsed.id : null);
              setIsKidsProfile(Boolean(parsed.isKids));
              setProfileReady(true);
              return;
            }
          }
          setActiveProfileName(null);
          setActiveProfileId(null);
          setIsKidsProfile(false);
          setProfileReady(true);
        } catch (err) {
          console.error('Failed to load active profile', err);
          if (isActive) {
            setActiveProfileName(null);
            setActiveProfileId(null);
            setIsKidsProfile(false);
            setProfileReady(true);
          }
        }
      };

      void syncActiveProfile();

      return () => {
        isActive = false;
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      let alive = true;

      void activeProfileId;

      InteractionManager.runAfterInteractions(() => {
        void (async () => {
          const stored = await getFavoriteGenre();
          if (!alive) return;
          setFavoriteGenre(stored);
        })();
      });

      return () => {
        alive = false;
      };
    }, [activeProfileId]),
  );

  useEffect(() => {
    let cancelled = false;

    if (!profileReady || !favoriteGenre?.id) {
      setFavoriteGenreMovies([]);
      setFavoriteGenreLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const run = async () => {
      setFavoriteGenreLoading(true);
      try {
        const withGenres = isKidsProfile
          ? favoriteGenre.id === 10751
            ? '10751'
            : `10751,${favoriteGenre.id}`
          : String(favoriteGenre.id);

        const url = `${API_BASE_URL}/discover/movie?api_key=${API_KEY}&with_genres=${withGenres}&sort_by=popularity.desc&include_adult=false`;
        const res = await fetch(url);
        const json = await res.json();
        const results = (json?.results || []) as Media[];
        if (!cancelled) setFavoriteGenreMovies(results);
      } catch {
        if (!cancelled) setFavoriteGenreMovies([]);
      } finally {
        if (!cancelled) setFavoriteGenreLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [favoriteGenre?.id, isKidsProfile, profileReady]);



  const handleOpenDetails = useCallback(
    (item: Media) => {
      deferNav(() => {
        const mediaType = (item.media_type || 'movie') as string;
        router.push(`/details/${item.id}?mediaType=${mediaType}`);
      });
    },
    [deferNav, router]
  );

  const handleResumePlayback = useCallback(
    (item: Media) => {
      const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
      const resumeMillis = item.watchProgress?.positionMillis;
      const releaseDate = (item.release_date || item.first_air_date || '') as string;

      const params = {
        title: item.title || item.name || 'Now Playing',
        mediaType,
        tmdbId: String(item.id),
        imdbId: item.imdb_id ?? undefined,
        posterPath: item.poster_path ?? undefined,
        backdropPath: item.backdrop_path ?? undefined,
        overview: item.overview ?? undefined,
        releaseDate: releaseDate || undefined,
        genreIds: Array.isArray(item.genre_ids) ? item.genre_ids.join(',') : undefined,
        voteAverage: typeof item.vote_average === 'number' ? item.vote_average.toString() : undefined,
        seasonNumber: mediaType === 'tv' && typeof item.seasonNumber === 'number' ? String(item.seasonNumber) : undefined,
        episodeNumber: mediaType === 'tv' && typeof item.episodeNumber === 'number' ? String(item.episodeNumber) : undefined,
        seasonTitle: mediaType === 'tv' ? item.seasonTitle ?? undefined : undefined,
        resumeMillis:
          typeof resumeMillis === 'number' && Number.isFinite(resumeMillis) && resumeMillis > 0
            ? String(Math.floor(resumeMillis))
            : undefined,
      };

      deferNav(() => {
        pushWithOptionalInterstitial(
          router as any,
          currentPlan,
          { pathname: '/video-player', params },
          { placement: 'movies_resume', seconds: 30 },
        );
      });
    },
    [deferNav, router, currentPlan],
  );
  const {
    filteredTrending,
    filteredRecommended,
    filteredNetflix,
    filteredAmazon,
    filteredHbo,
    filteredTrendingMoviesOnly,
    filteredTrendingTvOnly,
    filteredSongs,
    filteredMovieReels,
    actionPicks,
    comedyPicks,
    horrorPicks,
    romancePicks,
    sciFiPicks,
    becauseYouWatched,
  } = useFilteredCollections({
    activeFilter,
    activeGenreId,
    recommended,
    trending,
    netflix,
    amazon,
    hbo,
    trendingMoviesOnly,
    trendingTvOnly,
    songs,
    movieReels,
    lastWatched,
    userId,
  });

  const cinematicPulse = useMemo(() => {
    const stats = [
      { label: 'Trending now', value: trending.length },
      { label: 'Continue queue', value: continueWatching?.length ?? 0 },
      { label: 'Fresh trailers', value: movieTrailers?.length ?? 0 },
    ];

    const peak = Math.max(...stats.map((s) => s.value), 1);

    return stats.map((stat, index) => ({
      ...stat,
      progress: peak ? Math.min(1, stat.value / peak) : 0,
      palette: PULSE_PALETTES[index % PULSE_PALETTES.length],
    }));
  }, [continueWatching, movieTrailers, trending.length]);

  // rotate featured movie every 20s
  useEffect(() => {
    if (trending.length <= 1) return;

    const interval = setInterval(() => {
      if (isListScrollingRef.current) return;
      setFeaturedMovie((currentFeatured) => {
        if (!currentFeatured) return trending[0] || null;
        const currentIndex = trending.findIndex((m) => m.id === currentFeatured.id);
        const nextIndex = (currentIndex + 1) % trending.length;
        return trending[nextIndex] || trending[0] || null;
      });
    }, 20000);

    return () => clearInterval(interval);
  }, [setFeaturedMovie, trending]);

  // NOTE: removed automatic featured-movie toasts to avoid frequent notifications.
  // Use `pushToast` to display important notifications from anywhere in this screen.

  // rotate stories in blocks of 4 every 8s
  useEffect(() => {
    if (stories.length <= 4) return;

    const interval = setInterval(() => {
      if (isListScrollingRef.current) return;
      setStoryIndex((prevIndex) => {
        const nextIndex = prevIndex + 4;
        return nextIndex >= stories.length ? 0 : nextIndex;
      });
    }, 8000);

    return () => clearInterval(interval);
  }, [stories]);

  const getGenreNames = useCallback(
    (genreIds: number[] = []) => {
      if (!genres.length || !genreIds?.length) return '';
      return genreIds
        .map((id) => genres.find((g) => g.id === id)?.name)
        .filter(Boolean)
        .join(', ');
    },
    [genres],
  );

  const handleShuffle = useCallback(() => {
    deferNav(() => {
      const allContent = [...trending, ...movieReels, ...recommended, ...netflix, ...amazon, ...hbo];
      if (allContent.length > 0) {
        const randomItem = allContent[Math.floor(Math.random() * allContent.length)];
        router.push(`/details/${randomItem.id}?mediaType=${randomItem.media_type || 'movie'}`);
      }
    });
  }, [amazon, deferNav, hbo, movieReels, netflix, recommended, router, trending]);

  const displayedStories = stories.slice(storyIndex, storyIndex + 4);
  const showStoriesSection = !isKidsProfile && stories.length > 0;
  const isEmptyState = stories.length === 0 && recommended.length === 0 && trending.length === 0;
  const trendingCount = trending.length;
  const reelsCount = movieReels.length;
  const { setAccentColor } = useAccent();
  const featuredAccent = useMemo(
    () => getAccentFromPosterPath(featuredMovie?.poster_path),
    [featuredMovie?.poster_path]
  );
  const fxEnabled = true;

  // Animation values for cinematic entrance
  const headerFadeAnim = React.useRef(new Animated.Value(0)).current;
  const metaRowAnim = React.useRef(new Animated.Value(0)).current;
  const fabScaleAnim = React.useRef(new Animated.Value(0)).current;
  const genreSectionAnim = React.useRef(new Animated.Value(0)).current;
  const storiesAnim = React.useRef(new Animated.Value(0)).current;
  const filtersAnim = React.useRef(new Animated.Value(0)).current;
  const sectionsAnim = React.useRef(new Animated.Value(0)).current;
  const flixyAnim = React.useRef(new Animated.Value(0)).current;

  // FAB animations (simplified)
  const fabScaleAnim2 = useRef(new Animated.Value(1)).current;
  const fabRotateAnim = useRef(new Animated.Value(0)).current;

  // Start entrance animations when data loads
  React.useEffect(() => {
    if (profileReady && !loading) {
      // Batch all entrance animations together for better performance
      const startAnims = () => {
        Animated.stagger(100, [
          Animated.timing(headerFadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(metaRowAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.spring(fabScaleAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
          Animated.timing(genreSectionAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(storiesAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(filtersAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(sectionsAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(flixyAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]).start();
      };

      InteractionManager.runAfterInteractions(startAnims);

      // Safety fallback to ensure animations run even if interactions are heavy
      const timer = setTimeout(startAnims, 1200);
      return () => clearTimeout(timer);
    }
  }, [profileReady, loading, headerFadeAnim, metaRowAnim, fabScaleAnim, genreSectionAnim, storiesAnim, filtersAnim, sectionsAnim, flixyAnim]);

  // FAB press handler - simple and fast
  const handleFabPress = useCallback(() => {
    setFabExpanded((prev) => !prev);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(fabScaleAnim2, { toValue: 0.92, duration: 60, useNativeDriver: true }),
        Animated.spring(fabScaleAnim2, { toValue: 1, tension: 400, friction: 12, useNativeDriver: true }),
      ]),
      Animated.spring(fabRotateAnim, { toValue: fabExpanded ? 0 : 1, tension: 300, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [fabExpanded, fabScaleAnim2, fabRotateAnim]);

  useEffect(() => {
    if (featuredAccent) {
      setAccentColor(featuredAccent);
    }
  }, [featuredAccent, setAccentColor]);

  const openQuickPreview = useCallback(
    (movie: Media) => {
      if (!movie) return;
      setFeaturedMovie(movie);
      setPreviewVisible(true);
      previewTranslate.setValue(320);
      Animated.timing(previewTranslate, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [previewTranslate, setFeaturedMovie],
  );

  const closeQuickPreview = useCallback(() => {
    Animated.timing(previewTranslate, {
      toValue: 340,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setPreviewVisible(false));
  }, [previewTranslate]);

  type HomeSection =
    | { key: 'featured' }
    | { key: 'continueWatching' }
    | { key: 'becauseYouWatched' }
    | { key: 'favoriteGenre' }
    | { key: 'songs' }
    | { key: 'trailers' }
    | { key: 'trending' }
    | { key: 'recommended' }
    | { key: 'netflix' }
    | { key: 'amazon' }
    | { key: 'hbo' }
    | { key: 'topMoviesToday' }
    | { key: 'topTvToday' }
    | { key: 'actionPicks' }
    | { key: 'comedyPicks' }
    | { key: 'horrorPicks' }
    | { key: 'romancePicks' }
    | { key: 'sciFiPicks' }
    | { key: 'popularMovies' }
    | { key: 'upcomingTheaters' }
    | { key: 'topRatedMovies' };

  const getSectionItemType = useCallback((section: HomeSection) => {
    switch (section.key) {
      case 'featured':
        return 'featured';
      case 'trailers':
        return 'trailers';
      case 'songs':
        return 'songs';
      default:
        return 'carousel';
    }
  }, []);

  const sections = useMemo<HomeSection[]>(() => {
    if (isEmptyState) return [];
    const out: HomeSection[] = [];
    if (featuredMovie) out.push({ key: 'featured' });
    if (continueWatching.length > 0) out.push({ key: 'continueWatching' });
    if (lastWatched && becauseYouWatched.length > 0) out.push({ key: 'becauseYouWatched' });
    if (favoriteGenre && favoriteGenreMovies.length > 0) out.push({ key: 'favoriteGenre' });
    if (songs.length > 0) out.push({ key: 'songs' });
    if (movieTrailers.length > 0) out.push({ key: 'trailers' });
    if (filteredTrending.length > 0) out.push({ key: 'trending' });
    if (filteredRecommended.length > 0) out.push({ key: 'recommended' });
    if (filteredNetflix.length > 0) out.push({ key: 'netflix' });
    if (filteredAmazon.length > 0) out.push({ key: 'amazon' });
    if (filteredHbo.length > 0) out.push({ key: 'hbo' });
    if (filteredTrendingMoviesOnly.length > 0) out.push({ key: 'topMoviesToday' });
    if (filteredTrendingTvOnly.length > 0) out.push({ key: 'topTvToday' });
    if (actionPicks.length > 0) out.push({ key: 'actionPicks' });
    if (comedyPicks.length > 0) out.push({ key: 'comedyPicks' });
    if (horrorPicks.length > 0) out.push({ key: 'horrorPicks' });
    if (romancePicks.length > 0) out.push({ key: 'romancePicks' });
    if (sciFiPicks.length > 0) out.push({ key: 'sciFiPicks' });
    if (filteredSongs.length > 0) out.push({ key: 'popularMovies' });
    if (filteredMovieReels.length > 0) out.push({ key: 'upcomingTheaters' });
    if (filteredRecommended.length > 0) out.push({ key: 'topRatedMovies' });
    return out;
  }, [
    actionPicks.length,
    comedyPicks.length,
    becauseYouWatched.length,
    continueWatching.length,
    isEmptyState,
    favoriteGenre,
    favoriteGenreMovies.length,
    featuredMovie,
    horrorPicks.length,
    lastWatched,
    movieTrailers.length,
    songs.length,
    filteredTrending.length,
    filteredRecommended.length,
    filteredNetflix.length,
    filteredAmazon.length,
    filteredHbo.length,
    romancePicks.length,
    sciFiPicks.length,
    filteredTrendingMoviesOnly.length,
    filteredTrendingTvOnly.length,
    filteredSongs.length,
    filteredMovieReels.length,
  ]);

  const sectionFadeStyle = useMemo(() => ({
    opacity: sectionsAnim,
    transform: [{
      translateY: sectionsAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [25, 0],
      }),
    }],
  }), [sectionsAnim]);

  const maxViewableSectionIndexRef = useRef(0);
  const lastPrefetchAtRef = useRef(0);

  const sectionMoviesLookup = useMemo(
    () => ({
      continueWatching,
      becauseYouWatched,
      favoriteGenre: favoriteGenreMovies,
      trending: filteredTrending,
      recommended: filteredRecommended,
      netflix: filteredNetflix,
      amazon: filteredAmazon,
      hbo: filteredHbo,
      topMoviesToday: filteredTrendingMoviesOnly,
      topTvToday: filteredTrendingTvOnly,
      actionPicks,
      comedyPicks,
      horrorPicks,
      romancePicks,
      sciFiPicks,
      popularMovies: filteredSongs as Media[],
      upcomingTheaters: filteredMovieReels,
      topRatedMovies: filteredRecommended,
    }),
    [
      actionPicks,
      becauseYouWatched,
      comedyPicks,
      continueWatching,
      favoriteGenreMovies,
      filteredAmazon,
      filteredHbo,
      filteredMovieReels,
      filteredNetflix,
      filteredRecommended,
      filteredSongs,
      filteredTrending,
      filteredTrendingMoviesOnly,
      filteredTrendingTvOnly,
      horrorPicks,
      romancePicks,
      sciFiPicks,
    ],
  );

  const getSectionMoviesForPrefetch = useCallback(
    (key: HomeSection['key']): Media[] => (sectionMoviesLookup as Record<string, Media[]>)[key] ?? [],
    [sectionMoviesLookup],
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 35, minimumViewTime: 80 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const maxIndex = viewableItems.reduce((acc, v) => {
        const idx = typeof v.index === 'number' ? v.index : -1;
        return idx > acc ? idx : acc;
      }, -1);
      if (maxIndex >= 0) maxViewableSectionIndexRef.current = maxIndex;

      // Avoid expensive work while the user is actively scrolling.
      if (isListScrollingRef.current) return;

      const now = Date.now();
      if (now - lastPrefetchAtRef.current < 650) return;
      lastPrefetchAtRef.current = now;

      const upcoming = sections.slice(
        Math.max(0, maxIndex + 1),
        Math.max(0, maxIndex + 1 + PREFETCH_AHEAD_SECTIONS),
      );
      const urls: string[] = [];
      for (const s of upcoming) {
        const items = getSectionMoviesForPrefetch(s.key).slice(0, 8);
        for (const m of items) {
          const path = m?.poster_path || m?.backdrop_path;
          if (!path) continue;
          urls.push(`${IMAGE_BASE_URL}${path}`);
        }
      }

      const unique = Array.from(new Set(urls)).slice(0, PREFETCH_MAX_IMAGES);
      if (unique.length === 0) return;

      InteractionManager.runAfterInteractions(() => {
        void ExpoImage.prefetch(unique);
      });
    },
  ).current;

  const estimatedCarouselSectionHeight = useMemo(
    () => Math.round(responsiveCards.cardHeight + 96),
    [responsiveCards.cardHeight],
  );

  const drawDistance = useMemo(
    () =>
      Platform.OS === 'android'
        ? Math.max(1200, Math.round(screenHeight * 1.4))
        : Math.max(1100, Math.round(screenHeight * 1.5)),
    [screenHeight],
  );

  // Stable callbacks that don't change
  const handleSongsOpenAll = useCallback(() => deferNav(() => router.push('/music')), [deferNav, router]);

  const fabItems = useMemo(
    () => [
      { key: 'shuffle', icon: 'shuffle', onPress: handleShuffle },
      { key: 'mylist', icon: 'list-sharp', onPress: () => deferNav(() => router.push('/my-list')) },
      { key: 'search', icon: 'search', onPress: () => deferNav(() => router.push('/search')) },
      { key: 'watchparty', icon: 'people-outline', onPress: () => deferNav(() => router.push('/watchparty')) },
      { key: 'tvlogin', icon: 'qr-code-outline', onPress: () => deferNav(() => router.push('/tv-login/scan')) },
    ],
    [deferNav, handleShuffle, router],
  );

  const renderSection: ListRenderItem<HomeSection> = useCallback(
    ({ item, index }) => {
      let content: React.ReactElement | null = null;

      switch (item.key) {
        case 'featured':
          content = featuredMovie ? (
            <FeaturedSection
              movie={featuredMovie}
              getGenreNames={getGenreNames}
              onInfoPress={openQuickPreview}
              fadeStyle={sectionFadeStyle}
            />
          ) : null;
          break;

        case 'continueWatching':
          content = (
            <ContinueWatchingSection
              movies={continueWatching}
              onItemPress={handleResumePlayback}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'becauseYouWatched':
          content = lastWatched ? (
            <BecauseYouWatchedSection
              lastWatched={lastWatched}
              movies={becauseYouWatched}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          ) : null;
          break;

        case 'favoriteGenre':
          content = favoriteGenre ? (
            <FavoriteGenreSection
              genreName={favoriteGenre.name}
              loading={favoriteGenreLoading}
              movies={favoriteGenreMovies}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          ) : null;
          break;

        case 'songs':
          content = (
            <SongsSection
              songs={songs}
              onOpenAll={handleSongsOpenAll}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'trailers':
          content = (
            <TrailersSection
              trailers={movieTrailers}
              onTrailerPress={handleOpenDetails}
              carouselRef={trailerCarouselRef}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'trending':
          content = (
            <ProgressiveMovieSection
              title="Trending"
              movies={filteredTrending}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'recommended':
          content = (
            <ProgressiveMovieSection
              title="Recommended"
              movies={filteredRecommended}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'netflix':
          content = (
            <ProgressiveMovieSection
              title="Netflix Originals"
              movies={filteredNetflix}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'amazon':
          content = (
            <ProgressiveMovieSection
              title="Amazon Prime Video"
              movies={filteredAmazon}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'hbo':
          content = (
            <ProgressiveMovieSection
              title="HBO Max"
              movies={filteredHbo}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'topMoviesToday':
          content = (
            <ProgressiveMovieSection
              title="Top Movies Today"
              movies={filteredTrendingMoviesOnly}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'topTvToday':
          content = (
            <ProgressiveMovieSection
              title="Top TV Today"
              movies={filteredTrendingTvOnly}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'actionPicks':
          content = (
            <ProgressiveMovieSection
              title="Action Picks"
              movies={actionPicks}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'comedyPicks':
          content = (
            <ProgressiveMovieSection
              title="Comedy Picks"
              movies={comedyPicks}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'horrorPicks':
          content = (
            <ProgressiveMovieSection
              title="Horror Picks"
              movies={horrorPicks}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'romancePicks':
          content = (
            <ProgressiveMovieSection
              title="Romance Picks"
              movies={romancePicks}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'sciFiPicks':
          content = (
            <ProgressiveMovieSection
              title="Sci-Fi Picks"
              movies={sciFiPicks}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'popularMovies':
          content = (
            <ProgressiveMovieSection
              title="Popular Movies"
              movies={filteredSongs}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'upcomingTheaters':
          content = (
            <ProgressiveMovieSection
              title="Upcoming in Theaters"
              movies={filteredMovieReels}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        case 'topRatedMovies':
          content = (
            <ProgressiveMovieSection
              title="Top Rated Movies"
              movies={filteredRecommended}
              onItemPress={handleOpenDetails}
              myListIds={myListIds}
              onToggleMyList={toggleMyList}
              fadeStyle={sectionFadeStyle}
            />
          );
          break;

        default:
          content = null;
          break;
      }

      return content ? <RowWrapper index={index}>{content}</RowWrapper> : null;
    },
    [
      actionPicks,
      becauseYouWatched,
      comedyPicks,
      continueWatching,
      favoriteGenre,
      favoriteGenreLoading,
      favoriteGenreMovies,
      featuredMovie,
      filteredAmazon,
      filteredHbo,
      filteredMovieReels,
      filteredNetflix,
      filteredRecommended,
      filteredSongs,
      filteredTrending,
      filteredTrendingMoviesOnly,
      filteredTrendingTvOnly,
      getGenreNames,
      handleOpenDetails,
      handleResumePlayback,
      handleSongsOpenAll,
      horrorPicks,
      lastWatched,
      myListIds,
      movieTrailers,
      openQuickPreview,
      romancePicks,
      sciFiPicks,
      sectionFadeStyle,
      songs,
      toggleMyList,
    ],
  );

  if (loading) {
    return (
      <ScreenWrapper>
        <LoadingSkeleton />
      </ScreenWrapper>
    );
  }

  if (error) {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              // Trigger a remount of this screen to re-run fetch hooks.
              // expo-router supports replace with the current route.
              deferNav(() => router.replace('/movies'));
            }}
            activeOpacity={0.88}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={[featuredAccent + '60', '#150a13', '#05060f']}
        locations={[0, 0.35, 1]}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.gradient}
      >
        {/* Static ambient orbs */}
        <View style={styles.bgOrbPrimary} pointerEvents="none">
          <LinearGradient
            colors={['rgba(125,216,255,0.18)', 'rgba(255,255,255,0)']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
        <View style={styles.bgOrbSecondary} pointerEvents="none">
          <LinearGradient
            colors={['rgba(229,9,20,0.12)', 'rgba(255,255,255,0)']}
            start={{ x: 0.8, y: 0 }}
            end={{ x: 0.2, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
        {/* Lightweight floating particles */}
        {fxEnabled ? (
          <FloatingParticles accentColor={featuredAccent} screenWidth={screenWidth} />
        ) : null}

        <View style={styles.container}>
          <FireworksOverlay trigger={fireworksKey} />
          <FreshDropsOverlay trigger={freshDropsKey} />

          <Animated.View style={[styles.contentWrap, screenFxStyle]} pointerEvents={reelsCollapsing ? 'none' : 'auto'}>
            <SnowOverlay enabled={snowing && fxEnabled} />
            <View style={[styles.stickyHeaderWrap, { top: STICKY_HEADER_TOP }]} onLayout={onStickyHeaderLayout}>
              {/* Header (glassy hero) */}
              <Animated.View style={styles.headerWrap}>
                <LinearGradient
                  colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.4)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.headerGlow}
                />
                <View style={[styles.headerBar, isCompactLayout && styles.headerBarCompact]}>
                  <View style={styles.titleRow}>
                    <View style={styles.accentDot} />
                    <View>
                      <Text style={styles.headerEyebrow} numberOfLines={1} ellipsizeMode="tail">{`Tonight's picks`}</Text>
                      <Text
                        style={[styles.headerText, isCompactLayout && styles.headerTextCompact]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        Welcome, {activeProfileName ?? accountName}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.headerIcons, isCompactLayout && styles.headerIconsCompact]}>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() =>
                        deferNav(() => {
                          if (isKidsProfile) {
                            showKidsBlocked('Messaging');
                            return;
                          }
                          router.push('/messaging');
                        })
                      }
                    >
                      <LinearGradient
                        colors={['#e50914', '#b20710']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.iconBg,
                          isCompactLayout && styles.iconBgCompact,
                          isKidsProfile && styles.iconBgDisabled,
                        ]}
                      >
                        <Ionicons name="chatbubble-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                        {unreadMessageCount > 0 ? (
                          <View style={styles.messageBadge}>
                            <Text style={styles.messageBadgeText}>
                              {unreadMessageCount > 99
                                ? '99+'
                                : unreadMessageCount > 9
                                  ? '9+'
                                  : String(unreadMessageCount)}
                            </Text>
                          </View>
                        ) : null}
                      </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() =>
                        deferNav(() => {
                          if (isKidsProfile) {
                            showKidsBlocked('Marketplace');
                            return;
                          }
                          router.push('/marketplace');
                        })
                      }
                    >
                      <LinearGradient
                        colors={['#e50914', '#b20710']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.iconBg,
                          isCompactLayout && styles.iconBgCompact,
                          isKidsProfile && styles.iconBgDisabled,
                        ]}
                      >
                        <Ionicons name="bag-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                      </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() =>
                        deferNav(() => {
                          if (isKidsProfile) {
                            showKidsBlocked('Social Feed');
                            return;
                          }
                          router.push('/social-feed');
                        })
                      }
                    >
                      <LinearGradient
                        colors={['#e50914', '#b20710']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.iconBg,
                          isCompactLayout && styles.iconBgCompact,
                          isKidsProfile && styles.iconBgDisabled,
                        ]}
                      >
                        <Ionicons name="camera-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                      </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => deferNav(() => router.push('/profile'))}
                    >
                      <LinearGradient
                        colors={['#e50914', '#b20710']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.iconBg, isCompactLayout && styles.iconBgCompact]}
                      >
                        <FontAwesome name="user-circle" size={24} color="#ffffff" />
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>

                <Animated.View
                  style={[
                    styles.headerMetaRow,
                    {
                      transform: [
                        {
                          translateY: metaRowAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
                        },
                      ],
                      opacity: metaRowAnim,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.metaPill}
                    activeOpacity={0.9}
                    onPress={() => {
                      bumpPill(trendingPillScale);
                      setFireworksKey(Date.now());
                    }}
                  >
                    <Animated.View style={{ transform: [{ scale: trendingPillScale }] }}>
                      <View style={styles.metaPillRow}>
                        <Ionicons name="flame" size={14} color="#fff" />
                        <Text style={styles.metaText}>{trendingCount} trending</Text>
                      </View>
                    </Animated.View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.metaPill, styles.metaPillSoft]}
                    activeOpacity={0.9}
                    onPress={() => {
                      bumpPill(reelsPillScale);
                      triggerReelsCollapse();
                    }}
                  >
                    <Animated.View style={{ transform: [{ scale: reelsPillScale }] }}>
                      <View style={styles.metaPillRow}>
                        <Ionicons name="film-outline" size={14} color="#fff" />
                        <Text style={styles.metaText}>{reelsCount} reels</Text>
                      </View>
                    </Animated.View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.metaPill, styles.metaPillOutline]}
                    activeOpacity={0.9}
                    onPress={() => {
                      bumpPill(dropsPillScale);
                      setFreshDropsKey(Date.now());
                    }}
                  >
                    <Animated.View style={{ transform: [{ scale: dropsPillScale }] }}>
                      <View style={styles.metaPillRow}>
                        <Ionicons name="star" size={14} color="#fff" />
                        <Text style={styles.metaText}>Fresh drops</Text>
                      </View>
                    </Animated.View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.metaPill, styles.metaPillOutline]}
                    onPress={() => setShowPulseCards((v) => !v)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                  >
                    <Ionicons name={showPulseCards ? 'eye-off-outline' : 'eye-outline'} size={14} color="#fff" />
                    <Text style={styles.metaText}>{showPulseCards ? 'Hide stats' : 'Show stats'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.metaPill, styles.metaPillOutline]}
                    onPress={() => setSnowing((v) => !v)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={snowing ? 'Disable snow' : 'Enable snow'}
                  >
                    <Ionicons name="snow" size={14} color="#fff" style={{ opacity: snowing ? 1 : 0.7 }} />
                    <Text style={styles.metaText}>Snow</Text>
                  </TouchableOpacity>
                </Animated.View>
              </Animated.View>
            </View>

            <FlashList
              data={sections}
              renderItem={renderSection}
              keyExtractor={(it: HomeSection) => it.key}
              getItemType={getSectionItemType}
              estimatedItemSize={250}
              estimatedListSize={{ width: screenWidth, height: screenHeight }}
              drawDistance={screenHeight * 2}
              removeClippedSubviews={true}
              decelerationRate={Platform.OS === 'ios' ? 'normal' : 0.985}
              onScrollBeginDrag={markListScrolling}
              onMomentumScrollBegin={markListScrolling}
              onScrollEndDrag={markListScrollEnd}
              onMomentumScrollEnd={markListScrollEnd}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              overScrollMode="never"
              bounces={Platform.OS === 'ios'}
              contentContainerStyle={styles.scrollViewContent}
              ListHeaderComponent={
                <>
                  <View style={{ height: stickyHeaderSpacerHeight }} />

                  {showPulseCards ? (
                    <View style={styles.pulseRow}>
                      {cinematicPulse.map((stat) => (
                        <LinearGradient
                          key={stat.label}
                          colors={stat.palette}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.pulseCard}
                        >
                          <Text style={styles.pulseValue}>{stat.value}</Text>
                          <Text style={styles.pulseLabel}>{stat.label}</Text>
                          <View style={styles.pulseMeter}>
                            <View
                              style={[styles.pulseMeterFill, { width: `${Math.max(stat.progress * 100, 8)}%` }]}
                            />
                          </View>
                        </LinearGradient>
                      ))}
                    </View>
                  ) : null}

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
                              Unlock unlimited profiles, premium features & more
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.upgradeBannerButton}
                            onPress={() => deferNav(() => router.push('/premium?source=movies'))}
                          >
                            <Text style={styles.upgradeBannerButtonText}>Upgrade</Text>
                          </TouchableOpacity>
                        </View>
                      </LinearGradient>
                    </View>
                  )}

                  <View style={{ marginHorizontal: 12, marginBottom: 12 }}>
                    <AdBanner placement="feed" />
                  </View>

                  {/* Browse by genre above stories */}
                  {genres.length > 0 && (
                    <Animated.View
                      style={[
                        styles.genreSection,
                        {
                          transform: [
                            {
                              translateY: genreSectionAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [30, 0],
                              }),
                            },
                          ],
                          opacity: genreSectionAnim,
                        },
                      ]}
                    >
                      <Text style={styles.genreLabel}>Browse by genre</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreRow}>
                        <TouchableOpacity
                          style={[styles.genreChip, activeGenreId == null && styles.genreChipActive]}
                          onPress={() => setActiveGenreId(null)}
                        >
                          <Text
                            style={[styles.genreChipText, activeGenreId == null && styles.genreChipTextActive]}
                          >
                            All genres
                          </Text>
                        </TouchableOpacity>
                        {genres.map((g) => (
                          <TouchableOpacity
                            key={g.id}
                            style={[styles.genreChip, activeGenreId === g.id && styles.genreChipActive]}
                            onPress={() => setActiveGenreId((current) => (current === g.id ? null : g.id))}
                          >
                            <Text style={[styles.genreChipText, activeGenreId === g.id && styles.genreChipTextActive]}>
                              {g.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </Animated.View>
                  )}

                  {showStoriesSection && (
                    <Animated.View style={[styles.sectionBlock, styles.storiesSection, { opacity: storiesAnim }]}>
                      <StoryCarousel stories={displayedStories} />
                    </Animated.View>
                  )}

                  {/* Main filter chips below stories */}
                  <Animated.View
                    style={{
                      transform: [
                        {
                          translateY: filtersAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
                        },
                      ],
                      opacity: filtersAnim,
                    }}
                  >
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.filterRow}
                    >
                      {FILTER_KEYS.map((key) => {
                        const isActive = activeFilter === (key as any);
                        return (
                          <TouchableOpacity
                            key={key}
                            style={[styles.filterChip, isActive && styles.filterChipActive]}
                            onPress={() => setActiveFilter(key as any)}
                          >
                            <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                              {FILTER_LABELS[key]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </Animated.View>

                  {isEmptyState ? (
                    <View style={styles.centered}>
                      <Text style={styles.emptyText}>No movies or shows available right now.</Text>
                    </View>
                  ) : null}
                </>
              }
            />

            {/* Flixy Assistant removed from header - duplicate */}

            {/* Sub FABs with animated entrance */}
            {fabExpanded && (() => {
              const SUB_FAB_SIZE = 56;
              const SUB_FAB_GAP = 10;
              const firstOffset = SUB_FAB_SIZE + SUB_FAB_GAP + 8;
              const spacing = SUB_FAB_SIZE + SUB_FAB_GAP;

              return (
                <>
                  {fabItems.map((it, idx) => {
                    const bottom = fabBottomOffset + firstOffset + idx * spacing;
                    return (
                      <Animated.View
                        key={it.key}
                        style={[
                          styles.subFab,
                          {
                            bottom,
                            opacity: 1,
                            transform: [{ scale: 1 }],
                          },
                        ]}
                      >
                        <TouchableOpacity
                          onPress={() => {
                            setFabExpanded(false);
                            setTimeout(() => it.onPress(), 50);
                          }}
                          activeOpacity={0.8}
                          style={styles.subFabTouchable}
                        >
                          <LinearGradient
                            colors={['#ff8a00', '#e50914']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.subFabGradient}
                          >
                            <Ionicons name={it.icon as any} size={18} color="#FFFFFF" />
                          </LinearGradient>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}
                </>
              );
            })()}

            {/* Clean FAB */}
            <Animated.View
              style={[
                styles.fabContainer,
                {
                  bottom: fabBottomOffset,
                  transform: [
                    { scale: fabScaleAnim2 },
                    { rotate: fabRotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] }) },
                  ],
                },
              ]}
            >
              <TouchableOpacity
                style={styles.fab}
                onPress={handleFabPress}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#0891b2', '#06b6d4', '#22d3ee']}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.fabGradient}
                />
                <View style={styles.fabIconWrap}>
                  <Ionicons name="add" size={28} color="#fff" />
                </View>
                <View style={styles.fabShine} />
              </TouchableOpacity>
            </Animated.View>

            {previewVisible && featuredMovie && (
              <Animated.View
                style={[styles.previewSheet, { transform: [{ translateY: previewTranslate }] }]}
              >
                <View
                  style={[
                    styles.previewCard,
                    {
                      borderColor: featuredAccent,
                    },
                  ]}
                >
                  <View style={styles.previewRow}>
                    <ExpoImage
                      source={{ uri: `${IMAGE_BASE_URL}${featuredMovie.poster_path}` }}
                      style={styles.previewPoster}
                    />
                    <View style={styles.previewTitleBlock}>
                      <Text numberOfLines={2} style={styles.previewTitle}>
                        {featuredMovie.title || featuredMovie.name}
                      </Text>
                      <Text style={styles.previewMeta}>
                        {((featuredMovie.vote_average || 0) * 10).toFixed(0)}% match •{' '}
                        {(featuredMovie.release_date || featuredMovie.first_air_date || '').slice(0, 4)}
                      </Text>
                      <Text numberOfLines={1} style={styles.previewMeta}>
                        {getGenreNames(featuredMovie.genre_ids || [])}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.previewCloseIcon} onPress={closeQuickPreview}>
                      <Ionicons name="close" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  {featuredMovie.overview ? (
                    <Text numberOfLines={3} style={styles.previewOverview}>
                      {featuredMovie.overview}
                    </Text>
                  ) : null}

                  <View style={styles.previewActions}>
                    <TouchableOpacity
                      style={styles.previewPrimaryBtn}
                      onPress={() => handleOpenDetails(featuredMovie)}
                    >
                      <Ionicons name="play" size={16} color="#000" />
                      <Text style={styles.previewPrimaryText}>Play</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.previewSecondaryBtn}
                      onPress={() => handleOpenDetails(featuredMovie)}
                    >
                      <Ionicons name="information-circle-outline" size={16} color="#fff" />
                      <Text style={styles.previewSecondaryText}>Full details</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            )}
          </Animated.View>

          {/* TV static/glitch line effect */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tvStaticLine,
              {
                opacity: reelsCollapseAnim.interpolate({
                  inputRange: [0, 0.4, 0.6, 0.85, 1],
                  outputRange: [0, 0, 1, 1, 0]
                }),
                transform: [
                  {
                    scaleX: reelsCollapseAnim.interpolate({
                      inputRange: [0, 0.5, 0.7, 1],
                      outputRange: [0.3, 1.2, 0.8, 0]
                    }),
                  },
                ],
              },
            ]}
          />
          {/* REELS stamp while collapsing */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.reelsStampWrap,
              {
                opacity: reelsCollapseAnim.interpolate({
                  inputRange: [0, 0.2, 0.5, 0.85, 1],
                  outputRange: [0, 1, 1, 0.8, 0]
                }),
                transform: [
                  {
                    translateY: reelsCollapseAnim.interpolate({
                      inputRange: [0, 0.3, 0.7, 1],
                      outputRange: [30, 0, -5, -15]
                    }),
                  },
                  {
                    scale: reelsCollapseAnim.interpolate({
                      inputRange: [0, 0.2, 0.5, 0.8, 1],
                      outputRange: [0.5, 1.1, 1.05, 1.15, 0.9]
                    }),
                  },
                  {
                    rotate: reelsCollapseAnim.interpolate({
                      inputRange: [0, 0.3, 0.6, 1],
                      outputRange: ['-5deg', '0deg', '2deg', '0deg'],
                    }),
                  },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(95,132,255,0.95)', 'rgba(255,55,95,0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.reelsStamp}
            >
              <Ionicons name="film" size={18} color="#fff" />
              <Text style={styles.reelsStampText}>REELS</Text>
            </LinearGradient>
          </Animated.View>
          {/* Glow flash at collapse point */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.collapseGlow,
              {
                opacity: reelsCollapseAnim.interpolate({
                  inputRange: [0, 0.6, 0.75, 0.9, 1],
                  outputRange: [0, 0, 0.9, 0.4, 0]
                }),
                transform: [
                  {
                    scale: reelsCollapseAnim.interpolate({
                      inputRange: [0, 0.7, 0.85, 1],
                      outputRange: [0.5, 1.5, 2, 0]
                    }),
                  },
                ],
              },
            ]}
          />
          {walkthroughChecked && showWalkthrough && (
            <FlixyWalkthrough onComplete={() => setShowWalkthrough(false)} />
          )}

          <FlixyAssistant
            screen="movies"
            bottomOffset={fabBottomOffset}
          />
        </View>
      </LinearGradient>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    top: -60,
    left: -80,
    overflow: 'hidden',
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 350,
    height: 350,
    borderRadius: 175,
    bottom: 100,
    right: -60,
    overflow: 'hidden',
  },

  container: {
    flex: 1,
    paddingBottom: 0,
  },
  contentWrap: {
    flex: 1,
  },
  // Header glass hero
  headerWrap: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  headerBar: {
    paddingVertical: 12,
    paddingHorizontal: 12,
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
  headerText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerTextCompact: {
    fontSize: 18,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerIconsCompact: {
    flexWrap: 'wrap',
    rowGap: 8,
    justifyContent: 'flex-start',
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
    position: 'relative',
  },
  iconBgCompact: {
    padding: 8,
  },
  iconBgDisabled: {
    opacity: 0.45,
  },
  messageBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(10,12,24,0.9)',
  },
  messageBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
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
  metaPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reelsStampWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 64,
    zIndex: 9999,
    alignItems: 'center',
  },
  reelsStamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  reelsStampText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  tvStaticLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.95)',
    zIndex: 9998,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
  },
  collapseGlow: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 120,
    height: 120,
    marginLeft: -60,
    marginTop: -60,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.8)',
    zIndex: 9997,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 40,
  },
  pulseRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 18,
    flexWrap: 'wrap',
    rowGap: 12,
  },
  pulseCard: {
    flex: 1,
    minWidth: 150,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  pulseValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  pulseLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  pulseMeter: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: 8,
    overflow: 'hidden',
  },
  pulseMeterFill: {
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.25)',
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

  stickyHeaderWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 50,
  },

  scrollViewContent: {
    paddingBottom: 200,
    paddingHorizontal: 12,
    paddingTop: 16,
  },

  storiesSection: {
    marginVertical: 8,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
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
  genreSection: {
    marginTop: 4,
    marginBottom: 12,
  },
  genreLabel: {
    paddingHorizontal: 16,
    marginBottom: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  genreRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    marginRight: 8,
  },
  genreChipActive: {
    backgroundColor: 'rgba(229,9,20,0.9)',
    borderColor: '#e50914',
  },
  genreChipText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  genreChipTextActive: {
    color: '#fff',
  },

  sectionBlock: {
    marginBottom: 20,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  sectionTitle: {
    color: '#f5f5f5',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  previewSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 130,
    paddingHorizontal: 12,
    paddingBottom: 0,
  },
  previewCard: {
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: 'rgba(5,6,15,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  previewPoster: {
    width: 60,
    height: 90,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    marginRight: 12,
  },
  previewTitleBlock: {
    flex: 1,
  },
  previewTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  previewMeta: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  previewOverview: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    marginBottom: 10,
  },
  previewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  previewPrimaryText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 8,
  },
  previewSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  previewSecondaryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
    marginLeft: 6,
  },
  previewCloseIcon: {
    padding: 6,
  },

  fabContainer: {
    position: 'absolute',
    right: 16,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  fabGradient: {
    ...StyleSheet.absoluteFillObject,
  },

  fabIconWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  fabShine: {
    position: 'absolute',
    top: 6,
    left: 10,
    right: 10,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  subFab: {
    position: 'absolute',
    right: 22,
    width: 48,
    height: 48,
    borderRadius: 16,
    elevation: 8,
    shadowColor: '#e50914',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  subFabTouchable: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  subFabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  retryButton: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(229,9,20,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  errorText: {
    color: '#7dd8ff',
    fontSize: 16,
    fontWeight: '600',
  },

  emptyText: {
    color: '#E6E6E6',
    fontSize: 16,
  },

  // Skeleton / glass card styles
  skeletonContainer: {
    padding: 14,
    gap: 12,
  },
  skeletonBlock: {
    borderRadius: 14,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginBottom: 12,
  },
  skeletonHeader: {
    height: 64,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  skeletonAccentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(229,9,20,0.65)',
  },
  skeletonLine: {
    height: 12,
    width: '60%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    marginBottom: 8,
  },
  skeletonLineLarge: {
    height: 14,
    width: '80%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    marginBottom: 8,
  },
  skeletonLineShort: {
    height: 12,
    width: '40%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
  },
  skeletonIconRow: {
    width: 110,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
  },
  skeletonRow: {
    height: 86,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
  },
  skeletonMetaPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  skeletonPill: {
    height: 26,
    width: 80,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  skeletonStory: {
    height: 110,
    justifyContent: 'center',
  },
  skeletonStoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  skeletonStoryAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  skeletonFilters: {
    paddingVertical: 10,
  },
  skeletonChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  skeletonChip: {
    height: 28,
    width: 70,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  skeletonFeatured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  skeletonFeaturedPoster: {
    width: 110,
    height: 150,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  skeletonFeaturedMeta: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  skeletonPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  skeletonList: {
    paddingVertical: 10,
  },
  skeletonCarouselRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  skeletonPosterSmall: {
    width: 90,
    height: 130,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  skeletonListRow: {
    paddingVertical: 10,
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
    flexWrap: 'wrap',
    rowGap: 10,
  },
  upgradeBannerText: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
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
  trailerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  trailerItem: {
    width: 280,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  trailerVideoContainer: {
    width: '100%',
    height: 160,
    position: 'relative',
  },
  trailerVideo: {
    width: '100%',
    height: '100%',
  },
  trailerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  bannerWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: Platform.OS === 'ios' ? 60 : 28,
    zIndex: 40,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  bannerInner: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerText: {
    color: '#fff',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    marginRight: 8,
  },
  bannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  bannerButtonText: {
    color: '#e50914',
    fontWeight: '700',
    fontSize: 13,
  },
  bannerClose: {
    padding: 6,
  },
  trailerPlayIcon: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -24 }, { translateY: -24 }],
    opacity: 0.8,
  },
  trailerInfo: {
    padding: 12,
  },
  trailerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  trailerMeta: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
});

export default HomeScreen;
