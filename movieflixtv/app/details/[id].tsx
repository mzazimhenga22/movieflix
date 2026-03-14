
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  InteractionManager,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAccent } from '../../components/app-components/AccentContext';
import LiquidGlass from '../../../components/app-components/LiquidGlass';
import { LiquidHeroView, LiquidRatingBadge } from '../../../components/app-components/LiquidNativeViews';
import { IMAGE_BASE_URL, API_BASE_URL, API_KEY } from '../../../constants/api';
import { getAccentFromPosterPath } from '../../../lib/colorUtils';
import { enqueueDownload } from '../../../lib/downloadManager';
import { getProfileScopedKey } from '../../../lib/profileStorage';
import { buildScrapeDebugTag, buildSourceOrder } from '../../../lib/videoPlaybackShared';
import { usePStream } from '../../../src/pstream/usePStream';
import { scrapeImdbTrailer } from '../../../src/providers/scrapeImdbTrailer';
import TvPosterCard from '../components/TvPosterCard';
import { TvFocusable } from '../components/TvSpatialNavigation';
import TvGlassPanel from '../components/TvGlassPanel';
import TvRail from '../components/TvRail';

const { width, height } = Dimensions.get('window');

type EpisodeMeta = {
  id: number;
  episode_number: number;
  name: string;
  overview?: string;
  runtime: number | null;
  still_path: string | null;
};

type SeasonMeta = {
  id: number;
  name: string;
  season_number: number;
  episode_count?: number;
  poster_path: string | null;
};

type DownloadItem = {
  id: string;
  mediaId: number;
  title: string;
  mediaType: 'movie' | 'tv';
  localUri: string;
  downloadType: 'file' | 'hls';
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string | null;
  releaseDate?: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
};

export default function MovieDetails() {
  const router = useRouter();
  const { id, mediaType = 'movie' } = useLocalSearchParams();
  const { scrape, loading: scraping } = usePStream();

  const [state, setState] = useState<{
    media: any;
    genres: { id: number; name: string }[];
    runtimeMinutes: number | null;
    imdbId: string | null;
    similar: any[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [myList, setMyList] = useState<any[]>([]);
  const [myListKey, setMyListKey] = useState('');
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [downloadsKey, setDownloadsKey] = useState('');

  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerFocused, setTrailerFocused] = useState(false);
  const lowEndDevice = useMemo(() => false, []); // Can be expanded

  const [seasons, setSeasons] = useState<SeasonMeta[]>([]);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number | null>(null);
  const [episodesBySeason, setEpisodesBySeason] = useState<Record<number, EpisodeMeta[]>>({});
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);

  const isTvShow = (state?.media?.media_type ?? mediaType) === 'tv';
  const selectedSeasonMeta = useMemo(() => seasons.find(s => s.season_number === selectedSeasonNumber), [seasons, selectedSeasonNumber]);
  const selectedEpisodes = useMemo(() => (selectedSeasonNumber ? episodesBySeason[selectedSeasonNumber] ?? [] : []), [episodesBySeason, selectedSeasonNumber]);

  const player = useVideoPlayer(trailerUrl, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (trailerFocused && !lowEndDevice && trailerUrl) {
      player.play();
    } else {
      player.pause();
    }
  }, [trailerFocused, lowEndDevice, trailerUrl, player]);

  useEffect(() => {
    const sub = player.addListener('statusChange', (status) => {
      if (status === 'ready') setTrailerLoading(false);
      if (status === 'loading') setTrailerLoading(true);
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    let alive = true;
    void getProfileScopedKey('myList').then((key) => {
      if (!alive) return;
      setMyListKey(key);
      AsyncStorage.getItem(key).then((raw) => {
        if (!alive) return;
        const parsed = raw ? (JSON.parse(raw) as any[]) : [];
        setMyList(Array.isArray(parsed) ? parsed : []);
      }).catch(() => { if (alive) setMyList([]); });
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    void getProfileScopedKey('downloads').then((key) => {
      if (!alive) return;
      setDownloadsKey(key);
      AsyncStorage.getItem(key).then((raw) => {
        if (!alive) return;
        const parsed = raw ? (JSON.parse(raw) as DownloadItem[]) : [];
        setDownloads(Array.isArray(parsed) ? parsed : []);
      }).catch(() => { if (alive) setDownloads([]); });
    });
    return () => { alive = false; };
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

  const toYear = (date?: string) => (date ? new Date(date).getFullYear() : null);

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
        const runtimeMinutes = typeof json.runtime === 'number' ? (json.runtime as number) : 
                               (Array.isArray(json.episode_run_time) && typeof json.episode_run_time[0] === 'number') ? (json.episode_run_time[0] as number) : null;

        const genres = Array.isArray(json.genres) ? (json.genres as { id: number; name: string }[]) : [];
        const imdbId = (json.external_ids?.imdb_id as string | undefined) ?? (json.imdb_id as string | undefined) ?? null;

        const parsedSeasons: SeasonMeta[] = (mediaType === 'tv' && Array.isArray(json.seasons)) ? 
            (json.seasons as any[])
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

        const similar: Media[] = (json.similar?.results ?? [])
          .filter(Boolean)
          .map((it: any) => ({
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
          .filter((it: any) => Number.isFinite(it.id));

        const media = {
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
          const defaultSeason = parsedSeasons.find((s) => s.season_number === 1)?.season_number ?? parsedSeasons[0]!.season_number;
          setSelectedSeasonNumber(defaultSeason);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [id, mediaType]);

  useEffect(() => {
    let cancelled = false;
    let interactionHandle: any = null;
    const imdb = state?.imdbId ?? state?.media?.imdb_id ?? null;
    if (!imdb) {
      setTrailerUrl(null);
      return () => { cancelled = true; };
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
              if (url) try { await AsyncStorage.setItem(cacheKey, url); } catch {}
            } catch {
              if (!cancelled) setTrailerUrl(null);
            } finally {
              if (!cancelled) setTrailerLoading(false);
            }
          })();
        });
      } catch {
        if (!cancelled) { setTrailerUrl(null); setTrailerLoading(false); }
      }
    })();

    return () => {
      cancelled = true;
      try { interactionHandle?.cancel?.(); } catch {}
    };
  }, [state?.imdbId, state?.media?.imdb_id]);

  useEffect(() => {
    let alive = true;
    if (!id || mediaType !== 'tv' || !selectedSeasonNumber || episodesBySeason[selectedSeasonNumber]) return;

    const loadSeason = async () => {
      setEpisodesLoading(true);
      setEpisodesError(null);
      try {
        const seasonUrl = `${API_BASE_URL}/tv/${id}/season/${selectedSeasonNumber}?api_key=${API_KEY}`;
        const res = await fetch(seasonUrl);
        if (!res.ok) throw new Error('Failed to load episodes');
        const json = await res.json();

        const episodes: EpisodeMeta[] = (json.episodes as any[] || [])
          .filter(Boolean)
          .map((ep) => ({
            id: Number(ep.id),
            episode_number: Number(ep.episode_number),
            name: String(ep.name ?? `Episode ${ep.episode_number}`),
            overview: (ep.overview as string | undefined) ?? undefined,
            runtime: typeof ep.runtime === 'number' ? ep.runtime : null,
            still_path: (ep.still_path as string | null | undefined) ?? null,
          }))
          .filter((ep) => Number.isFinite(ep.id) && Number.isFinite(ep.episode_number))
          .sort((a, b) => a.episode_number - b.episode_number);

        if (alive) setEpisodesBySeason((prev) => ({ ...prev, [selectedSeasonNumber]: episodes }));
      } catch (e: any) {
        if (alive) setEpisodesError(e?.message ?? 'Failed to load episodes');
      } finally {
        if (alive) setEpisodesLoading(false);
      }
    };

    void loadSeason();
    return () => { alive = false; };
  }, [id, mediaType, episodesBySeason, selectedSeasonNumber]);

  const toggleMyList = useCallback(async () => {
    if (!state?.media) return;
    const entry = state.media;
    try {
      const next = inMyList ? myList.filter((it) => it?.id !== entry.id) : [entry, ...myList];
      setMyList(next);
      await AsyncStorage.setItem(myListKey, JSON.stringify(next.slice(0, 80)));
    } catch {}
  }, [inMyList, myList, myListKey, state?.media]);

  const startDownload = useCallback(async (episodeToDownload?: EpisodeMeta) => {
    if (!state?.media) return;
    if (existingDownload && !episodeToDownload) {
      router.push('/(tabs)/downloads');
      return;
    }

    try {
      setDownloading(true);
      const media = state.media;
      const title = media.title || media.name || 'Untitled';
      const releaseYear = toYear(media.release_date ?? media.first_air_date) ?? new Date().getFullYear();

      // If it's a TV show and no episode is specified, we try to download S1E1 or the first available
      const targetEpisode = episodeToDownload || (isTvShow ? selectedEpisodes[0] : null);
      
      const scrapeMedia: any = isTvShow ? {
          type: 'show',
          title,
          tmdbId: String(media.id),
          imdbId: state.imdbId ?? undefined,
          releaseYear,
          season: {
            number: selectedSeasonNumber ?? 1,
            tmdbId: String(selectedSeasonMeta?.id || ''),
            title: selectedSeasonMeta?.name || `Season ${selectedSeasonNumber ?? 1}`,
          },
          episode: {
            number: targetEpisode?.episode_number ?? 1,
            tmdbId: String(targetEpisode?.id || ''),
          },
      } : {
          type: 'movie',
          title,
          tmdbId: String(media.id),
          imdbId: state.imdbId ?? undefined,
          releaseYear,
      };

      console.log(`[TV Details] Starting download scrape for: ${title}`);
      const playback = await scrape(scrapeMedia, {
        sourceOrder: buildSourceOrder(false),
        debugTag: buildScrapeDebugTag('download-tv', title),
      });

      if (!playback?.uri) throw new Error('No downloadable stream found for this title.');
      const isHls = playback.stream?.type === 'hls' || playback.uri.toLowerCase().includes('.m3u8');

      await enqueueDownload({
        title,
        mediaId: media.id,
        mediaType: (media.media_type ?? mediaType) as any,
        runtimeMinutes: targetEpisode?.runtime ?? state.runtimeMinutes ?? undefined,
        seasonNumber: isTvShow ? (selectedSeasonNumber ?? 1) : undefined,
        episodeNumber: isTvShow ? (targetEpisode?.episode_number ?? 1) : undefined,
        releaseDate: media.release_date ?? media.first_air_date,
        posterPath: targetEpisode?.still_path || media.poster_path || null,
        backdropPath: media.backdrop_path || null,
        overview: targetEpisode?.overview || media.overview || null,
        downloadType: isHls ? 'hls' : 'file',
        sourceUrl: playback.uri,
        headers: playback.headers,
      });

      const raw = await AsyncStorage.getItem(downloadsKey);
      const parsed = raw ? (JSON.parse(raw) as DownloadItem[]) : [];
      setDownloads(Array.isArray(parsed) ? parsed : []);

      Alert.alert('Download Started', `"${title}" has been added to your offline library.`);
    } catch (err: any) {
      console.error('[TV Details] Download failed:', err);
      Alert.alert('Download failed', err?.message ?? 'Unable to start download.');
    } finally {
      setDownloading(false);
    }
  }, [downloadsKey, existingDownload, isTvShow, mediaType, router, scrape, selectedEpisodes, selectedSeasonMeta?.id, selectedSeasonMeta?.name, selectedSeasonNumber, state?.imdbId, state?.media, state?.runtimeMinutes]);

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

    if (isTvShow) {
      const seasonNumber = selectedSeasonNumber ?? 1;
      const seasonTitle = selectedSeasonMeta?.name ?? `Season ${seasonNumber}`;
      const episodeNumber = selectedEpisodes[0]?.episode_number ?? 1;
      baseParams.seasonNumber = String(seasonNumber);
      baseParams.episodeNumber = String(episodeNumber);
      baseParams.seasonTitle = seasonTitle;

      if (selectedEpisodes.length) {
        const minimalQueue = selectedEpisodes.slice(0, 30).map((ep) => ({
          id: ep.id,
          title: ep.name,
          seasonName: seasonTitle,
          seasonNumber,
          episodeNumber: ep.episode_number,
          stillPath: ep.still_path ?? null,
          episodeTmdbId: ep.id,
          seasonEpisodeCount: selectedSeasonMeta?.episode_count,
        }));
        baseParams.upcomingEpisodes = JSON.stringify(minimalQueue);
      }
    }
    router.push({ pathname: '/video-player', params: baseParams });
  }, [isTvShow, mediaType, router, selectedEpisodes, selectedSeasonMeta?.episode_count, selectedSeasonMeta?.name, selectedSeasonNumber, state?.imdbId, state?.media]);

  const playEpisode = useCallback((episode: EpisodeMeta) => {
      const media = state?.media;
      if (!media || !isTvShow) return;
      const title = media.title || media.name || 'Now Playing';
      const releaseYear = toYear(media.release_date ?? media.first_air_date);
      const seasonNumber = selectedSeasonNumber ?? 1;
      const seasonTitle = selectedSeasonMeta?.name ?? `Season ${seasonNumber}`;
      
      const minimalQueue = selectedEpisodes.slice(0, 30).map((ep) => ({
        id: ep.id,
        title: ep.name,
        seasonName: seasonTitle,
        seasonNumber,
        episodeNumber: ep.episode_number,
        stillPath: ep.still_path ?? null,
        episodeTmdbId: ep.id,
        seasonEpisodeCount: selectedSeasonMeta?.episode_count,
      }));

      router.push({
        pathname: '/video-player',
        params: {
          tmdbId: String(media.id),
          mediaType: 'tv',
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
    }, [isTvShow, router, selectedEpisodes, selectedSeasonMeta?.episode_count, selectedSeasonMeta?.name, selectedSeasonNumber, state?.imdbId, state?.media]);

  const playOffline = useCallback(() => {
    if (!existingDownload) return;
    const sN = existingDownload.seasonNumber;
    const eN = existingDownload.episodeNumber;
    const maybeEpisodeParams = existingDownload.mediaType === 'tv' ? {
            ...(sN ? { seasonNumber: String(sN) } : {}),
            ...(eN ? { episodeNumber: String(eN) } : {}),
            ...(sN ? { seasonTitle: `Season ${sN}` } : {}),
          } : {};

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
        ...maybeEpisodeParams,
      },
    });
  }, [existingDownload, router]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <LinearGradient colors={['#150a13', '#070815', '#05060f']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#e50914" />
        <Text style={styles.loadingText}>Loading details...</Text>
      </View>
    );
  }

  if (error || !state) {
    return (
      <View style={styles.loadingWrap}>
        <LinearGradient colors={['#150a13', '#070815', '#05060f']} style={StyleSheet.absoluteFill} />
        <Text style={styles.errorTitle}>Oops! Something went wrong.</Text>
        <Text style={styles.errorText}>{error ?? 'Unknown error'}</Text>
        <TvFocusable onPress={() => router.back()} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>Go back</Text>
        </TvFocusable>
      </View>
    );
  }

  const heroUri = (state.media.backdrop_path || state.media.poster_path) ? `${IMAGE_BASE_URL}${state.media.backdrop_path || state.media.poster_path}` : null;
  const title = state.media.title || state.media.name || 'Untitled';
  const year = toYear(state.media.release_date ?? state.media.first_air_date);
  const rating = typeof state.media.vote_average === 'number' ? state.media.vote_average.toFixed(1) : null;
  const subtitleBits = [year ? String(year) : null, rating ? `★ ${rating}` : null, state.runtimeMinutes ? `${state.runtimeMinutes}m` : null].filter(Boolean);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" hidden />
      <View style={styles.shell}>
        <TvGlassPanel accent={accent} native style={styles.panel}>
          <View style={styles.panelInner}>
            <View style={styles.topBar}>
              <TvFocusable onPress={() => router.back()} style={({ focused }: any) => [styles.iconBtnWrap, focused && styles.btnFocused]}>
                <TvGlassPanel accent={accent} native compact borderRadius={24} glowIntensity="subtle" style={styles.iconBtn}>
                  <Ionicons name="arrow-back" size={18} color="#fff" />
                </TvGlassPanel>
              </TvFocusable>
              <View style={{ flex: 1 }}>
                <Text style={styles.screenTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.screenSubtitle} numberOfLines={1}>{subtitleBits.join('  •  ')}</Text>
              </View>
              <View style={styles.topActions}>
                <TvFocusable onPress={() => void toggleMyList()} style={({ focused }: any) => [styles.iconBtnWrap, focused && styles.btnFocused]}>
                  <TvGlassPanel accent={accent} native compact borderRadius={24} glowIntensity="subtle" style={styles.iconBtn}>
                    <Ionicons name={inMyList ? 'checkmark' : 'add'} size={18} color="#fff" />
                  </TvGlassPanel>
                </TvFocusable>
                <TvFocusable
                  onPress={() => (existingDownload ? playOffline() : void startDownload())}
                  disabled={downloading || scraping}
                  style={({ focused }: any) => [styles.iconBtnWrap, (downloading || scraping) && { opacity: 0.6 }, focused && styles.btnFocused]}
                >
                  <TvGlassPanel accent={accent} native compact borderRadius={24} glowIntensity="subtle" style={styles.iconBtn}>
                    {downloading || scraping ? <ActivityIndicator color="#fff" /> : <Ionicons name={existingDownload ? 'download' : 'cloud-download'} size={18} color="#fff" />}
                  </TvGlassPanel>
                </TvFocusable>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.heroRow}>
                <View style={styles.mediaCol}>
                  <View style={styles.mediaCard}>
                    {trailerUrl && !trailerLoading ? (
                        <VideoView
                            player={player}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                            showsPlaybackControls={false}
                        />
                    ) : (
                        heroUri ? <Image source={{ uri: heroUri }} style={styles.heroImage} /> : <View style={styles.heroFallback} />
                    )}
                    <LinearGradient colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.7)']} style={styles.heroFade} />
                    <View style={styles.heroBadgeRow}>
                      <View style={[styles.badge, { backgroundColor: `${accent}33`, borderColor: `${accent}66` }]}><Text style={styles.badgeText}>{isTvShow ? 'TV' : 'Movie'}</Text></View>
                      {rating && <View style={styles.badge}><Ionicons name="star" size={14} color="#ffd700" /><Text style={styles.badgeText}>{rating}</Text></View>}
                    </View>
                    {trailerLoading && (
                        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                            <ActivityIndicator size="small" color="#fff" />
                        </View>
                    )}
                  </View>
                  <View style={styles.ctaRow}>
                    <TvFocusable onPress={play} style={({ focused }: any) => [styles.primaryBtnWrap, focused && styles.btnFocused]}>
                      <TvGlassPanel accent={accent} native compact borderRadius={15} glowIntensity="medium" style={styles.primaryBtn}>
                        <Ionicons name="play" size={18} color="#fff" /><Text style={styles.primaryText}>{existingDownload ? 'Play Offline' : 'Play'}</Text>
                      </TvGlassPanel>
                    </TvFocusable>
                    {!existingDownload && (
                        <TvFocusable onPress={() => void startDownload()} disabled={downloading || scraping} style={({ focused }: any) => [styles.secondaryBtnWrap, (downloading || scraping) && { opacity: 0.6 }, focused && styles.btnFocused]}>
                            <TvGlassPanel accent={accent} native compact borderRadius={15} glowIntensity="subtle" style={styles.secondaryBtn}>
                                {downloading || scraping ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cloud-download" size={18} color="#fff" />}
                                <Text style={styles.secondaryText}>Download</Text>
                            </TvGlassPanel>
                        </TvFocusable>
                    )}
                  </View>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.title} numberOfLines={2}>{title}</Text>
                  <Text style={styles.meta}>{subtitleBits.join('  •  ')}</Text>
                  <Text style={styles.overview} numberOfLines={6}>{state.media.overview || 'No overview available.'}</Text>
                  {state.genres.length > 0 && (
                    <View style={styles.genresRow}>
                      {state.genres.slice(0, 5).map((g) => <View key={g.id} style={styles.genreChip}><Text style={styles.genreText}>{g.name}</Text></View>)}
                    </View>
                  )}
                </View>
              </View>

              {isTvShow && selectedEpisodes.length > 0 && (
                <View style={styles.episodesSection}>
                  <Text style={styles.sectionTitle}>Episodes</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonRow}>
                    {seasons.map((s) => (
                      <TvFocusable key={s.id} onPress={() => setSelectedSeasonNumber(s.season_number)} style={({ focused }: any) => [styles.seasonChip, s.season_number === selectedSeasonNumber && styles.seasonChipSelected, focused && styles.btnFocused]}>
                        <Text style={styles.seasonChipText}>{s.name}</Text>
                      </TvFocusable>
                    ))}
                  </ScrollView>
                  {episodesLoading ? <ActivityIndicator color={accent} style={{ marginTop: 20 }} /> : (
                    <FlatList
                      data={selectedEpisodes}
                      keyExtractor={(ep) => String(ep.id)}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.episodeRow}
                      renderItem={({ item: ep }) => (
                        <TvFocusable onPress={() => playEpisode(ep)} style={({ focused }: any) => [styles.episodeCard, focused && styles.episodeCardFocused]}>
                          <Image source={{ uri: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : heroUri! }} style={styles.episodeImage} />
                          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']} style={styles.episodeFade} />
                          <View style={styles.episodeMeta}>
                            <View style={styles.episodeBadge}><Text style={styles.episodeBadgeText}>E{ep.episode_number}</Text></View>
                            <Text style={styles.episodeTitle} numberOfLines={1}>{ep.name}</Text>
                            <TvFocusable onPress={() => startDownload(ep)} disabled={downloading} style={({focused}: any) => [styles.epDownloadBtn, focused && {backgroundColor: accent}]}>
                                <Ionicons name="cloud-download-outline" size={14} color="#fff" />
                            </TvFocusable>
                          </View>
                        </TvFocusable>
                      )}
                    />
                  )}
                </View>
              )}

              <TvRail title="More like this" items={state.similar} onPressItem={(item) => router.push(`/details/${item.id}?mediaType=${item.media_type || mediaType}`)} />
              <View style={{ height: 50 }} />
            </ScrollView>
          </View>
        </TvGlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  shell: { flex: 1, padding: 30 },
  panel: { flex: 1 },
  panelInner: { flex: 1, padding: 25 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 20 },
  screenTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  screenSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '700' },
  iconBtnWrap: { borderRadius: 24 },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  btnFocused: { transform: [{ scale: 1.1 }], shadowColor: '#fff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 10, elevation: 10 },
  topActions: { flexDirection: 'row', gap: 12 },
  scrollContent: { paddingBottom: 50 },
  heroRow: { flexDirection: 'row', gap: 40, marginBottom: 40 },
  mediaCol: { width: 450 },
  mediaCard: { width: 450, height: 253, borderRadius: 20, overflow: 'hidden', backgroundColor: '#111' },
  heroImage: { width: '100%', height: '100%' },
  heroFade: { ...StyleSheet.absoluteFillObject },
  heroBadgeRow: { position: 'absolute', top: 15, left: 15, flexDirection: 'row', gap: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', flexDirection: 'row', alignItems: 'center', gap: 5 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  ctaRow: { flexDirection: 'row', gap: 15, marginTop: 20 },
  primaryBtnWrap: { flex: 1, borderRadius: 15 },
  primaryBtn: { flex: 1, height: 56, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  secondaryBtnWrap: { flex: 1, borderRadius: 15 },
  secondaryBtn: { flex: 1, height: 56, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  secondaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  infoCol: { flex: 1 },
  title: { color: '#fff', fontSize: 48, fontWeight: '900', marginBottom: 10 },
  meta: { color: 'rgba(255,255,255,0.6)', fontSize: 18, fontWeight: '700', marginBottom: 20 },
  overview: { color: 'rgba(255,255,255,0.8)', fontSize: 16, lineHeight: 26, marginBottom: 25 },
  genresRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  genreChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  genreText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  episodesSection: { marginTop: 20 },
  sectionTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 20 },
  seasonRow: { gap: 12, marginBottom: 20 },
  seasonChip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  seasonChipSelected: { backgroundColor: '#e50914' },
  seasonChipText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  episodeRow: { gap: 20 },
  episodeCard: { width: 280, height: 157, borderRadius: 15, overflow: 'hidden', backgroundColor: '#111' },
  episodeCardFocused: { borderWidth: 3, borderColor: '#fff' },
  episodeImage: { width: '100%', height: '100%' },
  episodeFade: { ...StyleSheet.absoluteFillObject },
  episodeMeta: { position: 'absolute', bottom: 12, left: 12, right: 12 },
  episodeBadge: { backgroundColor: 'rgba(229,9,20,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 5 },
  episodeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  episodeTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  epDownloadBtn: { position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  loadingText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  errorTitle: { color: '#fff', fontSize: 32, fontWeight: '900' },
  errorText: { color: 'rgba(255,255,255,0.6)', fontSize: 18, textAlign: 'center', paddingHorizontal: 40 },
  bgCircle: { position: 'absolute', width: 600, height: 600, borderRadius: 300, filter: 'blur(100px)' as any },
});
