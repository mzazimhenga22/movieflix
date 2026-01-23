import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Device from 'expo-device';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Alert,
  Image,
  InteractionManager,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../../constants/api';
import { getAccentFromPosterPath } from '../../constants/theme';
import { enqueueDownload } from '../../lib/downloadManager';
import { getProfileScopedKey } from '../../lib/profileStorage';
import { buildScrapeDebugTag, buildSourceOrder } from '../../lib/videoPlaybackShared';
import { scrapeImdbTrailer } from '../../src/providers/scrapeImdbTrailer';
import { usePStream } from '../../src/pstream/usePStream';
import type { ScrapeMedia } from '../../providers-temp/lib/index.js';
import type { DownloadItem, Media } from '../../types';
import TvGlassPanel from '../components/TvGlassPanel';
import TvRail from '../components/TvRail';
import { TvFocusable } from '../components/TvSpatialNavigation';

type DetailsState = {
  media: Media;
  genres: { id: number; name: string }[];
  runtimeMinutes?: number | null;
  imdbId?: string | null;
  similar: Media[];
};

type SeasonMeta = {
  id: number;
  name: string;
  season_number: number;
  episode_count?: number;
  poster_path?: string | null;
};

type EpisodeMeta = {
  id: number;
  episode_number: number;
  name: string;
  overview?: string;
  runtime?: number | null;
  still_path?: string | null;
};

const toYear = (date?: string) => {
  if (!date) return undefined;
  const year = new Date(date).getFullYear();
  return Number.isFinite(year) ? year : undefined;
};

export default function TvDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;
  const mediaType = (typeof params.mediaType === 'string' ? params.mediaType : 'movie') as 'movie' | 'tv';

  const { scrape, loading: scraping } = usePStream();

  const [state, setState] = useState<DetailsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [seasons, setSeasons] = useState<SeasonMeta[]>([]);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number | null>(null);
  const [episodesBySeason, setEpisodesBySeason] = useState<Record<number, EpisodeMeta[]>>({});
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);

  const [myList, setMyList] = useState<Media[]>([]);
  const [myListKey, setMyListKey] = useState<string>('myList');

  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [downloadsKey, setDownloadsKey] = useState<string>('downloads');
  const [downloading, setDownloading] = useState(false);

  const lowEndDevice = useMemo(() => {
    const mem = typeof Device.totalMemory === 'number' ? Device.totalMemory : null;
    const year = typeof Device.deviceYearClass === 'number' ? Device.deviceYearClass : null;
    if (typeof mem === 'number' && mem > 0 && mem < 3_000_000_000) return true;
    if (typeof year === 'number' && year > 0 && year < 2017) return true;
    return false;
  }, []);

  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerFocused, setTrailerFocused] = useState(false);

  useEffect(() => {
    let alive = true;
    void getProfileScopedKey('myList').then((key) => {
      if (!alive) return;
      setMyListKey(key);
      AsyncStorage.getItem(key)
        .then((raw) => {
          if (!alive) return;
          const parsed = raw ? (JSON.parse(raw) as Media[]) : [];
          setMyList(Array.isArray(parsed) ? parsed : []);
        })
        .catch(() => {
          if (alive) setMyList([]);
        });
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void getProfileScopedKey('downloads').then((key) => {
      if (!alive) return;
      setDownloadsKey(key);
      AsyncStorage.getItem(key)
        .then((raw) => {
          if (!alive) return;
          const parsed = raw ? (JSON.parse(raw) as DownloadItem[]) : [];
          setDownloads(Array.isArray(parsed) ? parsed : []);
        })
        .catch(() => {
          if (alive) setDownloads([]);
        });
    });
    return () => {
      alive = false;
    };
  }, []);

  const inMyList = useMemo(() => {
    if (!state?.media?.id) return false;
    return myList.some((it) => it?.id === state.media.id);
  }, [myList, state?.media?.id]);

  const existingDownload = useMemo(() => {
    if (!state?.media?.id) return null;
    return downloads.find((d) => d.mediaId === state.media.id) ?? null;
  }, [downloads, state?.media?.id]);

  const accent = useMemo(() => {
    const poster = state?.media?.poster_path ?? state?.media?.backdrop_path;
    return getAccentFromPosterPath(poster) ?? '#e50914';
  }, [state?.media?.backdrop_path, state?.media?.poster_path]);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setError('Missing id');
      setLoading(false);
      return;
    }

    setSeasons([]);
    setSelectedSeasonNumber(null);
    setEpisodesBySeason({});
    setEpisodesError(null);

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${API_BASE_URL}/${mediaType}/${id}?api_key=${API_KEY}&append_to_response=similar,external_ids`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load details');
        const json = await res.json();

        const poster_path = (json.poster_path as string | undefined) ?? undefined;
        const backdrop_path = (json.backdrop_path as string | undefined) ?? undefined;
        const overview = (json.overview as string | undefined) ?? undefined;
        const vote_average = typeof json.vote_average === 'number' ? (json.vote_average as number) : undefined;
        const release_date = (json.release_date as string | undefined) ?? undefined;
        const first_air_date = (json.first_air_date as string | undefined) ?? undefined;
        const runtimeMinutes =
          typeof json.runtime === 'number'
            ? (json.runtime as number)
            : Array.isArray(json.episode_run_time) && typeof json.episode_run_time[0] === 'number'
              ? (json.episode_run_time[0] as number)
              : null;

        const genres = Array.isArray(json.genres)
          ? (json.genres as { id: number; name: string }[])
          : [];
        const imdbId = (json.external_ids?.imdb_id as string | undefined) ?? (json.imdb_id as string | undefined) ?? null;

        const parsedSeasons: SeasonMeta[] =
          mediaType === 'tv' && Array.isArray(json.seasons)
            ? (json.seasons as any[])
                .filter((s) => typeof s?.season_number === 'number' && s.season_number > 0)
                .map((s) => ({
                  id: Number(s.id),
                  name: String(s.name ?? `Season ${s.season_number}`),
                  season_number: Number(s.season_number),
                  episode_count: typeof s.episode_count === 'number' ? (s.episode_count as number) : undefined,
                  poster_path: (s.poster_path as string | null | undefined) ?? null,
                }))
                .filter((s) => Number.isFinite(s.id) && Number.isFinite(s.season_number))
                .sort((a, b) => a.season_number - b.season_number)
            : [];

        const similarRaw = (json.similar?.results ?? []) as any[];
        const similar: Media[] = similarRaw
          .filter(Boolean)
          .map((it) => ({
            id: Number(it.id),
            title: it.title,
            name: it.name,
            poster_path: it.poster_path,
            backdrop_path: it.backdrop_path,
            overview: it.overview,
            vote_average: it.vote_average,
            genre_ids: it.genre_ids,
            release_date: it.release_date,
            first_air_date: it.first_air_date,
            media_type: mediaType,
          }))
          .filter((it) => Number.isFinite(it.id));

        const media: Media = {
          id: Number(id),
          title: json.title,
          name: json.name,
          poster_path,
          backdrop_path,
          overview,
          vote_average,
          genre_ids: genres.map((g) => g.id),
          release_date,
          first_air_date,
          media_type: mediaType,
          imdb_id: imdbId,
        };

        if (cancelled) return;
        setState({ media, genres, runtimeMinutes, imdbId, similar });
        setSeasons(parsedSeasons);

        if (mediaType === 'tv' && parsedSeasons.length) {
          const defaultSeason =
            parsedSeasons.find((s) => s.season_number === 1)?.season_number ?? parsedSeasons[0]!.season_number;
          setSelectedSeasonNumber(defaultSeason);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, mediaType]);

  useEffect(() => {
    let cancelled = false;
    let interactionHandle: { cancel?: () => void } | null = null;
    const imdb = state?.imdbId ?? state?.media?.imdb_id ?? null;
    if (!imdb) {
      setTrailerUrl(null);
      return () => {
        cancelled = true;
      };
    }

    setTrailerLoading(true);

    const cacheKey = `tv:trailerUrl:${imdb}`;
    void (async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (!cancelled && cached) {
          setTrailerUrl(cached);
          setTrailerLoading(false);
          return;
        }

        interactionHandle = InteractionManager.runAfterInteractions(() => {
          void (async () => {
            try {
              const res = await scrapeImdbTrailer({ imdb_id: imdb });
              const url = res?.url ? String(res.url) : null;
              if (cancelled) return;
              setTrailerUrl(url);
              if (url) {
                try {
                  await AsyncStorage.setItem(cacheKey, url);
                } catch {
                  // ignore
                }
              }
            } catch {
              if (!cancelled) setTrailerUrl(null);
            } finally {
              if (!cancelled) setTrailerLoading(false);
            }
          })();
        });
      } catch {
        if (!cancelled) {
          setTrailerUrl(null);
          setTrailerLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        interactionHandle?.cancel?.();
      } catch {
        // ignore
      }
    };
  }, [state?.imdbId, state?.media?.imdb_id]);

  useEffect(() => {
    let alive = true;
    if (!id) return;
    if (mediaType !== 'tv') return;
    if (!selectedSeasonNumber) return;
    if (episodesBySeason[selectedSeasonNumber]) return;

    const loadSeason = async () => {
      setEpisodesLoading(true);
      setEpisodesError(null);
      try {
        const seasonUrl = `${API_BASE_URL}/tv/${id}/season/${selectedSeasonNumber}?api_key=${API_KEY}`;
        const res = await fetch(seasonUrl);
        if (!res.ok) throw new Error('Failed to load episodes');
        const json = await res.json();

        const episodesRaw = Array.isArray(json.episodes) ? (json.episodes as any[]) : [];
        const episodes: EpisodeMeta[] = episodesRaw
          .filter(Boolean)
          .map((ep) => ({
            id: Number(ep.id),
            episode_number: Number(ep.episode_number),
            name: String(ep.name ?? `Episode ${ep.episode_number}`),
            overview: (ep.overview as string | undefined) ?? undefined,
            runtime: typeof ep.runtime === 'number' ? (ep.runtime as number) : null,
            still_path: (ep.still_path as string | null | undefined) ?? null,
          }))
          .filter((ep) => Number.isFinite(ep.id) && Number.isFinite(ep.episode_number))
          .sort((a, b) => a.episode_number - b.episode_number);

        if (!alive) return;
        setEpisodesBySeason((prev) => ({ ...prev, [selectedSeasonNumber]: episodes }));
      } catch (e: any) {
        if (!alive) return;
        setEpisodesError(e?.message ?? 'Failed to load episodes');
      } finally {
        if (alive) setEpisodesLoading(false);
      }
    };

    void loadSeason();
    return () => {
      alive = false;
    };
  }, [id, mediaType, episodesBySeason, selectedSeasonNumber]);

  const toggleMyList = useCallback(async () => {
    if (!state?.media) return;
    const entry = state.media;
    try {
      const next = inMyList ? myList.filter((it) => it?.id !== entry.id) : [entry, ...myList];
      setMyList(next);
      await AsyncStorage.setItem(myListKey, JSON.stringify(next.slice(0, 80)));
    } catch {
      // ignore
    }
  }, [inMyList, myList, myListKey, state?.media]);

  const startDownload = useCallback(async () => {
    if (!state?.media) return;
    if (existingDownload) {
      router.push('/(tabs)/downloads');
      return;
    }

    try {
      setDownloading(true);

      const title = state.media.title || state.media.name || 'Untitled';
      const releaseYear =
        toYear(state.media.release_date ?? state.media.first_air_date) ?? new Date().getFullYear();

      const scrapeMedia: ScrapeMedia =
        (state.media.media_type ?? mediaType) === 'tv'
          ? ({
              type: 'show',
              title,
              tmdbId: String(state.media.id),
              imdbId: state.imdbId ?? undefined,
              releaseYear,
              season: {
                number: 1,
                tmdbId: '',
                title: 'Season 1',
              },
              episode: {
                number: 1,
                tmdbId: '',
              },
            } as any)
          : ({
              type: 'movie',
              title,
              tmdbId: String(state.media.id),
              imdbId: state.imdbId ?? undefined,
              releaseYear,
            } as any);

      const playback = await scrape(scrapeMedia, {
        sourceOrder: buildSourceOrder(false),
        debugTag: buildScrapeDebugTag('download', title),
      });

      if (!playback?.uri) throw new Error('No stream found');
      const isHls = playback.stream?.type === 'hls' || playback.uri.toLowerCase().includes('.m3u8');

      await enqueueDownload({
        title,
        mediaId: state.media.id,
        mediaType: (state.media.media_type ?? mediaType) as any,
        runtimeMinutes: state.runtimeMinutes ?? undefined,
        seasonNumber: (state.media.media_type ?? mediaType) === 'tv' ? 1 : undefined,
        episodeNumber: (state.media.media_type ?? mediaType) === 'tv' ? 1 : undefined,
        releaseDate: state.media.release_date ?? state.media.first_air_date,
        posterPath: state.media.poster_path ?? null,
        backdropPath: state.media.backdrop_path ?? null,
        overview: state.media.overview ?? null,
        downloadType: isHls ? 'hls' : 'file',
        sourceUrl: playback.uri,
        headers: playback.headers,
      });

      const raw = await AsyncStorage.getItem(downloadsKey);
      const parsed = raw ? (JSON.parse(raw) as DownloadItem[]) : [];
      setDownloads(Array.isArray(parsed) ? parsed : []);

      Alert.alert('Added to downloads', 'You can track progress in Downloads.');
      router.push('/(tabs)/downloads');
    } catch (err: any) {
      Alert.alert('Download failed', err?.message ?? 'Unable to start download.');
    } finally {
      setDownloading(false);
    }
  }, [downloadsKey, existingDownload, mediaType, router, scrape, state?.imdbId, state?.media, state?.runtimeMinutes]);

  const play = useCallback(() => {
    const media = state?.media;
    if (!media) return;

    const title = media.title || media.name || 'Now Playing';
    const releaseYear = toYear(media.release_date ?? media.first_air_date);

    const baseParams: Record<string, string> = {
      tmdbId: String(media.id),
      mediaType: media.media_type ?? mediaType,
      title,
      posterPath: media.poster_path ?? '',
      backdropPath: media.backdrop_path ?? '',
      overview: media.overview ?? '',
      ...(releaseYear ? { releaseYear: String(releaseYear) } : null),
      ...(state?.imdbId ? { imdbId: state.imdbId } : null),
    };

    if ((media.media_type ?? mediaType) === 'tv') {
      const seasonNumber = selectedSeasonNumber ?? 1;
      const seasonTitle =
        seasons.find((s) => s.season_number === seasonNumber)?.name ?? `Season ${seasonNumber}`;
      const seasonEpisodes = episodesBySeason[seasonNumber];
      const episodeNumber = seasonEpisodes?.[0]?.episode_number ?? 1;
      baseParams.seasonNumber = String(seasonNumber);
      baseParams.episodeNumber = String(episodeNumber);
      baseParams.seasonTitle = seasonTitle;

      if (Array.isArray(seasonEpisodes) && seasonEpisodes.length) {
        const minimalQueue = seasonEpisodes.slice(0, 30).map((ep) => ({
          id: ep.id,
          title: ep.name,
          seasonName: seasonTitle,
          seasonNumber,
          episodeNumber: ep.episode_number,
          stillPath: ep.still_path ?? null,
          episodeTmdbId: ep.id,
          seasonEpisodeCount: seasons.find((s) => s.season_number === seasonNumber)?.episode_count,
        }));
        baseParams.upcomingEpisodes = JSON.stringify(minimalQueue);
      }
    }

    router.push({ pathname: '/video-player', params: baseParams });
  }, [episodesBySeason, mediaType, router, seasons, selectedSeasonNumber, state?.imdbId, state?.media]);

  const playEpisode = useCallback(
    (episode: EpisodeMeta) => {
      const media = state?.media;
      if (!media) return;
      if ((media.media_type ?? mediaType) !== 'tv') return;

      const title = media.title || media.name || 'Now Playing';
      const releaseYear = toYear(media.release_date ?? media.first_air_date);
      const seasonNumber = selectedSeasonNumber ?? 1;
      const seasonTitle =
        seasons.find((s) => s.season_number === seasonNumber)?.name ?? `Season ${seasonNumber}`;
      const seasonEpisodes = episodesBySeason[seasonNumber] ?? [];
      const minimalQueue = seasonEpisodes.slice(0, 30).map((ep) => ({
        id: ep.id,
        title: ep.name,
        seasonName: seasonTitle,
        seasonNumber,
        episodeNumber: ep.episode_number,
        stillPath: ep.still_path ?? null,
        episodeTmdbId: ep.id,
        seasonEpisodeCount: seasons.find((s) => s.season_number === seasonNumber)?.episode_count,
      }));

      router.push({
        pathname: '/video-player',
        params: {
          tmdbId: String(media.id),
          mediaType: media.media_type ?? mediaType,
          title,
          posterPath: media.poster_path ?? '',
          backdropPath: media.backdrop_path ?? '',
          overview: media.overview ?? '',
          ...(releaseYear ? { releaseYear: String(releaseYear) } : null),
          ...(state?.imdbId ? { imdbId: state.imdbId } : null),
          seasonNumber: String(seasonNumber),
          episodeNumber: String(episode.episode_number),
          seasonTitle,
          episodeTitle: episode.name,
          ...(minimalQueue.length ? { upcomingEpisodes: JSON.stringify(minimalQueue) } : null),
        },
      });
    },
    [episodesBySeason, mediaType, router, seasons, selectedSeasonNumber, state?.imdbId, state?.media],
  );

  const playOffline = useCallback(() => {
    if (!existingDownload) return;

    const seasonNumber = typeof existingDownload.seasonNumber === 'number' ? existingDownload.seasonNumber : undefined;
    const episodeNumber = typeof existingDownload.episodeNumber === 'number' ? existingDownload.episodeNumber : undefined;
    const maybeEpisodeParams =
      existingDownload.mediaType === 'tv'
        ? {
            ...(seasonNumber ? { seasonNumber: String(seasonNumber) } : {}),
            ...(episodeNumber ? { episodeNumber: String(episodeNumber) } : {}),
            ...(seasonNumber ? { seasonTitle: `Season ${seasonNumber}` } : {}),
          }
        : {};

    router.push({
      pathname: '/video-player',
      params: {
        title: existingDownload.title,
        videoUrl: existingDownload.localUri,
        streamType: existingDownload.downloadType === 'hls' ? 'hls' : 'file',
        mediaType: existingDownload.mediaType,
        tmdbId: existingDownload.mediaId?.toString(),
        releaseYear: existingDownload.releaseDate?.slice(0, 4),
        ...(existingDownload.posterPath ? { posterPath: existingDownload.posterPath } : {}),
        ...(existingDownload.backdropPath ? { backdropPath: existingDownload.backdropPath } : {}),
        ...(existingDownload.overview ? { overview: existingDownload.overview } : {}),
        ...(existingDownload.releaseDate ? { releaseDate: existingDownload.releaseDate } : {}),
        ...maybeEpisodeParams,
      },
    });
  }, [existingDownload, router]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <LinearGradient
          colors={['#150a13', '#070815', '#05060f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color="#e50914" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (error || !state) {
    return (
      <View style={styles.loadingWrap}>
        <LinearGradient
          colors={['#150a13', '#070815', '#05060f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.errorTitle}>Couldn’t load</Text>
        <Text style={styles.errorText}>{error ?? 'Unknown error'}</Text>
        <TvFocusable onPress={() => router.back()} style={styles.secondaryBtn} isTVSelectable={true} accessibilityLabel="Go back">
          <Text style={styles.secondaryText}>Go back</Text>
        </TvFocusable>
      </View>
    );
  }

  const hero = state.media.backdrop_path || state.media.poster_path;
  const heroUri = hero ? `${IMAGE_BASE_URL}${hero}` : null;
  const title = state.media.title || state.media.name || 'Untitled';
  const year = toYear(state.media.release_date ?? state.media.first_air_date);
  const rating = typeof state.media.vote_average === 'number' ? state.media.vote_average.toFixed(1) : null;
  const subtitleBits = [
    year ? String(year) : null,
    rating ? `★ ${rating}` : null,
    state.runtimeMinutes ? `${state.runtimeMinutes}m` : null,
  ].filter(Boolean);

  const isTvShow = (state.media.media_type ?? mediaType) === 'tv';
  const selectedSeasonMeta =
    selectedSeasonNumber != null
      ? seasons.find((s) => s.season_number === selectedSeasonNumber) ?? null
      : null;
  const selectedEpisodes =
    selectedSeasonNumber != null ? episodesBySeason[selectedSeasonNumber] ?? [] : [];

  const playTrailer = () => {
    if (!trailerUrl) return;
    router.push({
      pathname: '/video-player',
      params: {
        title: `${title} • Trailer`,
        videoUrl: trailerUrl,
        streamType: 'file',
        mediaType,
        tmdbId: state?.media?.id ? String(state.media.id) : undefined,
        ...(state?.media?.poster_path ? { posterPath: state.media.poster_path } : {}),
        ...(state?.media?.backdrop_path ? { backdropPath: state.media.backdrop_path } : {}),
      },
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[accent, '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.shell}>
        <TvGlassPanel accent={accent} style={styles.panel}>
          <View style={styles.panelInner}>
            <View style={styles.topBar}>
              <TvFocusable
                onPress={() => router.back()}
                isTVSelectable={true}
                accessibilityLabel="Back"
                style={({ focused }: any) => [styles.iconBtn, focused ? styles.btnFocused : null]}
              >
                <Ionicons name="arrow-back" size={18} color="#fff" />
              </TvFocusable>

              <View style={styles.titleStack}>
                <Text style={styles.screenTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.screenSubtitle} numberOfLines={1}>
                  {subtitleBits.length ? subtitleBits.join('  •  ') : ' '}
                </Text>
              </View>

              <View style={styles.topActions}>
                <TvFocusable
                  onPress={() => void toggleMyList()}
                  isTVSelectable={true}
                  accessibilityLabel={inMyList ? 'Remove from list' : 'Add to list'}
                  style={({ focused }: any) => [styles.iconBtn, focused ? styles.btnFocused : null]}
                >
                  <Ionicons name={inMyList ? 'checkmark' : 'add'} size={18} color="#fff" />
                </TvFocusable>
                <TvFocusable
                  onPress={() => (existingDownload ? playOffline() : void startDownload())}
                  disabled={downloading || scraping}
                  isTVSelectable={true}
                  accessibilityLabel={existingDownload ? 'Play offline' : 'Download'}
                  style={({ focused }: any) => [
                    styles.iconBtn,
                    (downloading || scraping) ? { opacity: 0.6 } : null,
                    focused ? styles.btnFocused : null,
                  ]}
                >
                  {downloading || scraping ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Ionicons name={existingDownload ? 'download' : 'cloud-download'} size={18} color="#fff" />
                  )}
                </TvFocusable>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.heroRow}>
                <View style={styles.mediaCol}>
                  <View style={styles.mediaCard}>
                    {heroUri ? <Image source={{ uri: heroUri }} style={styles.heroImage} /> : <View style={styles.heroFallback} />}
                    <LinearGradient
                      pointerEvents="none"
                      colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.48)', 'rgba(0,0,0,0.68)']}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={styles.heroFade}
                    />
                    <LinearGradient
                      pointerEvents="none"
                      colors={[`${accent}55`, 'rgba(0,0,0,0)']}
                      start={{ x: 0, y: 1 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.heroAccentGlow}
                    />
                    <View style={styles.heroBadgeRow}>
                      <View style={[styles.badge, { backgroundColor: `${accent}33`, borderColor: `${accent}66` }]}>
                        <Text style={styles.badgeText}>{(state.media.media_type ?? mediaType) === 'tv' ? 'TV' : 'Movie'}</Text>
                      </View>
                      {rating ? (
                        <View style={styles.badge}>
                          <Ionicons name="star" size={14} color="#ffd700" />
                          <Text style={styles.badgeText}>{rating}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.ctaRow}>
                    <TvFocusable onPress={play} isTVSelectable={true} accessibilityLabel="Play" style={({ focused }: any) => [styles.primaryBtn, focused ? styles.btnFocused : null]}>
                      <Ionicons name="play" size={18} color="#000" />
                      <Text style={styles.primaryText}>Play</Text>
                    </TvFocusable>
                    <TvFocusable
                      onPress={() => (existingDownload ? playOffline() : void startDownload())}
                      disabled={downloading || scraping}
                      isTVSelectable={true}
                      accessibilityLabel={existingDownload ? 'Play offline' : 'Download'}
                      style={({ focused }: any) => [
                        styles.secondaryBtn,
                        (downloading || scraping) ? { opacity: 0.6 } : null,
                        focused ? styles.btnFocused : null,
                      ]}
                    >
                      <Ionicons name={existingDownload ? 'download' : 'cloud-download'} size={18} color="#fff" />
                      <Text style={styles.secondaryText}>{existingDownload ? 'Offline' : 'Download'}</Text>
                    </TvFocusable>
                    <TvFocusable onPress={() => void toggleMyList()} isTVSelectable={true} accessibilityLabel={inMyList ? 'My List' : 'Add to list'} style={({ focused }: any) => [styles.ghostBtn, focused ? styles.btnFocused : null]}>
                      <Ionicons name={inMyList ? 'checkmark' : 'add'} size={18} color="#fff" />
                      <Text style={styles.secondaryText}>{inMyList ? 'My List' : 'Add'}</Text>
                    </TvFocusable>
                  </View>
                </View>

                <View style={styles.infoCol}>
                  <Text style={styles.title} numberOfLines={2}>
                    {title}
                  </Text>
                  <Text style={styles.meta}>
                    {subtitleBits.length ? subtitleBits.join('  •  ') : '—'}
                  </Text>

                  <Text style={styles.overview} numberOfLines={6}>
                    {state.media.overview || 'No overview available.'}
                  </Text>

                  {state.genres.length ? (
                    <View style={styles.genresRow}>
                      {state.genres.slice(0, 8).map((g) => (
                        <View key={g.id} style={styles.genreChip}>
                          <Text style={styles.genreText}>{g.name}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.trailerSection}>
                    <Text style={styles.sectionTitle}>Trailer</Text>
                    {trailerLoading ? (
                      <View style={styles.trailerLoadingRow}>
                        <ActivityIndicator color="#fff" />
                        <Text style={styles.trailerHint}>Loading trailer…</Text>
                      </View>
                    ) : trailerUrl ? (
                      <TvFocusable
                        onPress={playTrailer}
                        onFocus={() => setTrailerFocused(true)}
                        onBlur={() => setTrailerFocused(false)}
                        isTVSelectable={true}
                        accessibilityLabel="Watch trailer"
                        style={({ focused }: any) => [styles.trailerCard, focused ? styles.trailerCardFocused : null]}
                      >
                        {trailerFocused && !lowEndDevice ? (
                          <Video
                            source={{ uri: trailerUrl }}
                            style={styles.trailerMedia}
                            resizeMode={ResizeMode.COVER}
                            shouldPlay
                            isLooping
                            isMuted
                            useNativeControls={false}
                          />
                        ) : heroUri ? (
                          <Image source={{ uri: heroUri }} style={styles.trailerMedia} />
                        ) : (
                          <View style={[styles.trailerMedia, styles.heroFallback]} />
                        )}
                        <LinearGradient
                          pointerEvents="none"
                          colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.78)']}
                          start={{ x: 0.5, y: 0 }}
                          end={{ x: 0.5, y: 1 }}
                          style={styles.trailerFade}
                        />
                        <View style={styles.trailerMeta}>
                          <View style={styles.trailerPlayPill}>
                            <Ionicons name="play" size={14} color="#fff" />
                            <Text style={styles.trailerPlayText}>Watch trailer</Text>
                          </View>
                        </View>
                      </TvFocusable>
                    ) : (
                      <Text style={styles.trailerHint}>Trailer unavailable.</Text>
                    )}
                  </View>

                  <View style={styles.quickGrid}>
                    <View style={styles.quickCard}>
                      <Text style={styles.quickLabel}>Audio</Text>
                      <Text style={styles.quickValue}>Original</Text>
                    </View>
                    <View style={styles.quickCard}>
                      <Text style={styles.quickLabel}>Quality</Text>
                      <Text style={styles.quickValue}>HD</Text>
                    </View>
                    <View style={styles.quickCard}>
                      <Text style={styles.quickLabel}>Subtitles</Text>
                      <Text style={styles.quickValue}>Auto</Text>
                    </View>
                  </View>

                  {isTvShow ? (
                    <View style={styles.episodesSection}>
                      <Text style={styles.sectionTitle}>Episodes</Text>

                      {seasons.length ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.seasonRow}
                        >
                          {seasons.map((s) => {
                            const selected = s.season_number === selectedSeasonNumber;
                            return (
                              <TvFocusable
                                key={s.id}
                                onPress={() => setSelectedSeasonNumber(s.season_number)}
                                isTVSelectable={true}
                                accessibilityLabel={s.name}
                                style={({ focused }: any) => [
                                  styles.seasonChip,
                                  selected ? styles.seasonChipSelected : null,
                                  focused ? styles.btnFocused : null,
                                ]}
                              >
                                <Text style={styles.seasonChipText} numberOfLines={1}>
                                  {s.name}
                                </Text>
                              </TvFocusable>
                            );
                          })}
                        </ScrollView>
                      ) : null}

                      {episodesLoading ? (
                        <View style={styles.episodesLoadingRow}>
                          <ActivityIndicator color="#fff" />
                          <Text style={styles.episodesHint}>Loading episodes…</Text>
                        </View>
                      ) : episodesError ? (
                        <Text style={styles.episodesError}>{episodesError}</Text>
                      ) : selectedEpisodes.length ? (
                        <FlatList
                          data={selectedEpisodes}
                          keyExtractor={(ep) => String(ep.id)}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.episodeRow}
                          renderItem={({ item: ep }) => {
                            const stillUri = ep.still_path ? `${IMAGE_BASE_URL}${ep.still_path}` : heroUri;
                            const badge = `E${String(ep.episode_number).padStart(2, '0')}`;
                            return (
                              <TvFocusable
                                onPress={() => playEpisode(ep)}
                                isTVSelectable={true}
                                accessibilityLabel={`Episode ${ep.episode_number}: ${ep.name}`}
                                style={({ focused }: any) => [
                                  styles.episodeCard,
                                  focused ? styles.episodeCardFocused : null,
                                ]}
                              >
                                {stillUri ? (
                                  <Image source={{ uri: stillUri }} style={styles.episodeImage} />
                                ) : (
                                  <View style={styles.episodeImageFallback} />
                                )}
                                <LinearGradient
                                  pointerEvents="none"
                                  colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.75)']}
                                  style={styles.episodeFade}
                                />
                                <View style={styles.episodeMeta}>
                                  <View style={styles.episodeBadge}>
                                    <Text style={styles.episodeBadgeText}>{badge}</Text>
                                  </View>
                                  <Text style={styles.episodeTitle} numberOfLines={1}>
                                    {ep.name}
                                  </Text>
                                  <Text style={styles.episodeSubtitle} numberOfLines={1}>
                                    {selectedSeasonMeta?.name ?? `Season ${selectedSeasonNumber ?? ''}`}
                                  </Text>
                                </View>
                              </TvFocusable>
                            );
                          }}
                        />
                      ) : (
                        <Text style={styles.episodesHint}>No episodes available.</Text>
                      )}
                    </View>
                  ) : null}
                </View>
              </View>

              <TvRail
                title="More like this"
                items={state.similar}
                onPressItem={(item) => {
                  const nextType = (item.media_type || mediaType) as string;
                  router.push(`/details/${item.id}?mediaType=${nextType}`);
                }}
              />

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </TvGlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  shell: { flex: 1, paddingHorizontal: 34, paddingTop: 22, paddingBottom: 22, alignItems: 'center' },
  panel: { flex: 1, width: '100%', maxWidth: 1520 },
  panelInner: { flex: 1, padding: 18 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6, paddingBottom: 14 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  titleStack: { flex: 1, minWidth: 0 },
  screenTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  screenSubtitle: { color: 'rgba(255,255,255,0.68)', fontSize: 13, fontWeight: '800', marginTop: 2 },
  topActions: { flexDirection: 'row', gap: 10 },
  scrollContent: { paddingTop: 4, paddingBottom: 10 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '800', marginTop: 12 },
  errorTitle: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 8 },
  errorText: { color: 'rgba(255,255,255,0.75)', fontSize: 16, marginBottom: 18 },

  heroRow: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  mediaCol: { width: 560 },
  infoCol: { flex: 1, minWidth: 0, paddingTop: 6 },
  mediaCard: {
    width: '100%',
    height: 320,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    resizeMode: 'cover',
  },
  heroFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroFade: { ...StyleSheet.absoluteFillObject },
  heroAccentGlow: { ...StyleSheet.absoluteFillObject, opacity: 0.6 },
  heroBadgeRow: { position: 'absolute', left: 14, bottom: 14, flexDirection: 'row', gap: 10, alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  ctaRow: { flexDirection: 'row', gap: 12, marginTop: 12 },

  title: { color: '#fff', fontSize: 44, fontWeight: '900', lineHeight: 50 },
  meta: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '800', marginTop: 10 },
  overview: { color: 'rgba(255,255,255,0.78)', fontSize: 16, lineHeight: 22, marginTop: 12 },
  genresRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  genreText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '800' },

  trailerSection: { marginTop: 18 },
  trailerLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  trailerHint: { color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '800', marginTop: 6 },
  trailerCard: {
    width: '100%',
    height: 170,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  trailerCardFocused: { transform: [{ scale: 1.02 }], borderColor: '#fff' },
  trailerMedia: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  trailerFade: { ...StyleSheet.absoluteFillObject },
  trailerMeta: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  trailerPlayPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  trailerPlayText: { color: '#fff', fontSize: 13, fontWeight: '900' },

  quickGrid: { flexDirection: 'row', gap: 12, marginTop: 16 },
  quickCard: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  quickLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 12, fontWeight: '900' },
  quickValue: { color: '#fff', fontSize: 13, fontWeight: '900', marginTop: 6 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    flex: 1,
  },
  primaryText: { color: '#000', fontSize: 15, fontWeight: '900' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    flex: 1,
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flex: 1,
  },
  secondaryText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  btnFocused: { 
    transform: [{ scale: 1.08 }], 
    borderColor: '#fff',
    borderWidth: 2,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },

  episodesSection: { marginTop: 20 },
  sectionTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 12 },
  seasonRow: { gap: 10, paddingRight: 30, paddingBottom: 6 },
  seasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(0,0,0,0.14)',
    maxWidth: 220,
  },
  seasonChipSelected: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  seasonChipText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  episodesLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  episodesHint: { color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '800', marginTop: 10 },
  episodesError: { color: '#ffb4b4', fontSize: 14, fontWeight: '900', marginTop: 10 },

  episodeRow: { gap: 14, paddingRight: 30, paddingTop: 6, paddingBottom: 2 },
  episodeCard: {
    width: 320,
    height: 180,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  episodeCardFocused: {
    transform: [{ scale: 1.05 }],
    borderColor: 'rgba(255,255,255,0.78)',
  },
  episodeImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
    resizeMode: 'cover',
  },
  episodeImageFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.06)' },
  episodeFade: { ...StyleSheet.absoluteFillObject },
  episodeMeta: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 5 },
  episodeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  episodeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  episodeTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  episodeSubtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '800' },
});
