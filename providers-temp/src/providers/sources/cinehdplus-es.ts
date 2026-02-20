import { load } from 'cheerio';

import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://cinehdplus.gratis';

type MirrorCandidate = {
  url: URL;
  label: string;
};

function inferLanguage(label: string): 'english' | 'latino' | 'spanish' | undefined {
  const lower = (label || '').toLowerCase();
  if (lower.includes('ingles') || lower.includes('english')) return 'english';
  if (lower.includes('latino')) return 'latino';
  if (lower.includes('castellano') || lower.includes('español') || lower.includes('espanol') || lower.includes('spanish'))
    return 'spanish';
  return undefined;
}

async function comboScraper(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  const searchUrl = `${baseUrl}/series/?story=${ctx.media.tmdbId}&do=search&subaction=search`;

  // Fetch the search results page
  const searchPage = await ctx.proxiedFetcher<string>(searchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      Referer: baseUrl,
    },
  });

  const $search = load(searchPage);

  // Find the series page URL from search results
  const seriesUrl = $search('.card__title a[href]:first').attr('href');
  if (!seriesUrl) {
    throw new NotFoundError('Series not found in search results');
  }

  ctx.progress(30);

  // Fetch the series page
  const seriesPageUrl = new URL(seriesUrl, baseUrl);
  const seriesPage = await ctx.proxiedFetcher<string>(seriesPageUrl.href, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      Referer: baseUrl,
    },
  });

  const $ = load(seriesPage);

  // Build episode selector using season and episode numbers
  const episodeSelector = `[data-num="${ctx.media.season.number}x${ctx.media.episode.number}"]`;

  // Find mirror links for the specific episode
  const mirrorCandidates: MirrorCandidate[] = $(episodeSelector)
    .siblings('.mirrors')
    .children('[data-link]')
    .toArray()
    .map((el) => {
      const link = $(el).attr('data-link');
      if (!link) return null;
      if (link.match(/cinehdplus/)) return null; // Filter out internal cinehdplus links

      const urlStr = link.startsWith('http') ? link : `https://${link}`;
      let url: URL;
      try {
        url = new URL(urlStr);
      } catch {
        return null;
      }
      if (url.hostname === 'cinehdplus.gratis') return null;

      const labelParts = [
        $(el).text(),
        $(el).attr('data-lang'),
        $(el).attr('data-title'),
        $(el).attr('title'),
        $(el).attr('aria-label'),
        $(el).attr('class'),
      ]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim());

      return {
        url,
        label: labelParts.join(' '),
      } as MirrorCandidate;
    })
    .filter((v): v is MirrorCandidate => v !== null);

  if (!mirrorCandidates.length) {
    throw new NotFoundError('No streaming links found for this episode');
  }

  ctx.progress(70);

  // Map URLs to appropriate embed scrapers
  const embeds = mirrorCandidates
    .map(({ url, label }) => {
      const lang = inferLanguage(label);
      const host = url.hostname.toLowerCase();

      let embedId: string;

      // Prefer language-specific embed ids when possible so the runner can prioritize them.
      if (host.includes('streamwish')) {
        if (lang === 'latino') embedId = 'streamwish-latino';
        else if (lang === 'spanish') embedId = 'streamwish-spanish';
        else embedId = 'streamwish-english';
      } else if (host.includes('vidhide')) {
        if (lang === 'latino') embedId = 'vidhide-latino';
        else if (lang === 'spanish') embedId = 'vidhide-spanish';
        else embedId = 'vidhide-english';
      } else if (host.includes('filemoon')) {
        embedId = 'filemoon';
      } else if (host.includes('supervideo')) {
        embedId = 'supervideo';
      } else if (host.includes('dropload')) {
        embedId = 'dropload';
      } else {
        return null;
      }

      return { embedId, url: url.href };
    })
    .filter((embed): embed is NonNullable<typeof embed> => embed !== null);

  ctx.progress(90);

  return {
    embeds,
  };
}

export const cinehdplusScraper = makeSourcerer({
  id: 'cinehdplus',
  name: 'CineHDPlus (Latino)',
  rank: 4,
  disabled: false,
  flags: [],
  scrapeShow: comboScraper,
});
