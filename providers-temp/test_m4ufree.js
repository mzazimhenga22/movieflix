import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const baseUrl = 'https://m4ufree.page';
const movieTitle = 'Deadpool & Wolverine';

async function testM4u() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl);
        console.log(`Homepage status: ${home.status}`);

        if (!home.ok) return;

        // Create slug logic from provider
        const searchSlug = movieTitle
            .replace(/'/g, '')
            .replace(/!|@|%|\^|\*|\(|\)|\+|=|<|>|\?|\/|,|\.|:|;|'| |"|&|#|\[|\]|~|$|_/g, '-')
            .replace(/-+-/g, '-')
            .replace(/^-+|-+$/g, '')
            .replace(/Ă¢â‚¬â€œ/g, '');

        const searchUrl = `${baseUrl}/search/${searchSlug}.html?type=movie`;
        console.log(`Searching: ${searchUrl}`);

        const searchRes = await fetch(searchUrl);
        console.log(`Search Status: ${searchRes.status}`);

        const html = await searchRes.text();
        const $ = cheerio.load(html);

        const firstResult = $('.item').first();
        const firstTitle = firstResult.find('.imagecover a').attr('title');
        const firstUrl = firstResult.find('a').attr('href');

        console.log(`First Result: ${firstTitle} -> ${firstUrl}`);

        if (firstUrl) {
            let fullUrl = firstUrl;
            if (!firstUrl.startsWith('http')) {
                fullUrl = `${baseUrl}/${firstUrl.replace(/^\//, '')}`;
            }
            console.log(`Fetching watch page: ${fullUrl}`);
            const watchRes = await fetch(fullUrl);
            const watchHtml = await watchRes.text();
            const $w = cheerio.load(watchHtml);
            const csrf = $w('meta[name="csrf-token"]').attr('content');
            console.log(`CSRF Token found: ${!!csrf}`);

            const playhq = $w('#playhq.singlemv.active').attr('data');
            console.log(`PlayHQ Data found: ${!!playhq}`);
        }

    } catch (e) {
        console.error(e);
    }
}

testM4u();
