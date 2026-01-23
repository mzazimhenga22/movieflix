/* eslint-disable no-console */
import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';

const apiUrl = 'https://tom.autoembed.cc';
// const baseUrl = 'https://watch.autoembed.cc';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const mediaType = ctx.media.type === 'show' ? 'tv' : 'movie';
  let id = ctx.media.tmdbId;

  if (ctx.media.type === 'show') {
    id = `tv/${id}/${ctx.media.season.number}/${ctx.media.episode.number}`;
  } else {
    id = `movie/${id}`;
  }

  const embedUrl = `https://player.autoembed.cc/embed/${id}`;

  const embeds: SourcererEmbed[] = [
    {
      embedId: `autoembed-english`,
      url: embedUrl,
    },
  ];

  return {
    embeds,
  };
}

export const autoembedScraper = makeSourcerer({
  id: 'autoembed',
  name: 'Autoembed',
  rank: 110,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
