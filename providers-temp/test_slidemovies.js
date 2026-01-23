import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const baseUrl = 'https://pupp.slidemovies-dev.workers.dev';
const tmdbId = '533535'; // Deadpool & Wolverine

async function testSlideMovies() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl, { timeout: 5000 }).catch(e => ({ ok: false, status: 'Error' }));
        console.log(`Homepage status: ${home.status}`);

        const watchUrl = `${baseUrl}/movie/${tmdbId}`;
        console.log(`Fetching watch page: ${watchUrl}`);
        const res = await fetch(watchUrl);
        console.log(`Status: ${res.status}`);

        if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            const playerSrc = $('media-player').attr('src');
            console.log(`Player Src: ${playerSrc}`);

            const tracks = $('media-provider track');
            console.log(`Tracks found: ${tracks.length}`);
        }

    } catch (e) { console.error(e.message); }
}

testSlideMovies();
