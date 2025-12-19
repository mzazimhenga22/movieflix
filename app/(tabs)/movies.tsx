import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
  Image,
  Easing,
} from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { LinearGradient } from 'expo-linear-gradient';

import { API_KEY, API_BASE_URL, IMAGE_BASE_URL } from '../../constants/api';
import ScreenWrapper from '../../components/ScreenWrapper';
import Story from '../../components/Story';
import FeaturedMovie from '../../components/FeaturedMovie';
import SongList from '../../components/SongList';
import MovieList from '../../components/MovieList';
import { Media, Genre } from '../../types/index';
import { authPromise, firestore } from '../../constants/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAccentFromPosterPath } from '../../constants/theme';
import { useAccent } from '../components/AccentContext';
import { buildProfileScopedKey } from '../../lib/profileStorage';
import { useSubscription } from '../../providers/SubscriptionProvider';

const shuffleArray = <T,>(array: T[] | undefined): T[] => {
  if (!array) return [];
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const KIDS_GENRE_IDS = [10751, 16, 10762];

const LoadingSkeleton = () => (
  <View style={styles.skeletonContainer}>
    {/* Glassy header hero */}
    <View style={[styles.skeletonBlock, styles.skeletonHeader]}>
      <View style={styles.skeletonHeaderLeft}>
        <View style={styles.skeletonAccentDot} />
        <View>
          <View style={styles.skeletonLineShort} />
          <View style={[styles.skeletonLine, { width: '70%', marginTop: 6 }]} />
        </View>
      </View>
      <View style={styles.skeletonIconRow} />
    </View>

    {/* Meta pills under header */}
    <View style={[styles.skeletonBlock, styles.skeletonMetaPills]}>
      <View style={styles.skeletonPill} />
      <View style={styles.skeletonPill} />
      <View style={[styles.skeletonPill, { width: 80 }]} />
    </View>

    {/* Stories strip */}
    <View style={[styles.skeletonBlock, styles.skeletonStory]}>
      <View style={styles.skeletonStoryRow}>
        <View style={styles.skeletonStoryAvatar} />
        <View style={styles.skeletonStoryAvatar} />
        <View style={styles.skeletonStoryAvatar} />
        <View style={styles.skeletonStoryAvatar} />
      </View>
    </View>

    {/* Filter chips + browse-by-genre row */}
    <View style={[styles.skeletonBlock, styles.skeletonFilters]}>
      <View style={styles.skeletonChipRow}>
        <View style={styles.skeletonChip} />
        <View style={styles.skeletonChip} />
        <View style={styles.skeletonChip} />
        <View style={[styles.skeletonChip, { width: 70 }]} />
      </View>
      <View style={[styles.skeletonLineShort, { marginTop: 10, width: 120 }]} />
    </View>

    {/* Featured movie card */}
    <View style={[styles.skeletonBlock, styles.skeletonFeatured]}>
      <View style={styles.skeletonFeaturedPoster} />
      <View style={styles.skeletonFeaturedMeta}>
        <View style={styles.skeletonLineLarge} />
        <View style={[styles.skeletonLine, { width: '60%', marginTop: 6 }]} />
        <View style={styles.skeletonPillRow}>
          <View style={styles.skeletonPill} />
          <View style={styles.skeletonPill} />
        </View>
      </View>
    </View>

    {/* Song list / horizontal carousels */}
    <View style={[styles.skeletonBlock, styles.skeletonList]}>
      <View style={styles.skeletonLineShort} />
      <View style={styles.skeletonCarouselRow}>
        <View style={styles.skeletonPosterSmall} />
        <View style={styles.skeletonPosterSmall} />
        <View style={styles.skeletonPosterSmall} />
      </View>
    </View>

    {/* Extra movie rows */}
    <View style={[styles.skeletonBlock, styles.skeletonListRow]}>
      <View style={styles.skeletonLineShort} />
      <View style={styles.skeletonRow} />
    </View>
    <View style={[styles.skeletonBlock, styles.skeletonListRow]}>
      <View style={styles.skeletonLineShort} />
      <View style={styles.skeletonRow} />
    </View>
  </View>
);

const HomeScreen: React.FC = () => {
  const { currentPlan } = useSubscription();
  const [trending, setTrending] = useState<Media[]>([]);
  const [movieReels, setMovieReels] = useState<Media[]>([]);
  const [recommended, setRecommended] = useState<Media[]>([]);
  const [songs, setSongs] = useState<Media[]>([]);
  const [trendingMoviesOnly, setTrendingMoviesOnly] = useState<Media[]>([]);
  const [trendingTvOnly, setTrendingTvOnly] = useState<Media[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [featuredMovie, setFeaturedMovie] = useState<Media | null>(null);
  const [stories, setStories] = useState<any[]>([]);
  const [storyIndex, setStoryIndex] = useState(0);
  const [netflix, setNetflix] = useState<Media[]>([]);
  const [amazon, setAmazon] = useState<Media[]>([]);
  const [hbo, setHbo] = useState<Media[]>([]);
  const [accountName, setAccountName] = useState('watcher');
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isKidsProfile, setIsKidsProfile] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [continueWatching, setContinueWatching] = useState<Media[]>([]);
  const [lastWatched, setLastWatched] = useState<Media | null>(null);
  const [activeFilter, setActiveFilter] = useState<'All' | 'TopRated' | 'New' | 'ForYou'>('All');
  const [activeGenreId, setActiveGenreId] = useState<number | null>(null);
  const [fabExpanded, setFabExpanded] = useState(false);

  const router = useRouter();
  const [previewVisible, setPreviewVisible] = useState(false);
  const previewTranslate = useRef(new Animated.Value(320)).current;

  const filterForKids = useCallback(
    (items: Media[] | undefined | null): Media[] => {
      if (!items || items.length === 0) {
        return [];
      }
      if (!isKidsProfile) {
        return items;
      }
      return items.filter((item) => {
        const ids = (item.genre_ids || []) as number[];
        const hasKidsGenre = ids.some((id) => KIDS_GENRE_IDS.includes(id));
        return !item.adult && hasKidsGenre;
      });
    },
    [isKidsProfile],
  );

  useEffect(() => {
    let unsubAuth: (() => void) | null = null;

    const fetchUserData = async () => {
      try {
        const auth = await authPromise;
        // initial fetch
        const user = auth.currentUser;
        if (user) {
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

  const homeFeedCacheScope = useMemo(
    () => `${activeProfileId ?? 'global'}${isKidsProfile ? ':kids' : ''}`,
    [activeProfileId, isKidsProfile],
  );
  const homeFeedCacheKey = useMemo(
    () => `homeFeedCache:${homeFeedCacheScope}`,
    [homeFeedCacheScope],
  );

  const buildKidsUrl = useCallback(
    (input: string, type: 'movie' | 'tv' | 'all' | 'discover' = 'movie') => {
      if (!isKidsProfile) return input;
      const url = new URL(input);
      url.searchParams.set('include_adult', 'false');
      url.searchParams.set('with_genres', '10751');
      if (type === 'movie' || type === 'discover') {
        url.searchParams.set('certification_country', 'US');
        url.searchParams.set('certification.lte', 'G');
      } else if (type === 'tv') {
        url.searchParams.set('certification_country', 'US');
        url.searchParams.set('certification.lte', 'TV-Y');
      } else if (type === 'all') {
        // when mixing media, prefer the most restrictive rating
        url.searchParams.set('certification_country', 'US');
        url.searchParams.set('certification.lte', 'TV-Y');
      }
      return url.toString();
    },
    [isKidsProfile],
  );

  const fetchWithKids = useCallback(
    async (input: string, type: 'movie' | 'tv' | 'all' | 'discover' = 'movie') => {
      const response = await fetch(buildKidsUrl(input, type));
      return response.json();
    },
    [buildKidsUrl],
  );

  const fetchProviderMovies = useCallback(
    async (providerId: number): Promise<Media[]> => {
      const url = `${API_BASE_URL}/discover/movie?api_key=${API_KEY}&with_watch_providers=${providerId}&watch_region=US&with_watch_monetization_types=flatrate`;
      const json = await fetchWithKids(url, 'discover');
      return json?.results || [];
    },
    [fetchWithKids],
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

  const loadWatchHistory = useCallback(() => {
    let isActive = true;
    const run = async () => {
      if (!profileReady) {
        if (isActive) {
          setContinueWatching([]);
          setLastWatched(null);
        }
        return;
      }
      try {
        const key = buildProfileScopedKey('watchHistory', activeProfileId);
        const stored = await AsyncStorage.getItem(key);
        if (!isActive) return;
        if (stored) {
          const parsed: Media[] = JSON.parse(stored);
          setContinueWatching(parsed);
          setLastWatched(parsed[0] || null);
        } else {
          setContinueWatching([]);
          setLastWatched(null);
        }
      } catch (err) {
        if (isActive) {
          console.error('Failed to load watch history', err);
          setContinueWatching([]);
          setLastWatched(null);
        }
      }
    };
    run();
    return () => {
      isActive = false;
    };
  }, [activeProfileId, profileReady]);

  useFocusEffect(loadWatchHistory);

  useEffect(() => {
    if (!profileReady) return;
    const loadFromCache = async () => {
      try {
        const cached = await AsyncStorage.getItem(homeFeedCacheKey);
        if (!cached) return false;

        const parsed = JSON.parse(cached) as {
          netflix: Media[];
          amazon: Media[];
          hbo: Media[];
          movieStoriesData: any;
          tvStoriesData: any;
          trendingData: any;
          movieReelsData: any;
          recommendedData: any;
          songsData: any;
          genresData: any;
        };

        const cachedMovieStories = filterForKids(
          (parsed.movieStoriesData?.results || []) as Media[],
        );
        const cachedTvStories = filterForKids((parsed.tvStoriesData?.results || []) as Media[]);
        const combinedStories = [...cachedMovieStories, ...cachedTvStories].map((item: any) => ({
          id: item.id,
          title: item.title || item.name || 'Untitled',
          image: item.poster_path
            ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
            : null,
          media_type: item.media_type,
        }));

        const trendingResults = filterForKids((parsed.trendingData?.results || []) as Media[]);
        const netflixSafe = filterForKids((parsed.netflix as Media[]) || []);
        const amazonSafe = filterForKids((parsed.amazon as Media[]) || []);
        const songsSafe = filterForKids((parsed.songsData?.results || []) as Media[]);
        const movieReelsSafe = filterForKids((parsed.movieReelsData?.results || []) as Media[]);
        const recommendedSafe = filterForKids((parsed.recommendedData?.results || []) as Media[]);
        const hboSource =
          parsed.hbo && parsed.hbo.length > 0
            ? (parsed.hbo as Media[])
            : trendingResults.filter((m) => m.media_type === 'tv');
        const hboSafe = filterForKids(hboSource);

        setNetflix(netflixSafe);
        setAmazon(amazonSafe);
        setHbo(hboSafe);
        setStories(shuffleArray(combinedStories));
        setTrending(trendingResults);
        setFeaturedMovie(trendingResults[0] || null);
        setTrendingMoviesOnly(cachedMovieStories);
        setTrendingTvOnly(cachedTvStories);
        setSongs(songsSafe);
        setMovieReels(movieReelsSafe);
        setRecommended(recommendedSafe);
        setGenres((parsed.genresData?.genres || []) as Genre[]);

        setLoading(false);
        return true;
      } catch (err) {
        console.error('Failed to load home feed cache', err);
        return false;
      }
    };

    const fetchData = async () => {
      setError(null);
      try {
        const [
          netflixMovies,
          amazonMovies,
          hboMovies,
          movieStoriesData,
          tvStoriesData,
          trendingData,
          movieReelsData,
          recommendedData,
          songsData,
          genresData,
        ] = await Promise.all([
          fetchProviderMovies(8),
          fetchProviderMovies(9),
          fetchProviderMovies(384),
          fetchWithKids(`${API_BASE_URL}/trending/movie/day?api_key=${API_KEY}`, 'movie'),
          fetchWithKids(`${API_BASE_URL}/trending/tv/day?api_key=${API_KEY}`, 'tv'),
          fetchWithKids(`${API_BASE_URL}/trending/all/day?api_key=${API_KEY}`, 'all'),
          fetchWithKids(`${API_BASE_URL}/movie/upcoming?api_key=${API_KEY}`, 'movie'),
          fetchWithKids(`${API_BASE_URL}/movie/top_rated?api_key=${API_KEY}`, 'movie'),
          fetchWithKids(`${API_BASE_URL}/movie/popular?api_key=${API_KEY}`, 'movie'),
          fetch(`${API_BASE_URL}/genre/movie/list?api_key=${API_KEY}`).then((r) => r.json()),
        ]);

        const movieStoriesList = filterForKids((movieStoriesData?.results || []) as Media[]);
        const tvStoriesList = filterForKids((tvStoriesData?.results || []) as Media[]);
        const combinedStories = [...movieStoriesList, ...tvStoriesList].map((item: any) => ({
          id: item.id,
          title: item.title || item.name || 'Untitled',
          image: item.poster_path
            ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
            : null,
          media_type: item.media_type,
        }));

        const trendingRaw = (trendingData?.results || []) as Media[];
        const trendingResults = filterForKids(trendingRaw);
        const netflixSafe = filterForKids(netflixMovies || []);
        const amazonSafe = filterForKids(amazonMovies || []);
        const songsSafe = filterForKids((songsData?.results || []) as Media[]);
        const movieReelsSafe = filterForKids((movieReelsData?.results || []) as Media[]);
        const recommendedSafe = filterForKids((recommendedData?.results || []) as Media[]);
        const hboSource =
          hboMovies && hboMovies.length > 0
            ? hboMovies
            : trendingRaw.filter((m) => m.media_type === 'tv');
        const hboSafe = filterForKids(hboSource);

        setNetflix(netflixSafe || []);
        setAmazon(amazonSafe || []);
        setHbo(hboSafe);
        setStories(shuffleArray(combinedStories));
        setTrending(trendingResults);
        setFeaturedMovie(trendingResults[0] || null);
        setTrendingMoviesOnly(movieStoriesList);
        setTrendingTvOnly(tvStoriesList);
        setSongs(songsSafe);
        setMovieReels(movieReelsSafe);
        setRecommended(recommendedSafe);
        setGenres((genresData?.genres || []) as Genre[]);

        try {
          await AsyncStorage.setItem(
            homeFeedCacheKey,
            JSON.stringify({
              netflix: netflixSafe,
              amazon: amazonSafe,
              hbo: hboSafe,
              movieStoriesData,
              tvStoriesData,
              trendingData,
              movieReelsData,
              recommendedData,
              songsData,
              genresData,
            })
          );
        } catch (err) {
          console.error('Failed to write home feed cache', err);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load content. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    const init = async () => {
      setLoading(true);
      const hadCache = await loadFromCache();
      fetchData();
      if (!hadCache) {
        return;
      }
    };

    init();
  }, [fetchProviderMovies, fetchWithKids, homeFeedCacheKey, filterForKids, profileReady]);

  const handleOpenDetails = useCallback(
    (item: Media) => {
      const mediaType = (item.media_type || 'movie') as string;
      router.push(`/details/${item.id}?mediaType=${mediaType}`);
    },
    [router]
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

  const becauseYouWatched = useMemo(() => {
    if (!lastWatched || !recommended || recommended.length === 0) return [];
    const lastGenres = (lastWatched.genre_ids || []) as number[];
    if (!lastGenres.length) return [];
    return recommended.filter((m) => {
      const genres = (m.genre_ids || []) as number[];
      return genres.some((g) => lastGenres.includes(g));
    });
  }, [lastWatched, recommended]);

  // rotate featured movie every 20s
  useEffect(() => {
    if (trending.length <= 1) return;

    const interval = setInterval(() => {
      setFeaturedMovie((currentFeatured) => {
        if (!currentFeatured) return trending[0] || null;
        const currentIndex = trending.findIndex((m) => m.id === currentFeatured.id);
        const nextIndex = (currentIndex + 1) % trending.length;
        return trending[nextIndex] || trending[0] || null;
      });
    }, 20000);

    return () => clearInterval(interval);
  }, [trending]);

  // rotate stories in blocks of 4 every 8s
  useEffect(() => {
    if (stories.length <= 4) return;

    const interval = setInterval(() => {
      setStoryIndex((prevIndex) => {
        const nextIndex = prevIndex + 4;
        return nextIndex >= stories.length ? 0 : nextIndex;
      });
    }, 8000);

    return () => clearInterval(interval);
  }, [stories]);

  const getGenreNames = (genreIds: number[] = []) => {
    if (!genres.length || !genreIds?.length) return '';
    return genreIds
      .map((id) => genres.find((g) => g.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  const handleShuffle = () => {
    const allContent = [...trending, ...movieReels, ...recommended, ...netflix, ...amazon, ...hbo];
    if (allContent.length > 0) {
      const randomItem = allContent[Math.floor(Math.random() * allContent.length)];
      router.push(`/details/${randomItem.id}?mediaType=${randomItem.media_type || 'movie'}`);
    }
  };

  const displayedStories = stories.slice(storyIndex, storyIndex + 4);
  const showStoriesSection = !isKidsProfile && stories.length > 0;
  const trendingCount = trending.length;
  const reelsCount = movieReels.length;
  const { setAccentColor } = useAccent();
  const featuredAccent = useMemo(
    () => getAccentFromPosterPath(featuredMovie?.poster_path),
    [featuredMovie?.poster_path]
  );

  useEffect(() => {
    if (featuredAccent) {
      setAccentColor(featuredAccent);
    }
  }, [featuredAccent, setAccentColor]);

  const openQuickPreview = (movie: Media) => {
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
  };

  const closeQuickPreview = () => {
    Animated.timing(previewTranslate, {
      toValue: 340,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setPreviewVisible(false));
  };

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
          {/* Header (glassy hero) */}
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
                  <Text style={styles.headerEyebrow}>Tonight&apos;s picks</Text>
                  <Text style={styles.headerText}>
                    Welcome, {activeProfileName ?? accountName}
                  </Text>
                </View>
              </View>

              <View style={styles.headerIcons}>
                <Link href="/marketplace" asChild>
                  <TouchableOpacity style={styles.iconBtn}>
                    <LinearGradient
                      colors={['#e50914', '#b20710']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.iconBg}
                    >
                      <Ionicons name="storefront" size={22} color="#ffffff" style={styles.iconMargin} />
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

                <Link href="/my-list" asChild>
                  <TouchableOpacity style={styles.iconBtn}>
                    <LinearGradient
                      colors={['#e50914', '#b20710']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.iconBg}
                    >
                      <Ionicons name="list-sharp" size={22} color="#ffffff" style={styles.iconMargin} />
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
            </View>
          </View>

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

            <ScrollView contentContainerStyle={styles.scrollViewContent}>
              {stories.length === 0 && recommended.length === 0 && trending.length === 0 ? (
                <View style={styles.centered}>
                  <Text style={styles.emptyText}>No movies or shows available right now.</Text>
                </View>
              ) : (
                <>
                  {/* Browse by genre above stories */}
                  {genres.length > 0 && (
                    <View style={styles.genreSection}>
                      <Text style={styles.genreLabel}>Browse by genre</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.genreRow}
                      >
                        <TouchableOpacity
                          style={[styles.genreChip, activeGenreId == null && styles.genreChipActive]}
                          onPress={() => setActiveGenreId(null)}
                        >
                          <Text
                            style={[
                              styles.genreChipText,
                              activeGenreId == null && styles.genreChipTextActive,
                            ]}
                          >
                            All genres
                          </Text>
                        </TouchableOpacity>
                        {genres.map((g) => (
                          <TouchableOpacity
                            key={g.id}
                            style={[styles.genreChip, activeGenreId === g.id && styles.genreChipActive]}
                            onPress={() =>
                              setActiveGenreId((current) => (current === g.id ? null : g.id))
                            }
                          >
                            <Text
                              style={[
                                styles.genreChipText,
                                activeGenreId === g.id && styles.genreChipTextActive,
                              ]}
                            >
                              {g.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {showStoriesSection && (
                    <View style={[styles.sectionBlock, styles.storiesSection]}>
                      <Story stories={displayedStories} />
                    </View>
                  )}

                  {/* Main filter chips below stories */}
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
                          <Text
                            style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                          >
                            {labelMap[key]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                {featuredMovie && (
                  <View style={styles.sectionBlock}>
                    <FeaturedMovie
                      movie={featuredMovie}
                      getGenreNames={getGenreNames}
                      onInfoPress={openQuickPreview}
                    />
                  </View>
                )}

                {continueWatching.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <MovieList
                      title="Continue Watching"
                      movies={continueWatching}
                      onItemPress={handleOpenDetails}
                      showProgress
                    />
                  </View>
                )}

                {lastWatched && becauseYouWatched.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <MovieList
                      title={`Because you watched ${lastWatched.title || lastWatched.name}`}
                      movies={becauseYouWatched}
                      onItemPress={handleOpenDetails}
                    />
                  </View>
                )}

                <View style={styles.sectionBlock}>
                  <SongList title="Songs of the Moment" songs={songs} />
                </View>

                <View style={styles.sectionBlock}>
                  <MovieList
                    title="Movie Reels"
                    movies={movieReels}
                    onItemPress={(item) => {
                      const queue = movieReels.slice(0, 20).map((m) => ({
                        id: m.id,
                        mediaType: m.media_type || 'movie',
                        title: m.title || m.name || 'Reel',
                        posterPath: m.poster_path || null,
                      }));
                      const listParam = encodeURIComponent(JSON.stringify(queue));
                      router.push(
                        `/reels/${item.id}?mediaType=${item.media_type || 'movie'}&title=${encodeURIComponent(
                          item.title || item.name || 'Reel'
                        )}&list=${listParam}`
                      );
                    }}
                  />
                </View>

                <View style={styles.sectionBlock}>
                  <MovieList
                    title="Trending"
                    movies={applyFilter(trending)}
                    onItemPress={handleOpenDetails}
                  />
                </View>

                <View style={styles.sectionBlock}>
                  <MovieList
                    title="Recommended"
                    movies={applyFilter(recommended)}
                    onItemPress={handleOpenDetails}
                  />
                </View>

                <View style={styles.sectionBlock}>
                  <MovieList title="Netflix Originals" movies={applyFilter(netflix)} onItemPress={handleOpenDetails} />
                </View>

                <View style={styles.sectionBlock}>
                  <MovieList title="Amazon Prime Video" movies={applyFilter(amazon)} onItemPress={handleOpenDetails} />
                </View>

                <View style={styles.sectionBlock}>
                  <MovieList title="HBO Max" movies={applyFilter(hbo)} onItemPress={handleOpenDetails} />
                </View>

                {/* Extra curated rows for depth */}
                <View style={styles.sectionBlock}>
                  <MovieList
                    title="Top Movies Today"
                    movies={applyFilter(trendingMoviesOnly)}
                    onItemPress={handleOpenDetails}
                  />
                </View>

                <View style={styles.sectionBlock}>
                  <MovieList
                    title="Top TV Today"
                    movies={applyFilter(trendingTvOnly)}
                    onItemPress={handleOpenDetails}
                  />
                </View>

                <View style={styles.sectionBlock}>
                  <MovieList
                    title="Popular Movies"
                    movies={applyFilter(songs)}
                    onItemPress={handleOpenDetails}
                  />
                </View>

                <View style={styles.sectionBlock}>
                  <MovieList
                    title="Upcoming in Theaters"
                    movies={applyFilter(movieReels)}
                    onItemPress={handleOpenDetails}
                  />
                </View>

                <View style={styles.sectionBlock}>
                  <MovieList
                    title="Top Rated Movies"
                    movies={applyFilter(recommended)}
                    onItemPress={handleOpenDetails}
                  />
                </View>
              </>
            )}
          </ScrollView>

            {/* Sub FABs */}
            {fabExpanded && (
              <>
                <TouchableOpacity
                  style={[styles.subFab, { bottom: 300 }]}
                  onPress={() => {
                    handleShuffle();
                    setFabExpanded(false);
                  }}
                >
                  <Ionicons name="shuffle" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.subFab, { bottom: 240 }]}
                  onPress={() => {
                    router.push('/messaging');
                    setFabExpanded(false);
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.subFab, { bottom: 360 }]}
                  onPress={() => {
                    router.push('/watchparty');
                    setFabExpanded(false);
                  }}
                >
                  <Ionicons name="people-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.subFab, { bottom: 420 }]}
                  onPress={() => {
                    router.push('/social-feed');
                    setFabExpanded(false);
                  }}
                >
                  <Ionicons name="heart-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </>
            )}

            {/* Main FAB */}
            <TouchableOpacity
              style={[styles.fab, { bottom: 120 }]}
              onPress={() => setFabExpanded(!fabExpanded)}
            >
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>

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
    marginTop: Platform.OS === 'ios' ? 80 : 50,
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
    marginBottom: 6,
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

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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

export default HomeScreen;
