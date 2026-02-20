import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const baseUrl = 'https://catflix.su';
const tmdbId = '533535'; // Deadpool & Wolverine
const title = 'deadpool-and-wolverine';

async function testCatflix() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl, { timeout: 5000 }).catch(e => ({ ok: false }));
        console.log(`Homepage status: ${home.status}`);

        const movieUrl = `${baseUrl}/movie/${title}-${tmdbId}`;
        console.log(`Fetching movie page: ${movieUrl}`);
        const res = await fetch(movieUrl);
        console.log(`Status: ${res.status}`);

        if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            const script = $('script').filter((i, el) => $(el).html().includes('main_origin =')).html();

            if (script) {
                console.log("Found main_origin script.");
                const match = script.match(/main_origin = "(.*?)";/);
                if (match) {
                    const decoded = atob(match[1]);
                    console.log(`Decoded URL: ${decoded}`);
                }
            } else {
                console.log("Script with main_origin NOT found.");
            }
        }

    } catch (e) { console.error(e.message); }
}

testCatflix();
