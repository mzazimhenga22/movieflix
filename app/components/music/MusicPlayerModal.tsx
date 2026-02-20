import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Slider from '@react-native-community/slider';
import { ResizeMode, Video } from 'expo-av';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Dimensions,
  ImageBackground,
  Modal,
  NativeEventEmitter,
  NativeModules,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { GestureHandlerRootView as RNGHRootView } from 'react-native-gesture-handler';
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
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
  Track,
  useTrackPlayerEvents
} from 'react-native-track-player';

const GHRootView = RNGHRootView as React.ComponentType<any>;

import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../../../constants/api';
import { enqueueDownload } from '../../../lib/downloadManager';
import { useSubscription } from '../../../providers/SubscriptionProvider';
import { LyricsResolver } from '../../../src/pstream/LyricsResolver';
import { RecommendationAlgo } from '../../../src/pstream/RecommendationAlgo';
import { usePStream } from '../../../src/pstream/usePStream';
import { Media } from '../../../types';
import { LyricsView } from '../music/LyricsView';
import NativePlaybackControlsView from '../NativePlaybackControlsView';
import NativeVinylView from '../NativeVinylView';
import NativeWaveformView from '../NativeWaveformView';
import { SongRow } from '../SongItem';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Module-level guard: only setup TrackPlayer once across all mounts
let _trackPlayerSetupDone = false;
let _trackPlayerSetupPromise: Promise<void> | null = null;

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const calculateSimilarity = (str1: string, str2: string): number => {
  // Levenshtein distance for better title similarity detection
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 0 : 1 - distance / maxLen;
};

const getGenreTokens = (item: any): string[] => {
  if (!item) return [];
  const rawIds = Array.isArray(item.genre_ids) ? item.genre_ids.map(String) : [];
  const rawGenres = Array.isArray(item.genres)
    ? item.genres.map((g: any) => String(g?.id ?? g?.name ?? g)).filter(Boolean)
    : [];
  const rawGenre = typeof item.genre === 'string'
    ? item.genre.split(',').map((g: string) => g.trim()).filter(Boolean)
    : [];
  return [...rawIds, ...rawGenres, ...rawGenre].map((g) => g.toLowerCase()).filter(Boolean);
};

const buildDiversifiedRecommendations = (items: Media[], activeArtist: string, activeGenres: string[]) => {
  const artistLower = activeArtist.toLowerCase().trim();
  const genreSet = new Set(activeGenres.map((g) => g.toLowerCase()));

  const sameArtist: Media[] = [];
  const sameGenre: Media[] = [];
  const other: Media[] = [];

  items.forEach((item) => {
    const itemArtist = String(
      (item as any)?.artist || (item as any)?.uploaderName || (item as any)?.channelTitle || ''
    )
      .toLowerCase()
      .trim();
    const genreTokens = getGenreTokens(item);
    const artistMatch = artistLower ? itemArtist.includes(artistLower) : false;
    const genreMatch = genreTokens.some((g) => genreSet.has(g));
    if (artistMatch) {
      sameArtist.push(item);
      return;
    }
    if (genreMatch) {
      sameGenre.push(item);
      return;
    }
    other.push(item);
  });

  const diversified: Media[] = [];
  const buckets = [sameArtist, other, sameGenre, other];
  let guard = items.length * 2;
  while (diversified.length < items.length && guard-- > 0) {
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next) diversified.push(next);
      if (diversified.length >= items.length) break;
    }
  }
  return diversified.length ? diversified : items;
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

type PlayerMode = 'video' | 'audio';

interface PlayerState {
  isPlaying: boolean;
  position: number;
  duration: number;
  isLoading: boolean;
  isBuffering: boolean;
}

const MusicPlayerModal = memo(function MusicPlayerModal({
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
  const router = useRouter();
  const { getMusicStream, searchMusic } = usePStream();
  const { currentPlan } = useSubscription();

  // TrackPlayer setup — guarded so it only runs once globally
  const setupTrackPlayer = useCallback(async () => {
    if (_trackPlayerSetupDone) return;
    if (_trackPlayerSetupPromise) {
      await _trackPlayerSetupPromise;
      return;
    }
    _trackPlayerSetupPromise = (async () => {
      try {
        await TrackPlayer.setupPlayer();
        await TrackPlayer.updateOptions({
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
            Capability.Stop,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
          ],
          progressUpdateEventInterval: 1,
        });
        _trackPlayerSetupDone = true;
      } catch (err) {
        console.warn('[MusicPlayer] TrackPlayer setup error:', err);
      } finally {
        _trackPlayerSetupPromise = null;
      }
    })();
    await _trackPlayerSetupPromise;
  }, []);

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
  const videoSource = useMemo(() => {
    if (!streamData?.uri) return null;
    return { uri: streamData.uri, headers: streamData.headers };
  }, [streamData?.headers, streamData?.uri]);
  const [streamError, setStreamError] = useState(false);
  const [showVideo, setShowVideo] = useState(true);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [upNextTab, setUpNextTab] = useState<'upnext' | 'related'>('upnext');
  const [upNextSheetIndex, setUpNextSheetIndex] = useState(-1);
  const [relatedCandidates, setRelatedCandidates] = useState<Media[]>([]);

  // Queue State
  const [queue, setQueue] = useState<Media[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const activeTrack = queue[currentIndex] || track;
  const queueRef = useRef<Media[]>([]);
  const relatedCandidatesRef = useRef<Media[]>([]);
  const currentIndexRef = useRef(0);

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

  const handleUpNextSheetChange = useCallback((index: number) => {
    setUpNextSheetIndex(index);
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

  // Stable identity key for the active track to prevent re-fetch loops
  const activeTrackKey = useMemo(() => {
    if (!activeTrack) return null;
    return String((activeTrack as any)?.videoId || activeTrack?.id || '');
  }, [(activeTrack as any)?.videoId, activeTrack?.id]);
  const shouldUseVideoPlayer = playbackTarget === 'video';

  const progressPercent = playerState.duration
    ? Math.min(100, Math.max(0, (playerState.position / playerState.duration) * 100))
    : 0;

  const isPlayingRef = useRef(false);
  const nowPlayingTsRef = useRef(0);
  const modeRef = useRef<PlayerMode>(mode);
  const audioLoadingRef = useRef(false);
  const activeTrackKeyRef = useRef<string | null>(null);
  const isFetchingStreamRef = useRef(false);
  const pendingFetchCancelRef = useRef<(() => void) | null>(null);
  const loadedStreamUriRef = useRef<string | null>(null);

  useEffect(() => {
    isPlayingRef.current = playerState.isPlaying;
  }, [playerState.isPlaying]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    relatedCandidatesRef.current = relatedCandidates;
  }, [relatedCandidates]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const pushNowPlayingUpdate = useCallback((override?: { positionMs?: number; durationMs?: number; isPlaying?: boolean }, force = false) => {
    const service = (NativeModules as any)?.MusicPlaybackServiceModule;
    if (!service?.updateNowPlaying || !activeTrack) return;
    const now = Date.now();
    if (!force && now - nowPlayingTsRef.current < 1000) return;
    nowPlayingTsRef.current = now;

    const positionMs = override?.positionMs ?? playerState.position;
    const durationMs = override?.durationMs ?? playerState.duration;
    const isPlaying = override?.isPlaying ?? playerState.isPlaying;

    service.updateNowPlaying({
      title,
      artist: activeArtist || 'MovieFlix Music',
      artworkUrl: posterUri || '',
      isPlaying,
      positionMs: Math.max(0, Math.floor(positionMs)),
      durationMs: Math.max(0, Math.floor(durationMs)),
    });
  }, [activeArtist, activeTrack, playerState.duration, playerState.isPlaying, playerState.position, posterUri, title]);

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

  // Animate entrance & Queue Init
  useEffect(() => {
    let mounted = true;
    const initPlayer = async () => {
      try {
        await setupTrackPlayer();
      } catch (err) {
        console.warn('[MusicPlayer] TrackPlayer setup error:', err);
      }
    };
    initPlayer();

    return () => {
      mounted = false;
    };
  }, [setupTrackPlayer]);

  // TrackPlayer event handlers
  useTrackPlayerEvents([Event.PlaybackState, Event.PlaybackProgressUpdated, Event.PlaybackError], async (event) => {
    if (event.type === Event.PlaybackState) {
      const state = event.state;
      {
        setPlayerState((s) => ({
          ...s,
          isPlaying: state === State.Playing,
          isLoading: state === State.Loading,
          isBuffering: state === State.Buffering,
        }));
      }
      if (state === State.Ended) {
        if (repeat) {
          await TrackPlayer.seekTo(0);
          await TrackPlayer.play();
        } else {
          handleNextTrack();
        }
      }
    }

    if (event.type === Event.PlaybackProgressUpdated) {
      {
        setPlayerState((s) => ({
          ...s,
          position: event.position,
          duration: event.duration,
        }));
        pushNowPlayingUpdate({
          positionMs: event.position,
          durationMs: event.duration,
          isPlaying: await TrackPlayer.getState() === State.Playing,
        });
      }
    }

    if (event.type === Event.PlaybackError) {
      console.warn('[MusicPlayer] Playback error:', event.message);
      if (modeRef.current === 'audio' && !audioFallbackToVideo) {
        setAudioFallbackToVideo(true);
        setPlayerState((s) => ({ ...s, isLoading: false, isPlaying: true }));
      }
    }
  });

  useEffect(() => {
    if (visible) {
      slideAnim.value = withSpring(0, { damping: 15, stiffness: 90 });
      if (track) {
        setQueue([track]);
        setCurrentIndex(0);
        setRelatedCandidates([]);
        recommendationSeedRef.current = null;
      }
    } else {
      slideAnim.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
      if (!active) {
        setQueue([]);
        setCurrentIndex(0);
        setRelatedCandidates([]);
        recommendationSeedRef.current = null;
        activeTrackKeyRef.current = null;
      }
    }
  }, [active, track, visible]);

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

  // Handle Play Next / Prev
  const handleNextTrack = useCallback(async () => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      if (repeat) {
        if (playbackTarget === 'audio') {
          await TrackPlayer.seekTo(0);
          await TrackPlayer.play();
        } else {
          void videoRef.current?.replayAsync?.();
        }
      }
    }
  }, [currentIndex, playbackTarget, queue.length, repeat]);

  const handlePrevTrack = useCallback(async () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else {
      if (playbackTarget === 'audio') {
        await TrackPlayer.seekTo(0);
        await TrackPlayer.play();
      } else {
        void videoRef.current?.replayAsync?.();
      }
    }
  }, [currentIndex, playbackTarget]);

  const loadAudioStream = useCallback(async (stream: { uri: string; headers?: Record<string, string> }) => {
    if (!stream?.uri) return;
    if (audioLoadingRef.current) return;
    audioLoadingRef.current = true;

    try {
      const track: Track = {
        url: stream.uri,
        title: title,
        artist: activeArtist || 'Unknown Artist',
        artwork: posterUri || '',
        duration: playerState.duration,
      };
      if (stream.headers) {
        track.headers = stream.headers;
      }

      await TrackPlayer.reset();
      await TrackPlayer.add([track]);
      await TrackPlayer.play();
      loadedStreamUriRef.current = stream.uri;
    } catch (err) {
      console.warn('[MusicPlayer] TrackPlayer load failed:', err);
      if (modeRef.current === 'audio') {
        setAudioFallbackToVideo(true);
        setPlayerState((s) => ({ ...s, isLoading: false, isBuffering: false, isPlaying: true }));
      }
      setStreamError(true);
      setPlayerState((s) => ({ ...s, isLoading: false }));
    } finally {
      audioLoadingRef.current = false;
    }
  }, [activeArtist, posterUri, playerState.duration, title]);

  useEffect(() => {
    if (mode === 'audio') {
      setShowVideo(false);
      if (!audioFallbackToVideo) {
        void videoRef.current?.pauseAsync?.();
        if (streamData?.uri && loadedStreamUriRef.current !== streamData.uri) {
          void loadAudioStream({ uri: streamData.uri, headers: streamData.headers });
        } else if (streamData?.uri) {
          void TrackPlayer.play();
        }
      }
    } else {
      void TrackPlayer.reset();
      loadedStreamUriRef.current = null;
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
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (upNextSheetIndex >= 0) {
        upNextSheetRef.current?.close();
        return true;
      }
      if (visible) {
        onClose();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [onClose, upNextSheetIndex, visible]);

  useEffect(() => {
    setRelatedCandidates([]);
  }, [activeTrack?.id, currentIndex]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateChangeStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (!isPlayingRef.current) return;

        // Video can't play in background, so switch to audio mode
        if (playbackTarget === 'video' && streamData?.uri) {
          setMode('audio');
        }

        if (!allowBackground) {
          // Free plan: pause after a short delay to let audio mode switch settle
          setTimeout(() => {
            TrackPlayer.pause().catch(() => { });
            if (videoRef.current) {
              void videoRef.current?.pauseAsync?.();
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
  }, [allowBackground, handleStopPlaybackService, playbackTarget, streamData?.uri]);

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
  }, [playerState.isPlaying, waveAnims]);

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

    if (recommendationSeedRef.current === seedKey && relatedCandidatesRef.current.length > 0) return;
    recommendationSeedRef.current = seedKey;

    let pool = Array.isArray(rawRelated) ? [...rawRelated] : [];

    // Build variety of search queries for better recommendations
    const searches: Promise<any[]>[] = [];

    if (activeArtist) {
      // More from the same artist (limit to first few results)
      searches.push(
        searchMusic(`${activeArtist} songs`, { artist: activeArtist })
          .then(results => results.slice(0, 5))
          .catch(() => [])
      );

      // Artist collaborations and features
      searches.push(
        searchMusic(`${activeArtist} feat`, {})
          .then(results => results.slice(0, 3))
          .catch(() => [])
      );
    }

    // Song-based discovery with varied terms
    if (title) {
      const cleanTitle = title.replace(/\((official|official video|lyrics|video|audio)\)/gi, '').trim();

      // Same song by different artists (covers, remixes) - good for exploration
      searches.push(
        searchMusic(cleanTitle, {})
          .then(results => results.slice(0, 3))
          .catch(() => [])
      );

      // Genre-based discovery (try to extract genre from title)
      const genreTerms = ['soundtrack', 'original motion picture', 'OST'];
      const hasGenreTerm = genreTerms.some(term => cleanTitle.toLowerCase().includes(term.toLowerCase()));

      if (hasGenreTerm && activeArtist) {
        searches.push(
          searchMusic(`${activeArtist} best songs`, {})
            .then(results => results.slice(0, 3))
            .catch(() => [])
        );
      }

      // If it's a movie soundtrack, search for other soundtracks
      if (cleanTitle.toLowerCase().includes('soundtrack') || cleanTitle.toLowerCase().includes('theme')) {
        const movieTitle = cleanTitle
          .replace(/soundtrack|theme|original motion picture|ost|original soundtrack/gi, '')
          .trim();

        if (movieTitle && movieTitle.length > 2) {
          searches.push(
            searchMusic(movieTitle, {})
              .then(results => results.slice(0, 5))
              .catch(() => [])
          );
        }
      }
    }

    // Add trending/popular songs as fallback for variety
    searches.push(
      searchMusic('trending music 2025', {})
        .then(results => results.slice(0, 10))
        .catch(() => [])
    );

    try {
      const results = await Promise.all(searches);
      results.forEach((r) => {
        if (Array.isArray(r)) pool = [...pool, ...r];
      });
    } catch (err) {
      console.warn('[MusicPlayer] Recommendation searches failed:', err);
    }

    // Enhanced duplicate filtering - exclude same videoId, similar titles, and current track
    const baseQueue = queueRef.current.length ? queueRef.current : [activeTrack];
    const processed = RecommendationAlgo.processQueue(baseQueue, pool, activeTrack);
    const normalized = processed.map(normalizeRecommendation).filter(Boolean) as Media[];

    const seen = new Set<string | number>();
    const seenTitles = new Set<string>();
    const unique: Media[] = [];

    normalized.forEach((item) => {
      const id = (item as any)?.videoId || item?.id;
      const itemTitle = item?.title?.toLowerCase().trim() || '';

      // Skip if no ID or same as current track
      if (!id || String(id) === String(seedKey)) return;

      // Skip duplicate videoIds
      if (seen.has(String(id))) return;

      // Skip exact title matches
      if (seenTitles.has(itemTitle)) return;

      // Skip titles that are too similar to current track (90% similarity)
      const currentTitle = title.toLowerCase().trim();
      if (itemTitle.length > 5 && currentTitle.length > 5) {
        const similarity = calculateSimilarity(itemTitle, currentTitle);
        if (similarity > 0.9) {
          return;
        }
      }

      seen.add(String(id));
      seenTitles.add(itemTitle);
      unique.push(item);
    });

    const activeGenres = getGenreTokens(activeTrack);
    const diversified = buildDiversifiedRecommendations(unique, activeArtist || '', activeGenres);
    const nextUp = diversified.slice(0, 15);
    const related = diversified.slice(15, 25);

    setRelatedCandidates(related.length ? related : diversified.slice(0, 10));

    setQueue((prev) => {
      if (!prev.length) return [activeTrack, ...nextUp];
      const first = prev[0] as any;
      const firstKey = first?.videoId || first?.id;
      if (prev.length === 1 && firstKey === seedKey) {
        return [activeTrack, ...nextUp];
      }
      return prev;
    });
  }, [activeArtist, activeTrack, normalizeRecommendation, searchMusic, title]);

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

    pushNowPlayingUpdate({
      positionMs: status.positionMillis,
      durationMs: status.durationMillis || 0,
      isPlaying: status.isPlaying,
    });

    if (status.didJustFinish) {
      if (repeat) {
        void videoRef.current?.replayAsync?.();
      } else {
        handleNextTrack();
      }
    }
  }, [handleNextTrack, pushNowPlayingUpdate, repeat]);

  const handlePlayRequest = useCallback(async () => {
    if (playbackTarget === 'audio') {
      await TrackPlayer.play();
    } else {
      await videoRef.current?.playAsync?.();
    }
    pushNowPlayingUpdate({ isPlaying: true }, true);
  }, [playbackTarget, pushNowPlayingUpdate]);

  const handlePauseRequest = useCallback(async () => {
    if (playbackTarget === 'audio') {
      await TrackPlayer.pause();
    } else {
      await videoRef.current?.pauseAsync?.();
    }
    pushNowPlayingUpdate({ isPlaying: false }, true);
  }, [playbackTarget, pushNowPlayingUpdate]);

  const togglePlayPause = useCallback(async () => {
    if (playerState.isPlaying) {
      await handlePauseRequest();
    } else {
      await handlePlayRequest();
    }
  }, [handlePauseRequest, handlePlayRequest, playerState.isPlaying]);

  const seekTo = useCallback(async (position: number) => {
    if (playbackTarget === 'audio') {
      await TrackPlayer.seekTo(position);
      return;
    }
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(position);
    }
  }, [playbackTarget]);

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
          // Handle seekTo:positionMs from notification
          if (normalized.startsWith('seekto:')) {
            const pos = parseInt(normalized.split(':')[1], 10);
            if (!isNaN(pos)) void seekTo(pos);
          }
          break;
      }
    });
    return () => sub.remove();
  }, [handleNextTrack, handlePauseRequest, handlePlayRequest, handlePrevTrack, seekTo, togglePlayPause]);

  const skipForward = useCallback(async () => {
    const newPos = Math.min(playerState.position + 10000, playerState.duration);
    await seekTo(newPos);
  }, [playerState.position, playerState.duration, seekTo]);

  const skipBackward = useCallback(async () => {
    const newPos = Math.max(playerState.position - 10000, 0);
    await seekTo(newPos);
  }, [playerState.position, seekTo]);

  const upNextItems = useMemo(() => {
    return queue.filter((_, index) => index > currentIndex).slice(0, 15);
  }, [queue, currentIndex]);

  const relatedItems = useMemo(() => {
    if (relatedCandidates.length > 0) return relatedCandidates.slice(0, 10);
    return upNextItems;
  }, [relatedCandidates, upNextItems]);

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
      videoRef.current?.pauseAsync?.();
      TrackPlayer.reset().catch(() => { });
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
    if (!active) {
      handleStopPlaybackService();
      return;
    }
    handleStartPlaybackService();
    pushNowPlayingUpdate(undefined, true);
  }, [active, handleStartPlaybackService, handleStopPlaybackService, pushNowPlayingUpdate]);

  useEffect(() => {
    if (!active || !activeTrack) return;
    handleStartPlaybackService();
    pushNowPlayingUpdate(undefined, true);
  }, [active, activeTrack?.id, handleStartPlaybackService, pushNowPlayingUpdate]);

  useEffect(() => {
    if (!active || !playerState.isPlaying) return;
    const interval = setInterval(() => {
      pushNowPlayingUpdate();
    }, 1000);
    return () => clearInterval(interval);
  }, [active, playerState.isPlaying, pushNowPlayingUpdate]);

  // Fetch video/trailer
  useEffect(() => {
    if (!activeTrack || !active || !activeTrackKey) return;

    // Guard: don't re-fetch the same track OR if already fetching
    if (activeTrackKeyRef.current === activeTrackKey) return;
    if (isFetchingStreamRef.current && !pendingFetchCancelRef.current) {
      console.log('[MusicPlayer] Skipping fetch - already fetching stream');
      return;
    }

    // Cancel any pending fetch
    if (pendingFetchCancelRef.current) {
      pendingFetchCancelRef.current();
      pendingFetchCancelRef.current = null;
      // Small delay to let cancellation complete
      setTimeout(() => {
        isFetchingStreamRef.current = false;
      }, 100);
      console.log('[MusicPlayer] Cancelled pending stream fetch');
    }

    // Set guard immediately before starting
    isFetchingStreamRef.current = true;
    activeTrackKeyRef.current = activeTrackKey;

    let cancelled = false;
    const cancelFn = () => { cancelled = true; };
    pendingFetchCancelRef.current = cancelFn;

    // Cleanup previous audio before loading new track
    TrackPlayer.reset().catch(() => { }).then(() => {
      audioLoadingRef.current = false;
    });

    setPlayerState((s) => ({ ...s, isLoading: true }));
    setStreamData(null);
    setStreamError(false);

    // Loading timeout — don't let the user get stuck with a frozen spinner
    const loadingTimeout = setTimeout(() => {
      if (!cancelled) {
        console.warn('[MusicPlayer] Stream loading timed out after 15s');
        setPlayerState((s) => (s.isLoading ? { ...s, isLoading: false } : s));
        setStreamError(true);
        isFetchingStreamRef.current = false;
      }
    }, 15000);

    // Reset Lyrics
    setLyrics([]);
    setLyricsLoading(true);
    setShowLyrics(false);

    // Fetch Lyrics
    LyricsResolver.getLyrics(activeTrack.title || activeTrack.name || '', activeArtist || '')
      .then(res => {
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
        const currentMode = modeRef.current;
        const currentPlaybackTarget = currentMode === 'audio' && !audioFallbackToVideo ? 'audio' : 'video';
        console.log(`[MusicPlayer] Fetching ${currentMode} stream for track:`, activeTrack.title);

        const handleResolvedStream = (stream: any, fallbackRelated?: any[], fallbackToVideo = false) => {
          setStreamData(stream);
          setAudioFallbackToVideo(fallbackToVideo);
          if (currentPlaybackTarget === 'audio' && !fallbackToVideo) {
            setPlayerState((s) => ({ ...s, isLoading: true, isBuffering: false }));
            void loadAudioStream({ uri: stream.uri, headers: stream.headers });
          } else {
            if (currentMode === 'audio') setShowVideo(false);
            setPlayerState((s) => ({ ...s, isLoading: false, isPlaying: true }));
          }
          void applyRecommendations(stream?.related?.length ? stream.related : fallbackRelated);
        };

        const resolveStreamWithFallback = async (videoId: string, fallbackRelated?: any[]) => {
          const seed = { artist: activeArtist || undefined };
          const stream: any = await getMusicStream(videoId, currentMode, false, seed);
          if (!cancelled && stream?.uri) {
            handleResolvedStream(stream, fallbackRelated, false);
            return true;
          }
          if (currentMode === 'audio') {
            const videoStream: any = await getMusicStream(videoId, 'video', false, seed);
            if (!cancelled && videoStream?.uri) {
              handleResolvedStream(videoStream, fallbackRelated, true);
              return true;
            }
          }
          return false;
        };

        if (localUri) {
          handleResolvedStream({ uri: localUri });
          return;
        }

        const artistName = (activeTrack as any).artist || (activeTrack as any).channelTitle || '';
        if (artistName) {
          LyricsResolver.getLyrics(activeTrack.title || activeTrack.name || '', artistName)
            .then(res => {
              if (!cancelled && res?.lines) {
                setLyrics(res.lines);
              }
            });
        }

        const songItem = activeTrack as any;
        if (songItem.videoId || songItem.media_type === 'music') {
          const vidId = songItem.videoId || (songItem.id && String(songItem.id));
          if (vidId) {
            const resolved = await resolveStreamWithFallback(vidId);
            if (resolved) return;
          }
        }

        const isNumericId = typeof activeTrack.id === 'number' && activeTrack.id > 100;
        if (isNumericId && songItem.media_type !== 'music') {
          const detailsRes = await fetch(
            `${API_BASE_URL}/movie/${activeTrack.id}?api_key=${API_KEY}&append_to_response=external_ids,videos`
          );
          const details = await detailsRes.json();

          if (cancelled) return;

          const videos = details.videos?.results || [];
          const trailer = videos.find((v: any) =>
            v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
          );

          if (trailer?.key) {
            const resolved = await resolveStreamWithFallback(trailer.key);
            if (resolved) return;
          }
        }

        try {
          const searchResults = await searchMusic(`${title} Soundtrack`, {
            artist: activeArtist || undefined,
          });
          if (searchResults && searchResults.length > 0 && !cancelled) {
            for (let i = 0; i < Math.min(5, searchResults.length); i++) {
              if (cancelled) break;
              try {
                const result = searchResults[i];
                const resolved = await resolveStreamWithFallback(result.videoId, searchResults);
                if (resolved) {

                  // Check if this is the same track we're already playing/loaded (prevent re-fetch loop)
                  const currentVideoId = (queueRef.current[currentIndexRef.current] as any)?.videoId;
                  if (result.videoId === currentVideoId) {
                    console.log('[MusicPlayer] Skipping queue update - same videoId already loaded:', result.videoId);
                    return;
                  }

                  // Update track key ref BEFORE queue update to prevent re-fetch loop
                  if (result.videoId) {
                    activeTrackKeyRef.current = String(result.videoId);
                  }

                  setQueue((prev) => {
                    const next = [...prev];
                    const index = currentIndexRef.current;
                    const existing = next[index];
                    const updated: Media = {
                      ...(existing || {}),
                      media_type: 'music',
                      title: result.title || existing?.title,
                      poster_path: result.thumbnail || existing?.poster_path,
                      artist: result.artist || (Array.isArray((result as any).artists) ? (result as any).artists[0]?.name : undefined),
                      videoId: result.videoId,
                    } as Media;
                    if (existing) {
                      next[index] = updated;
                      return next;
                    }
                    return [updated];
                  });

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

        if (!cancelled) {
          setStreamError(true);
          setPlayerState((s) => ({ ...s, isLoading: false }));
        }
      } catch (e) {
        if (!cancelled) {
          setPlayerState((s) => ({ ...s, isLoading: false }));
        }
      } finally {
        // Always clear loading state
        if (!cancelled) {
          isFetchingStreamRef.current = false;
        }
        if (pendingFetchCancelRef.current === cancelFn) {
          pendingFetchCancelRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(loadingTimeout);
      isFetchingStreamRef.current = false;
      if (pendingFetchCancelRef.current === cancelFn) {
        pendingFetchCancelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeTrackKey]);

  // Unmount cleanup: stop TrackPlayer and the foreground service
  useEffect(() => {
    return () => {
      TrackPlayer.reset().catch(() => { });
      const service = (NativeModules as any)?.MusicPlaybackServiceModule;
      if (service?.stopService) service.stopService();
    };
  }, []);

  if (!track) return null;

  return (
    <>
      <Modal visible={visible} animationType="none" transparent statusBarTranslucent>
        <GHRootView style={{ flex: 1 }}>
          <Animated.View style={[styles.playerModal, modalStyle]}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {backdropUri && (
              <ImageBackground source={{ uri: backdropUri }} style={styles.playerBg} blurRadius={50}>
                <LinearGradient
                  colors={['rgba(5,6,15,0.7)', 'rgba(5,6,15,0.95)', 'rgba(5,6,15,1)']}
                  style={StyleSheet.absoluteFill}
                />
              </ImageBackground>
            )}

            <LinearGradient
              pointerEvents="none"
              colors={[`${accentColor}44`, 'transparent']}
              style={styles.playerGlow}
            />

            <View style={[styles.playerHeader, { paddingTop: insets.top + 10 }]}>
              <TouchableOpacity style={styles.playerHeaderBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-down" size={28} color="#fff" />
              </TouchableOpacity>

              <View style={styles.playerHeaderCenter}>
                <Text style={styles.playerHeaderTitle}>Now Playing</Text>
                <Text style={styles.playerHeaderSubtitle}>Movie Soundtrack</Text>
              </View>

              <View style={styles.playerHeaderActions}>
                <TouchableOpacity style={styles.playerHeaderBtn} onPress={handleDownload}>
                  <Ionicons name="cloud-download-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.playerHeaderBtn} onPress={openUpNextSheet}>
                  <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

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

            <View style={styles.playerContent}>
              {streamData?.uri && shouldUseVideoPlayer ? (
                <View style={(mode === 'video' && showVideo) ? styles.videoContainer : { height: 0, width: 0, overflow: 'hidden', position: 'absolute' }}>
                  <Video
                    ref={videoRef}
                    source={videoSource ?? undefined}
                    style={styles.video}
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay
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

              {showLyrics && (
                <LyricsView
                  lyrics={lyrics}
                  currentTime={playerState.position / 1000}
                  onClose={() => setShowLyrics(false)}
                  isLoading={lyricsLoading}
                />
              )}

              <View style={styles.trackInfo}>
                <Text style={styles.trackTitle} numberOfLines={2}>{title}</Text>
                <Text style={styles.trackArtist}>{year ? `${year} • ` : ''}Original Soundtrack</Text>
              </View>

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
                    {waveAnims.map((anim, i) => (
                      <WaveBar key={`r-${i}`} anim={anim} color={accentColor} />
                    ))}
                  </>
                )}
              </View>

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
              enableContentPanningGesture
              enableHandlePanningGesture
              keyboardBlurBehavior="restore"
              android_keyboardInputMode="adjustResize"
              onChange={handleUpNextSheetChange}
              backdropComponent={(props) => (
                <BottomSheetBackdrop
                  {...props}
                  appearsOnIndex={0}
                  disappearsOnIndex={-1}
                  opacity={0.45}
                  pressBehavior="close"
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
                <TouchableOpacity
                  style={styles.upNextCloseBtn}
                  onPress={() => upNextSheetRef.current?.close()}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              </View>
              <BottomSheetScrollView
                contentContainerStyle={[styles.upNextList, { paddingBottom: insets.bottom + 30 }]}
                showsVerticalScrollIndicator={true}
                bounces={true}
                nestedScrollEnabled
                style={{ flex: 1, minHeight: 100 }}
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
        </GHRootView>
      </Modal>

      {minimized && active && (
        <View style={styles.floatingPlayerWrap}>
          <LinearGradient
            colors={['rgba(20,20,30,0.98)', 'rgba(10,10,15,0.98)']}
            style={styles.floatingPlayer}
          />
          <View style={styles.floatingProgressTrack}>
            <View style={[styles.floatingProgressFill, { width: `${progressPercent}%`, backgroundColor: accentColor }]} />
          </View>
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
            <TouchableOpacity style={styles.floatingControl} onPress={handleDownload}>
              <Ionicons name="cloud-download-outline" size={16} color="#fff" />
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
        </View>
      )}
    </>
  );
});

export default MusicPlayerModal;

const styles = StyleSheet.create({
  playerModal: {
    flex: 1,
    backgroundColor: '#05060f',
  },
  floatingPlayerWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 90,
    height: 70,
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
  floatingProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  floatingProgressFill: {
    height: '100%',
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
  playerHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  upNextCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
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
