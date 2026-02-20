import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const baseUrl = 'https://dopebox.to';
const movieTitle = 'Deadpool & Wolverine';

async function testDopebox() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl);
        console.log(`Homepage status: ${home.status}`);

        const searchUrl = `${baseUrl}/search/${movieTitle.split(' ').join('-')}`;
        console.log(`Searching: ${searchUrl}`);
        const searchRes = await fetch(searchUrl);
        const searchHtml = await searchRes.text();
        const $ = cheerio.load(searchHtml);

        const firstResult = $('.flw-item').first();
        const title = firstResult.find('.film-name a').attr('title');
        const href = firstResult.find('.film-name a').attr('href');

        console.log(`First Result: ${title} -> ${href}`);

        if (href) {
            const id = href.split('-').pop();
            console.log(`Media ID: ${id}`);

            const listUrl = `${baseUrl}/ajax/episode/list/${id}`;
            console.log(`Fetching player list: ${listUrl}`);

            const listRes = await fetch(listUrl, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${baseUrl}${href}`
                }
            });
            const listHtml = await listRes.text();

            console.log("Snippet:", listHtml.substring(0, 200));

            const $p = cheerio.load(listHtml);
            const players = $p('.link-item').map((i, el) => $(el).text().trim()).get();
            console.log("Players found:", players);
        }

    } catch (e) { console.error(e); }
}

testDopebox();
