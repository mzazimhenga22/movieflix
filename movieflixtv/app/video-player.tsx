import { joinWatchPartyAsParticipant, leaveWatchPartyAsParticipant, type WatchPartyEpisode } from '@/lib/watchparty/controller';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import {
  Audio,
  AVPlaybackSource,
  AVPlaybackStatusSuccess,
  InterruptionModeAndroid,
  InterruptionModeIOS,
  ResizeMode,
  Video,
} from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppStateStatus } from 'react-native';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  FlatList,
  Image,
  InteractionManager,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NativeAdCard from '../components/ads/NativeAdCard';
import { API_BASE_URL, API_KEY } from '../constants/api';
import { firestore } from '../constants/firebase';
import { usePromotedProducts } from '../hooks/use-promoted-products';
import { useUser } from '../hooks/use-user';
import { logInteraction } from '../lib/algo';
import { VideoMaskingOverlay } from '../lib/engineer';
import { syncMovieMatchProfile } from '../lib/movieMatchSync';
import { buildProfileScopedKey, getStoredActiveProfile, type StoredProfile } from '../lib/profileStorage';
import { buildScrapeDebugTag, buildSourceOrder } from '../lib/videoPlaybackShared';
import { consumePrefetchedPlayback } from '../lib/videoPrefetchCache';
import { useSubscription } from '../providers/SubscriptionProvider';
import { usePStream, type PStreamPlayback } from '../src/pstream/usePStream';
import type { Media } from '../types';
import { TvFocusable } from './components/TvSpatialNavigation';
import { trackPromotionClick, trackPromotionImpression } from './marketplace/api';
// WebRTC - only available on native, stubs for web
let RTCView: any = View;
let mediaDevices: any = null;
let RTCPeerConnection: any = null;
let RTCSessionDescription: any = null;
let RTCIceCandidate: any = null;

if (Platform.OS !== 'web') {
  try {
    const webrtc = require('react-native-webrtc');
    RTCView = webrtc.RTCView || View;
    mediaDevices = webrtc.mediaDevices;
    RTCPeerConnection = webrtc.RTCPeerConnection;
    RTCSessionDescription = webrtc.RTCSessionDescription;
    RTCIceCandidate = webrtc.RTCIceCandidate;
  } catch {
    // WebRTC not available
  }
}

// Animated section wrapper
const AnimatedSection = React.memo(function AnimatedSection({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
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
const FALLBACK_EPISODE_IMAGE = 'https://via.placeholder.com/160x90?text=Episode';
type UpcomingEpisode = {
  id?: number;
  title?: string;
  seasonName?: string;
  episodeNumber?: number;
  overview?: string;
  runtime?: number;
  stillPath?: string | null;
  seasonNumber?: number;
  seasonTmdbId?: number;
  episodeTmdbId?: number;
  seasonEpisodeCount?: number;
};
type CaptionSource = {
  id: string;
  type: 'srt' | 'vtt';
  url: string;
  language?: string;
  display?: string;
};
type PlaybackSource = {
  uri: string;
  headers?: Record<string, string>;
  streamType?: string;
  captions?: CaptionSource[];
  sourceId?: string;
  embedId?: string;
};
type CaptionCue = {
  start: number;
  end: number;
  text: string;
};
type AudioTrackOption = {
  id: string;
  name?: string;
  language?: string;
  groupId?: string;
  isDefault?: boolean;
};
type QualityOption = {
  id: string;
  label: string;
  uri: string;
  resolution?: string;
  bandwidth?: number;
  codecs?: string;
};

// Fetch subtitles from multiple free sources (parity with phone player)
async function fetchFallbackSubtitles(
  imdbId?: string,
  tmdbId?: string,
  mediaType?: string,
  seasonNum?: number,
  episodeNum?: number,
): Promise<CaptionSource[]> {
  if (!imdbId && !tmdbId) return [];

  const subs: CaptionSource[] = [];

  // Try OpenSubtitles.org hash-less search (free endpoint)
  try {
    const imdbNum = imdbId?.replace('tt', '') || '';
    let osUrl = `https://rest.opensubtitles.org/search/imdbid-${imdbNum}`;
    if (mediaType === 'tv' && seasonNum && episodeNum) {
      osUrl += `/season-${seasonNum}/episode-${episodeNum}`;
    }

    const osResponse = await fetch(osUrl, {
      headers: {
        'User-Agent': 'TemporaryUserAgent',
        'X-User-Agent': 'TemporaryUserAgent',
      },
    });

    if (osResponse.ok) {
      const osData = await osResponse.json();
      const seenLangs = new Set<string>();

      for (const item of osData ?? []) {
        if (!item?.SubDownloadLink) continue;

        const lang = item.ISO639?.toLowerCase() || item.LanguageName?.toLowerCase() || 'en';
        if (seenLangs.has(lang)) continue;
        seenLangs.add(lang);

        subs.push({
          id: `os-${item.IDSubtitleFile || subs.length}`,
          type: 'srt',
          url: item.SubDownloadLink.replace('.gz', ''),
          language: lang,
          display: item.LanguageName || lang.toUpperCase(),
        });

        if (subs.length >= 10) break;
      }
    }
  } catch (err) {
    if (__DEV__) console.warn('[OpenSubs] Fetch failed', err);
  }

  // If no subs found, try YIFY subs for movies
  if (subs.length === 0 && mediaType !== 'tv' && imdbId) {
    try {
      const yifyRes = await fetch(`https://yifysubtitles.ch/movie-imdb/${imdbId}`);
      if (yifyRes.ok) {
        const html = await yifyRes.text();
        const matches = html.matchAll(/href="(\/subtitles\/[^\"]+)"/g);
        let count = 0;
        for (const match of matches) {
          if (count >= 5) break;
          const subPage = match[1];
          const langMatch = subPage.match(/\/subtitles\/[^/]+\/([^/]+)/);
          const lang = langMatch?.[1] || 'english';

          subs.push({
            id: `yify-${count}`,
            type: 'srt',
            url: `https://yifysubtitles.ch${subPage}`,
            language: lang.slice(0, 2),
            display: lang.charAt(0).toUpperCase() + lang.slice(1),
          });
          count++;
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[YIFY] Fetch failed', err);
    }
  }

  if (__DEV__ && subs.length > 0) {
    console.log('[Subtitles] Found fallback subs:', subs.length);
  }

  return subs;
}
const CONTROLS_HIDE_DELAY_PLAYING = 10500;
const CONTROLS_HIDE_DELAY_PAUSED = 16500;
const SURFACE_DOUBLE_TAP_MS = 350;
const DEFAULT_STREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const RGSHOWS_REFERER = 'https://www.rgshows.ru/';
const RGSHOWS_ORIGIN = 'https://www.rgshows.ru';

function normalizePlaybackUri(uri: string): string {
  try {
    const urlObj = new URL(uri);
    if (urlObj.hostname === 'proxy.pstream.mov' && urlObj.pathname === '/m3u8-proxy') {
      const encodedUrl = urlObj.searchParams.get('url');
      if (!encodedUrl) return uri;
      try {
        const decoded = decodeURIComponent(encodedUrl);
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
      } catch { }
      // Support base64url-encoded url param (best-effort)
      try {
        const base64 = encodedUrl.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
      } catch { }
    }
  } catch { }
  return uri;
}

type TmdbEnrichment = { imdbId?: string; releaseYear?: number };
const tmdbEnrichmentCache = new Map<string, TmdbEnrichment>();

async function fetchTmdbEnrichment(
  tmdbId: string,
  mediaType: 'movie' | 'tv',
  signal?: AbortSignal,
): Promise<TmdbEnrichment> {
  const url = `${API_BASE_URL}/${mediaType}/${tmdbId}?api_key=${API_KEY}&append_to_response=external_ids`;
  const res = await fetch(url, { signal });
  if (!res.ok) return {};
  const data: any = await res.json();

  const imdbIdRaw = data?.imdb_id ?? data?.external_ids?.imdb_id;
  const imdbId = typeof imdbIdRaw === 'string' && imdbIdRaw.trim() ? imdbIdRaw.trim() : undefined;

  const dateRaw = mediaType === 'movie' ? data?.release_date : data?.first_air_date;
  const yearRaw = typeof dateRaw === 'string' ? parseInt(dateRaw.slice(0, 4), 10) : NaN;
  const releaseYear = Number.isFinite(yearRaw) ? yearRaw : undefined;

  return { imdbId, releaseYear };
}

const needsRgShowsHeaders = (uri?: string, sourceId?: string, embedId?: string) => {
  const lower = uri?.toLowerCase() ?? '';
  if (!lower && !sourceId && !embedId) return false;
  return (
    lower.includes('rgshows') ||
    lower.includes('luaix') ||
    lower.includes('rgflix') ||
    sourceId === 'rgshows' ||
    (embedId ? embedId.toLowerCase().includes('rgshows') : false)
  );
};

function sanitizePlaybackHeaders(incoming?: Record<string, string>): Record<string, string> | undefined {
  if (!incoming) return undefined;
  const out: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(incoming)) {
    if (!rawKey) continue;
    if (rawValue === undefined || rawValue === null) continue;
    const value = String(rawValue);
    if (!value) continue;
    const lower = rawKey.trim().toLowerCase();
    if (!lower) continue;

    // Never pin Host (breaks redirected segment requests on some CDNs/players).
    if (lower === 'host' || lower === 'content-length') continue;

    switch (lower) {
      case 'user-agent':
        out['User-Agent'] = value;
        break;
      case 'referer':
        out.Referer = value;
        break;
      case 'origin':
        out.Origin = value;
        break;
      case 'accept':
        out.Accept = value;
        break;
      case 'accept-language':
        out['Accept-Language'] = value;
        break;
      case 'accept-encoding':
        out['Accept-Encoding'] = value;
        break;
      default:
        out[rawKey] = value;
        break;
    }
  }

  return Object.keys(out).length ? out : undefined;
}

function buildPlaybackHeaders(
  uri: string,
  sourceId?: string,
  embedId?: string,
  incoming?: Record<string, string>,
): Record<string, string> {
  const sanitizedIncoming = sanitizePlaybackHeaders(incoming);
  const headers: Record<string, string> = {
    'User-Agent': DEFAULT_STREAM_UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    ...(sanitizedIncoming ?? {}),
  };

  if (needsRgShowsHeaders(uri, sourceId, embedId)) {
    headers.Referer = headers.Referer ?? RGSHOWS_REFERER;
    headers.Origin = headers.Origin ?? RGSHOWS_ORIGIN;
  }

  // Some Android/TV networking stacks appear to behave better when using lowercase keys.
  if (headers['User-Agent'] && !headers['user-agent']) headers['user-agent'] = headers['User-Agent'];
  if (headers.Referer && !headers.referer) headers.referer = headers.Referer;
  if (headers.Origin && !headers.origin) headers.origin = headers.Origin;
  if (headers.Cookie && !headers.cookie) headers.cookie = headers.Cookie;

  return headers;
}

function createPlaybackSource(params: {
  uri: string;
  headers?: Record<string, string>;
  streamType?: string;
  captions?: CaptionSource[];
  sourceId?: string;
  embedId?: string;
}): PlaybackSource {
  const normalizedUri = normalizePlaybackUri(params.uri);
  const { headers, streamType, captions, sourceId, embedId } = params;
  return {
    uri: normalizedUri,
    streamType,
    captions,
    sourceId,
    embedId,
    headers: buildPlaybackHeaders(normalizedUri, sourceId, embedId, headers),
  };
}
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
// (TV) Brightness/volume sliders removed — system controls are used instead.
const FloatingEmoji = React.memo(({ emoji, x }: { emoji: string; x: number }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 3500 + Math.random() * 1000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [windowHeight, -100],
  });

  const translateX = anim.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, 20, -20, 20, 0],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.1, 0.8, 1],
    outputRange: [0, 1, 1, 0],
  });

  const scale = anim.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.5, 1.5, 1.2],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x * windowWidth,
        transform: [{ translateY }, { translateX }, { scale }],
        opacity,
        zIndex: 9999,
      }}
      pointerEvents="none"
    >
      <Text style={{ fontSize: 32 }}>{emoji}</Text>
    </Animated.View>
  );
});

const FaceCam = React.memo(({ stream, label, isLocal }: { stream: any; label: string; isLocal?: boolean }) => {
  if (!stream) return null;
  return (
    <View style={styles.faceCamContainer}>
      <RTCView
        streamURL={stream.toURL()}
        style={styles.faceCamView}
        objectFit="cover"
        mirror={isLocal}
      />
      <View style={styles.faceCamLabel}>
        <Text style={styles.faceCamLabelText} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
});

const VideoPlayerScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  // movieflixtv is a TV-only surface; force TV UI even on platforms where Platform.isTV may be false.
  const isTvDevice = true;
  const insets = useSafeAreaInsets();
  const { currentPlan } = useSubscription();
  const { products: promotedProducts, hasAds: hasPromotedAds } = usePromotedProducts({ placement: 'story', limit: 20 });

  const [transitionReady, setTransitionReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const handle = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) setTransitionReady(true);
    });
    return () => {
      cancelled = true;
      // @ts-ignore - cancel exists at runtime on InteractionManager handle
      handle?.cancel?.();
    };
  }, []);
  const roomCode = typeof params.roomCode === 'string' ? params.roomCode : undefined;
  const passedVideoUrl = typeof params.videoUrl === 'string' ? params.videoUrl : undefined;
  const passedStreamType = typeof params.streamType === 'string' ? params.streamType : undefined;
  const rawHeaders = typeof params.videoHeaders === 'string' ? params.videoHeaders : undefined;
  const rawTitle = typeof params.title === 'string' ? params.title : undefined;
  const displayTitle = rawTitle && rawTitle.trim().length > 0 ? rawTitle : 'Now Playing';
  const rawMediaType = typeof params.mediaType === 'string' ? params.mediaType : undefined;
  const isTvShow = rawMediaType === 'tv';
  const normalizedMediaType = isTvShow ? 'tv' : 'movie';
  const tmdbId = typeof params.tmdbId === 'string' ? params.tmdbId : undefined;
  const imdbId = typeof params.imdbId === 'string' ? params.imdbId : undefined;
  const rawPosterPath = typeof params.posterPath === 'string' ? params.posterPath : undefined;
  const rawBackdropPath = typeof params.backdropPath === 'string' ? params.backdropPath : undefined;
  const rawOverview = typeof params.overview === 'string' ? params.overview : undefined;
  const rawReleaseDateParam = typeof params.releaseDate === 'string' ? params.releaseDate : undefined;
  const parsedVoteAverageParam =
    typeof params.voteAverage === 'string' ? parseFloat(params.voteAverage) : NaN;
  const voteAverageValue = Number.isFinite(parsedVoteAverageParam) ? parsedVoteAverageParam : undefined;
  const rawGenreIdsParam = typeof params.genreIds === 'string' ? params.genreIds : undefined;
  const parsedReleaseYear = typeof params.releaseYear === 'string' ? parseInt(params.releaseYear, 10) : undefined;
  const releaseYear = typeof parsedReleaseYear === 'number' && Number.isFinite(parsedReleaseYear)
    ? parsedReleaseYear
    : undefined;

  const [tmdbEnrichment, setTmdbEnrichment] = useState<TmdbEnrichment | null>(null);
  const tmdbEnrichmentRef = useRef<TmdbEnrichment | null>(null);
  useEffect(() => {
    tmdbEnrichmentRef.current = tmdbEnrichment;
  }, [tmdbEnrichment]);
  useEffect(() => {
    if (!transitionReady) return;
    if (!tmdbId || (rawMediaType !== 'movie' && rawMediaType !== 'tv')) {
      setTmdbEnrichment(null);
      return;
    }

    const key = `${rawMediaType}:${tmdbId}`;
    const cached = tmdbEnrichmentCache.get(key);
    if (cached) {
      setTmdbEnrichment(cached);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    (async () => {
      try {
        const enrichment = await fetchTmdbEnrichment(tmdbId, rawMediaType, controller.signal);
        if (cancelled) return;
        tmdbEnrichmentCache.set(key, enrichment);
        setTmdbEnrichment(enrichment);
      } catch {
        if (cancelled) return;
        setTmdbEnrichment(null);
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [tmdbId, rawMediaType, transitionReady]);

  const contentHintParam = typeof params.contentHint === 'string' ? params.contentHint : undefined;
  const preferAnimeSources = contentHintParam === 'anime';
  const parseNumericParam = (value?: string) => {
    if (!value) return undefined;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const seasonNumberParam = parseNumericParam(
    typeof params.seasonNumber === 'string' ? params.seasonNumber : undefined,
  );
  const episodeNumberParam = parseNumericParam(
    typeof params.episodeNumber === 'string' ? params.episodeNumber : undefined,
  );
  const seasonTmdbId = typeof params.seasonTmdbId === 'string' ? params.seasonTmdbId : undefined;
  const episodeTmdbId = typeof params.episodeTmdbId === 'string' ? params.episodeTmdbId : undefined;
  const seasonTitleParam = typeof params.seasonTitle === 'string' ? params.seasonTitle : undefined;
  const seasonEpisodeCountParam = parseNumericParam(
    typeof params.seasonEpisodeCount === 'string' ? params.seasonEpisodeCount : undefined,
  );
  const initialSeasonNumber = isTvShow ? seasonNumberParam ?? undefined : undefined;
  const initialEpisodeNumber = isTvShow ? episodeNumberParam ?? undefined : undefined;
  const initialSeasonTitleValue = isTvShow
    ? seasonTitleParam ?? (initialSeasonNumber ? `Season ${initialSeasonNumber}` : undefined)
    : undefined;
  const upcomingEpisodes = useMemo<UpcomingEpisode[]>(() => {
    const serialized = typeof params.upcomingEpisodes === 'string' ? params.upcomingEpisodes : undefined;
    if (!serialized) return [];
    try {
      const parsed = JSON.parse(serialized);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [params.upcomingEpisodes]);
  const parsedGenreIds = useMemo(() => {
    if (!rawGenreIdsParam) return undefined;
    return rawGenreIdsParam
      .split(',')
      .map(segment => parseInt(segment.trim(), 10))
      .filter(value => Number.isFinite(value));
  }, [rawGenreIdsParam]);
  const parsedTmdbNumericId = useMemo(() => {
    if (!tmdbId) return null;
    const numeric = parseInt(tmdbId, 10);
    return Number.isFinite(numeric) ? numeric : null;
  }, [tmdbId]);
  const parsedVideoHeaders = useMemo<Record<string, string> | undefined>(() => {
    if (!rawHeaders) return undefined;
    try {
      return JSON.parse(decodeURIComponent(rawHeaders));
    } catch {
      return undefined;
    }
  }, [rawHeaders]);

  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | undefined>(() => passedVideoUrl);
  const [resolvedVideoHeaders, setResolvedVideoHeaders] = useState<Record<string, string> | undefined>(
    () => parsedVideoHeaders,
  );
  const [resolvedStreamType, setResolvedStreamType] = useState<string | undefined>(() => passedStreamType);

  useEffect(() => {
    if (roomCode) return;
    setResolvedVideoUrl(passedVideoUrl);
    setResolvedVideoHeaders(parsedVideoHeaders);
    setResolvedStreamType(passedStreamType);
  }, [roomCode, passedVideoUrl, parsedVideoHeaders, passedStreamType]);

  const { loading: scrapingInitial, scrape: scrapeInitial } = usePStream();
  const { loading: scrapingEpisode, scrape: scrapeEpisode } = usePStream();
  const isFetchingStream = scrapingInitial || scrapingEpisode;
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [episodeDrawerOpen, setEpisodeDrawerOpen] = useState(false);
  const [playbackSource, setPlaybackSource] = useState<PlaybackSource | null>(() =>
    resolvedVideoUrl
      ? createPlaybackSource({
        uri: resolvedVideoUrl,
        headers: resolvedVideoHeaders,
        streamType: resolvedStreamType,
      })
      : null,
  );

  useEffect(() => {
    if (transitionReady) return;
    if (playbackSource) {
      setTransitionReady(true);
    }
  }, [playbackSource, transitionReady]);
  const playbackSourceRef = useRef<PlaybackSource | null>(playbackSource);
  const [watchHistoryKey, setWatchHistoryKey] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<StoredProfile | null>(null);
  const videoRef = useRef<Video | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const isPlayingRef = useRef(true);
  const pendingAudioFocusRetryRef = useRef(false);
  const [activeTitle, setActiveTitle] = useState(displayTitle);
  useEffect(() => {
    setActiveTitle(displayTitle);
  }, [displayTitle]);
  const [isPlaying, setIsPlaying] = useState(true);
  const lastPlayPauseIntentTsRef = useRef(0);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const ensurePlaybackAudioMode = useCallback(async () => {
    try {
      await Audio.setIsEnabledAsync(true);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      const isActive = nextState === 'active';
      setAppIsActive(isActive);

      if (isActive && pendingAudioFocusRetryRef.current) {
        pendingAudioFocusRetryRef.current = false;
        const video = videoRef.current;
        if (!video) return;
        if (!isPlayingRef.current || midrollActiveRef.current) return;
        void (async () => {
          await ensurePlaybackAudioMode();
          try {
            await video.playAsync();
          } catch {
            // ignore
          }
        })();
      }
    });
    return () => sub.remove();
  }, [ensurePlaybackAudioMode]);

  const [showControls, setShowControls] = useState(true);
  const showControlsRef = useRef(true);
  const [controlsSession, setControlsSession] = useState(0);
  const lastSurfaceTapRef = useRef(0);
  const [positionMillis, setPositionMillis] = useState(0);
  const positionMillisRef = useRef(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [bufferedMillis, setBufferedMillis] = useState(0);
  const bufferedMillisRef = useRef(0);
  const [seekPosition, setSeekPosition] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [midrollActive, setMidrollActive] = useState(false);
  const midrollActiveRef = useRef(false);
  const [midrollRemainingSec, setMidrollRemainingSec] = useState(0);
  const midrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const midrollStartedAtRef = useRef<number | null>(null);
  const midrollWasPlayingRef = useRef(true);
  const lastMidrollShownAtRef = useRef(0);
  const midrollCuePointsRef = useRef<number[]>([]);
  const midrollScheduleKeyRef = useRef('');
  const [midrollProduct, setMidrollProduct] = useState<any>(null);
  const midrollImpressionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (currentPlan !== 'free') return;
    if (!midrollActive) return;
    const productId = midrollProduct?.id ? String(midrollProduct.id) : '';
    if (!productId) return;
    if (midrollImpressionsRef.current.has(productId)) return;
    midrollImpressionsRef.current.add(productId);
    void trackPromotionImpression({ productId, placement: 'story' }).catch(() => { });
  }, [currentPlan, midrollActive, midrollProduct?.id]);
  useEffect(() => {
    return () => {
      if (midrollTimerRef.current) {
        clearInterval(midrollTimerRef.current);
        midrollTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    midrollActiveRef.current = midrollActive;
  }, [midrollActive]);

  useEffect(() => {
    showControlsRef.current = showControls;
  }, [showControls]);

  useEffect(() => {
    positionMillisRef.current = positionMillis;
  }, [positionMillis]);
  const { user } = useUser();
  const [chatMessages, setChatMessages] = useState<
    { id: string; user: string; text: string; createdAt?: any; avatar?: string | null }[]
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [reactions, setReactions] = useState<Array<{ id: string; emoji: string; x: number }>>([]);
  const [watchPartyParticipantsCount, setWatchPartyParticipantsCount] = useState<number>(0);
  const joinedAsParticipantRef = useRef(false);

  // Face Cam (TV is passive: can see others, cannot turn on own)
  const [remoteCamStreams, setRemoteCamStreams] = useState<Record<string, any>>({});
  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});

  const getOrCreatePC = useCallback((targetUid: string) => {
    if (pcsRef.current[targetUid]) return pcsRef.current[targetUid];

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    (pc as any).onicecandidate = (event: any) => {
      if (event.candidate && roomCode && user?.uid) {
        const ref = doc(firestore, 'watchParties', roomCode, 'camSignaling', user.uid, 'ice', Math.random().toString(36).slice(2));
        void setDoc(ref, {
          candidate: event.candidate.toJSON(),
          targetUid,
          createdAt: serverTimestamp()
        });
      }
    };

    (pc as any).ontrack = (event: any) => {
      if (event.streams[0]) {
        setRemoteCamStreams(prev => ({ ...prev, [targetUid]: event.streams[0] }));
      }
    };

    pcsRef.current[targetUid] = pc;
    return pc;
  }, [roomCode, user?.uid]);

  // Signaling Effect (TV version - passive)
  useEffect(() => {
    if (!roomCode || !user?.uid) return;

    // Broadcaster Intent (TV can signal it's active to receive, but doesn't share local tracks)
    const mySignalingRef = doc(firestore, 'watchParties', roomCode, 'camSignaling', user.uid);
    void setDoc(mySignalingRef, { active: true, updatedAt: serverTimestamp(), isTV: true });

    const signalingCol = collection(firestore, 'watchParties', roomCode, 'camSignaling');
    const unsub = onSnapshot(signalingCol, async (snap) => {
      for (const change of snap.docChanges()) {
        const otherId = change.doc.id;
        if (otherId === user.uid) continue;

        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          if (!data.active) continue;

          // For TV, we always let the other side initiate if it's a mobile user
          // or we can follow the same lexicographical rule.
          if (user.uid > otherId) {
            const pc = getOrCreatePC(otherId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            void setDoc(doc(firestore, 'watchParties', roomCode, 'camSignaling', user.uid, 'offers', otherId), {
              sdp: offer.sdp,
              type: offer.type,
              createdAt: serverTimestamp()
            });
          }
        }
      }
    });

    return () => {
      unsub();
      void updateDoc(mySignalingRef, { active: false }).catch(() => { });
      Object.values(pcsRef.current).forEach(pc => pc.close());
      pcsRef.current = {};
      setRemoteCamStreams({});
    };
  }, [roomCode, user?.uid, getOrCreatePC]);

  useEffect(() => {
    if (isTvDevice) setShowChat(false);
  }, [isTvDevice]);

  // Join party tracking
  useEffect(() => {
    if (!roomCode || !user?.uid) return;

    let cancelled = false;
    const participantsRef = collection(firestore, 'watchParties', roomCode, 'participants');
    const unsub = onSnapshot(query(participantsRef, orderBy('joinedAt', 'desc')), (snap) => {
      if (!cancelled) setWatchPartyParticipantsCount(snap.size);
    });

    if (!joinedAsParticipantRef.current) {
      joinedAsParticipantRef.current = true;
      void joinWatchPartyAsParticipant({
        code: roomCode,
        userId: user.uid,
        displayName: user.displayName || user.email || 'TV Guest',
        avatarUrl: (user as any)?.photoURL ?? null,
      });
    }

    return () => {
      cancelled = true;
      unsub();
      void leaveWatchPartyAsParticipant({ code: roomCode, userId: user.uid });
    };
  }, [roomCode, user]);

  // Reaction Listener
  useEffect(() => {
    if (!roomCode) return;
    const reactionsRef = collection(firestore, 'watchParties', roomCode, 'reactions');
    const q = query(reactionsRef, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const id = change.doc.id;
          const createdAt = data.createdAt?.toMillis?.() ?? Date.now();
          if (Date.now() - createdAt < 5000) {
            setReactions(prev => [...prev, { id, emoji: data.emoji, x: data.x }]);
            setTimeout(() => {
              setReactions(prev => prev.filter(r => r.id !== id));
            }, 4000);
          }
        }
      });
    });
    return () => unsub();
  }, [roomCode]);

  // Chat Listener
  useEffect(() => {
    if (!roomCode) return;
    const messagesRef = collection(firestore, 'watchParties', roomCode, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          user: data.userDisplayName || 'Guest',
          text: data.text || '',
          avatar: data.userAvatar || null,
        });
      });
      setChatMessages(items);
    });
    return () => unsub();
  }, [roomCode]);

  const watchPartyRef = useMemo(() => (roomCode ? doc(firestore, 'watchParties', roomCode) : null), [roomCode]);
  const [watchPartyHostId, setWatchPartyHostId] = useState<string | null>(null);
  const isWatchPartyHost = Boolean(roomCode && user?.uid && watchPartyHostId && user.uid === watchPartyHostId);
  const [watchPartyIsOpen, setWatchPartyIsOpen] = useState(true);
  const watchPartyBlocked = Boolean(roomCode && !isWatchPartyHost && !watchPartyIsOpen);
  const [currentWatchPartyEpisode, setCurrentWatchPartyEpisode] = useState<WatchPartyEpisode | null>(null);
  const lastRemoteEpisodeUpdatedAtRef = useRef(0);

  useEffect(() => {
    if (!roomCode) {
      setWatchPartyIsOpen(true);
    }
  }, [roomCode]);

  const applyingRemotePlaybackRef = useRef(false);
  const pendingRemotePlaybackRef = useRef<{
    isPlaying: boolean;
    positionMillis: number;
    updatedAtMillis: number;
  } | null>(null);
  const lastRemoteUpdatedAtRef = useRef(0);

  const lastPlaybackPublishRef = useRef({ ts: 0, positionMillis: 0, isPlaying: false });

  const publishWatchPartyPlayback = useCallback(
    async (next: { isPlaying: boolean; positionMillis: number }, opts?: { force?: boolean }) => {
      if (!watchPartyRef) return;
      if (!isWatchPartyHost) return;
      if (!user?.uid) return;

      const now = Date.now();
      if (!opts?.force && now - lastPlaybackPublishRef.current.ts < 900) return;
      lastPlaybackPublishRef.current = { ts: now, positionMillis: next.positionMillis, isPlaying: next.isPlaying };

      await updateDoc(watchPartyRef, {
        isOpen: true,
        playback: {
          isPlaying: next.isPlaying,
          positionMillis: Math.max(0, Math.floor(next.positionMillis)),
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
      }).catch(() => { });
    },
    [isWatchPartyHost, user?.uid, watchPartyRef],
  );

  const applyRemotePlayback = useCallback(
    async (remote: { isPlaying: boolean; positionMillis: number; updatedAtMillis: number }) => {
      if (roomCode && !isWatchPartyHost && !watchPartyIsOpen) {
        pendingRemotePlaybackRef.current = remote;
        return;
      }
      const video = videoRef.current;
      if (!video) {
        pendingRemotePlaybackRef.current = remote;
        return;
      }

      const updatedAtMillis = remote.updatedAtMillis || 0;
      if (updatedAtMillis && updatedAtMillis <= lastRemoteUpdatedAtRef.current) return;
      if (updatedAtMillis) lastRemoteUpdatedAtRef.current = updatedAtMillis;

      let desiredPosition = remote.positionMillis;
      if (remote.isPlaying && updatedAtMillis) {
        desiredPosition += Math.max(0, Date.now() - updatedAtMillis);
      }
      desiredPosition = Math.max(0, desiredPosition);
      if (durationMillis > 0) {
        desiredPosition = Math.min(desiredPosition, Math.max(0, durationMillis - 250));
      }

      const diff = Math.abs(positionMillisRef.current - desiredPosition);
      applyingRemotePlaybackRef.current = true;
      try {
        if (diff > 1500) {
          await video.setPositionAsync(desiredPosition);
        }
        if (remote.isPlaying) {
          await ensurePlaybackAudioMode();
          await video.playAsync();
        } else {
          await video.pauseAsync();
        }
      } catch {
        pendingRemotePlaybackRef.current = remote;
      } finally {
        applyingRemotePlaybackRef.current = false;
      }
    },
    [durationMillis, ensurePlaybackAudioMode, isWatchPartyHost, roomCode, watchPartyIsOpen],
  );

  useEffect(() => {
    if (!watchPartyRef) return;
    const unsub = onSnapshot(watchPartyRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const hostId = typeof data.hostId === 'string' ? data.hostId : null;
      setWatchPartyHostId(hostId);

      const isOpen = Boolean(data.isOpen);
      setWatchPartyIsOpen(isOpen);

      if (!passedVideoUrl && typeof data.videoUrl === 'string' && data.videoUrl) {
        setResolvedVideoUrl((prev) => prev ?? data.videoUrl);
      }
      if (!parsedVideoHeaders && data.videoHeaders && typeof data.videoHeaders === 'object') {
        setResolvedVideoHeaders((prev) => prev ?? (data.videoHeaders as Record<string, string>));
      }
      if (!passedStreamType && typeof data.streamType === 'string' && data.streamType) {
        setResolvedStreamType((prev) => prev ?? data.streamType);
      }

      const hostNow = Boolean(user?.uid && hostId && user.uid === hostId);

      // Handle episode sync for TV shows (guests only)
      const episode = data.episode;
      if (!hostNow && episode && typeof episode === 'object') {
        const episodeUpdatedAtMillis =
          typeof episode.updatedAt?.toMillis === 'function'
            ? episode.updatedAt.toMillis()
            : typeof episode.updatedAt === 'number'
              ? episode.updatedAt
              : 0;

        if (episodeUpdatedAtMillis && episodeUpdatedAtMillis > lastRemoteEpisodeUpdatedAtRef.current) {
          lastRemoteEpisodeUpdatedAtRef.current = episodeUpdatedAtMillis;
          setCurrentWatchPartyEpisode({
            seasonNumber: episode.seasonNumber ?? null,
            episodeNumber: episode.episodeNumber ?? null,
            seasonTmdbId: episode.seasonTmdbId ?? null,
            episodeTmdbId: episode.episodeTmdbId ?? null,
            seasonTitle: episode.seasonTitle ?? null,
            episodeTitle: episode.episodeTitle ?? null,
          });
        }
      }

      const playback = data.playback;
      if (hostNow) return;

      if (!isOpen) {
        setIsPlaying(false);
        try {
          (videoRef.current as any)?.pauseAsync?.().catch?.(() => { });
        } catch {
          // ignore
        }
        return;
      }
      if (!playback || typeof playback !== 'object') return;

      const isPlaying = Boolean(playback.isPlaying);
      const positionMillis = typeof playback.positionMillis === 'number' ? playback.positionMillis : 0;
      const updatedAtMillis =
        typeof playback.updatedAt?.toMillis === 'function'
          ? playback.updatedAt.toMillis()
          : typeof playback.updatedAt === 'number'
            ? playback.updatedAt
            : 0;

      const remote = { isPlaying, positionMillis, updatedAtMillis };
      pendingRemotePlaybackRef.current = remote;

      // Best-effort apply immediately when we already have a stream.
      if (playbackSourceRef.current?.uri) {
        void applyRemotePlayback(remote);
      }
    });
    return () => unsub();
  }, [applyRemotePlayback, parsedVideoHeaders, passedStreamType, passedVideoUrl, user?.uid, watchPartyRef]);

  useEffect(() => {
    if (!roomCode) return;
    if (isWatchPartyHost) return;
    if (!watchPartyIsOpen) return;
    const pendingRemote = pendingRemotePlaybackRef.current;
    if (pendingRemote) {
      void applyRemotePlayback(pendingRemote);
    }
  }, [applyRemotePlayback, isWatchPartyHost, roomCode, watchPartyIsOpen]);

  useEffect(() => {
    if (!watchPartyRef) return;
    if (!user?.uid) return;

    void updateDoc(watchPartyRef, {
      isOpen: true,
      videoUrl: resolvedVideoUrl ?? null,
      videoHeaders: resolvedVideoHeaders ?? null,
      streamType: resolvedStreamType ?? null,
    }).catch(() => { });

    return () => {
      if (!isWatchPartyHost) return;
      void updateDoc(watchPartyRef, { isOpen: false }).catch(() => { });
    };
  }, [isWatchPartyHost, resolvedStreamType, resolvedVideoHeaders, resolvedVideoUrl, user?.uid, watchPartyRef]);

  const [videoReloadKey, setVideoReloadKey] = useState(0);
  const prefetchKey = typeof params.__prefetchKey === 'string' ? params.__prefetchKey : undefined;
  const [prefetchChecked, setPrefetchChecked] = useState(() => !prefetchKey);
  const initialScrapeStartedRef = useRef(false);
  useEffect(() => {
    initialScrapeStartedRef.current = false;
  }, [prefetchKey, tmdbId, rawMediaType, seasonNumberParam, episodeNumberParam]);
  const watchHistoryEntry = useMemo<Media | null>(() => {
    if (!parsedTmdbNumericId) return null;
    const releaseDateForEntry = rawReleaseDateParam ?? (releaseYear ? `${releaseYear}` : undefined);
    return {
      id: parsedTmdbNumericId,
      title: displayTitle,
      name: displayTitle,
      poster_path: rawPosterPath,
      backdrop_path: rawBackdropPath,
      overview: rawOverview,
      media_type: normalizedMediaType,
      release_date: releaseDateForEntry,
      first_air_date: releaseDateForEntry,
      genre_ids: parsedGenreIds,
      vote_average: voteAverageValue,
      seasonNumber: initialSeasonNumber,
      episodeNumber: initialEpisodeNumber,
      seasonTitle: initialSeasonTitleValue,
    };
  }, [
    parsedTmdbNumericId,
    displayTitle,
    rawPosterPath,
    rawBackdropPath,
    rawOverview,
    normalizedMediaType,
    rawReleaseDateParam,
    releaseYear,
    parsedGenreIds,
    voteAverageValue,
    initialSeasonNumber,
    initialEpisodeNumber,
    initialSeasonTitleValue,
  ]);
  const watchEntryRef = useRef<Media | null>(null);
  const watchHistoryPersistRef = useRef(0);
  const [captionSources, setCaptionSources] = useState<CaptionSource[]>([]);
  const captionCacheRef = useRef<Record<string, CaptionCue[]>>({});
  const captionCuesRef = useRef<CaptionCue[]>([]);
  const captionIndexRef = useRef(0);
  const masterPlaylistRef = useRef<string | null>(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState<'off' | string>('off');
  const [captionLoadingId, setCaptionLoadingId] = useState<string | null>(null);
  const [activeCaptionText, setActiveCaptionText] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isPipSupported, setIsPipSupported] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const pipUiEnabled = Platform.OS === 'android' ? true : isPipSupported;
  const [isMini, setIsMini] = useState(false);
  const captionPreferenceKeyRef = useRef<string | null>(null);
  const [audioTrackOptions, setAudioTrackOptions] = useState<AudioTrackOption[]>([]);
  const [selectedAudioKey, setSelectedAudioKey] = useState<string>('auto');
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedQualityId, setSelectedQualityId] = useState<string>('auto');
  const [qualityOverrideUri, setQualityOverrideUri] = useState<string | null>(null);
  const [qualityLoadingId, setQualityLoadingId] = useState<string | null>(null);
  useEffect(() => {
    bufferedMillisRef.current = 0;
    setBufferedMillis(0);
  }, [videoReloadKey, playbackSource?.uri, qualityOverrideUri]);
  const [showBufferingOverlay, setShowBufferingOverlay] = useState(false);
  const bufferingOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeekAfterReloadRef = useRef<number | null>(null);
  const pendingShouldPlayAfterReloadRef = useRef<boolean | null>(null);
  const prevPositionRef = useRef<number>(0);
  const lastAdvanceTsRef = useRef<number>(Date.now());
  const statusLogRef = useRef<{ lastTs: number; lastKey: string }>({ lastTs: 0, lastKey: '' });
  const autoQualityStepRef = useRef(0);
  const lastAutoDowngradeTsRef = useRef(0);
  const [avDrawerOpen, setAvDrawerOpen] = useState(false);
  const hlsWarmupRef = useRef<{ key: string; seen: Set<string> }>({ key: '', seen: new Set() });
  const triedVariantUrisRef = useRef<Set<string>>(new Set());
  const initialVariantAppliedRef = useRef<string>('');
  const triedHttpsUpgradeRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    watchEntryRef.current = watchHistoryEntry;
  }, [watchHistoryEntry]);
  const refreshPipSupport = useCallback(() => {
    const player = videoRef.current as any;
    if (!player) {
      setIsPipSupported(false);
      return;
    }
    const canEnterPip =
      typeof player.presentPictureInPictureAsync === 'function' ||
      typeof player.enterPictureInPictureAsync === 'function';
    setIsPipSupported(canEnterPip);
  }, []);

  useEffect(() => {
    refreshPipSupport();
  }, [videoReloadKey, refreshPipSupport]);

  const handleVideoReadyForDisplay = useCallback(() => {
    refreshPipSupport();
  }, [refreshPipSupport]);
  useEffect(() => {
    return () => {
      if (bufferingOverlayTimeoutRef.current) {
        clearTimeout(bufferingOverlayTimeoutRef.current);
        bufferingOverlayTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Reset auto-downgrade state when the stream changes.
    autoQualityStepRef.current = 0;
    lastAutoDowngradeTsRef.current = 0;
  }, [playbackSource?.uri]);
  const bumpControlsLife = useCallback(() => setControlsSession(prev => prev + 1), []);
  const sourceOrder = useMemo(() => buildSourceOrder(preferAnimeSources), [preferAnimeSources]);
  const updateActiveCaption = useCallback(
    (position: number, resetIndex = false) => {
      if (selectedCaptionId === 'off') {
        if (resetIndex || captionCuesRef.current.length) {
          setActiveCaptionText(null);
          captionIndexRef.current = 0;
          captionCuesRef.current = [];
        }
        return;
      }
      const cues = captionCuesRef.current;
      if (!cues.length) {
        setActiveCaptionText(null);
        return;
      }
      let idx = resetIndex ? 0 : captionIndexRef.current;
      if (idx >= cues.length) idx = cues.length - 1;
      while (idx > 0 && position < cues[idx].start) {
        idx -= 1;
      }
      while (idx < cues.length - 1 && position > cues[idx].end) {
        idx += 1;
      }
      const cue = cues[idx];
      if (position >= cue.start && position <= cue.end) {
        setActiveCaptionText((prev) => (prev === cue.text ? prev : cue.text));
      } else {
        setActiveCaptionText((prev) => (prev === null ? prev : null));
      }
      captionIndexRef.current = idx;
    },
    [selectedCaptionId],
  );
  useEffect(() => {
    setPlaybackSource(
      resolvedVideoUrl
        ? createPlaybackSource({
          uri: resolvedVideoUrl,
          headers: resolvedVideoHeaders,
          streamType: resolvedStreamType,
        })
        : null,
    );
    triedVariantUrisRef.current = new Set();
    triedHttpsUpgradeRef.current = new Set();
    setScrapeError(null);
    setCaptionSources([]);
    setSelectedCaptionId('off');
    captionCuesRef.current = [];
    captionCacheRef.current = {};
    setActiveCaptionText(null);
    setAudioTrackOptions([]);
    setSelectedAudioKey('auto');
    setQualityOptions([]);
    setSelectedQualityId('auto');
    setQualityOverrideUri(null);
    setQualityLoadingId(null);
    setVideoReloadKey((prev) => prev + 1);
  }, [resolvedVideoUrl, resolvedVideoHeaders, resolvedStreamType]);
  useEffect(() => {
    masterPlaylistRef.current = playbackSource?.uri ?? null;
  }, [playbackSource?.uri]);
  useEffect(() => {
    let active = true;
    const syncHistoryKey = async () => {
      try {
        const profile = await getStoredActiveProfile();
        if (!active) return;
        setActiveProfile(profile ?? null);
        setWatchHistoryKey(buildProfileScopedKey('watchHistory', profile?.id ?? undefined));
        captionPreferenceKeyRef.current = buildProfileScopedKey('preferredCaptionTrack', profile?.id ?? undefined);
      } catch {
        if (active) {
          setActiveProfile(null);
          setWatchHistoryKey('watchHistory');
          captionPreferenceKeyRef.current = 'preferredCaptionTrack';
        }
      }
    };
    syncHistoryKey();
    return () => {
      active = false;
    };
  }, []);
  const [episodeQueue, setEpisodeQueue] = useState(upcomingEpisodes);
  useEffect(() => {
    setEpisodeQueue(upcomingEpisodes);
    if (!upcomingEpisodes.length) {
      setEpisodeDrawerOpen(false);
    }
  }, [upcomingEpisodes]);
  const applyPlaybackResult = useCallback(
    (playback: PStreamPlayback, options?: { title?: string }) => {
      if (!playback) return;
      triedVariantUrisRef.current = new Set();
      triedHttpsUpgradeRef.current = new Set();
      if (__DEV__) {
        console.log('[VideoPlayer] Applying playback result', {
          streamType: playback.stream?.type,
          sourceId: playback.sourceId,
          embedId: playback.embedId,
          hasCaptions: Boolean(playback.stream?.captions?.length),
          title: options?.title,
        });
      }
      const mappedCaptions: CaptionSource[] = (playback.stream?.captions ?? [])
        .filter((cap: any) => cap?.url)
        .map((cap: any, idx: number) => ({
          id: cap.id || `caption-${idx}`,
          type: cap.type === 'srt' || cap.type === 'vtt' ? cap.type : 'vtt',
          url: cap.url,
          language: cap.lang || cap.language,
          display: cap.label || cap.lang || cap.language || `Subtitle ${idx + 1}`,
        }));
      const payload = createPlaybackSource({
        uri: playback.uri,
        headers: playback.headers,
        streamType: playback.stream?.type,
        captions: mappedCaptions,
        sourceId: playback.sourceId,
        embedId: playback.embedId,
      });
      setPlaybackSource(payload);
      setCaptionSources(mappedCaptions);

      // Fetch subtitle fallback if stream has no captions
      if (mappedCaptions.length === 0) {
        fetchFallbackSubtitles(imdbId, tmdbId, rawMediaType, seasonNumberParam, episodeNumberParam)
          .then((fallbackSubs) => {
            if (fallbackSubs.length > 0) {
              setCaptionSources(fallbackSubs);
              if (__DEV__) {
                console.log('[VideoPlayer] Loaded fallback subtitles', fallbackSubs.length);
              }
            }
          })
          .catch(() => { });
      }
      setSelectedCaptionId('off');
      captionCacheRef.current = {};
      captionCuesRef.current = [];
      setActiveCaptionText(null);
      setAudioTrackOptions([]);
      setSelectedAudioKey('auto');
      setQualityOptions([]);
      setSelectedQualityId('auto');
      setQualityOverrideUri(null);
      setQualityLoadingId(null);
      setVideoReloadKey((prev) => prev + 1);
      if (__DEV__) {
        console.log('[VideoPlayer] playbackSource state updated', {
          uriPreview: payload.uri.slice(0, 80),
          headers: payload.headers,
        });
      }
      if (options?.title) {
        setActiveTitle(options.title);
      }
    },
    [],
  );
  // Effect to scrape and load new episode when host changes episode (guests only)
  useEffect(() => {
    if (isWatchPartyHost) return;
    if (!currentWatchPartyEpisode) return;
    if (!isTvShow || !tmdbId) return;

    const { seasonNumber, episodeNumber, seasonTmdbId, episodeTmdbId, seasonTitle: remoteSeasonTitle } = currentWatchPartyEpisode;
    if (seasonNumber == null || episodeNumber == null) return;

    // Skip if already on this episode
    if (seasonNumber === seasonNumberParam && episodeNumber === episodeNumberParam) return;

    let isCancelled = false;

    const loadRemoteEpisode = async () => {
      try {
        const enrichment = tmdbEnrichmentRef.current;
        const fallbackYear = enrichment?.releaseYear ?? releaseYear ?? new Date().getFullYear();

        const payload = {
          type: 'show' as const,
          title: displayTitle,
          tmdbId: tmdbId,
          imdbId: imdbId || enrichment?.imdbId || undefined,
          releaseYear: fallbackYear,
          season: {
            number: seasonNumber,
            tmdbId: seasonTmdbId ?? '',
            title: remoteSeasonTitle ?? `Season ${seasonNumber}`,
          },
          episode: {
            number: episodeNumber,
            tmdbId: episodeTmdbId ?? '',
          },
        };

        console.log('[TV WatchParty Guest] Scraping synced episode', payload);
        const playback = await scrapeEpisode(payload, { sourceOrder });

        if (isCancelled) return;
        if (!playback.uri) throw new Error('Playback URI missing');

        const formattedTitle = `${displayTitle} • S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
        applyPlaybackResult(playback, { title: formattedTitle });
      } catch (err) {
        console.error('[TV WatchParty Guest] Failed to load synced episode', err);
      }
    };

    void loadRemoteEpisode();

    return () => {
      isCancelled = true;
    };
  }, [
    currentWatchPartyEpisode,
    isWatchPartyHost,
    isTvShow,
    tmdbId,
    imdbId,
    displayTitle,
    releaseYear,
    seasonNumberParam,
    episodeNumberParam,
    scrapeEpisode,
    sourceOrder,
    applyPlaybackResult,
  ]);
  useEffect(() => {
    if (!playbackSource) return;
    if (__DEV__) {
      console.log('[VideoPlayer] playbackSource changed', {
        uriPreview: playbackSource.uri.slice(0, 100),
        streamType: playbackSource.streamType,
        headers: playbackSource.headers,
      });
    }
  }, [playbackSource]);
  useEffect(() => {
    playbackSourceRef.current = playbackSource;
  }, [playbackSource]);

  useEffect(() => {
    if (!prefetchKey) {
      if (!prefetchChecked) {
        setPrefetchChecked(true);
      }
      return;
    }
    if (prefetchChecked) return;
    if (playbackSourceRef.current) {
      setPrefetchChecked(true);
      return;
    }
    let cancelled = false;
    let timeoutRef: ReturnType<typeof setTimeout> | null = null;
    let earlyRef: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    const MAX_WAIT_MS = 2_500;
    const POLL_INTERVAL_MS = 200;
    const EARLY_SCRAPE_AFTER_MS = 650;

    earlyRef = setTimeout(() => {
      if (!cancelled) {
        setPrefetchChecked(true);
      }
    }, EARLY_SCRAPE_AFTER_MS);

    const tryConsume = () => {
      if (cancelled) return;
      const entry = consumePrefetchedPlayback(prefetchKey);
      if (entry?.playback) {
        if (playbackSourceRef.current) {
          if (!cancelled) setPrefetchChecked(true);
          return;
        }
        if (__DEV__) {
          console.log('[VideoPlayer] Prefetched playback consumed', {
            title: entry.title,
            streamType: entry.playback?.stream?.type,
            uriPreview: entry.playback?.uri?.slice(0, 64),
          });
        }
        applyPlaybackResult(entry.playback, { title: entry.title ?? displayTitle });
        if (!cancelled) {
          setPrefetchChecked(true);
        }
        if (earlyRef) {
          clearTimeout(earlyRef);
          earlyRef = null;
        }
        return;
      }
      if (Date.now() - startedAt >= MAX_WAIT_MS) {
        if (!cancelled) {
          setPrefetchChecked(true);
        }
        return;
      }
      timeoutRef = setTimeout(tryConsume, POLL_INTERVAL_MS);
    };

    tryConsume();

    return () => {
      cancelled = true;
      if (timeoutRef) {
        clearTimeout(timeoutRef);
        timeoutRef = null;
      }
      if (earlyRef) {
        clearTimeout(earlyRef);
        earlyRef = null;
      }
    };
  }, [prefetchKey, prefetchChecked, applyPlaybackResult, displayTitle]);
  useEffect(() => {
    if (!prefetchChecked) return;
    if (playbackSource || !tmdbId || !rawMediaType) return;
    if (initialScrapeStartedRef.current) return;
    initialScrapeStartedRef.current = true;

    let isCancelled = false;
    const handle = InteractionManager.runAfterInteractions(() => {
      if (isCancelled) return;
      if (playbackSourceRef.current) return;

      const enrichment = tmdbEnrichmentRef.current;
      const enrichedYear = enrichment?.releaseYear;
      const fallbackYear = enrichedYear ?? releaseYear ?? new Date().getFullYear();
      const mediaTitle = displayTitle || 'Now Playing';
      const normalizedTmdbId = tmdbId || '';
      const normalizedImdbId = imdbId || enrichment?.imdbId || undefined;

      void (async () => {
        try {
          setScrapeError(null);

          if (rawMediaType === 'tv') {
            const seasonNumber = Number.isFinite(seasonNumberParam) ? (seasonNumberParam as number) : 1;
            const episodeNumber = Number.isFinite(episodeNumberParam) ? (episodeNumberParam as number) : 1;
            const seasonTitle = seasonTitleParam || `Season ${seasonNumber}`;
            const baseEpisodeCount =
              typeof seasonEpisodeCountParam === 'number' && seasonEpisodeCountParam > 0
                ? seasonEpisodeCountParam
                : undefined;

            const payload = {
              type: 'show',
              title: mediaTitle,
              tmdbId: normalizedTmdbId,
              imdbId: normalizedImdbId,
              releaseYear: fallbackYear,
              season: {
                number: seasonNumber,
                tmdbId: seasonTmdbId ?? '',
                title: seasonTitle,
                ...(baseEpisodeCount ? { episodeCount: baseEpisodeCount } : {}),
              },
              episode: {
                number: episodeNumber,
                tmdbId: episodeTmdbId ?? '',
              },
            } as const;

            if (__DEV__) console.log('[VideoPlayer] Initial TV scrape payload', payload);
            const debugTag = buildScrapeDebugTag('initial-tv', mediaTitle);
            const playback = await scrapeInitial(payload, { sourceOrder, debugTag });
            if (isCancelled) return;
            if (__DEV__) {
              console.log('[VideoPlayer] Scrape success', {
                uriPreview: playback.uri.slice(0, 96),
                streamType: playback.stream?.type,
              });
            }

            const formattedTitle = `${mediaTitle} • S${String(seasonNumber).padStart(2, '0')}E${String(
              episodeNumber,
            ).padStart(2, '0')}`;
            applyPlaybackResult(playback, { title: formattedTitle });
            return;
          }

          const payload = {
            type: 'movie',
            title: mediaTitle,
            tmdbId: normalizedTmdbId,
            imdbId: normalizedImdbId,
            releaseYear: fallbackYear,
          } as const;

          if (__DEV__) console.log('[VideoPlayer] Initial movie scrape payload', payload);
          const debugTag = buildScrapeDebugTag('initial-movie', mediaTitle);
          const playback = await scrapeInitial(payload, { sourceOrder, debugTag });
          if (isCancelled) return;
          applyPlaybackResult(playback, { title: mediaTitle });
        } catch (err: any) {
          console.error('[VideoPlayer] Initial scrape failed', err);
          if (isCancelled) return;
          const message = err?.message || 'Unable to load this title.';
          setScrapeError(message);
        }
      })();
    });

    return () => {
      isCancelled = true;
      // @ts-ignore - cancel exists at runtime on InteractionManager handle
      handle?.cancel?.();
    };
  }, [
    prefetchChecked,
    playbackSource,
    tmdbId,
    rawMediaType,
    releaseYear,
    displayTitle,
    imdbId,
    seasonNumberParam,
    episodeNumberParam,
    seasonTmdbId,
    episodeTmdbId,
    seasonTitleParam,
    seasonEpisodeCountParam,
    scrapeInitial,
    sourceOrder,
    applyPlaybackResult,
  ]);
  const isHlsSource = useMemo(() => {
    const activeUri = qualityOverrideUri ?? playbackSource?.uri;
    if (!activeUri) return false;
    if (playbackSource?.streamType === 'hls') return true;
    return activeUri.toLowerCase().includes('.m3u8');
  }, [playbackSource, qualityOverrideUri]);

  useEffect(() => {
    if (!isTvDevice) return;
    if (!isHlsSource) return;
    if (!playbackSource?.uri) return;
    if (!qualityOptions.length) return;
    if (qualityOverrideUri) return;
    if (selectedQualityId !== 'auto') return;

    const key = playbackSource.uri;
    if (initialVariantAppliedRef.current === key) return;

    const ordered = orderQualityOptionsForCompatibility(qualityOptions);
    const next = ordered[0];
    if (!next?.uri) return;

    initialVariantAppliedRef.current = key;
    triedVariantUrisRef.current.add(key);
    setQualityOverrideUri(next.uri);
    setSelectedQualityId(next.id);
    setVideoReloadKey((prev) => prev + 1);
  }, [isTvDevice, isHlsSource, playbackSource?.uri, qualityOptions, qualityOverrideUri, selectedQualityId]);
  const videoPlaybackSource: AVPlaybackSource | null = useMemo(() => {
    if (!playbackSource) return null;
    const uri = qualityOverrideUri ?? playbackSource.uri;
    const base: any = {
      uri,
      headers: playbackSource.headers,
    };
    if (isHlsSource) {
      base.overrideFileExtensionAndroid = '.m3u8';
    }
    return base;
  }, [playbackSource, isHlsSource, qualityOverrideUri]);

  useEffect(() => {
    if (!transitionReady) return;
    if (!videoPlaybackSource) return;
    if (!appIsActive) return;
    void ensurePlaybackAudioMode();
  }, [transitionReady, videoPlaybackSource, appIsActive, ensurePlaybackAudioMode]);

  useEffect(() => {
    if (__DEV__) {
      if (videoPlaybackSource) {
        console.log('[VideoPlayer] Prepared AVPlaybackSource', {
          uriPreview: (videoPlaybackSource as any)?.uri?.slice(0, 120),
          isHlsSource,
          qualityOverride: Boolean(qualityOverrideUri),
        });
      } else {
        console.log('[VideoPlayer] AVPlaybackSource cleared');
      }
    }
  }, [videoPlaybackSource, isHlsSource, qualityOverrideUri]);
  const activeStreamHeaders = useMemo(() => ({ ...(playbackSource?.headers ?? {}) }), [playbackSource?.headers]);

  useEffect(() => {
    if (!transitionReady) return;
    if (!isHlsSource) return;
    const uri = qualityOverrideUri ?? playbackSource?.uri;
    if (!uri) return;

    const key = `${uri}|${selectedQualityId}|${qualityOverrideUri ?? ''}`;
    if (hlsWarmupRef.current.key !== key) {
      hlsWarmupRef.current = { key, seen: new Set<string>() };
    }

    let cancelled = false;
    const warmup = async (mode: 'normal' | 'aggressive' = 'normal') => {
      try {
        const startAtSeconds = Math.max(0, positionMillisRef.current / 1000 + 5);
        await preloadStreamWindow(uri, activeStreamHeaders, {
          startAtSeconds,
          windowSeconds: mode === 'aggressive' ? 240 : 180,
          maxSegments: mode === 'aggressive' ? 36 : 24,
          concurrency: mode === 'aggressive' ? 6 : 4,
          seen: hlsWarmupRef.current.seen,
        });
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        if (__DEV__) {
          console.warn('HLS prefetch failed', err);
        }
      }
    };

    warmup('normal');
    const interval = setInterval(() => {
      if (cancelled) return;
      void warmup(showBufferingOverlay ? 'aggressive' : 'normal');
    }, 45000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    transitionReady,
    isHlsSource,
    playbackSource?.uri,
    qualityOverrideUri,
    selectedQualityId,
    showBufferingOverlay,
    activeStreamHeaders,
  ]);

  useEffect(() => {
    if (!showBufferingOverlay) return;
    if (!transitionReady) return;
    if (!isHlsSource) return;
    const uri = qualityOverrideUri ?? playbackSource?.uri;
    if (!uri) return;
    (async () => {
      try {
        const startAtSeconds = Math.max(0, positionMillisRef.current / 1000 + 5);
        await preloadStreamWindow(uri, activeStreamHeaders, {
          startAtSeconds,
          windowSeconds: 240,
          maxSegments: 36,
          concurrency: 6,
          seen: hlsWarmupRef.current.seen,
        });
      } catch {
        // ignore
      }
    })();
  }, [showBufferingOverlay, transitionReady, isHlsSource, playbackSource?.uri, qualityOverrideUri, activeStreamHeaders]);
  const isInitialStreamPending = !playbackSource && !!tmdbId && !!rawMediaType && !scrapeError;
  const shouldShowMovieFlixLoader = isFetchingStream || isInitialStreamPending || !transitionReady;
  let loaderMessage = 'Fetching stream...';
  if (qualityLoadingId) {
    loaderMessage = 'Switching quality...';
  } else if (isFetchingStream) {
    loaderMessage = scrapingEpisode ? 'Loading next episode...' : 'Fetching stream...';
  } else if (!transitionReady) {
    loaderMessage = 'Preparing player...';
  } else if (isInitialStreamPending) {
    loaderMessage = 'Preparing stream...';
  }
  const isBlockingLoader = Boolean(isFetchingStream || isInitialStreamPending);
  const loaderVariant: 'solid' | 'transparent' = qualityLoadingId ? 'transparent' : isBlockingLoader ? 'solid' : 'transparent';
  const showQualitySwitchPill = Boolean(qualityLoadingId) && !isFetchingStream && !isInitialStreamPending && transitionReady;
  const hasSubtitleOptions = captionSources.length > 0;
  const hasAudioOptions = audioTrackOptions.length > 0;
  const hasQualityOptions = qualityOptions.length > 0;
  const avControlsEnabled = hasSubtitleOptions || hasAudioOptions || hasQualityOptions;
  useEffect(() => {
    if (!avControlsEnabled && avDrawerOpen) {
      setAvDrawerOpen(false);
    }
  }, [avControlsEnabled, avDrawerOpen]);
  useEffect(() => {
    if (!showControls && avDrawerOpen) {
      setAvDrawerOpen(false);
    }
  }, [showControls, avDrawerOpen]);
  useEffect(() => {
    if (!isHlsSource || !playbackSource?.uri) {
      setAudioTrackOptions([]);
      setQualityOptions([]);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    let manifestUrl = masterPlaylistRef.current ?? playbackSource.uri;

    // If it's a proxy URL, try to extract and fetch the original URL directly
    let originalUrl: string | null = null;
    try {
      const urlObj = new URL(manifestUrl);
      if (urlObj.hostname === 'proxy.pstream.mov' && urlObj.pathname === '/m3u8-proxy') {
        const encodedUrl = urlObj.searchParams.get('url');
        if (encodedUrl) {
          originalUrl = decodeURIComponent(encodedUrl);
          manifestUrl = originalUrl;
        }
      }
    } catch { }

    const fetchManifest = async () => {
      try {
        const browserHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          'Referer': 'https://www.google.com/',
          ...((playbackSource.headers as Record<string, string>) || {}),
        };
        const res = await fetch(manifestUrl, {
          headers: browserHeaders,
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Manifest request failed (${res.status})`);
        }
        const text = await res.text();
        if (cancelled) return;
        setAudioTrackOptions(parseHlsAudioTracks(text));
        setQualityOptions(parseHlsQualityOptions(text, manifestUrl));
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to parse master manifest', { url: manifestUrl, proxyUsed: originalUrl !== null, error: err });
          setAudioTrackOptions([]);
          setQualityOptions([]);
        }
      }
    };
    fetchManifest();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isHlsSource, playbackSource?.uri, playbackSource?.headers]);

  function normalizeLang(lang?: string) {
    if (!lang) return undefined;
    return lang.toLowerCase().split('-')[0];
  }

  useEffect(() => {
    if (!audioTrackOptions.length) return;
    const video = videoRef.current;
    if (!video) return;

    // Respect manual selection
    if (selectedAudioKey !== 'auto') return;

    // Prefer English
    let chosen = audioTrackOptions.find((t) => normalizeLang(t.language) === 'en') ??
      audioTrackOptions.find((t) => (t.name || '').toLowerCase().includes('english'));

    // If no English, fall back to default or first track
    if (!chosen) {
      chosen = audioTrackOptions.find((t) => t.isDefault) ?? audioTrackOptions[0];
    }

    if (!chosen) return;

    setSelectedAudioKey(chosen.id);

    if (chosen.language && chosen.language !== 'und') {
      (video as any).setStatusAsync({
        selectedAudioTrack: { type: 'language', value: chosen.language },
      }).catch(() => { });
    } else {
      (video as any).setStatusAsync({
        selectedAudioTrack: { type: 'system' },
      }).catch(() => { });
    }
  }, [audioTrackOptions, selectedAudioKey]);
  // lock orientation
  useEffect(() => {
    const setup = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch {
        // ignore
      }
    };
    setup();
    return () => {
      ScreenOrientation.unlockAsync();
    };
  }, []);
  // auto-hide controls when playing
  useEffect(() => {
    if (!showControls || episodeDrawerOpen || isLocked) return;
    const delay = isPlaying ? CONTROLS_HIDE_DELAY_PLAYING : CONTROLS_HIDE_DELAY_PAUSED;
    const timeout = setTimeout(() => setShowControls(false), delay);
    return () => clearTimeout(timeout);
  }, [showControls, isPlaying, episodeDrawerOpen, controlsSession, isLocked]);

  const startMidrollAd = useCallback(async () => {
    if (currentPlan !== 'free') return;
    if (!hasPromotedAds || !promotedProducts.length) return;
    if (midrollActiveRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    const now = Date.now();
    if (now - lastMidrollShownAtRef.current < 30_000) return;

    lastMidrollShownAtRef.current = now;
    midrollWasPlayingRef.current = isPlaying;
    midrollStartedAtRef.current = now;
    setMidrollProduct(promotedProducts[Math.floor(Math.random() * promotedProducts.length)] ?? null);
    setMidrollRemainingSec(15);
    setShowControls(false);
    midrollActiveRef.current = true;
    setMidrollActive(true);
    setIsPlaying(false);

    try {
      await video.pauseAsync();
    } catch {
      // ignore
    }

    if (midrollTimerRef.current) {
      clearInterval(midrollTimerRef.current);
      midrollTimerRef.current = null;
    }
    midrollTimerRef.current = setInterval(() => {
      const startedAt = midrollStartedAtRef.current ?? Date.now();
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, 15 - elapsed);
      setMidrollRemainingSec(remaining);
      if (remaining <= 0) {
        if (midrollTimerRef.current) {
          clearInterval(midrollTimerRef.current);
          midrollTimerRef.current = null;
        }
        midrollActiveRef.current = false;
        setMidrollActive(false);
        setMidrollProduct(null);
        const shouldResume = midrollWasPlayingRef.current;
        if (shouldResume) {
          setIsPlaying(true);
          video.playAsync().catch(() => { });
        }
      }
    }, 250);
  }, [currentPlan, hasPromotedAds, promotedProducts, isPlaying]);

  useEffect(() => {
    if (currentPlan !== 'free') {
      midrollCuePointsRef.current = [];
      midrollScheduleKeyRef.current = '';
      return;
    }
    if (!hasPromotedAds || !promotedProducts.length) {
      midrollCuePointsRef.current = [];
      midrollScheduleKeyRef.current = '';
      return;
    }
    if (!durationMillis || durationMillis < 60_000) return;

    const scheduleKey = `${watchHistoryKey ?? playbackSource?.uri ?? ''}|${Math.round(durationMillis / 1000)}`;
    if (midrollScheduleKeyRef.current === scheduleKey) return;
    midrollScheduleKeyRef.current = scheduleKey;

    const totalMinutes = durationMillis / 60_000;
    const everyMinutes = 8;
    const adCount = Math.max(0, Math.floor(totalMinutes / everyMinutes));
    if (!adCount) {
      midrollCuePointsRef.current = [];
      return;
    }

    const earliest = 2 * 60_000;
    const latest = Math.max(earliest, durationMillis - 60_000);
    const minGapMs = 4 * 60_000;
    const picks: number[] = [];
    const maxAttempts = adCount * 20;

    let attempts = 0;
    while (picks.length < adCount && attempts < maxAttempts) {
      attempts += 1;
      const t = Math.floor(earliest + Math.random() * Math.max(1, latest - earliest));
      if (picks.some((p) => Math.abs(p - t) < minGapMs)) continue;
      picks.push(t);
    }

    picks.sort((a, b) => a - b);
    midrollCuePointsRef.current = picks;
  }, [currentPlan, hasPromotedAds, promotedProducts.length, durationMillis, watchHistoryKey, playbackSource?.uri]);

  const persistWatchProgress = useCallback(
    async (
      positionValue: number,
      durationValue: number,
      options: { force?: boolean; markComplete?: boolean } = {},
    ) => {
      if (!watchHistoryKey) return;
      const baseEntry = watchEntryRef.current;
      if (!baseEntry) return;
      if (!durationValue || durationValue <= 0) return;
      const now = Date.now();
      if (!options.force && !options.markComplete) {
        if (now - watchHistoryPersistRef.current < 15000) {
          return;
        }
        watchHistoryPersistRef.current = now;
      } else {
        watchHistoryPersistRef.current = now;
      }
      const progressValue = Math.min(Math.max(positionValue / durationValue, 0), 1);
      const shouldRemove = options.markComplete || progressValue >= 0.985;
      try {
        const raw = await AsyncStorage.getItem(watchHistoryKey);
        const parsed: Media[] = raw ? JSON.parse(raw) : [];
        const filtered = parsed.filter((entry) => entry?.id !== baseEntry.id);
        if (shouldRemove) {
          await AsyncStorage.setItem(watchHistoryKey, JSON.stringify(filtered));
          return;
        }
        const enriched: Media = {
          ...baseEntry,
          vote_average: baseEntry.vote_average,
          watchProgress: {
            positionMillis: positionValue,
            durationMillis: durationValue,
            progress: progressValue,
            updatedAt: now,
          },
        };
        const next = [enriched, ...filtered].slice(0, 40);
        await AsyncStorage.setItem(watchHistoryKey, JSON.stringify(next));
        if (progressValue >= 0.7 && user?.uid) {
          const profileName =
            activeProfile?.name ||
            user.displayName ||
            user.email?.split('@')[0] ||
            'Movie fan';
          const fallbackPhoto = (user as any)?.photoURL ?? null;
          void syncMovieMatchProfile({
            userId: user.uid,
            profileId: activeProfile?.id ?? 'default',
            profileName,
            avatarColor: activeProfile?.avatarColor ?? undefined,
            photoURL: activeProfile?.photoURL ?? fallbackPhoto ?? null,
            entry: {
              tmdbId: enriched.id,
              title: enriched.title || enriched.name || enriched.media_type || 'Now Playing',
              mediaType: enriched.media_type,
              progress: progressValue,
              genres: enriched.genre_ids,
              posterPath: enriched.poster_path ?? enriched.backdrop_path ?? null,
              releaseYear:
                typeof enriched.release_date === 'string'
                  ? enriched.release_date
                  : enriched.first_air_date ?? null,
            },
          });
          try {
            void logInteraction({ type: 'watch', actorId: user.uid, targetId: enriched.id, meta: { progress: progressValue } });
          } catch { }
        }
      } catch (err) {
        console.warn('Failed to update watch history', err);
      }
    },
    [watchHistoryKey, user, activeProfile?.id, activeProfile?.name, activeProfile?.avatarColor, activeProfile?.photoURL],
  );

  // Prefer native ABR for HLS (ExoPlayer/AVPlayer).

  const handleVideoError = useCallback(
    (error: any) => {
      console.error('[VideoPlayer] Video element error', error);

      const message = String(error?.message ?? error ?? '');
      const hasPlayback = Boolean(playbackSource?.uri);
      const isHls = Boolean(isHlsSource || playbackSource?.streamType === 'hls');

      const activeUri = qualityOverrideUri ?? playbackSource?.uri;
      if (
        Platform.OS === 'android' &&
        activeUri &&
        activeUri.startsWith('http://') &&
        message.toLowerCase().includes('cleartext') &&
        !triedHttpsUpgradeRef.current.has(activeUri)
      ) {
        triedHttpsUpgradeRef.current.add(activeUri);
        const httpsUri = `https://${activeUri.slice('http://'.length)}`;
        if (qualityOverrideUri) {
          setQualityOverrideUri(httpsUri);
        } else if (playbackSource) {
          setPlaybackSource(
            createPlaybackSource({
              uri: httpsUri,
              headers: playbackSource.headers,
              streamType: playbackSource.streamType,
              captions: playbackSource.captions,
              sourceId: playbackSource.sourceId,
              embedId: playbackSource.embedId,
            }),
          );
        }
        setVideoReloadKey((prev) => prev + 1);
        return;
      }

      if (hasPlayback && isHls && qualityOptions.length) {
        const baseUri = qualityOverrideUri ?? playbackSource!.uri;
        triedVariantUrisRef.current.add(baseUri);

        const ordered = orderQualityOptionsForCompatibility(qualityOptions);
        const next = ordered.find((opt) => opt?.uri && !triedVariantUrisRef.current.has(opt.uri));
        if (next?.uri) {
          setQualityOverrideUri(next.uri);
          setSelectedQualityId(next.id);
          setVideoReloadKey((prev) => prev + 1);
          return;
        }
      }

      Alert.alert('Playback error', error?.message || 'Video failed to load.');
    },
    [playbackSource, qualityOptions, qualityOverrideUri, isHlsSource],
  );
  const handleVideoLoad = useCallback((payload: any) => {
    if (__DEV__) {
      console.log('[VideoPlayer] Video element loaded', {
        duration: payload?.durationMillis,
        naturalSize: payload?.naturalSize,
        status: payload,
      });
    }

    const seekTo = pendingSeekAfterReloadRef.current;
    if (typeof seekTo === 'number' && Number.isFinite(seekTo) && seekTo > 0) {
      const shouldPlayAfter = pendingShouldPlayAfterReloadRef.current;
      pendingSeekAfterReloadRef.current = null;
      pendingShouldPlayAfterReloadRef.current = null;

      const video = videoRef.current;
      if (video) {
        // best-effort restore position after quality/override reload
        void video
          .setPositionAsync(seekTo)
          .then(() => {
            if (shouldPlayAfter === true) return video.playAsync();
            if (shouldPlayAfter === false) return video.pauseAsync();
            return undefined;
          })
          .catch(() => { });
      }
    }

    const pendingRemote = pendingRemotePlaybackRef.current;
    if (pendingRemote) {
      void applyRemotePlayback(pendingRemote);
    }
  }, [applyRemotePlayback]);
  const handleStatusUpdate = (status: AVPlaybackStatusSuccess | any) => {
    if (!status || !status.isLoaded) return;
    const playingNow = Boolean(status.isPlaying);
    const bufferingNow = Boolean(status.isBuffering);
    const now = Date.now();
    if (__DEV__) {
      const positionLabel = Math.round((status.positionMillis || 0) / 1000);
      const key = `${playingNow ? 'play' : 'pause'}|${bufferingNow ? 'buffer' : 'clear'}|${positionLabel}`;
      if (now - statusLogRef.current.lastTs > 2000 || statusLogRef.current.lastKey !== key) {
        console.log('[VideoPlayer] Status update', {
          playing: playingNow,
          buffering: bufferingNow,
          positionMs: status.positionMillis || 0,
          durationMs: status.durationMillis || null,
          shouldPlay: status.shouldPlay,
          isBuffering: status.isBuffering,
          didJustFinish: status.didJustFinish,
        });
        statusLogRef.current = { lastTs: now, lastKey: key };
      }
    }
    if (now - lastPlayPauseIntentTsRef.current > 300) {
      setIsPlaying(playingNow);
    }
    const currentPos = status.positionMillis || 0;
    // detect progress: if position advanced by >300ms, update last advance timestamp
    try {
      if (typeof prevPositionRef.current === 'number') {
        if (currentPos - prevPositionRef.current > 300) {
          lastAdvanceTsRef.current = Date.now();
        }
      }
    } catch { }
    prevPositionRef.current = currentPos;
    // Show buffering overlay only when buffering persists and playback is effectively stalled
    if (bufferingNow && !isSeeking) {
      if (!bufferingOverlayTimeoutRef.current) {
        bufferingOverlayTimeoutRef.current = setTimeout(() => {
          // If position hasn't advanced since timeout started (or lastAdvance was before timeout), show overlay
          const now = Date.now();
          const advancedRecently = now - lastAdvanceTsRef.current < 700;
          if (!advancedRecently) {
            setShowBufferingOverlay(true);
          }
          bufferingOverlayTimeoutRef.current = null;
        }, 650);
      }

    } else {
      if (bufferingOverlayTimeoutRef.current) {
        clearTimeout(bufferingOverlayTimeoutRef.current);
        bufferingOverlayTimeoutRef.current = null;
      }
      if (showBufferingOverlay) {
        setShowBufferingOverlay(false);
      }
    }
    const currentPosition = status.positionMillis || 0;
    if (!isSeeking) {
      setSeekPosition(currentPosition);
    }
    setPositionMillis(currentPosition);

    const playable = (status as any)?.playableDurationMillis;
    if (typeof playable === 'number' && Number.isFinite(playable)) {
      const nextBuffered = Math.max(currentPosition, playable);
      if (Math.abs(nextBuffered - bufferedMillisRef.current) > 1500) {
        bufferedMillisRef.current = nextBuffered;
        setBufferedMillis(nextBuffered);
      }
    }

    if (roomCode && isWatchPartyHost && !applyingRemotePlaybackRef.current && !midrollActiveRef.current) {
      const last = lastPlaybackPublishRef.current;
      const shouldSyncWhilePlaying =
        playingNow && now - last.ts > 2000 && Math.abs(currentPosition - last.positionMillis) > 900;
      const shouldSyncWhilePaused =
        !playingNow && now - last.ts > 5000 && Math.abs(currentPosition - last.positionMillis) > 1200;
      if (shouldSyncWhilePlaying || shouldSyncWhilePaused) {
        void publishWatchPartyPlayback({ isPlaying: playingNow, positionMillis: currentPosition });
      }
    }

    updateActiveCaption(currentPosition);
    if (status.durationMillis) {
      setDurationMillis(status.durationMillis);
    }
    const derivedDuration = status.durationMillis ?? durationMillis;
    if (derivedDuration && derivedDuration > 0) {
      void persistWatchProgress(currentPosition, derivedDuration, {
        force: status.didJustFinish,
        markComplete: status.didJustFinish,
      });
    }

    if (
      currentPlan === 'free' &&
      hasPromotedAds &&
      promotedProducts.length > 0 &&
      !midrollActiveRef.current &&
      !status.didJustFinish
    ) {
      const cues = midrollCuePointsRef.current;
      while (cues.length && cues[0] < currentPosition - 5000) {
        cues.shift();
      }
      const nextCue = cues[0];
      if (typeof nextCue === 'number' && currentPosition >= nextCue) {
        cues.shift();
        void startMidrollAd();
      }
    }
  };
  useEffect(() => {
    return () => {
      if (positionMillis > 0 && durationMillis > 0) {
        void persistWatchProgress(positionMillis, durationMillis, { force: true });
      }
    };
  }, [positionMillis, durationMillis, persistWatchProgress]);
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    bumpControlsLife();
    lastPlayPauseIntentTsRef.current = Date.now();

    // Use ref to avoid dependency on frequent state updates
    const nextPlaying = !isPlayingRef.current;
    setIsPlaying(nextPlaying);
    if (!nextPlaying) setShowControls(true);

    void publishWatchPartyPlayback(
      { isPlaying: nextPlaying, positionMillis: positionMillisRef.current },
      { force: true },
    );

    void (async () => {
      try {
        if (nextPlaying) {
          await ensurePlaybackAudioMode();
          await video.playAsync();
        } else {
          await video.pauseAsync();
        }
      } catch (err: any) {
        console.warn('Playback failed', err);
        setIsPlaying(!nextPlaying);
        const msg = err?.message || String(err);
        const isAudioFocusError =
          msg.toLowerCase().includes('audiofocus') ||
          msg.toLowerCase().includes('audio focus') ||
          msg.includes('AudioFocusNotAcquiredException');

        if (isAudioFocusError) {
          if (appStateRef.current !== 'active') {
            pendingAudioFocusRetryRef.current = true;
            Alert.alert(
              'Playback blocked',
              'Playback could not start because the app is not active. Return to the app and try again.',
            );
            return;
          }

          // Foreground but focus not acquired: retry once after resetting audio mode.
          try {
            await ensurePlaybackAudioMode();
            await new Promise((r) => setTimeout(r, 250));
            await video.playAsync();
            setIsPlaying(true);
            return;
          } catch (retryErr: any) {
            const retryMsg = retryErr?.message || msg;
            Alert.alert(
              'Playback blocked',
              `Unable to acquire audio focus. Pause other audio (music/calls) and try again.\n\n${retryMsg}`,
            );
            return;
          }
        }

        Alert.alert('Playback error', msg);
      }
    })();
  }, [bumpControlsLife, ensurePlaybackAudioMode, publishWatchPartyPlayback]);
  const seekBy = useCallback(
    async (deltaMillis: number) => {
      const video = videoRef.current;
      if (!video) return;
      bumpControlsLife();
      // Use ref to avoid dependency on constant progress updates
      const currentPos = positionMillisRef.current;
      const next = Math.max(0, Math.min(currentPos + deltaMillis, durationMillis));
      await video.setPositionAsync(next);
      setSeekPosition(next);

      void publishWatchPartyPlayback(
        { isPlaying: isPlayingRef.current, positionMillis: next },
        { force: true },
      );
    },
    [bumpControlsLife, durationMillis, publishWatchPartyPlayback],
  );

  const tvRemoteHandler = useCallback(
    (evt: any) => {
      if (!isTvDevice) return;
      const type = evt?.eventType as string | undefined;
      if (!type) return;

      // Keep controls alive on any remote input.
      bumpControlsLife();
      const controlsVisible = showControlsRef.current;
      if (controlsVisible) {
        if (type === 'select') return;
        if (type === 'left' || type === 'right' || type === 'up' || type === 'down') return;
      }

      if (type !== 'down' && !controlsVisible) {
        setShowControls(true);
        return;
      }

      switch (type) {
        case 'select':
          if (!controlsVisible) togglePlayPause();
          return;
        case 'playPause':
          togglePlayPause();
          return;
        case 'left':
        case 'rewind':
          void seekBy(-10_000);
          return;
        case 'right':
        case 'fastForward':
          void seekBy(10_000);
          return;
        case 'up':
          if (!controlsVisible) setShowControls(true);
          return;
        case 'down':
          setShowControls(false);
          return;
        case 'menu':
        case 'back':
        case 'exit':
          if (avDrawerOpen) {
            setAvDrawerOpen(false);
            return;
          }
          if (episodeDrawerOpen) {
            setEpisodeDrawerOpen(false);
            return;
          }
          router.back();
          return;
        default:
          return;
      }
    },
    [
      isTvDevice,
      bumpControlsLife,
      togglePlayPause,
      seekBy,
      avDrawerOpen,
      episodeDrawerOpen,
      router,
    ],
  );

  useEffect(() => {
    if (!isTvDevice) return;
    // TVEventHandler is not available/typed on all platforms; require avoids hard import issues in non-TV runtimes.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TVEventHandlerImpl = (require('react-native') as any)?.TVEventHandler;
    if (!TVEventHandlerImpl) return;

    const handler = new TVEventHandlerImpl();
    handler.enable(null, (_cmp: any, evt: any) => {
      tvRemoteHandler(evt);
    });
    return () => {
      handler.disable();
    };
  }, [isTvDevice, tvRemoteHandler]);

  // Web keyboard support for TV remote simulation
  useEffect(() => {
    if (!isTvDevice) return;
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      let eventType: string | null = null;

      switch (key) {
        case ' ':
        case 'Enter':
          eventType = 'playPause';
          break;
        case 'ArrowLeft':
        case 'Left':
          eventType = 'left';
          break;
        case 'ArrowRight':
        case 'Right':
          eventType = 'right';
          break;
        case 'ArrowUp':
        case 'Up':
          eventType = 'up';
          break;
        case 'ArrowDown':
        case 'Down':
          eventType = 'down';
          break;
        case 'Escape':
        case 'Backspace':
          eventType = 'back';
          break;
        default:
          return;
      }

      if (eventType) {
        e.preventDefault();
        e.stopPropagation();
        tvRemoteHandler({ eventType });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isTvDevice, tvRemoteHandler]);
  const handleRateToggle = async () => {
    const video = videoRef.current;
    if (!video) return;
    bumpControlsLife();
    // cycle through 1x, 1.5x, 2x
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    await video.setRateAsync(nextRate, true);
  };
  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  const currentTimeLabel = formatTime(positionMillis);
  const totalTimeLabel = durationMillis ? formatTime(durationMillis) : '0:00';
  const durationForUi = Math.max(1, durationMillis || 1);
  const playedMillisForUi = Math.max(0, isSeeking ? seekPosition : positionMillis);
  const bufferedMillisForUi = Math.max(playedMillisForUi, bufferedMillis);
  const playedPctForUi = clamp01(playedMillisForUi / durationForUi);
  const bufferedPctForUi = clamp01(bufferedMillisForUi / durationForUi);

  const overlayPaddingStyle = useMemo(
    () => ({
      paddingTop: Math.max(18, insets.top + 10),
      paddingBottom: Math.max(18, insets.bottom + 12),
    }),
    [insets.bottom, insets.top],
  );
  useEffect(() => {
    if (!isTvShow) {
      setEpisodeDrawerOpen(false);
    }
  }, [isTvShow]);
  useEffect(() => {
    if (!roomCode) return;
    const messagesRef = collection(firestore, 'watchParties', roomCode, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const items: { id: string; user: string; text: string; createdAt?: any; avatar?: string | null }[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as any;
        items.push({
          id: docSnap.id,
          user: data.userDisplayName || data.userName || data.user || 'Guest',
          text: data.text || '',
          createdAt: data.createdAt,
          avatar: data.userAvatar || null,
        });
      });
      setChatMessages(items);
    });
    return () => unsub();
  }, [roomCode]);
  const handleSurfacePress = useCallback(() => {
    if (episodeDrawerOpen) return;
    if (isLocked) return; // when locked, ignore surface taps
    if (isMini) {
      // tapping mini player expands to full
      setIsMini(false);
      setShowControls(true);
      bumpControlsLife();
      return;
    }
    const now = Date.now();
    if (showControls && now - lastSurfaceTapRef.current < SURFACE_DOUBLE_TAP_MS) {
      setShowControls(false);
      return;
    }
    lastSurfaceTapRef.current = now;
    setShowControls(true);
    bumpControlsLife();
  }, [episodeDrawerOpen, isLocked, isMini, showControls, bumpControlsLife]);

  const handleRetryStream = useCallback(() => {
    initialScrapeStartedRef.current = false;
    setScrapeError(null);
    setPlaybackSource(null);
    setSelectedQualityId('auto');
    setQualityOverrideUri(null);
    setQualityLoadingId(null);
    setPrefetchChecked(true);
  }, []);
  const handleSendChat = async () => {
    if (!roomCode || !chatInput.trim() || chatSending) return;
    const text = chatInput.trim();
    setChatInput('');
    setChatSending(true);
    try {
      const messagesRef = collection(firestore, 'watchParties', roomCode, 'messages');
      await addDoc(messagesRef, {
        text,
        userId: user?.uid ?? null,
        userDisplayName: user?.displayName || user?.email || 'Guest',
        userAvatar: (user as any)?.photoURL ?? null,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Failed to send chat message', err);
    } finally {
      setChatSending(false);
    }
  };
  const toggleLock = useCallback(() => {
    setIsLocked(prev => {
      const next = !prev;
      if (next) {
        setShowControls(false);
      } else {
        setShowControls(true);
        bumpControlsLife();
      }
      return next;
    });
  }, [bumpControlsLife]);
  const handlePipStatusUpdate = useCallback((event: { isPictureInPictureActive?: boolean }) => {
    setIsPipActive(Boolean(event?.isPictureInPictureActive));
  }, []);
  const handlePipToggle = useCallback(async () => {
    if (!videoRef.current) return;
    if (!pipUiEnabled) return;
    bumpControlsLife();
    const player = videoRef.current as any;
    const enterPip =
      typeof player?.presentPictureInPictureAsync === 'function'
        ? player.presentPictureInPictureAsync.bind(player)
        : typeof player?.enterPictureInPictureAsync === 'function'
          ? player.enterPictureInPictureAsync.bind(player)
          : null;
    const exitPip =
      typeof player?.dismissPictureInPictureAsync === 'function'
        ? player.dismissPictureInPictureAsync.bind(player)
        : typeof player?.exitPictureInPictureAsync === 'function'
          ? player.exitPictureInPictureAsync.bind(player)
          : null;
    if (!enterPip && !exitPip) {
      if (Platform.OS === 'android') {
        Alert.alert(
          'Picture in Picture',
          'PiP can start automatically when you press the Home button (if enabled in system settings).\n\nIf it still doesn\'t work, you may need a new dev build/app update with PiP enabled.',
        );
      } else {
        setIsPipSupported(false);
      }
      return;
    }
    try {
      if (!isPipActive && enterPip) {
        await enterPip();
        setIsPipActive(true);
      } else if (isPipActive && exitPip) {
        await exitPip();
        setIsPipActive(false);
      }
    } catch (err) {
      console.warn('PiP toggle failed', err);
    }
  }, [isPipActive, pipUiEnabled, bumpControlsLife]);

  const handleQualitySelect = useCallback(
    async (option: QualityOption | null) => {
      if (!playbackSource) return;
      if (!option) {
        if (selectedQualityId === 'auto' && !qualityOverrideUri) return;
        pendingSeekAfterReloadRef.current = positionMillis;
        pendingShouldPlayAfterReloadRef.current = isPlaying;
        setQualityOverrideUri(null);
        setSelectedQualityId('auto');
        autoQualityStepRef.current = 0;
        lastAutoDowngradeTsRef.current = 0;
        return;
      }
      if (selectedQualityId === option.id) return;
      setQualityLoadingId(option.id);
      try {
        await preloadQualityVariant(option.uri, playbackSource.headers);
        pendingSeekAfterReloadRef.current = positionMillis;
        pendingShouldPlayAfterReloadRef.current = isPlaying;
        setQualityOverrideUri(option.uri);
        setSelectedQualityId(option.id);
        autoQualityStepRef.current = 0;
        lastAutoDowngradeTsRef.current = 0;
      } catch (err) {
        console.warn('Quality preload failed', err);
        Alert.alert('Quality unavailable', 'Unable to switch to this quality right now.');
      } finally {
        setQualityLoadingId(null);
      }
    },
    [playbackSource, selectedQualityId, qualityOverrideUri, positionMillis, isPlaying],
  );
  const getCaptionLabel = useCallback((caption: CaptionSource) => {
    if (caption.display) return caption.display;
    if (caption.language) return caption.language.toUpperCase();
    return 'Subtitle';
  }, []);
  const handleCaptionSelect = useCallback(
    async (captionId: string | 'off') => {
      bumpControlsLife();
      if (captionId === 'off') {
        setSelectedCaptionId('off');
        captionIndexRef.current = 0;
        captionCuesRef.current = [];
        setActiveCaptionText(null);
        const key = captionPreferenceKeyRef.current;
        if (key) {
          await AsyncStorage.setItem(key, 'off').catch(() => { });
        }
        return;
      }
      if (selectedCaptionId === captionId && captionCuesRef.current.length) {
        return;
      }
      const source = captionSources.find((item) => item.id === captionId);
      if (!source) return;
      setSelectedCaptionId(captionId);
      const key = captionPreferenceKeyRef.current;
      if (key) {
        await AsyncStorage.setItem(key, captionId).catch(() => { });
      }
      const cached = captionCacheRef.current[captionId];
      if (cached) {
        captionCuesRef.current = cached;
        captionIndexRef.current = 0;
        updateActiveCaption(positionMillis, true);
        return;
      }
      setCaptionLoadingId(captionId);
      try {
        const res = await fetch(source.url);
        const payload = await res.text();
        const cues = parseCaptionPayload(payload, source.type);
        captionCacheRef.current[captionId] = cues;
        captionCuesRef.current = cues;
        captionIndexRef.current = 0;
        updateActiveCaption(positionMillis, true);
      } catch (err) {
        console.warn('Failed to load captions', err);
        Alert.alert('Captions unavailable', 'Unable to load captions for this language right now.');
        setSelectedCaptionId('off');
        captionCuesRef.current = [];
        setActiveCaptionText(null);
      } finally {
        setCaptionLoadingId(null);
      }
    },
    [captionSources, positionMillis, selectedCaptionId, updateActiveCaption, bumpControlsLife],
  );
  const handleAudioSelect = useCallback(
    async (option: AudioTrackOption | null) => {
      bumpControlsLife();
      const video = videoRef.current;
      if (!video) return;

      setSelectedAudioKey(option?.id ?? 'auto');

      try {
        if (option?.language && option.language !== 'und') {
          await (video as any).setStatusAsync({
            selectedAudioTrack: {
              type: 'language',
              value: option.language,
            },
          });
        } else {
          await (video as any).setStatusAsync({
            selectedAudioTrack: { type: 'system' },
          });
        }
      } catch (err) {
        console.warn('Audio track switch failed', err);
      }
    },
    [bumpControlsLife],
  );
  useEffect(() => {
    if (!captionSources.length) return;
    let cancelled = false;
    const pickDefaultCaption = async () => {
      const prefKey = captionPreferenceKeyRef.current;
      const stored = prefKey ? await AsyncStorage.getItem(prefKey).catch(() => null) : null;
      if (cancelled) return;
      // Respect user's explicit "off" choice.
      if (stored === 'off') {
        return;
      }
      const currentStillValid =
        selectedCaptionId !== 'off' && captionSources.some((s) => s.id === selectedCaptionId);
      if (currentStillValid) {
        return;
      }
      const storedStillValid = stored ? captionSources.find((s) => s.id === stored) : undefined;
      const english = captionSources.find((s) => (s.language || '').toLowerCase().startsWith('en'));
      const candidate = storedStillValid ?? english ?? captionSources[0];
      if (candidate?.id) {
        await handleCaptionSelect(candidate.id);
      }
    };
    void pickDefaultCaption();
    return () => {
      cancelled = true;
    };
  }, [captionSources, handleCaptionSelect, selectedCaptionId]);
  const handleEpisodePlay = useCallback(async (episode: UpcomingEpisode, index: number) => {
    if (!isTvShow) return;
    if (!tmdbId) {
      Alert.alert('Missing episode info', 'Unable to load this episode right now.');
      return;
    }
    if (scrapingEpisode) return;
    const nextTitle = episode.title || episode.seasonName || displayTitle;
    setScrapeError(null);
    try {
      const normalizedSeasonNumber =
        typeof episode.seasonNumber === 'number'
          ? episode.seasonNumber
          : typeof seasonNumberParam === 'number'
            ? seasonNumberParam
            : 1;
      const normalizedEpisodeNumber =
        typeof episode.episodeNumber === 'number'
          ? episode.episodeNumber
          : typeof episodeNumberParam === 'number'
            ? episodeNumberParam
            : 1;
      const derivedSeasonEpisodeCount =
        typeof episode.seasonEpisodeCount === 'number'
          ? episode.seasonEpisodeCount
          : typeof seasonEpisodeCountParam === 'number'
            ? seasonEpisodeCountParam
            : undefined;
      const payload = {
        type: 'show',
        title: displayTitle,
        tmdbId,
        imdbId,
        releaseYear: releaseYear ?? new Date().getFullYear(),
        season: {
          number: normalizedSeasonNumber,
          tmdbId: episode.seasonTmdbId?.toString() ?? '',
          title: episode.seasonName ?? seasonTitleParam ?? `Season ${normalizedSeasonNumber}`,
          ...(derivedSeasonEpisodeCount ? { episodeCount: derivedSeasonEpisodeCount } : {}),
        },
        episode: {
          number: normalizedEpisodeNumber,
          tmdbId: episode.episodeTmdbId?.toString() ?? '',
        },
      } as const;
      console.log('[VideoPlayer] Episode scrape payload', payload);
      const debugTag = buildScrapeDebugTag('episode', nextTitle || displayTitle);
      const playback = await scrapeEpisode(payload, { sourceOrder, debugTag });
      applyPlaybackResult(playback, { title: nextTitle });
      const nextSeasonTitle = episode.seasonName ?? seasonTitleParam ?? `Season ${normalizedSeasonNumber}`;
      const updatedEntryBase =
        watchEntryRef.current ??
        watchHistoryEntry ?? {
          id: parsedTmdbNumericId ?? (Number(tmdbId) || Date.now()),
          title: displayTitle,
          name: displayTitle,
        };
      watchEntryRef.current = {
        ...updatedEntryBase,
        title: displayTitle,
        name: displayTitle,
        seasonNumber: normalizedSeasonNumber,
        episodeNumber: normalizedEpisodeNumber,
        seasonTitle: nextSeasonTitle,
        episodeTitle: episode.title ?? updatedEntryBase.episodeTitle,
      };
      setActiveTitle(nextTitle);
      setEpisodeDrawerOpen(false);
      setShowControls(true);
      setEpisodeQueue((prev) => prev.slice(index + 1));
      setSeekPosition(0);
      setPositionMillis(0);
    } catch (err: any) {
      console.error('[VideoPlayer] Episode scrape failed', err);
      Alert.alert('Episode unavailable', err?.message || 'Unable to load this episode.');
    }
  }, [
    isTvShow,
    tmdbId,
    scrapingEpisode,
    displayTitle,
    seasonNumberParam,
    episodeNumberParam,
    seasonEpisodeCountParam,
    releaseYear,
    seasonTitleParam,
    sourceOrder,
    scrapeEpisode,
    applyPlaybackResult,
    watchHistoryEntry,
    parsedTmdbNumericId,
  ]);
  const videoPipProps = useMemo(() => ({ allowsPictureInPicture: pipUiEnabled }), [pipUiEnabled]);
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={styles.touchLayer}>
        {transitionReady && videoPlaybackSource ? (
          <>
            <Video
              key={videoReloadKey}
              ref={videoRef}
              source={videoPlaybackSource}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={
                isPlaying &&
                !midrollActive &&
                (appIsActive || isPipActive) &&
                (!roomCode || isWatchPartyHost || watchPartyIsOpen)
              }
              useNativeControls={false}
              onPlaybackStatusUpdate={handleStatusUpdate}
              onError={handleVideoError}
              onLoad={handleVideoLoad}
              pointerEvents='none'
              {...(videoPipProps as any)}
              // @ts-ignore - presentPictureInPictureAsync exists at runtime
              onPictureInPictureStatusUpdate={handlePipStatusUpdate}
              onReadyForDisplay={handleVideoReadyForDisplay}
            />
            <VideoMaskingOverlay intensity={0.06} />

            {/* Surface tap handler sits behind controls so it never steals button presses. */}
            <Pressable
              focusable={false}
              accessible={false}
              style={styles.surfacePressLayer}
              onPress={handleSurfacePress}
            />
          </>
        ) : (
          <View style={styles.videoFallback}>
            {shouldShowMovieFlixLoader ? null : (
              <>
                <Text style={styles.videoFallbackText}>{scrapeError ?? 'No video stream available.'}</Text>
                <TvFocusable
                  tvPreferredFocus
                  onPress={handleRetryStream}
                  style={({ focused }: any) => [
                    styles.videoFallbackButton,
                    focused ? styles.videoFallbackButtonFocused : null,
                  ]}
                >
                  <Text style={styles.videoFallbackButtonText}>Retry</Text>
                </TvFocusable>
                <TvFocusable
                  onPress={() => router.back()}
                  style={({ focused }: any) => [
                    styles.videoFallbackButton,
                    { marginTop: 12 },
                    focused ? styles.videoFallbackButtonFocused : null,
                  ]}
                >
                  <Text style={styles.videoFallbackButtonText}>Go Back</Text>
                </TvFocusable>
              </>
            )}
          </View>
        )}
        {shouldShowMovieFlixLoader ? (
          <MovieFlixLoader
            message={loaderMessage}
            variant={loaderVariant}
          />
        ) : null}
        {watchPartyBlocked ? (
          <View style={styles.watchPartyWaitOverlay} pointerEvents="auto">
            <LinearGradient
              colors={['rgba(0,0,0,0.86)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.86)'] as const}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.watchPartyWaitCard}>
              <Text style={styles.watchPartyWaitTitle}>Waiting for host…</Text>
              <Text style={styles.watchPartyWaitText}>
                The host hasn’t started the movie yet. Playback will start automatically once they press play.
              </Text>
              <TvFocusable
                onPress={() => router.back()}
                tvPreferredFocus
                style={({ focused }: any) => [
                  styles.watchPartyWaitButton,
                  focused ? styles.watchPartyWaitButtonFocused : null,
                ]}
              >
                <Text style={styles.watchPartyWaitButtonText}>Back</Text>
              </TvFocusable>
            </View>
          </View>
        ) : null}
        {showQualitySwitchPill ? <BufferingPill message="Switching quality…" /> : null}
        {transitionReady && videoPlaybackSource && showBufferingOverlay && !scrapeError ? (
          <BufferingPill message="Buffering…" />
        ) : null}
        {transitionReady && videoPlaybackSource && midrollActive ? (
          <View style={styles.midrollOverlay} pointerEvents="auto">
            <LinearGradient
              colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.70)', 'rgba(0,0,0,0.92)'] as const}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.midrollHeader}>
              <View style={styles.midrollBadge}>
                <Text style={styles.midrollBadgeText}>Sponsored</Text>
              </View>
              <Text style={styles.midrollCountdown}>{`Ad ends in ${midrollRemainingSec}s`}</Text>
            </View>

            <View style={styles.midrollBody}>
              {midrollProduct ? (
                <NativeAdCard
                  product={midrollProduct}
                  onPress={() => {
                    if (!midrollProduct?.id) return;
                    void trackPromotionClick({ productId: String(midrollProduct.id), placement: 'story' }).catch(() => { });
                    router.push((`/marketplace/${midrollProduct.id}`) as any);
                  }}
                />
              ) : (
                <View style={styles.midrollPlaceholder} />
              )}
              <Text style={styles.midrollNote}>Free plan ad break</Text>
            </View>
          </View>
        ) : null}
        {/* Big paused info - shows when paused (behind controls, visible when they fade) */}
        {!isPlaying && !isLocked && !midrollActive && rawOverview && (
          <View style={styles.pausedOverlay} pointerEvents="none">
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.95)']}
              style={styles.pausedGradient}
            />
            <View style={[styles.pausedContent, { paddingBottom: insets.bottom + 60 }]}>
              <View style={styles.pausedBadgeRow}>
                <View style={styles.pausedBadge}>
                  <Ionicons name="pause" size={18} color="#fff" />
                  <Text style={styles.pausedBadgeText}>PAUSED</Text>
                </View>
                {durationMillis > 0 && (
                  <Text style={styles.pausedTime}>
                    {Math.floor(durationMillis / 60000)} min
                  </Text>
                )}
              </View>
              <Text style={styles.pausedTitle}>{activeTitle}</Text>
              {isTvShow && initialSeasonNumber && initialEpisodeNumber && (
                <Text style={styles.pausedEpisode}>
                  Season {initialSeasonNumber}, Episode {initialEpisodeNumber}
                </Text>
              )}
              <Text style={styles.pausedDesc} numberOfLines={5}>{rawOverview}</Text>
              {!showControls && <Text style={styles.pausedHint}>Press any button to resume</Text>}
            </View>
          </View>
        )}

        {!showControls && !isLocked && !midrollActive ? (
          <Pressable
            focusable={false}
            accessible={false}
            style={styles.touchCatcher}
            onPress={handleSurfacePress}
          />
        ) : null}
        {showControls && !isLocked && (
          <View style={[styles.overlay, overlayPaddingStyle]}>
            {/* Top fade */}
            <LinearGradient
              colors={['rgba(0,0,0,0.8)', 'transparent']}
              style={[styles.topGradient, { height: 140 + insets.top }]}
            />
            {/* Bottom fade */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.9)']}
              style={[styles.bottomGradient, { height: 180 + insets.bottom }]}
            />
            {/* TOP BAR */}
            <View style={styles.topBar}>
              <View style={styles.topLeft}>
                {isTvDevice ? (
                  <TvFocusable
                    onPress={() => router.back()}
                    tvPreferredFocus
                    style={({ focused }: any) => [
                      styles.roundButton,
                      focused ? styles.roundButtonFocused : null,
                    ]}
                  >
                    <Ionicons name="chevron-back" size={20} color="#fff" />
                  </TvFocusable>
                ) : (
                  <TvFocusable
                    onPress={() => router.back()}
                    style={({ focused }: any) => [styles.roundButton, focused ? styles.roundButtonFocused : null]}
                  >
                    <Ionicons name="chevron-back" size={20} color="#fff" />
                  </TvFocusable>
                )}
                <View style={styles.titleWrap}>
                  <Text style={styles.title}>{activeTitle}</Text>
                  {roomCode ? (
                    <Text style={styles.roomCodeBadge}>Party #{roomCode}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.topRight}>
                {isTvDevice ? (
                  <>
                    {isTvShow && episodeQueue.length > 0 ? (
                      <TvFocusable
                        onPress={() => setEpisodeDrawerOpen((prev) => !prev)}
                        style={({ focused }: any) => [
                          styles.roundButton,
                          focused ? styles.roundButtonFocused : null,
                        ]}
                      >
                        <MaterialCommunityIcons name="playlist-play" size={22} color="#fff" />
                      </TvFocusable>
                    ) : null}
                    <TvFocusable
                      onPress={() => {
                        if (!avControlsEnabled) return;
                        bumpControlsLife();
                        setAvDrawerOpen((prev) => !prev);
                      }}
                      disabled={!avControlsEnabled}
                      style={({ focused }: any) => [
                        styles.roundButton,
                        !avControlsEnabled ? styles.roundButtonDisabled : null,
                        focused && avControlsEnabled ? styles.roundButtonFocused : null,
                      ]}
                    >
                      <MaterialCommunityIcons name="subtitles-outline" size={22} color="#fff" />
                    </TvFocusable>
                  </>
                ) : (
                  <>
                    <TvFocusable
                      onPress={() => {
                        // no-op (mobile-only placeholder)
                      }}
                      style={({ focused }: any) => [styles.roundButton, focused ? styles.roundButtonFocused : null]}
                    >
                      <MaterialCommunityIcons name="thumb-down-outline" size={22} color="#fff" />
                    </TvFocusable>
                    <TvFocusable
                      onPress={() => {
                        // no-op (mobile-only placeholder)
                      }}
                      style={({ focused }: any) => [styles.roundButton, focused ? styles.roundButtonFocused : null]}
                    >
                      <MaterialCommunityIcons name="thumb-up-outline" size={22} color="#fff" />
                    </TvFocusable>
                    <TvFocusable
                      onPress={() => {
                        // no-op (mobile-only placeholder)
                      }}
                      style={({ focused }: any) => [styles.roundButton, focused ? styles.roundButtonFocused : null]}
                    >
                      <MaterialCommunityIcons name="monitor-share" size={22} color="#fff" />
                    </TvFocusable>
                    {roomCode ? (
                      <TvFocusable
                        onPress={() => setShowChat((prev) => !prev)}
                        style={({ focused }: any) => [styles.roundButton, focused ? styles.roundButtonFocused : null]}
                      >
                        <MaterialCommunityIcons
                          name={showChat ? 'message-text-outline' : 'message-outline'}
                          size={22}
                          color="#fff"
                        />
                      </TvFocusable>
                    ) : null}
                    {isTvShow && episodeQueue.length > 0 ? (
                      <TvFocusable
                        onPress={() => setEpisodeDrawerOpen((prev) => !prev)}
                        style={({ focused }: any) => [styles.roundButton, focused ? styles.roundButtonFocused : null]}
                      >
                        <MaterialCommunityIcons name="playlist-play" size={22} color="#fff" />
                      </TvFocusable>
                    ) : null}
                  </>
                )}
              </View>
            </View>
            {/* MIDDLE CONTROLS + CHAT */}
            <View style={styles.middleRow}>
              {/* Central playback controls */}
              {isTvDevice ? null : (
                <View style={styles.centerControlsWrap}>
                  <View style={styles.centerControls}>
                    <TvFocusable
                      onPress={() => void seekBy(-10_000)}
                      style={({ focused }: any) => [
                        styles.iconCircleSmall,
                        focused ? styles.iconCircleSmallFocused : null,
                      ]}
                    >
                      <MaterialCommunityIcons name="rewind-10" size={30} color="#fff" />
                    </TvFocusable>
                    <TvFocusable
                      onPress={togglePlayPause}
                      tvPreferredFocus
                      style={({ focused }: any) => [styles.iconCircle, focused ? styles.iconCircleFocused : null]}
                    >
                      <MaterialCommunityIcons name={isPlaying ? 'pause' : 'play'} size={48} color="#fff" />
                    </TvFocusable>
                    <TvFocusable
                      onPress={() => void seekBy(10_000)}
                      style={({ focused }: any) => [
                        styles.iconCircleSmall,
                        focused ? styles.iconCircleSmallFocused : null,
                      ]}
                    >
                      <MaterialCommunityIcons name="fast-forward-10" size={30} color="#fff" />
                    </TvFocusable>
                  </View>
                </View>
              )}
              {isTvDevice ? null : (
                <View style={[styles.sideCluster, styles.sideClusterRight]}>
                  {/* Watch party chat (only when in a room) */}
                  {roomCode && showChat ? (
                    <View style={styles.chatPanel}>
                      <Text style={styles.chatTitle}>Party chat</Text>
                      <FlatList
                        data={chatMessages}
                        keyExtractor={(item) => item.id}
                        style={styles.chatList}
                        contentContainerStyle={styles.chatListContent}
                        renderItem={({ item }) => (
                          <View style={styles.chatMessageRow}>
                            {item.avatar ? (
                              <Image
                                source={{ uri: item.avatar }}
                                style={styles.chatAvatar}
                              />
                            ) : (
                              <View style={styles.chatAvatarFallback}>
                                <Text style={styles.chatAvatarFallbackText}>
                                  {item.user.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                            )}
                            <View style={styles.chatBubble}>
                              <Text style={styles.chatUser}>{item.user}</Text>
                              <Text style={styles.chatText}>{item.text}</Text>
                            </View>
                          </View>
                        )}
                      />
                      <View style={styles.chatInputRow}>
                        <TextInput
                          style={styles.chatInput}
                          placeholder="Say something…"
                          placeholderTextColor="rgba(255,255,255,0.5)"
                          value={chatInput}
                          onChangeText={setChatInput}
                          onSubmitEditing={handleSendChat}
                          editable={!chatSending}
                        />
                        <TvFocusable
                          onPress={handleSendChat}
                          disabled={chatSending || !chatInput.trim()}
                          style={({ focused }: any) => [
                            styles.chatSendButton,
                            focused ? styles.drawerCloseFocused : null,
                          ]}
                        >
                          <Ionicons name="send" size={16} color="#fff" />
                        </TvFocusable>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.middleRightPlaceholder} />
                  )}
                </View>
              )}
            </View>

            {episodeDrawerOpen && isTvShow && episodeQueue.length > 0 && (
              <View style={styles.episodeDrawer}>
                <View style={styles.episodeDrawerHeader}>
                  <View>
                    <Text style={styles.episodeDrawerTitle}>Up Next</Text>
                    <Text style={styles.episodeDrawerSubtitle}>
                      {`${episodeQueue.length} episod${episodeQueue.length === 1 ? 'e' : 'es'}`}
                    </Text>
                  </View>
                  {isTvDevice ? (
                    <TvFocusable
                      onPress={() => setEpisodeDrawerOpen(false)}
                      style={({ focused }: any) => [
                        styles.episodeDrawerClose,
                        focused ? styles.drawerCloseFocused : null,
                      ]}
                    >
                      <Ionicons name="close" size={18} color="#fff" />
                    </TvFocusable>
                  ) : (
                    <TvFocusable
                      onPress={() => setEpisodeDrawerOpen(false)}
                      style={({ focused }: any) => [
                        styles.episodeDrawerClose,
                        focused ? styles.drawerCloseFocused : null,
                      ]}
                    >
                      <Ionicons name="close" size={18} color="#fff" />
                    </TvFocusable>
                  )}
                </View>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.episodeDrawerList}
                >
                  {episodeQueue.map((episode, index) => {
                    const key = `${episode.id ?? index}`;
                    const posterUri = episode.stillPath
                      ? `https://image.tmdb.org/t/p/w300${episode.stillPath}`
                      : FALLBACK_EPISODE_IMAGE;
                    const fallbackEpisodeNumber = episode.episodeNumber ?? index + 2;
                    return (
                      isTvDevice ? (
                        <TvFocusable
                          key={key}
                          tvPreferredFocus={index === 0}
                          onPress={() => void handleEpisodePlay(episode, index)}
                          disabled={scrapingEpisode}
                          style={({ focused }: any) => [
                            styles.episodeDrawerCard,
                            focused ? styles.drawerItemFocused : null,
                          ]}
                        >
                          <Image source={{ uri: posterUri }} style={styles.episodeDrawerThumb} />
                          <View style={styles.episodeDrawerMeta}>
                            <Text style={styles.episodeDrawerSeason}>
                              {(episode.seasonName ?? `Season ${episode.seasonNumber ?? ''}`)?.trim() || 'Season'} · Ep {fallbackEpisodeNumber}
                            </Text>
                            <Text style={styles.episodeDrawerName} numberOfLines={1}>
                              {episode.title || 'Episode'}
                            </Text>
                            {episode.overview ? (
                              <Text style={styles.episodeDrawerOverview} numberOfLines={2}>
                                {episode.overview}
                              </Text>
                            ) : null}
                            {episode.runtime ? (
                              <Text style={styles.episodeDrawerRuntime}>{episode.runtime} min</Text>
                            ) : null}
                          </View>
                        </TvFocusable>
                      ) : (
                        <TvFocusable
                          key={key}
                          onPress={() => void handleEpisodePlay(episode, index)}
                          disabled={scrapingEpisode}
                          style={({ focused }: any) => [
                            styles.episodeDrawerCard,
                            focused ? styles.drawerItemFocused : null,
                          ]}
                        >
                          <Image source={{ uri: posterUri }} style={styles.episodeDrawerThumb} />
                          <View style={styles.episodeDrawerMeta}>
                            <Text style={styles.episodeDrawerSeason}>
                              {(episode.seasonName ?? `Season ${episode.seasonNumber ?? ''}`)?.trim() || 'Season'} · Ep {fallbackEpisodeNumber}
                            </Text>
                            <Text style={styles.episodeDrawerName} numberOfLines={1}>
                              {episode.title || 'Episode'}
                            </Text>
                            {episode.overview ? (
                              <Text style={styles.episodeDrawerOverview} numberOfLines={2}>
                                {episode.overview}
                              </Text>
                            ) : null}
                            {episode.runtime ? (
                              <Text style={styles.episodeDrawerRuntime}>{episode.runtime} min</Text>
                            ) : null}
                          </View>
                        </TvFocusable>
                      )
                    );
                  })}
                </ScrollView>
              </View>
            )}
            {avDrawerOpen && (
              <View style={styles.avDrawer}>
                <View style={styles.avDrawerHeader}>
                  <Text style={styles.avDrawerTitle}>Audio & Subtitles</Text>
                  <TvFocusable
                    onPress={() => setAvDrawerOpen(false)}
                    style={({ focused }: any) => [styles.avDrawerClose, focused ? styles.drawerCloseFocused : null]}
                  >
                    <Ionicons name="close" size={18} color="#fff" />
                  </TvFocusable>
                </View>
                <View style={styles.avDrawerColumns}>
                  <View style={styles.avDrawerColumn}>
                    <Text style={styles.avDrawerColumnTitle}>Subtitles</Text>
                    {hasSubtitleOptions ? (
                      <ScrollView style={styles.avDrawerList} showsVerticalScrollIndicator={false}>
                        <TvFocusable
                          tvPreferredFocus={true}
                          style={({ focused }: any) => [
                            styles.avOptionRow,
                            selectedCaptionId === 'off' && styles.avOptionRowActive,
                            focused ? styles.avOptionRowFocused : null,
                          ]}
                          onPress={() => void handleCaptionSelect('off')}
                        >
                          <View style={styles.avOptionIndicator}>
                            {selectedCaptionId === 'off' ? (
                              <Ionicons name="checkmark" size={16} color="#fff" />
                            ) : null}
                          </View>
                          <Text style={styles.avOptionLabel}>Off</Text>
                        </TvFocusable>
                        {captionSources.map((caption) => (
                          <TvFocusable
                            key={caption.id}
                            style={({ focused }: any) => [
                              styles.avOptionRow,
                              selectedCaptionId === caption.id && styles.avOptionRowActive,
                              focused ? styles.avOptionRowFocused : null,
                            ]}
                            onPress={() => void handleCaptionSelect(caption.id)}
                          >
                            <View style={styles.avOptionIndicator}>
                              {selectedCaptionId === caption.id ? (
                                <Ionicons name="checkmark" size={16} color="#fff" />
                              ) : null}
                            </View>
                            <Text style={styles.avOptionLabel}>{getCaptionLabel(caption)}</Text>
                            {captionLoadingId === caption.id ? (
                              <ActivityIndicator size="small" color="#fff" style={styles.avOptionSpinner} />
                            ) : null}
                          </TvFocusable>
                        ))}
                      </ScrollView>
                    ) : (
                      <Text style={styles.avEmptyCopy}>No subtitles detected</Text>
                    )}
                  </View>
                  <View style={styles.avDrawerColumn}>
                    <Text style={styles.avDrawerColumnTitle}>Audio</Text>
                    {hasAudioOptions ? (
                      <ScrollView style={styles.avDrawerList} showsVerticalScrollIndicator={false}>
                        <TvFocusable
                          style={({ focused }: any) => [
                            styles.avOptionRow,
                            selectedAudioKey === 'auto' && styles.avOptionRowActive,
                            focused ? styles.avOptionRowFocused : null,
                          ]}
                          onPress={() => void handleAudioSelect(null)}
                        >
                          <View style={styles.avOptionIndicator}>
                            {selectedAudioKey === 'auto' ? (
                              <Ionicons name="checkmark" size={16} color="#fff" />
                            ) : null}
                          </View>
                          <Text style={styles.avOptionLabel}>Auto</Text>
                        </TvFocusable>
                        {audioTrackOptions.map((track) => (
                          <TvFocusable
                            key={track.id}
                            style={({ focused }: any) => [
                              styles.avOptionRow,
                              selectedAudioKey === track.id && styles.avOptionRowActive,
                              focused ? styles.avOptionRowFocused : null,
                            ]}
                            onPress={() => void handleAudioSelect(track)}
                          >
                            <View style={styles.avOptionIndicator}>
                              {selectedAudioKey === track.id ? (
                                <Ionicons name="checkmark" size={16} color="#fff" />
                              ) : null}
                            </View>
                            <Text style={styles.avOptionLabel}>
                              {track.name || track.language?.toUpperCase() || 'Audio'}
                            </Text>
                          </TvFocusable>
                        ))}
                      </ScrollView>
                    ) : (
                      <Text style={styles.avEmptyCopy}>No alternate audio</Text>
                    )}
                  </View>
                  <View style={styles.avDrawerColumn}>
                    <Text style={styles.avDrawerColumnTitle}>Quality</Text>
                    {hasQualityOptions ? (
                      <ScrollView style={styles.avDrawerList} showsVerticalScrollIndicator={false}>
                        <TvFocusable
                          style={({ focused }: any) => [
                            styles.avOptionRow,
                            selectedQualityId === 'auto' && styles.avOptionRowActive,
                            focused ? styles.avOptionRowFocused : null,
                          ]}
                          onPress={() => void handleQualitySelect(null)}
                        >
                          <View style={styles.avOptionIndicator}>
                            {selectedQualityId === 'auto' ? (
                              <Ionicons name="checkmark" size={16} color="#fff" />
                            ) : null}
                          </View>
                          <Text style={styles.avOptionLabel}>Auto (Adaptive)</Text>
                        </TvFocusable>
                        {qualityOptions.map((option) => (
                          <TvFocusable
                            key={option.id}
                            style={({ focused }: any) => [
                              styles.avOptionRow,
                              selectedQualityId === option.id && styles.avOptionRowActive,
                              focused ? styles.avOptionRowFocused : null,
                            ]}
                            onPress={() => void handleQualitySelect(option)}
                          >
                            <View style={styles.avOptionIndicator}>
                              {selectedQualityId === option.id ? (
                                <Ionicons name="checkmark" size={16} color="#fff" />
                              ) : null}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.avOptionLabel}>{option.label}</Text>
                              {option.resolution ? (
                                <Text style={styles.avOptionSubLabel}>{option.resolution}</Text>
                              ) : null}
                            </View>
                            {qualityLoadingId === option.id ? (
                              <ActivityIndicator size="small" color="#fff" style={styles.avOptionSpinner} />
                            ) : null}
                          </TvFocusable>
                        ))}
                      </ScrollView>
                    ) : (
                      <Text style={styles.avEmptyCopy}>Single quality stream</Text>
                    )}
                  </View>
                </View>
              </View>
            )}
            {/* BOTTOM BAR */}
            <View style={styles.bottomControls}>
              {/* Progress */}
              <View style={styles.progressRow}>
                <View style={styles.progressLabels}>
                  <Text style={styles.timeText}>{currentTimeLabel}</Text>
                  <Text style={styles.timeText}>{totalTimeLabel}</Text>
                </View>
                <View style={styles.progressContainerNoCard}>
                  <View style={styles.progressTrackWrap}>
                    <View style={styles.progressTrackBase} />
                    <View
                      style={[
                        styles.progressTrackBuffered,
                        { width: `${Math.round(bufferedPctForUi * 1000) / 10}%` },
                      ]}
                    />
                    <View
                      style={[
                        styles.progressTrackPlayed,
                        { width: `${Math.round(playedPctForUi * 1000) / 10}%` },
                      ]}
                    />
                    {isTvDevice ? null : (
                      <Slider
                        style={styles.progressBarOverlay}
                        minimumValue={0}
                        maximumValue={durationForUi}
                        value={seekPosition}
                        onSlidingStart={() => {
                          setIsSeeking(true);
                          bumpControlsLife();
                        }}
                        onValueChange={(val) => {
                          setSeekPosition(val);
                          bumpControlsLife();
                        }}
                        onSlidingComplete={async (val) => {
                          setIsSeeking(false);
                          await videoRef.current?.setPositionAsync(val);
                          // Snap captions immediately after a seek.
                          updateActiveCaption(val, true);
                          bumpControlsLife();
                        }}
                        minimumTrackTintColor="transparent"
                        maximumTrackTintColor="transparent"
                        thumbTintColor="#fff"
                      />
                    )}
                  </View>
                </View>
              </View>
              {/* Bottom actions */}
              <View style={[styles.bottomActions, isTvDevice ? styles.bottomActionsTv : null]}>
                {isTvDevice ? (
                  <>
                    <TvFocusable
                      onPress={() => void seekBy(-10_000)}
                      style={({ focused }: any) => [
                        styles.tvBottomIconBtn,
                        focused ? styles.tvBottomBtnFocused : null,
                      ]}
                    >
                      <MaterialCommunityIcons name="rewind-10" size={26} color="#fff" />
                    </TvFocusable>
                    <TvFocusable
                      onPress={togglePlayPause}
                      tvPreferredFocus
                      style={({ focused }: any) => [
                        styles.tvBottomIconBtn,
                        focused ? styles.tvBottomBtnFocused : null,
                      ]}
                    >
                      <MaterialCommunityIcons name={isPlaying ? 'pause' : 'play'} size={26} color="#fff" />
                    </TvFocusable>
                    <TvFocusable
                      onPress={() => void seekBy(10_000)}
                      style={({ focused }: any) => [
                        styles.tvBottomIconBtn,
                        focused ? styles.tvBottomBtnFocused : null,
                      ]}
                    >
                      <MaterialCommunityIcons name="fast-forward-10" size={26} color="#fff" />
                    </TvFocusable>
                    <TvFocusable
                      onPress={handleRateToggle}
                      style={({ focused }: any) => [
                        styles.tvBottomPillBtn,
                        focused ? styles.tvBottomPillBtnFocused : null,
                      ]}
                    >
                      <MaterialCommunityIcons name="speedometer" size={18} color="#fff" />
                      <Text style={styles.tvBottomPillText}>{`Speed ${playbackRate.toFixed(1)}x`}</Text>
                    </TvFocusable>
                    <TvFocusable
                      onPress={() => {
                        if (!avControlsEnabled) return;
                        bumpControlsLife();
                        setAvDrawerOpen((prev) => !prev);
                      }}
                      disabled={!avControlsEnabled}
                      style={({ focused }: any) => [
                        styles.tvBottomPillBtn,
                        !avControlsEnabled ? styles.bottomButtonDisabled : null,
                        focused && avControlsEnabled ? styles.tvBottomPillBtnFocused : null,
                      ]}
                    >
                      <MaterialCommunityIcons name="subtitles-outline" size={18} color="#fff" />
                      <Text style={styles.tvBottomPillText}>{avDrawerOpen ? 'Hide A/V' : 'Audio & Subs'}</Text>
                    </TvFocusable>
                  </>
                ) : (
                  <>
                    <TvFocusable
                      onPress={handleRateToggle}
                      style={({ focused }: any) => [styles.bottomButton, focused ? styles.tvBottomPillBtnFocused : null]}
                    >
                      <MaterialCommunityIcons name="speedometer" size={18} color="#fff" />
                      <Text style={styles.bottomText}>{`Speed (${playbackRate.toFixed(1)}x)`}</Text>
                    </TvFocusable>
                    <TvFocusable
                      onPress={toggleLock}
                      style={({ focused }: any) => [styles.bottomButton, focused ? styles.tvBottomPillBtnFocused : null]}
                    >
                      <MaterialCommunityIcons
                        name={isLocked ? 'lock' : 'lock-outline'}
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.bottomText}>{isLocked ? 'Locked' : 'Lock'}</Text>
                    </TvFocusable>
                    {pipUiEnabled ? (
                      <TvFocusable
                        onPress={handlePipToggle}
                        style={({ focused }: any) => [styles.bottomButton, focused ? styles.tvBottomPillBtnFocused : null]}
                      >
                        <MaterialCommunityIcons
                          name={
                            isPipActive
                              ? 'picture-in-picture-bottom-right'
                              : 'picture-in-picture-bottom-right-outline'
                          }
                          size={18}
                          color="#fff"
                        />
                        <Text style={styles.bottomText}>{isPipActive ? 'Exit PiP' : 'PiP'}</Text>
                      </TvFocusable>
                    ) : null}
                    <TvFocusable
                      style={({ focused }: any) => [
                        styles.bottomButton,
                        !avControlsEnabled ? styles.bottomButtonDisabled : null,
                        focused && avControlsEnabled ? styles.tvBottomPillBtnFocused : null,
                      ]}
                      onPress={() => {
                        if (!avControlsEnabled) return;
                        bumpControlsLife();
                        setAvDrawerOpen((prev) => !prev);
                      }}
                      disabled={!avControlsEnabled}
                    >
                      <MaterialCommunityIcons name="subtitles-outline" size={18} color="#fff" />
                      <Text style={styles.bottomText}>
                        {avDrawerOpen ? 'Hide' : 'Audio & Subtitles'}
                      </Text>
                    </TvFocusable>
                  </>
                )}
              </View>
            </View>
          </View>
        )}
        {isLocked && (
          <View pointerEvents="box-none" style={styles.lockBadgeWrapper}>
            <TvFocusable
              tvPreferredFocus
              onPress={toggleLock}
              style={({ focused }: any) => [styles.lockBadge, focused ? styles.lockBadgeFocused : null]}
            >
              <MaterialCommunityIcons name="lock" size={20} color="#fff" />
              <View style={styles.lockBadgeTextWrap}>
                <Text style={styles.lockBadgeTitle}>Screen locked</Text>
                <Text style={styles.lockBadgeHint}>Tap to unlock</Text>
              </View>
              <MaterialCommunityIcons name="lock-open-variant" size={20} color="#fff" />
            </TvFocusable>
          </View>
        )}
        {activeCaptionText ? (
          <View pointerEvents="none" style={styles.subtitleWrapper}>
            <Text style={styles.subtitleText}>{activeCaptionText}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};
const MovieFlixLoader: React.FC<{ message: string; variant?: 'solid' | 'transparent' }> = ({
  message,
  variant = 'solid',
}) => {
  // Lightweight loader with subtle opacity pulse - no scale animation for old TV performance
  const opacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <View
      pointerEvents={variant === 'solid' ? 'auto' : 'none'}
      style={[styles.loaderOverlay, variant === 'transparent' && styles.loaderOverlayTransparent]}
    >
      <Animated.Text style={[styles.loaderTitle, { opacity }]}>MOVIEFLIX</Animated.Text>
      <ActivityIndicator size="small" color="#e50914" style={{ marginTop: 16 }} />
      {message ? <Text style={styles.loaderSubtitle}>{message}</Text> : null}
    </View>
  );
};

const BufferingPill: React.FC<{ message: string }> = ({ message }) => {
  if (!message) return null;
  return (
    <View pointerEvents="none" style={styles.bufferPillWrap}>
      <View style={styles.bufferPill}>
        <ActivityIndicator size="small" color="#fff" style={{ marginRight: 10 }} />
        <Text style={styles.bufferPillText}>{message}</Text>
      </View>
    </View>
  );
};
function parseCaptionPayload(payload: string, type: 'srt' | 'vtt'): CaptionCue[] {
  const sanitized = payload.replace(/\r/g, '').replace('\uFEFF', '');
  const content = type === 'vtt' ? sanitized.replace(/^WEBVTT.*\n/, '') : sanitized;
  const blocks = content.split(/\n\n+/);
  const cues: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (/^\d+$/.test(lines[0])) {
      lines.shift();
    }
    const timing = lines.shift();
    if (!timing || !timing.includes('-->')) continue;
    const [startRaw, endRaw] = timing.split('-->');
    const start = parseTimestampToMillis(startRaw);
    const end = parseTimestampToMillis(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const text = lines.join('\n').replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    cues.push({
      start,
      end,
      text,
    });
  }
  return cues.sort((a, b) => a.start - b.start);
}
function parseTimestampToMillis(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  const secondsParts = parts.pop();
  if (!secondsParts) return NaN;
  const [secondsStr, milliStr = '0'] = secondsParts.split('.');
  const seconds = parseInt(secondsStr || '0', 10);
  const millis = parseInt(milliStr.padEnd(3, '0').slice(0, 3), 10);
  const minutes = parts.length ? parseInt(parts.pop() || '0', 10) : 0;
  const hours = parts.length ? parseInt(parts.pop() || '0', 10) : 0;
  return ((hours * 3600 + minutes * 60 + seconds) * 1000) + millis;
}
function parseHlsAudioTracks(manifest: string): AudioTrackOption[] {
  const lines = manifest.split('\n');
  const options: AudioTrackOption[] = [];
  const regex = /^#EXT-X-MEDIA:TYPE=AUDIO,(.*)$/i;

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const match = regex.exec(line);
    if (!match) return;

    const attrs = parseAttributeDictionary(match[1]);
    const groupId = stripQuotes(attrs['GROUP-ID']);
    const name = stripQuotes(attrs.NAME);
    const language = stripQuotes(attrs.LANGUAGE);
    const isDefault = attrs.DEFAULT === 'YES';

    options.push({
      id: buildAudioTrackOptionId({
        groupId,
        language,
        name,
        index: idx,
      }),
      name,
      language,
      groupId,
      isDefault,
    });
  });

  return options;
}

function buildAudioTrackOptionId(params: {
  groupId?: string;
  language?: string;
  name?: string;
  index: number;
}): string {
  const segments = [params.groupId, params.language, params.name]
    .map((segment) => sanitizeKeySegment(segment))
    .filter(Boolean) as string[];
  const base = segments.length ? segments.join('__') : 'audio-track';
  return `${base}-${params.index}`;
}

function sanitizeKeySegment(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || undefined;
}
function parseHlsQualityOptions(manifest: string, manifestUrl: string): QualityOption[] {
  const lines = manifest.split('\n');
  const options: QualityOption[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
    const [, attrString = ''] = line.split(':', 2);
    const attrs = parseAttributeDictionary(attrString);
    let j = i + 1;
    let uriLine: string | undefined;
    while (j < lines.length) {
      const candidate = lines[j].trim();
      j += 1;
      if (!candidate || candidate.startsWith('#')) continue;
      uriLine = candidate;
      break;
    }
    if (!uriLine) continue;
    const resolution = stripQuotes(attrs.RESOLUTION);
    const bandwidth = attrs.BANDWIDTH ? parseInt(attrs.BANDWIDTH, 10) : undefined;
    const codecs = stripQuotes(attrs.CODECS);
    const label = buildQualityLabel(resolution, bandwidth);
    const uri = resolveRelativeUrl(uriLine, manifestUrl);
    options.push({
      id: `${bandwidth ?? 0}-${resolution ?? uri}`,
      label,
      uri,
      resolution,
      bandwidth,
      codecs,
    });
  }
  return options.sort((a, b) => {
    const aHeight = getResolutionHeight(a.resolution);
    const bHeight = getResolutionHeight(b.resolution);
    if (aHeight && bHeight) return bHeight - aHeight;
    if (a.bandwidth && b.bandwidth) return (b.bandwidth || 0) - (a.bandwidth || 0);
    return 0;
  });
}

function orderQualityOptionsForCompatibility(options: QualityOption[]): QualityOption[] {
  const desiredHeight = 720;
  const maxHeight = 1080;
  return [...options].sort((a, b) => {
    const ar = getCodecRank(a.codecs);
    const br = getCodecRank(b.codecs);
    if (ar !== br) return ar - br;

    const ah = getResolutionHeight(a.resolution);
    const bh = getResolutionHeight(b.resolution);
    const ap = getHeightPenalty(ah, desiredHeight, maxHeight);
    const bp = getHeightPenalty(bh, desiredHeight, maxHeight);
    if (ap !== bp) return ap - bp;

    const ab = typeof a.bandwidth === 'number' ? a.bandwidth : Number.POSITIVE_INFINITY;
    const bb = typeof b.bandwidth === 'number' ? b.bandwidth : Number.POSITIVE_INFINITY;
    return ab - bb;
  });
}

function getCodecRank(codecs?: string): number {
  const value = codecs?.toLowerCase() ?? '';
  if (!value) return 1;
  if (value.includes('avc1')) return 0;
  if (value.includes('hvc1') || value.includes('hev1') || value.includes('dvhe') || value.includes('dvh1')) return 2;
  return 1;
}

function getHeightPenalty(height: number | null, desired: number, max: number): number {
  if (!height) return 5000;
  if (height > max) return 10000 + height;
  return Math.abs(height - desired);
}
function buildQualityLabel(resolution?: string, bandwidth?: number): string {
  const height = getResolutionHeight(resolution);
  if (height) {
    const kbps = bandwidth ? ` • ${formatBandwidth(bandwidth)}` : '';
    return `${height}p${kbps}`;
  }
  if (resolution) return resolution;
  if (bandwidth) return formatBandwidth(bandwidth);
  return 'Variant';
}
function getResolutionHeight(resolution?: string): number | null {
  if (!resolution) return null;
  const parts = resolution.split('x');
  if (parts.length !== 2) return null;
  const height = parseInt(parts[1], 10);
  return Number.isFinite(height) ? height : null;
}
function formatBandwidth(bandwidth: number): string {
  if (!Number.isFinite(bandwidth) || bandwidth <= 0) return 'Stream';
  const kbpsValue = bandwidth / 1000;
  if (kbpsValue >= 1000) {
    return `${(kbpsValue / 1000).toFixed(1)} Mbps`;
  }
  return `${Math.round(kbpsValue)} kbps`;
}
function resolveRelativeUrl(target: string, base: string): string {
  try {
    return new URL(target, base).toString();
  } catch {
    return target;
  }
}
async function preloadQualityVariant(uri: string, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(uri, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Variant request failed (${res.status})`);
    }
    const manifest = await res.text();
    const firstSegment = manifest
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('#'));
    if (firstSegment) {
      const absoluteSegment = resolveRelativeUrl(firstSegment, uri);
      const segRes = await fetch(absoluteSegment, { headers, signal: controller.signal });
      if (!segRes.ok) {
        throw new Error(`Segment request failed (${segRes.status})`);
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

type PreloadStreamWindowOptions = {
  windowSeconds: number;
  maxSegments: number;
  concurrency: number;
  seen?: Set<string>;
  startAtSeconds?: number;
};

function isHlsMasterManifest(text: string): boolean {
  return text.includes('#EXT-X-STREAM-INF');
}

function pickBestVariantUriFromMaster(masterText: string, manifestUrl: string): string | null {
  const lines = masterText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let best: { uri: string; height: number; bandwidth: number } | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

    const [, attrString = ''] = line.split(':', 2);
    const attrs = parseAttributeDictionary(attrString);
    const resolution = stripQuotes(attrs.RESOLUTION);
    const bandwidth = attrs.BANDWIDTH ? parseInt(attrs.BANDWIDTH, 10) : 0;
    const height = getResolutionHeight(resolution) ?? 0;

    let j = i + 1;
    let uriLine: string | undefined;
    while (j < lines.length) {
      const candidate = lines[j].trim();
      j += 1;
      if (!candidate || candidate.startsWith('#')) continue;
      uriLine = candidate;
      break;
    }
    if (!uriLine) continue;

    const variantUri = resolveRelativeUrl(uriLine, manifestUrl);
    if (!best) {
      best = { uri: variantUri, height, bandwidth };
      continue;
    }

    if (height > best.height) {
      best = { uri: variantUri, height, bandwidth };
      continue;
    }
    if (height === best.height && bandwidth > best.bandwidth) {
      best = { uri: variantUri, height, bandwidth };
    }
  }

  return best?.uri ?? null;
}

function parseHlsMediaSegments(
  manifestText: string,
  manifestUrl: string,
): { uri: string; duration: number | null }[] {
  const lines = manifestText.split('\n').map((l) => l.trim());
  const segments: { uri: string; duration: number | null }[] = [];
  let pendingDuration: number | null = null;

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const raw = line.slice('#EXTINF:'.length);
      const num = parseFloat(raw.split(',')[0]);
      pendingDuration = Number.isFinite(num) ? num : null;
      continue;
    }
    if (line.startsWith('#')) continue;

    segments.push({
      uri: resolveRelativeUrl(line, manifestUrl),
      duration: pendingDuration,
    });
    pendingDuration = null;
  }

  return segments;
}

async function prefetchUrlRange(url: string, headers: Record<string, string>, timeoutMs = 10_000): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        Range: 'bytes=0-0',
      },
      signal: controller.signal,
    }).then(() => undefined);
  } finally {
    clearTimeout(timeout);
  }
}

async function preloadStreamWindow(
  uri: string,
  headers: Record<string, string> = {},
  options: PreloadStreamWindowOptions,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(uri, { headers, signal: controller.signal });
    if (!res.ok) return;
    const text = await res.text();

    let variantUrl = uri;
    let variantText = text;
    if (isHlsMasterManifest(text)) {
      const picked = pickBestVariantUriFromMaster(text, uri);
      if (picked) {
        variantUrl = picked;
        const vRes = await fetch(variantUrl, { headers, signal: controller.signal });
        if (!vRes.ok) return;
        variantText = await vRes.text();
      }
    }

    const segments = parseHlsMediaSegments(variantText, variantUrl);
    if (!segments.length) return;

    const targetSeconds = Math.max(1, options.windowSeconds);
    const maxSegments = Math.max(1, options.maxSegments);
    const concurrency = Math.max(1, options.concurrency);
    const seen = options.seen;

    const isVod = variantText.includes('#EXT-X-ENDLIST');
    let startIndex = 0;
    if (!isVod) {
      // For live streams, prefetch the newest segments.
      startIndex = Math.max(0, segments.length - Math.min(maxSegments, 30));
    } else if (typeof options.startAtSeconds === 'number' && options.startAtSeconds > 0) {
      let accSeconds = 0;
      for (let i = 0; i < segments.length; i += 1) {
        accSeconds += segments[i].duration ?? 6;
        if (accSeconds >= options.startAtSeconds) {
          startIndex = Math.min(segments.length - 1, i + 1);
          break;
        }
      }
    }

    const toFetch: string[] = [];
    let accSeconds = 0;
    for (let i = startIndex; i < segments.length; i += 1) {
      if (toFetch.length >= maxSegments) break;

      const seg = segments[i];
      if (seen && seen.has(seg.uri)) continue;

      toFetch.push(seg.uri);
      if (seen) {
        seen.add(seg.uri);
        if (seen.size > 600) {
          seen.clear();
        }
      }

      accSeconds += seg.duration ?? 0;
      if (accSeconds >= targetSeconds) break;
    }

    if (!toFetch.length) return;

    for (let i = 0; i < toFetch.length; i += concurrency) {
      const chunk = toFetch.slice(i, i + concurrency);
      await Promise.allSettled(chunk.map((u) => prefetchUrlRange(u, headers)));
    }
  } finally {
    clearTimeout(timeout);
  }
}
function parseAttributeDictionary(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  let buffer = '';
  let inQuotes = false;
  const flush = () => {
    if (!buffer) return;
    const [key, value] = buffer.split('=');
    if (key && value) {
      result[key.trim()] = value.trim();
    }
    buffer = '';
  };
  for (const char of input) {
    if (char === '"') {
      inQuotes = !inQuotes;
    }
    if (char === ',' && !inQuotes) {
      flush();
    } else {
      buffer += char;
    }
  }
  flush();
  return result;
}
function stripQuotes(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/^"/, '').replace(/"$/, '');
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  touchLayer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  surfacePressLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  touchCatcher: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  videoFallbackText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  videoFallbackButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fff',
  },
  videoFallbackButtonFocused: {
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    transform: [{ scale: 1.04 }],
  },
  videoFallbackButtonText: {
    color: '#fff',
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 16,
    paddingVertical: 18,
    justifyContent: 'space-between',
    zIndex: 3,
  },
  midrollOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    paddingHorizontal: 18,
    paddingVertical: 24,
    justifyContent: 'space-between',
  },
  watchPartyWaitOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  watchPartyWaitCard: {
    width: '100%',
    maxWidth: 720,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(7,9,18,0.82)',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  watchPartyWaitTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  watchPartyWaitText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  watchPartyWaitButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  watchPartyWaitButtonFocused: {
    borderColor: 'rgba(255,255,255,0.8)',
    transform: [{ scale: 1.04 }],
  },
  watchPartyWaitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  midrollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  midrollBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(229,9,20,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.30)',
  },
  midrollBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  midrollCountdown: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '800',
  },
  midrollBody: {
    alignItems: 'center',
    gap: 14,
  },
  midrollPlaceholder: {
    height: 86,
    width: '100%',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  midrollNote: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  // TOP BAR
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(10,12,25,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  roundButtonFocused: {
    borderColor: '#fff',
    borderWidth: 3,
    backgroundColor: 'rgba(229,9,20,0.9)',
    transform: [{ scale: 1.12 }],
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  roundButtonDisabled: {
    opacity: 0.45,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  roomCodeBadge: {
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // MIDDLE
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideCluster: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideClusterLeft: {
    justifyContent: 'flex-start',
  },
  sideClusterRight: {
    justifyContent: 'flex-end',
  },
  sideRail: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightSideRail: {
    marginLeft: 16,
  },
  glassCard: {
    width: 86,
    paddingVertical: 12,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    backgroundColor: 'rgba(7,9,18,0.65)',
  },
  glassCardHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  glassCardLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  verticalSliderWrap: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderValueChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 10,
  },
  sliderValueText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  verticalSlider: {
    width: 130,
    height: 36,
    transform: [{ rotate: '-90deg' }],
  },
  centerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerControlsWrap: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  iconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.65)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  iconCircleFocused: {
    borderColor: '#fff',
    backgroundColor: '#ff1a26',
    transform: [{ scale: 1.12 }],
  },
  iconCircleSmall: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  iconCircleSmallFocused: {
    borderColor: '#fff',
    backgroundColor: 'rgba(229,9,20,0.8)',
    transform: [{ scale: 1.12 }],
  },
  tvHint: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
  },
  middleRightPlaceholder: {
    width: 220,
    height: 140,
  },
  chatPanel: {
    width: 220,
    height: 140,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  chatTitle: {
    color: '#ffffff',
    fontSize: 11,
    marginBottom: 4,
  },
  chatList: {
    flex: 1,
  },
  chatListContent: {
    paddingBottom: 4,
  },
  chatMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  chatAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
  },
  chatAvatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatAvatarFallbackText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  chatBubble: {
    flex: 1,
  },
  chatUser: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
  chatText: {
    color: '#ffffff',
    fontSize: 11,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  chatInput: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    color: '#ffffff',
    fontSize: 11,
    marginRight: 6,
  },
  chatSendButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // BOTTOM
  bottomControls: {
    width: '100%',
  },
  progressRow: {
    width: '100%',
    marginBottom: 4,
  },
  progressContainer: {
    width: '100%',
    borderRadius: 999,
    padding: 3,
  },
  progressGradient: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(7,9,18,0.72)',
  },
  progressBar: {
    width: '100%',
    height: 32,
  },
  progressBarOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: 32,
  },
  progressContainerNoCard: {
    width: '100%',
    marginTop: 8,
    paddingHorizontal: 6,
  },
  progressTrackWrap: {
    width: '100%',
    height: 32,
    position: 'relative',
    justifyContent: 'center',
  },
  progressTrackBase: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  progressTrackBuffered: {
    position: 'absolute',
    left: 0,
    top: 13,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  progressTrackPlayed: {
    position: 'absolute',
    left: 0,
    top: 13,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#ff5f6d',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    flexWrap: 'wrap',
    gap: 12,
  },
  bottomActionsTv: {
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    alignItems: 'center',
  },
  bottomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  bottomButtonDisabled: {
    opacity: 0.4,
  },
  bottomText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 4,
  },
  tvBottomIconBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,12,25,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tvBottomPillBtn: {
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,12,25,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tvBottomBtnFocused: {
    borderColor: '#fff',
    borderWidth: 3,
    backgroundColor: 'rgba(229,9,20,0.9)',
    transform: [{ scale: 1.12 }],
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  tvBottomPillBtnFocused: {
    borderColor: '#fff',
    borderWidth: 3,
    backgroundColor: 'rgba(229,9,20,0.9)',
    transform: [{ scale: 1.08 }],
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  tvBottomPillText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 8,
  },
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  pausedGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  pausedContent: {
    paddingHorizontal: 60,
  },
  pausedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginBottom: 20,
  },
  pausedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(229,9,20,0.9)',
  },
  pausedBadgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  pausedTime: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 22,
    fontWeight: '600',
  },
  pausedTitle: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '900',
    marginBottom: 12,
  },
  pausedEpisode: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 16,
  },
  pausedDesc: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 20,
    lineHeight: 32,
    maxWidth: 900,
  },
  pausedHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 32,
  },
  episodeDrawer: {
    position: 'absolute',
    top: 90,
    right: 12,
    bottom: 140,
    width: 280,
    borderRadius: 18,
    backgroundColor: 'rgba(5,6,15,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
  },
  episodeDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  episodeDrawerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  episodeDrawerSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginTop: 2,
  },
  episodeDrawerClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  drawerCloseFocused: {
    backgroundColor: 'rgba(229,9,20,0.6)',
    borderWidth: 2,
    borderColor: '#fff',
    transform: [{ scale: 1.1 }],
  },
  episodeDrawerList: {
    paddingBottom: 12,
  },
  episodeDrawerCard: {
    flexDirection: 'row',
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  drawerItemFocused: {
    borderColor: '#fff',
    backgroundColor: 'rgba(229,9,20,0.25)',
    transform: [{ scale: 1.03 }],
  },
  episodeDrawerThumb: {
    width: 90,
    height: 90,
  },
  episodeDrawerMeta: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  episodeDrawerSeason: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginBottom: 2,
  },
  episodeDrawerName: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  episodeDrawerOverview: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 4,
  },
  episodeDrawerRuntime: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 6,
  },
  avDrawer: {
    position: 'absolute',
    bottom: 150,
    left: 12,
    right: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(5,6,15,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
  },
  avDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  avDrawerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  avDrawerClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  avDrawerColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  avDrawerColumn: {
    flex: 1,
  },
  avDrawerColumnTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  avDrawerList: {
    maxHeight: 160,
  },
  avEmptyCopy: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  avOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  avOptionRowFocused: {
    backgroundColor: 'rgba(229,9,20,0.35)',
    borderRadius: 12,
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avOptionRowActive: {
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderRadius: 12,
    paddingHorizontal: 6,
  },
  avOptionIndicator: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avOptionLabel: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
  },
  avOptionSubLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 1,
  },
  avOptionSpinner: {
    marginLeft: 6,
  },
  lockBadgeWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 140,
    alignItems: 'flex-start',
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(5,6,15,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    gap: 10,
  },
  lockBadgeFocused: {
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    transform: [{ scale: 1.04 }],
  },
  lockBadgeTextWrap: {
    flexShrink: 1,
  },
  lockBadgeTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  lockBadgeHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    marginTop: 1,
  },
  subtitleWrapper: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitleText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,6,15,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  loaderOverlayTransparent: {
    backgroundColor: 'rgba(5,6,15,0.45)',
  },
  bufferPillWrap: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    zIndex: 40,
  },
  bufferPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(5,6,15,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  bufferPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  loaderTitle: {
    color: '#e50914',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 8,
  },
  loaderSubtitle: {
    color: '#ffffff',
    marginTop: 12,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  ccWrapper: {
    alignItems: 'center',
  },
  ccTrack: {
    width: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(20,22,32,0.85)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    position: 'relative',
  },
  ccFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  ccThumb: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  ccLabel: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  faceCamRow: {
    position: 'absolute',
    top: 60,
    right: 20,
    flexDirection: 'row',
    gap: 10,
    zIndex: 100,
  },
  faceCamContainer: {
    width: 140,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  faceCamView: {
    flex: 1,
  },
  faceCamLabel: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  faceCamLabelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
// Add this helper near other helpers (after parseHlsQualityOptions or similar)

export default VideoPlayerScreen;
