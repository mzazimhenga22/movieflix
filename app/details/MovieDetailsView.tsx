import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import { ResizeMode, Video } from 'expo-av';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, Path, Stop, LinearGradient as SvgGradient } from 'react-native-svg';
import { IMAGE_BASE_URL } from '../../constants/api';
import { firestore } from '../../constants/firebase';
import { useUser } from '../../hooks/use-user';
import { pushWithOptionalInterstitial } from '../../lib/ads/navigate';
import { enqueueDownload } from '../../lib/downloadManager';
import { getHlsVariantOptions } from '../../lib/hlsDownloader';
import { buildProfileScopedKey, getStoredActiveProfile } from '../../lib/profileStorage';
import { buildScrapeDebugTag, buildSourceOrder } from '../../lib/videoPlaybackShared';
import { createPrefetchKey, storePrefetchedPlayback } from '../../lib/videoPrefetchCache';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { scrapeImdbTrailer as scrapeIMDbTrailer } from '../../src/providers/scrapeImdbTrailer';
import { searchClipCafe } from '../../src/providers/shortclips';
import { scrapePStream, usePStream } from '../../src/pstream/usePStream';
import { useAccent } from '../components/AccentContext';

const AnimatedPath = Animated.createAnimatedComponent(Path);

import { DownloadQualityPicker, type DownloadQualityOption } from '../../components/DownloadQualityPicker';

import { CastMember, Media } from '../../types';
import CastList from './CastList';
import { EpisodeCard } from './EpisodeList';
import RelatedMovies from './RelatedMovies';
import TrailerList from './TrailerList';
import {
  BehindTheScenes,
  FloatingMiniPlayer,
  ImmersiveStats,
  InteractiveRating,
  WatchModes
} from './components';

interface VideoType {
  key: string;
  name: string;
}

// Stunning Story Card with Water Effect
const StoryCardWithWater = ({
  movie,
  releaseDateValue,
  storyCardAnim,
  accentColor
}: {
  movie: Media | null;
  releaseDateValue: string | undefined;
  storyCardAnim: Animated.Value;
  accentColor: string;
}) => {
  const waveAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const bubbleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Water wave animation
    Animated.loop(
      Animated.timing(waveAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      })
    ).start();

    // Shimmer light reflection
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Bubble float animation
    Animated.loop(
      Animated.timing(bubbleAnim, {
        toValue: 1,
        duration: 5000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const cardWidth = 350;
  const cardHeight = 420;

  const wave1Path = waveAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [
      `M0,${cardHeight * 0.82} Q${cardWidth * 0.25},${cardHeight * 0.78} ${cardWidth * 0.5},${cardHeight * 0.82} T${cardWidth},${cardHeight * 0.8} L${cardWidth},${cardHeight} L0,${cardHeight} Z`,
      `M0,${cardHeight * 0.78} Q${cardWidth * 0.25},${cardHeight * 0.85} ${cardWidth * 0.5},${cardHeight * 0.78} T${cardWidth},${cardHeight * 0.82} L${cardWidth},${cardHeight} L0,${cardHeight} Z`,
      `M0,${cardHeight * 0.82} Q${cardWidth * 0.25},${cardHeight * 0.78} ${cardWidth * 0.5},${cardHeight * 0.82} T${cardWidth},${cardHeight * 0.8} L${cardWidth},${cardHeight} L0,${cardHeight} Z`,
    ],
  });

  const wave2Path = waveAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [
      `M0,${cardHeight * 0.86} Q${cardWidth * 0.3},${cardHeight * 0.9} ${cardWidth * 0.6},${cardHeight * 0.86} T${cardWidth},${cardHeight * 0.88} L${cardWidth},${cardHeight} L0,${cardHeight} Z`,
      `M0,${cardHeight * 0.9} Q${cardWidth * 0.3},${cardHeight * 0.84} ${cardWidth * 0.6},${cardHeight * 0.9} T${cardWidth},${cardHeight * 0.86} L${cardWidth},${cardHeight} L0,${cardHeight} Z`,
      `M0,${cardHeight * 0.86} Q${cardWidth * 0.3},${cardHeight * 0.9} ${cardWidth * 0.6},${cardHeight * 0.86} T${cardWidth},${cardHeight * 0.88} L${cardWidth},${cardHeight} L0,${cardHeight} Z`,
    ],
  });

  return (
    <Animated.View
      style={[
        storyCardStyles.container,
        {
          transform: [
            { translateY: storyCardAnim.interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) },
          ],
          opacity: storyCardAnim,
        },
      ]}
    >
      {/* Glass background */}
      <View style={storyCardStyles.glassWrap}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={storyCardStyles.androidGlass} />
        )}
      </View>

      {/* Accent glow at top */}
      <LinearGradient
        colors={[accentColor + '40', 'transparent']}
        style={storyCardStyles.topGlow}
      />

      {/* Water waves at bottom */}
      <View style={storyCardStyles.waveContainer}>
        <Svg width={cardWidth} height={cardHeight} style={StyleSheet.absoluteFillObject}>
          <Defs>
            <SvgGradient id="storyWaveGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#7dd8ff" stopOpacity="0.2" />
              <Stop offset="100%" stopColor="#06b6d4" stopOpacity="0.4" />
            </SvgGradient>
            <SvgGradient id="storyWaveGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#7dd8ff" stopOpacity="0.1" />
              <Stop offset="100%" stopColor="#0891b2" stopOpacity="0.3" />
            </SvgGradient>
          </Defs>
          <AnimatedPath d={wave1Path} fill="url(#storyWaveGrad1)" />
          <AnimatedPath d={wave2Path} fill="url(#storyWaveGrad2)" />
        </Svg>
      </View>

      {/* Floating bubbles */}
      <Animated.View
        style={[
          storyCardStyles.bubble,
          storyCardStyles.bubble1,
          {
            opacity: bubbleAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.8, 0.3] }),
            transform: [
              { translateY: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          storyCardStyles.bubble,
          storyCardStyles.bubble2,
          {
            opacity: bubbleAnim.interpolate({ inputRange: [0, 0.3, 0.7, 1], outputRange: [0.4, 0.9, 0.4, 0.4] }),
            transform: [
              { translateY: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -80] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          storyCardStyles.bubble,
          storyCardStyles.bubble3,
          {
            opacity: bubbleAnim.interpolate({ inputRange: [0, 0.4, 0.8, 1], outputRange: [0.5, 0.7, 0.5, 0.5] }),
            transform: [
              { translateY: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) },
            ],
          },
        ]}
      />

      {/* Shimmer reflection */}
      <Animated.View
        style={[
          storyCardStyles.shimmer,
          {
            opacity: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }),
            transform: [
              { translateX: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-200, 400] }) },
            ],
          },
        ]}
      />

      {/* Content */}
      <View style={storyCardStyles.content}>
        {/* Section title */}
        <View style={storyCardStyles.titleRow}>
          <View style={[storyCardStyles.titleIcon, { backgroundColor: accentColor + '30' }]}>
            <Ionicons name="water" size={18} color="#7dd8ff" />
          </View>
          <Text style={storyCardStyles.sectionTitle}>Story</Text>
        </View>

        {/* Overview text */}
        <Text style={storyCardStyles.storyText}>
          {movie?.overview || 'No description available for this title.'}
        </Text>

        {/* Meta grid */}
        <View style={storyCardStyles.metaGrid}>
          <View style={storyCardStyles.metaTile}>
            <View style={storyCardStyles.metaIconWrap}>
              <Ionicons name="calendar-outline" size={16} color="#7dd8ff" />
            </View>
            <View>
              <Text style={storyCardStyles.metaLabel}>Released</Text>
              <Text style={storyCardStyles.metaValue}>{releaseDateValue || 'TBA'}</Text>
            </View>
          </View>
          <View style={storyCardStyles.metaTile}>
            <View style={storyCardStyles.metaIconWrap}>
              <Ionicons name="globe-outline" size={16} color="#7dd8ff" />
            </View>
            <View>
              <Text style={storyCardStyles.metaLabel}>Language</Text>
              <Text style={storyCardStyles.metaValue}>
                {(movie as any)?.original_language?.toUpperCase?.() || '—'}
              </Text>
            </View>
          </View>
          <View style={storyCardStyles.metaTile}>
            <View style={storyCardStyles.metaIconWrap}>
              <Ionicons name="trending-up-outline" size={16} color="#7dd8ff" />
            </View>
            <View>
              <Text style={storyCardStyles.metaLabel}>Popularity</Text>
              <Text style={storyCardStyles.metaValue}>{Math.round((movie as any)?.popularity ?? 0)}</Text>
            </View>
          </View>
          <View style={storyCardStyles.metaTile}>
            <View style={storyCardStyles.metaIconWrap}>
              <Ionicons name="heart-outline" size={16} color="#7dd8ff" />
            </View>
            <View>
              <Text style={storyCardStyles.metaLabel}>Votes</Text>
              <Text style={storyCardStyles.metaValue}>{(movie as any)?.vote_count ?? 0}</Text>
            </View>
          </View>
        </View>

        {/* Feature badges */}
        <View style={storyCardStyles.badgeRow}>
          <View style={[storyCardStyles.badge, { borderColor: '#7dd8ff40' }]}>
            <Ionicons name="color-filter" size={14} color="#7dd8ff" />
            <Text style={storyCardStyles.badgeText}>Dolby Vision</Text>
          </View>
          <View style={[storyCardStyles.badge, { borderColor: '#06b6d440' }]}>
            <Ionicons name="flash" size={14} color="#06b6d4" />
            <Text style={storyCardStyles.badgeText}>Instant</Text>
          </View>
          <View style={[storyCardStyles.badge, { borderColor: '#22d3ee40' }]}>
            <Ionicons name="people" size={14} color="#22d3ee" />
            <Text style={storyCardStyles.badgeText}>Party</Text>
          </View>
        </View>
      </View>

      {/* Glass border */}
      <View style={storyCardStyles.glassBorder}>
        <LinearGradient
          colors={['rgba(125,216,255,0.3)', 'transparent', 'rgba(125,216,255,0.15)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
    </Animated.View>
  );
};

const storyCardStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 24,
    overflow: 'hidden',
    minHeight: 380,
  },
  glassWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    overflow: 'hidden',
  },
  androidGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,25,40,0.85)',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  waveContainer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
    borderRadius: 50,
    backgroundColor: 'rgba(125,216,255,0.6)',
  },
  bubble1: {
    width: 8,
    height: 8,
    bottom: 80,
    left: 40,
  },
  bubble2: {
    width: 6,
    height: 6,
    bottom: 60,
    right: 60,
  },
  bubble3: {
    width: 10,
    height: 10,
    bottom: 100,
    left: '50%',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 150,
    backgroundColor: '#fff',
    transform: [{ skewX: '-20deg' }],
  },
  content: {
    padding: 20,
    zIndex: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  storyText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '500',
    marginBottom: 20,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  metaTile: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(125,216,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(125,216,255,0.15)',
  },
  metaIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(125,216,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  metaValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(125,216,255,0.1)',
    borderWidth: 1,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(125,216,255,0.2)',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
});

interface Props {
  movie: Media | null;
  trailers: VideoType[];
  relatedMovies: Media[];
  isLoading: boolean;
  onWatchTrailer: (key?: string) => void;
  onBack: () => void;
  onSelectRelated: (id: number) => void;
  onAddToMyList: (movie: Media) => void;
  onOpenChatSheet: () => void;
  seasons: any[];
  mediaType?: string | string[] | undefined;
  cast: CastMember[];
}

const MovieDetailsView: React.FC<Props> = ({
  movie,
  trailers,
  relatedMovies,
  isLoading,
  onWatchTrailer,
  onBack,
  onSelectRelated,
  onAddToMyList,
  onOpenChatSheet,
  seasons,
  mediaType,
  cast,
}) => {
  type StreamResult = { url: string; type: 'mp4' | 'hls' | 'dash' | 'unknown'; quality?: string };
  type DetailsRow =
    | { type: 'stickyHeader'; key: string }
    | { type: 'hero'; key: string }
    | { type: 'quickActions'; key: string }
    | { type: 'rating'; key: string }
    | { type: 'stats'; key: string }
    | { type: 'story'; key: string }
    | { type: 'watchModes'; key: string }
    | { type: 'behindScenes'; key: string }
    | { type: 'episodesHeader'; key: string; variant: 'episodes' | 'sneakPeek' }
    | { type: 'episode'; key: string; season: any; episode: any }
    | { type: 'trailers'; key: string }
    | { type: 'related'; key: string }
    | { type: 'cast'; key: string };

  const [imdbTrailer, setIMDbTrailer] = useState<StreamResult | null>(null);
  const [autoPlayed, setAutoPlayed] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [autoPlaySecondsLeft, setAutoPlaySecondsLeft] = useState(5);
  const [selectedTab, setSelectedTab] = useState<'story' | 'episodes' | 'trailers' | 'related' | 'cast'>('story');
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);
  const [isInMyList, setIsInMyList] = useState(false);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const trailerCountdownAnim = useRef(new Animated.Value(0)).current;
  const videoRef = useRef<any>(null);
  const router = useRouter();
  const headerRef = React.useRef<any>(null);
  const normalizedMediaType: 'movie' | 'tv' = typeof mediaType === 'string' && mediaType === 'tv' ? 'tv' : 'movie';
  const { accentColor } = useAccent();
  const { currentPlan } = useSubscription();

  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(() => {
    const first = Array.isArray(seasons) && seasons.length ? seasons[0] : null;
    const id = typeof first?.id === 'number' ? first.id : null;
    return id;
  });

  useEffect(() => {
    if (!Array.isArray(seasons) || seasons.length === 0) {
      setSelectedSeasonId(null);
      return;
    }
    if (selectedSeasonId != null && seasons.some((s: any) => s?.id === selectedSeasonId)) {
      return;
    }
    const first = seasons[0];
    setSelectedSeasonId(typeof first?.id === 'number' ? first.id : null);
  }, [seasons, selectedSeasonId]);

  const selectedSeason = React.useMemo(() => {
    if (!Array.isArray(seasons) || seasons.length === 0) return null;
    const found = selectedSeasonId != null ? seasons.find((s: any) => s?.id === selectedSeasonId) : null;
    return found ?? seasons[0] ?? null;
  }, [seasons, selectedSeasonId]);

  const selectedSeasonEpisodes = React.useMemo(() => {
    const list = (selectedSeason as any)?.episodes;
    return Array.isArray(list) ? list : [];
  }, [selectedSeason]);

  const stopAnyTrailerPlayback = React.useCallback(() => {
    // Pause any in-header trailer (MovieHeader)
    try {
      headerRef.current?.pauseTrailer?.();
    } catch { }

    // Pause the inline hero trailer (expo-av Video)
    try {
      void videoRef.current?.pauseAsync?.();
      void videoRef.current?.stopAsync?.();
    } catch { }

    try {
      countdownInterval.current && clearInterval(countdownInterval.current);
    } catch { }

    try {
      trailerCountdownAnim.stopAnimation();
      trailerCountdownAnim.setValue(0);
    } catch { }

    setShowTrailer(false);
    setTrailerLoading(false);
    setIsMuted(true);
    setAutoPlayed(false);
  }, []);

  // Animation values
  const heroFadeAnim = React.useRef(new Animated.Value(0)).current;
  const fabScaleAnim = React.useRef(new Animated.Value(0)).current;
  const storyCardAnim = React.useRef(new Animated.Value(0)).current;
  const sectionsAnim = React.useRef(new Animated.Value(0)).current;

  // Start animations when component mounts
  React.useEffect(() => {
    // Hero content fade in
    Animated.timing(heroFadeAnim, {
      toValue: 1,
      duration: 800,
      delay: 300,
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

    // Story card slide up
    Animated.timing(storyCardAnim, {
      toValue: 1,
      duration: 600,
      delay: 800,
      useNativeDriver: true,
    }).start();

    // Sections stagger animation
    Animated.timing(sectionsAnim, {
      toValue: 1,
      duration: 1000,
      delay: 1000,
      useNativeDriver: true,
    }).start();
  }, [heroFadeAnim, fabScaleAnim, storyCardAnim, sectionsAnim]);
  const [isLaunchingPlayer, setIsLaunchingPlayer] = React.useState(false);
  const { scrape: scrapeDownload } = usePStream();
  const { user } = useUser();

  // Watch progress state
  type WatchProgressData = {
    progress: number; // 0-1
    positionMs: number;
    durationMs: number;
    updatedAt: number;
    seasonNumber?: number;
    episodeNumber?: number;
  };
  const [watchProgress, setWatchProgress] = React.useState<WatchProgressData | null>(null);
  const [episodeProgress, setEpisodeProgress] = React.useState<Record<string, WatchProgressData>>({});
  const progressBarAnim = React.useRef(new Animated.Value(0)).current;

  // Load watch progress from AsyncStorage and Firestore
  React.useEffect(() => {
    if (!movie?.id) return;
    let cancelled = false;

    const loadProgress = async () => {
      try {
        const profile = await getStoredActiveProfile();
        const key = buildProfileScopedKey('watchHistory', profile?.id ?? undefined);

        // First try AsyncStorage (local)
        const localRaw = await AsyncStorage.getItem(key);
        let localProgress: WatchProgressData | null = null;

        if (localRaw) {
          const localHistory = JSON.parse(localRaw) as any[];
          const entry = localHistory.find((item: any) => {
            if (mediaType === 'tv') {
              return item.id === movie.id || item.tmdbId === String(movie.id);
            }
            return item.id === movie.id || item.tmdbId === String(movie.id);
          });

          if (entry?.watchProgress) {
            localProgress = {
              progress: entry.watchProgress.progress ?? 0,
              positionMs: entry.watchProgress.positionMillis ?? entry.watchProgress.positionMs ?? 0,
              durationMs: entry.watchProgress.durationMillis ?? entry.watchProgress.durationMs ?? 0,
              updatedAt: entry.watchProgress.updatedAt ?? entry.watchProgress.updatedAtMs ?? Date.now(),
              seasonNumber: entry.watchProgress.seasonNumber ?? entry.seasonNumber,
              episodeNumber: entry.watchProgress.episodeNumber ?? entry.episodeNumber,
            };
          }
        }

        // Then try Firestore (cloud) for logged-in users
        if (user?.uid) {
          try {
            const docId = `${mediaType}-${movie.id}`;
            const docRef = doc(firestore, 'users', user.uid, 'watchHistory', docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
              const data = docSnap.data();
              const firestoreProgress: WatchProgressData = {
                progress: data?.watchProgress?.progress ?? data?.progress ?? 0,
                positionMs: data?.watchProgress?.positionMillis ?? data?.watchProgress?.positionMs ?? 0,
                durationMs: data?.watchProgress?.durationMillis ?? data?.watchProgress?.durationMs ?? 0,
                updatedAt: data?.watchProgress?.updatedAtMs ?? data?.watchProgress?.updatedAt ?? data?.updatedAtMs ?? Date.now(),
                seasonNumber: data?.watchProgress?.seasonNumber ?? data?.seasonNumber,
                episodeNumber: data?.watchProgress?.episodeNumber ?? data?.episodeNumber,
              };

              // Use Firestore data if it's more recent
              if (!localProgress || firestoreProgress.updatedAt > localProgress.updatedAt) {
                localProgress = firestoreProgress;
              }
            }

            // For TV shows, also load episode-specific progress
            if (mediaType === 'tv') {
              const episodesQuery = query(
                collection(firestore, 'users', user.uid, 'watchHistory'),
                where('tmdbId', '==', String(movie.id))
              );
              const episodesSnap = await getDocs(episodesQuery);
              const epProgress: Record<string, WatchProgressData> = {};

              episodesSnap.forEach((epDoc) => {
                const data = epDoc.data();
                if (data?.seasonNumber && data?.episodeNumber) {
                  const epKey = `s${data.seasonNumber}e${data.episodeNumber}`;
                  epProgress[epKey] = {
                    progress: data?.watchProgress?.progress ?? data?.progress ?? 0,
                    positionMs: data?.watchProgress?.positionMillis ?? data?.watchProgress?.positionMs ?? 0,
                    durationMs: data?.watchProgress?.durationMillis ?? data?.watchProgress?.durationMs ?? 0,
                    updatedAt: data?.watchProgress?.updatedAtMs ?? data?.watchProgress?.updatedAt ?? data?.updatedAtMs ?? Date.now(),
                    seasonNumber: data.seasonNumber,
                    episodeNumber: data.episodeNumber,
                  };
                }
              });

              if (!cancelled && Object.keys(epProgress).length > 0) {
                setEpisodeProgress(epProgress);
              }
            }
          } catch (err) {
            console.warn('[MovieDetails] Failed to load Firestore watch progress', err);
          }
        }

        if (!cancelled && localProgress && localProgress.progress > 0.01 && localProgress.progress < 0.98) {
          setWatchProgress(localProgress);
          // Animate progress bar
          Animated.timing(progressBarAnim, {
            toValue: localProgress.progress,
            duration: 800,
            useNativeDriver: false,
          }).start();
        }
      } catch (err) {
        console.warn('[MovieDetails] Failed to load watch progress', err);
      }
    };

    loadProgress();
    return () => { cancelled = true; };
  }, [movie?.id, mediaType, user?.uid, progressBarAnim]);

  // Format time helper
  const formatRemainingTime = useCallback((progressData: WatchProgressData) => {
    if (!progressData.durationMs || progressData.durationMs <= 0) return '';
    const remainingMs = progressData.durationMs - progressData.positionMs;
    const remainingMin = Math.max(0, Math.round(remainingMs / 60000));
    if (remainingMin < 1) return 'Less than 1 min left';
    if (remainingMin === 1) return '1 min left';
    return `${remainingMin} min left`;
  }, []);
  // Auto-fetch IMDb trailer and auto-play after a delay
  useEffect(() => {
    setIMDbTrailer(null);
    setAutoPlayed(false);
    setShowTrailer(false);
    setAutoPlaySecondsLeft(5);
    trailerCountdownAnim.stopAnimation();
    trailerCountdownAnim.setValue(0);
    if (!movie || !movie.imdb_id) return;
    let cancelled = false;
    const autoplayMs = 5000;
    scrapeIMDbTrailer({ imdb_id: movie.imdb_id })
      .then(async (result) => {
        // Fallback to ClipCafe if IMDB fails
        if (!result) {
          const year = movie.release_date ? movie.release_date.substring(0, 4) : undefined;
          const clip = await searchClipCafe(movie.title || '', year);
          if (clip?.url) {
            return { url: clip.url, type: 'mp4' as const };
          }
        }
        return result;
      })
      .then((result) => {
        if (!cancelled && result) {
          setIMDbTrailer(result);
          countdownInterval.current && clearInterval(countdownInterval.current);
          const startedAt = Date.now();
          countdownInterval.current = setInterval(() => {
            const elapsed = Date.now() - startedAt;
            const remaining = Math.max(0, autoplayMs - elapsed);
            setAutoPlaySecondsLeft(Math.max(0, Math.ceil(remaining / 1000)));
          }, 1000);

          Animated.timing(trailerCountdownAnim, {
            toValue: 1,
            duration: autoplayMs,
            useNativeDriver: false,
          }).start(({ finished }) => {
            if (!finished || cancelled) return;
            try {
              countdownInterval.current && clearInterval(countdownInterval.current);
            } catch { }
            setAutoPlayed(true);
            setShowTrailer(true);
            setTrailerLoading(false);
          });
        }
      })
      .catch(() => { });
    return () => {
      cancelled = true;
      countdownInterval.current && clearInterval(countdownInterval.current);
      trailerCountdownAnim.stopAnimation();
    };
  }, [movie?.imdb_id, trailerCountdownAnim]);
  const [episodeDownloads, setEpisodeDownloads] = React.useState<Record<string, { state: 'idle' | 'preparing' | 'downloading' | 'completed' | 'error'; progress: number; error?: string }>>({});

  const [qualityPickerVisible, setQualityPickerVisible] = React.useState(false);
  const [qualityPickerTitle, setQualityPickerTitle] = React.useState('');
  const [qualityPickerOptions, setQualityPickerOptions] = React.useState<DownloadQualityOption[]>([]);
  const onQualityPickRef = React.useRef<((option: DownloadQualityOption) => void) | null>(null);

  const openQualityPicker = React.useCallback(
    (title: string, options: DownloadQualityOption[], onPick: (option: DownloadQualityOption) => void) => {
      setQualityPickerTitle(title);
      setQualityPickerOptions(options);
      onQualityPickRef.current = onPick;
      setQualityPickerVisible(true);
    },
    [],
  );

  const handleQualityPick = React.useCallback((option: DownloadQualityOption) => {
    const handler = onQualityPickRef.current;
    onQualityPickRef.current = null;
    setQualityPickerVisible(false);
    try {
      handler?.(option);
    } catch {
      // ignore
    }
  }, []);
  const contentHint = React.useMemo(() => determineContentHint(movie), [movie]);
  const releaseDateValue = React.useMemo(() => {
    if (!movie) return undefined;
    return movie.release_date || movie.first_air_date || undefined;
  }, [movie]);
  const runtimeMinutes = React.useMemo(() => {
    if (!movie) return undefined;
    const directRuntime = (movie as any)?.runtime;
    if (typeof directRuntime === 'number' && directRuntime > 0) {
      return directRuntime;
    }
    const episodeRunTimes = (movie as any)?.episode_run_time;
    if (Array.isArray(episodeRunTimes) && episodeRunTimes.length > 0) {
      const candidate = episodeRunTimes.find((value: any) => typeof value === 'number' && value > 0);
      if (typeof candidate === 'number') {
        return candidate;
      }
    }
    return undefined;
  }, [movie]);
  const derivedGenreIds = React.useMemo(() => {
    if (!movie) return [];
    if (Array.isArray((movie as any).genre_ids)) return (movie as any).genre_ids;
    if (Array.isArray((movie as any).genres)) return (movie as any).genres.map((g: any) => g.id).filter(Boolean);
    return [];
  }, [movie]);

  const setEpisodeDownloadState = React.useCallback((episodeId: string, next: { state: 'idle' | 'preparing' | 'downloading' | 'completed' | 'error'; progress: number; error?: string }) => {
    setEpisodeDownloads((prev) => ({ ...prev, [episodeId]: next }));
  }, []);

  const buildUpcomingEpisodesPayload = () => {
    if (mediaType !== 'tv' || !Array.isArray(seasons) || seasons.length === 0) {
      return undefined;
    }
    const upcoming: Array<{
      id?: number;
      title?: string;
      seasonName?: string;
      seasonNumber?: number;
      seasonTmdbId?: number;
      episodeNumber?: number;
      episodeTmdbId?: number;
      overview?: string;
      runtime?: number;
      stillPath?: string | null;
      seasonEpisodeCount?: number;
    }> = [];


    seasons.forEach((season, idx) => {
      const seasonEpisodes = Array.isArray((season as any)?.episodes) ? (season as any).episodes : [];
      const filtered = idx === 0 ? seasonEpisodes.filter((ep: any) => ep.episode_number > 1) : seasonEpisodes;
      filtered.forEach((ep: any) => {
        upcoming.push({
          id: ep.id,
          title: ep.name,
          seasonName: season?.name ?? `Season ${idx + 1}`,
          episodeNumber: ep.episode_number,
          overview: ep.overview,
          runtime: ep.runtime,
          stillPath: ep.still_path,
          seasonNumber: season?.season_number ?? idx + 1,
          seasonTmdbId: season?.id,
          episodeTmdbId: ep?.id,
          seasonEpisodeCount: seasonEpisodes.length || undefined,
        });
      });
    });

    if (!upcoming.length) return undefined;
    return JSON.stringify(upcoming);
  };

  const findInitialEpisode = () => {
    if (mediaType !== 'tv' || !Array.isArray(seasons)) return null;
    const sortedSeasons = seasons
      .filter((season: any) => typeof season?.season_number === 'number' && season.season_number > 0)
      .sort((a: any, b: any) => a.season_number - b.season_number);
    for (const season of sortedSeasons) {
      const episodes = Array.isArray(season?.episodes) ? season.episodes : [];
      const sortedEpisodes = episodes
        .filter((ep: any) => typeof ep?.episode_number === 'number')
        .sort((a: any, b: any) => a.episode_number - b.episode_number);
      if (sortedEpisodes.length > 0) {
        return {
          season,
          episode: sortedEpisodes[0],
        };
      }
    }
    return null;
  };

  const computeReleaseYear = () => {
    const raw = movie?.release_date || movie?.first_air_date;
    if (!raw) return undefined;
    const parsed = parseInt(raw.slice(0, 4), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const buildDownloadPayload = () => {
    if (!movie) return null;
    const fallbackYear = computeReleaseYear() ?? new Date().getFullYear();
    if (normalizedMediaType === 'tv') {
      const initialEpisode = findInitialEpisode();
      if (!initialEpisode) {
        return null;
      }
      return {
        type: 'show' as const,
        title: movie.name || movie.title || 'TV Show',
        tmdbId: movie.id?.toString() ?? '',
        imdbId: movie.imdb_id ?? undefined,
        releaseYear: fallbackYear,
        season: {
          number: initialEpisode.season.season_number ?? 1,
          tmdbId: initialEpisode.season.id?.toString() ?? '',
          title: initialEpisode.season.name ?? `Season ${initialEpisode.season.season_number ?? 1}`,
          episodeCount: Array.isArray(initialEpisode.season?.episodes)
            ? initialEpisode.season.episodes.length
            : undefined,
        },
        episode: {
          number: initialEpisode.episode.episode_number ?? 1,
          tmdbId: initialEpisode.episode.id?.toString() ?? '',
        },
      };
    }
    return {
      type: 'movie' as const,
      title: movie.title || movie.name || 'Movie',
      tmdbId: movie.id?.toString() ?? '',
      imdbId: movie.imdb_id ?? undefined,
      releaseYear: fallbackYear,
    };
  };

  const buildRouteParams = (targetMediaType: string) => {
    const releaseYear = computeReleaseYear() ?? new Date().getFullYear();
    const params: Record<string, string> = {
      title: movie?.title || movie?.name || 'Now Playing',
      mediaType: targetMediaType,
      tmdbId: movie?.id?.toString() ?? '',
      releaseYear: releaseYear.toString(),
    };
    if (movie?.poster_path) {
      params.posterPath = movie.poster_path;
    }
    if (movie?.backdrop_path) {
      params.backdropPath = movie.backdrop_path;
    }
    if (movie?.overview) {
      params.overview = movie.overview;
    }
    if (releaseDateValue) {
      params.releaseDate = releaseDateValue;
    }
    if (typeof movie?.vote_average === 'number') {
      params.voteAverage = movie.vote_average.toString();
    }
    if (typeof runtimeMinutes === 'number' && runtimeMinutes > 0) {
      params.runtime = runtimeMinutes.toString();
    }
    if (derivedGenreIds.length > 0) {
      params.genreIds = derivedGenreIds.join(',');
    }
    if (movie?.imdb_id) {
      params.imdbId = movie.imdb_id;
    }
    const upcomingEpisodesPayload = buildUpcomingEpisodesPayload();
    if (upcomingEpisodesPayload) {
      params.upcomingEpisodes = upcomingEpisodesPayload;
    }
    return { params, releaseYear };
  };

  const handlePlayMovie = () => {
    if (!movie || isLaunchingPlayer) return;
    const { params } = buildRouteParams(normalizedMediaType);
    setIsLaunchingPlayer(true);

    try {
      // Ensure any trailer is paused/stopped so audio focus can be acquired by the player.
      stopAnyTrailerPlayback();
      if (normalizedMediaType === 'tv') {
        const initialEpisode = findInitialEpisode();
        if (!initialEpisode) {
          Alert.alert('Episodes loading', 'Please wait while we fetch the first episode details.');
          return;
        }
        params.seasonNumber = initialEpisode.season.season_number?.toString() ?? '';
        params.seasonTmdbId = initialEpisode.season.id?.toString() ?? '';
        params.episodeNumber = initialEpisode.episode.episode_number?.toString() ?? '';
        params.episodeTmdbId = initialEpisode.episode.id?.toString() ?? '';
        if (initialEpisode.season?.name) {
          params.seasonTitle = initialEpisode.season.name;
        }
        const episodeCount = Array.isArray(initialEpisode.season?.episodes)
          ? initialEpisode.season.episodes.length
          : undefined;
        if (typeof episodeCount === 'number' && episodeCount > 0) {
          params.seasonEpisodeCount = episodeCount.toString();
        }
      }
      if (contentHint) {
        params.contentHint = contentHint;
      }

      // Add resume position if available
      if (watchProgress && watchProgress.positionMs > 0) {
        (params as any).resumeMillis = String(watchProgress.positionMs);
      }

      const baseTarget = { pathname: '/video-player', params: { ...params } };
      const prefetchKey = createPrefetchKey(baseTarget);
      (baseTarget.params as any).__prefetchKey = prefetchKey;

      // best-effort prefetch to reduce time-to-first-frame
      try {
        const title = (baseTarget.params as any).title as string;
        const releaseYear = Number(baseTarget.params.releaseYear) || new Date().getFullYear();
        const tmdbId = String(baseTarget.params.tmdbId || '');
        const imdbId = (baseTarget.params as any).imdbId ? String((baseTarget.params as any).imdbId) : undefined;
        const preferAnimeSources = (baseTarget.params as any).contentHint === 'anime';
        const sourceOrder = buildSourceOrder(Boolean(preferAnimeSources));
        const debugTag = buildScrapeDebugTag('details-prefetch', title);

        void (async () => {
          try {
            const mediaPayload =
              normalizedMediaType === 'tv'
                ? {
                  type: 'show' as const,
                  title,
                  tmdbId,
                  imdbId,
                  releaseYear,
                  season: {
                    number: Number((baseTarget.params as any).seasonNumber) || 1,
                    tmdbId: String((baseTarget.params as any).seasonTmdbId || ''),
                    title: String((baseTarget.params as any).seasonTitle || `Season ${Number((baseTarget.params as any).seasonNumber) || 1}`),
                    ...(baseTarget.params.seasonEpisodeCount
                      ? { episodeCount: Number((baseTarget.params as any).seasonEpisodeCount) }
                      : {}),
                  },
                  episode: {
                    number: Number((baseTarget.params as any).episodeNumber) || 1,
                    tmdbId: String((baseTarget.params as any).episodeTmdbId || ''),
                  },
                }
                : {
                  type: 'movie' as const,
                  title,
                  tmdbId,
                  imdbId,
                  releaseYear,
                };

            const playback = await scrapePStream(mediaPayload as any, { sourceOrder, debugTag });
            storePrefetchedPlayback(prefetchKey, {
              playback,
              title:
                normalizedMediaType === 'tv'
                  ? `${title} • S${String(Number((baseTarget.params as any).seasonNumber) || 1).padStart(2, '0')}E${String(Number((baseTarget.params as any).episodeNumber) || 1).padStart(2, '0')}`
                  : title,
            });
          } catch {
            // ignore
          }
        })();
      } catch {
        // ignore
      }

      pushWithOptionalInterstitial(
        router as any,
        currentPlan,
        baseTarget,
        { placement: 'details_play', seconds: 30 },
      );
    } finally {
      setIsLaunchingPlayer(false);
    }
  };

  const handlePlayEpisode = (episode: any, season: any) => {
    if (!movie || !season) return;

    // Pause/stop any playing trailer before navigating
    stopAnyTrailerPlayback();

    const { params } = buildRouteParams('tv');
    const seasonNumber = season?.season_number ?? episode?.season_number ?? 1;
    const episodeNumber = episode?.episode_number ?? 1;

    params.seasonNumber = seasonNumber.toString();
    if (season?.id) params.seasonTmdbId = season.id.toString();
    params.episodeNumber = episodeNumber.toString();
    if (episode?.id) params.episodeTmdbId = episode.id.toString();
    if (season?.name) params.seasonTitle = season.name;
    const episodeCount = Array.isArray(season?.episodes) ? season.episodes.length : undefined;
    if (typeof episodeCount === 'number' && episodeCount > 0) {
      params.seasonEpisodeCount = episodeCount.toString();
    }
    if (contentHint) {
      params.contentHint = contentHint;
    }

    const baseTarget = { pathname: '/video-player', params: { ...params } };
    const prefetchKey = createPrefetchKey(baseTarget);
    (baseTarget.params as any).__prefetchKey = prefetchKey;

    try {
      const title = (baseTarget.params as any).title as string;
      const releaseYear = Number(baseTarget.params.releaseYear) || new Date().getFullYear();
      const tmdbId = String(baseTarget.params.tmdbId || '');
      const imdbId = (baseTarget.params as any).imdbId ? String((baseTarget.params as any).imdbId) : undefined;
      const preferAnimeSources = (baseTarget.params as any).contentHint === 'anime';
      const sourceOrder = buildSourceOrder(Boolean(preferAnimeSources));
      const debugTag = buildScrapeDebugTag('details-prefetch-episode', title);

      void (async () => {
        try {
          const seasonNumber = Number((baseTarget.params as any).seasonNumber) || 1;
          const episodeNumber = Number((baseTarget.params as any).episodeNumber) || 1;
          const mediaPayload = {
            type: 'show' as const,
            title,
            tmdbId,
            imdbId,
            releaseYear,
            season: {
              number: seasonNumber,
              tmdbId: String((baseTarget.params as any).seasonTmdbId || ''),
              title: String((baseTarget.params as any).seasonTitle || `Season ${seasonNumber}`),
              ...(baseTarget.params.seasonEpisodeCount
                ? { episodeCount: Number((baseTarget.params as any).seasonEpisodeCount) }
                : {}),
            },
            episode: {
              number: episodeNumber,
              tmdbId: String((baseTarget.params as any).episodeTmdbId || ''),
            },
          };

          const playback = await scrapePStream(mediaPayload as any, { sourceOrder, debugTag });
          storePrefetchedPlayback(prefetchKey, {
            playback,
            title: `${title} • S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`,
          });
        } catch {
          // ignore
        }
      })();
    } catch {
      // ignore
    }

    pushWithOptionalInterstitial(
      router as any,
      currentPlan,
      baseTarget,
      { placement: 'details_episode', seconds: 30 },
    );
  };

  const handleDownloadEpisode = async (episode: any, season: any) => {
    if (!movie) return;
    if (!episode || !season) {
      Alert.alert('Download unavailable', 'Episode information is missing.');
      return;
    }

    const episodeRuntimeMinutes =
      typeof episode?.runtime === 'number' && episode.runtime > 0 ? episode.runtime : runtimeMinutes;

    const payload = {
      type: 'show' as const,
      title: movie.name || movie.title || 'TV Show',
      tmdbId: movie.id?.toString() ?? '',
      imdbId: movie.imdb_id ?? undefined,
      releaseYear: computeReleaseYear() ?? new Date().getFullYear(),
      season: {
        number: season.season_number ?? season.seasonNumber ?? 1,
        tmdbId: season.id?.toString() ?? '',
        title: season.name ?? `Season ${season.season_number ?? 1}`,
        episodeCount: Array.isArray(season?.episodes) ? season.episodes.length : undefined,
      },
      episode: {
        number: episode.episode_number ?? 1,
        tmdbId: episode.id?.toString() ?? '',
      },
    };

    const title = payload.title;
    const episodeLabel = `S${String(payload.season.number).padStart(2, '0')}E${String(payload.episode.number).padStart(2, '0')}`;
    const subtitleParts = ['Episode', episodeLabel, episode?.name ?? null, episodeRuntimeMinutes ? `${episodeRuntimeMinutes}m` : null]
      .filter(Boolean);
    const subtitle = subtitleParts.length ? subtitleParts.join(' • ') : null;
    const epKey = String(episode.id ?? payload.episode.tmdbId ?? `${payload.season.number}-${payload.episode.number}`);

    setEpisodeDownloadState(epKey, { state: 'preparing', progress: 0 });

    try {
      const playback = await scrapeDownload(payload, { debugTag: `[download-episode] ${title}` });
      const headers = (playback.headers ?? {}) as Record<string, string>;
      const uri = playback.uri || '';
      const isHls = playback.stream?.type === 'hls' || uri.toLowerCase().includes('.m3u8');

      const startQueuedDownload = async (opt: DownloadQualityOption) => {
        await enqueueDownload({
          title,
          mediaId: movie.id ?? undefined,
          mediaType: normalizedMediaType,
          subtitle,
          runtimeMinutes: episodeRuntimeMinutes,
          seasonNumber: payload.season.number,
          episodeNumber: payload.episode.number,
          releaseDate: releaseDateValue,
          posterPath: episode?.still_path || movie.poster_path,
          backdropPath: movie.backdrop_path,
          overview: (episode?.overview || movie.overview) ?? null,
          downloadType: isHls ? 'hls' : 'file',
          sourceUrl: opt.url,
          headers,
          qualityLabel: opt.label,
        });
        setEpisodeDownloadState(epKey, { state: 'downloading', progress: 0 });
        Alert.alert('Added to downloads', `${title} ${episodeLabel} • ${opt.label}`, [
          { text: 'OK' },
          { text: 'Go to downloads', onPress: () => router.push('/downloads') },
        ]);
      };

      let options: DownloadQualityOption[] = [];
      if (isHls) {
        const variants = await getHlsVariantOptions(uri, headers).catch(() => null);
        options =
          variants?.map((v) => ({ id: v.id, label: v.label, url: v.url })) ??
          [{ id: 'auto', label: 'Auto (best)', url: uri }];
      } else {
        const qualities = (playback.stream as any)?.qualities as Record<string, { url?: string }> | undefined;
        const order = ['4k', '1080', '720', '480', '360', 'unknown'];
        options = (order
          .map((key) => ({ key, url: qualities?.[key]?.url }))
          .filter((q) => !!q.url)
          .map((q) => ({
            id: q.key,
            label: q.key === 'unknown' ? 'Auto' : `${q.key}p`,
            url: q.url as string,
          })));
        if (!options.length) {
          options = [{ id: 'auto', label: 'Auto', url: uri }];
        }
      }

      if (options.length === 1) {
        await startQueuedDownload(options[0]);
      } else {
        openQualityPicker(`${title} ${episodeLabel}`, options, (opt) => {
          void startQueuedDownload(opt);
        });
      }
    } catch (err: any) {
      setEpisodeDownloadState(epKey, { state: 'error', progress: 0, error: err?.message ?? String(err) });
      Alert.alert('Download failed', err?.message || 'Unable to queue this download right now.');
    }
  };

  const handleDownload = async () => {
    try {
      if (!movie) return;
      const payload = buildDownloadPayload();
      if (!payload) {
        Alert.alert('Download unavailable', 'We could not find an episode to download yet.');
        return;
      }

      const title = movie.title || movie.name || 'Download';
      const episodeLabel =
        payload.type === 'show'
          ? `S${String(payload.season.number).padStart(2, '0')}E${String(payload.episode.number).padStart(2, '0')}`
          : null;
      const subtitleParts = [
        payload.type === 'show' ? 'Episode' : 'Movie',
        episodeLabel,
        runtimeMinutes ? `${runtimeMinutes}m` : null,
      ].filter(Boolean);
      const subtitle = subtitleParts.length ? subtitleParts.join(' • ') : null;

      const playback = await scrapeDownload(payload as any, { debugTag: `[download] ${title}` });
      const headers = (playback.headers ?? {}) as Record<string, string>;
      const uri = playback.uri || '';
      const isHls = playback.stream?.type === 'hls' || uri.toLowerCase().includes('.m3u8');

      const startQueuedDownload = async (opt: DownloadQualityOption) => {
        await enqueueDownload({
          title,
          mediaId: movie.id ?? undefined,
          mediaType: normalizedMediaType,
          subtitle,
          runtimeMinutes,
          seasonNumber: payload.type === 'show' ? payload.season.number : undefined,
          episodeNumber: payload.type === 'show' ? payload.episode.number : undefined,
          releaseDate: releaseDateValue,
          posterPath: movie.poster_path,
          backdropPath: movie.backdrop_path,
          overview: movie.overview ?? null,
          downloadType: isHls ? 'hls' : 'file',
          sourceUrl: opt.url,
          headers,
          qualityLabel: opt.label,
        });
        Alert.alert('Added to downloads', `${title}${episodeLabel ? ` • ${episodeLabel}` : ''} • ${opt.label}`, [
          { text: 'OK' },
          { text: 'Go to downloads', onPress: () => router.push('/downloads') },
        ]);
      };

      let options: DownloadQualityOption[] = [];
      if (isHls) {
        const variants = await getHlsVariantOptions(uri, headers).catch(() => null);
        options =
          variants?.map((v) => ({ id: v.id, label: v.label, url: v.url })) ??
          [{ id: 'auto', label: 'Auto (best)', url: uri }];
      } else {
        const qualities = (playback.stream as any)?.qualities as Record<string, { url?: string }> | undefined;
        const order = ['4k', '1080', '720', '480', '360', 'unknown'];
        options = (order
          .map((key) => ({ key, url: qualities?.[key]?.url }))
          .filter((q) => !!q.url)
          .map((q) => ({
            id: q.key,
            label: q.key === 'unknown' ? 'Auto' : `${q.key}p`,
            url: q.url as string,
          })));
        if (!options.length) {
          options = [{ id: 'auto', label: 'Auto', url: uri }];
        }
      }

      if (options.length === 1) {
        await startQueuedDownload(options[0]);
      } else {
        openQualityPicker(title, options, (opt) => {
          void startQueuedDownload(opt);
        });
      }
    } catch (err: any) {
      Alert.alert('Download failed', err?.message || 'Unable to queue this download right now.');
    }
  };

  const rows = React.useMemo<DetailsRow[]>(() => {
    const base: DetailsRow[] = [
      { type: 'stickyHeader', key: 'stickyHeader' },
      { type: 'hero', key: 'hero' },
      { type: 'quickActions', key: 'quickActions' },
    ];

    const hasEpisodeData =
      normalizedMediaType === 'tv' &&
      Array.isArray(seasons) &&
      seasons.length > 0 &&
      Boolean(selectedSeason) &&
      selectedSeasonEpisodes.length > 0;

    if (selectedTab === 'story') {
      base.push({ type: 'rating', key: 'rating' });
      base.push({ type: 'stats', key: 'stats' });
      base.push({ type: 'story', key: 'story' });
      base.push({ type: 'watchModes', key: 'watchModes' });
      base.push({ type: 'behindScenes', key: 'behindScenes' });
      return base;
    }

    if (selectedTab === 'episodes') {
      if (hasEpisodeData) {
        base.push({ type: 'episodesHeader', key: 'episodesHeader', variant: 'episodes' });
        for (let i = 0; i < selectedSeasonEpisodes.length; i += 1) {
          const ep = selectedSeasonEpisodes[i];
          const epKey = String((ep as any)?.id ?? (ep as any)?.episode_number ?? i);
          const seasonKey = String((selectedSeason as any)?.id ?? (selectedSeason as any)?.season_number ?? 'season');
          base.push({ type: 'episode', key: `episode-${seasonKey}-${epKey}`, season: selectedSeason, episode: ep });
        }
      } else {
        base.push({ type: 'story', key: 'story' });
      }
      return base;
    }

    if (selectedTab === 'trailers') {
      base.push({ type: 'trailers', key: 'trailers' });
      if (hasEpisodeData) {
        base.push({ type: 'episodesHeader', key: 'sneakPeekHeader', variant: 'sneakPeek' });
        for (let i = 0; i < selectedSeasonEpisodes.length; i += 1) {
          const ep = selectedSeasonEpisodes[i];
          const epKey = String((ep as any)?.id ?? (ep as any)?.episode_number ?? i);
          const seasonKey = String((selectedSeason as any)?.id ?? (selectedSeason as any)?.season_number ?? 'season');
          base.push({
            type: 'episode',
            key: `sneak-episode-${seasonKey}-${epKey}`,
            season: selectedSeason,
            episode: ep,
          });
        }
      }
      return base;
    }

    if (selectedTab === 'related') {
      base.push({ type: 'related', key: 'related' });
      return base;
    }

    if (selectedTab === 'cast') {
      base.push({ type: 'cast', key: 'cast' });
      return base;
    }

    return base;
  }, [normalizedMediaType, seasons, selectedSeason, selectedSeasonEpisodes, selectedTab]);

  const renderRow = React.useCallback(
    ({ item }: { item: DetailsRow }) => {
      switch (item.type) {
        case 'stickyHeader':
          return (
            <View style={styles.stickyHeader}>
              <View style={styles.headerWrap}>
                <LinearGradient
                  colors={[
                    accentColor ? `${accentColor}33` : 'rgba(229,9,20,0.22)',
                    'rgba(10,12,24,0.4)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.headerGlow}
                />
                <View style={styles.headerBar}>
                  <View style={styles.titleRow}>
                    <View style={styles.accentDot} />
                    <View>
                      <Text style={styles.headerEyebrow}>Movie Details</Text>
                      <Text style={styles.headerText}>{movie?.title || movie?.name || 'Details'}</Text>
                    </View>
                  </View>

                  <View style={styles.headerIcons}>
                    <TouchableOpacity onPress={onOpenChatSheet} style={styles.iconBtn}>
                      <LinearGradient
                        colors={['#e50914', '#b20710']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.iconBg}
                      >
                        <Ionicons
                          name="chatbubble-outline"
                          size={22}
                          color="#ffffff"
                          style={styles.iconMargin}
                        />
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => movie && onAddToMyList(movie)} style={styles.iconBtn}>
                      <LinearGradient
                        colors={['#e50914', '#b20710']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.iconBg}
                      >
                        <Ionicons
                          name="bookmark-outline"
                          size={22}
                          color="#ffffff"
                          style={styles.iconMargin}
                        />
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
                      <LinearGradient
                        colors={['#e50914', '#b20710']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.iconBg}
                      >
                        <Ionicons
                          name="chevron-back"
                          size={22}
                          color="#ffffff"
                          style={styles.iconMargin}
                        />
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.headerMetaRow}>
                  <View style={styles.metaPill}>
                    <Ionicons name="star" size={14} color="#fff" />
                    <Text style={styles.metaText}>
                      {movie?.vote_average ? movie.vote_average.toFixed(1) : '0.0'}
                    </Text>
                  </View>
                  <View style={[styles.metaPill, styles.metaPillSoft]}>
                    <Ionicons name="time-outline" size={14} color="#fff" />
                    <Text style={styles.metaText}>{runtimeMinutes ? `${runtimeMinutes}m` : 'N/A'}</Text>
                  </View>
                  <View style={[styles.metaPill, styles.metaPillOutline]}>
                    <Ionicons name="film-outline" size={14} color="#fff" />
                    <Text style={styles.metaText}>{normalizedMediaType === 'tv' ? 'TV Show' : 'Movie'}</Text>
                  </View>
                </View>
              </View>
            </View>
          );

        case 'hero':
          return (
            <>
              <View style={styles.heroSection}>
                {!showTrailer && (
                  <ExpoImage
                    source={{
                      uri: movie?.poster_path
                        ? `${IMAGE_BASE_URL}${movie.poster_path}`
                        : 'https://via.placeholder.com/800x450/111/fff?text=No+Poster',
                    }}
                    style={styles.heroImage}
                    contentFit="cover"
                    transition={220}
                    cachePolicy="memory-disk"
                  />
                )}

                {showTrailer && imdbTrailer?.url && (
                  <Video
                    ref={videoRef}
                    source={{ uri: imdbTrailer.url }}
                    style={styles.heroVideo}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay
                    isMuted={isMuted}
                    isLooping
                    onLoadStart={() => setTrailerLoading(true)}
                    onLoad={() => setTrailerLoading(false)}
                    onError={() => {
                      setTrailerLoading(false);
                      setShowTrailer(false);
                    }}
                  />
                )}

                {showTrailer && trailerLoading && (
                  <View style={styles.trailerLoading}>
                    <Ionicons name="play-circle-outline" size={60} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.loadingText}>Loading trailer...</Text>
                  </View>
                )}

                <LinearGradient
                  colors={[
                    'rgba(0,0,0,0.1)',
                    'rgba(0,0,0,0.3)',
                    'rgba(10,6,20,0.7)',
                    'rgba(10,6,20,0.9)',
                  ]}
                  locations={[0, 0.3, 0.7, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.heroOverlay}
                />

                <Animated.View style={[styles.heroContent, { opacity: heroFadeAnim }]}>
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {movie?.title || movie?.name || 'Untitled'}
                  </Text>
                  <Text style={styles.heroYear}>
                    {movie?.release_date
                      ? new Date(movie.release_date).getFullYear()
                      : movie?.first_air_date
                        ? new Date(movie.first_air_date).getFullYear()
                        : ''}
                  </Text>

                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={14} color="#FFD700" />
                    <Text style={styles.ratingText}>
                      {movie?.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}
                    </Text>
                  </View>
                </Animated.View>

                {showTrailer && !trailerLoading && (
                  <TouchableOpacity style={styles.volumeButton} onPress={() => setIsMuted(!isMuted)}>
                    <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={24} color="#fff" />
                  </TouchableOpacity>
                )}

                <View style={styles.genreTags}>
                  <Text style={styles.genreText}>
                    {normalizedMediaType === 'tv' ? 'TV Series' : 'Movie'} •{' '}
                    {runtimeMinutes ? `${runtimeMinutes}m` : 'N/A'}
                  </Text>
                </View>

                {!showTrailer && imdbTrailer && (
                  <View style={styles.countdownContainer}>
                    <Text style={styles.countdownText}>Trailer in {autoPlaySecondsLeft || 1}s</Text>
                    <View style={styles.countdownBar}>
                      <Animated.View
                        style={[
                          styles.countdownProgress,
                          {
                            width: trailerCountdownAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0%', '100%'],
                            }),
                          },
                        ]}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.inlinePlayNow}
                      onPress={() => {
                        setAutoPlayed(true);
                        setShowTrailer(true);
                        countdownInterval.current && clearInterval(countdownInterval.current);
                        trailerCountdownAnim.stopAnimation();
                        trailerCountdownAnim.setValue(1);
                        setAutoPlaySecondsLeft(0);
                      }}
                    >
                      <Ionicons name="play" size={18} color="#fff" />
                      <Text style={styles.inlinePlayText}>Play teaser now</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <Animated.View style={[styles.floatingActions, { transform: [{ scale: fabScaleAnim }] }]}>
                {/* Play button with progress */}
                <View style={styles.playButtonContainer}>
                  <TouchableOpacity
                    style={[
                      styles.fabPrimary,
                      isLaunchingPlayer && styles.fabDisabled,
                      {
                        backgroundColor: accentColor || '#ff6b9d',
                        shadowColor: accentColor || '#ff6b9d',
                      },
                    ]}
                    onPress={handlePlayMovie}
                    disabled={isLaunchingPlayer}
                  >
                    <Ionicons name="play" size={24} color="#fff" />
                    <Text style={styles.fabPrimaryText}>
                      {isLaunchingPlayer ? 'Loading...' : watchProgress ? 'Resume' : 'Play'}
                    </Text>
                  </TouchableOpacity>

                  {/* Progress bar overlay */}
                  {watchProgress && (
                    <View style={styles.playProgressContainer}>
                      <View style={styles.playProgressTrack}>
                        <Animated.View
                          style={[
                            styles.playProgressFill,
                            {
                              width: progressBarAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0%', '100%'],
                              }),
                              backgroundColor: accentColor || '#ff6b9d',
                            }
                          ]}
                        />
                      </View>
                      <View style={styles.playProgressInfo}>
                        <Text style={styles.playProgressPercent}>
                          {Math.round(watchProgress.progress * 100)}%
                        </Text>
                        {watchProgress.durationMs > 0 && (
                          <Text style={styles.playProgressTime}>
                            {formatRemainingTime(watchProgress)}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </View>

                <TouchableOpacity style={styles.fabSecondary} onPress={handleDownload}>
                  <Ionicons name="cloud-download-outline" size={20} color="#fff" />
                </TouchableOpacity>
              </Animated.View>

              <Animated.View style={[styles.tabContainer, { opacity: sectionsAnim }]}>
                <View style={styles.tabButtons}>
                  {[
                    { key: 'story', label: 'Story', icon: 'book-outline' },
                    mediaType === 'tv' && seasons?.length > 0
                      ? { key: 'episodes', label: 'Episodes', icon: 'albums-outline' }
                      : null,
                    { key: 'trailers', label: 'Trailers', icon: 'play-circle-outline' },
                    { key: 'related', label: 'More Like This', icon: 'heart-outline' },
                    { key: 'cast', label: 'Cast', icon: 'people-outline' },
                  ]
                    .filter(Boolean)
                    .map((tab) => (
                      <TouchableOpacity
                        key={(tab as any).key}
                        style={[styles.tabButton, selectedTab === (tab as any).key && styles.tabButtonActive]}
                        onPress={() => setSelectedTab((tab as any).key as any)}
                      >
                        <Ionicons
                          name={(tab as any).icon as any}
                          size={18}
                          color={selectedTab === (tab as any).key ? '#fff' : 'rgba(255,255,255,0.6)'}
                        />
                        <Text
                          style={[
                            styles.tabButtonText,
                            selectedTab === (tab as any).key && styles.tabButtonTextActive,
                          ]}
                        >
                          {(tab as any).label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </Animated.View>
            </>
          );

        case 'story':
          return (
            <StoryCardWithWater
              movie={movie}
              releaseDateValue={releaseDateValue}
              storyCardAnim={storyCardAnim}
              accentColor={accentColor}
            />
          );

        case 'episodesHeader': {
          const title = item.variant === 'episodes' ? 'Episodes' : 'Season Sneak Peek';
          const iconName = item.variant === 'episodes' ? 'albums-outline' : 'tv-outline';
          const helper = item.variant === 'episodes' ? 'Binge or jump to a moment.' : 'Catch up before you stream.';
          return (
            <View style={styles.tabContentOuter}>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Ionicons name={iconName as any} size={20} color={accentColor || '#ff6b9d'} />
                  <Text style={styles.sectionTitle}>{title}</Text>
                  <Text style={styles.sectionHelper}>{helper}</Text>
                </View>
                <View style={styles.seasonPickerWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.seasonPickerContent}
                  >
                    {(Array.isArray(seasons) ? seasons : []).map((season: any, idx: number) => {
                      const id = season?.id;
                      const selected = id != null && id === selectedSeasonId;
                      return (
                        <TouchableOpacity
                          key={String(id ?? season?.season_number ?? season?.name ?? idx)}
                          style={[styles.seasonPill, selected && styles.seasonPillSelected]}
                          onPress={() => {
                            if (typeof id === 'number') setSelectedSeasonId(id);
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.seasonPillText, selected && styles.seasonPillTextSelected]}>
                            {String(season?.name ?? 'Season')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            </View>
          );
        }

        case 'episode':
          return (
            <View style={styles.tabContentOuter}>
              <EpisodeCard
                episode={item.episode}
                season={item.season}
                disabled={isLoading || isLaunchingPlayer}
                downloads={episodeDownloads}
                onPlay={handlePlayEpisode as any}
                onDownload={handleDownloadEpisode as any}
                accentColor={accentColor}
              />
            </View>
          );

        case 'trailers':
          return (
            <View style={styles.tabContentOuter}>
              <View style={styles.sectionCard}>
                <TrailerList trailers={trailers} isLoading={isLoading} onWatchTrailer={(key) => onWatchTrailer(key)} />
              </View>
            </View>
          );

        case 'related':
          return (
            <View style={styles.tabContentOuter}>
              <View style={styles.sectionCard}>
                <RelatedMovies relatedMovies={relatedMovies} isLoading={isLoading} onSelectRelated={onSelectRelated} />
              </View>
            </View>
          );

        case 'cast':
          return (
            <View style={styles.tabContentOuter}>
              <View style={styles.sectionCard}>
                <CastList cast={cast} />
              </View>
            </View>
          );

        case 'quickActions':
          return null; // Actions are now in hero section

        case 'rating':
          return (
            <InteractiveRating
              currentRating={movie?.vote_average || 0}
              voteCount={(movie as any)?.vote_count || 0}
              accentColor={accentColor || '#e50914'}
            />
          );

        case 'stats':
          return (
            <ImmersiveStats
              movie={movie}
              accentColor={accentColor || '#e50914'}
            />
          );

        case 'watchModes':
          return (
            <WatchModes
              onWatchParty={() => {
                if (movie) {
                  router.push({
                    pathname: '/watchparty',
                    params: { movieId: movie.id?.toString(), title: movie.title || movie.name },
                  } as any);
                }
              }}
              onDownload={handleDownload}
              onAddToList={() => movie && onAddToMyList(movie)}
              onShare={() => {
                // Share functionality
              }}
              accentColor={accentColor || '#e50914'}
            />
          );

        case 'behindScenes':
          return (
            <BehindTheScenes
              movie={movie}
              cast={cast}
              onCastPress={(member) => {
                // Navigate to cast details if needed
              }}
              accentColor={accentColor || '#e50914'}
            />
          );

        default:
          return null;
      }
    },
    [
      accentColor,
      autoPlaySecondsLeft,
      cast,
      episodeDownloads,
      fabScaleAnim,
      handleDownload,
      handleDownloadEpisode,
      handlePlayEpisode,
      handlePlayMovie,
      heroFadeAnim,
      imdbTrailer,
      isLaunchingPlayer,
      isLoading,
      isMuted,
      mediaType,
      movie,
      normalizedMediaType,
      onAddToMyList,
      onBack,
      onOpenChatSheet,
      onSelectRelated,
      onWatchTrailer,
      relatedMovies,
      releaseDateValue,
      router,
      runtimeMinutes,
      seasons,
      sectionsAnim,
      selectedSeasonId,
      selectedTab,
      setSelectedTab,
      showTrailer,
      storyCardAnim,
      trailerCountdownAnim,
      trailerLoading,
      trailers,
    ],
  );

  return (
    <View style={styles.root}>
      <DownloadQualityPicker
        visible={qualityPickerVisible}
        title={qualityPickerTitle}
        options={qualityPickerOptions}
        onClose={() => setQualityPickerVisible(false)}
        onSelect={handleQualityPick}
      />
      <FlashList<DetailsRow>
        data={rows}
        renderItem={renderRow}
        keyExtractor={(item: DetailsRow) => item.key}
        estimatedItemSize={260}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollViewContent}
        stickyHeaderIndices={[0]}
        onScroll={(e: any) => {
          const y = e.nativeEvent.contentOffset.y;
          if (y > 400 && !showMiniPlayer) {
            setShowMiniPlayer(true);
          } else if (y <= 400 && showMiniPlayer) {
            setShowMiniPlayer(false);
          }
        }}
      />

      <FloatingMiniPlayer
        visible={showMiniPlayer}
        movie={movie}
        onPlay={handlePlayMovie}
        onDismiss={() => setShowMiniPlayer(false)}
        accentColor={accentColor || '#e50914'}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 40,
    paddingTop: 0,
  },
  tabContentOuter: {
    marginHorizontal: 12,
    marginBottom: 16,
  },
  seasonPickerWrap: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  seasonPickerContent: {
    paddingVertical: 10,
    gap: 10,
    paddingRight: 12,
  },
  seasonPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  seasonPillSelected: {
    backgroundColor: '#e50914',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  seasonPillText: {
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  seasonPillTextSelected: {
    color: '#fff',
  },
  // Sticky Header Container
  stickyHeader: {
    backgroundColor: 'transparent',
  },
  // Designed Header like movies.tsx
  headerWrap: {
    marginHorizontal: 12,
    marginTop: Platform.OS === 'ios' ? 80 : 50,
    marginBottom: 0,
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
  // Hero Section
  heroSection: {
    marginHorizontal: 12,
    marginTop: 0,
    marginBottom: 24,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
  },
  heroImage: {
    width: '100%',
    height: 520,
    backgroundColor: 'rgba(5,6,15,0.8)',
  },
  heroVideo: {
    width: '100%',
    height: 520,
    backgroundColor: '#000',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  volumeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  trailerLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  countdownContainer: {
    position: 'absolute',
    bottom: 60,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  countdownText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  countdownBar: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  countdownProgress: {
    height: '100%',
    backgroundColor: '#e50914',
    borderRadius: 2,
  },
  inlinePlayNow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inlinePlayText: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  heroContent: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 80,
    alignItems: 'center',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
    marginBottom: 8,
  },
  heroYear: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,215,0,0.2)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  ratingText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '800',
  },
  genreTags: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
  },
  genreText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Floating Action Buttons
  floatingActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 32,
    gap: 16,
  },
  fabPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: '#ff6b9d',
    borderRadius: 28,
    shadowColor: '#ff6b9d',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  fabPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  fabSecondary: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  fabDisabled: {
    opacity: 0.5,
  },
  // Story Card
  storyCard: {
    marginHorizontal: 20,
    marginBottom: 32,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,107,157,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  storyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  storyText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
    gap: 10,
  },
  metaTile: {
    width: '48%',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  metaTileLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  metaTileValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  immersiveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 8,
  },
  immersiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(229,9,20,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.3)',
  },
  immersiveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  // Tab Container
  tabContainer: {
    marginHorizontal: 12,
    marginTop: 20,
  },
  tabButtons: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: '#e50914',
  },
  tabButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  tabContent: {
    minHeight: 300,
  },
  // Sections Container
  sectionsContainer: {
    marginHorizontal: 20,
    gap: 24,
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,107,157,0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHelper: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginLeft: 'auto',
  },
  // Watch progress styles
  playButtonContainer: {
    alignItems: 'center',
  },
  playProgressContainer: {
    marginTop: 8,
    alignItems: 'center',
    width: '100%',
  },
  playProgressTrack: {
    width: 120,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  playProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  playProgressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  playProgressPercent: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  playProgressTime: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
});

export default MovieDetailsView;

function determineContentHint(media?: Media | null): string | undefined {
  if (!media) return undefined;
  const genreIds = Array.isArray(media.genre_ids) ? media.genre_ids : [];
  const explicitGenres: string[] = Array.isArray((media as any)?.genres)
    ? (media as any).genres.map((g: any) => (g?.name || '').toLowerCase())
    : [];
  const originCountries: string[] = Array.isArray((media as any)?.origin_country)
    ? (media as any).origin_country
    : [];
  const originalLanguage = (media as any)?.original_language;
  const titleCheck = `${media.title || ''} ${media.name || ''}`.toLowerCase();
  const ANIMATION_GENRE_ID = 16;
  if (
    genreIds.includes(ANIMATION_GENRE_ID) ||
    explicitGenres.some(name => name.includes('animation') || name.includes('anime')) ||
    originCountries.includes('JP') ||
    originalLanguage === 'ja' ||
    titleCheck.includes('anime')
  ) {
    return 'anime';
  }
  return undefined;
}
