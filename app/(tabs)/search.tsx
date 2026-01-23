// app/(tabs)/search.tsx  (SearchScreen - Premium Redesign)
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ScreenWrapper from '../../components/ScreenWrapper';
import { API_BASE_URL, API_KEY } from '../../constants/api';
import { firestore } from '../../constants/firebase';
import { getAccentFromPosterPath } from '../../constants/theme';
import { useActiveProfile } from '../../hooks/use-active-profile';
import { filterForKidsMedia } from '../../lib/kidsContent';
import { usePStream } from '../../src/pstream/usePStream';
import { Media } from '../../types';
import { useAccent } from '../components/AccentContext';
import ParticleSystem from '../components/effects/ParticleSystem';
import ResultCard3D from '../components/search/ResultCard3D';
import TrendingChips from '../components/search/TrendingChips';
import VoiceSearchOrb from '../components/search/VoiceSearchOrb';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RED_ACCENT = '#e50914';

type SearchTab = 'movies' | 'social' | 'messages' | 'music';

const TAB_CONFIG = {
  movies: { icon: 'film', label: 'Movies & TV', gradient: ['#e50914', '#ff6b6b'] },
  music: { icon: 'musical-notes', label: 'Music', gradient: ['#1DB954', '#4ade80'] },
  social: { icon: 'people', label: 'Social', gradient: ['#7C3AED', '#a855f7'] },
  messages: { icon: 'chatbubbles', label: 'Messages', gradient: ['#3B82F6', '#60a5fa'] },
} as const;

const TRENDING_ITEMS = [
  { id: '1', label: 'Dune', icon: 'planet', isHot: true },
  { id: '2', label: 'Arcane', icon: 'game-controller' },
  { id: '3', label: 'Marvel', icon: 'flash', isHot: true },
  { id: '4', label: 'Thriller', icon: 'skull' },
  { id: '5', label: 'K-Drama', icon: 'heart' },
  { id: '6', label: 'Anime', icon: 'sparkles' },
];

/**
 * Optimized header component to prevent re-renders of the input/tabs
 */
const SearchStickyHeader = memo(({
  searchQuery,
  setSearchQuery,
  activeTab,
  setActiveTab,
  accentColor,
  onClear,
  onVoiceSearch,
  isVoiceListening,
  onBack
}: {
  searchQuery: string;
  setSearchQuery: (t: string) => void;
  activeTab: SearchTab;
  setActiveTab: (t: SearchTab) => void;
  accentColor: string;
  onClear: () => void;
  onVoiceSearch: () => void;
  isVoiceListening: boolean;
  onBack: () => void;
}) => {
  const insets = useSafeAreaInsets();

  // Reanimated values for micro-interactions
  const tabIndicatorX = useSharedValue(0);

  useEffect(() => {
    const tabIndex = Object.keys(TAB_CONFIG).indexOf(activeTab);
    const tabWidth = (SCREEN_WIDTH - 32) / 4;
    tabIndicatorX.value = withSpring(tabIndex * tabWidth, { damping: 15, stiffness: 100 });
  }, [activeTab]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorX.value }]
  }));

  return (
    <View style={[styles.stickyHeader, { paddingTop: insets.top }]}>
      {/* Header Top Row */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.7}
        >
          <BlurView intensity={40} tint="dark" style={styles.backBtnBlur}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </BlurView>
        </TouchableOpacity>

        <View style={styles.heroText}>
          <Text style={styles.heroEyebrow}>✨ Discover Magic</Text>
          <Text style={styles.heroTitle}>Search</Text>
        </View>

        <VoiceSearchOrb
          onPress={onVoiceSearch}
          isListening={isVoiceListening}
          size={42}
          accentColor={accentColor}
        />
      </Animated.View>

      {/* Search Input */}
      <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.searchContainer}>
        <BlurView intensity={50} tint="dark" style={styles.searchBlur}>
          <LinearGradient
            colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.03)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.searchGradient}
          >
            <Ionicons name="search" size={20} color="rgba(255,255,255,0.6)" />
            <TextInput
              placeholder={
                activeTab === 'movies'
                  ? 'Search movies, TV shows, actors...'
                  : activeTab === 'social'
                    ? 'Search feeds, notifications...'
                    : activeTab === 'messages'
                      ? 'Search messages, users...'
                      : 'Search songs, artists...'
              }
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={onClear} style={styles.clearBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <View style={styles.clearBtnInner}>
                  <Ionicons name="close" size={14} color="#fff" />
                </View>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </BlurView>
      </Animated.View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <Animated.View
          style={[
            styles.tabIndicator,
            { backgroundColor: accentColor },
            indicatorStyle
          ]}
        />
        {(Object.keys(TAB_CONFIG) as SearchTab[]).map((tab) => {
          const config = TAB_CONFIG[tab];
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={styles.tab}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={config.icon as any}
                size={18}
                color={isActive ? '#fff' : 'rgba(255,255,255,0.5)'}
              />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {config.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

/**
 * Empty / Loading / Idle State
 */
const SearchStateView = memo(({
  loading,
  activeTab,
  searchQuery,
  hasResults,
  accentColor
}: {
  loading: boolean;
  activeTab: SearchTab;
  searchQuery: string;
  hasResults: boolean;
  accentColor: string;
}) => {
  if (loading) {
    return (
      <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.loadingContainer}>
        <View style={styles.loadingOrb}>
          <ActivityIndicator size="large" color={accentColor} />
        </View>
        <Text style={styles.loadingText}>Searching the universe...</Text>
      </Animated.View>
    );
  }

  if (hasResults) return null;

  // Empty State (No results found)
  if (searchQuery.length > 2) {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Ionicons
            name={
              activeTab === 'music' ? 'musical-notes-outline' :
                activeTab === 'social' ? 'people-outline' :
                  activeTab === 'messages' ? 'chatbubble-outline' :
                    'search-outline'
            }
            size={48}
            color={accentColor + '80'}
          />
        </View>
        <Text style={styles.emptyTitle}>
          {activeTab === 'music' ? 'No songs found' : 'No results found'}
        </Text>
        <Text style={styles.emptySubtitle}>
          Try a different search term or check spelling
        </Text>
      </Animated.View>
    );
  }

  // Idle State (Start searching)
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.idleState}>
      <View style={styles.idleIconContainer}>
        <LinearGradient
          colors={[accentColor + '40', 'transparent']}
          style={styles.idleOrb}
        />
        <Ionicons
          name={
            activeTab === 'music' ? 'headset-outline' :
              activeTab === 'social' ? 'globe-outline' :
                activeTab === 'messages' ? 'mail-outline' :
                  'film-outline'
          }
          size={56}
          color="rgba(255,255,255,0.3)"
        />
      </View>
      <Text style={styles.idleTitle}>
        {activeTab === 'music' ? 'Discover music' :
          activeTab === 'social' ? 'Connect with friends' :
            activeTab === 'messages' ? 'Find conversations' :
              'Ready to explore?'}
      </Text>
      <Text style={styles.idleSubtitle}>
        {activeTab === 'music' ? 'Search millions of tracks' :
          activeTab === 'social' ? 'Search social content' :
            activeTab === 'messages' ? 'Search messages and users' :
              'Search for movies, TV shows, and more'}
      </Text>
    </Animated.View>
  );
});

const SocialItem = memo(({ item }: { item: any }) => (
  <TouchableOpacity activeOpacity={0.85} style={{ marginBottom: 12 }}>
    <BlurView intensity={25} tint="dark" style={styles.socialCard}>
      <LinearGradient
        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
        style={styles.socialGradient}
      >
        <View
          style={[
            styles.socialIcon,
            {
              backgroundColor:
                item.type === 'story'
                  ? '#e50914'
                  : item.type === 'notification'
                    ? '#ffc107'
                    : '#7C3AED',
            },
          ]}
        >
          <Ionicons
            name={
              item.type === 'story'
                ? 'images'
                : item.type === 'notification'
                  ? 'notifications'
                  : 'trophy'
            }
            size={18}
            color="#fff"
          />
        </View>
        <View style={styles.socialContent}>
          <Text style={styles.socialTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.socialType}>{item.type}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
      </LinearGradient>
    </BlurView>
  </TouchableOpacity>
));

/**
 * Main Screen Component
 */
const SearchScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeProfile = useActiveProfile();
  const isKidsProfile = Boolean(activeProfile?.isKids);

  const params = useLocalSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>((params.tab as SearchTab) || 'movies');

  const { searchMusic } = usePStream();
  const { setAccentColor } = useAccent();

  // Results State
  const [musicResults, setMusicResults] = useState<Media[]>([]);
  const [movieResults, setMovieResults] = useState<Media[]>([]);
  const [tvResults, setTvResults] = useState<Media[]>([]);
  const [socialResults, setSocialResults] = useState<any[]>([]);
  const [messageResults, setMessageResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);

  // Refs for debouncing and aborting
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const moviesAbortRef = useRef<AbortController | null>(null);

  /** SEARCH LOGIC */
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (moviesAbortRef.current) {
      moviesAbortRef.current.abort();
      moviesAbortRef.current = null;
    }

    if (searchQuery.length <= 2) {
      requestIdRef.current += 1;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLoading(false);

      // Clear all results
      if (movieResults.length) setMovieResults([]);
      if (tvResults.length) setTvResults([]);
      if (socialResults.length) setSocialResults([]);
      if (messageResults.length) setMessageResults([]);
      if (musicResults.length) setMusicResults([]);
      return;
    }

    setLoading(true);
    const requestId = (requestIdRef.current += 1);

    const searchMovies = async () => {
      const controller = new AbortController();
      moviesAbortRef.current = controller;
      try {
        const q = encodeURIComponent(searchQuery);
        const [movieRes, tvRes] = await Promise.all([
          fetch(
            `${API_BASE_URL}/search/movie?api_key=${API_KEY}&query=${q}${isKidsProfile ? '&include_adult=false' : ''}`,
            { signal: controller.signal }
          ),
          fetch(
            `${API_BASE_URL}/search/tv?api_key=${API_KEY}&query=${q}${isKidsProfile ? '&include_adult=false' : ''}`,
            { signal: controller.signal }
          ),
        ]);

        const movieData = movieRes.ok ? await movieRes.json() : { results: [] };
        const tvData = tvRes.ok ? await tvRes.json() : { results: [] };

        if (requestId !== requestIdRef.current) return;

        const movies = (movieData.results || []).map((m: any) => ({
          ...m,
          media_type: 'movie',
          title: m.title ?? m.original_title ?? '',
          release_date: m.release_date ?? null,
        }));

        const tvs = (tvData.results || []).map((t: any) => ({
          ...t,
          media_type: 'tv',
          title: t.name ?? t.original_name ?? '',
          release_date: t.first_air_date ?? null,
        }));

        const moviesFiltered = filterForKidsMedia(
          movies.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0)),
          isKidsProfile
        );
        const tvFiltered = filterForKidsMedia(
          tvs.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0)),
          isKidsProfile
        );

        setMovieResults(moviesFiltered);
        setTvResults(tvFiltered);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.warn('Movie search error', err);
        if (requestId === requestIdRef.current) {
          setMovieResults([]);
          setTvResults([]);
        }
      } finally {
        if (moviesAbortRef.current === controller) {
          moviesAbortRef.current = null;
        }
      }
    };

    const searchSocial = async () => {
      try {
        const [storiesQuery, notificationsQuery, streaksQuery] = await Promise.all([
          getDocs(query(collection(firestore, 'stories'), orderBy('createdAt', 'desc'), limit(50))),
          getDocs(query(collection(firestore, 'notifications'), orderBy('createdAt', 'desc'), limit(50))),
          getDocs(query(collection(firestore, 'streaks'), orderBy('createdAt', 'desc'), limit(50))),
        ]);

        const stories = storiesQuery.docs.map((doc: any) => ({
          id: doc.id,
          type: 'story',
          ...doc.data(),
          title: doc.data().caption || 'Story',
        }));

        const notifications = notificationsQuery.docs.map((doc: any) => ({
          id: doc.id,
          type: 'notification',
          ...doc.data(),
          title: doc.data().message || 'Notification',
        }));

        const streaks = streaksQuery.docs.map((doc: any) => ({
          id: doc.id,
          type: 'streak',
          ...doc.data(),
          title: `Streak with ${doc.data().partnerName || 'Friend'}`,
        }));

        const results = [...stories, ...notifications, ...streaks].filter(
          (item: any) =>
            item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.message?.toLowerCase().includes(searchQuery.toLowerCase())
        );

        if (requestId === requestIdRef.current) {
          setSocialResults(results);
        }
      } catch (err) {
        if (requestId === requestIdRef.current) setSocialResults([]);
      }
    };

    const searchMessages = async () => {
      try {
        const [messagesQuery, usersQuery] = await Promise.all([
          getDocs(query(collection(firestore, 'messages'), orderBy('createdAt', 'desc'), limit(100))),
          getDocs(query(collection(firestore, 'users'), limit(200))),
        ]);

        const messages = messagesQuery.docs.map((doc: any) => ({
          id: doc.id,
          type: 'message',
          ...doc.data(),
          title: doc.data().text || 'Message',
        }));

        const users = usersQuery.docs.map((doc: any) => ({
          id: doc.id,
          type: 'user',
          ...doc.data(),
          title: doc.data().displayName || doc.data().name || 'User',
          email: doc.data().email || '',
        }));

        const results = [
          ...messages.filter((item: any) =>
            item.text?.toLowerCase().includes(searchQuery.toLowerCase())
          ),
          ...users.filter(
            (item: any) =>
              item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              item.email?.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        ];

        if (requestId === requestIdRef.current) {
          setMessageResults(results);
        }
      } catch (err) {
        if (requestId === requestIdRef.current) setMessageResults([]);
      }
    };

    const searchMusicData = async () => {
      try {
        const results = await searchMusic(searchQuery);
        if (requestId === requestIdRef.current) {
          const adapted: Media[] = (results || []).map((item: any) => ({
            id: item.videoId,
            videoId: item.videoId,
            title: item.title,
            poster_path: item.thumbnail,
            media_type: 'music',
            overview: item.artist,
          }));
          setMusicResults(adapted);
        }
      } catch (err) {
        if (requestId === requestIdRef.current) setMusicResults([]);
      }
    };

    debounceRef.current = setTimeout(() => {
      const run = async () => {
        try {
          if (activeTab === 'movies') await searchMovies();
          else if (activeTab === 'social') await searchSocial();
          else if (activeTab === 'messages') await searchMessages();
          else if (activeTab === 'music') await searchMusicData();
        } finally {
          if (requestId === requestIdRef.current) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setLoading(false);
          }
        }
      };
      void run();
    }, 400); // Slightly increased debounce

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [searchQuery, activeTab, isKidsProfile]);

  /** DERIVED STATE */
  const combinedResults = useMemo(() => {
    return [...movieResults, ...tvResults].sort(
      (a: any, b: any) => (b.popularity || 0) - (a.popularity || 0)
    );
  }, [movieResults, tvResults]);

  const displayData = useMemo(() => {
    if (activeTab === 'movies') return combinedResults;
    if (activeTab === 'music') return musicResults;
    if (activeTab === 'social') return socialResults;
    if (activeTab === 'messages') return messageResults;
    return [];
  }, [activeTab, combinedResults, musicResults, socialResults, messageResults]);

  const hasResults = displayData.length > 0;

  // Header dynamic accent
  const accentColor = useMemo(() => {
    return (
      getAccentFromPosterPath(movieResults[0]?.poster_path || tvResults[0]?.poster_path) ??
      RED_ACCENT
    );
  }, [movieResults, tvResults]);

  useEffect(() => {
    setAccentColor(accentColor);
  }, [accentColor, setAccentColor]);

  /** ACTIONS */
  const clear = useCallback(() => setSearchQuery(''), []);
  const handleVoiceSearch = useCallback(() => setIsVoiceListening(p => !p), []);
  const handleTrendingPress = useCallback((item: { label: string }) => setSearchQuery(item.label), []);

  const handleMediaPress = useCallback((item: Media) => {
    Keyboard.dismiss();
    if (item.media_type === 'music') {
      router.push({
        pathname: '/(tabs)/music',
        params: {
          trackId: item.videoId || item.id?.toString(),
          mediaType: 'music',
          title: item.title || '',
          thumbnail: item.poster_path || '',
        },
      });
    } else {
      router.push({ pathname: '/details/[id]', params: { id: item.id.toString(), mediaType: item.media_type || 'movie' } });
    }
  }, [router]);

  /** RENDERS */
  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => {
    if (activeTab === 'social' || activeTab === 'messages') {
      return <SocialItem item={item} />;
    }
    return (
      <ResultCard3D
        item={item}
        index={index}
        onPress={() => handleMediaPress(item)}
        accentColor={accentColor}
      />
    );
  }, [activeTab, accentColor, handleMediaPress]);

  return (
    <ScreenWrapper disableTopInset>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {/* Animated Background */}
        <LinearGradient
          colors={[accentColor + '40', '#0a0a1a', '#05060f']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.gradient}
        />

        {/* Floating Particles */}
        <ParticleSystem
          particleCount={15}
          colors={[accentColor, '#fff', '#7B68EE']}
          type="sparkle"
          speed={0.5}
        />

        {/* Mesh gradient orbs */}
        <View style={styles.orbContainer} pointerEvents="none">
          <LinearGradient
            colors={[accentColor + '30', 'transparent']}
            style={[styles.meshOrb, styles.orbTopLeft]}
          />
          <LinearGradient
            colors={['#7B68EE30', 'transparent']}
            style={[styles.meshOrb, styles.orbBottomRight]}
          />
        </View>

        {/* Header */}
        <SearchStickyHeader
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          accentColor={accentColor}
          onClear={clear}
          onVoiceSearch={handleVoiceSearch}
          isVoiceListening={isVoiceListening}
          onBack={() => router.back()}
        />

        {/* Results List */}
        {hasResults && !loading ? (
          <View style={styles.flex}>
            <FlashList
              data={displayData}
              renderItem={renderItem}
              estimatedItemSize={280}
              numColumns={activeTab === 'social' || activeTab === 'messages' ? 1 : 2}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingTop: 10,
                paddingBottom: insets.bottom + 100,
                paddingHorizontal: 16
              }}
              keyExtractor={(item: any) => `${item.id}-${item.media_type || item.type}`}
            />
          </View>
        ) : (
          <View style={styles.content}>
            {searchQuery.length <= 2 && activeTab === 'movies' && !loading && (
              <Animated.View entering={FadeIn.duration(500)}>
                <TrendingChips
                  items={TRENDING_ITEMS}
                  onPress={handleTrendingPress}
                  accentColor={accentColor}
                />
              </Animated.View>
            )}
            <SearchStateView
              loading={loading}
              activeTab={activeTab}
              searchQuery={searchQuery}
              hasResults={hasResults}
              accentColor={accentColor}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { ...StyleSheet.absoluteFillObject },

  // Mesh orbs
  orbContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  meshOrb: {
    padding: 150,
    borderRadius: 999,
    position: 'absolute',
    opacity: 0.6,
  },
  orbTopLeft: {
    top: -100,
    left: -100,
  },
  orbBottomRight: {
    bottom: -100,
    right: -100,
  },

  // Sticky Header
  stickyHeader: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(5,6,15,0.7)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  backBtnBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    alignItems: 'center',
  },
  heroEyebrow: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Search Bar
  searchContainer: {
    marginBottom: 20,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  searchBlur: {
    borderRadius: 24,
  },
  searchGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 52,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 10,
    height: '100%',
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 4,
    position: 'relative',
    height: 44,
  },
  tabIndicator: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    width: (SCREEN_WIDTH - 32) / 4 - 2, // Approximate width
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
  tabText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  loadingOrb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '500',
  },

  // Empty / Idle
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    fontSize: 14,
  },
  idleState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  idleIconContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  idleOrb: {
    width: 100,
    height: 100,
    borderRadius: 50,
    position: 'absolute',
  },
  idleTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  idleSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },

  // Social
  socialCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  socialGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  socialIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialContent: {
    flex: 1,
  },
  socialTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  socialType: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textTransform: 'capitalize',
  },
});

export default SearchScreen;
