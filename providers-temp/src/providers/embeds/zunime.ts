import { flags } from '@/entrypoint/utils/targets';
import { NotFoundError } from '@/utils/errors';

import { EmbedOutput, makeEmbed } from '../base';

const ZUNIME_SERVERS = ['hd-2', 'miko', 'shiro', 'zaza'];

const baseUrl = 'https://backend.xaiby.sbs';
const headers = {
  referer: 'https://vidnest.fun/',
  origin: 'https://vidnest.fun',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
};

export function makeZunimeEmbed(id: string, rank: number = 100) {
  return makeEmbed({
    id: `zunime-${id}`,
    name: `Zunime ${id.charAt(0).toUpperCase() + id.slice(1)}`,
    rank,
    flags: [flags.CORS_ALLOWED],
    async scrape(ctx): Promise<EmbedOutput> {
      const serverName = id as (typeof ZUNIME_SERVERS)[number];

      const query = JSON.parse(ctx.url);
      const { anilistId, episode } = query;

      let resText = await ctx.proxiedFetcher<string>(`${'/sources'}`, {
        baseUrl,
        headers,
        query: {
          id: String(anilistId),
          ep: String(episode ?? 1),
          host: serverName,
          type: 'dub',
        },
        readAsText: true, // We must read as text first because it might be HTML instead of JSON
      });

      // Handle fingerprint proxy bypass
      if (resText.includes('<title>xaiby.sbs</title>') || resText.includes('var redirect_link')) {
        const redirectMatch = resText.match(/var redirect_link\s*=\s*'([^']+)'/);
        const noscriptMatch = resText.match(/URL=([^'"]+)&fp=-5/);
        const fallbackMatch = resText.match(/href='([^']+&fp=-3)'/);

        let finalUrl = '';
        if (redirectMatch && redirectMatch[1]) {
          finalUrl = redirectMatch[1] + 'fp=-7';
        } else if (noscriptMatch && noscriptMatch[1]) {
          finalUrl = noscriptMatch[1] + '&fp=-5';
        } else if (fallbackMatch && fallbackMatch[1]) {
          finalUrl = fallbackMatch[1];
        }

        if (finalUrl) {
          // eslint-disable-next-line no-console
          console.log(`[Zunime] Bypassing fingerprint for ${serverName}:`, finalUrl);
          resText = await ctx.proxiedFetcher<string>(finalUrl, {
            headers,
            readAsText: true,
          });
        }
      }

      let resAny: any;
      try {
        resAny = JSON.parse(resText);
      } catch (err) {
        console.error('[Zunime] Failed to parse response:', resText.slice(0, 100));
        throw new NotFoundError('Invalid response format');
      }

      // eslint-disable-next-line no-console
      console.log(resAny);

      if (!resAny?.success || !resAny?.sources?.url) {
        throw new NotFoundError('No stream URL found in response');
      }

      const streamUrl = resAny.sources.url;
      const upstreamHeaders: Record<string, string> =
        resAny?.sources?.headers && Object.keys(resAny.sources.headers).length > 0 ? resAny.sources.headers : headers;

      ctx.progress(100);

      return {
        stream: [
          {
            id: 'primary',
            type: 'hls',
            playlist: `https://proxy-2.madaraverse.online/proxy?url=${encodeURIComponent(streamUrl)}`,
            headers: upstreamHeaders,
            flags: [],
            captions: [],
          },
        ],
      };
    },
  });
}

export const zunimeEmbeds = ZUNIME_SERVERS.map((server, i) => makeZunimeEmbed(server, 260 - i));
