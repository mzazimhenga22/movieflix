import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InteractionManager } from 'react-native';
import { scrapeImdbTrailer } from '../../../../src/providers/scrapeImdbTrailer';
import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../../../../constants/api';
import { authPromise, firestore } from '../../../../constants/firebase';
import { buildProfileScopedKey } from '../../../../lib/profileStorage';
import { Media, Genre } from '../../../../types/index';
import { shuffleArray, KIDS_GENRE_IDS } from '../utils/constants';
import { useFocusEffect } from 'expo-router';

const HOME_FEED_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

type HomeFeedCachePayload = {
  netflix: Media[];
  amazon: Media[];
  hbo: Media[];
  movieStoriesData: any;
  tvStoriesData: any;
  trendingData: any;
  movieReelsData: any;
  recommendedData: any;
  songsData: any;
  genresData: any;
};

type HomeFeedCacheEnvelope = {
  updatedAt: number;
  payload: HomeFeedCachePayload;
};

type HomeFeedDerivedState = {
  netflixSafe: Media[];
  amazonSafe: Media[];
  hboSafe: Media[];
  combinedStories: any[];
  movieStoriesList: Media[];
  tvStoriesList: Media[];
  trendingResults: Media[];
  trendingRaw: Media[];
  songsSafe: Media[];
  movieReelsSafe: Media[];
  recommendedSafe: Media[];
  genresList: Genre[];
};

export const useMoviesData = (activeProfileId: string | null, isKidsProfile: boolean, profileReady: boolean) => {
  const [trending, setTrending] = useState<Media[]>([]);
  const [movieReels, setMovieReels] = useState<Media[]>([]);
  const [movieTrailers, setMovieTrailers] = useState<(Media & { trailerUrl: string })[]>([]);
  const [recommended, setRecommended] = useState<Media[]>([]);
  const [songs, setSongs] = useState<Media[]>([]);
  const [trendingMoviesOnly, setTrendingMoviesOnly] = useState<Media[]>([]);
  const [trendingTvOnly, setTrendingTvOnly] = useState<Media[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [featuredMovie, setFeaturedMovie] = useState<Media | null>(null);
  const [stories, setStories] = useState<any[]>([]);
  const [netflix, setNetflix] = useState<Media[]>([]);
  const [amazon, setAmazon] = useState<Media[]>([]);
  const [hbo, setHbo] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [continueWatching, setContinueWatching] = useState<Media[]>([]);
  const [lastWatched, setLastWatched] = useState<Media | null>(null);
  const feedSignatureRef = useRef<string | null>(null);

  const homeFeedCacheScope = useMemo(
    () => `${activeProfileId ?? 'global'}${isKidsProfile ? ':kids' : ''}`,
    [activeProfileId, isKidsProfile],
  );
  const homeFeedCacheKey = useMemo(
    () => `homeFeedCache:${homeFeedCacheScope}`,
    [homeFeedCacheScope],
  );

  const filterForKids = useCallback(
    (items: Media[] | undefined | null): Media[] => {
      if (!items || items.length === 0) {
        return [];
      }
      if (!isKidsProfile) {
        return items;
      }
      return items.filter((item) => {
        const ids = (item.genre_ids || []) as number[];
        const hasKidsGenre = ids.some((id) => KIDS_GENRE_IDS.includes(id));
        return !item.adult && hasKidsGenre;
      });
    },
    [isKidsProfile],
  );

  const buildKidsUrl = useCallback(
    (input: string, type: 'movie' | 'tv' | 'all' | 'discover' = 'movie') => {
      if (!isKidsProfile) return input;
      // NOTE: Avoid `new URL()` in RN release builds (it may not be available depending on runtime/polyfills).
      const upsertQueryParams = (url: string, updates: Record<string, string>) => {
        const hashIndex = url.indexOf('#');
        const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
        const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;

        const qIndex = withoutHash.indexOf('?');
        const base = qIndex >= 0 ? withoutHash.slice(0, qIndex) : withoutHash;
        const query = qIndex >= 0 ? withoutHash.slice(qIndex + 1) : '';

        const params: Record<string, string> = {};
        if (query) {
          for (const part of query.split('&')) {
            if (!part) continue;
            const eq = part.indexOf('=');
            const rawKey = eq >= 0 ? part.slice(0, eq) : part;
            const rawVal = eq >= 0 ? part.slice(eq + 1) : '';
            let key = rawKey;
            let val = rawVal;
            try {
              key = decodeURIComponent(rawKey);
            } catch {
              // keep as-is
            }
            try {
              val = decodeURIComponent(rawVal);
            } catch {
              // keep as-is
            }
            if (key) params[key] = val;
          }
        }

        for (const [k, v] of Object.entries(updates)) {
          params[k] = v;
        }

        const qs = Object.entries(params)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&');
        return `${base}${qs ? `?${qs}` : ''}${hash}`;
      };

      const updates: Record<string, string> = {
        include_adult: 'false',
        with_genres: '10751',
      };

      if (type === 'movie' || type === 'discover') {
        updates.certification_country = 'US';
        updates['certification.lte'] = 'G';
      } else if (type === 'tv') {
        updates.certification_country = 'US';
        updates['certification.lte'] = 'TV-Y';
      } else if (type === 'all') {
        // when mixing media, prefer the most restrictive rating
        updates.certification_country = 'US';
        updates['certification.lte'] = 'TV-Y';
      }

      return upsertQueryParams(input, updates);
    },
    [isKidsProfile],
  );

  const fetchWithKids = useCallback(
    async (input: string, type: 'movie' | 'tv' | 'all' | 'discover' = 'movie') => {
      const response = await fetch(buildKidsUrl(input, type));
      return response.json();
    },
    [buildKidsUrl],
  );

  const fetchProviderMovies = useCallback(
    async (providerId: number): Promise<Media[]> => {
      const url = `${API_BASE_URL}/discover/movie?api_key=${API_KEY}&with_watch_providers=${providerId}&watch_region=US&with_watch_monetization_types=flatrate`;
      const json = await fetchWithKids(url, 'discover');
      return json?.results || [];
    },
    [fetchWithKids],
  );

  const loadWatchHistory = useCallback(() => {
    let isActive = true;
    const run = async () => {
      if (!profileReady) {
        if (isActive) {
          setContinueWatching([]);
          setLastWatched(null);
        }
        return;
      }
      try {
        const key = buildProfileScopedKey('watchHistory', activeProfileId);
        const stored = await AsyncStorage.getItem(key);
        if (!isActive) return;
        if (stored) {
          const parsed: Media[] = JSON.parse(stored);
          setContinueWatching(parsed);
          setLastWatched(parsed[0] || null);
        } else {
          setContinueWatching([]);
          setLastWatched(null);
        }
      } catch (err) {
        if (isActive) {
          console.error('Failed to load watch history', err);
          setContinueWatching([]);
          setLastWatched(null);
        }
      }
    };
    run();
    return () => {
      isActive = false;
    };
  }, [activeProfileId, profileReady]);

  useFocusEffect(loadWatchHistory);

  const buildFeedSignature = useCallback((derived: HomeFeedDerivedState) => {
    const pickIds = (items: { id?: string | number }[] = []) =>
      items.map((item) => item?.id ?? null).filter(Boolean).slice(0, 50);
    return JSON.stringify({
      trending: pickIds(derived.trendingResults),
      netflix: pickIds(derived.netflixSafe),
      amazon: pickIds(derived.amazonSafe),
      hbo: pickIds(derived.hboSafe),
      songs: pickIds(derived.songsSafe),
      reels: pickIds(derived.movieReelsSafe),
      recommended: pickIds(derived.recommendedSafe),
      stories: pickIds(derived.combinedStories),
    });
  }, []);

  const deriveFeedState = useCallback(
    (payload: HomeFeedCachePayload): HomeFeedDerivedState => {
      const movieStoriesList = filterForKids((payload.movieStoriesData?.results || []) as Media[]);
      const tvStoriesList = filterForKids((payload.tvStoriesData?.results || []) as Media[]);
      const combinedStories = [...movieStoriesList, ...tvStoriesList]
        .map((item: any) => {
          const image = item?.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : '';
          const title = item?.title || item?.name || 'Untitled';
          const id = item?.id;

          return {
            id,
            title,
            image,
            avatar: image,
            media_type: item?.media_type,
            media: image ? [{ type: 'image', uri: image, storyId: id }] : [],
          };
        })
        .filter((s: any) => Boolean(s?.image));

      const trendingRaw = (payload.trendingData?.results || []) as Media[];
      const trendingResults = filterForKids(trendingRaw);
      const netflixSafe = filterForKids(payload.netflix || []);
      const amazonSafe = filterForKids(payload.amazon || []);
      const songsSafe = filterForKids((payload.songsData?.results || []) as Media[]);
      const movieReelsSafe = filterForKids((payload.movieReelsData?.results || []) as Media[]);
      const recommendedSafe = filterForKids((payload.recommendedData?.results || []) as Media[]);
      const hboSource = payload.hbo?.length
        ? payload.hbo
        : trendingRaw.filter((m) => m.media_type === 'tv');
      const hboSafe = filterForKids(hboSource);
      const genresList = (payload.genresData?.genres || []) as Genre[];

      return {
        netflixSafe,
        amazonSafe,
        hboSafe,
        combinedStories,
        movieStoriesList,
        tvStoriesList,
        trendingResults,
        trendingRaw,
        songsSafe,
        movieReelsSafe,
        recommendedSafe,
        genresList,
      };
    },
    [filterForKids]
  );

  const fetchTrailersForMovies = useCallback(
    async (movies: Media[]) => {
      if (!movies || movies.length === 0) return;
      console.log('[MovieTrailers] Starting fetch for movies:', movies.length);
      const cacheKey = `movieTrailers:${homeFeedCacheScope}`;

      try {
        // Read cached trailers first
        try {
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached) as (Media & { trailerUrl: string })[];
            if (parsed?.length) {
              setMovieTrailers(parsed);
            }
          }
        } catch (err) {
          console.warn('[MovieTrailers] Failed to read cache', err);
        }

        InteractionManager.runAfterInteractions(() => {
          void (async () => {
            const concurrency = 2;
            const results: (Media & { trailerUrl: string })[] = [];
            const queue = movies.slice(0, 6);
            let index = 0;

            const worker = async () => {
              while (true) {
                const i = index++;
                if (i >= queue.length) return;
                const movie = queue[i];
                try {
                  let imdbId = movie.imdb_id;
                  if (!imdbId && movie.id) {
                    const externalIdsUrl = `${API_BASE_URL}/movie/${movie.id}/external_ids?api_key=${API_KEY}`;
                    const externalRes = await fetch(externalIdsUrl);
                    if (externalRes.ok) {
                      const externalData = await externalRes.json();
                      imdbId = externalData.imdb_id;
                    }
                  }

                  if (imdbId) {
                    const trailer = await scrapeImdbTrailer({ imdb_id: imdbId });
                    if (trailer?.url) {
                      results.push({ ...movie, imdb_id: imdbId, trailerUrl: trailer.url });
                      setMovieTrailers([...results]);
                    }
                  }
                } catch (err) {
                  console.warn('[MovieTrailers] Error fetching trailer for', movie?.title, err);
                }
              }
            };

            const workers = [] as Promise<void>[];
            for (let w = 0; w < concurrency; w++) workers.push(worker());
            await Promise.all(workers);

            try {
              await AsyncStorage.setItem(cacheKey, JSON.stringify(results));
            } catch (err) {
              console.warn('[MovieTrailers] Failed to persist cache', err);
            }

            console.log('[MovieTrailers] Completed, found:', results.length);
          })();
        });
      } catch (err) {
        console.error('[MovieTrailers] Unexpected error:', err);
      }
    },
    [homeFeedCacheScope]
  );

  const applyDerivedState = useCallback(
    (derived: HomeFeedDerivedState) => {
      setNetflix(derived.netflixSafe);
      setAmazon(derived.amazonSafe);
      setHbo(derived.hboSafe);
      setStories(shuffleArray(derived.combinedStories));
      setTrending(derived.trendingResults);
      setFeaturedMovie(derived.trendingResults[0] || null);
      setTrendingMoviesOnly(derived.movieStoriesList);
      setTrendingTvOnly(derived.tvStoriesList);
      setSongs(derived.songsSafe);
      setMovieReels(derived.movieReelsSafe);
      setRecommended(derived.recommendedSafe);
      setGenres(derived.genresList);

      const signature = buildFeedSignature(derived);
      feedSignatureRef.current = signature;
      fetchTrailersForMovies(derived.trendingResults.slice(0, 6));
    },
    [buildFeedSignature, fetchTrailersForMovies]
  );

  const loadFromCache = useCallback(async (): Promise<{ applied: boolean; fresh: boolean }> => {
    try {
      const cached = await AsyncStorage.getItem(homeFeedCacheKey);
      if (!cached) return { applied: false, fresh: false };

      const parsed = JSON.parse(cached) as HomeFeedCacheEnvelope | HomeFeedCachePayload;
      const envelope: HomeFeedCacheEnvelope = (parsed as HomeFeedCacheEnvelope)?.payload
        ? (parsed as HomeFeedCacheEnvelope)
        : { payload: parsed as HomeFeedCachePayload, updatedAt: 0 };

      if (!envelope.payload) return { applied: false, fresh: false };

      const derived = deriveFeedState(envelope.payload);
      applyDerivedState(derived);
      setLoading(false);

      const fresh = envelope.updatedAt
        ? Date.now() - envelope.updatedAt < HOME_FEED_CACHE_TTL_MS
        : false;

      return { applied: true, fresh };
    } catch (err) {
      console.error('Failed to load home feed cache', err);
      return { applied: false, fresh: false };
    }
  }, [applyDerivedState, deriveFeedState, homeFeedCacheKey]);

  const fetchData = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const [
          netflixMovies,
          amazonMovies,
          hboMovies,
          movieStoriesData,
          tvStoriesData,
          trendingData,
          movieReelsData,
          recommendedData,
          songsData,
          genresData,
        ] = await Promise.all([
          fetchProviderMovies(8),
          fetchProviderMovies(9),
          fetchProviderMovies(384),
          fetchWithKids(`${API_BASE_URL}/trending/movie/day?api_key=${API_KEY}`, 'movie'),
          fetchWithKids(`${API_BASE_URL}/trending/tv/day?api_key=${API_KEY}`, 'tv'),
          fetchWithKids(`${API_BASE_URL}/trending/all/day?api_key=${API_KEY}`, 'all'),
          fetchWithKids(`${API_BASE_URL}/movie/upcoming?api_key=${API_KEY}`, 'movie'),
          fetchWithKids(`${API_BASE_URL}/movie/top_rated?api_key=${API_KEY}`, 'movie'),
          fetchWithKids(`${API_BASE_URL}/movie/popular?api_key=${API_KEY}`, 'movie'),
          fetch(`${API_BASE_URL}/genre/movie/list?api_key=${API_KEY}`).then((r) => r.json()),
        ]);

        const payload: HomeFeedCachePayload = {
          netflix: netflixMovies || [],
          amazon: amazonMovies || [],
          hbo: hboMovies || [],
          movieStoriesData,
          tvStoriesData,
          trendingData,
          movieReelsData,
          recommendedData,
          songsData,
          genresData,
        };

        const derived = deriveFeedState(payload);
        const newSignature = buildFeedSignature(derived);
        const hasChanged = feedSignatureRef.current !== newSignature;

        if (hasChanged) {
          applyDerivedState(derived);
          setLoading(false);
        }

        try {
          const envelope: HomeFeedCacheEnvelope = {
            updatedAt: Date.now(),
            payload,
          };
          await AsyncStorage.setItem(homeFeedCacheKey, JSON.stringify(envelope));
        } catch (err) {
          console.error('Failed to write home feed cache', err);
        }

        if (!hasChanged && !silent) {
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load content. Please try again later.');
        if (!silent) setLoading(false);
      }
    },
    [
      applyDerivedState,
      buildFeedSignature,
      deriveFeedState,
      fetchProviderMovies,
      fetchWithKids,
      homeFeedCacheKey,
    ]
  );

  useEffect(() => {
    if (!profileReady) return;
    let cancelled = false;

    const init = async () => {
      const result = await loadFromCache();
      if (cancelled) return;

      if (!result.applied) {
        await fetchData();
        return;
      }

      if (!result.fresh) {
        fetchData({ silent: true });
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [fetchData, loadFromCache, profileReady]);

  return {
    trending,
    movieReels,
    movieTrailers,
    recommended,
    songs,
    trendingMoviesOnly,
    trendingTvOnly,
    genres,
    featuredMovie,
    setFeaturedMovie,
    stories,
    setStories,
    netflix,
    amazon,
    hbo,
    loading,
    error,
    continueWatching,
    lastWatched,
    filterForKids,
  };
};
