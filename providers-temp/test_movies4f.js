import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const domains = [
    'https://movies4f.com',
    'https://movies4f.co',
    'https://movies4f.org',
    'https://movies4f.net',
    'https://movies4f.io',
    'https://movies4f.me',
    'https://movies4f.to'
];
const movieTitle = 'Deadpool & Wolverine';

async function testMovies4f() {
    for (const baseUrl of domains) {
        try {
            console.log(`Checking homepage ${baseUrl}...`);
            const home = await fetch(baseUrl, { timeout: 5000 }).catch(e => ({ ok: false, status: 'Error' }));
            console.log(`Homepage status: ${home.status}`);

            if (!home.ok) continue;

            const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(movieTitle)}`;
            console.log(`Searching: ${searchUrl}`);
            const searchRes = await fetch(searchUrl);
            const searchHtml = await searchRes.text();

            // Regex search as per provider
            const filmCardRegex = /<a[^>]*href="([^"]*\/film\/\d+\/[^"]*)"[^>]*class="[^"]*poster[^"]*"[^>]*>/;
            const match = filmCardRegex.exec(searchHtml);

            console.log(`Match found: ${!!match}`);
            if (match) {
                const filmUrl = `${baseUrl}${match[1]}`;
                console.log(`Fetching film: ${filmUrl}`);
                const filmRes = await fetch(filmUrl);
                const filmHtml = await filmRes.text();

                const $ = cheerio.load(filmHtml);
                const iframeSrc = $('iframe#iframeStream').attr('src');
                console.log(`Iframe found: ${iframeSrc}`);
                return; // Success
            }

        } catch (e) { console.error(`Error with ${baseUrl}:`, e.message); }
    }
}

testMovies4f();
