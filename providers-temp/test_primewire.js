import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const imdbId = 'tt6263850'; // Deadpool & Wolverine
// Note: primewire.li might not use pstream API directly. 
// We are checking if the domain is reachable first.
const baseUrl = `https://primewire.si`;
const apiUrl = `${baseUrl}/movie/${imdbId}`;
// This test script was for pstream.mov API.
// If we switch to primewire.li, we might need to parse HTML instead of JSON.
// Let's just check reachability first.

async function testPrimewire() {
    try {
        const searchUrl = `${baseUrl}/filter?s=${imdbId}`; // Searching by IMDb ID
        console.log(`Searching ${searchUrl}...`);
        const res = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
            }
        });
        const html = await res.text();
        const $ = cheerio.load(html);

        console.log("Search Page HTML Snippet:", html.substring(0, 1000));
        console.log("Search Results Container:", $('.index_item, .movie_item, .index_container, .items').html()?.substring(0, 500));

        // Find movie link in search results
        // Selectors based on typical Primewire layout
        const firstResult = $('.index_item a, .movie_item a').first().attr('href');
        console.log("First Search Result:", firstResult);

        if (firstResult) {
            const movieUrl = `${baseUrl}${firstResult}`;
            console.log(`Fetching Search Result: ${movieUrl}`);
            const mRes = await fetch(movieUrl);
            const mHtml = await mRes.text();
            console.log("Movie Page snippet:", mHtml.substring(0, 500));
        }

    } catch (e) {
        console.error(e.message);
    }
}

testPrimewire();
