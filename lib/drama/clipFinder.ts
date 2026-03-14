/**
 * Movie Clip Finder Service (Clip.Cafe-style)
 * 
 * Searches for movie clips by quote, phrase, or keyword.
 * Uses multiple sources:
 * - PlayPhrase.me API
 * - YARN (GetYarn.io)
 * - TMDB Videos API
 * - YouTube Movieclips
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
export interface MovieClip {
  id: string;
  quote: string;
  movieTitle: string;
  movieYear?: string;
  character?: string;
  actor?: string;
  thumbnail: string;
  videoUrl?: string;
  youtubeId?: string;
  startTime?: number; // seconds
  endTime?: number; // seconds
  duration?: number;
  source: 'playphrase' | 'yarn' | 'tmdb' | 'youtube' | 'user';
  tmdbId?: number;
  imdbId?: string;
}

export interface ClipSearchResult {
  clips: MovieClip[];
  total: number;
  page: number;
  hasMore: boolean;
  query: string;
}

export interface MovieQuotes {
  movieId: string;
  movieTitle: string;
  quotes: MovieClip[];
}

// Cache
const CACHE_KEY_PREFIX = '@movie_clip_cache_';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

// TMDB API Key (get from env or config)
const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY || '';

// Helper functions
async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY_PREFIX + key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL) {
      await AsyncStorage.removeItem(CACHE_KEY_PREFIX + key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

async function setCache(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch (e) {
    console.warn('[ClipFinder] Cache write failed:', e);
  }
}

// ============ PLAYPHRASE.ME SCRAPER ============

const PLAYPHRASE_BASE = 'https://playphrase.me';

export async function searchPlayPhrase(query: string, page = 1): Promise<ClipSearchResult> {
  const cacheKey = `playphrase_${query}_${page}`;
  const cached = await getCached<ClipSearchResult>(cacheKey);
  if (cached) return cached;

  try {
    // PlayPhrase search endpoint
    const response = await fetch(`${PLAYPHRASE_BASE}/api/search?q=${encodeURIComponent(query)}&p=${page}`, {
      method: 'GET',
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) throw new Error(`PlayPhrase search failed: ${response.status}`);

    const json = await response.json();
    
    const clips: MovieClip[] = (json.phrases || json.results || []).map((item: any) => ({
      id: `playphrase_${item.id || Math.random().toString(36).slice(2)}`,
      quote: item.phrase || item.text || query,
      movieTitle: item.movie || item.title || 'Unknown',
      movieYear: item.year,
      character: item.character,
      actor: item.actor,
      thumbnail: item.thumbnail || item.poster || '',
      videoUrl: item.video_url || item.url,
      startTime: item.start_time,
      endTime: item.end_time,
      duration: item.duration,
      source: 'playphrase' as const,
      tmdbId: item.tmdb_id,
      imdbId: item.imdb_id,
    }));

    const result: ClipSearchResult = {
      clips,
      total: json.total || clips.length,
      page,
      hasMore: json.has_more || false,
      query,
    };

    await setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[ClipFinder] PlayPhrase search error:', error);
    return { clips: [], total: 0, page, hasMore: false, query };
  }
}

// ============ YARN (GETYARN.IO) SCRAPER ============

const YARN_BASE = 'https://yarn.co';

export async function searchYarn(query: string, page = 1): Promise<ClipSearchResult> {
  const cacheKey = `yarn_${query}_${page}`;
  const cached = await getCached<ClipSearchResult>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${YARN_BASE}/api/search?query=${encodeURIComponent(query)}&page=${page}`, {
      method: 'GET',
      headers: DEFAULT_HEADERS,
    });

    if (!response.ok) throw new Error(`YARN search failed: ${response.status}`);

    const json = await response.json();
    
    const clips: MovieClip[] = (json.clips || json.hits || []).map((item: any) => ({
      id: `yarn_${item.id || Math.random().toString(36).slice(2)}`,
      quote: item.quote || item.text || item.subtitle || '',
      movieTitle: item.title || item.movie || 'Unknown',
      movieYear: item.year,
      character: item.character,
      actor: item.actor,
      thumbnail: item.thumbnail || item.image || '',
      videoUrl: item.video_url || item.mp4,
      youtubeId: item.youtube_id,
      startTime: item.start,
      endTime: item.end,
      duration: item.duration,
      source: 'yarn' as const,
    }));

    const result: ClipSearchResult = {
      clips,
      total: json.total || clips.length,
      page,
      hasMore: json.has_more || (json.clips?.length >= 20),
      query,
    };

    await setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[ClipFinder] YARN search error:', error);
    return { clips: [], total: 0, page, hasMore: false, query };
  }
}

// ============ TMDB VIDEOS API ============

export async function searchTMDBClips(query: string, page = 1): Promise<ClipSearchResult> {
  const cacheKey = `tmdb_clips_${query}_${page}`;
  const cached = await getCached<ClipSearchResult>(cacheKey);
  if (cached) return cached;

  if (!TMDB_API_KEY) {
    console.warn('[ClipFinder] TMDB API key not configured');
    return { clips: [], total: 0, page, hasMore: false, query };
  }

  try {
    // Search for movies first
    const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`;
    const searchResponse = await fetch(searchUrl);
    const searchJson = await searchResponse.json();

    const clips: MovieClip[] = [];

    // For each movie, get videos
    for (const movie of (searchJson.results || []).slice(0, 10)) {
      try {
        const videosUrl = `https://api.themoviedb.org/3/movie/${movie.id}/videos?api_key=${TMDB_API_KEY}`;
        const videosResponse = await fetch(videosUrl);
        const videosJson = await videosResponse.json();

        for (const video of (videosJson.results || [])) {
          if (video.type === 'Trailer' || video.type === 'Clip') {
            clips.push({
              id: `tmdb_${movie.id}_${video.id}`,
              quote: video.name || 'Trailer',
              movieTitle: movie.title,
              movieYear: movie.release_date?.slice(0, 4),
              thumbnail: video.key ? `https://img.youtube.com/vi/${video.key}/hqdefault.jpg` : '',
              youtubeId: video.key,
              duration: video.size,
              source: 'tmdb' as const,
              tmdbId: movie.id,
            });
          }
        }
      } catch (e) {
        // Continue to next movie
      }
    }

    const result: ClipSearchResult = {
      clips,
      total: searchJson.total_results || clips.length,
      page,
      hasMore: page < (searchJson.total_pages || 1),
      query,
    };

    await setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error('[ClipFinder] TMDB search error:', error);
    return { clips: [], total: 0, page, hasMore: false, query };
  }
}

// Get videos for a specific movie
export async function getMovieClips(tmdbId: number): Promise<MovieClip[]> {
  const cacheKey = `tmdb_movie_clips_${tmdbId}`;
  const cached = await getCached<MovieClip[]>(cacheKey);
  if (cached) return cached;

  if (!TMDB_API_KEY) return [];

  try {
    const videosUrl = `https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${TMDB_API_KEY}`;
    const response = await fetch(videosUrl);
    const json = await response.json();

    const clips: MovieClip[] = (json.results || []).map((video: any) => ({
      id: `tmdb_${tmdbId}_${video.id}`,
      quote: video.name,
      movieTitle: '', // Will be filled by caller
      thumbnail: video.key ? `https://img.youtube.com/vi/${video.key}/hqdefault.jpg` : '',
      youtubeId: video.key,
      duration: video.size,
      source: 'tmdb' as const,
      tmdbId,
    }));

    await setCache(cacheKey, clips);
    return clips;
  } catch (error) {
    console.error('[ClipFinder] Get movie clips error:', error);
    return [];
  }
}

// ============ YOUTUBE MOVIECLIPS CHANNEL ============

export async function searchYouTubeClips(query: string): Promise<ClipSearchResult> {
  const cacheKey = `youtube_clips_${query}`;
  const cached = await getCached<ClipSearchResult>(cacheKey);
  if (cached) return cached;

  try {
    // Use YouTube search (requires YouTube Data API or scraping)
    // For now, return results pointing to Movieclips channel
    const clips: MovieClip[] = [
      {
        id: `youtube_search_${Date.now()}`,
        quote: query,
        movieTitle: 'Search YouTube',
        thumbnail: '',
        source: 'youtube' as const,
      },
    ];

    const result: ClipSearchResult = {
      clips,
      total: 1,
      page: 1,
      hasMore: false,
      query,
    };

    await setCache(cacheKey, result);
    return result;
  } catch (error) {
    return { clips: [], total: 0, page: 1, hasMore: false, query };
  }
}

// ============ UNIFIED SEARCH ============

export interface UnifiedClipSearchOptions {
  sources?: ('playphrase' | 'yarn' | 'tmdb' | 'youtube')[];
  page?: number;
}

export async function searchAllClips(
  query: string,
  options: UnifiedClipSearchOptions = {}
): Promise<ClipSearchResult> {
  const { sources = ['playphrase', 'yarn', 'tmdb'], page = 1 } = options;

  const searchPromises = sources.map(async (source) => {
    switch (source) {
      case 'playphrase':
        return searchPlayPhrase(query, page);
      case 'yarn':
        return searchYarn(query, page);
      case 'tmdb':
        return searchTMDBClips(query, page);
      case 'youtube':
        return searchYouTubeClips(query);
      default:
        return { clips: [], total: 0, page, hasMore: false, query };
    }
  });

  const results = await Promise.all(searchPromises);

  const allClips = results.flatMap(r => r.clips);
  const total = results.reduce((sum, r) => sum + r.total, 0);

  // Deduplicate by quote similarity
  const uniqueClips = allClips.filter((clip, idx, arr) => 
    arr.findIndex(c => 
      c.quote.toLowerCase() === clip.quote.toLowerCase() &&
      c.movieTitle === clip.movieTitle
    ) === idx
  );

  return {
    clips: uniqueClips,
    total,
    page,
    hasMore: results.some(r => r.hasMore),
    query,
  };
}

// ============ POPULAR QUOTES ============

export async function getPopularQuotes(): Promise<MovieClip[]> {
  const cacheKey = 'popular_quotes';
  const cached = await getCached<MovieClip[]>(cacheKey);
  if (cached) return cached;

  // Popular movie quotes database
  const popularQuotes: MovieClip[] = [
    {
      id: 'quote_1',
      quote: "I'll be back",
      movieTitle: 'The Terminator',
      movieYear: '1984',
      character: 'Terminator',
      actor: 'Arnold Schwarzenegger',
      thumbnail: '',
      source: 'user' as const,
      tmdbId: 218,
    },
    {
      id: 'quote_2',
      quote: "May the Force be with you",
      movieTitle: 'Star Wars',
      movieYear: '1977',
      character: 'Han Solo',
      actor: 'Harrison Ford',
      thumbnail: '',
      source: 'user' as const,
      tmdbId: 11,
    },
    {
      id: 'quote_3',
      quote: "You can't handle the truth!",
      movieTitle: 'A Few Good Men',
      movieYear: '1992',
      character: 'Col. Nathan R. Jessep',
      actor: 'Jack Nicholson',
      thumbnail: '',
      source: 'user' as const,
      tmdbId: 184,
    },
    {
      id: 'quote_4',
      quote: "Here's looking at you, kid",
      movieTitle: 'Casablanca',
      movieYear: '1942',
      character: 'Rick Blaine',
      actor: 'Humphrey Bogart',
      thumbnail: '',
      source: 'user' as const,
      tmdbId: 289,
    },
    {
      id: 'quote_5',
      quote: "Bond. James Bond.",
      movieTitle: 'Dr. No',
      movieYear: '1962',
      character: 'James Bond',
      actor: 'Sean Connery',
      thumbnail: '',
      source: 'user' as const,
      tmdbId: 673,
    },
    {
      id: 'quote_6',
      quote: "Why so serious?",
      movieTitle: 'The Dark Knight',
      movieYear: '2008',
      character: 'The Joker',
      actor: 'Heath Ledger',
      thumbnail: '',
      source: 'user' as const,
      tmdbId: 155,
    },
    {
      id: 'quote_7',
      quote: "To infinity and beyond!",
      movieTitle: 'Toy Story',
      movieYear: '1995',
      character: 'Buzz Lightyear',
      actor: 'Tim Allen',
      thumbnail: '',
      source: 'user' as const,
      tmdbId: 862,
    },
    {
      id: 'quote_8',
      quote: "Life is like a box of chocolates",
      movieTitle: 'Forrest Gump',
      movieYear: '1994',
      character: 'Forrest Gump',
      actor: 'Tom Hanks',
      thumbnail: '',
      source: 'user' as const,
      tmdbId: 13,
    },
    {
      id: 'quote_9',
      quote: "Show me the money!",
      movieTitle: 'Jerry Maguire',
      movieYear: '1996',
      character: 'Rod Tidwell',
      actor: 'Cuba Gooding Jr.',
      thumbnail: '',
      source: 'user' as const,
      tmdbId: 389,
    },
    {
      id: 'quote_10',
      quote: "I see dead people",
      movieTitle: 'The Sixth Sense',
      movieYear: '1999',
      character: 'Cole Sear',
      actor: 'Haley Joel Osment',
      thumbnail: '',
      source: 'user' as const,
      tmdbId: 274,
    },
  ];

  await setCache(cacheKey, popularQuotes);
  return popularQuotes;
}

// ============ RANDOM QUOTE ============

export async function getRandomQuote(): Promise<MovieClip> {
  const quotes = await getPopularQuotes();
  return quotes[Math.floor(Math.random() * quotes.length)];
}

// ============ QUOTE BY MOVIE ============

export async function getQuotesByMovie(movieId: string): Promise<MovieClip[]> {
  const allQuotes = await getPopularQuotes();
  return allQuotes.filter(q => 
    q.tmdbId?.toString() === movieId || 
    q.movieTitle.toLowerCase().includes(movieId.toLowerCase())
  );
}

// Export all
export const ClipFinder = {
  searchPlayPhrase,
  searchYarn,
  searchTMDBClips,
  searchYouTubeClips,
  searchAllClips,
  getMovieClips,
  getPopularQuotes,
  getRandomQuote,
  getQuotesByMovie,
};

export default ClipFinder;
