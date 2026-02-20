import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { FetcherResponse } from '@/fetchers/types';
import { SourcererEmbed, SourcererOutput, makeEmbed, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ScrapeContext, ShowScrapeContext } from '@/utils/context';
import { fetchTMDBName } from '@/utils/tmdb';

import { scrapeDoodstreamEmbed } from './doodstream';
import { EMBED_URL, ORIGIN_HOST, getMoviePageURL, throwOnResponse } from './utils';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  pragma: 'no-cache',
};

export const LOG_PREFIX = '[FSOnline]';

function normalizeText(input: string): string {
  return input
    .trim()
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchMoviePageUrl(
  ctx: ScrapeContext,
  title: string,
  year?: number,
): Promise<string | undefined> {
  const query = year ? `${title} ${year}` : title;
  let $: CheerioAPI;
  try {
    const response: FetcherResponse = await ctx.proxiedFetcher.full(
      `${ORIGIN_HOST}/?s=${encodeURIComponent(query)}`,
      {
        headers: {
          Origin: ORIGIN_HOST,
          Referer: ORIGIN_HOST,
          ...BROWSER_HEADERS,
        },
      },
    );
    throwOnResponse(response);
    $ = cheerio.load(await response.body);
  } catch (error) {
    console.warn(LOG_PREFIX, 'Search request failed', query, error);
    return undefined;
  }

  const wantTitle = normalizeText(title);
  const wantYear = year ? `${year}` : undefined;

  const candidates: { url: string; titleText: string }[] = [];
  $('article.item.movies').each((_, el) => {
    const url = $(el).find('a[href*="/film/"]').attr('href');
    const titleText = $(el).find('h3').text().trim();
    if (!url) return;
    if (!url.startsWith(ORIGIN_HOST)) return;
    candidates.push({ url, titleText });
  });

  if (candidates.length < 1) {
    $('a[href*="/film/"]').each((_, el) => {
      const url = $(el).attr('href');
      if (!url) return;
      if (!url.startsWith(ORIGIN_HOST)) return;
      candidates.push({ url, titleText: $(el).text().trim() });
    });
  }

  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  let best: { url: string; score: number } | undefined;
  for (const c of uniqueCandidates) {
    const normalizedCandidateTitle = normalizeText(c.titleText);
    let score = 0;
    if (wantYear && (c.url.includes(`-${wantYear}/`) || normalizedCandidateTitle.includes(wantYear))) score += 50;
    if (normalizedCandidateTitle.includes(wantTitle)) score += 25;

    const wantWords = wantTitle.split(' ').filter(Boolean);
    const haveWords = new Set(normalizedCandidateTitle.split(' ').filter(Boolean));
    for (const w of wantWords) {
      if (haveWords.has(w)) score += 2;
    }

    if (!best || score > best.score) best = { url: c.url, score };
  }

  return best?.url;
}

async function getMovieID(
  ctx: ScrapeContext,
  url: string,
  opts?: {
    silentNotFound?: boolean;
  },
): Promise<string | undefined> {
  // console.log(LOG_PREFIX, 'Scraping movie ID from', url);

  let $: CheerioAPI;
  try {
    const response: FetcherResponse = await ctx.proxiedFetcher.full(url, {
      headers: {
        Origin: ORIGIN_HOST,
        Referer: ORIGIN_HOST,
        ...BROWSER_HEADERS,
      },
    });
    throwOnResponse(response);
    $ = cheerio.load(await response.body);
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      if (!opts?.silentNotFound) {
        console.warn(LOG_PREFIX, 'Movie page returned 404', url);
      }
      return undefined;
    }
    console.error(LOG_PREFIX, 'Failed to fetch movie page', url, error);
    return undefined;
  }

  const movieID: string | undefined = $('#show_player_lazy').attr('movie-id');
  if (!movieID) {
    console.error(LOG_PREFIX, 'Could not find movie ID', url);
    return undefined;
  }
  // console.log(LOG_PREFIX, 'Movie ID', movieID);

  return movieID;
}

async function getMovieSources(ctx: ScrapeContext, id: string, refererHeader: string): Promise<Map<string, string>> {
  // console.log(LOG_PREFIX, 'Scraping movie sources for', id);
  const sources: Map<string, string> = new Map<string, string>();

  let $: CheerioAPI;
  try {
    const response: FetcherResponse = await ctx.proxiedFetcher.full(EMBED_URL, {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: refererHeader,
        Origin: ORIGIN_HOST,
        ...BROWSER_HEADERS,
      },
      body: `action=lazy_player&movieID=${id}`,
    });
    throwOnResponse(response);
    $ = cheerio.load(await response.body);
  } catch (error) {
    console.error(LOG_PREFIX, 'Could not fetch source index', error);
    return sources;
  }

  $('li.dooplay_player_option').each((_, element) => {
    const name: string = $(element).find('span').text().trim();
    const url: string | undefined = $(element).attr('data-vs');
    if (!url) {
      console.warn(LOG_PREFIX, 'Skipping invalid source', name);
      return;
    }
    // console.log(LOG_PREFIX, 'Found movie source for', id, name, url);
    sources.set(name, url);
  });

  return sources;
}

function addEmbedFromSources(name: string, sources: Map<string, string>, embeds: SourcererEmbed[]) {
  const url = sources.get(name);
  if (!url) {
    return;
  }
  embeds.push({
    embedId: `fsonline-${name.toLowerCase()}`,
    url,
  });
}

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const movieName = await fetchTMDBName(ctx);
  let moviePageURL = getMoviePageURL(
    ctx.media.type === 'movie' ? `${movieName} ${ctx.media.releaseYear}` : movieName,
    ctx.media.type === 'show' ? ctx.media.season.number : undefined,
    ctx.media.type === 'show' ? ctx.media.episode.number : undefined,
  );
  // console.log(LOG_PREFIX, 'Movie page URL', moviePageURL);

  let movieID = await getMovieID(ctx, moviePageURL, { silentNotFound: true });
  if (!movieID && ctx.media.type === 'movie') {
    const foundUrl = await searchMoviePageUrl(ctx, movieName, ctx.media.releaseYear);
    if (foundUrl) {
      moviePageURL = foundUrl;
      movieID = await getMovieID(ctx, moviePageURL);
    } else {
      console.warn(LOG_PREFIX, 'No matching movie page found via search', movieName, ctx.media.releaseYear);
    }
  }
  if (!movieID) {
    return {
      embeds: [],
      stream: [],
    };
  }

  const embeds: SourcererEmbed[] = [];
  const sources: Map<string, string> = await getMovieSources(ctx, movieID, moviePageURL);
  addEmbedFromSources('Filemoon', sources, embeds);
  addEmbedFromSources('Doodstream', sources, embeds);

  if (embeds.length < 1) {
    throw new Error('No valid sources were found');
  }

  return {
    embeds,
  };
}

export const fsOnlineScraper = makeSourcerer({
  id: 'fsonline',
  name: 'FSOnline',
  rank: 140,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});

export const fsOnlineEmbeds = [
  makeEmbed({
    id: 'fsonline-doodstream',
    name: 'Doodstream',
    rank: 140,
    scrape: scrapeDoodstreamEmbed,
    flags: [flags.CORS_ALLOWED],
  }),
  // makeEmbed({
  //   id: 'fsonline-filemoon',
  //   name: 'Filemoon',
  //   rank: 140,
  //   scrape: scrapeFilemoonEmbed,
  //   flags: [flags.CORS_ALLOWED],
  // }),
];
