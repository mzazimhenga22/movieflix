import { load } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { fetchTMDBName } from '@/utils/tmdb';

const baseUrl = 'https://www.cuevana3.eu';

interface Video {
  result: string;
}

interface VideosByLanguage {
  latino?: Video[];
  spanish?: Video[];
  english?: Video[];
  [key: string]: Video[] | undefined;
}

interface MovieData {
  videos: VideosByLanguage;
}

interface EpisodeData {
  videos: VideosByLanguage;
}

function normalizeTitle(title: string): string {
  return title
    .normalize('NFD') // Remove accents
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/gi, '') // Remove non-alphanumeric characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Remove multiple hyphens
}

async function getStreamUrl(ctx: MovieScrapeContext | ShowScrapeContext, embedUrl: string): Promise<string | null> {
  try {
    const html = await ctx.proxiedFetcher(embedUrl);
    const match = html.match(/var url = '([^']+)'/);
    if (match) {
      return match[1];
    }
  } catch {
    // Ignore errors from dead embeds
  }
  return null;
}

function validateStream(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function detectEmbedIdFromUrl(url: string, lang: string): string | null {
  const lowerLang = (lang || '').toLowerCase();
  const normalizedLang =
    lowerLang === 'english' ? 'english' : lowerLang === 'latino' ? 'latino' : lowerLang === 'spanish' ? 'spanish' : 'latino';

  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = url.toLowerCase();
  }

  const isStreamwish =
    host.includes('streamwish') ||
    host.includes('swiftplayers') ||
    host.includes('hgplaycdn') ||
    host.includes('habetar') ||
    host.includes('yuguaab') ||
    host.includes('guxhag') ||
    host.includes('auvexiug') ||
    host.includes('xenolyzb');

  if (host.includes('filemoon')) return 'filemoon';
  if (isStreamwish) {
    if (normalizedLang === 'english') return 'streamwish-english';
    if (normalizedLang === 'spanish') return 'streamwish-spanish';
    return 'streamwish-latino';
  }
  if (host.includes('vidhide')) {
    if (normalizedLang === 'english') return 'vidhide-english';
    if (normalizedLang === 'spanish') return 'vidhide-spanish';
    return 'vidhide-latino';
  }
  if (host.includes('supervideo')) return 'supervideo';
  if (host.includes('dropload')) return 'dropload';
  if (host.includes('voe')) return 'voe';
  if (host.includes('streamtape')) return 'streamtape';
  if (host.includes('mixdrop')) return 'mixdrop';
  if (host.includes('dood')) return 'dood';
  return null;
}

function isDirectStreamUrl(url: string): { type: 'hls' | 'file'; url: string } | null {
  const lower = url.toLowerCase();
  if (lower.includes('.m3u8')) return { type: 'hls', url };
  if (lower.includes('.mp4')) return { type: 'file', url };
  return null;
}

type ExtractResult = {
  embeds: { embedId: string; url: string }[];
  directStream?: { type: 'hls' | 'file'; url: string };
};

async function extractVideos(ctx: MovieScrapeContext | ShowScrapeContext, videos: VideosByLanguage): Promise<ExtractResult> {
  const embeds: { embedId: string; url: string }[] = [];
  let bestDirect: { type: 'hls' | 'file'; url: string } | null = null;
  let fallbackDirect: { type: 'hls' | 'file'; url: string } | null = null;

  // Prioritize English videos first
  const orderedLangs = ['english', 'latino', 'spanish'];
  for (const lang of orderedLangs) {
    const videoArray = videos[lang];
    if (!videoArray) continue;

    for (const video of videoArray) {
      if (!video.result) continue;

      const resolvedUrl = (await getStreamUrl(ctx, video.result)) || video.result;
      if (!resolvedUrl || !validateStream(resolvedUrl)) continue;

      const direct = isDirectStreamUrl(resolvedUrl);
      if (direct) {
        if (lang === 'english' && !bestDirect) bestDirect = direct;
        else if (!fallbackDirect) fallbackDirect = direct;
        continue;
      }

      const embedId = detectEmbedIdFromUrl(resolvedUrl, lang);
      if (!embedId) continue;

      embeds.push({ embedId, url: resolvedUrl });
    }
  }

  const directStream = bestDirect ?? fallbackDirect ?? undefined;
  return { embeds, ...(directStream ? { directStream } : {}) };
}

async function fetchTitleSubstitutes(): Promise<Record<string, string>> {
  try {
    const response = await fetch('https://raw.githubusercontent.com/moonpic/fixed-titles/refs/heads/main/main.json');
    if (!response.ok) throw new Error('Failed to fetch fallback titles');
    return await response.json();
  } catch {
    return {};
  }
}

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const mediaType = ctx.media.type;
  const tmdbId = ctx.media.tmdbId;

  if (!tmdbId) {
    throw new NotFoundError('TMDB ID is required to fetch the title in Spanish');
  }

  const translatedTitle = await fetchTMDBName(ctx, 'es-ES');
  let normalizedTitle = normalizeTitle(translatedTitle);

  let pageUrl =
    mediaType === 'movie'
      ? `${baseUrl}/ver-pelicula/${normalizedTitle}`
      : `${baseUrl}/episodio/${normalizedTitle}-temporada-${ctx.media.season?.number}-episodio-${ctx.media.episode?.number}`;

  ctx.progress(60);

  let pageContent = await ctx.proxiedFetcher(pageUrl);
  let $ = load(pageContent);

  let script = $('script')
    .toArray()
    .find((scriptEl) => {
      const content = (scriptEl.children[0] as any)?.data || '';
      return content.includes('{"props":{"pageProps":');
    });

  let embeds: { embedId: string; url: string }[] = [];
  let directStream: { type: 'hls' | 'file'; url: string } | undefined;

  if (script) {
    let jsonData: any;
    try {
      const jsonString = (script.children[0] as any).data;
      const start = jsonString.indexOf('{"props":{"pageProps":');
      if (start === -1) throw new Error('No valid JSON start found');
      const partialJson = jsonString.slice(start);
      jsonData = JSON.parse(partialJson);
    } catch (error: any) {
      throw new NotFoundError(`Failed to parse JSON: ${error.message}`);
    }

    if (mediaType === 'movie') {
      const movieData = jsonData.props.pageProps.thisMovie as MovieData;
      if (movieData?.videos) {
        const extracted = await extractVideos(ctx, movieData.videos);
        embeds = extracted.embeds ?? [];
        directStream = extracted.directStream;
      }
    } else {
      const episodeData = jsonData.props.pageProps.episode as EpisodeData;
      if (episodeData?.videos) {
        const extracted = await extractVideos(ctx, episodeData.videos);
        embeds = extracted.embeds ?? [];
        directStream = extracted.directStream;
      }
    }
  }

  if (embeds.length === 0 && directStream) {
    return {
      embeds: [],
      stream: [
        directStream.type === 'hls'
          ? {
              id: 'primary',
              type: 'hls',
              flags: [],
              playlist: directStream.url,
              captions: [],
            }
          : {
              id: 'primary',
              type: 'file',
              flags: [],
              qualities: { unknown: { type: 'mp4', url: directStream.url } },
              captions: [],
            },
      ],
    };
  }

  if (embeds.length === 0) {
    const fallbacks = await fetchTitleSubstitutes();
    const fallbackTitle = fallbacks[tmdbId.toString()];

    if (!fallbackTitle) {
      throw new NotFoundError('No embed data found and no fallback title available');
    }

    normalizedTitle = normalizeTitle(fallbackTitle);
    pageUrl =
      mediaType === 'movie'
        ? `${baseUrl}/ver-pelicula/${normalizedTitle}`
        : `${baseUrl}/episodio/${normalizedTitle}-temporada-${ctx.media.season?.number}-episodio-${ctx.media.episode?.number}`;

    pageContent = await ctx.proxiedFetcher(pageUrl);
    $ = load(pageContent);
    script = $('script')
      .toArray()
      .find((scriptEl) => {
        const content = (scriptEl.children[0] as any)?.data || '';
        return content.includes('{"props":{"pageProps":');
      });

    if (script) {
      let jsonData: any;
      try {
        const jsonString = (script.children[0] as any).data;
        const start = jsonString.indexOf('{"props":{"pageProps":');
        if (start === -1) throw new Error('No valid JSON start found');
        const partialJson = jsonString.slice(start);
        jsonData = JSON.parse(partialJson);
      } catch (error: any) {
        throw new NotFoundError(`Failed to parse JSON: ${error.message}`);
      }

      if (mediaType === 'movie') {
        const movieData = jsonData.props.pageProps.thisMovie as MovieData;
        if (movieData?.videos) {
        const extracted = await extractVideos(ctx, movieData.videos);
        embeds = extracted.embeds ?? [];
        directStream = extracted.directStream;
        }
      } else {
        const episodeData = jsonData.props.pageProps.episode as EpisodeData;
        if (episodeData?.videos) {
        const extracted = await extractVideos(ctx, episodeData.videos);
        embeds = extracted.embeds ?? [];
        directStream = extracted.directStream;
        }
      }
    }

  if (embeds.length === 0 && directStream) {
    return {
      embeds: [],
      stream: [
        directStream.type === 'hls'
          ? {
              id: 'primary',
              type: 'hls',
              flags: [],
              playlist: directStream.url,
              captions: [],
            }
          : {
              id: 'primary',
              type: 'file',
              flags: [],
              qualities: { unknown: { type: 'mp4', url: directStream.url } },
              captions: [],
            },
      ],
    };
  }
  }

  if (embeds.length === 0) {
    throw new NotFoundError('No valid streams found');
  }

  return { embeds };
}

export const cuevana3Scraper = makeSourcerer({
  id: 'cuevana3',
  name: 'Cuevana3',
  rank: 80,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});

// made by @moonpic
