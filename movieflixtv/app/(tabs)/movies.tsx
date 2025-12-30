import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { getAccentFromPosterPath } from '@/constants/theme';
import type { Media } from '@/types';
import { useTvAccent } from '../components/TvAccentContext';
import TvGlassPanel from '../components/TvGlassPanel';
import TvHeroBanner from '../components/TvHeroBanner';
import TvRail from '../components/TvRail';
import { useMoviesData } from './movies/hooks/useMoviesData';

type ActiveProfile = {
  id?: string | null;
  name?: string | null;
  isKids?: boolean;
};

export default function MoviesTv() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { setAccentColor } = useTvAccent();
  const [profile, setProfile] = useState<ActiveProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const heroFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [topTab, setTopTab] = useState<'Movies' | 'TV Series' | 'Animation' | 'Mystery' | 'More'>('Movies');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setProfileReady(false);
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
          if (alive) setProfileReady(true);
        });
      return () => {
        alive = false;
      };
    }, []),
  );

  const {
    trending,
    recommended,
    netflix,
    amazon,
    hbo,
    continueWatching,
    lastWatched,
    featuredMovie,
    loading,
    error,
  } = useMoviesData(
    (profile?.id ?? null) as string | null,
    Boolean(profile?.isKids),
    profileReady,
  );

  const [heroItem, setHeroItem] = useState<Media | null>(null);
  useEffect(() => {
    setHeroItem(null);
  }, [profile?.id]);
  useEffect(() => {
    if (!heroItem && featuredMovie) setHeroItem(featuredMovie);
  }, [featuredMovie, heroItem]);

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

  const primaryTarget = heroItem ?? lastWatched ?? featuredMovie;

  const sideTrailers = useMemo(() => trending.slice(0, 3), [trending]);
  const sideContinue = useMemo(() => continueWatching.slice(0, 3), [continueWatching]);

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
          colors={['#150a13', '#070815', '#05060f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator color="#e50914" size="large" />
        <Text style={styles.loadingText}>Loading your home…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingWrap}>
        <LinearGradient
          colors={['#150a13', '#070815', '#05060f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.errorTitle}>Couldn’t load</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => router.replace('/(tabs)/movies')} style={styles.primaryBtn}>
          <Text style={styles.primaryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[accent, '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.shell}>
        <TvGlassPanel accent={accent} style={styles.panel}>
          <View style={styles.panelInner}>
            <View style={styles.topBar}>
              <Pressable
                onPress={() => router.push('/(tabs)/search')}
                style={({ focused }: any) => [styles.searchPill, focused ? styles.pillFocused : null]}
              >
                <Ionicons name="search" size={16} color="rgba(255,255,255,0.86)" />
                <Text style={styles.searchText} numberOfLines={1}>
                  Search movies
                </Text>
              </Pressable>

              <View style={styles.topTabs}>
                {(['Movies', 'TV Series', 'Animation', 'Mystery', 'More'] as const).map((label) => {
                  const active = topTab === label;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => setTopTab(label)}
                      style={({ focused }: any) => [
                        styles.topTab,
                        active ? styles.topTabActive : null,
                        focused ? styles.pillFocused : null,
                      ]}
                    >
                      <Text style={[styles.topTabText, active ? styles.topTabTextActive : null]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.profilePill}>
                <View style={[styles.profileDot, { backgroundColor: `${accent}AA` }]} />
                <Text style={styles.profileText} numberOfLines={1}>
                  {profile?.name ?? 'Guest'}
                </Text>
                <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.72)" />
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <View style={styles.mainRow}>
                <View style={styles.leftCol}>
                  <Text style={styles.sideTitle}>New Trailer</Text>
                  {sideTrailers.map((m) => {
                    const title = m.title || m.name || 'Trailer';
                    const uri = m.backdrop_path || m.poster_path ? `https://image.tmdb.org/t/p/w500${m.backdrop_path || m.poster_path}` : null;
                    return (
                      <Pressable
                        key={`${m.id ?? title}`}
                        onPress={() => handleCardPress(m)}
                        style={({ focused }: any) => [styles.sideItem, focused ? styles.sideItemFocused : null]}
                      >
                        {uri ? <Image source={{ uri }} style={styles.sideImage} resizeMode="cover" /> : <View style={styles.sideImageFallback} />}
                        <View style={styles.sideOverlay} />
                        <View style={styles.sideMeta}>
                          <Text style={styles.sideItemTitle} numberOfLines={1}>
                            {title}
                          </Text>
                          <View style={styles.sidePlay}>
                            <Ionicons name="play" size={14} color="#fff" />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}

                  <View style={styles.sideDivider} />

                  <Text style={styles.sideTitle}>Continue Watching</Text>
                  {sideContinue.length ? (
                    sideContinue.map((m) => (
                      <Pressable
                        key={`cw-${m.id ?? m.title ?? 'x'}`}
                        onPress={() => handleCardPress(m)}
                        style={({ focused }: any) => [styles.continueRow, focused ? styles.continueRowFocused : null]}
                      >
                        <Text style={styles.continueTitle} numberOfLines={1}>
                          {m.title || m.name || 'Untitled'}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
                      </Pressable>
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

              <TvRail
                title="You might like"
                items={recommended}
                cardWidth={176}
                onPressItem={handleCardPress}
                onFocusItem={handleCardFocus}
              />
              <TvRail
                title="Trending"
                items={trending}
                cardWidth={176}
                onPressItem={handleCardPress}
                onFocusItem={handleCardFocus}
              />
              <TvRail title="Netflix" items={netflix} cardWidth={168} onPressItem={handleCardPress} onFocusItem={handleCardFocus} />
              <TvRail title="Amazon" items={amazon} cardWidth={168} onPressItem={handleCardPress} onFocusItem={handleCardFocus} />
              <TvRail title="HBO" items={hbo} cardWidth={168} onPressItem={handleCardPress} onFocusItem={handleCardFocus} />

              <View style={{ height: 28 }} />
            </ScrollView>
          </View>
        </TvGlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  shell: {
    flex: 1,
    paddingLeft: 0,
    paddingRight: 34,
    paddingTop: 22,
    paddingBottom: 22,
    alignItems: 'center',
  },
  panel: {
    flex: 1,
    width: '100%',
    maxWidth: 1520,
  },
  panelInner: {
    flex: 1,
    padding: 18,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 6,
    paddingBottom: 14,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    minWidth: 200,
  },
  searchText: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '800' },
  topTabs: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  topTab: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  topTabActive: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.18)' },
  topTabText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '900' },
  topTabTextActive: { color: '#fff' },
  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    maxWidth: 240,
  },
  profileDot: { width: 18, height: 18, borderRadius: 99 },
  profileText: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '900' },
  pillFocused: { transform: [{ scale: 1.03 }], borderColor: '#fff' },
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
  sideItemFocused: { transform: [{ scale: 1.02 }], borderColor: 'rgba(255,255,255,0.75)' },
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
  continueRowFocused: { transform: [{ scale: 1.02 }], borderColor: '#fff' },
  continueTitle: { flex: 1, color: 'rgba(255,255,255,0.86)', fontSize: 12, fontWeight: '900' },
  sideHint: { color: 'rgba(255,255,255,0.60)', fontSize: 12, fontWeight: '800' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '800', marginTop: 12 },
  errorTitle: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 8 },
  errorText: { color: 'rgba(255,255,255,0.75)', fontSize: 16, marginBottom: 18 },
  primaryBtn: { backgroundColor: '#e50914', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 16 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
