import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';

const TMDB_API_KEY = (
  (typeof process !== 'undefined' && (process.env as any)?.EXPO_PUBLIC_TMDB_API_KEY) ||
  (typeof process !== 'undefined' && (process.env as any)?.MOVIE_WEB_TMDB_API_KEY) ||
  ''
).trim();

export async function fetchTMDBName(
  ctx: ShowScrapeContext | MovieScrapeContext,
  lang: string = 'en-US',
): Promise<string> {
  if (!TMDB_API_KEY) {
    throw new Error('Missing TMDB API key. Set EXPO_PUBLIC_TMDB_API_KEY (or MOVIE_WEB_TMDB_API_KEY for the providers CLI).');
  }

  const type = ctx.media.type === 'movie' ? 'movie' : 'tv';
  const url = `https://api.themoviedb.org/3/${type}/${ctx.media.tmdbId}?api_key=${TMDB_API_KEY}&language=${lang}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error fetching TMDB data: ${response.statusText}`);
  }

  const data = await response.json();
  return ctx.media.type === 'movie' ? data.title : data.name;
}
