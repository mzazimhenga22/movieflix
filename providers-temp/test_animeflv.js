import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const baseUrl = 'https://www3.animeflv.net';
const animeTitle = 'One Piece';

async function testAnimeFLV() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl, { timeout: 5000 }).catch(e => ({ ok: false }));
        console.log(`Homepage status: ${home.status}`);

        const searchUrl = `${baseUrl}/browse?q=${encodeURIComponent(animeTitle)}`;
        console.log(`Searching: ${searchUrl}`);
        const searchRes = await fetch(searchUrl);
        const searchHtml = await searchRes.text();
        const $ = cheerio.load(searchHtml);

        const firstResult = $('div.Container ul.ListAnimes li article a').first().attr('href');
        console.log(`First result: ${firstResult}`);

        if (firstResult) {
            const animeUrl = `${baseUrl}${firstResult}`;
            console.log(`Fetching anime: ${animeUrl}`);
            const animeRes = await fetch(animeUrl);
            const animeHtml = await animeRes.text();

            if (animeHtml.includes('var anime_info =')) {
                console.log("Found anime_info script.");
            } else {
                console.log("anime_info script NOT found.");
            }
        }

    } catch (e) { console.error(e.message); }
}

testAnimeFLV();
