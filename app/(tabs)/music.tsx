import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Audio, ResizeMode, Video } from 'expo-av';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Dimensions,
  ImageBackground,
  Modal,
  Animated as RNAnimated,
  NativeEventEmitter,
  NativeModules,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGlobalMusicPlayer } from '../components/GlobalMusicPlayer';

import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../../constants/api';
import { LyricsResolver } from '../../src/pstream/LyricsResolver';
import { RecommendationAlgo } from '../../src/pstream/RecommendationAlgo';
import { usePStream } from '../../src/pstream/usePStream';
import { Media } from '../../types';
import { enqueueDownload } from '../../lib/downloadManager';
import { LyricsView } from '../components/music/LyricsView';
import { SongCard, SongRow } from '../components/SongItem';
import NativePlaybackControlsView from '../components/NativePlaybackControlsView';
import NativeVinylView from '../components/NativeVinylView';
import NativeWaveformView from '../components/NativeWaveformView';
import { useSubscription } from '../../providers/SubscriptionProvider';
import LiquidGlass from '../components/LiquidGlass';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const GENRE_FILTERS = [
  { id: 'all', label: 'All', icon: 'musical-notes' },
  { id: 'trending', label: 'Trending', icon: 'trending-up' },
  { id: 'action', label: 'Action', icon: 'flash' },
  { id: 'romance', label: 'Romance', icon: 'heart' },
  { id: 'animation', label: 'Animation', icon: 'color-palette' },
  { id: 'drama', label: 'Drama', icon: 'film' },
];

const ACCENT_PALETTES: [string, string][] = [
  ['#e50914', '#ff4d4d'],
  ['#1db954', '#1ed760'],
  ['#6366f1', '#a78bfa'],
  ['#f59e0b', '#fbbf24'],
  ['#ec4899', '#f472b6'],
];

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const isAudioUri = (uri?: string | null) => {
  if (!uri) return false;
  const clean = uri.split('?')[0].split('#')[0];
  const ext = clean.split('.').pop()?.toLowerCase();
  if (!ext) return false;
  return ['m4a', 'mp3', 'aac', 'ogg', 'opus', 'wav', 'flac'].includes(ext);
};

type WaveAnim = { value: number };
type AppStateChangeStatus = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

const WaveBar = memo(({ anim, color }: { anim: WaveAnim; color: string }) => {
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: anim.value }]
  }));
  return (
    <Animated.View
      style={[
        styles.waveBarLarge,
        { backgroundColor: color },
        style
      ]}
    />
  );
});
WaveBar.displayName = 'WaveBar';

type PlayerMode = 'video' | 'audio';

interface PlayerState {
  isPlaying: boolean;
  position: number;
  duration: number;
  isLoading: boolean;
  isBuffering: boolean;
}

const MusicPlayer = memo(function MusicPlayer({
  visible,
  active,
  minimized,
  track,
  accentColor,
  onClose,
  onExpand,
  onStop,
}: {
  visible: boolean;
  active: boolean;
  minimized: boolean;
  track: Media | null;
  accentColor: string;
  onClose: () => void;
  onExpand: () => void;
  onStop: () => void;
}) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<any>(null);
  const soundRef = useRef<any>(null);
  const router = useRouter();
  const { getMusicStream, searchMusic } = usePStream();
  const { currentPlan } = useSubscription();

  const [mode, setMode] = useState<PlayerMode>('video');
  const [audioFallbackToVideo, setAudioFallbackToVideo] = useState(false);
  const allowBackground = currentPlan !== 'free';
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    position: 0,
    duration: 0,
    isLoading: true,
    isBuffering: false,
  });
  const [streamData, setStreamData] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const [streamError, setStreamError] = useState(false);
  const [showVideo, setShowVideo] = useState(true);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [upNextTab, setUpNextTab] = useState<'upnext' | 'related'>('upnext');
  const [relatedCandidates, setRelatedCandidates] = useState<Media[]>([]);

  // Queue State
  const [queue, setQueue] = useState<Media[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const activeTrack = queue[currentIndex] || track;

  // Lyrics State
  const [lyrics, setLyrics] = useState<any[]>([]);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  // Reanimated Shared Values
  const slideAnim = useSharedValue(SCREEN_HEIGHT);
  const rotateAnim = useSharedValue(0);
  const upNextSheetRef = useRef<BottomSheet | null>(null);
  const recommendationSeedRef = useRef<string | number | null>(null);
  const upNextSnapPoints = useMemo(() => ['16%', '48%', '82%'], []);

  const openUpNextSheet = useCallback(() => {
    upNextSheetRef.current?.snapToIndex(1);
  }, []);

  // Fixed number of shared values (5 bars) - explicit hooks to satisfy Rules of Hooks
  const wave1 = useSharedValue(0.3);
  const wave2 = useSharedValue(0.3);
  const wave3 = useSharedValue(0.3);
  const wave4 = useSharedValue(0.3);
  const wave5 = useSharedValue(0.3);

  // Create stable array reference
  const waveAnims = useMemo(() => [wave1, wave2, wave3, wave4, wave5], []);

  // Styles
  const modalStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideAnim.value }]
  }));

  const vinylStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateAnim.value}deg` }]
  }));

  const posterUri = useMemo(() => {
    if (!activeTrack?.poster_path) return null;
    if (activeTrack.poster_path.startsWith('http')) return activeTrack.poster_path;
    return `${IMAGE_BASE_URL}${activeTrack.poster_path}`;
  }, [activeTrack?.poster_path]);
  const backdropUri = useMemo(() => {
    if (!activeTrack?.backdrop_path) return posterUri;
    if (activeTrack.backdrop_path.startsWith('http')) return activeTrack.backdrop_path;
    return `${IMAGE_BASE_URL}${activeTrack.backdrop_path}`;
  }, [activeTrack?.backdrop_path, posterUri]);
  const title = activeTrack?.title || activeTrack?.name || 'Unknown Track';
  const year = (activeTrack?.release_date || activeTrack?.first_air_date || '').slice(0, 4);
  const activeArtist = (activeTrack as any)?.artist || (activeTrack as any)?.channelTitle || '';
  const localUri = (activeTrack as any)?.localUri as string | undefined;
  const activeVideoId = (activeTrack as any)?.videoId as string | undefined;
  const localIsAudio = useMemo(() => isAudioUri(localUri), [localUri]);
  const playbackTarget: PlayerMode = localIsAudio
    ? 'audio'
    : (mode === 'audio' && !audioFallbackToVideo ? 'audio' : 'video');
  const shouldUseVideoPlayer = playbackTarget === 'video';
  const isPlayingRef = useRef(false);
  const nowPlayingTsRef = useRef(0);

  useEffect(() => {
    isPlayingRef.current = playerState.isPlaying;
  }, [playerState.isPlaying]);

  const pushNowPlayingUpdate = useCallback((
    overrides?: Partial<{
      title: string;
      artist: string;
      artworkUrl: string;
      isPlaying: boolean;
      positionMs: number;
      durationMs: number;
    }>,
    force = false,
  ) => {
    const service = (NativeModules as any)?.MusicPlaybackServiceModule;
    if (!service?.updateNowPlaying || !activeTrack) return;
    const now = Date.now();
    if (!force && now - nowPlayingTsRef.current < 1000) return;
    nowPlayingTsRef.current = now;
    service.updateNowPlaying({
      title: overrides?.title ?? title,
      artist: overrides?.artist ?? (activeArtist || 'MovieFlix Music'),
      artworkUrl: overrides?.artworkUrl ?? (posterUri || ''),
      isPlaying: overrides?.isPlaying ?? playerState.isPlaying,
      positionMs: Math.max(0, Math.floor(overrides?.positionMs ?? playerState.position)),
      durationMs: Math.max(0, Math.floor(overrides?.durationMs ?? playerState.duration)),
    });
  }, [activeArtist, activeTrack, playerState.duration, playerState.isPlaying, playerState.position, posterUri, title]);

  // Animate entrance & Queue Init
  useEffect(() => {
    if (visible) {
      slideAnim.value = withSpring(0, { damping: 15, stiffness: 90 });
      if (track) {
        // Reset queue with initial track
        setQueue([track]);
        setCurrentIndex(0);
        setRelatedCandidates([]);
        recommendationSeedRef.current = null;
      }
    } else {
      slideAnim.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
      setQueue([]);
      setCurrentIndex(0);
      setRelatedCandidates([]);
      recommendationSeedRef.current = null;
    }
  }, [visible, track]);

  useEffect(() => {
    if (!active) return;
    void Audio.setIsEnabledAsync(true).catch(() => { });
    void Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeAndroid: 2, // INTERRUPTION_MODE_ANDROID_DUCK_OTHERS = 2
      interruptionModeIOS: 2,   // INTERRUPTION_MODE_IOS_DUCK_OTHERS = 2
    });
  }, [active]);

  useEffect(() => {
    if (mode === 'audio') {
      setAudioFallbackToVideo(false);
    }
  }, [mode, activeTrack?.id]);

  useEffect(() => {
    if (localIsAudio && mode !== 'audio') {
      setMode('audio');
    }
  }, [localIsAudio, mode]);

  const handleAudioStatusUpdate = useCallback((status: any) => {
    if (!status.isLoaded) {
      setPlayerState((s) => ({ ...s, isBuffering: false }));
      return;
    }

    setPlayerState((s) => ({
      ...s,
      isPlaying: status.isPlaying,
      position: status.positionMillis,
      duration: status.durationMillis || 0,
      isBuffering: status.isBuffering,
      isLoading: false,
    }));

    if (status.didJustFinish) {
      if (repeat) {
        void soundRef.current?.replayAsync?.();
      } else {
        // handleNextTrack called later
        const next = () => {
          if (currentIndex < queue.length - 1) {
            setCurrentIndex(prev => prev + 1);
          }
        };
        next();
      }
    }
  }, [currentIndex, queue.length, repeat]);

  const loadAudioStream = useCallback(async (stream: { uri: string; headers?: Record<string, string> }) => {
    if (!stream?.uri) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const sound = new Audio.Sound();
      sound.setOnPlaybackStatusUpdate(handleAudioStatusUpdate);
      await sound.loadAsync(
        { uri: stream.uri, headers: stream.headers },
        { shouldPlay: true },
        false
      );
      soundRef.current = sound;
    } catch (err) {
      console.warn('[MusicPlayer] Audio load failed:', err);
      if (mode === 'audio') {
        setAudioFallbackToVideo(true);
        setPlayerState((s) => ({ ...s, isLoading: false, isBuffering: false, isPlaying: true }));
        return;
      }
      setStreamError(true);
      setPlayerState((s) => ({ ...s, isLoading: false }));
    }
  }, [handleAudioStatusUpdate, mode]);

  useEffect(() => {
    if (mode === 'audio') {
      setShowVideo(false);
      if (!audioFallbackToVideo) {
        void videoRef.current?.pauseAsync?.();
        if (streamData?.uri && !soundRef.current) {
          void loadAudioStream({ uri: streamData.uri, headers: streamData.headers });
        }
      }
    } else {
      if (soundRef.current) {
        void soundRef.current.unloadAsync?.();
        soundRef.current = null;
      }
      if (streamData?.uri && videoRef.current) {
        void videoRef.current.playAsync?.();
      }
    }
  }, [audioFallbackToVideo, loadAudioStream, mode, streamData]);

  useEffect(() => {
    if (mode === 'video') {
      setShowVideo(true);
    }
  }, [mode]);

  useEffect(() => {
    setRelatedCandidates([]);
  }, [activeTrack?.id, currentIndex]);

  // Vinyl rotation
  useEffect(() => {
    if (playerState.isPlaying && mode === 'audio') {
      rotateAnim.value = withRepeat(
        withTiming(360, { duration: 3000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotateAnim);
    }
  }, [playerState.isPlaying, mode]);

  // Waveform animation
  useEffect(() => {
    if (playerState.isPlaying) {
      waveAnims.forEach((anim, i) => {
        anim.value = withRepeat(
          withSequence(
            withTiming(0.8 + Math.random() * 0.2, { duration: 300 + i * 100 }),
            withTiming(0.3 + Math.random() * 0.2, { duration: 300 + i * 100 })
          ),
          -1,
          true
        );
      });
    } else {
      waveAnims.forEach(anim => cancelAnimation(anim));
    }
  }, [playerState.isPlaying]);

  // Handle Play Next / Prev
  const handleNextTrack = useCallback(() => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Loop or stop? For now stop or replay if repeat is on
      if (repeat) {
        if (mode === 'audio') {
          void soundRef.current?.replayAsync?.();
        } else {
          void videoRef.current?.replayAsync?.();
        }
      }
    }
  }, [currentIndex, mode, queue.length, repeat]);

  const handlePrevTrack = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else {
      if (mode === 'audio') {
        void soundRef.current?.replayAsync?.();
      } else {
        void videoRef.current?.replayAsync?.();
      }
    }
  }, [currentIndex, mode]);

  const handleStartPlaybackService = useCallback(() => {
    const service = (NativeModules as any)?.MusicPlaybackServiceModule;
    if (!service) return;
    if (service.startService) {
      service.startService(title, activeArtist || 'Now Playing');
    }
    if (service.updateNowPlaying) {
      service.updateNowPlaying({
        title,
        artist: activeArtist || 'MovieFlix Music',
        artworkUrl: posterUri || '',
        isPlaying: playerState.isPlaying,
        positionMs: Math.max(0, Math.floor(playerState.position)),
        durationMs: Math.max(0, Math.floor(playerState.duration)),
      });
    }
  }, [activeArtist, playerState.duration, playerState.isPlaying, playerState.position, posterUri, title]);

  const handleStopPlaybackService = useCallback(() => {
    const service = (NativeModules as any)?.MusicPlaybackServiceModule;
    if (!service?.stopService) return;
    service.stopService();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateChangeStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (!isPlayingRef.current) return;

        // Video can't play in background, switch to audio
        if (mode === 'video' && streamData?.uri) {
          setMode('audio');
        }

        if (!allowBackground) {
          setTimeout(() => {
            if (soundRef.current) {
              void soundRef.current.pauseAsync?.();
            }
            if (videoRef.current) {
              void videoRef.current.pauseAsync?.();
            }
            setPlayerState((s) => ({
              ...s,
              isPlaying: false,
            }));
            handleStopPlaybackService();
          }, 300);
        }
      }
    });
    return () => sub.remove();
  }, [allowBackground, handleStopPlaybackService, mode, streamData?.uri]);

  const normalizeRecommendation = useCallback((item: any): Media | null => {
    const videoId = item?.videoId || item?.id;
    if (!videoId) return null;
    const artist =
      item?.artist ||
      item?.uploaderName ||
      item?.channelTitle ||
      (Array.isArray(item?.artists) ? item.artists[0]?.name : undefined);
    const poster =
      item?.thumbnail ||
      item?.thumb ||
      item?.thumbnailUrl ||
      item?.thumbnails?.[0]?.url ||
      item?.thumbnails?.[0]?.src ||
      '';
    return {
      id: videoId,
      videoId,
      media_type: 'music',
      title: item?.title || 'Unknown Track',
      poster_path: poster,
      artist: artist || undefined,
    } as Media;
  }, []);

  const applyRecommendations = useCallback(async (rawRelated?: any[]) => {
    if (!activeTrack) return;
    const seedKey = (activeTrack as any)?.videoId || activeTrack?.id;
    if (!seedKey) return;

    if (recommendationSeedRef.current === seedKey && relatedCandidates.length > 0) return;
    recommendationSeedRef.current = seedKey;

    let pool = Array.isArray(rawRelated) ? rawRelated : [];
    if (pool.length < 20) {
      try {
        const extra = await searchMusic(`${title} ${activeArtist || ''}`.trim(), {
          artist: activeArtist || undefined,
        });
        if (Array.isArray(extra)) {
          pool = [...pool, ...extra];
        }
      } catch (err) {
        console.warn('[MusicPlayer] Fallback recommendations failed:', err);
      }
    }

    const baseQueue = queue.length ? queue : [activeTrack];
    const processed = RecommendationAlgo.processQueue(baseQueue, pool, activeTrack);
    const normalized = processed.map(normalizeRecommendation).filter(Boolean) as Media[];
    const seen = new Set<string | number>();
    const unique: Media[] = [];
    normalized.forEach((item) => {
      const id = (item as any).videoId || item.id;
      if (!id || seen.has(id)) return;
      seen.add(id);
      unique.push(item);
    });

    const nextUp = unique.slice(0, 10);
    const related = unique.slice(10, 20);

    setRelatedCandidates(related.length ? related : unique.slice(0, 10));

    setQueue((prev) => {
      if (!prev.length) return [activeTrack, ...nextUp];
      const first = prev[0] as any;
      const firstKey = first?.videoId || first?.id;
      if (prev.length === 1 && firstKey === seedKey) {
        return [activeTrack, ...nextUp];
      }
      return prev;
    });
  }, [activeArtist, activeTrack, normalizeRecommendation, queue, relatedCandidates.length, searchMusic, title]);

  const handleDownload = useCallback(async () => {
    if (!activeTrack) return;
    if (currentPlan === 'free') {
      Alert.alert(
        'Upgrade required',
        'Downloads are available on Plus and Premium plans.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/premium?source=music-download') },
        ],
      );
      return;
    }
    if (localUri) {
      Alert.alert('Already downloaded', 'This song is already saved for offline playback.');
      return;
    }
    if (!streamData?.uri) {
      Alert.alert('Download unavailable', 'The audio stream is not ready yet.');
      return;
    }
    try {
      await enqueueDownload({
        title,
        mediaType: 'music',
        subtitle: activeArtist || null,
        artist: activeArtist || null,
        videoId: activeVideoId,
        posterPath: activeTrack.poster_path ?? null,
        backdropPath: activeTrack.backdrop_path ?? null,
        overview: activeTrack.overview ?? null,
        runtimeMinutes: playerState.duration ? Math.round(playerState.duration / 60000) : undefined,
        releaseDate: activeTrack.release_date ?? activeTrack.first_air_date ?? undefined,
        downloadType: 'file',
        sourceUrl: streamData.uri,
        headers: streamData.headers,
        qualityLabel: mode === 'audio' ? 'Audio' : 'Video',
      });
      Alert.alert('Added to downloads', `${title}${activeArtist ? ` • ${activeArtist}` : ''}`, [
        { text: 'OK' },
        { text: 'Go to downloads', onPress: () => router.push('/downloads') },
      ]);
    } catch (err: any) {
      Alert.alert('Download failed', err?.message || 'Unable to queue this download right now.');
    }
  }, [activeArtist, activeTrack, activeVideoId, currentPlan, localUri, mode, playerState.duration, router, streamData, title]);

  // Cleanup on close
  useEffect(() => {
    if (!active) {
      videoRef.current?.pauseAsync();
      soundRef.current?.unloadAsync();
      handleStopPlaybackService();
      setPlayerState({
        isPlaying: false,
        position: 0,
        duration: 0,
        isLoading: true,
        isBuffering: false,
      });
    }
  }, [active, handleStopPlaybackService]);

  useEffect(() => {
    if (!allowBackground) {
      handleStopPlaybackService();
      return;
    }
    if (active && playerState.isPlaying) {
      handleStartPlaybackService();
    }
    if (!active || !playerState.isPlaying) {
      handleStopPlaybackService();
    }
  }, [active, allowBackground, handleStartPlaybackService, handleStopPlaybackService, playerState.isPlaying]);

  useEffect(() => {
    if (!active) {
      handleStopPlaybackService();
      return;
    }
    handleStartPlaybackService();
    pushNowPlayingUpdate(undefined, true);
  }, [active, activeTrack?.id, handleStartPlaybackService, handleStopPlaybackService, pushNowPlayingUpdate]);

  useEffect(() => {
    if (!active || !playerState.isPlaying) return;
    const interval = setInterval(() => {
      pushNowPlayingUpdate();
    }, 1000);
    return () => clearInterval(interval);
  }, [active, playerState.isPlaying, pushNowPlayingUpdate]);

  const handlePlaybackStatusUpdate = useCallback((status: any) => {
    if (!status.isLoaded) {
      setPlayerState((s) => ({ ...s, isBuffering: false }));
      return;
    }

    setPlayerState((s) => ({
      ...s,
      isPlaying: status.isPlaying,
      position: status.positionMillis,
      duration: status.durationMillis || 0,
      isBuffering: status.isBuffering,
      isLoading: false,
    }));

    if (status.didJustFinish) {
      if (repeat) {
        videoRef.current?.replayAsync();
      } else {
        handleNextTrack();
      }
    }
  }, [repeat, handleNextTrack]);

  // Fetch video/trailer
  useEffect(() => {
    if (!activeTrack || !visible) return;

    let cancelled = false;
    setPlayerState((s) => ({ ...s, isLoading: true }));
    setStreamData(null);
    setStreamError(false);

    // Reset Lyrics
    setLyrics([]);
    setLyricsLoading(true);
    setShowLyrics(false);

    // Fetch Lyrics
    LyricsResolver.getLyrics(activeTrack.title || activeTrack.name || '', activeArtist || '')
      .then(res => {
        console.log('[MusicPlayer] Lyrics response:', res ? 'Found' : 'Null', res?.lines?.length);
        if (!cancelled && res?.lines) {
          setLyrics(res.lines);
        }
        setLyricsLoading(false);
      })
      .catch((err) => {
        console.warn('[MusicPlayer] Lyrics fetch error:', err);
        setLyricsLoading(false);
      });

    (async () => {
      try {
        console.log(`[MusicPlayer] Fetching ${playbackTarget} stream for track:`, activeTrack.title);

        const handleResolvedStream = (stream: any, fallbackRelated?: any[]) => {
          setStreamData(stream);
          if (playbackTarget === 'audio') {
            setPlayerState((s) => ({ ...s, isLoading: true, isBuffering: false }));
            void loadAudioStream({ uri: stream.uri, headers: stream.headers });
          } else {
            if (mode === 'audio') setShowVideo(false);
            setPlayerState((s) => ({ ...s, isLoading: false, isPlaying: true }));
          }
          void applyRecommendations(stream?.related?.length ? stream.related : fallbackRelated);
        };

        if (localUri) {
          handleResolvedStream({ uri: localUri });
          return;
        }

        // Improve Lyrics search with artist if available from track data
        // We do this concurrently with stream fetching but inside the effect for simplicity
        const artistName = (activeTrack as any).artist || (activeTrack as any).channelTitle || '';
        if (artistName) {
          LyricsResolver.getLyrics(activeTrack.title || activeTrack.name || '', artistName)
            .then(res => {
              if (!cancelled && res?.lines) {
                setLyrics(res.lines);
              }
            });
        }

        // [NEW] Check if it's a song Result (has videoId and media_type='music' or similar)
        const songItem = activeTrack as any;
        if (songItem.videoId || songItem.media_type === 'music') {
          const vidId = songItem.videoId || (songItem.id && String(songItem.id));
          if (vidId) {
            const stream: any = await getMusicStream(vidId, mode, false, {
              artist: activeArtist || undefined,
            });
            if (!cancelled && stream?.uri && stream.uri !== vidId) {
              console.log(`[MusicPlayer] Resolved direct YT ${mode} stream:`, stream.uri);
              handleResolvedStream(stream);
              return;
            }
          }
        }

        // Try to get TMDB details if we have a real numeric ID
        const isNumericId = typeof activeTrack.id === 'number' && activeTrack.id > 100;
        if (isNumericId && songItem.media_type !== 'music') {
          const detailsRes = await fetch(
            `${API_BASE_URL}/movie/${activeTrack.id}?api_key=${API_KEY}&append_to_response=external_ids,videos`
          );
          const details = await detailsRes.json();

          if (cancelled) return;

          // Check for YouTube trailer in TMDB response
          const videos = details.videos?.results || [];
          const trailer = videos.find((v: any) =>
            v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
          );

          if (trailer?.key) {
            const stream: any = await getMusicStream(trailer.key, mode, false, {
              artist: activeArtist || undefined,
            });
            if (stream?.uri && stream.uri !== trailer.key && !cancelled) {
              console.log(`[MusicPlayer] Resolved TMDB trailer ${mode} stream:`, stream.uri);
              handleResolvedStream(stream);
              return;
            }
          }
        }

        // Final fallback - try searching for the soundtrack on YT Music
        // Try multiple results since some videos may be region-blocked
        try {
          const searchResults = await searchMusic(`${title} Soundtrack`, {
            artist: activeArtist || undefined,
          });
          if (searchResults && searchResults.length > 0 && !cancelled) {
            // Try up to 5 results
            for (let i = 0; i < Math.min(5, searchResults.length); i++) {
              if (cancelled) break;
              try {
                const result = searchResults[i];
                console.log(`[MusicPlayer] Trying fallback result ${i + 1}:`, result.title || result.videoId);
                const stream: any = await getMusicStream(result.videoId, mode, false, {
                  artist: activeArtist || undefined,
                });
                if (stream?.uri && !cancelled) {
                  console.log(`[MusicPlayer] Resolved fallback search ${mode} stream:`, stream.uri);
                  handleResolvedStream(stream, searchResults);

                  setQueue((prev) => {
                    const next = [...prev];
                    const updated: Media = {
                      ...(next[currentIndex] || {}),
                      media_type: 'music',
                      title: result.title || next[currentIndex]?.title,
                      poster_path: result.thumbnail || next[currentIndex]?.poster_path,
                      artist: result.artist || (Array.isArray((result as any).artists) ? (result as any).artists[0]?.name : undefined),
                      videoId: result.videoId,
                    } as Media;
                    if (next[currentIndex]) {
                      next[currentIndex] = updated;
                      return next;
                    }
                    return [updated];
                  });

                  // [NEW] Attempt to fetch lyrics for the actual resolved song
                  const resolvedArtist = result.artist || (Array.isArray((result as any).artists) ? (result as any).artists[0]?.name : '') || '';
                  if (resolvedArtist) {
                    LyricsResolver.getLyrics(result.title, resolvedArtist)
                      .then(lyr => {
                        if (lyr?.lines && !cancelled) setLyrics(lyr.lines);
                      })
                      .catch(() => { });
                  }

                  return;
                }
              } catch (streamErr) {
                console.warn(`[MusicPlayer] Fallback ${i + 1} failed:`, streamErr);
              }
            }
          }
        } catch (searchErr) {
          console.warn('[MusicPlayer] YT Music fallback failed:', searchErr);
        }

        // Fallback - no video available
        if (!cancelled) {
          console.warn('[MusicPlayer] All stream resolution attempts failed');
          setStreamError(true);
          setPlayerState((s) => ({ ...s, isLoading: false }));
        }
      } catch (e) {
        if (!cancelled) {
          setPlayerState((s) => ({ ...s, isLoading: false }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeArtist, activeTrack, applyRecommendations, currentIndex, getMusicStream, loadAudioStream, localUri, mode, playbackTarget, searchMusic, title, visible]);

  const handlePlayRequest = useCallback(async () => {
    if (mode === 'audio') {
      await soundRef.current?.playAsync?.();
    } else {
      await videoRef.current?.playAsync?.();
    }
    pushNowPlayingUpdate({ isPlaying: true }, true);
  }, [mode, pushNowPlayingUpdate]);

  const handlePauseRequest = useCallback(async () => {
    if (mode === 'audio') {
      await soundRef.current?.pauseAsync?.();
    } else {
      await videoRef.current?.pauseAsync?.();
    }
    pushNowPlayingUpdate({ isPlaying: false }, true);
  }, [mode, pushNowPlayingUpdate]);

  const togglePlayPause = useCallback(async () => {
    if (playerState.isPlaying) {
      await handlePauseRequest();
    } else {
      await handlePlayRequest();
    }
  }, [handlePauseRequest, handlePlayRequest, playerState.isPlaying]);

  useEffect(() => {
    const module = (NativeModules as any)?.MusicPlaybackServiceModule;
    if (!module) return;
    const emitter = new NativeEventEmitter(module);
    const sub = emitter.addListener('MusicPlaybackAction', (action: string) => {
      const normalized = String(action || '').toLowerCase();
      switch (normalized) {
        case 'play':
          void handlePlayRequest();
          break;
        case 'pause':
        case 'stop':
          void handlePauseRequest();
          break;
        case 'playpause':
        case 'toggle':
          void togglePlayPause();
          break;
        case 'next':
        case 'skiptonext':
        case 'forward':
          handleNextTrack();
          break;
        case 'prev':
        case 'previous':
        case 'skiptoprevious':
        case 'back':
          handlePrevTrack();
          break;
        default:
          break;
      }
    });
    return () => sub.remove();
  }, [handleNextTrack, handlePauseRequest, handlePlayRequest, handlePrevTrack, togglePlayPause]);

  const seekTo = useCallback(async (position: number) => {
    if (mode === 'audio') {
      const sound = soundRef.current;
      if (sound) {
        await sound.setPositionAsync(position);
      }
      return;
    }
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(position);
    }
  }, [mode]);

  const skipForward = useCallback(async () => {
    const newPos = Math.min(playerState.position + 10000, playerState.duration);
    await seekTo(newPos);
  }, [playerState.position, playerState.duration, seekTo]);

  const skipBackward = useCallback(async () => {
    const newPos = Math.max(playerState.position - 10000, 0);
    await seekTo(newPos);
  }, [playerState.position, seekTo]);

  const upNextItems = useMemo(() => {
    return queue.filter((_, index) => index !== currentIndex).slice(0, 10);
  }, [queue, currentIndex]);

  const relatedItems = useMemo(() => {
    if (relatedCandidates.length > 0) return relatedCandidates.slice(0, 10);
    return upNextItems;
  }, [relatedCandidates, upNextItems]);



  if (!track) return null;

  return (
    <>
      <Modal visible={visible} animationType="none" transparent statusBarTranslucent>
        <Animated.View style={[styles.playerModal, modalStyle]}>
          <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        {/* Background */}
        {backdropUri && (
          <ImageBackground source={{ uri: backdropUri }} style={styles.playerBg} blurRadius={50}>
            <LinearGradient
              colors={['rgba(5,6,15,0.7)', 'rgba(5,6,15,0.95)', 'rgba(5,6,15,1)']}
              style={StyleSheet.absoluteFill}
            />
          </ImageBackground>
        )}

        {/* Accent glow */}
        <LinearGradient
          pointerEvents="none"
          colors={[`${accentColor}44`, 'transparent']}
          style={styles.playerGlow}
        />

        {/* Header */}
        <View style={[styles.playerHeader, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={styles.playerHeaderBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-down" size={28} color="#fff" />
          </TouchableOpacity>

          <View style={styles.playerHeaderCenter}>
            <Text style={styles.playerHeaderTitle}>Now Playing</Text>
            <Text style={styles.playerHeaderSubtitle}>Movie Soundtrack</Text>
          </View>

          <TouchableOpacity style={styles.playerHeaderBtn} onPress={openUpNextSheet}>
            <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Mode Selector Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, mode === 'video' && { backgroundColor: 'rgba(255,255,255,0.1)' }]}
            onPress={() => setMode('video')}
          >
            <Ionicons name="videocam" size={16} color={mode === 'video' ? '#fff' : 'rgba(255,255,255,0.4)'} />
            <Text style={[styles.tabText, mode === 'video' && styles.tabTextActive]}>Video</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'audio' && { backgroundColor: 'rgba(255,255,255,0.1)' }]}
            onPress={() => setMode('audio')}
          >
            <Ionicons name="musical-notes" size={16} color={mode === 'audio' ? '#fff' : 'rgba(255,255,255,0.4)'} />
            <Text style={[styles.tabText, mode === 'audio' && styles.tabTextActive]}>Audio</Text>
          </TouchableOpacity>
        </View>

        {/* Main content */}
        <View style={styles.playerContent}>
          {/* Player Layer (Video mode) */}
          {streamData?.uri && shouldUseVideoPlayer ? (
            <View style={(mode === 'video' && showVideo) ? styles.videoContainer : { height: 0, width: 0, overflow: 'hidden', position: 'absolute' }}>
              <Video
                ref={videoRef}
                source={{
                  uri: streamData.uri,
                  headers: streamData.headers
                }}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={playerState.isPlaying}
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                onError={(err: any) => {
                  console.error('[MusicPlayer] Stream error:', err);
                  if (!streamError) setStreamError(true);
                  setPlayerState(s => ({ ...s, isLoading: false }));
                }}
              />

              {(mode === 'video' && showVideo) && (
                <TouchableOpacity
                  style={styles.videoToggle}
                  onPress={() => setShowVideo(false)}
                >
                  <Ionicons name="musical-notes" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            (streamError || (!playerState.isLoading && !streamData)) && (
              <View style={[styles.videoContainer, styles.errorContainer]}>
                <Ionicons name="cloud-offline-outline" size={48} color="rgba(255,255,255,0.4)" />
                <Text style={styles.errorText}>Stream unavailable</Text>
                <Text style={[styles.errorText, { fontSize: 12, marginTop: 4 }]}>
                  Track restricted or unavailable
                </Text>
              </View>
            )
          )}

          {/* Album Art Layer (Audio mode or hidden video) */}
          {(!(mode === 'video' && showVideo)) && (
            <View style={styles.albumContainer}>
              {Platform.OS === 'android' ? (
                <NativeVinylView
                  style={styles.vinylDisc}
                  accentColor={accentColor}
                  isPlaying={playerState.isPlaying}
                  imageUrl={posterUri ?? undefined}
                />
              ) : (
                <Animated.View style={[styles.vinylDisc, vinylStyle]}>
                  <LinearGradient
                    colors={['#1a1a1a', '#0a0a0a', '#1a1a1a']}
                    style={styles.vinylGradient}
                  >
                    {posterUri && (
                      <ExpoImage source={{ uri: posterUri }} style={styles.vinylCenter} contentFit="cover" />
                    )}
                    <View style={styles.vinylRing} />
                    <View style={styles.vinylRing2} />
                  </LinearGradient>
                </Animated.View>
              )}

              <View style={styles.albumArtWrapper}>
                {posterUri ? (
                  <ExpoImage source={{ uri: posterUri }} style={styles.albumArt} contentFit="cover" />
                ) : (
                  <View style={[styles.albumArt, styles.albumPlaceholder]}>
                    <Ionicons name="musical-notes" size={60} color="rgba(255,255,255,0.3)" />
                  </View>
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.3)']}
                  style={styles.albumOverlay}
                />
              </View>

            </View>
          )}

          {/* Lyrics Overlay */}
          {showLyrics && (
            <LyricsView
              lyrics={lyrics}
              currentTime={playerState.position / 1000}
              onClose={() => setShowLyrics(false)}
              isLoading={lyricsLoading}
            />
          )}

          {/* Track info */}
          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle} numberOfLines={2}>{title}</Text>
            <Text style={styles.trackArtist}>{year ? `${year} • ` : ''}Original Soundtrack</Text>
          </View>


          {/* Waveform visualization */}
          <View style={styles.waveformContainer}>
            {Platform.OS === 'android' ? (
              <NativeWaveformView
                style={styles.waveformNative}
                accentColor={accentColor}
                isPlaying={playerState.isPlaying}
              />
            ) : (
              <>
                {waveAnims.map((anim, i) => (
                  <WaveBar key={i} anim={anim} color={accentColor} />
                ))}
                {/* Mirror bars */}
                {waveAnims.map((anim, i) => (
                  <WaveBar key={`r-${i}`} anim={anim} color={accentColor} />
                ))}
              </>
            )}
          </View>

          {/* Progress bar */}
          <View style={styles.progressContainer}>
            {Platform.OS === 'android' ? (
              <NativePlaybackControlsView
                style={styles.nativePlaybackControls}
                durationMs={playerState.duration || 1}
                positionMs={playerState.position}
                accentColor={accentColor}
                onSeekComplete={(event: { nativeEvent: { positionMs: number } }) =>
                  seekTo(event.nativeEvent.positionMs)
                }
              />
            ) : (
              <>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={playerState.duration || 1}
                  value={playerState.position}
                  onSlidingComplete={seekTo}
                  minimumTrackTintColor={accentColor}
                  maximumTrackTintColor="rgba(255,255,255,0.2)"
                  thumbTintColor={accentColor}
                />
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>{formatTime(playerState.position)}</Text>
                  <Text style={styles.timeText}>{formatTime(playerState.duration)}</Text>
                </View>
              </>
            )}
          </View>

          {/* Controls */}
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.controlBtn, shuffle && { backgroundColor: `${accentColor}33` }]}
              onPress={() => setShuffle(!shuffle)}
            >
              <Ionicons name="shuffle" size={22} color={shuffle ? accentColor : 'rgba(255,255,255,0.6)'} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn} onPress={handlePrevTrack}>
              <Ionicons name="play-skip-back" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.playPauseBtn, { backgroundColor: accentColor }]}
              onPress={togglePlayPause}
            >
              {playerState.isLoading || playerState.isBuffering ? (
                <MaterialCommunityIcons name="loading" size={32} color="#fff" />
              ) : (
                <Ionicons name={playerState.isPlaying ? 'pause' : 'play'} size={32} color="#fff" />
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn} onPress={handleNextTrack}>
              <Ionicons name="play-skip-forward" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, repeat && { backgroundColor: `${accentColor}33` }]}
              onPress={() => setRepeat(!repeat)}
            >
              <Ionicons name="repeat" size={22} color={repeat ? accentColor : 'rgba(255,255,255,0.6)'} />
            </TouchableOpacity>
          </View>

        </View>

        <BottomSheet
          ref={upNextSheetRef}
          index={-1}
          snapPoints={upNextSnapPoints}
          enablePanDownToClose
          backdropComponent={(props) => (
            <BottomSheetBackdrop
              {...props}
              appearsOnIndex={0}
              disappearsOnIndex={-1}
              opacity={0.45}
            />
          )}
          backgroundStyle={styles.upNextSheetBg}
          handleIndicatorStyle={styles.upNextHandle}
        >
          <View style={[styles.bottomActions, styles.sheetActions, { paddingBottom: insets.bottom + 10 }]}>
            <TouchableOpacity style={styles.bottomAction}>
              <Ionicons name="heart-outline" size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.bottomAction}>
              <Ionicons name="share-outline" size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.bottomAction} onPress={handleDownload}>
              <Ionicons name="cloud-download-outline" size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.bottomAction} onPress={() => setUpNextTab('upnext')}>
              <Ionicons name="list" size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bottomAction}
              onPress={() => setShowLyrics(!showLyrics)}
            >
              <Ionicons name="mic" size={24} color={showLyrics ? accentColor : "rgba(255,255,255,0.7)"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.bottomAction}>
              <MaterialCommunityIcons name="cast" size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
          <View style={styles.upNextHeader}>
            <Text style={styles.upNextTitle}>Up Next</Text>
            <View style={styles.upNextTabs}>
              <TouchableOpacity
                style={[styles.upNextTab, upNextTab === 'upnext' && { backgroundColor: `${accentColor}22` }]}
                onPress={() => setUpNextTab('upnext')}
              >
                <Text style={[styles.upNextTabText, upNextTab === 'upnext' && styles.upNextTabTextActive]}>Up Next</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.upNextTab, upNextTab === 'related' && { backgroundColor: `${accentColor}22` }]}
                onPress={() => setUpNextTab('related')}
              >
                <Text style={[styles.upNextTabText, upNextTab === 'related' && styles.upNextTabTextActive]}>Related</Text>
              </TouchableOpacity>
            </View>
          </View>
          <BottomSheetScrollView
            contentContainerStyle={[styles.upNextList, { paddingBottom: insets.bottom + 30 }]}
            showsVerticalScrollIndicator={false}
          >
            {(upNextTab === 'upnext' ? upNextItems : relatedItems).map((item, index) => (
              <SongRow
                key={`${item.id}-${index}`}
                item={item}
                index={index}
                accentColor={accentColor}
                onPress={() => {
                  const targetId = (item as any).videoId || item.id;
                  const nextIndex = queue.findIndex((q) => (q as any).videoId === targetId || q.id === targetId);
                  if (nextIndex >= 0) {
                    setCurrentIndex(nextIndex);
                  } else {
                    setQueue((prev) => {
                      const next = [...prev, item];
                      setCurrentIndex(next.length - 1);
                      return next;
                    });
                  }
                }}
              />
            ))}
            {upNextItems.length === 0 && (
              <Text style={styles.upNextEmpty}>Your queue will build as you play.</Text>
            )}
          </BottomSheetScrollView>
        </BottomSheet>
        </Animated.View>
      </Modal>

      {minimized && active && (
        <LiquidGlass
          glowColor={accentColor}
          tintColor="#0d0d12"
          tintOpacity={0.75}
          cornerRadius={16}
          glowIntensity={0.8}
          borderWidth={1.5}
          animated={true}
          style={styles.floatingPlayerWrap}
        >
          <View style={styles.floatingContent}>
            <TouchableOpacity style={styles.floatingInfoRow} onPress={onExpand} activeOpacity={0.9}>
              <View style={styles.floatingThumbWrap}>
                {posterUri ? (
                  <ExpoImage source={{ uri: posterUri }} style={styles.floatingThumb} contentFit="cover" />
                ) : (
                  <View style={[styles.floatingThumb, styles.floatingThumbFallback]}>
                    <Ionicons name="musical-notes" size={16} color="rgba(255,255,255,0.6)" />
                  </View>
                )}
              </View>
              <View style={styles.floatingInfo}>
                <Text style={styles.floatingTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.floatingArtist} numberOfLines={1}>{activeArtist || 'Soundtrack'}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.floatingControl, { backgroundColor: `${accentColor}33` }]}
              onPress={togglePlayPause}
            >
              <Ionicons name={playerState.isPlaying ? 'pause' : 'play'} size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.floatingControl} onPress={onStop}>
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        </LiquidGlass>
      )}
    </>
  );
});





export default function SongsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { playTrack } = useGlobalMusicPlayer();
  const [activeFilter, setActiveFilter] = useState('all');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [trending, setTrending] = useState<Media[]>([]);
  const [popular, setPopular] = useState<Media[]>([]);
  const [topRated, setTopRated] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);

  const scrollY = useRef(new RNAnimated.Value(0)).current;
  const trackIdParam = params.trackId ? String(params.trackId) : null;

  const accentColor = useMemo(() => ACCENT_PALETTES[paletteIndex][0], [paletteIndex]);
  const accentColorRef = useRef(accentColor);

  useEffect(() => {
    accentColorRef.current = accentColor;
  }, [accentColor]);

  useEffect(() => {
    const timer = setInterval(() => {
      setPaletteIndex((prev) => (prev + 1) % ACCENT_PALETTES.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [trendingRes, popularRes, topRatedRes] = await Promise.all([
          fetch(`${API_BASE_URL}/trending/movie/week?api_key=${API_KEY}`),
          fetch(`${API_BASE_URL}/movie/popular?api_key=${API_KEY}`),
          fetch(`${API_BASE_URL}/movie/top_rated?api_key=${API_KEY}`),
        ]);

        const trendingData = await trendingRes.json();
        const popularData = await popularRes.json();
        const topRatedData = await topRatedRes.json();

        setTrending(trendingData.results || []);
        setPopular(popularData.results || []);
        setTopRated(topRatedData.results || []);
      } catch (error) {
        console.error('Failed to fetch songs data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handlePlayTrack = useCallback((item: Media) => {
    playTrack(item, accentColor);
  }, [accentColor, playTrack]);

  // Handle trackId from navigation params
  useEffect(() => {
    if (trackIdParam && !loading) {
      const allTracks = [...trending, ...popular, ...topRated];
      const track = allTracks.find((t) => String(t.id) === trackIdParam || (t as any).videoId === trackIdParam);
      if (track) {
        playTrack(track, accentColorRef.current);
      } else if (params.mediaType === 'music') {
        // If not in trending/local list, it might be a direct YT result
        // Create a placeholder Media object to trigger the player logic which will then fetch the stream
        const placeholder: Media = {
          id: 0 as any, // Not used for YT streams but required by type
          videoId: trackIdParam,
          media_type: 'music',
          title: (params.title as string) || 'Loading Track...',
          poster_path: (params.thumbnail as string) || '',
          localUri: (params.localUri as string) || undefined,
          artist: (params.artist as string) || undefined,
        };
        playTrack(placeholder, accentColorRef.current);
      }
    }
  }, [loading, params.artist, params.localUri, params.mediaType, params.thumbnail, params.title, playTrack, popular, topRated, trackIdParam, trending]);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const featuredItem = trending[0];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Full-screen background */}
      <LinearGradient
        colors={[accentColor, '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Sticky header */}
      <RNAnimated.View style={[styles.stickyHeader, { opacity: headerOpacity, paddingTop: insets.top }]}>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.stickyHeaderContent}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.stickyTitle}>Soundtracks</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push({ pathname: '/search', params: { tab: 'music' } })}>
            <Ionicons name="search" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </RNAnimated.View>

      <RNAnimated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={RNAnimated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* Hero header - edge to edge */}
        <View style={[styles.heroHeader, { paddingTop: insets.top + 60 }]}>
          {featuredItem?.backdrop_path && (
            <ImageBackground
              source={{ uri: `${IMAGE_BASE_URL}${featuredItem.backdrop_path}` }}
              style={styles.heroBg}
            >
              <LinearGradient
                colors={['transparent', 'rgba(5,6,15,0.8)', 'rgba(5,6,15,1)']}
                style={StyleSheet.absoluteFill}
              />
            </ImageBackground>
          )}

          <View style={styles.heroContent}>
            <View style={[styles.heroIcon, { backgroundColor: `${accentColor}33` }]}>
              <Ionicons name="musical-notes" size={32} color={accentColor} />
            </View>
            <Text style={styles.heroTitle}>Soundtracks</Text>
            <Text style={styles.heroSubtitle}>Discover music from your favorite movies</Text>

            {featuredItem && (
              <TouchableOpacity
                style={[styles.heroPlayBtn, { backgroundColor: accentColor }]}
                onPress={() => handlePlayTrack(featuredItem)}
              >
                <FontAwesome name="play" size={14} color="#fff" />
                <Text style={styles.heroPlayText}>Play Featured</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScroll}
        >
          {GENRE_FILTERS.map((filter) => {
            const isActive = activeFilter === filter.id;
            return (
              <TouchableOpacity
                key={filter.id}
                onPress={() => setActiveFilter(filter.id)}
                style={{ marginRight: 8 }}
              >
                {isActive ? (
                  <LiquidGlass
                    glowColor={accentColor}
                    tintColor={accentColor}
                    tintOpacity={0.85}
                    cornerRadius={20}
                    glowIntensity={0.7}
                    borderWidth={1}
                    animated={true}
                    style={styles.filterChipLiquid}
                  >
                    <View style={styles.filterChipInner}>
                      <Ionicons name={filter.icon as any} size={14} color="#fff" />
                      <Text style={[styles.filterText, styles.filterTextActive]}>
                        {filter.label}
                      </Text>
                    </View>
                  </LiquidGlass>
                ) : (
                  <View style={styles.filterChip}>
                    <Ionicons name={filter.icon as any} size={14} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.filterText}>{filter.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Trending rail */}
        <LiquidGlass
          glowColor={accentColor}
          tintColor="#0d0d12"
          tintOpacity={0.45}
          cornerRadius={24}
          glowIntensity={0.5}
          borderWidth={1}
          animated={true}
          style={styles.railContainer}
        >
          <View style={styles.railHeader}>
            <Text style={styles.railTitle}>Trending Now</Text>
            <TouchableOpacity style={styles.railSeeAll}>
              <Text style={[styles.railSeeAllText, { color: accentColor }]}>See All</Text>
              <Ionicons name="chevron-forward" size={14} color={accentColor} />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railScroll}>
            {trending.slice(0, 10).map((item) => (
              <SongCard
                key={item.id}
                item={item}
                accentColor={accentColor}
                onPress={() => handlePlayTrack(item)}
              />
            ))}
          </ScrollView>
        </LiquidGlass>

        {/* Top tracks list */}
        <LiquidGlass
          glowColor={accentColor}
          tintColor="#0d0d12"
          tintOpacity={0.45}
          cornerRadius={24}
          glowIntensity={0.5}
          borderWidth={1}
          animated={true}
          style={styles.listSection}
        >
          <Text style={styles.listTitle}>Top Tracks</Text>
          {[...trending, ...popular].slice(0, 10).map((item, index) => (
            <SongRow
              key={item.id}
              item={item}
              index={index}
              accentColor={accentColor}
              onPress={() => handlePlayTrack(item)}
            />
          ))}
        </LiquidGlass>

        {/* Popular rail */}
        <LiquidGlass
          glowColor={accentColor}
          tintColor="#0d0d12"
          tintOpacity={0.45}
          cornerRadius={24}
          glowIntensity={0.5}
          borderWidth={1}
          animated={true}
          style={styles.railContainer}
        >
          <View style={styles.railHeader}>
            <Text style={styles.railTitle}>Popular This Week</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railScroll}>
            {popular.slice(0, 10).map((item) => (
              <SongCard
                key={item.id}
                item={item}
                accentColor={accentColor}
                onPress={() => handlePlayTrack(item)}
              />
            ))}
          </ScrollView>
        </LiquidGlass>

        {/* Top Rated rail */}
        <LiquidGlass
          glowColor={accentColor}
          tintColor="#0d0d12"
          tintOpacity={0.45}
          cornerRadius={24}
          glowIntensity={0.5}
          borderWidth={1}
          animated={true}
          style={styles.railContainer}
        >
          <View style={styles.railHeader}>
            <Text style={styles.railTitle}>Highest Rated</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railScroll}>
            {topRated.slice(0, 10).map((item) => (
              <SongCard
                key={item.id}
                item={item}
                accentColor={accentColor}
                onPress={() => handlePlayTrack(item)}
              />
            ))}
          </ScrollView>
        </LiquidGlass>
      </RNAnimated.ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#05060f',
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
  },
  stickyHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stickyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroHeader: {
    minHeight: 320,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  heroBg: {
    ...StyleSheet.absoluteFillObject,
  },
  heroContent: {
    alignItems: 'center',
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  heroPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 24,
  },
  heroPlayText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  filtersScroll: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  filterText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '700',
  },
  filterChipLiquid: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  filterChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterTextActive: {
    color: '#fff',
  },
  railContainer: {
    marginBottom: 28,
  },
  railHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  railTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  railSeeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  railSeeAllText: {
    fontSize: 13,
    fontWeight: '700',
  },
  railScroll: {
    paddingHorizontal: 16,
  },

  thumbPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listSection: {
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  listTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 14,
  },

  // Player styles
  playerModal: {
    flex: 1,
    backgroundColor: '#05060f',
  },
  floatingPlayerWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 90,
    height: 64,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  floatingPlayer: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  floatingInfoRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  floatingThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  floatingThumb: {
    width: '100%',
    height: '100%',
  },
  floatingThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingInfo: {
    flex: 1,
  },
  floatingTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  floatingArtist: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 2,
  },
  floatingControl: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  playerBg: {
    ...StyleSheet.absoluteFillObject,
  },
  playerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  playerHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerHeaderCenter: {
    alignItems: 'center',
  },
  playerHeaderTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playerHeaderSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 4,
    borderRadius: 20,
    marginTop: 10,
    marginBottom: 10,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  tabText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#fff',
  },
  playerContent: {
    flex: 1,
    paddingHorizontal: 24,
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginTop: 20,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoToggle: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumContainer: {
    alignItems: 'center',
    marginTop: 30,
  },
  vinylDisc: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    right: -30,
  },
  vinylGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylCenter: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  vinylRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  vinylRing2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  errorText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
  albumArtWrapper: {
    width: 240,
    height: 240,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 20,
  },
  albumArt: {
    width: '100%',
    height: '100%',
  },
  albumOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  albumPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoToggleAlt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 20,
  },
  videoToggleText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  trackInfo: {
    alignItems: 'center',
    marginTop: 30,
  },
  trackTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  trackArtist: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 40,
    marginTop: 24,
  },
  waveformNative: {
    width: '100%',
    height: '100%'
  },
  waveBarLarge: {
    width: 4,
    height: 40,
    borderRadius: 2,
  },
  progressContainer: {
    marginTop: 24,
  },
  nativePlaybackControls: {
    width: '100%',
    height: 56,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
  },
  timeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 20,
  },
  controlBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 'auto',
    paddingTop: 20,
  },
  sheetActions: {
    marginTop: 0,
    paddingTop: 12,
  },
  bottomAction: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upNextSheetBg: {
    backgroundColor: '#0b0c16',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  upNextHandle: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    width: 44,
  },
  upNextHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upNextTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  upNextTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 4,
    borderRadius: 999,
  },
  upNextTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  upNextTabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
  },
  upNextTabTextActive: {
    color: '#fff',
  },
  upNextList: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  upNextEmpty: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 24,
  },
});
