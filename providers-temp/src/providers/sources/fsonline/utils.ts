import { FetcherResponse } from '@/fetchers/types';
import { ScrapeContext } from '@/utils/context';

export const ORIGIN_HOST = 'https://www3.fsonline.app';
export const MOVIE_PAGE_URL = 'https://www3.fsonline.app/film/';
export const SHOW_PAGE_URL = 'https://www3.fsonline.app/episoade/{{MOVIE}}-sezonul-{{SEASON}}-episodul-{{EPISODE}}/';
export const EMBED_URL = 'https://www3.fsonline.app/wp-admin/admin-ajax.php';

export function throwOnResponse(response: FetcherResponse) {
  if (response.statusCode >= 400) {
    throw new Error(`Response does not indicate success: ${response.statusCode}`);
  }
}

export function getMoviePageURL(name: string, season?: number, episode?: number): string {
  const n = name
    .trim()
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-zA-Z0-9. ]+/g, '')
    .replace('.', ' ')
    .split(' ')
    .join('-');
  if (season && episode) {
    return SHOW_PAGE_URL.replace('{{MOVIE}}', n)
      .replace('{{SEASON}}', `${season}`)
      .replace('{{EPISODE}}', `${episode}`);
  }
  return `${MOVIE_PAGE_URL}${n}/`;
}

export async function fetchIFrame(ctx: ScrapeContext, url: string): Promise<FetcherResponse | undefined> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response: FetcherResponse = await ctx.proxiedFetcher.full(url, {
      headers: {
        Referer: ORIGIN_HOST,
        Origin: ORIGIN_HOST,
        'sec-fetch-dest': 'iframe',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'cross-site',
      },
      signal: controller.signal,
    } as any); // cast to any to allow signal in case the type doesn't support it directly
    throwOnResponse(response);
    return response;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn(`[fetchIFrame] Timeout fetching ${url} after 8000ms`);
      return undefined;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
