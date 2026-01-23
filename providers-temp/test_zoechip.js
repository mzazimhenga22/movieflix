import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const zoeBase = 'https://zoechip.cc'; // Potential mirror
const testMovie = {
    slug: 'deadpool-wolverine',
    year: '2024'
};

async function testZoechip() {
    try {
        console.log(`Checking homepage ${zoeBase}...`);
        const home = await fetch(zoeBase);
        console.log(`Homepage status: ${home.status}`);
        if (!home.ok) throw new Error('Homepage unreachable');

        const homeHtml = await home.text();
        const $home = cheerio.load(homeHtml);
        const searchAction = $home('form').attr('action');
        console.log(`Search Form Action: ${searchAction}`);

        console.log("Testing search formats...");
        const searchPatterns = [
            `/search/${testMovie.slug}`,
            `/search?keyword=${testMovie.slug}`,
            `/?s=${testMovie.slug}`,
            `/search?q=${testMovie.slug}`,
        ];

        for (const pattern of searchPatterns) {
            const searchUrl = `${zoeBase}${pattern}`;
            console.log(`Trying: ${searchUrl}`);
            try {
                const searchRes = await fetch(searchUrl);
                console.log(`Status: ${searchRes.status}`);
                if (searchRes.ok) {
                    const searchHtml = await searchRes.text();
                    const $search = cheerio.load(searchHtml);

                    if (pattern.includes('?s=')) {
                        console.log("Dumping partial body for ?s= :");
                        console.log($search('body').html()?.substring(0, 500));
                    }

                    // Check for results
                    const results = $search('.film-poster > a, .flw-item > a, .movie-list .item > a');
                    if (results.length > 0) {
                        console.log(`SUCCESS: Found ${results.length} results.`);
                        break;
                    }
                }
            } catch (e) { console.log("Search req failed", e.message); }
        }

    } catch (e) {
        console.error(e.message);
    }
}

testZoechip();
