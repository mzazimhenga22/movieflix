import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { Audio, AVPlaybackSource, AVPlaybackStatusSuccess, InterruptionModeAndroid, InterruptionModeIOS, ResizeMode, Video } from 'expo-av';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake, isAvailableAsync } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppStateStatus } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ActivityIndicator,
    AppState,
    Alert,
    Animated,
    FlatList,
    Image,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    InteractionManager,
    View,
} from 'react-native';
import { firestore } from '../constants/firebase';
import { API_BASE_URL, API_KEY } from '../constants/api';
import { useUser } from '../hooks/use-user';
import { usePromotedProducts } from '../hooks/use-promoted-products';
import { trackPromotionClick, trackPromotionImpression } from './marketplace/api';
import { logInteraction } from '../lib/algo';
import { syncMovieMatchProfile } from '../lib/movieMatchSync';
import { buildProfileScopedKey, getStoredActiveProfile, type StoredProfile } from '../lib/profileStorage';
import { usePStream, type PStreamPlayback } from '../src/pstream/usePStream';
import type { Media } from '../types';
import { buildSourceOrder, buildScrapeDebugTag } from '../lib/videoPlaybackShared';
import { consumePrefetchedPlayback } from '../lib/videoPrefetchCache';
import { VideoMaskingOverlay } from '../lib/engineer';
import NativeAdCard from '../components/ads/NativeAdCard';
import { useSubscription } from '../providers/SubscriptionProvider';

import NewChatSheet from './messaging/components/NewChatSheet';
import {
  findOrCreateConversation,
  getFollowing as getMessagingFollowing,
  getProfileById,
  onConversationsUpdate as onMessagingConversationsUpdate,
  sendMessage as sendMessagingMessage,
  type Conversation as MessagingConversation,
  type Profile as MessagingProfile,
} from './messaging/controller';
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
type InPlayerMessageToast = {
  conversationId: string;
  fromId: string;
  fromName: string;
  text: string;
  updatedAtMs: number;
};
const CONTROLS_HIDE_DELAY_PLAYING = 10500;
const CONTROLS_HIDE_DELAY_PAUSED = 16500;
const SURFACE_DOUBLE_TAP_MS = 350;
const INTRO_DEFAULT_START_MS = 12000;
const INTRO_DEFAULT_END_MS = 90000;
const NEXT_EPISODE_WINDOW_MS = 90000;

// Fetch subtitles from multiple free sources
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
        // Parse subtitle links from HTML
        const matches = html.matchAll(/href="(\/subtitles\/[^"]+)"/g);
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
      } catch {}
      try {
        const base64 = encodedUrl.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
      } catch {}
    }
  } catch {}
  return uri;
}

type TmdbEnrichment = { imdbId?: string; releaseYear?: number; contentRating?: string; runtime?: number };
const tmdbEnrichmentCache = new Map<string, TmdbEnrichment>();

async function fetchTmdbEnrichment(
  tmdbId: string,
  mediaType: 'movie' | 'tv',
  signal?: AbortSignal,
): Promise<TmdbEnrichment> {
  const appendResponse = mediaType === 'movie' 
    ? 'external_ids,release_dates' 
    : 'external_ids,content_ratings';
  const url = `${API_BASE_URL}/${mediaType}/${tmdbId}?api_key=${API_KEY}&append_to_response=${appendResponse}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return {};
  const data: any = await res.json();

  const imdbIdRaw = data?.imdb_id ?? data?.external_ids?.imdb_id;
  const imdbId = typeof imdbIdRaw === 'string' && imdbIdRaw.trim() ? imdbIdRaw.trim() : undefined;

  const dateRaw = mediaType === 'movie' ? data?.release_date : data?.first_air_date;
  const yearRaw = typeof dateRaw === 'string' ? parseInt(dateRaw.slice(0, 4), 10) : NaN;
  const releaseYear = Number.isFinite(yearRaw) ? yearRaw : undefined;

  // Extract content rating (US preferred, fallback to any available)
  let contentRating: string | undefined;
  if (mediaType === 'movie') {
    const releaseDates = data?.release_dates?.results ?? [];
    const usRelease = releaseDates.find((r: any) => r?.iso_3166_1 === 'US');
    const certification = usRelease?.release_dates?.find((d: any) => d?.certification)?.certification;
    contentRating = certification || releaseDates[0]?.release_dates?.[0]?.certification;
  } else {
    const contentRatings = data?.content_ratings?.results ?? [];
    const usRating = contentRatings.find((r: any) => r?.iso_3166_1 === 'US');
    contentRating = usRating?.rating || contentRatings[0]?.rating;
  }

  // Extract runtime
  const runtime = typeof data?.runtime === 'number' ? data.runtime : 
                  (Array.isArray(data?.episode_run_time) && data.episode_run_time[0]) || undefined;

  return { imdbId, releaseYear, contentRating, runtime };
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
type SlidableVerticalControlProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: number;
  onValueChange: (val: number) => void;
  onInteraction?: () => void;
  height?: number;
  tintColor?: string;
};
const SlidableVerticalControl: React.FC<SlidableVerticalControlProps> = ({
  icon,
  label,
  value,
  onValueChange,
  onInteraction,
  height = 200,
  tintColor = 'rgba(229,9,20,0.55)',
}) => {
  const startValueRef = useRef(value);
  const valueRef = useRef(value);
  const fillAnim = useRef(new Animated.Value(value)).current;
  const isInteractingRef = useRef(false);
  const lastEmitTsRef = useRef(0);
  const lastEmittedValueRef = useRef(value);
  // keep latest value in a ref so handlers can read it without recreating the
  // PanResponder on every value update (prevents re-binding and improves
  // responsiveness while dragging/tapping)
  useEffect(() => {
    if (isInteractingRef.current) return;
    valueRef.current = value;
    lastEmittedValueRef.current = value;
    fillAnim.setValue(value);
  }, [value, fillAnim]);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // ✅ capture touch so the parent TouchableOpacity doesn't steal it
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          isInteractingRef.current = true;
          startValueRef.current = valueRef.current;
          onInteraction?.();
        },
        onPanResponderMove: (_evt, gesture) => {
          const delta = -gesture.dy / height;
          const next = clamp01(startValueRef.current + delta);
          valueRef.current = next;
          fillAnim.setValue(next);
          const now = Date.now();
          if (now - lastEmitTsRef.current >= 33 || Math.abs(next - lastEmittedValueRef.current) >= 0.02) {
            lastEmitTsRef.current = now;
            lastEmittedValueRef.current = next;
            onValueChange(next);
          }
        },
        // ✅ don't allow termination (prevents snap-back)
        onPanResponderTerminationRequest: () => false,
        // ✅ keep current value as new baseline
        onPanResponderRelease: () => {
          isInteractingRef.current = false;
          startValueRef.current = valueRef.current;
          if (lastEmittedValueRef.current !== valueRef.current) {
            lastEmittedValueRef.current = valueRef.current;
            onValueChange(valueRef.current);
          }
        },
        onPanResponderTerminate: () => {
          isInteractingRef.current = false;
          startValueRef.current = valueRef.current;
          if (lastEmittedValueRef.current !== valueRef.current) {
            lastEmittedValueRef.current = valueRef.current;
            onValueChange(valueRef.current);
          }
        },
      }),
    [height, onInteraction, onValueChange, fillAnim],
  );
  const fillHeight = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, height],
  });
  const thumbTravel = Math.max(24, height - 48);
  const thumbBottom = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, thumbTravel],
  });
  return (
    <View {...panResponder.panHandlers} style={styles.ccWrapper}>
      <View style={[styles.ccTrack, { height }]}>
        <Animated.View style={[styles.ccFill, { height: fillHeight, backgroundColor: tintColor }]} />
        <Animated.View style={[styles.ccThumb, { bottom: thumbBottom, backgroundColor: tintColor }]}>
          <MaterialCommunityIcons name={icon} size={22} color="#fff" />
        </Animated.View>
      </View>
      <Text style={styles.ccLabel}>{label}</Text>
    </View>
  );
};
const VideoPlayerScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
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
  const resumeMillisParam = parseNumericParam(
    typeof params.resumeMillis === 'string' ? params.resumeMillis : undefined,
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
  }, [roomCode, passedStreamType, passedVideoUrl, parsedVideoHeaders]);
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
  const keepAwakeAvailableRef = useRef<boolean | null>(null);
  const keepAwakeActiveRef = useRef(false);
  const [activeTitle, setActiveTitle] = useState(displayTitle);
  useEffect(() => {
    setActiveTitle(displayTitle);
  }, [displayTitle]);
  const [isPlaying, setIsPlaying] = useState(true);
  const lastPlayPauseIntentTsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (keepAwakeAvailableRef.current !== null) return;
      try {
        const available = await isAvailableAsync();
        if (!cancelled) keepAwakeAvailableRef.current = available;
      } catch {
        if (!cancelled) keepAwakeAvailableRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const tag = 'MovieFlixVideoPlayer';
    return () => {
      keepAwakeActiveRef.current = false;
      void deactivateKeepAwake(tag).catch(() => {});
    };
  }, []);

  const resolvePipHandlers = useCallback(() => {
    const player = videoRef.current as any;
    if (!player) return { enterPip: null, exitPip: null };
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
    return { enterPip, exitPip };
  }, []);

  const ensurePlaybackAudioMode = useCallback(async (allowBackground = false) => {
    try {
      await Audio.setIsEnabledAsync(true);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: allowBackground,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid: true,
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

      if ((nextState === 'background' || nextState === 'inactive') && pipUiEnabled) {
        if (!isPipActiveRef.current && !pipPendingRef.current && isPlayingRef.current && !midrollActiveRef.current) {
          setPipPending(true);
          if (pipPendingTimeoutRef.current) {
            clearTimeout(pipPendingTimeoutRef.current);
            pipPendingTimeoutRef.current = null;
          }
          const { enterPip } = resolvePipHandlers();
          if (enterPip) {
            void (async () => {
              await ensurePlaybackAudioMode(true);
              try {
                await enterPip();
              } catch {
                // ignore
              } finally {
                setPipPending(false);
              }
            })();
          } else {
            pipPendingTimeoutRef.current = setTimeout(() => {
              setPipPending(false);
              pipPendingTimeoutRef.current = null;
            }, 1500);
          }
        }
      }

      if (isActive) {
        if (pipPendingTimeoutRef.current) {
          clearTimeout(pipPendingTimeoutRef.current);
          pipPendingTimeoutRef.current = null;
        }
        setPipPending(false);
        if (isPipActiveRef.current) {
          const { exitPip } = resolvePipHandlers();
          if (exitPip) {
            void exitPip().catch(() => {});
          }
          setIsPipActive(false);
        }
      }

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
    return () => {
      sub.remove();
      if (pipPendingTimeoutRef.current) {
        clearTimeout(pipPendingTimeoutRef.current);
        pipPendingTimeoutRef.current = null;
      }
    };
  }, [ensurePlaybackAudioMode, pipUiEnabled, resolvePipHandlers]);

  const [showControls, setShowControls] = useState(true);
  const [controlsSession, setControlsSession] = useState(0);
  const [showContentRating, setShowContentRating] = useState(false);
  const contentRatingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSurfaceTapRef = useRef(0);
  const [positionMillis, setPositionMillis] = useState(0);
  const positionMillisRef = useRef(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const durationMillisRef = useRef(0);
  const [bufferedMillis, setBufferedMillis] = useState(0);
  const bufferedMillisRef = useRef(0);
  const [seekPosition, setSeekPosition] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [introWindow, setIntroWindow] = useState({ start: INTRO_DEFAULT_START_MS, end: INTRO_DEFAULT_END_MS });
  const [skipIntroShown, setSkipIntroShown] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [nextEpisodeProgress, setNextEpisodeProgress] = useState(0);
  const [brightness, setBrightness] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
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
    void trackPromotionImpression({ productId, placement: 'story' }).catch(() => {});
  }, [currentPlan, midrollActive, midrollProduct?.id]);
  const pendingBrightnessRef = useRef(brightness);
  const pendingVolumeRef = useRef(volume);
  const brightnessApplyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeApplyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleBrightnessApply = useCallback((value: number) => {
    pendingBrightnessRef.current = value;
    if (brightnessApplyTimeoutRef.current) return;
    brightnessApplyTimeoutRef.current = setTimeout(() => {
      brightnessApplyTimeoutRef.current = null;
      Brightness.setBrightnessAsync(pendingBrightnessRef.current).catch(() => {});
    }, 50);
  }, []);
  const scheduleVolumeApply = useCallback(() => {
    if (volumeApplyTimeoutRef.current) return;
    volumeApplyTimeoutRef.current = setTimeout(() => {
      volumeApplyTimeoutRef.current = null;
      const video = videoRef.current;
      if (!video) return;
      video.setVolumeAsync(pendingVolumeRef.current).catch(() => {});
    }, 50);
  }, []);
  useEffect(() => {
    return () => {
      if (brightnessApplyTimeoutRef.current) {
        clearTimeout(brightnessApplyTimeoutRef.current);
        brightnessApplyTimeoutRef.current = null;
      }
      if (volumeApplyTimeoutRef.current) {
        clearTimeout(volumeApplyTimeoutRef.current);
        volumeApplyTimeoutRef.current = null;
      }

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
    isPipActiveRef.current = isPipActive;
  }, [isPipActive]);

  useEffect(() => {
    pipPendingRef.current = pipPending;
  }, [pipPending]);

  useEffect(() => {
    positionMillisRef.current = positionMillis;
  }, [positionMillis]);
  useEffect(() => {
    durationMillisRef.current = durationMillis;
  }, [durationMillis]);
  const { user } = useUser();

  const uid = user?.uid ?? '';
  const quickReplySheetRef = useRef<BottomSheet | null>(null);
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  const quickReplySnapPoints = useMemo(() => ['42%', '72%'], []);

  const [messageToast, setMessageToast] = useState<InPlayerMessageToast | null>(null);
  const messageToastAnim = useRef(new Animated.Value(0)).current;
  const messageToastHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIncomingMessageKeyRef = useRef<string>('');

  const [quickReplyConversationId, setQuickReplyConversationId] = useState<string | null>(null);
  const [quickReplyTitle, setQuickReplyTitle] = useState<string>('Messages');
  const [quickReplyPreview, setQuickReplyPreview] = useState<string>('');
  const [quickReplyText, setQuickReplyText] = useState('');
  const [quickReplySending, setQuickReplySending] = useState(false);

  const [newChatVisible, setNewChatVisible] = useState(false);
  const [followingForNewChat, setFollowingForNewChat] = useState<MessagingProfile[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);

  const tsToMillis = useCallback((value: any): number | null => {
    if (!value) return null;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    if (typeof value === 'number') return value;
    return null;
  }, []);

  const isConversationUnread = useCallback(
    (conversation: MessagingConversation): boolean => {
      if (!uid) return false;

      const lastMessage = String((conversation as any)?.lastMessage ?? '').trim();
      const lastSender = String((conversation as any)?.lastMessageSenderId ?? '').trim();
      if (!lastMessage || !lastSender || lastSender === uid) return false;

      // Match messaging badge behavior: don't count incoming pending requests.
      const status = String((conversation as any)?.status ?? '').trim();
      const requestInitiatorId = String((conversation as any)?.requestInitiatorId ?? '').trim();
      if (status === 'pending' && requestInitiatorId && requestInitiatorId !== uid) return false;

      const updatedAtMs = tsToMillis((conversation as any)?.updatedAt);
      const lastReadMs = tsToMillis((conversation as any)?.lastReadAtBy?.[uid]);
      if (!updatedAtMs) return true;
      if (!lastReadMs) return true;
      return lastReadMs < updatedAtMs - 500;
    },
    [tsToMillis, uid],
  );

  const hideMessageToast = useCallback(() => {
    if (messageToastHideTimerRef.current) {
      clearTimeout(messageToastHideTimerRef.current);
      messageToastHideTimerRef.current = null;
    }

    Animated.timing(messageToastAnim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMessageToast(null);
    });
  }, [messageToastAnim]);

  const showMessageToast = useCallback(
    (next: InPlayerMessageToast) => {
      if (messageToastHideTimerRef.current) {
        clearTimeout(messageToastHideTimerRef.current);
        messageToastHideTimerRef.current = null;
      }

      setMessageToast(next);
      messageToastAnim.setValue(0);
      Animated.timing(messageToastAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();

      messageToastHideTimerRef.current = setTimeout(() => {
        hideMessageToast();
      }, 8500);
    },
    [hideMessageToast, messageToastAnim],
  );

  const openQuickReply = useCallback(
    (toast: InPlayerMessageToast) => {
      setQuickReplyConversationId(toast.conversationId);
      setQuickReplyTitle(toast.fromName ? `Message from ${toast.fromName}` : 'Message');
      setQuickReplyPreview(toast.text);
      quickReplySheetRef.current?.snapToIndex(0);
    },
    [],
  );

  const closeQuickReply = useCallback(() => {
    setQuickReplyText('');
    quickReplySheetRef.current?.close();
  }, []);

  const sendQuickReply = useCallback(async () => {
    const trimmed = quickReplyText.trim();
    if (!trimmed) return;
    if (!quickReplyConversationId) return;
    if (quickReplySending) return;

    setQuickReplySending(true);
    try {
      await sendMessagingMessage(quickReplyConversationId, { text: trimmed });
      setQuickReplyText('');
    } catch (err: any) {
      Alert.alert('Message failed', err?.message || 'Unable to send message right now.');
    } finally {
      setQuickReplySending(false);
    }
  }, [quickReplyConversationId, quickReplySending, quickReplyText]);

  const ensureFollowingLoaded = useCallback(async () => {
    if (!uid) return;
    if (followingLoading) return;
    if (followingForNewChat.length) return;
    setFollowingLoading(true);
    try {
      const list = await getMessagingFollowing();
      setFollowingForNewChat(Array.isArray(list) ? list : []);
    } catch {
      setFollowingForNewChat([]);
    } finally {
      setFollowingLoading(false);
    }
  }, [followingForNewChat.length, followingLoading, uid]);

  const openNewChat = useCallback(async () => {
    await ensureFollowingLoaded();
    setNewChatVisible(true);
  }, [ensureFollowingLoaded]);

  useEffect(() => {
    if (!uid) return;
    void ensureFollowingLoaded();
  }, [ensureFollowingLoaded, uid]);

  useEffect(() => {
    return () => {
      if (messageToastHideTimerRef.current) {
        clearTimeout(messageToastHideTimerRef.current);
        messageToastHideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const unsub = onMessagingConversationsUpdate((conversations) => {
      if (!alive) return;
      if (!Array.isArray(conversations) || !conversations.length) return;
      if (quickReplyOpen) return;

      const candidate = conversations.find((c) => isConversationUnread(c));
      if (!candidate) return;

      const updatedAtMs = tsToMillis((candidate as any)?.updatedAt) ?? Date.now();
      const key = `${candidate.id}:${updatedAtMs}`;
      if (key === lastIncomingMessageKeyRef.current) return;
      lastIncomingMessageKeyRef.current = key;

      const fromId = String((candidate as any)?.lastMessageSenderId ?? '').trim();
      const text = String((candidate as any)?.lastMessage ?? 'New message');
      if (!fromId) return;

      void (async () => {
        const profile = await getProfileById(fromId).catch(() => null);
        const fromName = profile?.displayName ? String(profile.displayName) : 'New message';
        showMessageToast({
          conversationId: candidate.id,
          fromId,
          fromName,
          text,
          updatedAtMs,
        });
      })();
    });

    return () => {
      alive = false;
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, [isConversationUnread, quickReplyOpen, showMessageToast, tsToMillis, uid]);

  const [chatMessages, setChatMessages] = useState<
    Array<{ id: string; user: string; text: string; createdAt?: any; avatar?: string | null }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [showChat, setShowChat] = useState(true);

  const watchPartyRef = useMemo(() => (roomCode ? doc(firestore, 'watchParties', roomCode) : null), [roomCode]);
  const [watchPartyHostId, setWatchPartyHostId] = useState<string | null>(null);
  const isWatchPartyHost = Boolean(roomCode && user?.uid && watchPartyHostId && user.uid === watchPartyHostId);

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
      // More frequent sync - every 500ms for smooth realtime experience
      if (!opts?.force && now - lastPlaybackPublishRef.current.ts < 500) return;
      lastPlaybackPublishRef.current = { ts: now, positionMillis: next.positionMillis, isPlaying: next.isPlaying };

      await updateDoc(watchPartyRef, {
        isOpen: true,
        playback: {
          isPlaying: next.isPlaying,
          positionMillis: Math.max(0, Math.floor(next.positionMillis)),
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
      }).catch(() => {});
    },
    [isWatchPartyHost, user?.uid, watchPartyRef],
  );

  // Publish episode change to watch party
  const publishWatchPartyEpisode = useCallback(
    async (episodeData: { seasonNumber: number; episodeNumber: number; title: string }) => {
      if (!watchPartyRef) return;
      if (!isWatchPartyHost) return;
      if (!user?.uid) return;

      await updateDoc(watchPartyRef, {
        currentEpisode: {
          seasonNumber: episodeData.seasonNumber,
          episodeNumber: episodeData.episodeNumber,
          title: episodeData.title,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
      }).catch(() => {});
    },
    [isWatchPartyHost, user?.uid, watchPartyRef],
  );

  const applyRemotePlayback = useCallback(
    async (remote: { isPlaying: boolean; positionMillis: number; updatedAtMillis: number }) => {
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
    [durationMillis, ensurePlaybackAudioMode],
  );

  useEffect(() => {
    if (!watchPartyRef) return;
    const unsub = onSnapshot(watchPartyRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const hostId = typeof data.hostId === 'string' ? data.hostId : null;
      setWatchPartyHostId(hostId);

      if (!passedVideoUrl && typeof data.videoUrl === 'string' && data.videoUrl) {
        setResolvedVideoUrl((prev) => prev ?? data.videoUrl);
      }
      if (!parsedVideoHeaders && data.videoHeaders && typeof data.videoHeaders === 'object') {
        setResolvedVideoHeaders((prev) => prev ?? (data.videoHeaders as Record<string, string>));
      }
      if (!passedStreamType && typeof data.streamType === 'string' && data.streamType) {
        setResolvedStreamType((prev) => prev ?? data.streamType);
      }

      const playback = data.playback;
      const hostNow = Boolean(user?.uid && hostId && user.uid === hostId);
      if (hostNow) return;
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

      if (playbackSourceRef.current?.uri) {
        void applyRemotePlayback(remote);
      }
    });
    return () => unsub();
  }, [applyRemotePlayback, parsedVideoHeaders, passedStreamType, passedVideoUrl, user?.uid, watchPartyRef]);

  useEffect(() => {
    if (!watchPartyRef) return;
    if (!user?.uid) return;

    void updateDoc(watchPartyRef, {
      isOpen: true,
      videoUrl: resolvedVideoUrl ?? null,
      videoHeaders: resolvedVideoHeaders ?? null,
      streamType: resolvedStreamType ?? null,
    }).catch(() => {});

    return () => {
      if (!isWatchPartyHost) return;
      void updateDoc(watchPartyRef, { isOpen: false }).catch(() => {});
    };
  }, [isWatchPartyHost, resolvedStreamType, resolvedVideoHeaders, resolvedVideoUrl, user?.uid, watchPartyRef]);

  const [videoReloadKey, setVideoReloadKey] = useState(0);
  const prefetchKey = typeof params.__prefetchKey === 'string' ? params.__prefetchKey : undefined;
  const [prefetchChecked, setPrefetchChecked] = useState(() => !prefetchKey);

  const resumeAppliedRef = useRef(false);
  useEffect(() => {
    resumeAppliedRef.current = false;
  }, [playbackSource?.uri, resumeMillisParam, tmdbId, seasonNumberParam, episodeNumberParam]);
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
  const [pipPending, setPipPending] = useState(false);
  const isPipActiveRef = useRef(false);
  const pipPendingRef = useRef(false);
  const pipPendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only show the PiP button when the underlying Video instance exposes PiP methods on iOS.
  // Android can auto-enter PiP via Home button, so keep it enabled there.
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
  const uiProgressUpdateRef = useRef<{ lastTs: number; lastPos: number }>({ lastTs: 0, lastPos: 0 });
  const autoQualityStepRef = useRef(0);
  const lastAutoDowngradeTsRef = useRef(0);
  const [avDrawerOpen, setAvDrawerOpen] = useState(false);
  const hlsWarmupRef = useRef<{ key: string; seen: Set<string> }>({ key: '', seen: new Set() });
  const triedVariantUrisRef = useRef<Set<string>>(new Set());
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
  }, [resolvedStreamType, resolvedVideoHeaders, resolvedVideoUrl]);
  useEffect(() => {
    masterPlaylistRef.current = playbackSource?.uri ?? null;
  }, [playbackSource?.uri]);
  useEffect(() => {
    setSkipIntroShown(false);
    setShowSkipIntro(false);
    setShowNextEpisode(false);
    setNextEpisodeProgress(0);
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
  const [episodesFetching, setEpisodesFetching] = useState(false);
  const nextUpEpisode = useMemo(() => episodeQueue[0], [episodeQueue]);
  const nextUpEpisodeRef = useRef<UpcomingEpisode | undefined>(nextUpEpisode);
  useEffect(() => {
    nextUpEpisodeRef.current = nextUpEpisode;
  }, [nextUpEpisode]);
  
  // Fetch upcoming episodes from TMDB if not provided (e.g., from Continue Watching)
  useEffect(() => {
    if (upcomingEpisodes.length > 0) {
      setEpisodeQueue(upcomingEpisodes);
      return;
    }
    
    // Only fetch for TV shows with season/episode info
    if (!isTvShow || !tmdbId || !transitionReady) {
      setEpisodeQueue([]);
      setEpisodeDrawerOpen(false);
      return;
    }
    
    let cancelled = false;
    const fetchEpisodesFromTmdb = async () => {
      setEpisodesFetching(true);
      try {
        // First fetch TV show details to get seasons
        const showUrl = `${API_BASE_URL}/tv/${tmdbId}?api_key=${API_KEY}`;
        const showRes = await fetch(showUrl);
        if (!showRes.ok) throw new Error('Failed to fetch TV show');
        const showData = await showRes.json();
        
        const seasons = (showData?.seasons ?? []).filter(
          (s: any) => typeof s?.season_number === 'number' && s.season_number > 0
        );
        
        if (!seasons.length || cancelled) {
          setEpisodeQueue([]);
          return;
        }
        
        // Determine current season (use param or default to 1)
        const currentSeasonNum = initialSeasonNumber ?? 1;
        const currentEpisodeNum = initialEpisodeNumber ?? 1;
        
        // Fetch current season details
        const seasonUrl = `${API_BASE_URL}/tv/${tmdbId}/season/${currentSeasonNum}?api_key=${API_KEY}`;
        const seasonRes = await fetch(seasonUrl);
        if (!seasonRes.ok) throw new Error('Failed to fetch season');
        const seasonData = await seasonRes.json();
        
        const upcoming: UpcomingEpisode[] = [];
        const episodes = seasonData?.episodes ?? [];
        
        // Add remaining episodes from current season
        episodes
          .filter((ep: any) => ep.episode_number > currentEpisodeNum)
          .forEach((ep: any) => {
            upcoming.push({
              id: ep.id,
              title: ep.name,
              seasonName: seasonData?.name ?? `Season ${currentSeasonNum}`,
              episodeNumber: ep.episode_number,
              overview: ep.overview,
              runtime: ep.runtime,
              stillPath: ep.still_path,
              seasonNumber: currentSeasonNum,
              seasonTmdbId: seasonData?.id,
              episodeTmdbId: ep.id,
              seasonEpisodeCount: episodes.length,
            });
          });
        
        // Optionally fetch next season if current is almost done
        if (upcoming.length < 5 && seasons.length > currentSeasonNum) {
          const nextSeasonNum = currentSeasonNum + 1;
          try {
            const nextSeasonUrl = `${API_BASE_URL}/tv/${tmdbId}/season/${nextSeasonNum}?api_key=${API_KEY}`;
            const nextRes = await fetch(nextSeasonUrl);
            if (nextRes.ok) {
              const nextSeasonData = await nextRes.json();
              const nextEpisodes = nextSeasonData?.episodes ?? [];
              nextEpisodes.slice(0, 10).forEach((ep: any) => {
                upcoming.push({
                  id: ep.id,
                  title: ep.name,
                  seasonName: nextSeasonData?.name ?? `Season ${nextSeasonNum}`,
                  episodeNumber: ep.episode_number,
                  overview: ep.overview,
                  runtime: ep.runtime,
                  stillPath: ep.still_path,
                  seasonNumber: nextSeasonNum,
                  seasonTmdbId: nextSeasonData?.id,
                  episodeTmdbId: ep.id,
                  seasonEpisodeCount: nextEpisodes.length,
                });
              });
            }
          } catch {
            // Ignore next season fetch errors
          }
        }
        
        if (!cancelled) {
          setEpisodeQueue(upcoming);
          if (__DEV__) {
            console.log('[VideoPlayer] Fetched upcoming episodes from TMDB:', upcoming.length);
          }
        }
      } catch (err) {
        if (__DEV__) {
          console.warn('[VideoPlayer] Failed to fetch episodes from TMDB:', err);
        }
        if (!cancelled) {
          setEpisodeQueue([]);
        }
      } finally {
        if (!cancelled) {
          setEpisodesFetching(false);
        }
      }
    };
    
    fetchEpisodesFromTmdb();
    
    return () => {
      cancelled = true;
    };
  }, [upcomingEpisodes, isTvShow, tmdbId, transitionReady, initialSeasonNumber, initialEpisodeNumber]);
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
      // Map PStreamCaption to CaptionSource format
      let mappedCaptions: CaptionSource[] = (playback.stream?.captions ?? [])
        .filter((cap: any) => cap?.url)
        .map((cap: any, idx: number) => ({
          id: cap.id || `caption-${idx}`,
          type: (cap.type === 'srt' || cap.type === 'vtt') ? cap.type : 'vtt',
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
          .catch(() => {});
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
    let isCancelled = false;
    const fetchPlaybackFromMetadata = async () => {
      const enrichedYear = tmdbEnrichment?.releaseYear;
      const fallbackYear = enrichedYear ?? releaseYear ?? new Date().getFullYear();
      const mediaTitle = displayTitle || 'Now Playing';
      const normalizedTmdbId = tmdbId || '';
      const normalizedImdbId = imdbId || tmdbEnrichment?.imdbId || undefined;
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
          console.log('[VideoPlayer] Initial TV scrape payload', payload);
          const debugTag = buildScrapeDebugTag('initial-tv', mediaTitle);
          const playback = await scrapeInitial(payload, { sourceOrder, debugTag });
          if (isCancelled) return;
          console.log('[VideoPlayer] Scrape success', { uri: playback.uri, streamType: playback.stream?.type, headers: playback.headers });
          const formattedTitle =
            episodeNumber
              ? `${mediaTitle} • S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`
              : mediaTitle;
          applyPlaybackResult(playback, { title: formattedTitle });
        } else {
          const payload = {
            type: 'movie',
            title: mediaTitle,
            tmdbId: normalizedTmdbId,
            imdbId: normalizedImdbId,
            releaseYear: fallbackYear,
          } as const;
          console.log('[VideoPlayer] Initial movie scrape payload', payload);
          const debugTag = buildScrapeDebugTag('initial-movie', mediaTitle);
          const playback = await scrapeInitial(payload, { sourceOrder, debugTag });
          if (isCancelled) return;
          applyPlaybackResult(playback, { title: mediaTitle });
        }
      } catch (err: any) {
        console.error('[VideoPlayer] Initial scrape failed', err);
        if (isCancelled) return;
        const message = err?.message || 'Unable to load this title.';
        setScrapeError(message);
        Alert.alert('Playback unavailable', message, [
          {
            text: 'Go back',
            onPress: () => router.back(),
            style: 'destructive',
          },
          {
            text: 'Stay',
            style: 'cancel',
          },
        ]);
      }
    };
    fetchPlaybackFromMetadata();
    return () => {
      isCancelled = true;
    };
  }, [
    prefetchChecked,
    playbackSource,
    tmdbId,
    rawMediaType,
    releaseYear,
    displayTitle,
    imdbId,
    tmdbEnrichment,
    seasonNumberParam,
    episodeNumberParam,
    seasonTmdbId,
    episodeTmdbId,
    seasonTitleParam,
    seasonEpisodeCountParam,
    scrapeInitial,
    router,
    sourceOrder,
    applyPlaybackResult,
  ]);
  const isHlsSource = useMemo(() => {
    const activeUri = qualityOverrideUri ?? playbackSource?.uri;
    if (!activeUri) return false;
    if (playbackSource?.streamType === 'hls') return true;
    return activeUri.toLowerCase().includes('.m3u8');
  }, [playbackSource, qualityOverrideUri]);
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
    const tag = 'MovieFlixVideoPlayer';
    const shouldKeepAwake =
      transitionReady &&
      Boolean(videoPlaybackSource) &&
      (appIsActive || isPipActive || pipPending) &&
      isPlaying &&
      !midrollActive;

    if (keepAwakeActiveRef.current === shouldKeepAwake) return;
    keepAwakeActiveRef.current = shouldKeepAwake;

    void (async () => {
      try {
        const available =
          keepAwakeAvailableRef.current ?? (keepAwakeAvailableRef.current = await isAvailableAsync());
        if (!available) return;

        if (shouldKeepAwake) {
          await activateKeepAwakeAsync(tag);
        } else {
          await deactivateKeepAwake(tag);
        }
      } catch {
        // ignore
      }
    })();
  }, [transitionReady, videoPlaybackSource, appIsActive, isPipActive, pipPending, isPlaying, midrollActive]);

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
    if (!videoPlaybackSource) return;
    if (!isPlaying || midrollActive) return;
    if (!(appIsActive || isPipActive || pipPending)) return;
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
    }, 70000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    transitionReady,
    isHlsSource,
    videoPlaybackSource,
    isPlaying,
    midrollActive,
    appIsActive,
    isPipActive,
    pipPending,
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
    if (!videoPlaybackSource) return;
    if (!isPlaying || midrollActive) return;
    if (!(appIsActive || isPipActive || pipPending)) return;
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
  }, [
    showBufferingOverlay,
    transitionReady,
    isHlsSource,
    videoPlaybackSource,
    isPlaying,
    midrollActive,
    appIsActive,
    isPipActive,
    pipPending,
    playbackSource?.uri,
    qualityOverrideUri,
    activeStreamHeaders,
  ]);
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
    } catch {}

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

// Base64 encode headers like providers-temp does
function encodeHeaders(headers: Record<string, string>): string {
  try {
    return Buffer.from(JSON.stringify(headers)).toString('base64');
  } catch {
    // Fallback if Buffer not available
    return btoa(JSON.stringify(headers));
  }
}
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
    }).catch(() => {});
  } else {
    (video as any).setStatusAsync({
      selectedAudioTrack: { type: 'system' },
    }).catch(() => {});
  }
}, [audioTrackOptions]);

  // lock orientation + setup brightness (focus-aware so the app doesn't stay landscape after leaving this screen)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let lockActive = true;

      const setup = async () => {
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          await Brightness.requestPermissionsAsync();
          const current = await Brightness.getBrightnessAsync();
          if (cancelled) return;
          pendingBrightnessRef.current = current;
          setBrightness(current);
        } catch (e) {
          console.warn('Video setup error', e);
        }
      };

      setup();

      // If the app is backgrounded from the landscape player, force portrait so we don't re-open the app in landscape.
      const sub = AppState.addEventListener('change', (state) => {
        if (!lockActive) return;
        if (state === 'background' || state === 'inactive') {
          void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        }
        if (state === 'active') {
          void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
        }
      });

      return () => {
        lockActive = false;
        cancelled = true;
        sub.remove();
        void Brightness.restoreSystemBrightnessAsync().catch(() => {});
        void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
          .catch(() => ScreenOrientation.unlockAsync().catch(() => {}));
      };
    }, []),
  );

  // auto-hide controls when playing
  useEffect(() => {
    if (isPipActive) {
      setShowControls(false);
      return;
    }
    if (!showControls || episodeDrawerOpen || isLocked) return;
    const delay = isPlaying ? CONTROLS_HIDE_DELAY_PLAYING : CONTROLS_HIDE_DELAY_PAUSED;
    const timeout = setTimeout(() => setShowControls(false), delay);
    return () => clearTimeout(timeout);
  }, [showControls, isPlaying, episodeDrawerOpen, controlsSession, isLocked, isPipActive]);

  // Track if playback has actually started (position > 0 and has duration)
  const hasPlaybackStarted = positionMillis > 500 && durationMillis > 0;
  const contentRatingShownRef = useRef(false);

  // Show content rating badge once when playback starts (not on controls hide)
  useEffect(() => {
    if (contentRatingTimeoutRef.current) {
      clearTimeout(contentRatingTimeoutRef.current);
      contentRatingTimeoutRef.current = null;
    }

    // Only show once per playback session when video actually starts playing
    if (hasPlaybackStarted && isPlaying && !contentRatingShownRef.current && !midrollActive && !isLocked) {
      contentRatingShownRef.current = true;
      setShowContentRating(true);
      // Auto-hide after 5 seconds
      contentRatingTimeoutRef.current = setTimeout(() => {
        setShowContentRating(false);
      }, 5000);
    }

    return () => {
      if (contentRatingTimeoutRef.current) {
        clearTimeout(contentRatingTimeoutRef.current);
        contentRatingTimeoutRef.current = null;
      }
    };
  }, [hasPlaybackStarted, isPlaying, midrollActive, isLocked]);

  // Reset content rating shown flag when episode/source changes
  useEffect(() => {
    contentRatingShownRef.current = false;
    setShowContentRating(false);
  }, [playbackSource?.uri]);

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
          video.playAsync().catch(() => {});
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

          if (user?.uid) {
            const profileId = activeProfile?.id ?? 'default';
            const mediaTypeForDoc = (baseEntry.media_type || normalizedMediaType || 'movie') as string;
            const docId = `${profileId}_${mediaTypeForDoc}_${String(baseEntry.id)}`;
            void setDoc(
              doc(firestore, 'users', user.uid, 'watchHistory', docId),
              {
                userId: user.uid,
                profileId,
                tmdbId: baseEntry.id,
                mediaType: mediaTypeForDoc,
                title: baseEntry.title || baseEntry.name || null,
                posterPath: baseEntry.poster_path ?? null,
                backdropPath: baseEntry.backdrop_path ?? null,
                genreIds: baseEntry.genre_ids ?? null,
                voteAverage: baseEntry.vote_average ?? null,
                seasonNumber: (baseEntry as any)?.seasonNumber ?? null,
                episodeNumber: (baseEntry as any)?.episodeNumber ?? null,
                seasonTitle: (baseEntry as any)?.seasonTitle ?? null,
                watchProgress: {
                  positionMillis: positionValue,
                  durationMillis: durationValue,
                  progress: progressValue,
                  updatedAtMs: now,
                },
                completed: true,
                completedAtMs: now,
                updatedAtMs: now,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            ).catch(() => {});
          }
          return;
        }
        const enriched: Media = {
          ...baseEntry,
          watchProgress: {
            positionMillis: positionValue,
            durationMillis: durationValue,
            progress: progressValue,
            updatedAt: now,
          },
        };
        const next = [enriched, ...filtered].slice(0, 40);
        await AsyncStorage.setItem(watchHistoryKey, JSON.stringify(next));

        if (user?.uid) {
          const profileId = activeProfile?.id ?? 'default';
          const mediaTypeForDoc = (enriched.media_type || normalizedMediaType || 'movie') as string;
          const docId = `${profileId}_${mediaTypeForDoc}_${String(enriched.id)}`;
          void setDoc(
            doc(firestore, 'users', user.uid, 'watchHistory', docId),
            {
              userId: user.uid,
              profileId,
              tmdbId: enriched.id,
              mediaType: mediaTypeForDoc,
              title: enriched.title || enriched.name || null,
              posterPath: enriched.poster_path ?? null,
              backdropPath: enriched.backdrop_path ?? null,
              genreIds: enriched.genre_ids ?? null,
              voteAverage: enriched.vote_average ?? null,
              seasonNumber: (enriched as any)?.seasonNumber ?? null,
              episodeNumber: (enriched as any)?.episodeNumber ?? null,
              seasonTitle: (enriched as any)?.seasonTitle ?? null,
              watchProgress: {
                positionMillis: positionValue,
                durationMillis: durationValue,
                progress: progressValue,
                updatedAtMs: now,
              },
              completed: false,
              updatedAtMs: now,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          ).catch(() => {});
        }
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
            void logInteraction({ 
              type: progressValue >= 0.9 ? 'watch_complete' : 'watch_partial', 
              actorId: user.uid, 
              targetId: enriched.id, 
              targetType: enriched.media_type === 'tv' ? 'tv' : 'movie',
              meta: { 
                progress: progressValue,
                genres: enriched.genre_ids,
                title: enriched.title || enriched.name
              } 
            });
          } catch {}
        }
      } catch (err) {
        console.warn('Failed to update watch history', err);
      }
    },
    [watchHistoryKey, user?.uid, user?.displayName, user?.email, activeProfile?.id, activeProfile?.name, activeProfile?.avatarColor, activeProfile?.photoURL, normalizedMediaType],
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
          .catch(() => {});
      }
    }

    // Ensure latest slider-set volume is applied once the player is ready.
    const video = videoRef.current;
    if (video) {
      video.setVolumeAsync(pendingVolumeRef.current).catch(() => {});
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
    positionMillisRef.current = currentPos;
    // detect progress: if position advanced by >300ms, update last advance timestamp
    try {
      if (typeof prevPositionRef.current === 'number') {
        if (currentPos - prevPositionRef.current > 300) {
          lastAdvanceTsRef.current = Date.now();
        }
      }
    } catch {}
    prevPositionRef.current = currentPos;
    // Show buffering overlay only when buffering persists and playback is effectively stalled
    if (bufferingNow && !isSeeking) {
      if (!bufferingOverlayTimeoutRef.current) {
        const startPos = currentPos;
        const startTs = Date.now();
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
      const lastUi = uiProgressUpdateRef.current;
      const shouldUpdateUi =
        now - lastUi.lastTs >= 250 || Math.abs(currentPosition - lastUi.lastPos) >= 1250;
      if (shouldUpdateUi) {
        uiProgressUpdateRef.current = { lastTs: now, lastPos: currentPosition };
        setSeekPosition(currentPosition);
        setPositionMillis(currentPosition);
      }
    }

    const playable = (status as any)?.playableDurationMillis;
    if (typeof playable === 'number' && Number.isFinite(playable)) {
      const nextBuffered = Math.max(currentPosition, playable);
      if (Math.abs(nextBuffered - bufferedMillisRef.current) > 1500) {
        bufferedMillisRef.current = nextBuffered;
        setBufferedMillis(nextBuffered);
      }
    }

    const derivedDuration = status.durationMillis ?? durationMillisRef.current;
    if (derivedDuration && derivedDuration > 0) {
      const introStart = Math.min(
        Math.max(INTRO_DEFAULT_START_MS, derivedDuration * 0.05),
        INTRO_DEFAULT_END_MS,
      );
      const introEnd = Math.min(INTRO_DEFAULT_END_MS, Math.max(introStart + 12000, derivedDuration * 0.22));
      if (introWindow.start !== introStart || introWindow.end !== introEnd) {
        setIntroWindow({ start: introStart, end: introEnd });
      }

      const inIntroWindow = currentPosition >= introStart && currentPosition <= introEnd;
      const canShowIntro = !skipIntroShown && inIntroWindow && !midrollActiveRef.current && !isLocked && !isSeeking;
      if (showSkipIntro !== canShowIntro) setShowSkipIntro(canShowIntro);

      const nextEp = nextUpEpisodeRef.current;
      if (isTvShow && nextEp) {
        const windowMs = Math.min(NEXT_EPISODE_WINDOW_MS, Math.max(15000, derivedDuration * 0.18));
        const windowStart = Math.max(0, derivedDuration - windowMs);
        const inWindow = currentPosition >= windowStart;
        const nextProgress = clamp01((currentPosition - windowStart) / windowMs);
        setNextEpisodeProgress(nextProgress);
        const shouldShowNext = inWindow && !midrollActiveRef.current && !isLocked && derivedDuration - currentPosition > 2000;
        if (showNextEpisode !== shouldShowNext) setShowNextEpisode(shouldShowNext);
      } else {
        if (showNextEpisode) setShowNextEpisode(false);
        if (nextEpisodeProgress !== 0) setNextEpisodeProgress(0);
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

    // Apply resume position once, when we have a stream loaded.
    if (!resumeAppliedRef.current && !isSeeking && typeof resumeMillisParam === 'number' && resumeMillisParam > 0) {
      try {
        const currentPos = status.positionMillis || 0;
        const duration = status.durationMillis;
        const desired = duration && duration > 2000
          ? Math.min(resumeMillisParam, Math.max(0, duration - 2000))
          : resumeMillisParam;

        if (currentPos + 1500 < desired) {
          resumeAppliedRef.current = true;
          (videoRef.current as any)?.setPositionAsync(desired).catch(() => {});
          setSeekPosition(desired);
        } else {
          resumeAppliedRef.current = true;
        }
      } catch {
        resumeAppliedRef.current = true;
      }
    }

    updateActiveCaption(currentPosition);
    if (typeof status.durationMillis === 'number' && Number.isFinite(status.durationMillis) && status.durationMillis > 0) {
      if (durationMillisRef.current !== status.durationMillis) {
        durationMillisRef.current = status.durationMillis;
        setDurationMillis(status.durationMillis);
      }
    }
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
      const pos = positionMillisRef.current;
      const dur = durationMillisRef.current;
      if (pos > 0 && dur > 0) void persistWatchProgress(pos, dur, { force: true });
    };
  }, [persistWatchProgress]);
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    bumpControlsLife();
    lastPlayPauseIntentTsRef.current = Date.now();

    const nextPlaying = !isPlaying;
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
  }, [bumpControlsLife, ensurePlaybackAudioMode, isPlaying, publishWatchPartyPlayback]);
  const seekBy = async (deltaMillis: number) => {
    const video = videoRef.current;
    if (!video) return;
    bumpControlsLife();
    const next = Math.max(
      0,
      Math.min(positionMillisRef.current + deltaMillis, durationMillisRef.current)
    );
    await video.setPositionAsync(next);
    positionMillisRef.current = next;
    setSeekPosition(next);

    void publishWatchPartyPlayback(
      { isPlaying: isPlayingRef.current, positionMillis: next },
      { force: true },
    );
  };
  const handleSkipIntro = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const target = Math.min(
      Math.max(introWindow.end + 1000, positionMillisRef.current),
      Math.max(0, durationMillisRef.current - 2000),
    );
    try {
      await video.setPositionAsync(target);
      setSeekPosition(target);
      positionMillisRef.current = target;
      setSkipIntroShown(true);
      setShowSkipIntro(false);
    } catch {}
  }, [introWindow.end]);
  const handleNextEpisodePill = useCallback(() => {
    const next = nextUpEpisodeRef.current;
    if (!next) return;
    const idx = episodeQueue.findIndex((ep) => ep === next || (ep.id && ep.id === next.id));
    setShowNextEpisode(false);
    setNextEpisodeProgress(0);
    setTimeout(() => {
      void handleEpisodePlay(next, idx >= 0 ? idx : 0);
    }, 0);
  }, [episodeQueue]);
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
      const items: Array<{ id: string; user: string; text: string; createdAt?: any; avatar?: string | null }> = [];
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
    if (isPipActive) return; // ignore taps in PiP
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
  }, [episodeDrawerOpen, showControls, bumpControlsLife]);
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
  const handleBrightnessChange = useCallback(
    (value: number) => {
      pendingBrightnessRef.current = value;
      setBrightness(value);
      scheduleBrightnessApply(value);
      bumpControlsLife();
    },
    [bumpControlsLife, scheduleBrightnessApply],
  );
  const handleVolumeChange = useCallback(
    (value: number) => {
      pendingVolumeRef.current = value;
      setVolume(value);
      scheduleVolumeApply();
      bumpControlsLife();
    },
    [bumpControlsLife, scheduleVolumeApply],
  );
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
    setPipPending(false);
    if (pipPendingTimeoutRef.current) {
      clearTimeout(pipPendingTimeoutRef.current);
      pipPendingTimeoutRef.current = null;
    }
  }, []);
  const handlePipToggle = useCallback(async () => {
    if (!videoRef.current) return;
    if (!pipUiEnabled) return;
    bumpControlsLife();
    const { enterPip, exitPip } = resolvePipHandlers();
    if (!enterPip && !exitPip) {
      // If PiP functions are not available, it means the platform/device doesn't support it
      // or the Video component isn't exposing the methods as expected.
      // We will let the try...catch block handle a more generic error message if enterPip() fails.
      setIsPipSupported(false);
      return;
    }
    try {
      if (!isPipActive && enterPip) {
        setPipPending(true);
        await ensurePlaybackAudioMode(true);
        await enterPip();
        setIsPipActive(true);
      } else if (isPipActive && exitPip) {
        await exitPip();
        setIsPipActive(false);
      }
    } catch (err) {
      console.warn('PiP toggle failed', err);
      Alert.alert('Picture in Picture', 'Unable to start Picture in Picture on this device/build.');
    } finally {
      setPipPending(false);
    }
  }, [isPipActive, pipUiEnabled, bumpControlsLife, resolvePipHandlers]);

  const handleQualitySelect = useCallback(
    async (option: QualityOption | null) => {
      if (!playbackSource) return;
      if (!option) {
        if (selectedQualityId === 'auto' && !qualityOverrideUri) return;
        pendingSeekAfterReloadRef.current = positionMillisRef.current;
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
        pendingSeekAfterReloadRef.current = positionMillisRef.current;
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
    [playbackSource, selectedQualityId, qualityOverrideUri, isPlaying],
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
          await AsyncStorage.setItem(key, 'off').catch(() => {});
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
        await AsyncStorage.setItem(key, captionId).catch(() => {});
      }
      const cached = captionCacheRef.current[captionId];
      if (cached) {
        captionCuesRef.current = cached;
        captionIndexRef.current = 0;
        updateActiveCaption(positionMillisRef.current, true);
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
        updateActiveCaption(positionMillisRef.current, true);
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
    [captionSources, selectedCaptionId, updateActiveCaption, bumpControlsLife],
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
  const handleEpisodePlay = async (episode: UpcomingEpisode, index: number) => {
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
  };
  const videoPipProps = useMemo(() => ({ allowsPictureInPicture: pipUiEnabled }), [pipUiEnabled]);

  const overlayPaddingStyle = useMemo(
    () => ({
      paddingTop: Math.max(18, insets.top + 10),
      paddingBottom: Math.max(18, insets.bottom + 12),
    }),
    [insets.bottom, insets.top],
  );

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
              shouldPlay={isPlaying && !midrollActive && (appIsActive || isPipActive || pipPending)}
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
          </>
        ) : (
          <View style={styles.videoFallback}>
            {shouldShowMovieFlixLoader ? null : (
              <>
                <Text style={styles.videoFallbackText}>{scrapeError ?? 'No video stream available.'}</Text>
                <TouchableOpacity style={styles.videoFallbackButton} onPress={() => router.back()}>
                  <Text style={styles.videoFallbackButtonText}>Go Back</Text>
                </TouchableOpacity>
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
        {showQualitySwitchPill ? <BufferingPill message="Switching quality…" /> : null}
        {transitionReady && videoPlaybackSource && showBufferingOverlay && !scrapeError ? (
          <BufferingPill message="Buffering…" />
        ) : null}
        {messageToast ? (
          <IncomingMessagePill
            toast={messageToast}
            anim={messageToastAnim}
            topOffset={
              showQualitySwitchPill || (transitionReady && videoPlaybackSource && showBufferingOverlay && !scrapeError)
                ? 64
                : 16
            }
            onPress={() => {
              openQuickReply(messageToast);
              hideMessageToast();
            }}
            onDismiss={hideMessageToast}
          />
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
                    void trackPromotionClick({ productId: String(midrollProduct.id), placement: 'story' }).catch(() => {});
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

        {/* Surface tap handler sits behind controls so it never steals button presses. */}
        {!isLocked && (
          <Pressable style={styles.surfacePressLayer} onPress={handleSurfacePress} />
        )}

        {/* Big paused info - shows when paused AND controls are hidden */}
        {!isPlaying && !showControls && !isLocked && !midrollActive && !isPipActive && rawOverview && (
          <View style={styles.pausedOverlay} pointerEvents="none">
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
              style={styles.pausedGradient}
            />
            <View style={[styles.pausedContent, { paddingBottom: insets.bottom + 40 }]}>
              <View style={styles.pausedBadgeRow}>
                <View style={styles.pausedBadge}>
                  <Ionicons name="pause" size={14} color="#fff" />
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
              <Text style={styles.pausedDesc} numberOfLines={4}>{rawOverview}</Text>
              <Text style={styles.pausedHint}>Tap anywhere to resume</Text>
            </View>
          </View>
        )}

        {!showControls && !isLocked && !midrollActive && !isPipActive ? (
          <Pressable style={styles.touchCatcher} onPress={handleSurfacePress} />
        ) : null}

        {/* Netflix-style content rating badge - appears when controls hide */}
        {showContentRating && !midrollActive && !isPipActive && (
          <Animated.View style={styles.contentRatingContainer}>
            <View style={styles.contentRatingBadge}>
              <View style={styles.contentRatingBox}>
                <Text style={styles.contentRatingText}>
                  {tmdbEnrichment?.contentRating || (isTvShow ? 'TV-MA' : 'PG-13')}
                </Text>
              </View>
              <View style={styles.contentRatingDivider} />
              <Text style={styles.contentRatingInfo}>
                {tmdbEnrichment?.runtime 
                  ? `${tmdbEnrichment.runtime} min${isTvShow ? ' per episode' : ''}`
                  : (isTvShow 
                    ? 'May contain violence, language, sexual content' 
                    : 'Some material may be inappropriate for children under 13')}
              </Text>
            </View>
          </Animated.View>
        )}

        {showControls && !isLocked && !isPipActive && (
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
                <TouchableOpacity
                  style={styles.roundButton}
                  onPress={() => router.back()}
                  activeOpacity={0.7}
                  delayPressIn={0}
                >
                  <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={styles.titleWrap}>
                  <Text style={styles.title}>{activeTitle}</Text>
                  {roomCode ? (
                    <Text style={styles.roomCodeBadge}>Party #{roomCode}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.topRight}>
                <TouchableOpacity style={styles.roundButton} activeOpacity={0.7} delayPressIn={0}>
                  <Ionicons name="share-outline" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.roundButton} activeOpacity={0.7} delayPressIn={0}>
                  <Ionicons name="download-outline" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.roundButton} 
                  activeOpacity={0.7}
                  delayPressIn={0}
                  onPress={() => setAvDrawerOpen(true)}
                >
                  <MaterialCommunityIcons name="cog-outline" size={20} color="#fff" />
                </TouchableOpacity>
                {roomCode ? (
                  <TouchableOpacity
                    style={styles.roundButton}
                    onPress={() => setShowChat((prev) => !prev)}
                    activeOpacity={0.7}
                    delayPressIn={0}
                  >
                    <Ionicons
                      name={showChat ? 'chatbubble' : 'chatbubble-outline'}
                      size={20}
                      color="#fff"
                    />
                  </TouchableOpacity>
                ) : null}
                {isTvShow && episodeQueue.length > 0 ? (
                  <TouchableOpacity
                    style={styles.roundButton}
                    onPress={() => setEpisodeDrawerOpen((prev) => !prev)}
                    activeOpacity={0.7}
                    delayPressIn={0}
                  >
                    <MaterialCommunityIcons name="playlist-play" size={22} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            {/* MIDDLE CONTROLS + CHAT */}
            <View style={styles.middleRow}>
              <View style={[styles.sideCluster, styles.sideClusterLeft]}>
                <View style={styles.sideRail}>
                  <SlidableVerticalControl
                    icon="white-balance-sunny"
                    label="Brightness"
                    value={brightness}
                    height={220}
                    tintColor="rgba(255,200,80,0.75)"
                    onValueChange={handleBrightnessChange}
                  />
                </View>
              </View>
              {/* Central playback controls */}
              <View style={styles.centerControlsWrap}>
                <View style={styles.centerControls}>
                  <TouchableOpacity
                    style={styles.iconCircleSmall}
                    onPress={() => seekBy(-10000)}
                    activeOpacity={0.7}
                    delayPressIn={0}
                  >
                    <Ionicons name="play-back" size={26} color="#fff" />
                    <Text style={styles.seekLabel}>10</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={togglePlayPause}
                    style={styles.iconCircle}
                    activeOpacity={0.8}
                    delayPressIn={0}
                  >
                    <Ionicons
                      name={isPlaying ? 'pause' : 'play'}
                      size={44}
                      color="#fff"
                      style={!isPlaying ? { marginLeft: 4 } : undefined}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconCircleSmall}
                    onPress={() => seekBy(10000)}
                    activeOpacity={0.7}
                    delayPressIn={0}
                  >
                    <Ionicons name="play-forward" size={26} color="#fff" />
                    <Text style={styles.seekLabel}>10</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
                    <TouchableOpacity
                      style={styles.chatSendButton}
                      onPress={handleSendChat}
                      disabled={chatSending || !chatInput.trim()}
                    >
                      <Ionicons name="send" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
                ) : (
                <View style={styles.middleRightPlaceholder} />
              )}
                <View style={[styles.sideRail, styles.rightSideRail]}>
                  <SlidableVerticalControl
                    icon="volume-high"
                    label="Volume"
                    value={volume}
                    height={220}
                    tintColor="rgba(120,130,255,0.75)"
                    onValueChange={handleVolumeChange}
                  />
                </View>
              </View>
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
                  <TouchableOpacity
                    style={styles.episodeDrawerClose}
                    onPress={() => setEpisodeDrawerOpen(false)}
                  >
                    <Ionicons name="close" size={18} color="#fff" />
                  </TouchableOpacity>
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
                      <TouchableOpacity
                        key={key}
                        style={styles.episodeDrawerCard}
                        onPress={() => handleEpisodePlay(episode, index)}
                        disabled={scrapingEpisode}
                        activeOpacity={0.85}
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
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            {avDrawerOpen && (
              <View style={styles.avDrawer}>
                <View style={styles.avDrawerHeader}>
                  <Text style={styles.avDrawerTitle}>Audio & Subtitles</Text>
                  <TouchableOpacity style={styles.avDrawerClose} onPress={() => setAvDrawerOpen(false)}>
                    <Ionicons name="close" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
                <View style={styles.avDrawerColumns}>
                  <View style={styles.avDrawerColumn}>
                    <Text style={styles.avDrawerColumnTitle}>Subtitles</Text>
                    {hasSubtitleOptions ? (
                      <ScrollView style={styles.avDrawerList} showsVerticalScrollIndicator={false}>
                        <TouchableOpacity
                          style={[
                            styles.avOptionRow,
                            selectedCaptionId === 'off' && styles.avOptionRowActive,
                          ]}
                          onPress={() => handleCaptionSelect('off')}
                        >
                          <View style={styles.avOptionIndicator}>
                            {selectedCaptionId === 'off' ? (
                              <Ionicons name="checkmark" size={16} color="#fff" />
                            ) : null}
                          </View>
                          <Text style={styles.avOptionLabel}>Off</Text>
                        </TouchableOpacity>
                        {captionSources.map((caption) => (
                          <TouchableOpacity
                            key={caption.id}
                            style={[
                              styles.avOptionRow,
                              selectedCaptionId === caption.id && styles.avOptionRowActive,
                            ]}
                            onPress={() => handleCaptionSelect(caption.id)}
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
                          </TouchableOpacity>
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
                        <TouchableOpacity
                          style={[
                            styles.avOptionRow,
                            selectedAudioKey === 'auto' && styles.avOptionRowActive,
                          ]}
                          onPress={() => handleAudioSelect(null)}
                        >
                          <View style={styles.avOptionIndicator}>
                            {selectedAudioKey === 'auto' ? (
                              <Ionicons name="checkmark" size={16} color="#fff" />
                            ) : null}
                          </View>
                          <Text style={styles.avOptionLabel}>Auto</Text>
                        </TouchableOpacity>
                        {audioTrackOptions.map((track) => (
                          <TouchableOpacity
                            key={track.id}
                            style={[
                              styles.avOptionRow,
                              selectedAudioKey === track.id && styles.avOptionRowActive,
                            ]}
                            onPress={() => handleAudioSelect(track)}
                          >
                            <View style={styles.avOptionIndicator}>
                              {selectedAudioKey === track.id ? (
                                <Ionicons name="checkmark" size={16} color="#fff" />
                              ) : null}
                            </View>
                            <Text style={styles.avOptionLabel}>
                              {track.name || track.language?.toUpperCase() || 'Audio'}
                            </Text>
                          </TouchableOpacity>
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
                        <TouchableOpacity
                          style={[
                            styles.avOptionRow,
                            selectedQualityId === 'auto' && styles.avOptionRowActive,
                          ]}
                          onPress={() => handleQualitySelect(null)}
                        >
                          <View style={styles.avOptionIndicator}>
                            {selectedQualityId === 'auto' ? (
                              <Ionicons name="checkmark" size={16} color="#fff" />
                            ) : null}
                          </View>
                          <Text style={styles.avOptionLabel}>Auto (Adaptive)</Text>
                        </TouchableOpacity>
                        {qualityOptions.map((option) => (
                          <TouchableOpacity
                            key={option.id}
                            style={[
                              styles.avOptionRow,
                              selectedQualityId === option.id && styles.avOptionRowActive,
                            ]}
                            onPress={() => handleQualitySelect(option)}
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
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    ) : (
                      <Text style={styles.avEmptyCopy}>Single quality stream</Text>
                    )}
                  </View>
                </View>
              </View>
            )}
            {(showSkipIntro || (showNextEpisode && nextUpEpisode)) && (
              <View style={styles.quickActionsRow}>
                {showSkipIntro && (
                  <TouchableOpacity
                    style={styles.skipIntroButton}
                    activeOpacity={0.9}
                    onPress={handleSkipIntro}
                  >
                    <LinearGradient
                      colors={['#e50914', '#b20710']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.skipIntroBg}
                    >
                      <Ionicons name="play-skip-forward" size={18} color="#fff" />
                      <Text style={styles.skipIntroText}>Skip intro</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
                {showNextEpisode && nextUpEpisode ? (
                  <TouchableOpacity
                    style={styles.nextEpisodeButton}
                    activeOpacity={0.9}
                    onPress={handleNextEpisodePill}
                  >
                    <LinearGradient
                      colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.55)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.nextEpisodeBg}
                    >
                      <View style={styles.nextEpisodeMeta}>
                        <Text style={styles.nextEpisodeLabel}>Next episode</Text>
                        <Text style={styles.nextEpisodeTitle} numberOfLines={1}>
                          {nextUpEpisode.title || 'Play next'}
                        </Text>
                        <View style={styles.nextEpisodeProgressTrack}>
                          <View
                            style={[styles.nextEpisodeProgressFill, { width: `${Math.round(nextEpisodeProgress * 100)}%` }]}
                          />
                        </View>
                      </View>
                      <View style={styles.nextEpisodeIconWrap}>
                        <Ionicons name="play" size={18} color="#fff" />
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : null}
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
                  </View>
                </View>
              </View>
              {/* Bottom actions */}
              <View style={styles.bottomActions}>
                <TouchableOpacity
                  style={styles.bottomButton}
                  onPress={handleRateToggle}
                  activeOpacity={0.7}
                  delayPressIn={0}
                >
                  <Ionicons name="speedometer-outline" size={20} color="#fff" />
                  <Text style={styles.bottomText}>{playbackRate.toFixed(1)}x</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bottomButton}
                  onPress={toggleLock}
                  activeOpacity={0.7}
                  delayPressIn={0}
                >
                  <Ionicons
                    name={isLocked ? 'lock-closed' : 'lock-open-outline'}
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.bottomText}>
                    {isLocked ? 'Unlock' : 'Lock'}
                  </Text>
                </TouchableOpacity>
                {pipUiEnabled ? (
                  <TouchableOpacity
                    style={styles.bottomButton}
                    onPress={handlePipToggle}
                    activeOpacity={0.7}
                    delayPressIn={0}
                  >
                    <Ionicons
                      name={isPipActive ? 'contract-outline' : 'expand-outline'}
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.bottomText}>
                      {isPipActive ? 'Exit PiP' : 'PiP'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.bottomButton, !avControlsEnabled && styles.bottomButtonDisabled]}
                  onPress={() => {
                    if (!avControlsEnabled) return;
                    bumpControlsLife();
                    setAvDrawerOpen((prev) => !prev);
                  }}
                  disabled={!avControlsEnabled}
                  activeOpacity={0.7}
                  delayPressIn={0}
                >
                  <Ionicons name="text-outline" size={20} color="#fff" />
                  <Text style={styles.bottomText}>Subs</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        {isLocked && (
          <View pointerEvents="box-none" style={styles.lockBadgeWrapper}>
            <Pressable 
              style={styles.lockBadge} 
              onPress={toggleLock}
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
            >
              <Ionicons name="lock-closed" size={18} color="#fff" />
              <View style={styles.lockBadgeTextWrap}>
                <Text style={styles.lockBadgeTitle}>Screen locked</Text>
                <Text style={styles.lockBadgeHint}>Tap to unlock</Text>
              </View>
              <Ionicons name="lock-open-outline" size={18} color="#fff" />
            </Pressable>
          </View>
        )}
        {activeCaptionText && !isPipActive ? (
          <View pointerEvents="none" style={styles.subtitleWrapper}>
            <Text style={styles.subtitleText}>{activeCaptionText}</Text>
          </View>
        ) : null}
      </View>

      <BottomSheet
        ref={quickReplySheetRef}
        index={-1}
        snapPoints={quickReplySnapPoints}
        enablePanDownToClose
        onChange={(index) => setQuickReplyOpen(index >= 0)}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            pressBehavior="close"
          />
        )}
        backgroundStyle={styles.quickReplySheetBackground}
        handleIndicatorStyle={styles.quickReplySheetHandle}
      >
        <View style={styles.quickReplySheetContent}>
          <View style={styles.quickReplySheetHeader}>
            <Text style={styles.quickReplySheetTitle} numberOfLines={1}>
              {quickReplyTitle}
            </Text>

            <View style={styles.quickReplySheetHeaderActions}>
              <TouchableOpacity onPress={() => void openNewChat()} style={styles.quickReplyIconButton}>
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={closeQuickReply} style={styles.quickReplyIconButton}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {quickReplyPreview ? (
            <Text style={styles.quickReplyPreview} numberOfLines={2}>
              {quickReplyPreview}
            </Text>
          ) : null}

          <View style={styles.quickReplyInputRow}>
            <TextInput
              value={quickReplyText}
              onChangeText={setQuickReplyText}
              placeholder="Reply…"
              placeholderTextColor="rgba(255,255,255,0.55)"
              style={styles.quickReplyInput}
              multiline
            />
            <TouchableOpacity
              onPress={() => void sendQuickReply()}
              disabled={!quickReplyConversationId || !quickReplyText.trim() || quickReplySending}
              style={[
                styles.quickReplySendButton,
                (!quickReplyConversationId || !quickReplyText.trim() || quickReplySending) &&
                  styles.quickReplySendButtonDisabled,
              ]}
            >
              {quickReplySending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.quickReplyActionsRow}>
            <TouchableOpacity
              style={styles.quickReplyAction}
              onPress={() => {
                if (!quickReplyConversationId) return;
                closeQuickReply();
                router.push((`/messaging/chat/${quickReplyConversationId}`) as any);
              }}
              disabled={!quickReplyConversationId}
            >
              <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
              <Text style={styles.quickReplyActionText}>Open chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickReplyAction} onPress={() => void openNewChat()}>
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={styles.quickReplyActionText}>New message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickReplyAction}
              onPress={() => {
                closeQuickReply();
                router.push('/messaging' as any);
              }}
            >
              <Ionicons name="mail-unread-outline" size={18} color="#fff" />
              <Text style={styles.quickReplyActionText}>Inbox</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>

      <NewChatSheet
        isVisible={newChatVisible}
        onClose={() => setNewChatVisible(false)}
        following={followingForNewChat}
        onStartChat={(person) => {
          setNewChatVisible(false);
          void (async () => {
            try {
              const conversationId = await findOrCreateConversation(person);
              setQuickReplyConversationId(conversationId);
              setQuickReplyTitle(person.displayName ? `Message ${person.displayName}` : 'Message');
              setQuickReplyPreview('');
              quickReplySheetRef.current?.snapToIndex(0);
            } catch (err: any) {
              Alert.alert('Unable to start chat', err?.message || 'Please try again.');
            }
          })();
        }}
      />
    </View>
  );
};
const MovieFlixLoader: React.FC<{ message: string; variant?: 'solid' | 'transparent' }> = ({
  message,
  variant = 'solid',
}) => {
  const scale = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.05,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 0.88,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.4,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [scale, opacity]);
  return (
    <View
      pointerEvents={variant === 'solid' ? 'auto' : 'none'}
      style={[styles.loaderOverlay, variant === 'transparent' && styles.loaderOverlayTransparent]}
    >
      <Animated.Text style={[styles.loaderTitle, { transform: [{ scale }], opacity }]}>
        MovieFlix
      </Animated.Text>
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

const IncomingMessagePill: React.FC<{
  toast: InPlayerMessageToast;
  anim: Animated.Value;
  topOffset: number;
  onPress: () => void;
  onDismiss: () => void;
}> = ({ toast, anim, topOffset, onPress, onDismiss }) => {
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] });
  return (
    <Animated.View
      style={[
        styles.messagePillWrap,
        {
          top: topOffset,
          opacity: anim,
          transform: [{ translateY }, { scale }],
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity activeOpacity={0.88} style={styles.messagePill} onPress={onPress}>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.messagePillTitle} numberOfLines={1}>
            {toast.fromName || 'New message'}
          </Text>
          <Text style={styles.messagePillText} numberOfLines={1}>
            {toast.text || 'Tap to reply'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          style={styles.messagePillDismiss}
          hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
        >
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
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
): Array<{ uri: string; duration: number | null }> {
  const lines = manifestText.split('\n').map((l) => l.trim());
  const segments: Array<{ uri: string; duration: number | null }> = [];
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
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
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#e50914',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  iconCircleSmall: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  seekLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    fontWeight: '700',
    marginTop: -2,
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
    backgroundColor: '#e50914',
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
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },
  bottomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bottomButtonDisabled: {
    opacity: 0.35,
  },
  bottomText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  pausedGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  pausedContent: {
    paddingHorizontal: 32,
  },
  pausedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  pausedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(229,9,20,0.9)',
  },
  pausedBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  pausedTime: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '600',
  },
  pausedTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 8,
  },
  pausedEpisode: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  pausedDesc: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 600,
  },
  pausedHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 24,
  },
  episodeDrawer: {
    position: 'absolute',
    top: 90,
    right: 12,
    bottom: 140,
    width: 280,
    borderRadius: 18,
    backgroundColor: 'rgba(5,6,15,0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(229,9,20,0.3)',
    padding: 14,
    shadowColor: '#e50914',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 16,
  },
  episodeDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  episodeDrawerTitle: {
    color: '#e50914',
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
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  skipIntroButton: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  skipIntroBg: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  skipIntroText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  nextEpisodeButton: {
    borderRadius: 14,
    overflow: 'hidden',
    minWidth: 180,
  },
  nextEpisodeBg: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  nextEpisodeMeta: {
    flex: 1,
  },
  nextEpisodeLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  nextEpisodeTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  nextEpisodeProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  nextEpisodeProgressFill: {
    height: '100%',
    backgroundColor: '#e50914',
  },
  nextEpisodeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(229,9,20,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e50914',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
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
  avOptionRowActive: {
    backgroundColor: 'rgba(229,9,20,0.08)',
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
    zIndex: 100,
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
  messagePillWrap: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 41,
  },
  messagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(229,9,20,0.26)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    minWidth: 260,
    maxWidth: 340,
  },
  messagePillTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  messagePillText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  messagePillDismiss: {
    marginLeft: 10,
    padding: 2,
  },
  quickReplySheetBackground: {
    backgroundColor: 'rgba(18,18,22,0.98)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  quickReplySheetHandle: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  quickReplySheetContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  quickReplySheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  quickReplySheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quickReplyIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  quickReplySheetTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
    paddingRight: 10,
  },
  quickReplyPreview: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
  quickReplyInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  quickReplyInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  quickReplySendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229,9,20,0.85)',
  },
  quickReplySendButtonDisabled: {
    opacity: 0.5,
  },
  quickReplyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
  },
  quickReplyAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    gap: 6,
  },
  quickReplyActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  loaderTitle: {
    color: '#e50914',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 6,
    textTransform: 'uppercase',
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
// Netflix-style content rating badge
contentRatingContainer: {
  position: 'absolute',
  top: 20,
  left: 0,
  zIndex: 50,
},
contentRatingBadge: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: 'rgba(0,0,0,0.75)',
  paddingVertical: 8,
  paddingLeft: 0,
  paddingRight: 16,
  borderTopRightRadius: 4,
  borderBottomRightRadius: 4,
},
contentRatingBox: {
  backgroundColor: '#fff',
  paddingHorizontal: 8,
  paddingVertical: 4,
  marginRight: 0,
},
contentRatingText: {
  color: '#000',
  fontSize: 13,
  fontWeight: '800',
  letterSpacing: 0.5,
},
contentRatingDivider: {
  width: 2,
  height: 20,
  backgroundColor: '#fff',
  marginHorizontal: 10,
},
contentRatingInfo: {
  color: 'rgba(255,255,255,0.9)',
  fontSize: 12,
  fontWeight: '500',
  maxWidth: 280,
},
});
// Add this helper near other helpers (after parseHlsQualityOptions or similar)

export default VideoPlayerScreen;
