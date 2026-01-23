import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { decode as base64Decode } from 'base-64';
import {
  Audio,
  AVPlaybackSource,
  AVPlaybackStatusSuccess,
  InterruptionModeAndroid,
  InterruptionModeIOS,
  ResizeMode,
  Video,
} from 'expo-av';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake, isAvailableAsync } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, limit } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Animated,
  Easing,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RTCView, mediaDevices, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';

// Animated section wrapper
const AnimatedSection = memo(function AnimatedSection({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
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
  }, [delay]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
});
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firestore } from '../../constants/firebase';
import { useUser } from '../../hooks/use-user';
import { useAccent } from '../components/AccentContext';
import { logInteraction } from '../../lib/algo';
import { joinWatchPartyAsParticipant, leaveWatchPartyAsParticipant, updateWatchPartyEpisode, updateWatchPartyPlayback, type WatchPartyEpisode } from '@/lib/watchparty/controller';
import { syncMovieMatchProfile } from '../../lib/movieMatchSync';
import { buildProfileScopedKey, getStoredActiveProfile, type StoredProfile } from '../../lib/profileStorage';
import { usePStream } from '../../src/pstream/usePStream';
import type { PStreamMediaPayload, QualitiesMap } from '../../src/pstream/pstream-types';
import type { Media } from '../../types';

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

function normalizeCaptions(input?: Array<{ url?: string; lang?: string; id?: string; type?: string }>): CaptionSource[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((c) => ({
      id: c.id ?? c.url ?? Math.random().toString(36).slice(2),
      type: (c.type as 'srt' | 'vtt') ?? (c.url && c.url.endsWith('.vtt') ? 'vtt' : 'srt'),
      url: c.url ?? '',
      language: c.lang ?? undefined,
      display: undefined,
    }))
    .filter((c) => c.url && typeof c.url === 'string');
}

type PlaybackSource = {
  uri: string;
  headers?: Record<string, string>;
  streamType?: string;
  captions?: CaptionSource[];
  qualities?: QualitiesMap;
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
};

type MovieSettings = {
  preferEnglishAudio: boolean;
  autoEnableCaptions: boolean;
  autoLowerQualityOnBuffer: boolean;
  autoSwitchSourceOnBuffer: boolean;
};

const DEFAULT_MOVIE_SETTINGS: MovieSettings = {
  preferEnglishAudio: true,
  autoEnableCaptions: true,
  autoLowerQualityOnBuffer: true,
  autoSwitchSourceOnBuffer: false,
};

const SOURCE_BASE_ORDER = [
  'cuevana3',
  'cinehdplus',
  'primesrc',
  'wecima',
  'tugaflix',
  'ridomovies',
  'hdrezka',
  'warezcdn',
  'insertunit',
  'soapertv',
  'autoembed',
  'myanime',
  'ee3',
  'fsharetv',
  'vidsrc',
  'zoechip',
  'mp4hydra',
  'embedsu',
  'slidemovies',
  'iosmirror',
  'iosmirrorpv',
  'vidapiclick',
  'coitus',
  'streambox',
  'nunflix',
  '8stream',
  'animeflv',
  'cinemaos',
  'nepu',
  'pirxcy',
  'vidsrcvip',
  'madplay',
  'rgshows',
  'vidify',
  'zunime',
  'vidnest',
  'animetsu',
  'lookmovie',
  'turbovid',
  'pelisplushd',
  'primewire',
  'movies4f',
  'debrid',
];

const GENERAL_PRIORITY_SOURCE_IDS = [
  'cuevana3',
  'cinehdplus',
  'primesrc',
  'zoechip',
  'vidsrc',
  'vidsrcvip',
  'warezcdn',
  'lookmovie',
  'pirxcy',
  'insertunit',
  'streambox',
  'primewire',
  'debrid',
  'movies4f',
  'movies4f',
  'hdrezka',
  'soapertv',
];

const ANIME_PRIORITY_SOURCE_IDS = ['animetsu', 'animeflv', 'zunime', 'myanime'];

const CONTROLS_HIDE_DELAY_PLAYING = 10500;
const CONTROLS_HIDE_DELAY_PAUSED = 16500;
const SURFACE_DOUBLE_TAP_MS = 350;

const DEFAULT_STREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const RGSHOWS_REFERER = 'https://www.rgshows.ru/';
const RGSHOWS_ORIGIN = 'https://www.rgshows.ru';

function getM3U8ProxyBase(): string | null {
  try {
    const env =
      (typeof process !== 'undefined' && (process.env as any)?.EXPO_PUBLIC_PSTREAM_M3U8_PROXY_URL) ||
      (typeof process !== 'undefined' && (process.env as any)?.NEXT_PUBLIC_PSTREAM_M3U8_PROXY_URL) ||
      (typeof process !== 'undefined' && (process.env as any)?.PSTREAM_M3U8_PROXY_URL) ||
      (typeof process !== 'undefined' && (process.env as any)?.M3U8_PROXY_URL);
    const normalized = typeof env === 'string' ? env.trim() : '';
    return normalized ? normalized : null;
  } catch {
    return null;
  }
}

function isM3U8ProxyUrl(uri?: string): boolean {
  if (!uri) return false;
  return uri.includes('m3u8-proxy') && uri.includes('url=');
}

function encodeBase64Url(value: string): string {
  try {
    // Prefer Buffer when available (Expo often polyfills it).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyBuffer = (globalThis as any)?.Buffer ?? (typeof Buffer !== 'undefined' ? Buffer : null);
    if (anyBuffer?.from) {
      const b64: string = anyBuffer.from(value, 'utf8').toString('base64');
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }
  } catch {
    // ignore
  }
  // Fallback (best-effort)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const btoaFn: any = (globalThis as any)?.btoa;
  const b64 = typeof btoaFn === 'function' ? btoaFn(value) : value;
  return String(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pickHlsProxyHeaders(headers?: Record<string, string>): Record<string, string> {
  const incoming = headers ?? {};
  const pick = (key: string) => incoming[key] ?? incoming[key.toLowerCase()] ?? incoming[key.toUpperCase()];
  const out: Record<string, string> = {};
  const referer = pick('referer');
  const origin = pick('origin');
  const ua = pick('user-agent');
  const accept = pick('accept');
  const acceptLang = pick('accept-language');
  if (typeof referer === 'string' && referer) out.referer = referer;
  if (typeof origin === 'string' && origin) out.origin = origin;
  if (typeof ua === 'string' && ua) out['user-agent'] = ua;
  if (typeof accept === 'string' && accept) out.accept = accept;
  if (typeof acceptLang === 'string' && acceptLang) out['accept-language'] = acceptLang;
  return out;
}

function buildM3U8ProxyUrl(uri: string, headers?: Record<string, string>): string | null {
  const base = getM3U8ProxyBase();
  if (!base) return null;
  const urlParam = encodeBase64Url(uri);
  const h = pickHlsProxyHeaders(headers);
  const hParam = Object.keys(h).length ? `&h=${encodeURIComponent(encodeBase64Url(JSON.stringify(h)))}` : '';
  return `${base}?url=${urlParam}${hParam}`;
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

  return headers;
}

function createPlaybackSource(params: {
  uri: string;
  headers?: Record<string, string>;
  streamType?: string;
  captions?: CaptionSource[];
  qualities?: QualitiesMap;
  sourceId?: string;
  embedId?: string;
}): PlaybackSource {
  const { uri, headers, streamType, captions, qualities, sourceId, embedId } = params;
  return {
    uri,
    streamType,
    captions,
    qualities,
    sourceId,
    embedId,
    headers: buildPlaybackHeaders(uri, sourceId, embedId, headers),
  };
}

const buildScrapeDebugTag = (kind: string, title: string) => (__DEV__ ? `[${kind}] ${title}` : undefined);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const normalizeLang = (lang?: string): string | undefined => {
  if (!lang) return undefined;
  const lower = lang.toLowerCase();
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('it')) return 'it';
  if (lower.startsWith('pt')) return 'pt';
  return lower.slice(0, 2);
};

// ============================================================================
// Video Host Handlers - Handle special video sources like Streamtape
// ============================================================================

type VideoHostType = 'streamtape' | 'mixdrop' | 'doodstream' | 'filemoon' | 'generic';

const getVideoHostHandler = (url: string): VideoHostType => {
  if (!url) return 'generic';
  const lower = url.toLowerCase();

  if (lower.includes('streamtape.com') || lower.includes('streamtape.to')) return 'streamtape';
  if (lower.includes('mixdrop.')) return 'mixdrop';
  if (lower.includes('dood') || lower.includes('dstream')) return 'doodstream';
  if (lower.includes('filemoon.')) return 'filemoon';

  return 'generic';
};

const resolveStreamtapeUrl = async (
  url: string,
  existingHeaders?: Record<string, string>
): Promise<{ uri: string; headers: Record<string, string> } | null> => {
  const headers: Record<string, string> = {
    'User-Agent': DEFAULT_STREAM_UA,
    'Referer': 'https://streamtape.com/',
    'Origin': 'https://streamtape.com',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    ...existingHeaders,
  };

  try {
    console.log('[Streamtape] Resolving URL with headers...');

    // Follow redirects manually to get the final video URL
    let currentUrl = url;
    let redirectCount = 0;
    const maxRedirects = 10;

    while (redirectCount < maxRedirects) {
      console.log('[Streamtape] Attempt', redirectCount + 1, 'URL:', currentUrl);

      try {
        const response = await fetch(currentUrl, {
          method: 'HEAD',
          headers,
          redirect: 'manual',
        });

        console.log('[Streamtape] Response status:', response.status);
        console.log('[Streamtape] Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));

        // Check if it's a redirect
        if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
          const location = response.headers.get('Location') || response.headers.get('location');
          if (location) {
            // Resolve relative URLs
            currentUrl = location.startsWith('http')
              ? location
              : new URL(location, currentUrl).toString();
            console.log('[Streamtape] Following redirect to:', currentUrl);
            redirectCount++;
            continue;
          }
        }

        // Check content type
        const contentType = response.headers.get('Content-Type') || response.headers.get('content-type') || '';
        console.log('[Streamtape] Final Content-Type:', contentType);

        // If we got video content, we're good
        if (
          response.status === 200 &&
          (contentType.includes('video/') ||
            contentType.includes('application/octet-stream') ||
            contentType.includes('binary/octet-stream') ||
            contentType === '')
        ) {
          console.log('[Streamtape] Successfully resolved to video URL');
          return { uri: currentUrl, headers };
        }

        // If HTML, the token might be invalid or expired
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
          console.warn('[Streamtape] Received HTML/JSON instead of video - token may be expired');

          // Try a GET request to see what's returned
          try {
            const getResponse = await fetch(currentUrl, {
              method: 'GET',
              headers: { ...headers, Range: 'bytes=0-1023' },
            });
            const text = await getResponse.text();
            console.log('[Streamtape] Response body preview:', text.substring(0, 500));

            // Check for error messages
            if (text.includes('file not found') || text.includes('File Not Found') || text.includes('deleted')) {
              console.error('[Streamtape] File not found or deleted');
              return null;
            }

            // Try to extract video URL from HTML if present
            const videoUrlMatch = text.match(/https?:\/\/[^"'\s]+?\.mp4[^"'\s]*/i);
            if (videoUrlMatch) {
              console.log('[Streamtape] Extracted video URL from HTML:', videoUrlMatch[0]);
              return { uri: videoUrlMatch[0], headers };
            }
          } catch (e) {
            console.warn('[Streamtape] Failed to analyze response:', e);
          }

          return null;
        }

        // If we got here with a 200 status, try to use the URL
        if (response.status === 200) {
          console.log('[Streamtape] Got 200 response, using URL');
          return { uri: currentUrl, headers };
        }

        // Other error status
        console.warn('[Streamtape] Unexpected status:', response.status);
        return null;

      } catch (fetchError: any) {
        console.warn('[Streamtape] Fetch error:', fetchError?.message);

        // If HEAD fails, try GET with range
        try {
          const getResponse = await fetch(currentUrl, {
            method: 'GET',
            headers: { ...headers, Range: 'bytes=0-0' },
          });

          if (getResponse.status === 200 || getResponse.status === 206) {
            const contentType = getResponse.headers.get('Content-Type') || '';
            if (contentType.includes('video/') || contentType.includes('octet-stream')) {
              console.log('[Streamtape] GET request succeeded, using URL');
              return { uri: currentUrl, headers };
            }
          }
        } catch (e) {
          console.warn('[Streamtape] GET fallback also failed:', e);
        }

        redirectCount++;
      }
    }

    console.warn('[Streamtape] Too many redirects or failed to resolve');
    return null;
  } catch (error) {
    console.error('[Streamtape] Resolution failed:', error);
    return null;
  }
};

const resolveMixdropUrl = async (
  url: string,
  existingHeaders?: Record<string, string>
): Promise<{ uri: string; headers: Record<string, string> } | null> => {
  const headers: Record<string, string> = {
    'User-Agent': DEFAULT_STREAM_UA,
    'Referer': 'https://mixdrop.co/',
    'Origin': 'https://mixdrop.co',
    ...existingHeaders,
  };

  try {
    console.log('[Mixdrop] Resolving URL...');

    // Try to get the page and extract the video URL
    const response = await fetch(url, { headers });
    const html = await response.text();

    // Look for the video source in the HTML
    const patterns = [
      /\|([a-zA-Z0-9]+)\|videocontainer\|/,
      /MDCore\.wurl\s*=\s*"([^"]+)"/,
      /source\s*:\s*"([^"]+\.mp4[^"]*)"/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let videoUrl = match[1];
        if (!videoUrl.startsWith('http')) {
          videoUrl = 'https:' + videoUrl;
        }
        console.log('[Mixdrop] Found video URL:', videoUrl);
        return { uri: videoUrl, headers };
      }
    }

    console.warn('[Mixdrop] Could not extract video URL');
    return null;
  } catch (error) {
    console.error('[Mixdrop] Resolution failed:', error);
    return null;
  }
};

const resolveGenericVideoUrl = async (
  url: string,
  existingHeaders?: Record<string, string>
): Promise<{ uri: string; headers: Record<string, string> } | null> => {
  const headers: Record<string, string> = {
    'User-Agent': DEFAULT_STREAM_UA,
    'Accept': '*/*',
    ...existingHeaders,
  };

  const lowerUrl = url.toLowerCase();
  // Many hosts block HEAD (or return HTML challenges) even when the URL is a direct media playlist/file.
  // If the URL already looks like a direct stream, let the player try it.
  if (lowerUrl.includes('.m3u8') || lowerUrl.includes('.mp4')) {
    return { uri: url, headers };
  }

  try {
    console.log('[Generic] Probing URL...');

    // Try HEAD first
    try {
      const headResponse = await fetch(url, {
        method: 'HEAD',
        headers,
      });

      const contentType = headResponse.headers.get('Content-Type') || '';
      console.log('[Generic] HEAD status:', headResponse.status, 'Content-Type:', contentType);

      if (headResponse.ok) {
        // Check if it's video content
        if (
          contentType.includes('video/') ||
          contentType.includes('application/x-mpegurl') ||
          contentType.includes('application/vnd.apple.mpegurl') ||
          contentType.includes('octet-stream') ||
          url.toLowerCase().includes('.m3u8') ||
          url.toLowerCase().includes('.mp4')
        ) {
          return { uri: url, headers };
        }
      }

      // If HTML, try to extract video URL
      if (contentType.includes('text/html')) {
        console.log('[Generic] Received HTML, trying to extract video URL...');

        const getResponse = await fetch(url, { headers });
        const body = await getResponse.text();

        if (body.trimStart().startsWith('#EXTM3U')) {
          return { uri: url, headers };
        }

        // Try various patterns to find video URLs
        const patterns = [
          /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/gi,
          /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/gi,
          /file\s*:\s*["']([^"']+)["']/gi,
          /source\s*:\s*["']([^"']+)["']/gi,
          /src\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
        ];

        for (const pattern of patterns) {
          const matches = body.matchAll(pattern);
          for (const match of matches) {
            const videoUrl = match[1] || match[0];
            if (videoUrl && (videoUrl.includes('.m3u8') || videoUrl.includes('.mp4'))) {
              console.log('[Generic] Extracted video URL:', videoUrl);
              return { uri: videoUrl, headers };
            }
          }
        }

        console.warn('[Generic] Could not extract video URL from HTML');
        return null;
      }

      // For other content types, try using the URL directly
      if (headResponse.ok) {
        return { uri: url, headers };
      }

    } catch (headError) {
      console.log('[Generic] HEAD failed, trying GET...');
    }

    // Fallback: try GET with range
    const getResponse = await fetch(url, {
      method: 'GET',
      headers: { ...headers, Range: 'bytes=0-1023' },
    });

    if (getResponse.ok || getResponse.status === 206) {
      const contentType = getResponse.headers.get('Content-Type') || '';
      if (
        contentType.includes('video/') ||
        contentType.includes('octet-stream') ||
        url.toLowerCase().includes('.m3u8') ||
        url.toLowerCase().includes('.mp4')
      ) {
        return { uri: url, headers };
      }
    }

    console.warn('[Generic] Could not verify video URL');
    return null;
  } catch (error) {
    console.error('[Generic] Resolution failed:', error);
    return null;
  }
};

// ============================================================================
// Slidable Vertical Control Component
// ============================================================================

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
  height = 180,
  tintColor = 'rgba(120,130,255,0.35)',
}) => {
  const startValueRef = useRef(0);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          startValueRef.current = valueRef.current;
          onInteraction?.();
        },
        onPanResponderMove: (_evt: any, gesture: { dy: number }) => {
          const delta = -gesture.dy / height;
          const next = clamp01(startValueRef.current + delta);
          onValueChange(next);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: () => {
          startValueRef.current = valueRef.current;
        },
        onPanResponderTerminate: () => {
          startValueRef.current = valueRef.current;
        },
      }),
    [height, onInteraction, onValueChange],
  );

  return (
    <View {...panResponder.panHandlers} style={styles.ccWrapper}>
      <View style={[styles.ccTrack, { height }]}>
        <View style={[styles.ccFill, { height: `${value * 100}%`, backgroundColor: tintColor }]} />
        <View style={styles.ccIconWrap}>
          <MaterialCommunityIcons name={icon} size={26} color="#fff" />
        </View>
      </View>
      <Text style={styles.ccLabel}>{label}</Text>
    </View>
  );
};

// ============================================================================
// Main Video Player Component
// ============================================================================

const FloatingEmoji = memo(({ emoji, x }: { emoji: string; x: number }) => {
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

const FaceCam = memo(({ stream, label, isLocal }: { stream: any; label: string; isLocal?: boolean }) => {
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

const WatchPartyPlayerScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { accentColor } = useAccent();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const appStateRef = useRef(AppState.currentState);
  const [appIsActive, setAppIsActive] = useState(appStateRef.current === 'active');
  const pendingAudioFocusRetryRef = useRef(false);
  const keepAwakeAvailableRef = useRef<boolean | null>(null);
  const keepAwakeActiveRef = useRef(false);

  // Parse route params
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

  const derivedReleaseYear = useMemo<number | undefined>(() => {
    if (typeof releaseYear === 'number') return releaseYear;
    if (rawReleaseDateParam) {
      const year = new Date(rawReleaseDateParam).getFullYear();
      return Number.isFinite(year) ? year : undefined;
    }
    return undefined;
  }, [releaseYear, rawReleaseDateParam]);

  const contentHintParam = typeof params.contentHint === 'string' ? params.contentHint : undefined;
  const preferAnimeSources = contentHintParam === 'anime';

  const headerFallbackParam = typeof params.headerFallback === 'string' ? params.headerFallback : undefined;
  const headerFallbackRequested =
    headerFallbackParam === '1' ||
    (typeof headerFallbackParam === 'string' && headerFallbackParam.toLowerCase() === 'true');

  const parseNumericParam = (value?: string) => {
    if (!value) return undefined;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const resumeMillisParam = parseNumericParam(
    typeof params.resumeMillis === 'string' ? params.resumeMillis : undefined,
  );

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

  // Parse upcoming episodes
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

  // PStream hooks
  const { loading: scrapingInitial, scrape: scrapeInitial } = usePStream();
  const { loading: scrapingEpisode, scrape: scrapeEpisode } = usePStream();
  const isFetchingStream = scrapingInitial || scrapingEpisode;

  // State
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

  const [useHotlinkHeaderFallback, setUseHotlinkHeaderFallback] = useState(() => headerFallbackRequested);
  useEffect(() => {
    setUseHotlinkHeaderFallback(headerFallbackRequested);
  }, [headerFallbackRequested]);
  const [pendingPlaybackSource, setPendingPlaybackSource] = useState<PlaybackSource | null>(null);
  const [nextSourceBusy, setNextSourceBusy] = useState(false);
  const [watchHistoryKey, setWatchHistoryKey] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<StoredProfile | null>(null);

  const [movieSettings, setMovieSettings] = useState<MovieSettings>(DEFAULT_MOVIE_SETTINGS);
  const autoRecoveryRef = useRef<{ lastAttemptAt: number }>({ lastAttemptAt: 0 });

  const videoRef = useRef<Video | null>(null);
  const [activeTitle, setActiveTitle] = useState(displayTitle);

  useEffect(() => {
    setActiveTitle(displayTitle);
  }, [displayTitle]);

  const [isPlaying, setIsPlaying] = useState(true);
  const isPlayingRef = useRef(true);
  const [showControls, setShowControls] = useState(true);
  const [controlsSession, setControlsSession] = useState(0);
  const lastSurfaceTapRef = useRef(0);

  const [positionMillis, setPositionMillis] = useState(0);
  const positionMillisRef = useRef(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [bufferedMillis, setBufferedMillis] = useState(0);
  const bufferedMillisRef = useRef(0);
  const uiProgressUpdateRef = useRef({ lastTs: 0, lastPos: 0 });
  const [seekPosition, setSeekPosition] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const [brightness, setBrightness] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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
    const tag = 'MovieFlixWatchPartyPlayer';
    return () => {
      keepAwakeActiveRef.current = false;
      void deactivateKeepAwake(tag).catch(() => {});
    };
  }, []);

  const ensurePlaybackAudioMode = useCallback(async () => {
    try {
      await Audio.setIsEnabledAsync(true);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
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

      if (isActive && pendingAudioFocusRetryRef.current) {
        pendingAudioFocusRetryRef.current = false;
        const video = videoRef.current;
        if (!video) return;
        if (!isPlayingRef.current) return;
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

  useEffect(() => {
    if (appIsActive) {
      void ensurePlaybackAudioMode();
    }
  }, [appIsActive, ensurePlaybackAudioMode]);

  useEffect(() => {
    const tag = 'MovieFlixWatchPartyPlayer';
    const available = keepAwakeAvailableRef.current;
    if (!available) return;

    const shouldKeepAwake = appIsActive && isPlaying;

    if (!shouldKeepAwake) {
      if (keepAwakeActiveRef.current) {
        keepAwakeActiveRef.current = false;
        void deactivateKeepAwake(tag).catch(() => {});
      }
      return;
    }

    if (!keepAwakeActiveRef.current) {
      keepAwakeActiveRef.current = true;
      void activateKeepAwakeAsync(tag).catch(() => {});
    }
  }, [appIsActive, isPlaying]);

  const { user } = useUser();

  const [chatMessages, setChatMessages] = useState<
    Array<{ id: string; user: string; text: string; createdAt?: any; avatar?: string | null }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [reactions, setReactions] = useState<Array<{ id: string; emoji: string; x: number }>>([]);
  const [activePoll, setActivePoll] = useState<any | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  // --- Face Cam Features (Surprise 3!) ---
  const [faceCamEnabled, setFaceCamEnabled] = useState(false);
  const [localCamStream, setLocalCamStream] = useState<any>(null);
  const [remoteCamStreams, setRemoteCamStreams] = useState<Record<string, any>>({});
  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});

  const startLocalCam = useCallback(async () => {
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 320 },
          height: { ideal: 180 },
          frameRate: { ideal: 15 },
          facingMode: 'user'
        }
      });
      setLocalCamStream(stream);
      return stream;
    } catch (err) {
      console.warn('FaceCam: Failed to start camera', err);
      return null;
    }
  }, []);

  const stopLocalCam = useCallback(() => {
    if (localCamStream) {
      localCamStream.getTracks().forEach((t: any) => t.stop());
      setLocalCamStream(null);
    }
    // Close all peer connections
    Object.values(pcsRef.current).forEach(pc => pc.close());
    pcsRef.current = {};
    setRemoteCamStreams({});
  }, [localCamStream]);

  const toggleFaceCam = useCallback(async () => {
    if (faceCamEnabled) {
      stopLocalCam();
      setFaceCamEnabled(false);
    } else {
      const stream = await startLocalCam();
      if (stream) setFaceCamEnabled(true);
    }
  }, [faceCamEnabled, startLocalCam, stopLocalCam]);

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

    if (localCamStream) {
      localCamStream.getTracks().forEach((track: any) => {
        pc.addTrack(track, localCamStream);
      });
    }

    pcsRef.current[targetUid] = pc;
    return pc;
  }, [localCamStream, roomCode, user?.uid]);

  // Signaling Effect
  useEffect(() => {
    if (!faceCamEnabled || !roomCode || !user?.uid || !localCamStream) return;

    // 1. Broadcaster Intent
    const mySignalingRef = doc(firestore, 'watchParties', roomCode, 'camSignaling', user.uid);
    void setDoc(mySignalingRef, { active: true, updatedAt: serverTimestamp() });

    // 2. Listen for Others
    const signalingCol = collection(firestore, 'watchParties', roomCode, 'camSignaling');
    const unsub = onSnapshot(signalingCol, async (snap) => {
      for (const change of snap.docChanges()) {
        const otherId = change.doc.id;
        if (otherId === user.uid) continue;

        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          if (!data.active) continue;

          // Lexicographical order to decide who is the initiator
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

    // 3. Listen for Offers/Answers
    const offersRef = collection(firestore, 'watchParties', roomCode, 'camSignaling', 'OFFERS_HUB', 'items'); // Simplified hub or per-user
    // Actually, per-user is better: camSignaling/{targetId}/offers/{senderId}
    
    return () => {
      unsub();
      void updateDoc(mySignalingRef, { active: false }).catch(() => {});
    };
  }, [faceCamEnabled, roomCode, user?.uid, localCamStream, getOrCreatePC]);

  const watchPartyRef = useMemo(() => (roomCode ? doc(firestore, 'watchParties', roomCode) : null), [roomCode]);

  // Submit poll vote
  const submitVote = useCallback(async (optionIndex: number) => {
    if (!roomCode || !user?.uid || !activePoll || hasVoted) return;
    setHasVoted(true);
    const pollRef = doc(firestore, 'watchParties', roomCode, 'polls', activePoll.id);
    await updateDoc(pollRef, {
      [`votes.${optionIndex}`]: (activePoll.votes?.[optionIndex] || 0) + 1,
    }).catch(() => setHasVoted(false));
  }, [roomCode, user?.uid, activePoll, hasVoted]);

  // Listen for active polls
  useEffect(() => {
    if (!roomCode) return;
    const pollsRef = collection(firestore, 'watchParties', roomCode, 'polls');
    const q = query(pollsRef, orderBy('createdAt', 'desc'), limit(1));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const poll = { id: snap.docs[0].id, ...snap.docs[0].data() as any };
        const age = Date.now() - (poll.createdAt?.toMillis?.() ?? Date.now());
        if (age < 120000) { // Poll active for 2 mins
          setActivePoll(poll);
          setHasVoted(false);
        } else {
          setActivePoll(null);
        }
      }
    });
    return () => unsub();
  }, [roomCode]);

  // Reaction broadcaster
  const sendReaction = useCallback(async (emoji: string) => {
    if (!roomCode || !user?.uid) return;
    const reactionsRef = collection(firestore, 'watchParties', roomCode, 'reactions');
    await addDoc(reactionsRef, {
      emoji,
      userId: user.uid,
      x: Math.random() * 0.8 + 0.1, // 10% to 90% width
      createdAt: serverTimestamp(),
    });
  }, [roomCode, user?.uid]);

  // Listen for reactions
  useEffect(() => {
    if (!roomCode) return;
    const reactionsRef = collection(firestore, 'watchParties', roomCode, 'reactions');
    const q = query(reactionsRef, orderBy('createdAt', 'asc'));
    
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const id = change.doc.id;
          // Only process new reactions (within last 5 seconds to avoid backlog burst)
          const createdAt = data.createdAt?.toMillis?.() ?? Date.now();
          if (Date.now() - createdAt < 5000) {
            setReactions(prev => [...prev, { id, emoji: data.emoji, x: data.x }]);
            // Auto-remove after animation
            setTimeout(() => {
              setReactions(prev => prev.filter(r => r.id !== id));
            }, 4000);
          }
        }
      });
    });
    return () => unsub();
  }, [roomCode]);

  const [watchPartyHostId, setWatchPartyHostId] = useState<string | null>(null);
  const isWatchPartyHost = Boolean(roomCode && user?.uid && watchPartyHostId && user.uid === watchPartyHostId);
  const [watchPartyParticipantsCount, setWatchPartyParticipantsCount] = useState<number>(0);
  const joinedAsParticipantRef = useRef(false);
  const didClosePartyOnFinishRef = useRef(false);

  useEffect(() => {
    joinedAsParticipantRef.current = false;
    didClosePartyOnFinishRef.current = false;
    setWatchPartyParticipantsCount(0);
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) return;
    if (!user?.uid) return;

    let cancelled = false;
    const participantsRef = collection(firestore, 'watchParties', roomCode, 'participants');
    const q = query(participantsRef, orderBy('joinedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (cancelled) return;
        setWatchPartyParticipantsCount(snap.size);
      },
      () => {
        if (cancelled) return;
        setWatchPartyParticipantsCount(0);
      },
    );

    if (!joinedAsParticipantRef.current) {
      joinedAsParticipantRef.current = true;
      void (async () => {
        try {
          const { status } = await joinWatchPartyAsParticipant({
            code: roomCode,
            userId: user.uid,
            displayName: (user as any)?.displayName ?? null,
            avatarUrl: (user as any)?.photoURL ?? null,
          });

          if (cancelled) return;

          if (status === 'expired') {
            Alert.alert('Party expired', 'This watch party has expired. Ask the host to create a new one.');
            router.back();
          } else if (status === 'closed') {
            Alert.alert('Waiting for host', 'The host has not opened this watch party yet.');
            router.back();
          } else if (status === 'full') {
            Alert.alert('Party is full', 'This watch party has reached the room limit.');
            router.back();
          } else if (status === 'not_found') {
            Alert.alert('Invalid code', 'We couldn’t find a watch party with that code.');
            router.back();
          }
        } catch {
          // ignore (offline / rules)
        }
      })();
    }

    return () => {
      cancelled = true;
      unsub();
      void leaveWatchPartyAsParticipant({ code: roomCode, userId: user.uid }).catch(() => {});
    };
  }, [roomCode, router, user]);

  const playbackSourceRef = useRef<PlaybackSource | null>(playbackSource);
  useEffect(() => {
    playbackSourceRef.current = playbackSource;
  }, [playbackSource]);

  const applyingRemotePlaybackRef = useRef(false);
  const pendingRemotePlaybackRef = useRef<{
    isPlaying: boolean;
    positionMillis: number;
    updatedAtMillis: number;
  } | null>(null);
  const lastRemoteUpdatedAtRef = useRef(0);
  const lastRemoteEpisodeUpdatedAtRef = useRef(0);
  const lastPlaybackPublishRef = useRef({ ts: 0, positionMillis: 0, isPlaying: false });

  // Sync every 400ms for smoother playback synchronization
  const SYNC_INTERVAL_MS = 400;

  const publishWatchPartyPlayback = useCallback(
    async (next: { isPlaying: boolean; positionMillis: number }, opts?: { force?: boolean }) => {
      if (!roomCode) return;
      if (!isWatchPartyHost) return;
      if (!user?.uid) return;

      const now = Date.now();
      if (!opts?.force && now - lastPlaybackPublishRef.current.ts < SYNC_INTERVAL_MS) return;
      lastPlaybackPublishRef.current = { ts: now, positionMillis: next.positionMillis, isPlaying: next.isPlaying };

      await updateWatchPartyPlayback(roomCode, next, user.uid).catch(() => {});
    },
    [isWatchPartyHost, user?.uid, roomCode],
  );

  // Publish episode change to watch party (host only)
  const publishWatchPartyEpisode = useCallback(
    async (episode: Omit<WatchPartyEpisode, 'updatedAt'>) => {
      if (!roomCode) return;
      if (!isWatchPartyHost) return;

      await updateWatchPartyEpisode(roomCode, episode).catch(() => {});
    },
    [isWatchPartyHost, roomCode],
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
    [durationMillis],
  );

  // State for current episode in watch party (for guests to sync)
  const [currentWatchPartyEpisode, setCurrentWatchPartyEpisode] = useState<WatchPartyEpisode | null>(null);

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
        const releaseYearForScrape = derivedReleaseYear ?? new Date().getFullYear();
        const payload = {
          type: 'show' as const,
          title: displayTitle,
          tmdbId: tmdbId,
          imdbId: imdbId || undefined,
          releaseYear: releaseYearForScrape,
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

        console.log('[WatchParty Guest] Scraping synced episode', payload);
        const playback = await scrapeEpisode(payload);

        if (isCancelled) return;
        if (!playback.uri) throw new Error('Playback URI missing');

        const newTitle = `S${seasonNumber}:E${episodeNumber} - ${displayTitle}`;
        setActiveTitle(newTitle);

        setPendingPlaybackSource(
          createPlaybackSource({
            uri: playback.uri as string,
            headers: {
              ...(playback.headers as Record<string, string> | undefined),
              ...(playback.stream?.preferredHeaders as Record<string, string> | undefined),
            },
            streamType: playback.stream?.type,
            captions: normalizeCaptions(playback.stream?.captions as any),
            qualities: ((playback.stream as any)?.qualities as QualitiesMap | undefined) ?? undefined,
            sourceId: playback.sourceId,
            embedId: playback.embedId,
          }),
        );
      } catch (err) {
        console.error('[WatchParty Guest] Failed to load synced episode', err);
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
    derivedReleaseYear,
    seasonNumberParam,
    episodeNumberParam,
    scrapeEpisode,
  ]);

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

  const resumeAppliedRef = useRef(false);
  useEffect(() => {
    resumeAppliedRef.current = false;
  }, [playbackSource?.uri, resumeMillisParam, tmdbId, seasonNumberParam, episodeNumberParam]);

  useEffect(() => {
    bufferedMillisRef.current = 0;
    setBufferedMillis(0);
  }, [videoReloadKey]);

  // Watch history entry
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

  // Caption state
  const [captionSources, setCaptionSources] = useState<CaptionSource[]>([]);
  const captionCacheRef = useRef<Record<string, CaptionCue[]>>({});
  const captionCuesRef = useRef<CaptionCue[]>([]);
  const captionIndexRef = useRef(0);
  const masterPlaylistRef = useRef<string | null>(null);

  const [selectedCaptionId, setSelectedCaptionId] = useState<'off' | string>('off');
  const [captionLoadingId, setCaptionLoadingId] = useState<string | null>(null);
  const [activeCaptionText, setActiveCaptionText] = useState<string | null>(null);

  const [isLocked, setIsLocked] = useState(false);
  const [isMini, setIsMini] = useState(false);

  const layout = useMemo(() => {
    const sideRailWidth = Math.min(96, Math.max(72, Math.round(windowWidth * 0.12)));
    const chatPanelWidth = Math.min(240, Math.max(160, Math.round(windowWidth * 0.28)));
    const chatPanelHeight = Math.min(160, Math.max(110, Math.round(windowHeight * 0.42)));
    const episodeDrawerWidth = Math.min(320, Math.max(220, Math.round(windowWidth * 0.36)));
    const episodeDrawerTop = Math.min(90, Math.max(12, Math.round(windowHeight * 0.12)));
    const episodeDrawerBottom = Math.min(140, Math.max(12, Math.round(windowHeight * 0.18)));

    return {
      sideRailWidth,
      chatPanelWidth,
      chatPanelHeight,
      episodeDrawerWidth,
      episodeDrawerTop,
      episodeDrawerBottom,
    };
  }, [windowWidth, windowHeight]);

  const captionPreferenceKeyRef = useRef<string | null>(null);

  // Audio and quality state
  const [audioTrackOptions, setAudioTrackOptions] = useState<AudioTrackOption[]>([]);
  const [selectedAudioKey, setSelectedAudioKey] = useState<string>('auto');
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const qualityOptionsRef = useRef<QualityOption[]>([]);
  const [selectedQualityId, setSelectedQualityId] = useState<string>('auto');
  const [qualityOverrideUri, setQualityOverrideUri] = useState<string | null>(null);
  const [qualityLoadingId, setQualityLoadingId] = useState<string | null>(null);
  const autoQualityStepRef = useRef(0);
  const lastAutoDowngradeTsRef = useRef(0);

  const pendingSeekAfterReloadRef = useRef<number | null>(null);
  const pendingShouldPlayAfterReloadRef = useRef<boolean | null>(null);

  // Buffering state
  const [showBufferingOverlay, setShowBufferingOverlay] = useState(false);
  const bufferingOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDowngradeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPositionRef = useRef<number>(0);
  const lastAdvanceTsRef = useRef<number>(Date.now());
  const statusLogRef = useRef<{ lastTs: number; lastKey: string }>({ lastTs: 0, lastKey: '' });
  const lastPlayPauseIntentTsRef = useRef(0);

  const hlsProxyRetryRef = useRef(false);
  const hlsVariantRetryRef = useRef(false);
  const triedVariantUrisRef = useRef<Set<string>>(new Set());
  const hlsWarmupRef = useRef<{ key: string; seen: Set<string> }>({ key: '', seen: new Set() });

  // Stream preloading state (best-effort). This doesn't guarantee the native player will reuse
  // fetched bytes, but it helps warm DNS/TLS and some CDNs/hosts.
  const streamPreloadRef = useRef<{ key: string; lastRunAt: number; seen: Set<string> }>({
    key: '',
    lastRunAt: 0,
    seen: new Set<string>(),
  });

  // AV drawer state
  const [avDrawerOpen, setAvDrawerOpen] = useState(false);

  // Manual URL input state
  const [manualUrlInput, setManualUrlInput] = useState('');

  // Keep watch entry ref updated
  useEffect(() => {
    watchEntryRef.current = watchHistoryEntry;
  }, [watchHistoryEntry]);

  // Cleanup buffering timeout on unmount
  useEffect(() => {
    return () => {
      if (bufferingOverlayTimeoutRef.current) {
        clearTimeout(bufferingOverlayTimeoutRef.current);
        bufferingOverlayTimeoutRef.current = null;
      }
      if (autoDowngradeTimeoutRef.current) {
        clearTimeout(autoDowngradeTimeoutRef.current);
        autoDowngradeTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    positionMillisRef.current = positionMillis;
  }, [positionMillis]);

  useEffect(() => {
    qualityOptionsRef.current = qualityOptions;
  }, [qualityOptions]);

  const bumpControlsLife = useCallback(() => setControlsSession(prev => prev + 1), []);

  const sourceOrder = useMemo(() => buildSourceOrder(preferAnimeSources), [preferAnimeSources]);

  // Caption update callback
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

  // Reset state when video URL changes
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
    autoQualityStepRef.current = 0;
    lastAutoDowngradeTsRef.current = 0;
    hlsProxyRetryRef.current = false;
    hlsVariantRetryRef.current = false;
    setVideoReloadKey((prev) => prev + 1);
  }, [resolvedStreamType, resolvedVideoHeaders, resolvedVideoUrl]);

  // Update master playlist ref
  useEffect(() => {
    masterPlaylistRef.current = playbackSource?.uri ?? null;
  }, [playbackSource?.uri]);

  // Sync history key
  useEffect(() => {
    let active = true;
    const syncHistoryKey = async () => {
      try {
        const profile = await getStoredActiveProfile();
        if (!active) return;
        setActiveProfile(profile ?? null);
        setWatchHistoryKey(buildProfileScopedKey('watchHistory', profile?.id ?? undefined));
        captionPreferenceKeyRef.current = buildProfileScopedKey('preferredCaptionTrack', profile?.id ?? undefined);

        const parseBool = (raw: string | null, fallback: boolean) => {
          if (raw == null) return fallback;
          try {
            const parsed = JSON.parse(raw);
            return typeof parsed === 'boolean' ? parsed : fallback;
          } catch {
            if (raw === 'true') return true;
            if (raw === 'false') return false;
            return fallback;
          }
        };

        const preferEnglishAudioKey = buildProfileScopedKey(
          'movieSettings:preferEnglishAudio',
          profile?.id ?? undefined,
        );
        const autoEnableCaptionsKey = buildProfileScopedKey(
          'movieSettings:autoEnableCaptions',
          profile?.id ?? undefined,
        );
        const autoLowerQualityOnBufferKey = buildProfileScopedKey(
          'movieSettings:autoLowerQualityOnBuffer',
          profile?.id ?? undefined,
        );
        const autoSwitchSourceOnBufferKey = buildProfileScopedKey(
          'movieSettings:autoSwitchSourceOnBuffer',
          profile?.id ?? undefined,
        );

        const [rawPreferEnglishAudio, rawAutoCaptions, rawAutoLowerQuality, rawAutoSwitch] = await Promise.all([
          AsyncStorage.getItem(preferEnglishAudioKey).catch(() => null),
          AsyncStorage.getItem(autoEnableCaptionsKey).catch(() => null),
          AsyncStorage.getItem(autoLowerQualityOnBufferKey).catch(() => null),
          AsyncStorage.getItem(autoSwitchSourceOnBufferKey).catch(() => null),
        ]);

        if (!active) return;
        setMovieSettings({
          preferEnglishAudio: parseBool(rawPreferEnglishAudio, DEFAULT_MOVIE_SETTINGS.preferEnglishAudio),
          autoEnableCaptions: parseBool(rawAutoCaptions, DEFAULT_MOVIE_SETTINGS.autoEnableCaptions),
          autoLowerQualityOnBuffer: parseBool(rawAutoLowerQuality, DEFAULT_MOVIE_SETTINGS.autoLowerQualityOnBuffer),
          autoSwitchSourceOnBuffer: parseBool(rawAutoSwitch, DEFAULT_MOVIE_SETTINGS.autoSwitchSourceOnBuffer),
        });
      } catch {
        if (active) {
          setActiveProfile(null);
          setWatchHistoryKey('watchHistory');
          captionPreferenceKeyRef.current = 'preferredCaptionTrack';
          setMovieSettings(DEFAULT_MOVIE_SETTINGS);
        }
      }
    };
    syncHistoryKey();
    return () => {
      active = false;
    };
  }, []);

  // Episode queue state
  const [episodeQueue, setEpisodeQueue] = useState(upcomingEpisodes);

  const lastInitialScrapeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setEpisodeQueue(upcomingEpisodes);
    if (!upcomingEpisodes.length) {
      setEpisodeDrawerOpen(false);
    }
  }, [upcomingEpisodes]);

  // Initial stream fetch
  useEffect(() => {
    if (playbackSource || !tmdbId || !rawMediaType) return;

    const releaseYearForScrape = derivedReleaseYear ?? new Date().getFullYear();
    const mediaTitle = displayTitle || 'Now Playing';
    const normalizedTmdbId = tmdbId || '';
    const normalizedImdbId = imdbId || undefined;
    const seasonNumber = Number.isFinite(seasonNumberParam) ? (seasonNumberParam as number) : 1;
    const episodeNumber = Number.isFinite(episodeNumberParam) ? (episodeNumberParam as number) : 1;
    const seasonTitle = seasonTitleParam || `Season ${seasonNumber}`;
    const baseEpisodeCount =
      typeof seasonEpisodeCountParam === 'number' && seasonEpisodeCountParam > 0
        ? seasonEpisodeCountParam
        : undefined;

    const scrapeKey =
      rawMediaType === 'tv'
        ? `show:${normalizedTmdbId}:s${seasonNumber}:e${episodeNumber}`
        : `movie:${normalizedTmdbId}`;

    if (lastInitialScrapeKeyRef.current === scrapeKey) return;
    lastInitialScrapeKeyRef.current = scrapeKey;
    let isCancelled = false;

    const fetchPlaybackFromMetadata = async () => {
      try {
        setScrapeError(null);

        if (rawMediaType === 'tv') {
          const payload = {
            type: 'show',
            title: mediaTitle,
            tmdbId: normalizedTmdbId,
            imdbId: normalizedImdbId,
            releaseYear: releaseYearForScrape,
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
          console.log('[VideoPlayer] Scrape success', {
            uri: playback.uri,
            streamType: playback.stream?.type,
            headers: playback.headers
          });

          if (!playback.uri) throw new Error('Playback URI missing');

          setPendingPlaybackSource(
            createPlaybackSource({
              uri: playback.uri as string,
              headers: {
                ...(playback.headers as Record<string, string> | undefined),
                ...(playback.stream?.preferredHeaders as Record<string, string> | undefined),
              },
              streamType: playback.stream?.type,
              captions: normalizeCaptions(playback.stream?.captions as any),
              qualities: ((playback.stream as any)?.qualities as QualitiesMap | undefined) ?? undefined,
              sourceId: playback.sourceId,
              embedId: playback.embedId,
            }),
          );
        } else {
          const payload = {
            type: 'movie',
            title: mediaTitle,
            tmdbId: normalizedTmdbId,
            imdbId: normalizedImdbId,
            releaseYear: releaseYearForScrape,
          } as const;

          console.log('[VideoPlayer] Initial movie scrape payload', payload);
          const debugTag = buildScrapeDebugTag('initial-movie', mediaTitle);
          const playback = await scrapeInitial(payload, { sourceOrder, debugTag });

          if (isCancelled) return;
          if (!playback.uri) throw new Error('Playback URI missing');

          setPendingPlaybackSource(
            createPlaybackSource({
              uri: playback.uri as string,
              headers: {
                ...(playback.headers as Record<string, string> | undefined),
                ...(playback.stream?.preferredHeaders as Record<string, string> | undefined),
              },
              streamType: playback.stream?.type,
              captions: normalizeCaptions(playback.stream?.captions as any),
              qualities: ((playback.stream as any)?.qualities as QualitiesMap | undefined) ?? undefined,
              sourceId: playback.sourceId,
              embedId: playback.embedId,
            }),
          );
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
    playbackSource,
    tmdbId,
    rawMediaType,
    derivedReleaseYear,
    displayTitle,
    imdbId,
    seasonNumberParam,
    episodeNumberParam,
    seasonTmdbId,
    episodeTmdbId,
    seasonTitleParam,
    seasonEpisodeCountParam,
    scrapeInitial,
    router,
    sourceOrder,
  ]);

  // Check if HLS source
  const isHlsSource = useMemo(() => {
    const activeUri = qualityOverrideUri ?? playbackSource?.uri;
    if (!activeUri) return false;
    if (playbackSource?.streamType === 'hls') return true;
    return activeUri.toLowerCase().includes('.m3u8');
  }, [playbackSource, qualityOverrideUri]);

  // Video playback source
  const videoPlaybackSource: AVPlaybackSource | null = useMemo(() => {
    if (!playbackSource) return null;
    const uri = qualityOverrideUri ?? playbackSource.uri;

    const shouldForceHls = isHlsSource || playbackSource.streamType === 'hls';
    const shouldForceMp4 = !shouldForceHls && playbackSource.streamType === 'file';

    // Build headers with proper referers for known hosts
    const headers: Record<string, string> = {
      'User-Agent': DEFAULT_STREAM_UA,
      ...(playbackSource.headers || {}),
    };

    const applyKnownHostHeaders = (type: string) => {
      if (type === 'streamtape') {
        headers['Referer'] = headers['Referer'] || 'https://streamtape.com/';
        headers['Origin'] = headers['Origin'] || 'https://streamtape.com';
        return;
      }
      if (type === 'mixdrop') {
        headers['Referer'] = headers['Referer'] || 'https://mixdrop.co/';
        headers['Origin'] = headers['Origin'] || 'https://mixdrop.co';
        return;
      }
      if (type === 'filemoon') {
        headers['Referer'] = headers['Referer'] || 'https://filemoon.sx/';
      }
    };

    // Primary detection from the active URI.
    const hostType = getVideoHostHandler(uri);
    applyKnownHostHeaders(hostType);

    // Optional fallback: if the URI is a proxy (generic host), use embedId hint for hotlink headers.
    if (useHotlinkHeaderFallback && hostType === 'generic') {
      const hint = playbackSource.embedId;
      if (hint === 'streamtape' || hint === 'mixdrop' || hint === 'filemoon') {
        applyKnownHostHeaders(hint);
      }
    }

    return {
      uri,
      headers,
      ...(shouldForceHls ? { overrideFileExtensionAndroid: 'm3u8' } : null),
      ...(shouldForceMp4 ? { overrideFileExtensionAndroid: 'mp4' } : null),
    };
  }, [playbackSource, qualityOverrideUri, isHlsSource, useHotlinkHeaderFallback]);

  const activeStreamUri = videoPlaybackSource?.uri;
  const activeStreamHeaders = useMemo<Record<string, string>>(() => {
    const fromPlaybackSource = (playbackSource?.headers as Record<string, string> | undefined) ?? {};
    const fromVideoPlaybackSource = (videoPlaybackSource as any)?.headers as Record<string, string> | undefined;
    return { ...fromPlaybackSource, ...(fromVideoPlaybackSource ?? {}) };
  }, [playbackSource?.headers, videoPlaybackSource]);

  const getSortedQualityOptions = useCallback(() => {
    const options = qualityOptionsRef.current ?? [];
    return [...options]
      .filter((o) => o && o.uri)
      .sort((a, b) => {
        const bwA = typeof a.bandwidth === 'number' ? a.bandwidth : -1;
        const bwB = typeof b.bandwidth === 'number' ? b.bandwidth : -1;
        if (bwA !== bwB) return bwB - bwA;
        return (b.resolution ?? '').localeCompare(a.resolution ?? '');
      });
  }, []);

  const maybeAutoDowngradeQuality = useCallback(
    async (reason: 'stall' | 'error') => {
      if (!movieSettings.autoLowerQualityOnBuffer) return;
      if (!isHlsSource) return;
      if (!playbackSource?.headers) return;
      if (qualityLoadingId) return;
      if (selectedQualityId !== 'auto') return;

      const now = Date.now();
      if (now - lastAutoDowngradeTsRef.current < 25_000) return;

      const sorted = getSortedQualityOptions();
      if (sorted.length < 2) return;

      const currentUri = qualityOverrideUri;
      let idx = 0;
      if (currentUri) {
        const found = sorted.findIndex((o) => o.uri === currentUri);
        if (found >= 0) idx = found;
      } else {
        idx = autoQualityStepRef.current;
      }

      const nextIdx = Math.min(sorted.length - 1, Math.max(0, idx + 1));
      const next = sorted[nextIdx];
      if (!next?.uri) return;
      if (next.uri === currentUri) return;

      try {
        if (__DEV__) {
          console.log('[WatchParty] Auto-downgrading quality', {
            reason,
            from: currentUri ?? 'auto',
            to: next.resolution ?? next.label,
            toBw: next.bandwidth,
          });
        }
        await preloadQualityVariant(next.uri, playbackSource.headers);
        autoQualityStepRef.current = nextIdx;
        lastAutoDowngradeTsRef.current = now;
        pendingSeekAfterReloadRef.current = positionMillisRef.current;
        pendingShouldPlayAfterReloadRef.current = isPlaying;
        setQualityOverrideUri(next.uri);
        setVideoReloadKey((prev) => prev + 1);
      } catch (err) {
        if (__DEV__) {
          console.warn('[WatchParty] Auto-downgrade preload failed', err);
        }
      }
    },
    [
      getSortedQualityOptions,
      isHlsSource,
      isPlaying,
      movieSettings.autoLowerQualityOnBuffer,
      playbackSource?.headers,
      qualityLoadingId,
      qualityOverrideUri,
      selectedQualityId,
    ],
  );

  const handleVideoLoad = useCallback(() => {
    const seekTo = pendingSeekAfterReloadRef.current;
    if (typeof seekTo === 'number' && Number.isFinite(seekTo) && seekTo > 0) {
      const shouldPlayAfter = pendingShouldPlayAfterReloadRef.current;
      pendingSeekAfterReloadRef.current = null;
      pendingShouldPlayAfterReloadRef.current = null;

      const video = videoRef.current;
      if (video) {
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

    const pendingRemote = pendingRemotePlaybackRef.current;
    if (pendingRemote) {
      void applyRemotePlayback(pendingRemote);
    }
  }, [applyRemotePlayback]);

  // ============================================================================
  // FIXED: Probe the playback source properly for different video hosts
  // ============================================================================
  useEffect(() => {
    let cancelled = false;

    const probe = async (pending: PlaybackSource | null) => {
      if (!pending?.uri) return;

      const { uri, headers: existingHeaders, captions } = pending;
      const hostType = getVideoHostHandler(uri);

      console.log('[VideoPlayer] Probing URI:', uri);
      console.log('[VideoPlayer] Host type:', hostType);

      try {
        let resolvedSource: { uri: string; headers: Record<string, string> } | null = null;

        // Handle different video hosts
        switch (hostType) {
          case 'streamtape':
            console.log('[VideoPlayer] Handling Streamtape URL...');
            resolvedSource = await resolveStreamtapeUrl(uri, existingHeaders as Record<string, string>);
            break;

          case 'mixdrop':
            console.log('[VideoPlayer] Handling Mixdrop URL...');
            resolvedSource = await resolveMixdropUrl(uri, existingHeaders as Record<string, string>);
            break;

          case 'doodstream':
          case 'filemoon':
          case 'generic':
          default:
            console.log('[VideoPlayer] Handling generic URL...');
            resolvedSource = await resolveGenericVideoUrl(uri, existingHeaders as Record<string, string>);
            break;
        }

        if (cancelled) return;

        if (!resolvedSource) {
          const lowerUri = uri.toLowerCase();
          const looksDirect = lowerUri.includes('.m3u8') || lowerUri.includes('.mp4') || pending.streamType === 'hls';
          if (looksDirect) {
            resolvedSource = { uri, headers: { ...(existingHeaders ?? {}) } };
          } else {
            console.error('[VideoPlayer] Failed to resolve video URL for host:', hostType);
            setScrapeError(`Stream unavailable - failed to resolve ${hostType} URL`);
            setPendingPlaybackSource(null);
            return;
          }
        }

        console.log('[VideoPlayer] Successfully resolved to:', resolvedSource.uri);

        // Set the playback source
        hlsProxyRetryRef.current = false;
        hlsVariantRetryRef.current = false;
        autoQualityStepRef.current = 0;
        lastAutoDowngradeTsRef.current = 0;
        pendingSeekAfterReloadRef.current = null;
        pendingShouldPlayAfterReloadRef.current = null;

        setPlaybackSource(
          createPlaybackSource({
            uri: resolvedSource.uri,
            headers: resolvedSource.headers,
            streamType: pending.streamType,
            captions: pending.captions,
            qualities: pending.qualities,
            sourceId: pending.sourceId,
            embedId: pending.embedId,
          }),
        );
        setCaptionSources(captions ?? []);
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
        setActiveTitle(displayTitle);
        setPendingPlaybackSource(null);

      } catch (e: any) {
        console.error('[VideoPlayer] Probe failed:', e?.message ?? e);
        if (!cancelled) {
          setScrapeError('Failed to load video stream');
          setPendingPlaybackSource(null);
        }
      }
    };

    probe(pendingPlaybackSource);

    return () => {
      cancelled = true;
    };
  }, [pendingPlaybackSource, displayTitle]);

  // Best-effort: keep a rolling preload window for HLS (can help warm DNS/TLS/CDNs).
  useEffect(() => {
    const uri = activeStreamUri;
    if (!uri) return;

    // Reset state when stream changes
    const key = `${uri}|${selectedQualityId}|${qualityOverrideUri ?? ''}`;
    if (streamPreloadRef.current.key !== key) {
      streamPreloadRef.current.key = key;
      streamPreloadRef.current.lastRunAt = 0;
      streamPreloadRef.current.seen.clear();
    }

    if (!isHlsSource) return;

    let cancelled = false;
    const tick = async (mode: 'normal' | 'aggressive') => {
      if (cancelled) return;
      if (!isPlaying && mode === 'normal') return;

      const now = Date.now();
      if (mode === 'normal' && now - streamPreloadRef.current.lastRunAt < 30_000) return;
      streamPreloadRef.current.lastRunAt = now;

      try {
        const startAtSeconds = Math.max(0, positionMillisRef.current / 1000 + 5);
        await preloadStreamWindow(uri, activeStreamHeaders, {
          startAtSeconds,
          windowSeconds: mode === 'aggressive' ? 240 : 180,
          maxSegments: mode === 'aggressive' ? 36 : 24,
          concurrency: mode === 'aggressive' ? 6 : 4,
          seen: streamPreloadRef.current.seen,
        });
      } catch {
        // ignore - preload is best-effort
      }
    };

    void tick('normal');
    const interval = setInterval(() => {
      void tick(showBufferingOverlay ? 'aggressive' : 'normal');
    }, 45_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeStreamUri, activeStreamHeaders, isHlsSource, isPlaying, qualityOverrideUri, selectedQualityId, showBufferingOverlay]);

  // Loader state
  const isInitialStreamPending = !playbackSource && !!tmdbId && !!rawMediaType && !scrapeError;
  const isResolvingPendingPlayback = !!pendingPlaybackSource;
  
  // Only show MovieFlixLoader for blocking operations (not buffering)
  const shouldShowMovieFlixLoader =
    !!qualityLoadingId ||
    isFetchingStream ||
    isInitialStreamPending ||
    isResolvingPendingPlayback;

  // Show buffering pill separately (non-blocking)
  const shouldShowBufferingPill = videoPlaybackSource && showBufferingOverlay && !scrapeError && !shouldShowMovieFlixLoader;

  let loaderMessage = 'Fetching hang on tight...';
  if (qualityLoadingId) {
    loaderMessage = 'Switching quality...';
  } else if (isFetchingStream) {
    loaderMessage = nextSourceBusy
      ? 'Trying next source...'
      : scrapingEpisode
        ? 'Loading next episode...'
        : 'Fetching hang on tight...';
  } else if (isInitialStreamPending) {
    loaderMessage = 'Preparing stream...';
  } else if (isResolvingPendingPlayback) {
    loaderMessage = nextSourceBusy ? 'Switching source...' : 'Preparing stream...';
  }

  const isBlockingLoader = Boolean(qualityLoadingId || isFetchingStream || isInitialStreamPending || isResolvingPendingPlayback);
  const loaderVariant: 'solid' | 'transparent' = isBlockingLoader ? 'solid' : 'transparent';

  const buildCurrentMediaPayload = useCallback((): PStreamMediaPayload | null => {
    if (!tmdbId || !rawMediaType) return null;

    const releaseYearForScrape = derivedReleaseYear ?? new Date().getFullYear();
    const mediaTitle = displayTitle || 'Now Playing';
    const normalizedTmdbId = tmdbId || '';
    const normalizedImdbId = imdbId || undefined;

    if (rawMediaType === 'tv') {
      const entry = watchEntryRef.current ?? watchHistoryEntry;

      const seasonNumber =
        typeof entry?.seasonNumber === 'number'
          ? entry.seasonNumber
          : typeof seasonNumberParam === 'number'
            ? seasonNumberParam
            : 1;
      const episodeNumber =
        typeof entry?.episodeNumber === 'number'
          ? entry.episodeNumber
          : typeof episodeNumberParam === 'number'
            ? episodeNumberParam
            : 1;

      const seasonTitle = entry?.seasonTitle ?? seasonTitleParam ?? `Season ${seasonNumber}`;
      const episodeCount =
        typeof (entry as any)?.seasonEpisodeCount === 'number'
          ? (entry as any).seasonEpisodeCount
          : typeof seasonEpisodeCountParam === 'number'
            ? seasonEpisodeCountParam
            : undefined;

      return {
        type: 'show',
        title: mediaTitle,
        tmdbId: normalizedTmdbId,
        imdbId: normalizedImdbId,
        releaseYear: releaseYearForScrape,
        season: {
          number: seasonNumber,
          tmdbId: seasonTmdbId ?? '',
          title: seasonTitle,
          ...(episodeCount ? { episodeCount } : {}),
        },
        episode: {
          number: episodeNumber,
          tmdbId: episodeTmdbId ?? '',
        },
      } as const;
    }

    return {
      type: 'movie',
      title: mediaTitle,
      tmdbId: normalizedTmdbId,
      imdbId: normalizedImdbId,
      releaseYear: releaseYearForScrape,
    } as const;
  }, [derivedReleaseYear, displayTitle, episodeNumberParam, episodeTmdbId, imdbId, rawMediaType, seasonEpisodeCountParam, seasonNumberParam, seasonTitleParam, seasonTmdbId, tmdbId, watchHistoryEntry]);

  const rotateSourceOrderAfter = useCallback((order: string[], currentId?: string) => {
    if (!currentId) return order;
    const idx = order.indexOf(currentId);
    if (idx < 0) return order;
    return [...order.slice(idx + 1), ...order.slice(0, idx + 1)];
  }, []);

  const handleTryNextSource = useCallback(async () => {
    if (!playbackSource) return;
    if (nextSourceBusy || isFetchingStream || qualityLoadingId || pendingPlaybackSource) return;

    const payload = buildCurrentMediaPayload();
    if (!payload) return;

    const fallback = playbackSource;
    setNextSourceBusy(true);
    setScrapeError(null);

    try {
      const debugTag = buildScrapeDebugTag('next-source', displayTitle);
      const rotated = rotateSourceOrderAfter(sourceOrder, playbackSource.sourceId);
      const playback = await scrapeInitial(payload as any, { sourceOrder: rotated, debugTag });

      if (!playback.uri) throw new Error('Playback URI missing');

      // If we ended up with the same stream again, keep playing.
      if (playback.sourceId === fallback.sourceId && playback.uri === fallback.uri) {
        Alert.alert('No alternative source found', 'Staying on the current stream.');
        return;
      }

      setUseHotlinkHeaderFallback(false);
      setPendingPlaybackSource(
        createPlaybackSource({
          uri: playback.uri as string,
          headers: {
            ...(playback.headers as Record<string, string> | undefined),
            ...(playback.stream?.preferredHeaders as Record<string, string> | undefined),
          },
          streamType: playback.stream?.type,
          captions: normalizeCaptions(playback.stream?.captions as any),
          qualities: ((playback.stream as any)?.qualities as QualitiesMap | undefined) ?? undefined,
          sourceId: playback.sourceId,
          embedId: playback.embedId,
        }),
      );
    } catch (err: any) {
      // If alternate lookup fails entirely, revert to the current stream.
      setPlaybackSource(fallback);
      const msg = err?.message || 'Unable to find another source.';
      Alert.alert('Next source unavailable', msg);
    } finally {
      setNextSourceBusy(false);
    }
  }, [buildCurrentMediaPayload, displayTitle, isFetchingStream, nextSourceBusy, pendingPlaybackSource, playbackSource, qualityLoadingId, rotateSourceOrderAfter, scrapeInitial, sourceOrder]);

  // AV controls state
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

  // Parse HLS manifest for audio/quality options
  useEffect(() => {
    if (!isHlsSource || !playbackSource?.uri) {
      setAudioTrackOptions([]);
      setQualityOptions([]);
      // Captions are normally populated from p-stream, but for HLS we can also
      // discover subtitle tracks from the master manifest.
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const manifestUrl = masterPlaylistRef.current ?? playbackSource.uri;

    console.debug('[VideoPlayer] Fetching manifest', manifestUrl);

    const fetchManifest = async () => {
      try {
        const browserHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
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
        console.log('[VideoPlayer] Manifest fetched, length:', text.length, 'first 200 chars:', text.substring(0, 200));

        if (cancelled) return;

        // Decode base64 encoded URLs in the M3U8
        const decodedText = text.replace(/\/stream\/([A-Za-z0-9+/=]+)/g, (match, encoded) => {
          try {
            const decoded = base64Decode(encoded);
            return decoded ? '/stream/' + decoded : match;
          } catch {
            return match;
          }
        });

        const parsedAudio = parseHlsAudioTracks(decodedText);
        const parsedQuality = parseHlsQualityOptions(decodedText, manifestUrl);
        const parsedSubtitles = parseHlsSubtitleTracks(decodedText, manifestUrl);

        setAudioTrackOptions(parsedAudio);
        setQualityOptions(parsedQuality);

        if (parsedSubtitles.length) {
          setCaptionSources((prev) => {
            const byUrl = new Map<string, CaptionSource>();
            (prev || []).forEach((c) => {
              if (c?.url) byUrl.set(c.url, c);
            });
            parsedSubtitles.forEach((c) => {
              if (c?.url && !byUrl.has(c.url)) byUrl.set(c.url, c);
            });
            return Array.from(byUrl.values());
          });
        }

        console.log('[VideoPlayer] Parsed audio tracks:', parsedAudio.length, 'quality options:', parsedQuality.length);
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to parse master manifest', { url: manifestUrl, error: err });
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

  useEffect(() => {
    if (isHlsSource) return;
    if (!playbackSource?.qualities) {
      setQualityOptions([]);
      return;
    }
    setQualityOptions(buildFileQualityOptions(playbackSource.qualities));
  }, [isHlsSource, playbackSource?.qualities]);

  // Auto-select audio track
  useEffect(() => {
    if (!audioTrackOptions.length) return;
    const video = videoRef.current;
    if (!video) return;

    // Respect manual selection
    if (selectedAudioKey !== 'auto') return;

    let chosen: AudioTrackOption | undefined;
    if (movieSettings.preferEnglishAudio) {
      chosen =
        audioTrackOptions.find((t) => normalizeLang(t.language) === 'en') ??
        audioTrackOptions.find((t) => (t.name || '').toLowerCase().includes('english'));
    }

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
  }, [audioTrackOptions, movieSettings.preferEnglishAudio, selectedAudioKey]);

  // Lock orientation + setup brightness
  useEffect(() => {
    const setup = async () => {
      try {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        );
        await Brightness.requestPermissionsAsync();
        const current = await Brightness.getBrightnessAsync();
        setBrightness(current);
      } catch (e) {
        console.warn('Video setup error', e);
      }
    };
    setup();

    return () => {
      Brightness.restoreSystemBrightnessAsync();
      ScreenOrientation.unlockAsync();
    };
  }, []);

  // Apply brightness
  useEffect(() => {
    Brightness.setBrightnessAsync(brightness).catch(() => { });
  }, [brightness]);

  // Apply volume
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.setVolumeAsync(volume).catch(() => { });
  }, [volume]);

  // Auto-hide controls when playing
  useEffect(() => {
    if (!showControls || episodeDrawerOpen) return;
    const delay = isPlaying ? CONTROLS_HIDE_DELAY_PLAYING : CONTROLS_HIDE_DELAY_PAUSED;
    const timeout = setTimeout(() => setShowControls(false), delay);
    return () => clearTimeout(timeout);
  }, [showControls, isPlaying, episodeDrawerOpen, controlsSession]);

  // Persist watch progress
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
            const mediaTypeForDoc = (baseEntry.media_type || 'movie') as string;
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
          const mediaTypeForDoc = (enriched.media_type || 'movie') as string;
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
            void logInteraction({ type: 'view', actorId: user.uid, targetId: enriched.id, meta: { progress: progressValue } });
          } catch { }
        }
      } catch (err) {
        console.warn('Failed to update watch history', err);
      }
    },
    [watchHistoryKey, user?.uid, user?.displayName, user?.email, activeProfile?.id, activeProfile?.name, activeProfile?.avatarColor, activeProfile?.photoURL],
  );

  // Handle playback status update
  const handleStatusUpdate = useCallback((status: AVPlaybackStatusSuccess | any) => {
    if (!status || !status.isLoaded) {
      if (status?.error) {
        console.log('[VideoPlayer] Playback error:', status.error);
      }
      return;
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

    const playingNow = Boolean(status.isPlaying);
    const bufferingNow = Boolean(status.isBuffering);
    const now = Date.now();

    if (__DEV__) {
      const positionLabel = Math.round((status.positionMillis || 0) / 1000);
      const key = `${playingNow ? 'play' : 'pause'}|${bufferingNow ? 'buffer' : 'clear'}|${positionLabel}`;
      if (now - statusLogRef.current.lastTs > 2000 || statusLogRef.current.lastKey !== key) {
        console.log('[WatchParty] Status update', {
          playing: playingNow,
          buffering: bufferingNow,
          positionMs: status.positionMillis || 0,
          durationMs: status.durationMillis || null,
        });
        statusLogRef.current = { lastTs: now, lastKey: key };
      }
    }

    // Prevent UI flicker by ignoring status updates right after user intent
    if (now - lastPlayPauseIntentTsRef.current > 300) {
      setIsPlaying(playingNow);
    }

    const currentPos = status.positionMillis || 0;

    // Detect progress: if position advanced by >300ms, update last advance timestamp
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
          const now = Date.now();
          const advancedRecently = now - lastAdvanceTsRef.current < 700;
          if (!advancedRecently) {
            setShowBufferingOverlay(true);
          }
          bufferingOverlayTimeoutRef.current = null;
        }, 650);
      }

      if (
        movieSettings.autoLowerQualityOnBuffer &&
        selectedQualityId === 'auto' &&
        !autoDowngradeTimeoutRef.current
      ) {
        autoDowngradeTimeoutRef.current = setTimeout(() => {
          autoDowngradeTimeoutRef.current = null;
          void maybeAutoDowngradeQuality('stall');
        }, 2500);
      }
    } else {
      if (bufferingOverlayTimeoutRef.current) {
        clearTimeout(bufferingOverlayTimeoutRef.current);
        bufferingOverlayTimeoutRef.current = null;
      }
      if (autoDowngradeTimeoutRef.current) {
        clearTimeout(autoDowngradeTimeoutRef.current);
        autoDowngradeTimeoutRef.current = null;
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

    if (roomCode && isWatchPartyHost && !applyingRemotePlaybackRef.current) {
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
      status.didJustFinish &&
      roomCode &&
      isWatchPartyHost &&
      watchPartyRef &&
      user?.uid &&
      !didClosePartyOnFinishRef.current
    ) {
      didClosePartyOnFinishRef.current = true;
      void updateDoc(watchPartyRef, {
        isOpen: false,
        endedAt: serverTimestamp(),
        playback: {
          isPlaying: false,
          positionMillis: Math.max(0, Math.floor(currentPosition)),
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
      }).catch(() => {});
    }
  }, [
    durationMillis,
    isSeeking,
    maybeAutoDowngradeQuality,
    movieSettings.autoLowerQualityOnBuffer,
    isWatchPartyHost,
    persistWatchProgress,
    publishWatchPartyPlayback,
    resumeMillisParam,
    user?.uid,
    roomCode,
    watchPartyRef,
    selectedQualityId,
    showBufferingOverlay,
    updateActiveCaption,
  ]);

  // Persist progress on unmount
  useEffect(() => {
    return () => {
      if (positionMillis > 0 && durationMillis > 0) {
        void persistWatchProgress(positionMillis, durationMillis, { force: true });
      }
    };
  }, [positionMillis, durationMillis, persistWatchProgress]);

  // Toggle play/pause
  const togglePlayPause = async () => {
    const video = videoRef.current;
    if (!video) return;
    bumpControlsLife();
    lastPlayPauseIntentTsRef.current = Date.now();

    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying); // Optimistic update to prevent UI flicker
    void publishWatchPartyPlayback(
      { isPlaying: nextPlaying, positionMillis: positionMillisRef.current },
      { force: true },
    );

    try {
      if (isPlaying) {
        await video.pauseAsync();
        setShowControls(true);
      } else {
        await ensurePlaybackAudioMode();
        await video.playAsync();
      }
    } catch (err: any) {
      console.warn('Playback failed', err);
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes('audiofocus') || msg.toLowerCase().includes('audio focus') || msg.includes('AudioFocusNotAcquiredException')) {
        pendingAudioFocusRetryRef.current = true;
        Alert.alert('Playback blocked', 'This app is currently in the background, so audio focus could not be acquired. Please bring the app to the foreground and try again.');
      } else {
        Alert.alert('Playback error', msg);
      }
    }
  };

  // Seek by delta
  const seekBy = async (deltaMillis: number) => {
    const video = videoRef.current;
    if (!video) return;
    bumpControlsLife();
    const next = Math.max(
      0,
      Math.min(positionMillis + deltaMillis, durationMillis)
    );
    await video.setPositionAsync(next);
    setSeekPosition(next);

    void publishWatchPartyPlayback({ isPlaying, positionMillis: next }, { force: true });
  };

  // Toggle playback rate
  const handleRateToggle = async () => {
    const video = videoRef.current;
    if (!video) return;
    bumpControlsLife();
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    await video.setRateAsync(nextRate, true);
  };

  // Format time
  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const currentTimeLabel = formatTime(positionMillis);
  const totalTimeLabel = durationMillis ? formatTime(durationMillis) : '0:00';

  const overlayPaddingStyle = useMemo(
    () => ({
      paddingTop: Math.max(18, insets.top + 10),
      paddingBottom: Math.max(18, insets.bottom + 12),
    }),
    [insets.bottom, insets.top],
  );

  const durationForUi = Math.max(1, durationMillis || 1);
  const playedPctForUi = Math.min(1, Math.max(0, seekPosition / durationForUi));
  const bufferedPctForUi = Math.min(1, Math.max(0, bufferedMillis / durationForUi));

  // Close episode drawer for non-TV content
  useEffect(() => {
    if (!isTvShow) {
      setEpisodeDrawerOpen(false);
    }
  }, [isTvShow]);

  useEffect(() => {
    if (!isWatchPartyHost || !roomCode) return;
    
    const facts = [
      "Did you know? The director improvised this scene!",
      "Trivia: This movie took 3 years to animate.",
      "Fun Fact: The lead actor did all their own stunts.",
      "Vibe Check: How are we feeling about this plot twist?",
      "Pro Tip: Watch the background for hidden easter eggs!",
    ];

    const interval = setInterval(() => {
      const fact = facts[Math.floor(Math.random() * facts.length)];
      const messagesRef = collection(firestore, 'watchParties', roomCode, 'messages');
      void addDoc(messagesRef, {
        text: fact,
        userId: 'system',
        userDisplayName: 'MovieFlix Bot 🤖',
        userAvatar: null,
        createdAt: serverTimestamp(),
      });
    }, 180000); // Every 3 mins

    return () => clearInterval(interval);
  }, [isWatchPartyHost, roomCode]);

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

  // Handle surface press
  const handleSurfacePress = useCallback(() => {
    if (episodeDrawerOpen) return;
    if (isLocked) return;
    if (isMini) {
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
  }, [episodeDrawerOpen, showControls, isLocked, isMini, bumpControlsLife]);

  // Send chat message
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

  // Handle brightness change
  const handleBrightnessChange = useCallback(
    (value: number) => {
      setBrightness(value);
      bumpControlsLife();
    },
    [bumpControlsLife],
  );

  // Handle volume change
  const handleVolumeChange = useCallback(
    (value: number) => {
      setVolume(value);
      bumpControlsLife();
    },
    [bumpControlsLife],
  );

  // Handle quality select
  const handleQualitySelect = useCallback(
    async (option: QualityOption | null) => {
      if (!playbackSource) return;
      const isHls = isHlsSource;
      if (!option) {
        if (selectedQualityId === 'auto' && !qualityOverrideUri) return;
        pendingSeekAfterReloadRef.current = positionMillisRef.current;
        pendingShouldPlayAfterReloadRef.current = isPlaying;
        setQualityOverrideUri(null);
        setSelectedQualityId('auto');
        autoQualityStepRef.current = 0;
        lastAutoDowngradeTsRef.current = 0;
        setVideoReloadKey((prev) => prev + 1);
        return;
      }
      if (selectedQualityId === option.id) return;
      setQualityLoadingId(option.id);
      try {
        if (isHls) {
          await preloadQualityVariant(option.uri, playbackSource.headers);
        }
        pendingSeekAfterReloadRef.current = positionMillisRef.current;
        pendingShouldPlayAfterReloadRef.current = isPlaying;
        setQualityOverrideUri(option.uri);
        setSelectedQualityId(option.id);
        autoQualityStepRef.current = 0;
        lastAutoDowngradeTsRef.current = 0;
        setVideoReloadKey((prev) => prev + 1);
      } catch (err) {
        console.warn('Quality preload failed', err);
        Alert.alert('Quality unavailable', 'Unable to switch to this quality right now.');
      } finally {
        setQualityLoadingId(null);
      }
    },
    [isHlsSource, isPlaying, playbackSource, qualityOverrideUri, selectedQualityId],
  );

  // Auto-recover from buffering (optional settings)
  useEffect(() => {
    if (!showBufferingOverlay) return;
    if (!movieSettings.autoLowerQualityOnBuffer && !movieSettings.autoSwitchSourceOnBuffer) return;
    if (!playbackSource) return;
    if (nextSourceBusy || isFetchingStream || qualityLoadingId || pendingPlaybackSource) return;

    const timer = setTimeout(() => {
      const now = Date.now();
      if (now - autoRecoveryRef.current.lastAttemptAt < 15000) return;
      autoRecoveryRef.current.lastAttemptAt = now;

      // 1) Try lowering quality (only meaningful for multi-variant streams)
      if (movieSettings.autoLowerQualityOnBuffer && selectedQualityId === 'auto' && qualityOptions.length > 1) {
        void maybeAutoDowngradeQuality('stall');
        return;
      }

      // 2) Otherwise try next source
      if (movieSettings.autoSwitchSourceOnBuffer) {
        void handleTryNextSource();
      }
    }, 2200);

    return () => clearTimeout(timer);
  }, [
    autoRecoveryRef,
    handleTryNextSource,
    isFetchingStream,
    maybeAutoDowngradeQuality,
    movieSettings.autoLowerQualityOnBuffer,
    movieSettings.autoSwitchSourceOnBuffer,
    nextSourceBusy,
    pendingPlaybackSource,
    playbackSource,
    qualityLoadingId,
    qualityOptions,
    selectedQualityId,
    showBufferingOverlay,
  ]);

  // Get caption label
  const getCaptionLabel = useCallback((caption: CaptionSource) => {
    if (caption.display) return caption.display;
    if (caption.language) return caption.language.toUpperCase();
    return 'Subtitle';
  }, []);

  // Handle caption select
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
        const res = await fetch(source.url, {
          headers: {
            Accept: source.type === 'vtt' ? 'text/vtt, */*' : '*/*',
            ...((playbackSource?.headers as Record<string, string>) || {}),
          },
        });
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

  // Handle audio select
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

  // Auto-select captions
  useEffect(() => {
    if (!movieSettings.autoEnableCaptions) return;
    if (!captionSources.length) return;
    let cancelled = false;
    const pickDefaultCaption = async () => {
      const prefKey = captionPreferenceKeyRef.current;
      const stored = prefKey ? await AsyncStorage.getItem(prefKey).catch(() => null) : null;
      if (cancelled) return;
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
  }, [captionSources, handleCaptionSelect, movieSettings.autoEnableCaptions, selectedCaptionId]);

  // Handle episode play
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
        releaseYear: derivedReleaseYear ?? 0,
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

      if (!playback.uri) throw new Error('Playback URI missing');

      // Set pending source to go through the probe flow
      setPendingPlaybackSource(
        createPlaybackSource({
          uri: playback.uri as string,
          headers: {
            ...(playback.headers as Record<string, string> | undefined),
            ...(playback.stream?.preferredHeaders as Record<string, string> | undefined),
          },
          streamType: playback.stream?.type,
          captions: normalizeCaptions(playback.stream?.captions as any),
          qualities: ((playback.stream as any)?.qualities as QualitiesMap | undefined) ?? undefined,
          sourceId: playback.sourceId,
          embedId: playback.embedId,
        }),
      );

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

      // Publish episode change to watch party (host only)
      if (isWatchPartyHost && roomCode) {
        void publishWatchPartyEpisode({
          seasonNumber: normalizedSeasonNumber,
          episodeNumber: normalizedEpisodeNumber,
          seasonTmdbId: episode.seasonTmdbId?.toString() ?? null,
          episodeTmdbId: episode.episodeTmdbId?.toString() ?? null,
          seasonTitle: nextSeasonTitle,
          episodeTitle: episode.title ?? null,
        });
      }
    } catch (err: any) {
      console.error('[VideoPlayer] Episode scrape failed', err);
      Alert.alert('Episode unavailable', err?.message || 'Unable to load this episode.');
    }
  };

  // Handle video error
  const handleVideoError = useCallback(
    (error: any) => {
      console.error('[WatchParty] Video error:', error);

      const raw =
        typeof error === 'string'
          ? error
          : String(error?.message ?? error?.error ?? error ?? '');

      // Try to extract meaningful error message
      let errorMessage = raw || 'Unknown playback error';
      if (errorMessage.includes('UnrecognizedInputFormatException')) {
        errorMessage = 'Video format not supported or stream is unavailable';
      } else if (errorMessage.includes('HttpDataSource')) {
        errorMessage = 'Failed to load video from server';
      } else if (errorMessage.includes('BehindLiveWindowException')) {
        errorMessage = 'Live stream has moved ahead';
      }

      const activeUri = (qualityOverrideUri ?? playbackSource?.uri) || '';
      const activeHostType = activeUri ? getVideoHostHandler(activeUri) : 'generic';

      // Optional fallback: retry once with hotlink headers inferred from embedId.
      try {
        const looksLike403or404 = /Response code:\s*(403|404)/i.test(raw) || /InvalidResponseCodeException/i.test(raw);
        const hint = playbackSource?.embedId;
        if (
          looksLike403or404 &&
          !useHotlinkHeaderFallback &&
          activeHostType === 'generic' &&
          (hint === 'streamtape' || hint === 'mixdrop' || hint === 'filemoon')
        ) {
          console.warn('[WatchParty] Retrying with hotlink header fallback', { hint });
          setScrapeError(null);
          setUseHotlinkHeaderFallback(true);
          setVideoReloadKey((prev) => prev + 1);
          return;
        }
      } catch {
        // ignore
      }

      const hasPlayback = Boolean(playbackSource?.uri);

      // Try fallback to another HLS variant if current one failed
      if (hasPlayback && isHlsSource && qualityOptions.length) {
        const baseUri = qualityOverrideUri ?? playbackSource!.uri;
        triedVariantUrisRef.current.add(baseUri);

        const ordered = orderQualityOptionsForCompatibility(qualityOptions);
        const next = ordered.find((opt) => opt?.uri && !triedVariantUrisRef.current.has(opt.uri));
        if (next?.uri) {
          console.log('[WatchParty] Trying next HLS variant:', next.id);
          pendingSeekAfterReloadRef.current = positionMillisRef.current;
          pendingShouldPlayAfterReloadRef.current = isPlaying;
          setQualityOverrideUri(next.uri);
          setSelectedQualityId(next.id);
          setVideoReloadKey((prev) => prev + 1);
          return;
        }
      }

      if (
        hasPlayback &&
        isHlsSource &&
        !hlsProxyRetryRef.current &&
        !isM3U8ProxyUrl(activeUri) &&
        (raw.includes('UnknownHostException') ||
          raw.includes('Unable to resolve host') ||
          raw.includes('InvalidResponseCodeException') ||
          raw.includes('Response code'))
      ) {
        const proxied = buildM3U8ProxyUrl(activeUri, playbackSource!.headers);
        if (proxied) {
          hlsProxyRetryRef.current = true;
          setScrapeError(null);
          pendingSeekAfterReloadRef.current = positionMillisRef.current;
          pendingShouldPlayAfterReloadRef.current = isPlaying;
          setQualityOverrideUri(null);
          setSelectedQualityId('auto');
          autoQualityStepRef.current = 0;
          lastAutoDowngradeTsRef.current = 0;
          setPlaybackSource(
            createPlaybackSource({
              uri: proxied,
              headers: playbackSource!.headers,
              streamType: playbackSource!.streamType,
              captions: playbackSource!.captions,
              qualities: playbackSource!.qualities,
              sourceId: playbackSource!.sourceId,
              embedId: playbackSource!.embedId,
            }),
          );
          setVideoReloadKey((prev) => prev + 1);
          return;
        }
      }

      if (hasPlayback && isHlsSource) {
        void maybeAutoDowngradeQuality('error');
      }

      setScrapeError(errorMessage);
    },
    [
      isHlsSource,
      isPlaying,
      maybeAutoDowngradeQuality,
      playbackSource,
      qualityOptions,
      qualityOverrideUri,
      useHotlinkHeaderFallback,
    ],
  );

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={styles.touchLayer}>
        {/* Surprise Feature 3: Face Cam Row (Zoom-like) */}
        {faceCamEnabled && (
          <View style={styles.faceCamRow}>
            <FaceCam stream={localCamStream} label="You" isLocal />
            {Object.entries(remoteCamStreams).map(([uid, stream]) => (
              <FaceCam key={uid} stream={stream} label={uid.slice(0, 4)} />
            ))}
          </View>
        )}

        {/* Surprise Feature 1: Shared Reactions Layer */}
        {reactions.map((r) => (
          <FloatingEmoji key={r.id} emoji={r.emoji} x={r.x} />
        ))}

        {/* Surprise Feature 2: Active Poll Card */}
        {activePoll && (
          <AnimatedSection delay={0} style={styles.pollCardContainer}>
            <View style={styles.pollCard}>
              <View style={styles.pollHeader}>
                <Ionicons name="stats-chart" size={16} color="#fff" />
                <Text style={styles.pollTitle}>Live Poll</Text>
              </View>
              <Text style={styles.pollQuestion}>{activePoll.question}</Text>
              {activePoll.options.map((option: string, idx: number) => {
                const totalVotes = Object.values(activePoll.votes || {}).reduce((a: any, b: any) => a + b, 0) as number;
                const votes = (activePoll.votes?.[idx] || 0) as number;
                const percent = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => submitVote(idx)}
                    disabled={hasVoted}
                    style={styles.pollOption}
                  >
                    <View style={[styles.pollProgress, { width: `${percent}%`, backgroundColor: accentColor + '40' }]} />
                    <Text style={styles.pollOptionText}>{option}</Text>
                    <Text style={styles.pollPercent}>{Math.round(percent)}%</Text>
                  </TouchableOpacity>
                );
              })}
              {hasVoted && <Text style={styles.votedHint}>Vote cast! Waiting for others...</Text>}
            </View>
          </AnimatedSection>
        )}

        {videoPlaybackSource ? (
          <>
            <Video
              key={videoReloadKey}
              ref={videoRef}
              source={videoPlaybackSource}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={isPlaying}
              useNativeControls={false}
              onPlaybackStatusUpdate={handleStatusUpdate}
              onError={handleVideoError}
              onLoad={handleVideoLoad}
            />

            {/* Surface tap handler sits behind controls so it never steals button presses. */}
            <Pressable style={styles.surfacePressLayer} onPress={handleSurfacePress} />

            {!showControls && !isLocked ? (
              <Pressable style={styles.touchCatcher} onPress={handleSurfacePress} />
            ) : null}
          </>
        ) : (
          <View style={styles.videoFallback}>
            {shouldShowMovieFlixLoader ? null : (
              <>
                <Text style={styles.videoFallbackText}>{scrapeError ?? 'No video stream available.'}</Text>

                {scrapeError && (
                  <View style={styles.manualOverrideContainer}>
                    <Text style={styles.manualOverrideTitle}>Try Manual Stream URL</Text>
                    <TextInput
                      style={styles.manualUrlInput}
                      placeholder="Enter direct .m3u8 or .mp4 URL..."
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      value={manualUrlInput}
                      onChangeText={setManualUrlInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={[styles.manualOverrideButton, !manualUrlInput.trim() && styles.manualOverrideButtonDisabled]}
                      onPress={async () => {
                        if (!manualUrlInput.trim()) return;

                        try {
                          setScrapeError(null);
                          setPlaybackSource(
                            createPlaybackSource({
                              uri: manualUrlInput.trim(),
                              streamType: manualUrlInput.includes('.m3u8') ? 'hls' : 'file',
                            }),
                          );
                          setVideoReloadKey(prev => prev + 1);
                          setManualUrlInput('');
                        } catch (err) {
                          Alert.alert('Error', 'Failed to load stream');
                        }
                      }}
                      disabled={!manualUrlInput.trim()}
                    >
                      <Text style={styles.manualOverrideButtonText}>Load Stream</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity style={styles.videoFallbackButton} onPress={() => router.back()}>
                  <Text style={styles.videoFallbackButtonText}>Go Back</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {shouldShowMovieFlixLoader && (
          <MovieFlixLoader
            message={loaderMessage}
            variant={loaderVariant}
          />
        )}

        {/* Buffering Pill - non-blocking indicator */}
        {shouldShowBufferingPill && (
          <View pointerEvents="none" style={styles.bufferPillWrap}>
            <View style={styles.bufferPill}>
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.bufferPillText}>Buffering...</Text>
            </View>
          </View>
        )}

        {showControls && videoPlaybackSource && (
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
                >
                  <Ionicons name="chevron-back" size={20} color="#fff" />
                </TouchableOpacity>
                <View style={styles.titleWrap}>
                  <Text style={styles.title}>{activeTitle}</Text>
                  {roomCode ? (
                    <Text style={styles.roomCodeBadge}>
                      Party #{roomCode} • {watchPartyParticipantsCount || 0} in room
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.topRight}>
                <TouchableOpacity
                  style={[styles.roundButton, faceCamEnabled && { backgroundColor: '#19c37d' }]}
                  onPress={toggleFaceCam}
                >
                  <Ionicons name={faceCamEnabled ? "videocam" : "videocam-outline"} size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.roundButton}>
                  <MaterialCommunityIcons name="thumb-down-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.roundButton}>
                  <MaterialCommunityIcons name="thumb-up-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.roundButton}
                  onPress={() => {
                    if (!roomCode) return;
                    void Share.share({
                      message: `Join my MovieFlix Watch Party. Code: ${roomCode}`,
                    }).catch(() => {});
                  }}
                  disabled={!roomCode}
                >
                  <MaterialCommunityIcons name="monitor-share" size={22} color="#fff" />
                </TouchableOpacity>
                {roomCode ? (
                  <TouchableOpacity
                    style={styles.roundButton}
                    onPress={() => setShowChat((prev) => !prev)}
                  >
                    <MaterialCommunityIcons
                      name={showChat ? 'message-text-outline' : 'message-outline'}
                      size={22}
                      color="#fff"
                    />
                  </TouchableOpacity>
                ) : null}
                {isTvShow && episodeQueue.length > 0 ? (
                  <TouchableOpacity
                    style={styles.roundButton}
                    onPress={() => setEpisodeDrawerOpen((prev) => !prev)}
                  >
                    <MaterialCommunityIcons name="playlist-play" size={22} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Reaction Toolbar (Surprise Feature!) */}
            <View style={styles.reactionToolbar}>
              {['🔥', '😂', '❤️', '😮', '🍿', '💯'].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => sendReaction(emoji)}
                  style={styles.reactionButton}
                >
                  <Text style={styles.reactionEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* MIDDLE CONTROLS + CHAT */}
            <View style={styles.middleRow}>
              <View style={[styles.sideCluster, styles.sideClusterLeft]}>
                <View style={[styles.sideRail, { width: layout.sideRailWidth }]}>
                  <SlidableVerticalControl
                    icon="white-balance-sunny"
                    label="Brightness"
                    value={brightness}
                    tintColor="rgba(255,200,80,0.35)"
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
                  >
                    <MaterialCommunityIcons name="rewind-10" size={26} color="#fff" />
                    <Text style={styles.seekLabel}>10s</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={togglePlayPause}
                    style={styles.iconCircle}
                  >
                    <Ionicons
                      name={isPlaying ? 'pause' : 'play'}
                      size={42}
                      color="#fff"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconCircleSmall}
                    onPress={() => seekBy(10000)}
                  >
                    <MaterialCommunityIcons name="fast-forward-10" size={26} color="#fff" />
                    <Text style={styles.seekLabel}>10s</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.sideCluster, styles.sideClusterRight]}>
                {/* Watch party chat (only when in a room) */}
                {roomCode && showChat ? (
                  <View
                    style={[
                      styles.chatPanel,
                      { width: layout.chatPanelWidth, height: layout.chatPanelHeight },
                    ]}
                  >
                    <Text style={styles.chatTitle}>Party chat</Text>
                    <FlatList
                      data={chatMessages}
                      keyExtractor={(item) => item.id}
                      style={styles.chatList}
                      contentContainerStyle={styles.chatListContent}
                      renderItem={({ item }: { item: any }) => (
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
                  <View
                    style={[
                      styles.middleRightPlaceholder,
                      { width: layout.chatPanelWidth, height: layout.chatPanelHeight },
                    ]}
                  />
                )}
                <View style={[styles.sideRail, styles.rightSideRail, { width: layout.sideRailWidth }]}>
                  <SlidableVerticalControl
                    icon="volume-high"
                    label="Volume"
                    value={volume}
                    tintColor="rgba(120,130,255,0.35)"
                    onValueChange={handleVolumeChange}
                  />
                </View>
              </View>
            </View>

            {/* Episode drawer */}
            {episodeDrawerOpen && isTvShow && episodeQueue.length > 0 && (
              <View
                style={[
                  styles.episodeDrawer,
                  {
                    width: layout.episodeDrawerWidth,
                    top: layout.episodeDrawerTop,
                    bottom: layout.episodeDrawerBottom,
                  },
                ]}
              >
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
            {/* AV drawer */}
            
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
                          <Text style={styles.avOptionLabel}>Auto</Text>
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
                >
                  <MaterialCommunityIcons name="speedometer" size={18} color="#fff" />
                  <Text style={styles.bottomText}>
                    {`Speed (${playbackRate.toFixed(1)}x)`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bottomButton}
                  onPress={() => {
                    setIsLocked(prev => !prev);
                    bumpControlsLife();
                  }}
                >
                  <MaterialCommunityIcons
                    name={isLocked ? "lock" : "lock-outline"}
                    size={18}
                    color="#fff"
                  />
                  <Text style={styles.bottomText}>
                    {isLocked ? "Locked" : "Lock"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bottomButton, !avControlsEnabled && styles.bottomButtonDisabled]}
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
                </TouchableOpacity>
              </View>
            </View>
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

function parseHlsSubtitleTracks(manifest: string, manifestUrl: string): CaptionSource[] {
  const lines = manifest.split('\n');
  const options: CaptionSource[] = [];
  const regex = /^#EXT-X-MEDIA:TYPE=SUBTITLES,(.*)$/i;

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const match = regex.exec(line);
    if (!match) return;

    const attrs = parseAttributeDictionary(match[1]);
    const name = stripQuotes(attrs.NAME);
    const language = stripQuotes(attrs.LANGUAGE);
    const uriRaw = stripQuotes(attrs.URI);
    if (!uriRaw) return;

    const resolved = resolveRelativeUrl(uriRaw, manifestUrl);

    // VideoPlayer caption loader currently supports direct .vtt/.srt payloads.
    // Many HLS subtitle tracks use segmented WebVTT via a .m3u8, which would
    // need additional playlist+segment fetching; ignore those for now.
    const lower = resolved.toLowerCase();
    const type: 'vtt' | 'srt' | null = lower.includes('.vtt') ? 'vtt' : lower.includes('.srt') ? 'srt' : null;
    if (!type) return;

    options.push({
      id: `hls-sub:${language || name || idx}`,
      type,
      url: resolved,
      language: language || undefined,
      display: name || undefined,
    });
  });

  return options;
}
function buildFileQualityOptions(qualities?: QualitiesMap): QualityOption[] {
  if (!qualities) return [];

  const heightFromKey = (key: string): number | null => {
    if (!key) return null;
    const lower = key.toLowerCase();
    if (lower === '4k') return 2160;
    const match = lower.match(/(\d+)/);
    if (!match) return null;
    const parsed = parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const options = Object.entries(qualities)
    .filter(([, entry]) => entry?.url)
    .map(([key, entry]) => {
      const height = heightFromKey(key) ?? undefined;
      const label = height ? `${height}p` : key || 'Variant';
      return {
        id: key,
        label,
        uri: entry?.url as string,
        resolution: height ? `x${height}` : undefined,
      } as QualityOption;
    });

  return options.sort((a, b) => {
    const aHeight = heightFromKey(a.id) ?? 0;
    const bHeight = heightFromKey(b.id) ?? 0;
    return bHeight - aHeight;
  });
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
    const label = buildQualityLabel(resolution, bandwidth);
    const uri = resolveRelativeUrl(uriLine, manifestUrl);
    options.push({
      id: `${bandwidth ?? 0}-${resolution ?? uri}`,
      label,
      uri,
      resolution,
      bandwidth,
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

// Order quality options for fallback compatibility - prefer h264 (avc1) over HEVC
function getCodecPriority(codec?: string): number {
  const value = codec?.toLowerCase() ?? '';
  if (!value) return 1;
  if (value.includes('avc1')) return 0; // h264 - most compatible
  if (value.includes('hvc1') || value.includes('hev1') || value.includes('dvhe') || value.includes('dvh1')) return 2; // HEVC
  return 1;
}

function orderQualityOptionsForCompatibility(options: QualityOption[]): QualityOption[] {
  return [...options].sort((a, b) => {
    // Prefer h264 over HEVC for compatibility
    const aCodecPriority = getCodecPriority((a as any).codec);
    const bCodecPriority = getCodecPriority((b as any).codec);
    if (aCodecPriority !== bCodecPriority) return aCodecPriority - bCodecPriority;

    // Then prefer higher resolution
    const aHeight = getResolutionHeight(a.resolution) ?? 0;
    const bHeight = getResolutionHeight(b.resolution) ?? 0;
    return bHeight - aHeight;
  });
}
function resolveRelativeUrl(target: string, base: string): string {
  try {
    return new URL(target, base).toString();
  } catch {
    return target;
  }
}

type PreloadStreamWindowOptions = {
  startAtSeconds?: number;
  windowSeconds: number;
  maxSegments: number;
  concurrency: number;
  seen?: Set<string>;
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

function parseHlsMediaSegments(manifestText: string, manifestUrl: string): Array<{ uri: string; duration: number | null }> {
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
    // 1) Fetch initial manifest
    const res = await fetch(uri, { headers, signal: controller.signal });
    if (!res.ok) return;
    const text = await res.text();

    // 2) If master, pick best variant and fetch variant playlist
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

    // 3) Parse segments and prefetch a ~windowSeconds forward range
    const segments = parseHlsMediaSegments(variantText, variantUrl);
    if (!segments.length) return;

    const targetSeconds = Math.max(1, options.windowSeconds);
    const maxSegments = Math.max(1, options.maxSegments);
    const concurrency = Math.max(1, options.concurrency);
    const seen = options.seen;

    const startAtSeconds = Math.max(0, options.startAtSeconds ?? 0);
    const hasDurations = segments.some((s) => typeof s.duration === 'number' && Number.isFinite(s.duration));
    const shouldSkipByTime = startAtSeconds > 0 && hasDurations;

    const toFetch: string[] = [];
    let accSeconds = 0;
    let skipAccSeconds = 0;
    let started = !shouldSkipByTime;
    for (const seg of segments) {
      if (!started) {
        skipAccSeconds += seg.duration ?? 0;
        if (skipAccSeconds >= startAtSeconds) {
          started = true;
        }
        continue;
      }
      if (toFetch.length >= maxSegments) break;
      if (seen && seen.has(seg.uri)) continue;

      toFetch.push(seg.uri);
      if (seen) {
        seen.add(seg.uri);
        if (seen.size > 600) {
          // Bound memory; it's okay to re-warm occasionally.
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
async function preloadQualityVariant(uri: string, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(uri, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Variant request failed (${res.status})`);
    }
    const manifest = await res.text();
    const segments = parseHlsMediaSegments(manifest, uri).slice(0, 3);
    await Promise.allSettled(segments.map((s) => prefetchUrlRange(s.uri, headers ?? {})));
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
function buildSourceOrder(preferAnime: boolean): string[] {
  const priority = preferAnime ? ANIME_PRIORITY_SOURCE_IDS : GENERAL_PRIORITY_SOURCE_IDS;
  const deprioritized = preferAnime ? GENERAL_PRIORITY_SOURCE_IDS : ANIME_PRIORITY_SOURCE_IDS;
  const combined = [
    ...priority,
    ...SOURCE_BASE_ORDER.filter(id => !priority.includes(id) && !deprioritized.includes(id)),
    ...deprioritized,
    ...SOURCE_BASE_ORDER,
  ];
  const seen = new Set<string>();
  return combined.filter(id => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
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
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(10,12,25,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#e50914',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  iconCircleSmall: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  seekLabel: {
    position: 'absolute',
    bottom: 8,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
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
  width: 64,
  borderRadius: 32,
  backgroundColor: 'rgba(20,22,32,0.85)', // matches glass parent
  overflow: 'hidden',
  justifyContent: 'flex-end',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.12)',
},
ccFill: {
  width: '100%',
},
ccIconWrap: {
  position: 'absolute',
  top: '45%',
  left: 0,
  right: 0,
  alignItems: 'center',
},
  ccLabel: {
  marginTop: 10,
  fontSize: 12,
  fontWeight: '600',
  color: 'rgba(255,255,255,0.9)',
},
  manualOverrideContainer: {
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  manualOverrideTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  manualUrlInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
    marginBottom: 12,
  },
  manualOverrideButton: {
    backgroundColor: '#e50914',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  manualOverrideButtonDisabled: {
    backgroundColor: 'rgba(229,9,20,0.5)',
  },
  manualOverrideButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Buffering pill styles
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
    borderRadius: 24,
    backgroundColor: 'rgba(15,18,35,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  bufferPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  // New Styles for Surprise Features
  reactionToolbar: {
    position: 'absolute',
    bottom: 140,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    gap: 12,
    zIndex: 100,
  },
  reactionButton: {
    padding: 2,
  },
  reactionEmojiText: {
    fontSize: 24,
  },
  pollCardContainer: {
    position: 'absolute',
    top: 80,
    left: 20,
    zIndex: 200,
  },
  pollCard: {
    width: 260,
    backgroundColor: 'rgba(15,18,35,0.92)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
  },
  pollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pollTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pollQuestion: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  pollOption: {
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  pollProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  pollOptionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    zIndex: 1,
  },
  pollPercent: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '700',
    zIndex: 1,
  },
  votedHint: {
    color: '#4ade80',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '600',
  },
  participantPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(229,9,20,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.4)',
    marginRight: 10,
  },
  participantCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  faceCamRow: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 10,
    gap: 10,
    zIndex: 1000,
  },
  faceCamContainer: {
    width: 100,
    height: 70,
    borderRadius: 12,
    backgroundColor: '#000',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  faceCamView: {
    flex: 1,
  },
  faceCamLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  faceCamLabelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default WatchPartyPlayerScreen;
