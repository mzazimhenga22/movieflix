import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { flags } from '@/entrypoint/utils/targets';

const baseApiUrl = 'https://primesrc.me/api/v1/';

const nameToEmbedId: Record<string, string> = {
  Filelions: 'filelions',
  Dood: 'dood',
  Streamwish: 'streamwish-english',
  Filemoon: 'filemoon',
  Voe: 'voe',
  Mixdrop: 'mixdrop',
};

function extractLinkFromPrimeSrcResponse(body: unknown): string | null {
  if (typeof body === 'string') {
    const trimmed = body.trim();

    // Sometimes the endpoint returns JSON as a string
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.link && typeof parsed.link === 'string') return parsed.link;
    } catch {
      // ignore
    }

    // Sometimes the endpoint returns the link as plain text
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    // Fallback: extract first URL-looking token
    const m = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
    return m?.[0] ?? null;
  }

  if (body && typeof body === 'object') {
    const anyBody = body as any;
    if (typeof anyBody.link === 'string') return anyBody.link;
    if (typeof anyBody.url === 'string') return anyBody.url;
    if (anyBody.data && typeof anyBody.data.link === 'string') return anyBody.data.link;
  }

  return null;
}

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const url =
    ctx.media.type === 'movie'
      ? `${baseApiUrl}s?tmdb=${ctx.media.tmdbId}&type=movie`
      : `${baseApiUrl}s?tmdb=${ctx.media.tmdbId}&season=${ctx.media.season.number}&episode=${ctx.media.episode.number}&type=tv`;

  let data;
  try {
    data = await ctx.proxiedFetcher<any>(url);
  } catch {
    return { embeds: [] };
  }

  if (!data?.servers || !Array.isArray(data.servers)) {
    return { embeds: [] };
  }

  ctx.progress(30);

  // Get first server of each embed type for parallel fetching
  const seenTypes = new Set<string>();
  const serversToFetch: Array<{ embedId: string; key: string }> = [];

  for (const server of data.servers) {
    if (!server.name || !server.key) continue;
    const embedId = nameToEmbedId[server.name];
    if (!embedId || seenTypes.has(embedId)) continue;
    seenTypes.add(embedId);
    serversToFetch.push({ embedId, key: server.key });
  }

  ctx.progress(50);

  // Fetch all links in parallel
  const results = await Promise.allSettled(
    serversToFetch.map(async ({ embedId, key }) => {
      const linkBody = await ctx.proxiedFetcher<any>(`${baseApiUrl}l?key=${key}`);
      return { embedId, url: extractLinkFromPrimeSrcResponse(linkBody) };
    })
  );

  ctx.progress(90);

  const embeds = results
    .filter((r) => r.status === 'fulfilled' && typeof r.value.url === 'string' && r.value.url.length > 0)
    .map((r) => {
      const v = (r as PromiseFulfilledResult<{ embedId: string; url: string }>).value;
      return { embedId: v.embedId, url: v.url };
    });

  return { embeds };
}

export const primesrcScraper = makeSourcerer({
  id: 'primesrc',
  name: 'PrimeSrc',
  rank: 190,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
