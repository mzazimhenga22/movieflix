import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResizeMode, Video } from 'expo-av';
import * as Device from 'expo-device';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, Image, Modal, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { firestore } from '../../constants/firebase';
import { getAccentFromPosterPath } from '../../constants/theme';
import { useUser } from '../../hooks/use-user';
import { MoviesModule } from '../../modules/MoviesModule';
import { scrapeImdbTrailer } from '../../src/providers/scrapeImdbTrailer';
import type { Media } from '../../types';
import { useTvAccent } from '@/components/TvAccentContext';
import TvGlassPanel from '@/components/TvGlassPanel';
import TvHeroBanner from '@/components/TvHeroBanner';
import TvRail from '@/components/TvRail';
import TvPosterCard from '@/components/TvPosterCard';
import TvAmbientBackground from '@/components/TvAmbientBackground';
import NativeTvGlowView from '@/components/NativeTvGlowView';
import { TvFocusable } from '@/components/TvSpatialNavigation';
import { useMoviesData } from './movies/hooks/useMoviesData';
import { shuffleArray } from './movies/utils/constants';
// Native Liquid Glass Components
import { 
  LiquidHeroView,
  LiquidGlassCard,
  LiquidChipView,
  LiquidGlassButton 
} from '@/components/app-components/LiquidNativeViews';

// Base design resolution (Standard 1080p TV)
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

type ActiveProfile = {
  id?: string | null;
  name?: string | null;
  isKids?: boolean;
  avatarColor?: string | null;
  photoURL?: string | null;
  photoPath?: string | null;
};

type HouseholdProfile = {
  id: string;
  name: string;
  avatarColor: string;
  photoURL?: string | null;
  photoPath?: string | null;
  isKids?: boolean;
};

export default function MoviesTv() {
  const router = useRouter();
  const { width: screenWidth, height: windowHeight } = useWindowDimensions();
  const isSmallScreen = screenWidth < 960;
  
  // Ambient Background State
  const [ambientBackground, setAmbientBackground] = useState<string | null>(null);
  
  // Calculate scale factor
  const scale = useMemo(() => {
    const effectiveBaseWidth = isSmallScreen ? 800 : BASE_WIDTH;
    const effectiveBaseHeight = isSmallScreen ? 450 : BASE_HEIGHT;
    const widthRatio = screenWidth / effectiveBaseWidth;
    const heightRatio = windowHeight / effectiveBaseHeight;
    const baseScale = Math.min(widthRatio, heightRatio, 1.2);
    return isSmallScreen ? Math.max(baseScale, 0.85) : baseScale;
  }, [screenWidth, windowHeight, isSmallScreen]);

  const s = (size: number) => Math.round(size * scale);

  const { setAccentColor } = useTvAccent();
  const { user } = useUser();
  const [profile, setProfile] = useState<ActiveProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profiles, setProfiles] = useState<HouseholdProfile[]>([]);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [flixyEnabled, setFlixyEnabled] = useState(true);
  const heroFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [topTab, setTopTab] = useState<'Movies' | 'TV Series' | 'My List' | 'Animation' | 'More'>('Movies');

  useEffect(() => {
    AsyncStorage.getItem('flixy_enabled_v1').then((val) => {
      if (val !== null) setFlixyEnabled(val === 'true');
    });
  }, []);

  const toggleFlixy = useCallback(async () => {
    const newValue = !flixyEnabled;
    setFlixyEnabled(newValue);
    await AsyncStorage.setItem('flixy_enabled_v1', String(newValue));
    DeviceEventEmitter.emit('flixy_settings_changed', newValue);
  }, [flixyEnabled]);

  const [myList, setMyList] = useState<Media[]>([]);

  const profileCacheKey = useMemo(() => (user?.uid ? `profileCache:${user.uid}` : null), [user?.uid]);

  const hasLoadedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!hasLoadedOnce.current) {
        setProfileReady(false);
      }
      void AsyncStorage.getItem('activeProfile')
        .then((raw) => {
          if (!alive) return;
          if (!raw) {
            setProfile(null);
            return;
          }
          try {
            setProfile(JSON.parse(raw));
          } catch {
            setProfile(null);
          }
        })
        .finally(() => {
          if (alive) {
            setProfileReady(true);
            hasLoadedOnce.current = true;
          }
        });
      return () => {
        alive = false;
      };
    }, []),
  );

  useEffect(() => {
    let mounted = true;
    if (!profileCacheKey) {
      setProfiles([]);
      return () => {
        mounted = false;
      };
    }

    void AsyncStorage.getItem(profileCacheKey)
      .then((raw) => {
        if (!mounted) return;
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as HouseholdProfile[];
          if (Array.isArray(parsed)) setProfiles(parsed);
        } catch {
          // ignore
        }
      })
      .catch(() => { });

    return () => {
      mounted = false;
    };
  }, [profileCacheKey]);

  useEffect(() => {
    if (!user?.uid) return;

    const profilesRef = collection(firestore, 'users', user.uid, 'profiles');
    const q = query(profilesRef, orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: HouseholdProfile[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: (data.name as string) || 'Profile',
            avatarColor: (data.avatarColor as string) || '#e50914',
            photoURL: (data.photoURL as string | null | undefined) ?? null,
            photoPath: (data.photoPath as string | null | undefined) ?? null,
            isKids: Boolean(data.isKids),
          };
        });
        setProfiles(next);
        if (profileCacheKey) AsyncStorage.setItem(profileCacheKey, JSON.stringify(next)).catch(() => { });
      },
      () => {
        // offline: keep cached
      },
    );

    return () => unsub();
  }, [profileCacheKey, user?.uid]);

  const selectProfile = useCallback(async (p: HouseholdProfile) => {
    const active: ActiveProfile = {
      id: p.id,
      name: p.name,
      avatarColor: p.avatarColor,
      photoURL: p.photoURL ?? null,
      photoPath: p.photoPath ?? null,
      isKids: Boolean(p.isKids),
    };
    await AsyncStorage.setItem('activeProfile', JSON.stringify(active));
    setProfile(active);
    setProfileMenuOpen(false);
  }, []);

  // Load My List
  useEffect(() => {
    let alive = true;
    const loadMyList = async () => {
      try {
        const profileId = profile?.id ?? 'default';
        const key = `myList:${profileId}`;
        const raw = await AsyncStorage.getItem(key);
        if (!alive) return;
        if (raw) {
          const parsed = JSON.parse(raw);
          setMyList(Array.isArray(parsed) ? parsed : []);
        } else {
          setMyList([]);
        }
      } catch {
        if (alive) setMyList([]);
      }
    };
    loadMyList();
    return () => { alive = false; };
  }, [profile?.id]);

  const {
    trending,
    recommended,
    recommendedTv,
    netflix,
    amazon,
    hbo,
    netflixTv,
    amazonTv,
    hboTv,
    tvOnTheAir,
    movieTrailers,
    continueWatching,
    lastWatched,
    featuredMovie,
    loading,
    error,
    offline,
    hasCachedContent,
    trendingMoviesOnly,
    trendingTvOnly,
    songs,
  } = useMoviesData(
    (profile?.id ?? null) as string | null,
    Boolean(profile?.isKids),
    profileReady,
  );

  const tabMode = useMemo(() => {
    if (topTab === 'TV Series') return { type: 'tv' as const, genreId: null as number | null };
    if (topTab === 'My List') return { type: 'mylist' as const, genreId: null as number | null };
    if (topTab === 'Animation') return { type: 'all' as const, genreId: 16 };
    if (topTab === 'More') return { type: 'all' as const, genreId: null as number | null };
    return { type: 'movie' as const, genreId: null as number | null };
  }, [topTab]);

  /* Native Filtering HOOK - Optimized with batched filtering */
  const useNativeFilter = useCallback((items: Media[], type: string, genreId: number | null) => {
    const [filtered, setFiltered] = useState<Media[]>([]);
    const itemsRef = useRef(items);
    const filteredRef = useRef<Media[]>([]);
    
    useEffect(() => {
      itemsRef.current = items;
    }, [items]);
    
    useEffect(() => {
      let active = true;
      
      // Skip if no items
      if (!itemsRef.current || itemsRef.current.length === 0) {
        if (filteredRef.current.length > 0) {
          setFiltered([]);
          filteredRef.current = [];
        }
        return;
      }

      // Debounce filter calls
      const timeoutId = setTimeout(async () => {
        if (!active) return;
        
        try {
          // Batch all filters into single native call when possible
          const json = JSON.stringify(itemsRef.current);
          const res = await MoviesModule.filterMovies(json, type, genreId ?? -1);
          
          if (active) {
            const parsed = JSON.parse(res);
            // Only update if actually changed
            if (parsed.length !== filteredRef.current.length || 
                parsed.some((p: any, i: number) => p.id !== filteredRef.current[i]?.id)) {
              setFiltered(parsed);
              filteredRef.current = parsed;
            }
          }
        } catch (e) {
          if (__DEV__) console.warn('[NativeFilter] Failed, using JS fallback', e);
          // JS fallback for filtering
          if (active) {
            let result = itemsRef.current;
            if (type === 'movie') {
              result = result.filter(item => item.media_type === 'movie' || !item.media_type);
            } else if (type === 'tv') {
              result = result.filter(item => item.media_type === 'tv');
            }
            if (genreId) {
              result = result.filter(item => item.genre_ids?.includes(genreId));
            }
            if (result.length !== filteredRef.current.length) {
              setFiltered(result);
              filteredRef.current = result;
            }
          }
        }
      }, 16); // ~60fps debounce
      
      return () => {
        active = false;
        clearTimeout(timeoutId);
      };
    }, [type, genreId]); // Only depend on type/genre, not items
    
    // Update when items change without waiting for debounce
    useEffect(() => {
      if (items.length === 0 && filteredRef.current.length > 0) {
        setFiltered([]);
        filteredRef.current = [];
      }
    }, [items]);
    
    return filtered;
  }, []);

  const tabTrending = useNativeFilter(
    tabMode.type === 'movie' ? trendingMoviesOnly : tabMode.type === 'tv' ? trendingTvOnly : trending,
    tabMode.type,
    tabMode.genreId
  );

  const tabRecommended = useNativeFilter(
    tabMode.type === 'tv' ? recommendedTv : recommended,
    tabMode.type,
    tabMode.genreId
  );

  const tabNetflix = useNativeFilter(
    tabMode.type === 'tv' ? netflixTv : netflix,
    tabMode.type,
    tabMode.genreId
  );

  const tabAmazon = useNativeFilter(
    tabMode.type === 'tv' ? amazonTv : amazon,
    tabMode.type,
    tabMode.genreId
  );

  const tabHbo = useNativeFilter(
    tabMode.type === 'tv' ? hboTv : hbo,
    tabMode.type,
    tabMode.genreId
  );

  const tabOnTheAir = useNativeFilter(
    tabMode.type === 'tv' ? tvOnTheAir : [],
    tabMode.type,
    tabMode.genreId
  );

  const tabFeatured = useMemo(() => tabTrending[0] ?? null, [tabTrending, tabMode.type]);

  const [heroItem, setHeroItem] = useState<Media | null>(null);
  const [heroTrailer, setHeroTrailer] = useState<string | null>(null);
  const heroItemRef = useRef<Media | null>(null);
  const shuffleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerNextHeroShuffle = useCallback(async () => {
    if (loading || !trending.length) return;
    try {
      const pool = [...trending, ...recommended, ...netflix, ...amazon, ...hbo];
      if (!pool.length) return;

      if (typeof MoviesModule?.shuffleItems !== 'function') {
        return;
      }
      
      const json = JSON.stringify(pool);
      const res = await MoviesModule.shuffleItems(json);
      const shuffled = JSON.parse(res);
      
      if (shuffled.length > 0) {
        const nextItem = shuffled[0];
        setHeroItem(nextItem);
        heroItemRef.current = nextItem;
      }
    } catch (e) {}
  }, [loading, trending, recommended, netflix, amazon, hbo]);

  useEffect(() => {
    if (shuffleTimerRef.current) clearTimeout(shuffleTimerRef.current);
    const delay = heroTrailer ? 45000 : 12000;
    shuffleTimerRef.current = setTimeout(() => {
      triggerNextHeroShuffle();
    }, delay);
    return () => {
      if (shuffleTimerRef.current) clearTimeout(shuffleTimerRef.current);
    };
  }, [heroItem?.id, heroTrailer, triggerNextHeroShuffle]);

  useEffect(() => {
    setHeroItem(null);
    setHeroTrailer(null);
    heroItemRef.current = null;
  }, [profile?.id, topTab]);

  useEffect(() => {
    if (heroItemRef.current === null && (tabFeatured ?? featuredMovie)) {
      const newHero = tabFeatured ?? featuredMovie;
      setHeroItem(newHero);
      heroItemRef.current = newHero;
    }
  }, [tabFeatured, featuredMovie]);

  useEffect(() => {
    setHeroTrailer(null);
  }, [heroItem?.id]);

  useEffect(() => {
    if (!heroItem?.id) return;
    let alive = true;
    let mid = heroItem.imdb_id || (heroItem as any).imdbId;
    const prefound = movieTrailers.find(t => t.id === heroItem.id);
    if (!mid && prefound) {
      mid = prefound.imdb_id || (prefound as any).imdbId;
    }

    if (prefound && (prefound as any).trailerUrl) {
      setHeroTrailer((prefound as any).trailerUrl);
      return;
    }

    if (mid) {
      void MoviesModule.fetchImdbTrailer(mid).then(async (res: any) => {
        const url = typeof res === 'string' ? res : res?.url;
        if (alive && url) {
          setHeroTrailer(url);
        } else if (alive) {
          try {
            const tsRes = await scrapeImdbTrailer({ imdb_id: mid });
            if (alive && tsRes?.url) {
              setHeroTrailer(tsRes.url);
            }
          } catch (tsErr) {}
        }
      }).catch(async (err) => {
        if (alive) {
          try {
            const tsRes = await scrapeImdbTrailer({ imdb_id: mid });
            if (alive && tsRes?.url) {
              setHeroTrailer(tsRes.url);
            }
          } catch (e) {}
        }
      });
    }
    return () => { alive = false; };
  }, [heroItem, movieTrailers]);

  const accent = useMemo(
    () => getAccentFromPosterPath(heroItem?.poster_path ?? featuredMovie?.poster_path) ?? '#e50914',
    [featuredMovie?.poster_path, heroItem?.poster_path],
  );

  useEffect(() => {
    setAccentColor(accent);
  }, [accent, setAccentColor]);

  const openDetails = useCallback(
    (item: Media) => {
      const mediaType = (item.media_type || 'movie') as string;
      router.push(`/details/${item.id}?mediaType=${mediaType}`);
    },
    [router],
  );

  const heroHeight = useMemo(() => {
    // Taller, more cinematic hero
    const raw = Math.round(windowHeight * 0.75);
    const minH = s(620);
    const maxH = s(780);
    return Math.min(maxH, Math.max(minH, raw));
  }, [windowHeight, s]);

  const primaryTarget = heroItem ?? tabFeatured ?? lastWatched ?? featuredMovie;

  const handleCardFocus = useCallback(
    (item: Media) => {
      if (heroFocusTimerRef.current) clearTimeout(heroFocusTimerRef.current);
      if (item.backdrop_path || item.poster_path) {
        setAmbientBackground((item.backdrop_path || item.poster_path) ?? null);
      }
      heroFocusTimerRef.current = setTimeout(() => {
        setHeroItem((prev) => {
          const prevType = prev?.media_type ?? 'movie';
          const nextType = item?.media_type ?? 'movie';
          if (prev?.id === item?.id && prevType === nextType) return prev;
          heroItemRef.current = item;
          return item;
        });
      }, 300); // Slower updates for hero when scrolling
    },
    [],
  );

  const handleCardPress = useCallback(
    (item: Media) => {
      openDetails(item);
    },
    [openDetails],
  );

  useEffect(() => {
    return () => {
      if (heroFocusTimerRef.current) clearTimeout(heroFocusTimerRef.current);
    };
  }, []);

  const isScreenFocused = useIsFocused();

  const dynamicStyles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#030408' },
    
    // Top Bar Styles
    topBarWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      paddingTop: isSmallScreen ? 10 : s(28),
      paddingHorizontal: isSmallScreen ? s(12) : s(40),
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'flex-start', // Align to top to allow right column to grow down
      gap: s(16),
      paddingBottom: s(18),
      flexWrap: isSmallScreen ? 'wrap' : 'nowrap',
    },
    topBarBg: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: s(180),
    },

    offlinePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(10),
      paddingHorizontal: s(16),
      height: s(46),
      borderRadius: 999,
      backgroundColor: 'rgba(8,10,20,0.85)',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.14)',
    },
    offlineText: {
      color: 'rgba(255,255,255,0.88)',
      fontSize: s(13),
      fontWeight: '900',
    },
    searchPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(12),
      paddingHorizontal: s(18),
      height: s(46),
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.15)',
      minWidth: isSmallScreen ? s(120) : s(180),
      backdropFilter: 'blur(20px)', // Web only support
    },
    searchText: { color: 'rgba(255,255,255,0.9)', fontSize: s(14), fontWeight: '800' },
    topTabs: { 
      flex: 1, 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center', 
      gap: s(12),
      height: s(46), // Match height of search/profile pills for alignment
    },
    topTab: {
      height: s(40),
      paddingHorizontal: s(16),
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    topTabActive: { 
      backgroundColor: 'rgba(255,255,255,0.15)', 
    },
    topTabText: { color: 'rgba(255,255,255,0.6)', fontSize: s(15), fontWeight: '800' },
    topTabTextActive: { color: '#fff', fontWeight: '900' },
    
    // Right Column Layout
    rightColumn: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: s(16),
      marginRight: s(20),
      height: s(400), // Approximate 3/4 of hero height
      justifyContent: 'center',
    },
    profilePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(12),
      paddingHorizontal: s(8),
      height: s(46),
      borderRadius: 999,
      backgroundColor: 'transparent',
      marginBottom: s(10),
    },
    profileDot: { width: s(32), height: s(32), borderRadius: 99, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
    profileText: { color: '#fff', fontSize: s(13), fontWeight: '900', display: isSmallScreen ? 'none' : 'flex' },
    
    // New Widget Cards
    widgetCard: {
      width: s(80),
      flex: 1, // Grow to fill column height
      borderRadius: s(28),
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
      overflow: 'hidden',
    },
    widgetCardFocused: {
      transform: [{ scale: 1.05 }],
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderColor: '#fff',
      borderWidth: 2,
      shadowColor: '#fff',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: s(12),
    },
    widgetText: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: s(11),
      fontWeight: '800',
      marginTop: s(8),
      letterSpacing: 0.5,
    },

    pillFocused: {
      transform: [{ scale: 1.06 }],
      borderColor: '#fff',
      borderWidth: 2,
      backgroundColor: 'rgba(255,255,255,0.2)',
      shadowColor: '#fff',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.55,
      shadowRadius: s(12),
    },

    // Content
    scrollContent: { 
      paddingBottom: s(60),
    },
    featuredRow: {
      flexDirection: 'row',
      width: '90%', // Ensures right side remains within safe bounds
      alignSelf: 'flex-start', // Align to left instead of center
      marginLeft: s(40), // Match Top Bar alignment
      marginTop: s(20),
      gap: s(20), // Tighter gap
    },
    heroSection: {
      flex: 1, // Fill remaining space to avoid cutting
      position: 'relative',
      zIndex: 1,
      borderRadius: s(32),
      overflow: 'hidden',
      backgroundColor: '#000',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.5,
      shadowRadius: 30,
      elevation: 20,
    },
    sideColumn: {
      width: s(240),
      flexDirection: 'column',
      justifyContent: 'flex-start',
      paddingTop: s(80), // Push down below search bar area
      zIndex: 10,
    },
    sideTitle: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: s(18),
      fontWeight: '800',
      marginBottom: s(16),
      marginLeft: s(4),
    },
    verticalList: {
      flexDirection: 'column',
    },
    railSection: {
      marginTop: -s(120), 
      paddingLeft: s(40),
      zIndex: 10,
    },

    // Profile Menu
    profileMenuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      paddingTop: s(84),
      paddingRight: s(42),
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 2000,
    },
    profileMenuPanel: {
      width: s(360),
      height: s(480),
      borderRadius: s(24),
      overflow: 'hidden',
    },
    profileMenuHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: s(16),
      paddingTop: s(14),
      paddingBottom: s(10),
    },
    profileMenuTitle: { color: '#fff', fontSize: s(16), fontWeight: '900' },
    profileMenuClose: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
      paddingHorizontal: s(12),
      height: s(38),
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
    },
    profileMenuCloseFocused: {
      transform: [{ scale: 1.08 }],
      borderColor: '#fff',
      borderWidth: 2,
      backgroundColor: 'rgba(229,9,20,0.6)',
      shadowColor: '#fff',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: s(10),
    },
    profileMenuCloseText: { color: '#fff', fontSize: s(12), fontWeight: '900' },
    profileMenuList: { paddingHorizontal: s(16), paddingBottom: s(16), gap: s(10) },
    profileMenuItem: {
      height: s(46),
      borderRadius: s(18),
      paddingHorizontal: s(14),
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(12),
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
    },
    profileMenuItemSelected: {
      backgroundColor: 'rgba(229,9,20,0.22)',
      borderColor: 'rgba(255,255,255,0.18)',
    },
    profileMenuItemFocused: {
      transform: [{ scale: 1.05 }],
      borderColor: '#fff',
      borderWidth: 2,
      shadowColor: '#fff',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: s(8),
    },
    profileMenuDot: { width: s(22), height: s(22), borderRadius: 999 },
    profileMenuName: { flex: 1, color: '#fff', fontSize: s(13), fontWeight: '900' },
    profileMenuKids: { color: 'rgba(255,255,255,0.75)', fontSize: s(11), fontWeight: '900' },
    profileMenuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginVertical: s(6) },
    profileMenuManage: {
      height: s(46),
      borderRadius: s(18),
      paddingHorizontal: s(14),
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(12),
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
    },
    profileMenuManageText: { color: '#fff', fontSize: s(13), fontWeight: '900' },

    // Loading/Error
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: 'rgba(255,255,255,0.8)', fontSize: s(16), fontWeight: '800', marginTop: s(12) },
    errorTitle: { color: '#fff', fontSize: s(28), fontWeight: '900', marginBottom: s(8) },
    errorText: { color: 'rgba(255,255,255,0.75)', fontSize: s(16), marginBottom: s(18) },
    primaryBtn: { backgroundColor: '#e50914', paddingHorizontal: s(18), paddingVertical: s(12), borderRadius: s(16), borderWidth: 2, borderColor: 'transparent' },
    primaryBtnFocused: {
      transform: [{ scale: 1.08 }],
      borderColor: '#fff',
      shadowColor: '#fff',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.7,
      shadowRadius: s(10),
    },
    primaryText: { color: '#fff', fontSize: s(15), fontWeight: '900' },
    emptyMyList: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: s(80),
      gap: s(12),
    },
    emptyMyListTitle: {
      color: '#fff',
      fontSize: s(24),
      fontWeight: '900',
      marginTop: s(8),
    },
    emptyMyListText: {
      color: 'rgba(255,255,255,0.6)',
      fontSize: s(16),
      fontWeight: '600',
      textAlign: 'center',
      maxWidth: s(300),
    },
    emptyMyListBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(10),
      marginTop: s(16),
      paddingHorizontal: s(24),
      paddingVertical: s(14),
      borderRadius: s(16),
      backgroundColor: 'rgba(229,9,20,0.8)',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    emptyMyListBtnFocused: {
      transform: [{ scale: 1.08 }],
      borderColor: '#fff',
      borderWidth: 3,
      shadowColor: '#fff',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.7,
      shadowRadius: s(12),
      elevation: 10,
    },
    emptyMyListBtnText: {
      color: '#fff',
      fontSize: s(16),
      fontWeight: '900',
    },
  }), [s, scale]);

  if (!profileReady || loading) {
    return (
      <View style={dynamicStyles.loadingWrap}>
        <LinearGradient
          colors={['#0a0a0a', '#050505', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator color="#e50914" size="large" />
        <Text style={dynamicStyles.loadingText}>Loading your home…</Text>
      </View>
    );
  }

  if (error && !hasCachedContent) {
    return (
      <View style={dynamicStyles.loadingWrap}>
        <LinearGradient
          colors={['#0a0a0a', '#050505', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={dynamicStyles.errorTitle}>Couldn’t load</Text>
        <Text style={dynamicStyles.errorText}>{error}</Text>
        <TvFocusable onPress={() => router.replace('/(tabs)/movies')} style={({ focused }: any) => [dynamicStyles.primaryBtn, focused ? dynamicStyles.primaryBtnFocused : null]} isTVSelectable={true} accessibilityLabel="Try again">
          <Text style={dynamicStyles.primaryText}>Try again</Text>
        </TvFocusable>
      </View>
    );
  }

  return (
    <View style={dynamicStyles.container}>
      {/* 1. Dynamic Ambient Movie Backdrop */}
      <TvAmbientBackground uri={ambientBackground} opacity={0.6} />

      {/* 2. Base Gradient Wash */}
      <LinearGradient
        colors={[accent, '#0a0a0a', '#000000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.9 }]}
      />
      
      {/* 3. Native Glow Spotlights */}
      <NativeTvGlowView 
        color={accent} 
        style={StyleSheet.absoluteFill} 
      />

      {/* Floating Top Bar */}
      <View style={dynamicStyles.topBarWrapper}>
        <LinearGradient
          colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.4)', 'transparent']}
          style={dynamicStyles.topBarBg}
          pointerEvents="none"
        />
        <View style={dynamicStyles.topBar}>
          {offline ? (
            <View style={dynamicStyles.offlinePill}>
              <Ionicons name="cloud-offline" size={s(14)} color="rgba(255,255,255,0.86)" />
              <Text style={dynamicStyles.offlineText}>Offline</Text>
            </View>
          ) : null}
          
          <TvFocusable
            onPress={() => router.push('/(tabs)/search')}
            isTVSelectable={true}
            accessibilityLabel="Search"
            style={({ focused }: any) => [dynamicStyles.searchPill, focused ? dynamicStyles.pillFocused : null]}
          >
            <Ionicons name="search" size={s(18)} color="rgba(255,255,255,0.86)" />
            <Text style={dynamicStyles.searchText} numberOfLines={1}>
              {tabMode.type === 'tv' ? 'Search series' : tabMode.type === 'all' ? 'Search' : 'Search movies'}
            </Text>
          </TvFocusable>

          <View style={dynamicStyles.topTabs}>
            {(['Movies', 'TV Series', 'My List', 'Animation', 'More'] as const).map((label) => {
              const active = topTab === label;
              return (
                <LiquidChipView
                  key={label}
                  label={label}
                  selected={active}
                  onPress={() => setTopTab(label)}
                  size="small"
                />
              );
            })}
          </View>

          {/* Right Column: Profile + Widgets */}
          <View style={dynamicStyles.rightColumn}>
            <TvFocusable
              onPress={() => {
                if (!profiles.length) {
                  router.push('/select-profile');
                  return;
                }
                setProfileMenuOpen(true);
              }}
              isTVSelectable={true}
              accessibilityLabel="Profile"
              style={({ focused }: any) => [dynamicStyles.profilePill, focused ? dynamicStyles.pillFocused : null]}
            >
              <View
                style={[
                  dynamicStyles.profileDot,
                  { backgroundColor: String(profile?.avatarColor || accent || '#e50914') + 'AA' },
                ]}
              />
              <Text style={dynamicStyles.profileText} numberOfLines={1}>
                {profile?.name ?? user?.displayName ?? user?.email?.split('@')[0] ?? 'Guest'}
              </Text>
            </TvFocusable>

            {/* Vertical Glassy Widgets - Using Native Liquid Glass */}
            <LiquidGlassButton
              icon="film-outline"
              label="Reels"
              onPress={() => router.push('/(tabs)/reels')}
              size={s(80)}
            />

            <LiquidGlassButton
              icon="musical-notes-outline"
              label="Music"
              onPress={() => router.push('/(tabs)/music')}
              size={s(80)}
            />
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={dynamicStyles.scrollContent}>
        
        {/* Featured Row: Side Column + Hero */}
        <View style={dynamicStyles.featuredRow}>
          {/* Left Side Column: Continue Watching - Using Native Liquid Cards */}
          <View style={dynamicStyles.sideColumn}>
            {continueWatching.length > 0 && (
              <View>
                <Text style={dynamicStyles.sideTitle}>Continue Watching</Text>
                <View style={dynamicStyles.verticalList}>
                  {continueWatching.slice(0, 3).map((item) => (
                    <View key={item.id} style={{ marginBottom: s(16) }}>
                      <LiquidGlassCard
                        style={{ width: s(240), height: s(135) }}
                        posterPath={item.backdrop_path || item.poster_path}
                        title={item.title || item.name}
                        progress={item.watchProgress?.progress || 0}
                        onPress={() => handleCardPress(item)}
                        onFocus={() => handleCardFocus(item)}
                        interactive={true}
                        glowIntensity={0.4}
                      />
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Hero Section - Enhanced with Native Liquid Hero */}
          <View style={dynamicStyles.heroSection}>
            {/* Native cinematic background layer */}
            {Platform.OS === 'android' && heroItem?.backdrop_path && (
              <LiquidHeroView
                style={StyleSheet.absoluteFill}
                posterPath={heroItem.backdrop_path}
                accentColor={accent}
                parallaxIntensity={0.3}
                particleCount={15}
              />
            )}
            <TvHeroBanner
              variant="full"
              profileName={profile?.name}
              accent={accent}
              item={heroItem}
              height={heroHeight}
              trailerUrl={heroTrailer}
              isActive={isScreenFocused}
              onTrailerEnd={triggerNextHeroShuffle}
              primaryLabel={heroItem?.id === lastWatched?.id ? 'Resume' : 'Watch'}
              secondaryLabel="More Info"
              tertiaryLabel="My List"
              onPressPrimary={() => {
                if (primaryTarget) openDetails(primaryTarget);
              }}
              onPressSecondary={() => {
                if (heroItem) openDetails(heroItem);
              }}
              onPressTertiary={() => {
                if (heroItem) openDetails(heroItem);
              }}
            />
          </View>
        </View>

        {/* Rails Section - shifted up to blend with hero */}
        <View style={dynamicStyles.railSection}>
          
          {/* My List Tab - show user's saved content */}
          {tabMode.type === 'mylist' ? (
            myList.length > 0 ? (
              <TvRail
                title="My List"
                items={myList}
                cardWidth={s(200)}
                onPressItem={handleCardPress}
                onFocusItem={handleCardFocus}
              />
            ) : (
              <View style={dynamicStyles.emptyMyList}>
                <Ionicons name="bookmark-outline" size={s(48)} color="rgba(255,255,255,0.4)" />
                <Text style={dynamicStyles.emptyMyListTitle}>Your list is empty</Text>
                <Text style={dynamicStyles.emptyMyListText}>Add movies and shows to your list to watch later</Text>
                <TvFocusable
                  onPress={() => setTopTab('Movies')}
                  tvPreferredFocus
                  isTVSelectable={true}
                  accessibilityLabel="Browse Movies"
                  style={({ focused }: any) => [dynamicStyles.emptyMyListBtn, focused && dynamicStyles.emptyMyListBtnFocused]}
                >
                  <Ionicons name="film-outline" size={s(18)} color="#fff" />
                  <Text style={dynamicStyles.emptyMyListBtnText}>Browse Movies</Text>
                </TvFocusable>
              </View>
            )
          ) : (
            <>
              {/* Latest Trailers / New Arrivals */}
              {movieTrailers.length > 0 && tabMode.type === 'movie' && (
                <TvRail
                  title="Latest Trailers"
                  items={movieTrailers}
                  cardWidth={s(260)}
                  variant="landscape"
                  onPressItem={handleCardPress}
                  onFocusItem={handleCardFocus}
                />
              )}

              <TvRail
                title="You might like"
                items={tabRecommended}
                cardWidth={s(176)}
                onPressItem={handleCardPress}
                onFocusItem={handleCardFocus}
              />
              
              <TvRail
                title={tabMode.type === 'tv' ? 'Trending series' : tabMode.genreId ? 'Trending picks' : 'Trending Now'}
                items={tabTrending.slice(0, 10)}
                cardWidth={s(184)}
                isTop10={true}
                onPressItem={handleCardPress}
                onFocusItem={handleCardFocus}
              />
              
              {tabMode.type === 'tv' ? (
                <TvRail
                  title="On the air"
                  items={tabOnTheAir}
                  cardWidth={s(168)}
                  onPressItem={handleCardPress}
                  onFocusItem={handleCardFocus}
                />
              ) : null}
              
              <TvRail title="Netflix Exclusives" items={tabNetflix} cardWidth={s(168)} onPressItem={handleCardPress} onFocusItem={handleCardFocus} />
              <TvRail title="Prime Video" items={tabAmazon} cardWidth={s(168)} onPressItem={handleCardPress} onFocusItem={handleCardFocus} />
              <TvRail title="HBO Originals" items={tabHbo} cardWidth={s(168)} onPressItem={handleCardPress} onFocusItem={handleCardFocus} />

              {/* Songs of the Moment - Movie soundtracks */}
              {songs.length > 0 && tabMode.type === 'movie' && (
                <TvRail
                  title="Songs of the Moment"
                  items={songs.slice(0, 15)}
                  cardWidth={s(168)}
                  onPressItem={handleCardPress}
                  onFocusItem={handleCardFocus}
                />
              )}

              {/* Additional genre-based rails based on tab */}
              {tabMode.type === 'movie' && trendingMoviesOnly.length > 0 && (
                <TvRail
                  title="Popular Movies"
                  items={shuffleArray([...trendingMoviesOnly]).slice(0, 15)}
                  cardWidth={s(168)}
                  onPressItem={handleCardPress}
                  onFocusItem={handleCardFocus}
                />
              )}
              {tabMode.type === 'tv' && trendingTvOnly.length > 0 && (
                <TvRail
                  title="Binge-Worthy Series"
                  items={shuffleArray([...trendingTvOnly]).slice(0, 15)}
                  cardWidth={s(168)}
                  onPressItem={handleCardPress}
                  onFocusItem={handleCardFocus}
                />
              )}
            </>
          )}

          <View style={{ height: s(60) }} />
        </View>
      </ScrollView>

      {/* Profile Menu Modal */}
      <Modal
        visible={profileMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileMenuOpen(false)}
      >
        <View style={dynamicStyles.profileMenuBackdrop}>
          <TvGlassPanel accent={accent} style={dynamicStyles.profileMenuPanel}>
            <View style={dynamicStyles.profileMenuHeader}>
              <Text style={dynamicStyles.profileMenuTitle}>Switch profile</Text>
              <TvFocusable onPress={() => setProfileMenuOpen(false)} style={({ focused }: any) => [dynamicStyles.profileMenuClose, focused && dynamicStyles.profileMenuCloseFocused]} isTVSelectable={true} accessibilityLabel="Close">
                <Ionicons name="close" size={s(18)} color="#fff" />
                <Text style={dynamicStyles.profileMenuCloseText}>Close</Text>
              </TvFocusable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={dynamicStyles.profileMenuList}>
              {profiles.length === 0 ? (
                <View style={{ padding: s(20), alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: s(14), fontWeight: '700' }}>No profiles found</Text>
                </View>
              ) : profiles.map((p, index) => {
                const isCurrent = Boolean(profile?.id && String(profile.id) === String(p.id));
                const shouldFocus = isCurrent || (!profile?.id && index === 0);
                return (
                  <TvFocusable
                    key={p.id}
                    tvPreferredFocus={shouldFocus}
                    onPress={() => void selectProfile(p)}
                    isTVSelectable={true}
                    accessibilityLabel={p.name}
                    style={({ focused }: any) => [
                      dynamicStyles.profileMenuItem,
                      isCurrent ? dynamicStyles.profileMenuItemSelected : null,
                      focused ? dynamicStyles.profileMenuItemFocused : null,
                    ]}
                  >
                    <View style={[dynamicStyles.profileMenuDot, { backgroundColor: p.avatarColor || '#e50914' }]} />
                    <Text style={dynamicStyles.profileMenuName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {p.isKids ? <Text style={dynamicStyles.profileMenuKids}>Kids</Text> : null}
                    {isCurrent ? <Ionicons name="checkmark" size={s(18)} color="#fff" /> : null}
                  </TvFocusable>
                );
              })}

              <View style={dynamicStyles.profileMenuDivider} />
              <TvFocusable
                onPress={toggleFlixy}
                isTVSelectable={true}
                accessibilityLabel="Toggle Flixy"
                style={({ focused }: any) => [dynamicStyles.profileMenuManage, focused ? dynamicStyles.profileMenuItemFocused : null]}
              >
                <Ionicons name={flixyEnabled ? 'happy' : 'happy-outline'} size={s(18)} color={flixyEnabled ? '#e50914' : '#fff'} />
                <Text style={dynamicStyles.profileMenuManageText}>
                  {flixyEnabled ? 'Hide Flixy Assistant' : 'Show Flixy Assistant'}
                </Text>
                <View style={{ flex: 1 }} />
                <Ionicons
                  name={flixyEnabled ? 'toggle' : 'toggle-outline'}
                  size={s(22)}
                  color={flixyEnabled ? '#e50914' : 'rgba(255,255,255,0.4)'}
                />
              </TvFocusable>

              <View style={dynamicStyles.profileMenuDivider} />
              <TvFocusable onPress={() => router.push('/select-profile')} isTVSelectable={true} accessibilityLabel="Manage profiles" style={({ focused }: any) => [dynamicStyles.profileMenuManage, focused ? dynamicStyles.profileMenuItemFocused : null]}>
                <Ionicons name="people-outline" size={s(18)} color="#fff" />
                <Text style={dynamicStyles.profileMenuManageText}>Manage profiles</Text>
              </TvFocusable>
            </ScrollView>
          </TvGlassPanel>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({});