import { createWatchParty, tryJoinWatchParty, type WatchParty } from '@/lib/watchparty/controller';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../../constants/api';
import { getAccentFromPosterPath } from '../../constants/theme';
import { useUser } from '../../hooks/use-user';
import { getProfileScopedKey } from '../../lib/profileStorage';
import { usePStream } from '../../src/pstream/usePStream';
import type { Media } from '../../types';
import { logInteraction, recommendContent } from '@/lib/algo';

import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { useAccent } from '../components/AccentContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Episode = {
  id: number;
  episode_number: number;
  name: string;
  overview?: string;
  still_path?: string | null;
  runtime?: number;
  air_date?: string;
};

type Season = {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  poster_path?: string | null;
};

// Floating particle component
interface FloatingParticleProps {
  delay: number;
  size: number;
  startX: number;
  color: string;
}

const FloatingParticle = memo(function FloatingParticle({ delay, size, startX, color }: FloatingParticleProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      translateY.setValue(0);
      opacity.setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -150,
            duration: 5000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
            Animated.delay(3000),
            Animated.timing(opacity, { toValue: 0, duration: 1000, useNativeDriver: true }),
          ]),
        ]),
      ]).start(() => animate());
    };
    animate();
  }, [delay, translateY, opacity]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 100,
        width: size,
        height: size,
        borderRadius: size / 2,
        left: startX,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
});

// Animated section wrapper
interface AnimatedSectionProps {
  children: React.ReactNode;
  delay?: number;
  style?: any;
}

const AnimatedSection = memo(function AnimatedSection({ children, delay = 0, style }: AnimatedSectionProps) {
  const translateY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 10,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [delay, translateY, opacity]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
});

// Animated movie card
interface AnimatedMovieCardProps {
  item: Media;
  isActive: boolean;
  onPress: () => void;
  accentColor: string;
  index: number;
}

const AnimatedMovieCard = memo(function AnimatedMovieCard({ item, isActive, onPress, accentColor, index }: AnimatedMovieCardProps) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 80),
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [index, scaleAnim, opacityAnim]);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Animated.View
        style={[
          styles.movieCard,
          {
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
            borderColor: isActive ? accentColor : 'rgba(255,255,255,0.1)',
            borderWidth: 2,
          },
        ]}
      >
        {isActive && (
          <View style={[styles.movieCardGlow, { shadowColor: accentColor }]} />
        )}
        <Image
          source={{ uri: `${IMAGE_BASE_URL}${item.poster_path}` }}
          style={styles.poster}
        />
        {isActive && (
          <LinearGradient
            colors={[`${accentColor}50`, 'transparent']}
            style={styles.posterOverlay}
          />
        )}
        <View style={styles.movieLabelWrap}>
          <Text style={styles.movieLabel} numberOfLines={1}>
            {item.title || item.name}
          </Text>
          {isActive && (
            <View style={[styles.selectedBadge, { backgroundColor: accentColor }]}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
});



const WatchPartyScreen = () => {
  const router = useRouter();
  const { user } = useUser();
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [myList, setMyList] = useState<Media[]>([]);
  const [algoMyList, setAlgoMyList] = useState<Media[]>([]);
  const [selected, setSelected] = useState<Media | null>(null);
  const [currentParty, setCurrentParty] = useState<WatchParty | null>(null);
  
  const { currentPlan, isSubscribed } = useSubscription();
  const { accentColor, setAccentColor } = useAccent();
  const { scrape: scrapeStream } = usePStream();
  
  const bottomSheetRef = useRef<BottomSheet>(null);
  const episodeSheetRef = useRef<BottomSheet>(null);

  // Rank My List using algo
  useEffect(() => {
    if (myList.length > 0) {
      void recommendContent(myList, user?.uid).then(setAlgoMyList);
    }
  }, [myList, user?.uid]);

  // TV show episode selection state
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const derivedAccent = useMemo(
    () => getAccentFromPosterPath(selected?.poster_path ?? myList[0]?.poster_path),
    [selected?.poster_path, myList],
  );

  useEffect(() => {
    if (derivedAccent) {
      setAccentColor(derivedAccent);
    }
  }, [derivedAccent, setAccentColor]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadList = async () => {
        try {
          const key = await getProfileScopedKey('myList');
          const stored = await AsyncStorage.getItem(key);
          if (!isActive) return;
          const parsed: Media[] = stored ? JSON.parse(stored) : [];
          setMyList(parsed);
          setSelected(parsed[0] ?? null);
        } catch (err) {
          if (isActive) {
            console.warn('Failed to load My List for watch party', err);
            setMyList([]);
            setSelected(null);
          }
        }
      };

      loadList();

      return () => {
        isActive = false;
      };
    }, [])
  );

  // Fetch seasons for a TV show
  const fetchSeasons = async (tmdbId: number) => {
    setLoadingSeasons(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tv/${tmdbId}?api_key=${API_KEY}`);
      const data = await response.json();
      const filteredSeasons = (data.seasons || []).filter((s: Season) => s.season_number > 0);
      setSeasons(filteredSeasons);
      if (filteredSeasons.length > 0) {
        setSelectedSeason(filteredSeasons[0]);
        await fetchEpisodes(tmdbId, filteredSeasons[0].season_number);
      }
    } catch (err) {
      console.warn('Failed to fetch seasons', err);
      setSeasons([]);
    } finally {
      setLoadingSeasons(false);
    }
  };

  // Fetch episodes for a season
  const fetchEpisodes = async (tmdbId: number, seasonNumber: number) => {
    setLoadingEpisodes(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tv/${tmdbId}/season/${seasonNumber}?api_key=${API_KEY}`);
      const data = await response.json();
      setEpisodes(data.episodes || []);
      setSelectedEpisode(data.episodes?.[0] ?? null);
    } catch (err) {
      console.warn('Failed to fetch episodes', err);
      setEpisodes([]);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  // Handle season change
  const handleSeasonChange = async (season: Season) => {
    setSelectedSeason(season);
    if (selected?.id) {
      await fetchEpisodes(selected.id, season.season_number);
    }
  };

  const handleCreateParty = async () => {
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to start a watch party.');
      return;
    }

    if (!selected) {
      Alert.alert('Pick a movie', 'Select a movie from your list to start the party.');
      return;
    }

    // Log Creation Interaction
    void logInteraction({
      type: 'party_join', // Hosting counts as joining/creating
      actorId: user.uid,
      targetId: String(selected.id),
      targetType: selected.media_type === 'tv' ? 'tv' : 'movie',
      meta: {
        title: selected.title || selected.name,
        role: 'host'
      }
    });

    // Gating: Only allow more than 4 viewers if subscribed
    if (!isSubscribed) {
      Alert.alert(
        'Upgrade required',
        'Free watch parties support up to 4 viewers. Upgrade to Premium for larger rooms.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'See Premium', onPress: () => router.push('/premium?source=watchparty') },
        ]
      );
      return;
    }

    // For TV shows, open episode selection sheet first
    const isTvShow = selected.media_type === 'tv';
    if (isTvShow) {
      await fetchSeasons(selected.id);
      episodeSheetRef.current?.expand();
      return;
    }

    await startMovieParty();
  };

  // Start party for a movie (or after episode selection for TV)
  const startMovieParty = async () => {
    if (!selected || !user?.uid) return;

    try {
      setBusy(true);
      // Build scrape payload for usePStream
      const payload = {
        type: 'movie' as const,
        title: selected.title || selected.name || 'Movie',
        tmdbId: selected.id ? selected.id.toString() : '',
        imdbId: selected.imdb_id ?? undefined,
        releaseYear: selected.release_date ? parseInt(selected.release_date) : new Date().getFullYear(),
      };
      const playback = await scrapeStream(payload);
      if (!playback?.uri) throw new Error('No stream found');
      const videoUrl = playback.uri;
      const videoHeaders = playback.headers ? encodeURIComponent(JSON.stringify(playback.headers)) : undefined;
      const party = await createWatchParty(
        user.uid,
        videoUrl,
        selected?.title || selected?.name || null,
        selected?.media_type || null,
        playback.headers ?? null,
        (playback as any)?.stream?.type ?? null,
      );
      setCurrentParty(party);

      Alert.alert(
        'Watch Party Created',
        `Share this 6-digit code with your friends so they can join:\n\n${party.code}`,
        [
          {
            text: 'Start Watching',
            onPress: () =>
              router.push({
                pathname: '/watchparty/player',
                params: {
                  roomCode: party.code,
                  videoUrl: party.videoUrl,
                  videoHeaders,
                  title: party.title || selected?.title || selected?.name || 'Watch Party',
                  mediaType: party.mediaType || selected?.media_type || 'movie',
                  tmdbId: selected?.id ? selected.id.toString() : undefined,
                  posterPath: selected?.poster_path ?? undefined,
                  backdropPath: selected?.backdrop_path ?? undefined,
                  overview: selected?.overview ?? undefined,
                  releaseDate: selected?.release_date || selected?.first_air_date || undefined,
                  genreIds: Array.isArray(selected?.genre_ids) ? selected?.genre_ids?.join(',') : undefined,
                  voteAverage:
                    typeof selected?.vote_average === 'number' ? selected.vote_average.toString() : undefined,
                },
              }),
          },
        ]
      );
    } catch (err) {
      console.warn('Failed to create watch party', err);
      Alert.alert('Error', 'Unable to create watch party. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Start party for a TV show episode
  const startTvShowParty = async () => {
    if (!selected || !selectedSeason || !selectedEpisode || !user?.uid) {
      Alert.alert('Select an episode', 'Please select an episode to start the watch party.');
      return;
    }

    try {
      setBusy(true);
      episodeSheetRef.current?.close();

      const payload = {
        type: 'show' as const,
        title: selected.title || selected.name || 'TV Show',
        tmdbId: selected.id ? selected.id.toString() : '',
        imdbId: selected.imdb_id ?? undefined,
        releaseYear: selected.first_air_date ? parseInt(selected.first_air_date) : new Date().getFullYear(),
        season: {
          number: selectedSeason.season_number,
          tmdbId: selectedSeason.id?.toString() ?? '',
          title: selectedSeason.name,
          episodeCount: selectedSeason.episode_count,
        },
        episode: {
          number: selectedEpisode.episode_number,
          tmdbId: selectedEpisode.id?.toString() ?? '',
        },
      };

      const playback = await scrapeStream(payload);
      if (!playback?.uri) throw new Error('No stream found');

      const videoUrl = playback.uri;
      const videoHeaders = playback.headers ? encodeURIComponent(JSON.stringify(playback.headers)) : undefined;
      const episodeTitle = `S${selectedSeason.season_number}:E${selectedEpisode.episode_number} - ${selectedEpisode.name}`;

      const party = await createWatchParty(
        user.uid,
        videoUrl,
        `${selected.title || selected.name} - ${episodeTitle}`,
        'tv',
        playback.headers ?? null,
        (playback as any)?.stream?.type ?? null,
      );
      setCurrentParty(party);

      Alert.alert(
        'Watch Party Created',
        `Share this 6-digit code with your friends so they can join:\n\n${party.code}`,
        [
          {
            text: 'Start Watching',
            onPress: () =>
              router.push({
                pathname: '/watchparty/player',
                params: {
                  roomCode: party.code,
                  videoUrl: party.videoUrl,
                  videoHeaders,
                  title: selected.title || selected.name || 'Watch Party',
                  mediaType: 'tv',
                  tmdbId: selected.id ? selected.id.toString() : undefined,
                  posterPath: selected.poster_path ?? undefined,
                  backdropPath: selected.backdrop_path ?? undefined,
                  overview: selected.overview ?? undefined,
                  releaseDate: selected.first_air_date || undefined,
                  genreIds: Array.isArray(selected.genre_ids) ? selected.genre_ids.join(',') : undefined,
                  voteAverage: typeof selected.vote_average === 'number' ? selected.vote_average.toString() : undefined,
                  seasonNumber: selectedSeason.season_number.toString(),
                  episodeNumber: selectedEpisode.episode_number.toString(),
                  seasonTmdbId: selectedSeason.id?.toString(),
                  episodeTmdbId: selectedEpisode.id?.toString(),
                  seasonTitle: selectedSeason.name,
                  seasonEpisodeCount: selectedSeason.episode_count?.toString(),
                },
              }),
          },
        ]
      );
    } catch (err) {
      console.warn('Failed to create TV show watch party', err);
      Alert.alert('Error', 'Unable to create watch party. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinParty = async () => {
    const trimmed = joinCode.trim();
    if (trimmed.length !== 6) {
      Alert.alert('Invalid code', 'Enter the 6-digit party code.');
      return;
    }

    try {
      setBusy(true);
      const { party, status } = await tryJoinWatchParty(trimmed);

      if (status === 'not_found') {
        Alert.alert('Invalid code', 'We couldn’t find a watch party with that code. Double-check and try again.');
        return;
      }

      if (status === 'expired') {
        Alert.alert('Party expired', 'This watch party has expired. Ask your friend to create a new one.');
        return;
      }

      if (!party) {
        Alert.alert('Unable to join', 'Something went wrong joining this watch party.');
        return;
      }

      if (user?.uid) {
        // Log Join Interaction
        void logInteraction({
          type: 'party_join',
          actorId: user.uid,
          targetId: party.code, // Party Code
          meta: {
            code: party.code,
            title: party.title,
            role: 'participant'
          }
        });
      }

      if (status === 'closed') {
        Alert.alert('Waiting for host', 'The host has not opened this watch party yet. Ask them to start the movie.');
        return;
      }

      if (status === 'full' || party.participantsCount >= party.maxParticipants) {
        Alert.alert(
          'Party is full',
          'This watch party has reached the free limit of viewers. Upgrade to Premium to host or join larger parties.'
        );
        return;
      }

      router.push({
        pathname: '/watchparty/player',
        params: {
          roomCode: party.code,
          videoUrl: party.videoUrl,
          videoHeaders: party.videoHeaders
            ? encodeURIComponent(JSON.stringify(party.videoHeaders))
            : undefined,
          streamType: party.streamType || undefined,
          title: party.title || selected?.title || selected?.name || 'Watch Party',
          mediaType: party.mediaType || selected?.media_type || 'movie',
        },
      });
    } catch (err) {
      console.warn('Failed to join watch party', err);
      Alert.alert('Error', 'Unable to join this watch party. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const MiniMoviesScreen = () => {
    const [trending, setTrending] = useState<Media[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const fetchTrending = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/trending/all/day?api_key=${API_KEY}`);
          const data = await response.json();
          setTrending(data.results?.slice(0, 10) || []);
        } catch (err) {
          console.warn('Failed to fetch trending movies', err);
        } finally {
          setLoading(false);
        }
      };
      fetchTrending();
    }, []);

    const addToMyList = async (movie: Media) => {
      try {
        const key = await getProfileScopedKey('myList');
        const stored = await AsyncStorage.getItem(key);
        const currentList: Media[] = stored ? JSON.parse(stored) : [];
        const updatedList = [...currentList, movie];
        await AsyncStorage.setItem(key, JSON.stringify(updatedList));
        setMyList(updatedList);
        if (!selected) {
          setSelected(movie);
        }
        bottomSheetRef.current?.close();
        Alert.alert('Added to My List', `${movie.title || movie.name} has been added to your list.`);
      } catch (err) {
        console.warn('Failed to add to my list', err);
        Alert.alert('Error', 'Failed to add movie to your list.');
      }
    };

    if (loading) {
      return (
        <View style={styles.miniLoading}>
          <Text style={styles.miniLoadingText}>Loading movies...</Text>
        </View>
      );
    }

    return (
      <View style={styles.miniMoviesContainer}>
        <Text style={styles.miniMoviesTitle}>Add Movies to Your List</Text>
        <Text style={styles.miniMoviesSubtitle}>
          Select movies to add to your list and start watch parties with them.
        </Text>
        <FlatList
          data={trending}
          keyExtractor={(item) => (item.id ? item.id.toString() : (item.title || item.name) as string)}
          horizontal
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={{ width: 120, marginRight: 10 }}>
              <Image
                source={{ uri: `${IMAGE_BASE_URL}${item.poster_path}` }}
                style={{ width: '100%', aspectRatio: 2 / 3, borderRadius: 8 }}
              />
              <Text style={{ color: '#FFFFFF', fontSize: 12 }} numberOfLines={1}>
                {item.title || item.name}
              </Text>
              <TouchableOpacity
                onPress={() => addToMyList(item)}
                style={{ marginTop: 6, paddingVertical: 6, backgroundColor: accentColor, borderRadius: 8, alignItems: 'center' }}
              >
                <Text style={{ color: '#FFFFFF' }}>Add</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    );
  };

  // Memoize particles
  const particles = useMemo(() => {
    const colors = [accentColor, '#ffffff', accentColor];
    return Array.from({ length: 6 }, (_, i) => ({
      id: i,
      delay: i * 800,
      size: 3 + Math.random() * 4,
      startX: Math.random() * SCREEN_WIDTH,
      color: colors[i % colors.length],
    }));
  }, [accentColor]);

  return (
    <View style={styles.container}>
      {/* Animated background */}
      <LinearGradient
        colors={[accentColor, '#0a0c18', '#050506']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* Ambient orbs */}
      <View style={styles.ambientContainer} pointerEvents="none">
        <LinearGradient
          colors={[`${accentColor}35`, 'transparent']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.ambientOrb1}
        />
        <LinearGradient
          colors={['rgba(100,130,255,0.2)', 'transparent']}
          start={{ x: 0.8, y: 0.2 }}
          end={{ x: 0.2, y: 0.8 }}
          style={styles.ambientOrb2}
        />
        {particles.map((p) => (
          <FloatingParticle key={p.id} {...p} />
        ))}
      </View>

      {/* Header */}
      <AnimatedSection delay={0}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (myList.length === 0) {
                bottomSheetRef.current?.expand();
              } else {
                router.replace('/movies');
              }
            }}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <View style={[styles.headerDot, { backgroundColor: accentColor, shadowColor: accentColor }]} />
            <View>
              <Text style={styles.headerSubtitle}>Watch Together</Text>
              <Text style={styles.headerTitle}>Watch Party</Text>
            </View>
          </View>
          <View style={[styles.headerIconWrap, { borderColor: `${accentColor}40` }]}>
            <Ionicons name="videocam" size={18} color={accentColor} />
          </View>
        </View>
      </AnimatedSection>

      <View style={styles.content}>
        {/* Create Party Card */}
        <AnimatedSection delay={100} style={[styles.card, { borderColor: `${accentColor}25` }]}>
          <LinearGradient
            colors={[`${accentColor}15`, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradient}
          />
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: `${accentColor}20` }]}>
              <Ionicons name="play-circle" size={22} color={accentColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Start a Watch Party</Text>
              <Text style={styles.cardSubtitle}>
                Pick a movie and share a 6-digit code with friends.
              </Text>
            </View>
          </View>
          
          {currentParty && (
            <View style={[styles.codeBanner, { borderColor: `${accentColor}30` }]}>
              <LinearGradient
                colors={[`${accentColor}15`, 'transparent']}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.codeBannerLabel}>Your party code</Text>
              <Text style={[styles.codeBannerValue, { color: accentColor }]}>{currentParty.code}</Text>

              <TouchableOpacity
                onPress={() => {
                  void Share.share({
                    message: `Join my MovieFlix Watch Party. Code: ${currentParty.code}`,
                  }).catch(() => {});
                }}
                style={[styles.shareCodeBtn, { backgroundColor: `${accentColor}20`, borderColor: accentColor }]}
              >
                <Ionicons name="share-social" size={14} color="#fff" />
                <Text style={styles.shareCodeText}>Share code</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.listSection}>
            <View style={styles.listHeader}>
              <Ionicons name="film" size={16} color="rgba(255,255,255,0.6)" />
              <Text style={styles.listTitle}>Choose from your list</Text>
            </View>
            <FlatList
              horizontal
              data={algoMyList.length > 0 ? algoMyList : myList}
              keyExtractor={(item) => item.id.toString()}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.listRow}
              renderItem={({ item, index }) => (
                <AnimatedMovieCard
                  item={item}
                  isActive={selected?.id === item.id}
                  onPress={() => setSelected(item)}
                  accentColor={accentColor}
                  index={index}
                />
              )}
              ListEmptyComponent={
                <Text style={styles.emptyListText}>
                  Add movies to “My List” to start watch parties with them.
                </Text>
              }
            />
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.disabled, { backgroundColor: accentColor }]}
            onPress={handleCreateParty}
            disabled={busy}
          >
            <Ionicons name="play-circle" size={22} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Create Party</Text>
          </TouchableOpacity>
        </AnimatedSection>

        {/* Join Party Card */}
        <AnimatedSection delay={200} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: 'rgba(100,130,255,0.2)' }]}>
              <Ionicons name="log-in" size={20} color="#6482ff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Join with Code</Text>
              <Text style={styles.cardSubtitle}>
                Enter the 6-digit code from your friend.
              </Text>
            </View>
          </View>
          
          <View style={styles.codeInputWrap}>
            <Ionicons name="keypad" size={18} color="rgba(255,255,255,0.4)" style={{ marginRight: 10 }} />
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              maxLength={6}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={styles.codeInput}
            />
          </View>
          
          <TouchableOpacity
            style={[styles.secondaryButton, busy && styles.disabled]}
            onPress={handleJoinParty}
            disabled={busy}
          >
            <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
            <Text style={styles.secondaryButtonText}>Join Party</Text>
          </TouchableOpacity>
        </AnimatedSection>

        {/* Surprise: New Features Highlights */}
        <AnimatedSection delay={250} style={styles.featuresSection}>
          <Text style={styles.featuresTitle}>What to expect</Text>
          <View style={styles.featuresGrid}>
            {[
              { icon: 'videocam', label: 'Face Cams', desc: 'See friends live while you watch together', color: '#19c37d' },
              { icon: 'flash', label: 'Emoji Bursts', desc: 'Share real-time reactions with the whole room', color: '#ff8a00' },
              { icon: 'stats-chart', label: 'Live Polls', desc: 'Vote on plot twists and what to watch next', color: '#6482ff' },
              { icon: 'logo-android', label: 'Trivia Bot', desc: 'AI assistant drops fun movie facts live', color: accentColor },
            ].map((f, i) => (
              <View key={i} style={styles.featureItem}>
                <View style={[styles.featureIconWrap, { backgroundColor: f.color + '20' }]}>
                  <Ionicons name={f.icon as any} size={18} color={f.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureLabel}>{f.label}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </AnimatedSection>

        {/* How it Works Section */}
        <AnimatedSection delay={280} style={styles.howItWorksSection}>
          <Text style={styles.featuresTitle}>How it works</Text>
          <View style={styles.stepsContainer}>
            {[
              { step: 1, title: 'Choose Content', desc: 'Pick any movie or show from your list.' },
              { step: 2, title: 'Invite Friends', desc: 'Share your unique 6-digit party code.' },
              { step: 3, title: 'Watch in Sync', desc: 'Play, pause, and seek are synced for everyone.' },
            ].map((s, i) => (
              <View key={i} style={styles.stepItem}>
                <View style={[styles.stepNumber, { backgroundColor: accentColor }]}>
                  <Text style={styles.stepNumberText}>{s.step}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepDesc}>{s.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </AnimatedSection>

        {/* Intelligence Highlight */}
        <AnimatedSection delay={310} style={styles.intelligenceCard}>
          <LinearGradient
            colors={['rgba(125,216,255,0.1)', 'transparent']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.intelHeader}>
            <Ionicons name="sparkles" size={20} color="#7dd8ff" />
            <Text style={styles.intelTitle}>Group Taste Intelligence</Text>
          </View>
          <Text style={styles.intelText}>
            Our algorithm analyzes the taste profiles of everyone in the room to suggest the perfect movie that fits the group vibe.
          </Text>
        </AnimatedSection>

        {/* Premium Upsell Card */}
        <AnimatedSection delay={300} style={[styles.premiumUpsell, { borderColor: `${accentColor}40` }]}>
          <LinearGradient
            colors={[`${accentColor}10`, 'transparent']}
            style={styles.cardGradient}
          />
          <View style={styles.premiumHeader}>
            <View style={[styles.premiumIconWrap, { backgroundColor: `${accentColor}20` }]}>
              <Ionicons name="diamond" size={20} color={accentColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumTitle}>Need bigger rooms?</Text>
              <Text style={styles.premiumSubtitle}>
                Premium members can host larger watch parties.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.premiumButton, { backgroundColor: accentColor, shadowColor: accentColor }]}
            onPress={() => router.push('/premium?source=watchparty')}
          >
            <Ionicons name="sparkles" size={14} color="#fff" />
            <Text style={styles.premiumButtonText}>See Premium options</Text>
          </TouchableOpacity>
        </AnimatedSection>
      </View>

      {/* Episode Selection Bottom Sheet for TV Shows */}
      <BottomSheet
        ref={episodeSheetRef}
        index={-1}
        snapPoints={['70%']}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: 'rgba(15,18,35,0.98)' }}
        handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
      >
        <BottomSheetScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={styles.episodeSheetTitle}>
            {selected?.title || selected?.name}
          </Text>
          <Text style={styles.episodeSheetSubtitle}>
            Select an episode to start the watch party
          </Text>

          {/* Season Selector */}
          {loadingSeasons ? (
            <View style={styles.episodeLoading}>
              <Text style={styles.episodeLoadingText}>Loading seasons...</Text>
            </View>
          ) : (
            <FlatList
              horizontal
              data={seasons}
              keyExtractor={(item) => item.id.toString()}
              showsHorizontalScrollIndicator={false}
              style={{ marginVertical: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSeasonChange(item)}
                  style={[
                    styles.seasonPill,
                    selectedSeason?.id === item.id && { backgroundColor: accentColor, borderColor: accentColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.seasonPillText,
                      selectedSeason?.id === item.id && { color: '#fff' },
                    ]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}

          {/* Episode List */}
          {loadingEpisodes ? (
            <View style={styles.episodeLoading}>
              <Text style={styles.episodeLoadingText}>Loading episodes...</Text>
            </View>
          ) : (
            episodes.map((ep) => (
              <TouchableOpacity
                key={ep.id}
                onPress={() => setSelectedEpisode(ep)}
                style={[
                  styles.episodeCard,
                  selectedEpisode?.id === ep.id && { borderColor: accentColor, borderWidth: 2 },
                ]}
              >
                <Image
                  source={{
                    uri: ep.still_path
                      ? `${IMAGE_BASE_URL}${ep.still_path}`
                      : 'https://via.placeholder.com/160x90?text=Episode',
                  }}
                  style={styles.episodeThumb}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.episodeNumber}>
                    Episode {ep.episode_number}
                  </Text>
                  <Text style={styles.episodeName} numberOfLines={1}>
                    {ep.name}
                  </Text>
                  {ep.runtime ? (
                    <Text style={styles.episodeRuntime}>{ep.runtime} min</Text>
                  ) : null}
                </View>
                {selectedEpisode?.id === ep.id && (
                  <View style={[styles.episodeCheck, { backgroundColor: accentColor }]}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}

          {/* Start Party Button */}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: accentColor, marginTop: 16, marginBottom: 32 },
              busy && styles.disabled,
            ]}
            onPress={startTvShowParty}
            disabled={busy || !selectedEpisode}
          >
            <Ionicons name="play-circle" size={22} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Start Watch Party</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Mini Movies Selection Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['80%']}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: 'rgba(15,18,35,0.98)' }}
        handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
      >
        <BottomSheetScrollView style={{ flex: 1, padding: 16 }}>
          <MiniMoviesScreen />
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  ambientContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  ambientOrb1: {
    position: 'absolute',
    top: -50,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  ambientOrb2: {
    position: 'absolute',
    top: 200,
    right: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 12,
  },
  headerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '500',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: 'rgba(15,18,35,0.7)',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    overflow: 'hidden',
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 14,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    gap: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  codeInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  codeInput: {
    flex: 1,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 20,
    letterSpacing: 6,
    textAlign: 'center',
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.5,
  },
  listSection: {
    marginTop: 4,
    marginBottom: 16,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  listTitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '700',
  },
  listRow: {
    paddingVertical: 4,
  },
  movieCard: {
    width: 100,
    marginRight: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  movieCardGlow: {
    ...StyleSheet.absoluteFillObject,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  poster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 12,
  },
  posterOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
  },
  movieLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  movieLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  selectedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyListWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  emptyListText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
  },
  miniLoading: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniLoadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  miniMoviesContainer: {
    paddingVertical: 14,
  },
  miniMoviesTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  miniMoviesSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginBottom: 12,
  },
  codeBanner: {
    marginBottom: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  codeBannerLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  codeBannerValue: {
    fontSize: 28,
    letterSpacing: 6,
    fontWeight: '900',
    marginBottom: 12,
  },
  shareCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  shareCodeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  premiumUpsell: {
    marginBottom: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(15,18,35,0.7)',
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 14,
  },
  premiumIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  premiumSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
  },
  premiumButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  premiumButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  // Episode selection sheet styles
  episodeSheetTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 4,
  },
  episodeSheetSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  episodeLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  episodeLoadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  seasonPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginRight: 10,
  },
  seasonPillText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  episodeThumb: {
    width: 100,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  episodeNumber: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  episodeName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  episodeRuntime: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  episodeCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // New Feature Styles
  featuresSection: {
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  featuresTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.8,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  featureDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    marginTop: 2,
  },
  // How it works styles
  howItWorksSection: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  stepsContainer: {
    gap: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  stepTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  intelligenceCard: {
    marginBottom: 24,
    padding: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(125,216,255,0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(125,216,255,0.15)',
    overflow: 'hidden',
  },
  intelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  intelTitle: {
    color: '#7dd8ff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  intelText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
});

export default WatchPartyScreen;
