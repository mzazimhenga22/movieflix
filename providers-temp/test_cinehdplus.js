import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const baseUrl = 'https://cinehdplus.gratis';
// Based on code: series search uses /series/?story=...
const tmdbId = '63174'; // Lucifer
// It seems the scraper assumes searching by TMDB ID works?
// Code: `${baseUrl}/series/?story=${ctx.media.tmdbId}&do=search&subaction=search`

async function testCineHD() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl);
        console.log(`Homepage status: ${home.status}`);

        const searchUrl = `${baseUrl}/series/?story=${tmdbId}&do=search&subaction=search`;
        console.log(`Searching: ${searchUrl}`);
        const searchRes = await fetch(searchUrl);
        const searchHtml = await searchRes.text();
        const $ = cheerio.load(searchHtml);

        const seriesUrl = $('.card__title a[href]').first().attr('href');
        console.log(`Series URL found: ${seriesUrl}`);

        if (seriesUrl) {
            const fullSeriesUrl = seriesUrl.startsWith('http') ? seriesUrl : `${baseUrl}${seriesUrl}`;
            console.log(`Fetching series: ${fullSeriesUrl}`);
            const sRes = await fetch(fullSeriesUrl);
            const sHtml = await sRes.text();
            const $s = cheerio.load(sHtml);

            // Try to find S1E1
            // Selector: [data-num="1x1"]
            const ep = $s('[data-num="1x1"]');
            console.log(`Episode 1x1 found: ${ep.length > 0}`);

            if (ep.length) {
                const mirrors = ep.siblings('.mirrors').children('[data-link]');
                console.log(`Mirrors found: ${mirrors.length}`);
                mirrors.each((i, el) => {
                    console.log(`- ${$s(el).attr('data-link')} (${$s(el).text().trim()})`);
                });
            }
        }

    } catch (e) { console.error(e); }
}

testCineHD();
