import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IMAGE_BASE_URL } from '../../constants/api';
import { pushWithOptionalInterstitial } from '../../lib/ads/navigate';
import { createPrefetchKey, storePrefetchedPlayback } from '../../lib/videoPrefetchCache';
import { enqueueDownload } from '../../lib/downloadManager';
import { getHlsVariantOptions } from '../../lib/hlsDownloader';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { scrapeImdbTrailer as scrapeIMDbTrailer } from '../../src/providers/scrapeImdbTrailer';
import { scrapePStream, usePStream } from '../../src/pstream/usePStream';
import { useAccent } from '../components/AccentContext';
import { buildScrapeDebugTag, buildSourceOrder } from '../../lib/videoPlaybackShared';

import { DownloadQualityPicker, type DownloadQualityOption } from '../../components/DownloadQualityPicker';

import { CastMember, Media } from '../../types';
import CastList from './CastList';
import EpisodeList from './EpisodeList';
import RelatedMovies from './RelatedMovies';
import TrailerList from './TrailerList';

interface VideoType {
  key: string;
  name: string;
}

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
  const [imdbTrailer, setIMDbTrailer] = useState<StreamResult | null>(null);
  const [autoPlayed, setAutoPlayed] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [countdownProgress, setCountdownProgress] = useState(0);
  const [autoPlaySecondsLeft, setAutoPlaySecondsLeft] = useState(5);
  const [selectedTab, setSelectedTab] = useState<'story' | 'episodes' | 'trailers' | 'related' | 'cast'>('story');
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<any>(null);
  const router = useRouter();
  const headerRef = React.useRef<any>(null);
  const scrollViewRef = React.useRef<any>(null);
  const normalizedMediaType: 'movie' | 'tv' = typeof mediaType === 'string' && mediaType === 'tv' ? 'tv' : 'movie';
  const { accentColor } = useAccent();
  const { currentPlan } = useSubscription();

  // Animation values
  const scrollY = React.useRef(new Animated.Value(0)).current;
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
  // Auto-fetch IMDb trailer and auto-play after a delay
  useEffect(() => {
    setIMDbTrailer(null);
    setAutoPlayed(false);
    setShowTrailer(false);
    setCountdownProgress(0);
    setAutoPlaySecondsLeft(5);
    if (!movie || !movie.imdb_id) return;
    let cancelled = false;
    const autoplayMs = 5000;
    scrapeIMDbTrailer({ imdb_id: movie.imdb_id })
      .then((result) => {
        if (!cancelled && result) {
          setIMDbTrailer(result);
          const startedAt = Date.now();
          countdownInterval.current && clearInterval(countdownInterval.current);
          countdownInterval.current = setInterval(() => {
            const elapsed = Date.now() - startedAt;
            const progress = Math.min(1, elapsed / autoplayMs);
            setCountdownProgress(progress);
            const remaining = Math.max(0, autoplayMs - elapsed);
            setAutoPlaySecondsLeft(Math.max(0, Math.ceil(remaining / 1000)));
            if (progress >= 1) {
              clearInterval(countdownInterval.current as any);
              setAutoPlayed(true);
              setShowTrailer(true);
              setTrailerLoading(false);
            }
          }, 200);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      countdownInterval.current && clearInterval(countdownInterval.current);
    };
  }, [movie?.imdb_id]);
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
      // ensure any in-header trailer is paused so audio focus can be acquired by the player
      try {
        headerRef.current?.pauseTrailer?.();
        // Reset trailer state to prevent color interference in video player
        setAutoPlayed(false);
      } catch {}
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

    // Pause any playing trailer before navigating
    try {
      headerRef.current?.pauseTrailer?.();
      // Reset trailer state to prevent color interference in video player
      setAutoPlayed(false);
    } catch {}

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

  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.scrollViewContent}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
    >
      <DownloadQualityPicker
        visible={qualityPickerVisible}
        title={qualityPickerTitle}
        options={qualityPickerOptions}
        onClose={() => setQualityPickerVisible(false)}
        onSelect={handleQualityPick}
      />
      {/* Sticky Header */}
      <View style={styles.stickyHeader}>
        <View style={styles.headerWrap}>
          <LinearGradient
            colors={[
              accentColor ? `${accentColor}33` : 'rgba(229,9,20,0.22)',
              'rgba(10,12,24,0.4)'
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
                <Text style={styles.headerText}>
                  {movie?.title || movie?.name || 'Details'}
                </Text>
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
                  <Ionicons name="chatbubble-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => movie && onAddToMyList(movie)} style={styles.iconBtn}>
                <LinearGradient
                  colors={['#e50914', '#b20710']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconBg}
                >
                  <Ionicons name="bookmark-outline" size={22} color="#ffffff" style={styles.iconMargin} />
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
                <LinearGradient
                  colors={['#e50914', '#b20710']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconBg}
                >
                  <Ionicons name="chevron-back" size={22} color="#ffffff" style={styles.iconMargin} />
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
        {/* Hero Poster Section - Cinematic and Clean */}
        <View style={styles.heroSection}>
          {/* Poster Image */}
          {!showTrailer && (
            <Image
              source={{
                uri: movie?.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : 'https://via.placeholder.com/800x450/111/fff?text=No+Poster'
              }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          )}

          {/* Trailer Video */}
          {showTrailer && imdbTrailer?.url && (
            <Video
              ref={videoRef}
              source={{ uri: imdbTrailer.url }}
              style={styles.heroVideo}
              resizeMode={ResizeMode.COVER}
              shouldPlay={true}
              isMuted={isMuted}
              isLooping={true}
              onLoadStart={() => setTrailerLoading(true)}
              onLoad={() => setTrailerLoading(false)}
              onError={() => {
                setTrailerLoading(false);
                setShowTrailer(false);
              }}
            />
          )}

          {/* Loading indicator for trailer */}
          {showTrailer && trailerLoading && (
            <View style={styles.trailerLoading}>
              <Ionicons name="play-circle-outline" size={60} color="rgba(255,255,255,0.8)" />
              <Text style={styles.loadingText}>Loading trailer...</Text>
            </View>
          )}

          {/* Multi-layer gradient overlay for depth */}
          <LinearGradient
            colors={[
              "rgba(0,0,0,0.1)",
              "rgba(0,0,0,0.3)",
              "rgba(10,6,20,0.7)",
              "rgba(10,6,20,0.9)"
            ]}
            locations={[0, 0.3, 0.7, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.heroOverlay}
          />

          {/* Title and Year - Centered and Prominent */}
          <Animated.View style={[styles.heroContent, { opacity: heroFadeAnim }]}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {movie?.title || movie?.name || 'Untitled'}
            </Text>
            <Text style={styles.heroYear}>
              {movie?.release_date ? new Date(movie.release_date).getFullYear() :
               movie?.first_air_date ? new Date(movie.first_air_date).getFullYear() : ''}
            </Text>

            {/* Rating badge */}
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <Text style={styles.ratingText}>
                {movie?.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}
              </Text>
            </View>
          </Animated.View>

          {/* Volume Control Button */}
          {showTrailer && !trailerLoading && (
            <TouchableOpacity
              style={styles.volumeButton}
              onPress={() => setIsMuted(!isMuted)}
            >
              <Ionicons
                name={isMuted ? "volume-mute" : "volume-high"}
                size={24}
                color="#fff"
              />
            </TouchableOpacity>
          )}

          {/* Genre tags positioned at bottom */}
          <View style={styles.genreTags}>
            <Text style={styles.genreText}>
              {normalizedMediaType === 'tv' ? 'TV Series' : 'Movie'} • {runtimeMinutes ? `${runtimeMinutes}m` : 'N/A'}
            </Text>
          </View>

          {/* Trailer countdown indicator */}
          {!showTrailer && imdbTrailer && (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>Trailer in {autoPlaySecondsLeft || 1}s</Text>
              <View style={styles.countdownBar}>
                <Animated.View style={[styles.countdownProgress, {
                  width: `${Math.min(100, Math.max(0, countdownProgress * 100))}%`
                }]} />
              </View>
              <TouchableOpacity
                style={styles.inlinePlayNow}
                onPress={() => {
                  setAutoPlayed(true);
                  setShowTrailer(true);
                  countdownInterval.current && clearInterval(countdownInterval.current);
                  setCountdownProgress(1);
                }}
              >
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={styles.inlinePlayText}>Play teaser now</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

      {/* Floating Action Buttons - Modern UX */}
      <Animated.View style={[styles.floatingActions, { transform: [{ scale: fabScaleAnim }] }]}>
        <TouchableOpacity
          style={[styles.fabPrimary, isLaunchingPlayer && styles.fabDisabled, { backgroundColor: accentColor || '#ff6b9d', shadowColor: accentColor || '#ff6b9d' }]}
          onPress={handlePlayMovie}
          disabled={isLaunchingPlayer}
        >
          <Ionicons name="play" size={24} color="#fff" />
          <Text style={styles.fabPrimaryText}>
            {isLaunchingPlayer ? 'Loading...' : 'Play'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.fabSecondary]}
          onPress={handleDownload}
        >
          <Ionicons
            name={'cloud-download-outline'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Tab Navigation */}
      <Animated.View style={[styles.tabContainer, { opacity: sectionsAnim }]}>
        <View style={styles.tabButtons}>
          {[
            { key: 'story', label: 'Story', icon: 'book-outline' },
            mediaType === 'tv' && seasons?.length > 0 ? { key: 'episodes', label: 'Episodes', icon: 'albums-outline' } : null,
            { key: 'trailers', label: 'Trailers', icon: 'play-circle-outline' },
            { key: 'related', label: 'More Like This', icon: 'heart-outline' },
            { key: 'cast', label: 'Cast', icon: 'people-outline' },
          ].filter(Boolean).map((tab) => (
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
              <Text style={[styles.tabButtonText, selectedTab === (tab as any).key && styles.tabButtonTextActive]}>
                {(tab as any).label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {selectedTab === 'story' && (
            <Animated.View style={[styles.storyCard, { transform: [{ translateY: storyCardAnim.interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) }], opacity: storyCardAnim }]}>
              <Text style={styles.storyText}>
                {movie?.overview || 'No description available for this title.'}
              </Text>
              <View style={styles.metaGrid}>
                <View style={styles.metaTile}>
                  <Text style={styles.metaTileLabel}>Released</Text>
                  <Text style={styles.metaTileValue}>{releaseDateValue || 'TBA'}</Text>
                </View>
                <View style={styles.metaTile}>
                  <Text style={styles.metaTileLabel}>Language</Text>
                  <Text style={styles.metaTileValue}>{(movie as any)?.original_language?.toUpperCase?.() || '—'}</Text>
                </View>
                <View style={styles.metaTile}>
                  <Text style={styles.metaTileLabel}>Popularity</Text>
                  <Text style={styles.metaTileValue}>{Math.round((movie as any)?.popularity ?? 0)}</Text>
                </View>
                <View style={styles.metaTile}>
                  <Text style={styles.metaTileLabel}>Votes</Text>
                  <Text style={styles.metaTileValue}>{(movie as any)?.vote_count ?? 0}</Text>
                </View>
              </View>
              <View style={styles.immersiveRow}>
                <View style={styles.immersiveBadge}>
                  <Ionicons name="color-filter" size={18} color="#fff" />
                  <Text style={styles.immersiveText}>Dolby Vision</Text>
                </View>
                <View style={styles.immersiveBadge}>
                  <Ionicons name="rocket-outline" size={18} color="#fff" />
                  <Text style={styles.immersiveText}>Instant Start</Text>
                </View>
                <View style={styles.immersiveBadge}>
                  <Ionicons name="people-outline" size={18} color="#fff" />
                  <Text style={styles.immersiveText}>Watch parties ready</Text>
                </View>
              </View>
            </Animated.View>
          )}

          {selectedTab === 'episodes' && mediaType === 'tv' && seasons?.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="albums-outline" size={20} color={accentColor || '#ff6b9d'} />
                <Text style={styles.sectionTitle}>Episodes</Text>
                <Text style={styles.sectionHelper}>Binge or jump to a moment.</Text>
              </View>
              <EpisodeList
                seasons={seasons}
                onPlayEpisode={handlePlayEpisode}
                onDownloadEpisode={handleDownloadEpisode}
                disabled={isLoading || isLaunchingPlayer}
                episodeDownloads={episodeDownloads}
              />
            </View>
          )}

          {selectedTab === 'trailers' && (
            <View style={styles.sectionCard}>
              <TrailerList trailers={trailers} isLoading={isLoading} onWatchTrailer={onWatchTrailer} />
            </View>
          )}

          {selectedTab === 'related' && (
            <View style={styles.sectionCard}>
              <RelatedMovies
                relatedMovies={relatedMovies}
                isLoading={isLoading}
                onSelectRelated={onSelectRelated}
              />
            </View>
          )}

          {selectedTab === 'cast' && (
            <View style={styles.sectionCard}>
              <CastList cast={cast} />
            </View>
          )}

          {mediaType === 'tv' && selectedTab === 'trailers' && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="tv-outline" size={20} color={accentColor || '#ff6b9d'} />
                <Text style={styles.sectionTitle}>Season Sneak Peek</Text>
                <Text style={styles.sectionHelper}>Catch up before you stream.</Text>
              </View>
              <EpisodeList
                seasons={seasons}
                onPlayEpisode={handlePlayEpisode}
                onDownloadEpisode={handleDownloadEpisode}
                disabled={isLoading || isLaunchingPlayer}
                episodeDownloads={episodeDownloads}
              />
            </View>
          )}
        </View>
      </Animated.View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollViewContent: {
    paddingBottom: 40,
    paddingTop: 0,
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
