import { FontAwesome, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  InteractionManager,
  PixelRatio,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import FeaturedMovie from '../../components/FeaturedMovie';
import MovieList from '../../components/MovieList';
import MovieTrailerCarousel from '../../components/MovieTrailerCarousel';
import ScreenWrapper from '../../components/ScreenWrapper';
import SongList from '../../components/SongList';
import Story from '../../components/Story';
import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../../constants/api';
import { authPromise, firestore } from '../../constants/firebase';
import { getAccentFromPosterPath } from '../../constants/theme';
import AdBanner from '../../components/ads/AdBanner';
import { pushWithOptionalInterstitial } from '../../lib/ads/navigate';
import { getFavoriteGenre, type FavoriteGenre } from '../../lib/favoriteGenreStorage';
import { buildProfileScopedKey } from '../../lib/profileStorage';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { Media } from '../../types/index';
import { useAccent } from '../components/AccentContext';
import { onConversationsUpdate, type Conversation } from '../messaging/controller';
import LoadingSkeleton from './movies/components/LoadingSkeleton';
import { useMoviesData } from './movies/hooks/useMoviesData';

const PULSE_PALETTES: [string, string][] = [
  ['#ff9966', '#ff5e62'],
  ['#70e1f5', '#ffd194'],
  ['#c471f5', '#fa71cd'],
];

const FILTER_KEYS = ['All', 'TopRated', 'New', 'ForYou'] as const;
const FILTER_LABELS: Record<(typeof FILTER_KEYS)[number], string> = {
  All: 'All',
  TopRated: 'Top Rated',
  New: 'New',
  ForYou: 'For You',
};

const HomeScreen: React.FC = () => {
  const { currentPlan } = useSubscription();
  const { width: screenWidth } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();
  const isCompactLayout = screenWidth < 360 || fontScale > 1.2;

  const [showPulseCards, setShowPulseCards] = useState(() => !isCompactLayout);
  useEffect(() => {
    if (isCompactLayout) setShowPulseCards(false);
  }, [isCompactLayout]);

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

  // Shared My List state (avoid AsyncStorage reads in every MovieList section)
  const [myListIds, setMyListIds] = useState<number[]>([]);
  const myListItemsRef = useRef<Media[]>([]);

  // Scroll interaction guard (prevents background timers from causing jank mid-scroll)
  const isListScrollingRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markListScrolling = useCallback(() => {
    isListScrollingRef.current = true;
    if (scrollEndTimerRef.current) {
      clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = null;
    }
  }, []);

  const markListScrollEnd = useCallback(() => {
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(() => {
      isListScrollingRef.current = false;
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

  const navInFlightRef = useRef(false);
  const deferNav = useCallback((action: () => void) => {
    if (navInFlightRef.current) return;
    navInFlightRef.current = true;
    requestAnimationFrame(() => {
      InteractionManager.runAfterInteractions(() => {
        try {
          action();
        } finally {
          navInFlightRef.current = false;
        }
      });
    });
  }, []);

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
          setUnreadMessageCount(0);
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

        setUnreadMessageCount(totalUnread);
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
      const mediaType = (item.media_type || 'movie') as string;
      router.push(`/details/${item.id}?mediaType=${mediaType}`);
    },
    [router]
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

      pushWithOptionalInterstitial(
        router as any,
        currentPlan,
        { pathname: '/video-player', params },
        { placement: 'movies_resume', seconds: 30 },
      );
    },
    [router, currentPlan],
  );

  const applyFilter = useCallback(
    (items: Media[]): Media[] => {
      if (!items || items.length === 0) return [];
      // 1) Genre filter first (if any)
      let base = items;
      if (activeGenreId != null) {
        base = base.filter((m) => {
          const ids = (m.genre_ids || []) as number[];
          return ids.includes(activeGenreId);
        });
      }

      // 2) Sort / transform based on activeFilter
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
          return recommended && recommended.length > 0 ? recommended : base;
        default:
          return base;
      }
    },
    [activeFilter, activeGenreId, recommended]
  );

  const filteredTrending = useMemo(() => applyFilter(trending), [applyFilter, trending]);
  const filteredRecommended = useMemo(() => applyFilter(recommended), [applyFilter, recommended]);
  const filteredNetflix = useMemo(() => applyFilter(netflix), [applyFilter, netflix]);
  const filteredAmazon = useMemo(() => applyFilter(amazon), [applyFilter, amazon]);
  const filteredHbo = useMemo(() => applyFilter(hbo), [applyFilter, hbo]);
  const filteredTrendingMoviesOnly = useMemo(
    () => applyFilter(trendingMoviesOnly),
    [applyFilter, trendingMoviesOnly],
  );
  const filteredTrendingTvOnly = useMemo(() => applyFilter(trendingTvOnly), [applyFilter, trendingTvOnly]);
  const filteredSongs = useMemo(() => applyFilter(songs as any), [applyFilter, songs]);
  const filteredMovieReels = useMemo(() => applyFilter(movieReels), [applyFilter, movieReels]);

  const becauseYouWatched = useMemo(() => {
    if (!lastWatched || !recommended || recommended.length === 0) return [];
    const lastGenres = (lastWatched.genre_ids || []) as number[];
    if (!lastGenres.length) return [];
    return recommended.filter((m) => {
      const genres = (m.genre_ids || []) as number[];
      return genres.some((g) => lastGenres.includes(g));
    });
  }, [lastWatched, recommended]);

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

  const handleShuffle = () => {
    deferNav(() => {
      const allContent = [...trending, ...movieReels, ...recommended, ...netflix, ...amazon, ...hbo];
      if (allContent.length > 0) {
        const randomItem = allContent[Math.floor(Math.random() * allContent.length)];
        router.push(`/details/${randomItem.id}?mediaType=${randomItem.media_type || 'movie'}`);
      }
    });
  };

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

  // Animation values for cinematic entrance
  const headerFadeAnim = React.useRef(new Animated.Value(0)).current;
  const metaRowAnim = React.useRef(new Animated.Value(0)).current;
  const fabScaleAnim = React.useRef(new Animated.Value(0)).current;
  const genreSectionAnim = React.useRef(new Animated.Value(0)).current;
  const storiesAnim = React.useRef(new Animated.Value(0)).current;
  const filtersAnim = React.useRef(new Animated.Value(0)).current;
  const sectionsAnim = React.useRef(new Animated.Value(0)).current;

  // Start animations when data loads
  React.useEffect(() => {
    if (profileReady && !loading) {
      // Header content fade in
      Animated.timing(headerFadeAnim, {
        toValue: 1,
        duration: 600,
        delay: 200,
        useNativeDriver: true,
      }).start();

      // Meta row slide up
      Animated.timing(metaRowAnim, {
        toValue: 1,
        duration: 500,
        delay: 400,
        useNativeDriver: true,
      }).start();

      // FAB buttons scale in
      Animated.spring(fabScaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        delay: 600,
        useNativeDriver: true,
      }).start();

      // Genre section slide up
      Animated.timing(genreSectionAnim, {
        toValue: 1,
        duration: 500,
        delay: 700,
        useNativeDriver: true,
      }).start();

      // Stories section fade in
      Animated.timing(storiesAnim, {
        toValue: 1,
        duration: 600,
        delay: 800,
        useNativeDriver: true,
      }).start();

      // Filters slide up
      Animated.timing(filtersAnim, {
        toValue: 1,
        duration: 500,
        delay: 900,
        useNativeDriver: true,
      }).start();

      // Content sections stagger animation
      Animated.timing(sectionsAnim, {
        toValue: 1,
        duration: 800,
        delay: 1000,
        useNativeDriver: true,
      }).start();
    }
  }, [profileReady, loading, headerFadeAnim, metaRowAnim, fabScaleAnim, genreSectionAnim, storiesAnim, filtersAnim, sectionsAnim]);

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
    if (trending.length > 0) out.push({ key: 'trending' });
    if (recommended.length > 0) out.push({ key: 'recommended' });
    if (netflix.length > 0) out.push({ key: 'netflix' });
    if (amazon.length > 0) out.push({ key: 'amazon' });
    if (hbo.length > 0) out.push({ key: 'hbo' });
    if (trendingMoviesOnly.length > 0) out.push({ key: 'topMoviesToday' });
    if (trendingTvOnly.length > 0) out.push({ key: 'topTvToday' });
    if (songs.length > 0) out.push({ key: 'popularMovies' });
    if (movieReels.length > 0) out.push({ key: 'upcomingTheaters' });
    if (recommended.length > 0) out.push({ key: 'topRatedMovies' });
    return out;
  }, [
    becauseYouWatched.length,
    continueWatching.length,
    isEmptyState,
    favoriteGenre,
    favoriteGenreMovies.length,
    featuredMovie,
    lastWatched,
    movieTrailers.length,
    songs.length,
    trending.length,
    recommended.length,
    netflix.length,
    amazon.length,
    hbo.length,
    trendingMoviesOnly.length,
    trendingTvOnly.length,
    movieReels.length,
  ]);

  const sectionFadeStyle = useMemo(() => ({ opacity: sectionsAnim }), [sectionsAnim]);

  const renderSection: ListRenderItem<HomeSection> = useCallback(
    ({ item }) => {
      switch (item.key) {
        case 'featured':
          return featuredMovie ? (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <FeaturedMovie movie={featuredMovie} getGenreNames={getGenreNames} onInfoPress={openQuickPreview} />
              </View>
            </Animated.View>
          ) : null;

        case 'continueWatching':
          return continueWatching.length > 0 ? (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title="Continue Watching"
                  movies={continueWatching}
                  onItemPress={handleResumePlayback}
                  showProgress
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          ) : null;

        case 'becauseYouWatched':
          return lastWatched && becauseYouWatched.length > 0 ? (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title={`Because you watched ${lastWatched.title || lastWatched.name}`}
                  movies={becauseYouWatched}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          ) : null;

        case 'favoriteGenre':
          return favoriteGenre && favoriteGenreMovies.length > 0 ? (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title={favoriteGenreLoading ? `Loading ${favoriteGenre.name} picks…` : `${favoriteGenre.name} Picks`}
                  movies={favoriteGenreMovies}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          ) : null;

        case 'songs':
          return (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <SongList title="Songs of the Moment" songs={songs} onOpenAll={() => router.push('/songs')} />
              </View>
            </Animated.View>
          );

        case 'trailers':
          return movieTrailers.length > 0 ? (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieTrailerCarousel trailers={movieTrailers} onTrailerPress={handleOpenDetails} />
              </View>
            </Animated.View>
          ) : null;

        case 'trending':
          return (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title="Trending"
                  movies={filteredTrending}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          );

        case 'recommended':
          return (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title="Recommended"
                  movies={filteredRecommended}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          );

        case 'netflix':
          return (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title="Netflix Originals"
                  movies={filteredNetflix}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          );

        case 'amazon':
          return (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title="Amazon Prime Video"
                  movies={filteredAmazon}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          );

        case 'hbo':
          return (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title="HBO Max"
                  movies={filteredHbo}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          );

        case 'topMoviesToday':
          return (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title="Top Movies Today"
                  movies={filteredTrendingMoviesOnly}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          );

        case 'topTvToday':
          return (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title="Top TV Today"
                  movies={filteredTrendingTvOnly}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          );

        case 'popularMovies':
          return (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title="Popular Movies"
                  movies={filteredSongs}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          );

        case 'upcomingTheaters':
          return (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title="Upcoming in Theaters"
                  movies={filteredMovieReels}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          );

        case 'topRatedMovies':
          return (
            <Animated.View style={sectionFadeStyle}>
              <View style={styles.sectionBlock}>
                <MovieList
                  title="Top Rated Movies"
                  movies={filteredRecommended}
                  onItemPress={handleOpenDetails}
                  myListIds={myListIds}
                  onToggleMyList={toggleMyList}
                />
              </View>
            </Animated.View>
          );

        default:
          return null;
      }
    },
    [
      becauseYouWatched,
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
      lastWatched,
      myListIds,
      movieTrailers,
      openQuickPreview,
      router,
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
              router.replace('/movies');
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
        colors={[featuredAccent, '#150a13', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.gradient}
      >
        {/* floating liquid glows to mirror social feed vibe */}
        <LinearGradient
          colors={['rgba(125,216,255,0.18)', 'rgba(255,255,255,0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.bgOrbPrimary}
        />
        <LinearGradient
          colors={['rgba(95,132,255,0.14)', 'rgba(255,255,255,0)']}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={styles.bgOrbSecondary}
        />
          <View style={styles.container}>
            <FlashList
              data={sections}
              renderItem={renderSection}
              keyExtractor={(it: HomeSection) => it.key}
              getItemType={getSectionItemType}
              estimatedItemSize={330}
              drawDistance={Platform.OS === 'android' ? 900 : 1100}
              decelerationRate="fast"
              onScrollBeginDrag={markListScrolling}
              onMomentumScrollBegin={markListScrolling}
              onScrollEndDrag={markListScrollEnd}
              onMomentumScrollEnd={markListScrollEnd}
              scrollEventThrottle={16}
              contentContainerStyle={styles.scrollViewContent}
              ListHeaderComponent={
                <>
                  {/* Header (glassy hero) */}
                  <Animated.View style={[styles.headerWrap, { opacity: headerFadeAnim }]}>
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
                        <TouchableOpacity style={styles.iconBtn} onPress={() => deferNav(() => router.push('/messaging'))}>
                          <LinearGradient
                            colors={['#e50914', '#b20710']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.iconBg, isCompactLayout && styles.iconBgCompact]}
                          >
                            <Ionicons name="chatbubble-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                            {unreadMessageCount > 0 ? (
                              <View style={styles.messageBadge}>
                                <Text style={styles.messageBadgeText}>
                                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount > 9 ? '9+' : String(unreadMessageCount)}
                                </Text>
                              </View>
                            ) : null}
                          </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.iconBtn} onPress={() => deferNav(() => router.push('/marketplace'))}>
                          <LinearGradient
                            colors={['#e50914', '#b20710']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.iconBg, isCompactLayout && styles.iconBgCompact]}
                          >
                            <Ionicons name="bag-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                          </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.iconBtn} onPress={() => deferNav(() => router.push('/social-feed'))}>
                          <LinearGradient
                            colors={['#e50914', '#b20710']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.iconBg, isCompactLayout && styles.iconBgCompact]}
                          >
                            <Ionicons name="camera-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                          </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.iconBtn} onPress={() => deferNav(() => router.push('/profile'))}>
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
                      <View style={styles.metaPill}>
                        <Ionicons name="flame" size={14} color="#fff" />
                        <Text style={styles.metaText}>{trendingCount} trending</Text>
                      </View>
                      <View style={[styles.metaPill, styles.metaPillSoft]}>
                        <Ionicons name="film-outline" size={14} color="#fff" />
                        <Text style={styles.metaText}>{reelsCount} reels</Text>
                      </View>
                      <View style={[styles.metaPill, styles.metaPillOutline]}>
                        <Ionicons name="star" size={14} color="#fff" />
                        <Text style={styles.metaText}>Fresh drops</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.metaPill, styles.metaPillOutline]}
                        onPress={() => setShowPulseCards((v) => !v)}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                      >
                        <Ionicons name={showPulseCards ? 'eye-off-outline' : 'eye-outline'} size={14} color="#fff" />
                        <Text style={styles.metaText}>{showPulseCards ? 'Hide stats' : 'Show stats'}</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  </Animated.View>

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
                            onPress={() => router.push('/premium?source=movies')}
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
                      <Story stories={displayedStories} />
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

            {/* Sub FABs */}
            {fabExpanded && (() => {
              const MAIN_FAB_BOTTOM = 120;
              const SUB_FAB_SIZE = 64;
              const SUB_FAB_GAP = 12;
              const firstOffset = SUB_FAB_SIZE + SUB_FAB_GAP;
              const spacing = SUB_FAB_SIZE + SUB_FAB_GAP;
              const items = [
                { key: 'shuffle', icon: 'shuffle', onPress: handleShuffle },
                { key: 'mylist', icon: 'list-sharp', onPress: () => deferNav(() => router.push('/my-list')) },
                { key: 'search', icon: 'search', onPress: () => deferNav(() => router.push('/search')) },
                { key: 'watchparty', icon: 'people-outline', onPress: () => deferNav(() => router.push('/watchparty')) },
                { key: 'tvlogin', icon: 'qr-code-outline', onPress: () => deferNav(() => router.push('/tv-login/scan')) },
              ];

              return (
                <>
                  {items.map((it, idx) => {
                    const bottom = MAIN_FAB_BOTTOM + firstOffset + idx * spacing;
                    return (
                      <TouchableOpacity
                        key={it.key}
                        style={[styles.subFab, { bottom }]}
                        onPress={() => {
                          try {
                            it.onPress();
                          } finally {
                            setFabExpanded(false);
                          }
                        }}
                        activeOpacity={0.9}
                      >
                        <LinearGradient
                          colors={['#ff8a00', '#e50914']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.subFabGradient}
                        >
                          <Ionicons name={it.icon as any} size={20} color="#FFFFFF" />
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  })}
                </>
              );
            })()}

            {/* Main FAB */}
            <Animated.View style={[{ transform: [{ scale: fabScaleAnim }] }]} >
              <TouchableOpacity
                style={[styles.fab, { bottom: 120 }]}
                onPress={() => setFabExpanded(!fabExpanded)}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#ff8a00', '#e50914']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.fabGradient}
                >
                  <Ionicons name="add" size={24} color="#FFFFFF" />
                </LinearGradient>
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
                    <Image
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
    width: 380,
    height: 380,
    borderRadius: 190,
    top: -40,
    left: -60,
    opacity: 0.6,
    transform: [{ rotate: '15deg' }],
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    bottom: -80,
    right: -40,
    opacity: 0.55,
    transform: [{ rotate: '-12deg' }],
  },
  container: {
    flex: 1,
    paddingBottom: 0,
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

  scrollViewContent: {
    paddingBottom: 180,
    paddingHorizontal: 16,
    paddingTop: 12,
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
      marginBottom: 16,
      paddingVertical: 2,
      paddingHorizontal: 2,
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

  fab: {
    position: 'absolute',
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    right: 18,
    bottom: 150,
    // Bold movie-red FAB
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
  fabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subFabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
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
