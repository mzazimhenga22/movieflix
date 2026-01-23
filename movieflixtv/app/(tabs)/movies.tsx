import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ResizeMode, Video } from 'expo-av';
import * as Device from 'expo-device';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, Image, Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { firestore } from '../../constants/firebase';
import { getAccentFromPosterPath } from '../../constants/theme';
import { useUser } from '../../hooks/use-user';
import type { Media } from '../../types';
import { useTvAccent } from '../components/TvAccentContext';
import TvGlassPanel from '../components/TvGlassPanel';
import TvHeroBanner from '../components/TvHeroBanner';
import TvRail from '../components/TvRail';
import { TvFocusable } from '../components/TvSpatialNavigation';
import { useMoviesData } from './movies/hooks/useMoviesData';
import { shuffleArray } from './movies/utils/constants';

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
  const { height: windowHeight } = useWindowDimensions();
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

  // Load profile on mount, only reset profileReady on first load
  const hasLoadedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      // Only set profileReady to false on initial load, not on every focus
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

  const applyTabFilter = useCallback(
    (items: Media[]): Media[] => {
      const wantType = tabMode.type;
      const wantGenre = tabMode.genreId;
      return (items || []).filter((item) => {
        const itemType = ((item as any)?.media_type ?? (item?.title ? 'movie' : item?.name ? 'tv' : 'movie')) as
          | 'movie'
          | 'tv';
        if (wantType !== 'all' && itemType !== wantType) return false;
        if (wantGenre) {
          const ids = ((item as any)?.genre_ids || []) as number[];
          if (!ids.includes(wantGenre)) return false;
        }
        return true;
      });
    },
    [tabMode.genreId, tabMode.type],
  );

  const tabTrending = useMemo(() => {
    const base = tabMode.type === 'movie' ? trendingMoviesOnly : tabMode.type === 'tv' ? trendingTvOnly : trending;
    return applyTabFilter(base);
  }, [applyTabFilter, tabMode.type, trending, trendingMoviesOnly, trendingTvOnly]);

  const tabRecommended = useMemo(() => {
    const base = tabMode.type === 'tv' ? recommendedTv : recommended;
    return applyTabFilter(base);
  }, [applyTabFilter, recommended, recommendedTv, tabMode.type]);

  const tabNetflix = useMemo(() => {
    const base = tabMode.type === 'tv' ? netflixTv : netflix;
    return applyTabFilter(base);
  }, [applyTabFilter, netflix, netflixTv, tabMode.type]);

  const tabAmazon = useMemo(() => {
    const base = tabMode.type === 'tv' ? amazonTv : amazon;
    return applyTabFilter(base);
  }, [applyTabFilter, amazon, amazonTv, tabMode.type]);

  const tabHbo = useMemo(() => {
    const base = tabMode.type === 'tv' ? hboTv : hbo;
    return applyTabFilter(base);
  }, [applyTabFilter, hbo, hboTv, tabMode.type]);

  const tabOnTheAir = useMemo(() => {
    if (tabMode.type !== 'tv') return [] as Media[];
    return applyTabFilter(tvOnTheAir);
  }, [applyTabFilter, tabMode.type, tvOnTheAir]);

  const tabFeatured = useMemo(() => tabTrending[0] ?? null, [tabTrending]);

  const [heroItem, setHeroItem] = useState<Media | null>(null);
  useEffect(() => {
    setHeroItem(null);
  }, [profile?.id, topTab]);
  useEffect(() => {
    if (!heroItem && (tabFeatured ?? featuredMovie)) setHeroItem(tabFeatured ?? featuredMovie);
  }, [featuredMovie, heroItem, tabFeatured]);

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
    const raw = Math.round(windowHeight * 0.58);
    return Math.min(590, Math.max(420, raw));
  }, [windowHeight]);

  const primaryTarget = heroItem ?? tabFeatured ?? lastWatched ?? featuredMovie;

  const lowEndDevice = useMemo(() => {
    const mem = typeof Device.totalMemory === 'number' ? Device.totalMemory : null;
    const year = typeof Device.deviceYearClass === 'number' ? Device.deviceYearClass : null;
    if (typeof mem === 'number' && mem > 0 && mem < 3_000_000_000) return true;
    if (typeof year === 'number' && year > 0 && year < 2017) return true;
    return false;
  }, []);

  const sideTrailers = useMemo(() => {
    const base = tabMode.type === 'movie' && movieTrailers?.length ? movieTrailers : tabTrending;
    return base.slice(0, 3);
  }, [movieTrailers, tabMode.type, tabTrending]);
  const sideContinue = useMemo(() => continueWatching.slice(0, 3), [continueWatching]);

  const [activeSideTrailerKey, setActiveSideTrailerKey] = useState<string | null>(null);

  const handleCardFocus = useCallback(
    (item: Media) => {
      if (heroFocusTimerRef.current) clearTimeout(heroFocusTimerRef.current);
      heroFocusTimerRef.current = setTimeout(() => {
        setHeroItem((prev) => {
          const prevType = prev?.media_type ?? 'movie';
          const nextType = item?.media_type ?? 'movie';
          if (prev?.id === item?.id && prevType === nextType) return prev;
          return item;
        });
      }, 160);
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

  if (!profileReady || loading) {
    return (
      <View style={styles.loadingWrap}>
        <LinearGradient
          colors={['#0a0a0a', '#050505', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator color="#e50914" size="large" />
        <Text style={styles.loadingText}>Loading your home…</Text>
      </View>
    );
  }

  if (error && !hasCachedContent) {
    return (
      <View style={styles.loadingWrap}>
        <LinearGradient
          colors={['#0a0a0a', '#050505', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.errorTitle}>Couldn’t load</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TvFocusable onPress={() => router.replace('/(tabs)/movies')} style={({ focused }: any) => [styles.primaryBtn, focused ? styles.primaryBtnFocused : null]} isTVSelectable={true} accessibilityLabel="Try again">
          <Text style={styles.primaryText}>Try again</Text>
        </TvFocusable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[accent, '#0a0a0a', '#000000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.shell}>
        <TvGlassPanel accent={accent} style={styles.panel}>
          <View style={styles.panelInner}>
            <View style={styles.topBar}>
              {offline ? (
                <View style={styles.offlinePill}>
                  <Ionicons name="cloud-offline" size={14} color="rgba(255,255,255,0.86)" />
                  <Text style={styles.offlineText}>Offline</Text>
                </View>
              ) : null}
              <TvFocusable
                onPress={() => router.push('/(tabs)/search')}
                tvPreferredFocus
                isTVSelectable={true}
                accessibilityLabel="Search"
                style={({ focused }: any) => [styles.searchPill, focused ? styles.pillFocused : null]}
              >
                <Ionicons name="search" size={16} color="rgba(255,255,255,0.86)" />
                <Text style={styles.searchText} numberOfLines={1}>
                  {tabMode.type === 'tv' ? 'Search series' : tabMode.type === 'all' ? 'Search' : 'Search movies'}
                </Text>
              </TvFocusable>

              <View style={styles.topTabs}>
                {(['Movies', 'TV Series', 'My List', 'Animation', 'More'] as const).map((label) => {
                  const active = topTab === label;
                  return (
                    <TvFocusable
                      key={label}
                      onPress={() => setTopTab(label)}
                      isTVSelectable={true}
                      accessibilityLabel={label}
                      style={({ focused }: any) => [
                        styles.topTab,
                        active ? styles.topTabActive : null,
                        focused ? styles.pillFocused : null,
                      ]}
                    >
                      <Text style={[styles.topTabText, active ? styles.topTabTextActive : null]}>{label}</Text>
                    </TvFocusable>
                  );
                })}
              </View>

              <TvFocusable
                onPress={() => {
                  if (!profiles.length) {
                    router.push('/select-profile');
                    return;
                  }
                  setProfileMenuOpen((v) => !v);
                }}
                isTVSelectable={true}
                accessibilityLabel="Profile"
                style={({ focused }: any) => [styles.profilePill, focused ? styles.pillFocused : null]}
              >
                <View
                  style={[
                    styles.profileDot,
                    { backgroundColor: String(profile?.avatarColor || accent || '#e50914') + 'AA' },
                  ]}
                />
                <Text style={styles.profileText} numberOfLines={1}>
                  {profile?.name ?? 'Guest'}
                </Text>
                <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.72)" />
              </TvFocusable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <View style={styles.mainRow}>
                <View style={styles.leftCol}>
                  <Text style={styles.sideTitle}>New Trailer</Text>
                  {sideTrailers.map((m) => {
                    const title = m.title || m.name || 'Trailer';
                    const key = `${m.media_type ?? 'movie'}:${m.id ?? title}`;
                    const uri = m.backdrop_path || m.poster_path ? `https://image.tmdb.org/t/p/w500${m.backdrop_path || m.poster_path}` : null;
                    const shouldAutoPlay = !lowEndDevice && !!(m as any)?.trailerUrl;
                    const active = shouldAutoPlay && activeSideTrailerKey === key;
                    return (
                      <TvFocusable
                        key={key}
                        onPress={() => handleCardPress(m)}
                        onFocus={() => setActiveSideTrailerKey(key)}
                        onBlur={() => {
                          setActiveSideTrailerKey((prev) => (prev === key ? null : prev));
                        }}
                        isTVSelectable={true}
                        accessibilityLabel={title}
                        style={({ focused }: any) => [styles.sideItem, focused ? styles.sideItemFocused : null]}
                      >
                        {active && (m as any)?.trailerUrl ? (
                          <Video
                            source={{ uri: String((m as any).trailerUrl) }}
                            style={styles.sideImage}
                            resizeMode={ResizeMode.COVER}
                            shouldPlay
                            isLooping
                            isMuted
                            useNativeControls={false}
                          />
                        ) : uri ? (
                          <Image source={{ uri }} style={styles.sideImage} resizeMode="cover" />
                        ) : (
                          <View style={styles.sideImageFallback} />
                        )}
                        <View style={styles.sideOverlay} />
                        <View style={styles.sideMeta}>
                          <Text style={styles.sideItemTitle} numberOfLines={1}>
                            {title}
                          </Text>
                          <View style={styles.sidePlay}>
                            <Ionicons name="play" size={14} color="#fff" />
                          </View>
                        </View>
                      </TvFocusable>
                    );
                  })}

                  <View style={styles.sideDivider} />

                  <Text style={styles.sideTitle}>Continue Watching</Text>
                  {sideContinue.length ? (
                    sideContinue.map((m) => (
                      <TvFocusable
                        key={`cw-${m.id ?? m.title ?? 'x'}`}
                        onPress={() => handleCardPress(m)}
                        isTVSelectable={true}
                        accessibilityLabel={m.title || m.name || 'Continue watching'}
                        style={({ focused }: any) => [styles.continueRow, focused ? styles.continueRowFocused : null]}
                      >
                        <Text style={styles.continueTitle} numberOfLines={1}>
                          {m.title || m.name || 'Untitled'}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
                      </TvFocusable>
                    ))
                  ) : (
                    <Text style={styles.sideHint}>Play something to see it here.</Text>
                  )}
                </View>

                <View style={styles.heroCol}>
                  <TvHeroBanner
                    variant="panel"
                    profileName={profile?.name}
                    accent={accent}
                    item={heroItem}
                    height={heroHeight}
                    trailerUrl={null}
                    primaryLabel={heroItem?.id === lastWatched?.id ? 'Resume' : 'Watch'}
                    secondaryLabel="Download"
                    tertiaryLabel="More"
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

              {/* My List Tab - show user's saved content */}
              {tabMode.type === 'mylist' ? (
                myList.length > 0 ? (
                  <TvRail
                    title="My List"
                    items={myList}
                    cardWidth={200}
                    onPressItem={handleCardPress}
                    onFocusItem={handleCardFocus}
                  />
                ) : (
                  <View style={styles.emptyMyList}>
                    <Ionicons name="bookmark-outline" size={48} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.emptyMyListTitle}>Your list is empty</Text>
                    <Text style={styles.emptyMyListText}>Add movies and shows to your list to watch later</Text>
                    <TvFocusable
                      onPress={() => setTopTab('Movies')}
                      tvPreferredFocus
                      isTVSelectable={true}
                      accessibilityLabel="Browse Movies"
                      style={({ focused }: any) => [styles.emptyMyListBtn, focused && styles.emptyMyListBtnFocused]}
                    >
                      <Ionicons name="film-outline" size={18} color="#fff" />
                      <Text style={styles.emptyMyListBtnText}>Browse Movies</Text>
                    </TvFocusable>
                  </View>
                )
              ) : (
                <>
                  <TvRail
                    title="You might like"
                    items={tabRecommended}
                    cardWidth={176}
                    onPressItem={handleCardPress}
                    onFocusItem={handleCardFocus}
                  />
                  <TvRail
                    title={tabMode.type === 'tv' ? 'Trending series' : tabMode.genreId ? 'Trending picks' : 'Trending'}
                    items={tabTrending}
                    cardWidth={176}
                    onPressItem={handleCardPress}
                    onFocusItem={handleCardFocus}
                  />
                  {tabMode.type === 'tv' ? (
                    <TvRail
                      title="On the air"
                      items={tabOnTheAir}
                      cardWidth={168}
                      onPressItem={handleCardPress}
                      onFocusItem={handleCardFocus}
                    />
                  ) : null}
                  <TvRail title="Netflix" items={tabNetflix} cardWidth={168} onPressItem={handleCardPress} onFocusItem={handleCardFocus} />
                  <TvRail title="Amazon" items={tabAmazon} cardWidth={168} onPressItem={handleCardPress} onFocusItem={handleCardFocus} />
                  <TvRail title="HBO" items={tabHbo} cardWidth={168} onPressItem={handleCardPress} onFocusItem={handleCardFocus} />

                  {/* Songs of the Moment - Movie soundtracks */}
                  {songs.length > 0 && tabMode.type === 'movie' && (
                    <TvRail
                      title="Songs of the Moment"
                      items={songs.slice(0, 15)}
                      cardWidth={168}
                      onPressItem={handleCardPress}
                      onFocusItem={handleCardFocus}
                    />
                  )}

                  {/* Continue Watching - show if user has history */}
                  {continueWatching.length > 0 && (
                    <TvRail
                      title="Continue Watching"
                      items={continueWatching}
                      cardWidth={200}
                      onPressItem={handleCardPress}
                      onFocusItem={handleCardFocus}
                    />
                  )}

                  {/* Additional genre-based rails based on tab */}
                  {tabMode.type === 'movie' && trendingMoviesOnly.length > 0 && (
                    <TvRail
                      title="Popular Movies"
                      items={shuffleArray([...trendingMoviesOnly]).slice(0, 15)}
                      cardWidth={168}
                      onPressItem={handleCardPress}
                      onFocusItem={handleCardFocus}
                    />
                  )}
                  {tabMode.type === 'tv' && trendingTvOnly.length > 0 && (
                    <TvRail
                      title="Binge-Worthy Series"
                      items={shuffleArray([...trendingTvOnly]).slice(0, 15)}
                      cardWidth={168}
                      onPressItem={handleCardPress}
                      onFocusItem={handleCardFocus}
                    />
                  )}
                </>
              )}

              <View style={{ height: 28 }} />
            </ScrollView>
          </View>
        </TvGlassPanel>
      </View>

      <Modal
        visible={profileMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileMenuOpen(false)}
      >
        <View style={styles.profileMenuBackdrop}>
          <TvGlassPanel accent={accent} style={styles.profileMenuPanel}>
            <View style={styles.profileMenuHeader}>
              <Text style={styles.profileMenuTitle}>Switch profile</Text>
              <TvFocusable onPress={() => setProfileMenuOpen(false)} style={({ focused }: any) => [styles.profileMenuClose, focused && styles.profileMenuCloseFocused]} isTVSelectable={true} accessibilityLabel="Close">
                <Ionicons name="close" size={18} color="#fff" />
                <Text style={styles.profileMenuCloseText}>Close</Text>
              </TvFocusable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.profileMenuList}>
              {profiles.map((p) => {
                const selected = Boolean(profile?.id && String(profile.id) === String(p.id));
                return (
                  <TvFocusable
                    key={p.id}
                    tvPreferredFocus={selected}
                    onPress={() => void selectProfile(p)}
                    isTVSelectable={true}
                    accessibilityLabel={p.name}
                    style={({ focused }: any) => [
                      styles.profileMenuItem,
                      selected ? styles.profileMenuItemSelected : null,
                      focused ? styles.profileMenuItemFocused : null,
                    ]}
                  >
                    <View style={[styles.profileMenuDot, { backgroundColor: p.avatarColor || '#e50914' }]} />
                    <Text style={styles.profileMenuName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {p.isKids ? <Text style={styles.profileMenuKids}>Kids</Text> : null}
                    {selected ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
                  </TvFocusable>
                );
              })}

              <View style={styles.profileMenuDivider} />
              <TvFocusable
                onPress={toggleFlixy}
                isTVSelectable={true}
                accessibilityLabel="Toggle Flixy"
                style={({ focused }: any) => [styles.profileMenuManage, focused ? styles.profileMenuItemFocused : null]}
              >
                <Ionicons name={flixyEnabled ? 'happy' : 'happy-outline'} size={18} color={flixyEnabled ? '#e50914' : '#fff'} />
                <Text style={styles.profileMenuManageText}>
                  {flixyEnabled ? 'Hide Flixy Assistant' : 'Show Flixy Assistant'}
                </Text>
                <View style={{ flex: 1 }} />
                <Ionicons
                  name={flixyEnabled ? 'toggle' : 'toggle-outline'}
                  size={22}
                  color={flixyEnabled ? '#e50914' : 'rgba(255,255,255,0.4)'}
                />
              </TvFocusable>

              <View style={styles.profileMenuDivider} />
              <TvFocusable onPress={() => router.push('/select-profile')} isTVSelectable={true} accessibilityLabel="Manage profiles" style={({ focused }: any) => [styles.profileMenuManage, focused ? styles.profileMenuItemFocused : null]}>
                <Ionicons name="people-outline" size={18} color="#fff" />
                <Text style={styles.profileMenuManageText}>Manage profiles</Text>
              </TvFocusable>
            </ScrollView>
          </TvGlassPanel>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030408' },
  shell: {
    flex: 1,
    paddingLeft: 108,
    paddingRight: 40,
    paddingTop: 28,
    paddingBottom: 28,
    alignItems: 'center',
  },
  panel: {
    flex: 1,
    width: '100%',
    maxWidth: 1560,
  },
  panelInner: {
    flex: 1,
    padding: 22,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 8,
    paddingBottom: 18,
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    height: 46,
    borderRadius: 999,
    backgroundColor: 'rgba(8,10,20,0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  offlineText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '900',
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    height: 46,
    borderRadius: 999,
    backgroundColor: 'rgba(8,10,20,0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    minWidth: 220,
  },
  searchText: { color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: '800' },
  topTabs: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  topTab: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  topTabActive: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.22)' },
  topTabText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '900' },
  topTabTextActive: { color: '#fff' },
  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 46,
    borderRadius: 999,
    backgroundColor: 'rgba(8,10,20,0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    maxWidth: 260,
  },
  profileDot: { width: 20, height: 20, borderRadius: 99 },
  profileText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '900' },
  pillFocused: {
    transform: [{ scale: 1.06 }],
    borderColor: '#fff',
    borderWidth: 2.5,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
  },

  profileMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 84,
    paddingRight: 42,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  profileMenuPanel: {
    width: 360,
    maxHeight: 520,
    borderRadius: 24,
    overflow: 'hidden',
  },
  profileMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  profileMenuTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  profileMenuClose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  profileMenuCloseText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  profileMenuCloseFocused: {
    transform: [{ scale: 1.08 }],
    borderColor: '#fff',
    borderWidth: 2,
    backgroundColor: 'rgba(229,9,20,0.6)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  profileMenuList: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  profileMenuItem: {
    height: 46,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    shadowRadius: 8,
  },
  profileMenuDot: { width: 22, height: 22, borderRadius: 999 },
  profileMenuName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '900' },
  profileMenuKids: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '900' },
  profileMenuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginVertical: 6 },
  profileMenuManage: {
    height: 46,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  profileMenuManageText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  scrollContent: { paddingTop: 4, paddingBottom: 10 },
  mainRow: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  leftCol: {
    width: 320,
    borderRadius: 26,
    padding: 14,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  heroCol: { flex: 1 },
  sideTitle: { color: '#fff', fontSize: 14, fontWeight: '900', marginBottom: 10 },
  sideItem: {
    height: 92,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  sideItemFocused: {
    transform: [{ scale: 1.04 }],
    borderColor: '#fff',
    borderWidth: 2,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  sideImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  sideImageFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.08)' },
  sideOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.40)' },
  sideMeta: {
    flex: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sideItemTitle: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '900' },
  sidePlay: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  sideDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginVertical: 12 },
  continueRow: {
    height: 44,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: 10,
  },
  continueRowFocused: {
    transform: [{ scale: 1.04 }],
    borderColor: '#fff',
    borderWidth: 2,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  continueTitle: { flex: 1, color: 'rgba(255,255,255,0.86)', fontSize: 12, fontWeight: '900' },
  sideHint: { color: 'rgba(255,255,255,0.60)', fontSize: 12, fontWeight: '800' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '800', marginTop: 12 },
  errorTitle: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 8 },
  errorText: { color: 'rgba(255,255,255,0.75)', fontSize: 16, marginBottom: 18 },
  primaryBtn: { backgroundColor: '#e50914', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  primaryBtnFocused: {
    transform: [{ scale: 1.08 }],
    borderColor: '#fff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  emptyMyList: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyMyListTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },
  emptyMyListText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 300,
  },
  emptyMyListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
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
    shadowRadius: 12,
    elevation: 10,
  },
  emptyMyListBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
});
