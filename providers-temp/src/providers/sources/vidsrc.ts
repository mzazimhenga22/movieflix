import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';

const baseUrl = 'https://vidsrc.xyz';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
    let url;
    if (ctx.media.type === 'movie') {
        url = `${baseUrl}/embed/movie/${ctx.media.tmdbId}`;
    } else {
        url = `${baseUrl}/embed/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
    }

    // vidsrc.xyz returns an HTML page with an iframe
    // But usually, we just need to return the embed URL itself if it's a direct iframe source
    // However, vidsrc usually requires further scraping to get the actual file
    // For now, let's treat it as a direct embed source if possible, or use a "vidsrc" embed scraper if one exists.
    // The original vidsrcvip scraper extracted mirrors. 

    // Let's create a simple embed entry for it.

    return {
        embeds: [
            {
                embedId: 'vidsrc', // We might need a vidsrc embed scraper
                url: url,
            },
        ],
    };
}

export const vidsrcScraper = makeSourcerer({
    id: 'vidsrc',
    name: 'VidSrc',
    rank: 150,
    disabled: false,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper,
    scrapeShow: comboScraper,
});
