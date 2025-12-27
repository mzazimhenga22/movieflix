// app/(tabs)/search.tsx  (SearchScreen)
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MovieList from '../../components/MovieList';
import ScreenWrapper from '../../components/ScreenWrapper';
import Alert from '../../components/ui/alert';
import { API_BASE_URL, API_KEY } from '../../constants/api';
import { firestore } from '../../constants/firebase';
import { getAccentFromPosterPath } from '../../constants/theme';
import { Media } from '../../types';
import { useAccent } from '../components/AccentContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const RED_TEXT = '#e50914';

type SearchTab = 'movies' | 'social' | 'messages';

const SearchScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('movies');
  const [movieResults, setMovieResults] = useState<Media[]>([]);
  const [tvResults, setTvResults] = useState<Media[]>([]);
  const [subtitleCheckCache, setSubtitleCheckCache] = useState<Record<string, boolean>>({});
  const [socialResults, setSocialResults] = useState<any[]>([]);
  const [messageResults, setMessageResults] = useState<any[]>([]);
  const [marketplaceResults, setMarketplaceResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const { setAccentColor } = useAccent();

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const moviesAbortRef = useRef<AbortController | null>(null);

  /** SEARCH LOGIC */
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // cancel in-flight TMDB fetches
    if (moviesAbortRef.current) {
      moviesAbortRef.current.abort();
      moviesAbortRef.current = null;
    }

    if (searchQuery.length <= 2) {
      requestIdRef.current += 1;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLoading(false);
      setMovieResults([]);
      setTvResults([]);
      setSocialResults([]);
      setMessageResults([]);
      setMarketplaceResults([]);
      return;
    }

    setLoading(true);
    const requestId = (requestIdRef.current += 1);

    const searchMovies = async () => {
      const controller = new AbortController();
      moviesAbortRef.current = controller;
      const q = encodeURIComponent(searchQuery);
      const [movieRes, tvRes] = await Promise.all([
        fetch(`${API_BASE_URL}/search/movie?api_key=${API_KEY}&query=${q}`, { signal: controller.signal }),
        fetch(`${API_BASE_URL}/search/tv?api_key=${API_KEY}&query=${q}`, { signal: controller.signal }),
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

      const moviesWithSubs = movies.map((m: any) => ({
        ...m,
        hasSubtitles: subtitleCheckCache[m.id] ?? null,
      }));
      const tvsWithSubs = tvs.map((t: any) => ({
        ...t,
        hasSubtitles: subtitleCheckCache[t.id] ?? null,
      }));

      setMovieResults(
        moviesWithSubs.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0)),
      );
      setTvResults(tvsWithSubs.sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0)));
    };

      const searchSocial = async () => {
        try {
          // Search feeds, notifications, streaks, stories
          const [storiesQuery, notificationsQuery, streaksQuery] = await Promise.all([
            getDocs(query(collection(firestore, 'stories'), orderBy('createdAt', 'desc'), limit(50))),
            getDocs(query(collection(firestore, 'notifications'), orderBy('createdAt', 'desc'), limit(50))),
            getDocs(query(collection(firestore, 'streaks'), orderBy('createdAt', 'desc'), limit(50))),
          ]);

          const stories = storiesQuery.docs.map((doc: any) => ({
            id: doc.id,
            type: 'story',
            ...doc.data(),
            title: doc.data().caption || 'Story'
          }));

          const notifications = notificationsQuery.docs.map((doc: any) => ({
            id: doc.id,
            type: 'notification',
            ...doc.data(),
            title: doc.data().message || 'Notification'
          }));

          const streaks = streaksQuery.docs.map((doc: any) => ({
            id: doc.id,
            type: 'streak',
            ...doc.data(),
            title: `Streak with ${doc.data().partnerName || 'Friend'}`
          }));

          const socialResults = [...stories, ...notifications, ...streaks].filter((item: any) =>
            item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.message?.toLowerCase().includes(searchQuery.toLowerCase())
          );

          if (requestId === requestIdRef.current) {
            setSocialResults(socialResults);
          }
        } catch (err) {
          console.warn('Social search error', err);
          if (requestId === requestIdRef.current) {
            setSocialResults([]);
          }
        }
      };

      const searchMessages = async () => {
        try {
          // Search messages, users, chats
          const [messagesQuery, usersQuery] = await Promise.all([
            getDocs(query(collection(firestore, 'messages'), orderBy('createdAt', 'desc'), limit(100))),
            getDocs(query(collection(firestore, 'users'), limit(200))),
          ]);

          const messages = messagesQuery.docs.map((doc: any) => ({
            id: doc.id,
            type: 'message',
            ...doc.data(),
            title: doc.data().text || 'Message'
          }));

          const users = usersQuery.docs.map((doc: any) => ({
            id: doc.id,
            type: 'user',
            ...doc.data(),
            title: doc.data().displayName || doc.data().name || 'User',
            email: doc.data().email || ''
          }));

          const messageResults = [
            ...messages.filter((item: any) => item.text?.toLowerCase().includes(searchQuery.toLowerCase())),
            ...users.filter((item: any) => item.title?.toLowerCase().includes(searchQuery.toLowerCase()) || item.email?.toLowerCase().includes(searchQuery.toLowerCase()))
          ];

          if (requestId === requestIdRef.current) {
            setMessageResults(messageResults);
          }
        } catch (err) {
          console.warn('Messages search error', err);
          if (requestId === requestIdRef.current) {
            setMessageResults([]);
          }
        }
      };

      const searchMarketplace = async () => {
        try {
          // Search marketplace items
          const marketplaceQuery = await getDocs(query(collection(firestore, 'marketplace'), limit(200)));
          const marketplaceItems = marketplaceQuery.docs.map((doc: any) => ({
            id: doc.id,
            type: 'marketplace',
            ...doc.data(),
            title: doc.data().title || doc.data().name || 'Item'
          }));

          const marketplaceResults = marketplaceItems.filter((item: any) =>
            item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.category?.toLowerCase().includes(searchQuery.toLowerCase())
          );

          if (requestId === requestIdRef.current) {
            setMarketplaceResults(marketplaceResults);
          }
        } catch (err) {
          console.warn('Marketplace search error', err);
          if (requestId === requestIdRef.current) {
            setMarketplaceResults([]);
          }
        }
      };

    debounceRef.current = setTimeout(() => {
      const run = async () => {
        try {
          if (activeTab === 'movies') {
            await searchMovies();
          } else if (activeTab === 'social') {
            await searchSocial();
          } else if (activeTab === 'messages') {
            await searchMessages();
          } else if (activeTab === 'marketplace') {
            await searchMarketplace();
          }
        } finally {
          if (requestId === requestIdRef.current) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setLoading(false);
          }
        }
      };

      void run();
    }, 350);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [searchQuery, activeTab, subtitleCheckCache]);

  /** ACCENT UPDATE */
  const accentColor =
    getAccentFromPosterPath(movieResults[0]?.poster_path || tvResults[0]?.poster_path) ?? '#e50914';

  useEffect(() => {
    setAccentColor(accentColor);
  }, [accentColor, setAccentColor]);

  const clear = () => setSearchQuery('');

  // Combined results for checking if we have any results
  const hasResults = movieResults.length > 0 || tvResults.length > 0;

  return (
    <ScreenWrapper disableTopInset>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.flex, { paddingTop: insets.top + 12 }]}
      >
        {/* BACKGROUND */}
        <LinearGradient
          colors={[accentColor, '#150a13', '#05060f']}
          start={[0, 0]}
          end={[1, 1]}
          style={styles.gradient}
        />

        {/* TRANSPARENT GLASS HEADER */}
        <View style={styles.headerContainer}>
          <BlurView intensity={45} tint="dark" style={styles.headerBlur}>
            <View style={styles.headerContent}>
              {/* Back Icon */}
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.back()}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>

              {/* Hero Text */}
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroSubtitle}>Find your next watch</Text>
                <Text style={styles.heroTitle}>Search</Text>
              </View>
            </View>

            {/* Search Bar */}
            <Animated.View
              style={[
                styles.searchWrap,
                { transform: [{ scale: scaleAnim }] },
              ]}
            >
              <Ionicons
                name="search"
                size={18}
                color="#fff"
                style={styles.searchIcon}
              />

              <TextInput
                placeholder={
                  activeTab === 'movies'
                    ? 'Search movies, TV shows, actors...'
                    : activeTab === 'social'
                    ? 'Search feeds, notifications, streaks...'
                    : activeTab === 'messages'
                    ? 'Search messages, users, chats...'
                    : 'Search marketplace items...'
                }
                placeholderTextColor="rgba(255,255,255,0.55)"
                style={styles.input}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />

              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={clear} style={styles.clearBtn}>
                  <Ionicons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </Animated.View>
          </BlurView>
        </View>

        {/* SEARCH TABS */}
        <View style={styles.tabsContainer}>
          {(['movies', 'social', 'messages'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* CONTENT */}
        <View style={styles.body}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={RED_TEXT} />
            </View>
          ) : activeTab === 'movies' ? (
            hasResults ? (
              <View style={styles.resultsContainer}>
                {movieResults.length > 0 && (
                  <MovieList
                    movies={movieResults}
                    title={`Movies for "${searchQuery}"`}
                  />
                )}
                {tvResults.length > 0 && (
                  <MovieList
                    movies={tvResults}
                    title={`TV Shows for "${searchQuery}"`}
                  />
                )}
              </View>
            ) : searchQuery.length > 2 ? (
              <View style={styles.empty}>
                <Ionicons
                  name="film-outline"
                  size={42}
                  color={RED_TEXT + 'CC'}
                />
                <Text style={styles.emptyTitle}>No results</Text>
                <Text style={styles.emptySubtitle}>
                  Try a different title or spelling.
                </Text>
              </View>
            ) : (
              <View style={styles.centerHint}>
                <Text style={styles.hintBig}>Start typing to search…</Text>
                <Text style={styles.hintSmall}>
                  Movies, series, actors, genres and more.
                </Text>
              </View>
            )
          ) : activeTab === 'social' ? (
            socialResults.length > 0 ? (
              <View style={styles.resultsList}>
                {socialResults.map((item) => (
                  <BlurView key={item.id} intensity={25} tint="dark" style={styles.resultItemBlur}>
                    <TouchableOpacity style={styles.resultItem}>
                      <Ionicons
                        name={
                          item.type === 'story' ? 'images' :
                          item.type === 'notification' ? 'notifications' :
                          'trophy'
                        }
                        size={24}
                        color="#fff"
                        style={styles.resultIcon}
                      />
                      <View style={styles.resultContent}>
                        <Text style={styles.resultTitle}>{item.title}</Text>
                        <Text style={styles.resultType}>{item.type}</Text>
                      </View>
                    </TouchableOpacity>
                  </BlurView>
                ))}
              </View>
            ) : searchQuery.length > 2 ? (
              <View style={styles.empty}>
                <Ionicons
                  name="people-outline"
                  size={42}
                  color={RED_TEXT + 'CC'}
                />
                <Text style={styles.emptyTitle}>No social results</Text>
                <Text style={styles.emptySubtitle}>
                  Try searching for stories, notifications, or streaks.
                </Text>
              </View>
            ) : (
              <View style={styles.centerHint}>
                <Text style={styles.hintBig}>Search social content</Text>
                <Text style={styles.hintSmall}>
                  Stories, notifications, streaks and feeds.
                </Text>
              </View>
            )
          ) : activeTab === 'messages' ? (
            messageResults.length > 0 ? (
              <View style={styles.resultsList}>
                {messageResults.map((item) => (
                  <BlurView key={item.id} intensity={25} tint="dark" style={styles.resultItemBlur}>
                    <TouchableOpacity style={styles.resultItem}>
                      <Ionicons
                        name={item.type === 'user' ? 'person' : 'chatbubble'}
                        size={24}
                        color="#fff"
                        style={styles.resultIcon}
                      />
                      <View style={styles.resultContent}>
                        <Text style={styles.resultTitle}>{item.title}</Text>
                        <Text style={styles.resultType}>{item.type}</Text>
                      </View>
                    </TouchableOpacity>
                  </BlurView>
                ))}
              </View>
            ) : searchQuery.length > 2 ? (
              <View style={styles.empty}>
                <Ionicons
                  name="chatbubble-outline"
                  size={42}
                  color={RED_TEXT + 'CC'}
                />
                <Text style={styles.emptyTitle}>No message results</Text>
                <Text style={styles.emptySubtitle}>
                  Try searching for users, messages, or chats.
                </Text>
              </View>
            ) : (
              <View style={styles.centerHint}>
                <Text style={styles.hintBig}>Search messages</Text>
                <Text style={styles.hintSmall}>
                  Users, messages, chats and conversations.
                </Text>
              </View>
            )
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { ...StyleSheet.absoluteFillObject },

  /** HEADER */
  headerContainer: {
    paddingTop: 26,
    paddingHorizontal: 14,
  },
  headerBlur: {
    padding: 14,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTextWrap: {
    marginLeft: 12,
    flex: 1,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginBottom: 2,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },

  /** SEARCH BAR */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  clearBtn: {
    padding: 6,
  },

  /** TABS */
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#e50914',
  },
  tabText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },

  /** CONTENT */
  body: {
    flex: 1,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  resultsContainer: {
    flex: 1,
  },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { marginTop: 40, alignItems: 'center' },
  emptyTitle: { marginTop: 10, color: '#fff', fontSize: 16 },
  emptySubtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  centerHint: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hintBig: { color: '#ffffffcc', fontSize: 18, marginBottom: 6 },
  hintSmall: { color: '#ffffff88', fontSize: 13 },

  /** RESULTS */
  resultsList: {
    flex: 1,
  },
  resultItemBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  resultIcon: {
    marginRight: 12,
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultType: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
    textTransform: 'capitalize',
  },
});

export default SearchScreen;
