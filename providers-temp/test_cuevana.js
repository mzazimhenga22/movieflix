import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const baseUrl = 'https://cuevana.biz';

async function testCuevana() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl);
        console.log(`Homepage status: ${home.status}`);

        // Try searching to find correct URL format
        const searchUrl = `${baseUrl}/?s=titanic`;
        console.log(`Searching: ${searchUrl}`);
        const searchRes = await fetch(searchUrl);
        const searchHtml = await searchRes.text();
        const $ = cheerio.load(searchHtml);

        // Log first few links that might be results
        const results = $('ul.TPost li a').map((i, el) => $(el).attr('href')).get()
            .filter(h => h && h.includes(baseUrl) && h !== baseUrl && h !== `${baseUrl}/`);

        console.log("Search Results Candidates:", results.slice(0, 5));

        // Fallback generic
        const allLinks = $('a').map((i, el) => $(el).attr('href')).get()
            .filter(h => h && h.includes(baseUrl) && !h.includes('/page/') && !h.includes('/category/'));

        console.log("Search Results Candidates:", (results.length ? results : allLinks).slice(0, 5));

        const candidates = results.length ? results : allLinks;

        if (candidates.length > 0) {
            const firstMovie = candidates[0];
            console.log(`Fetching movie page: ${firstMovie}`);
            const movieRes = await fetch(firstMovie);
            const movieHtml = await movieRes.text();

            // Check for Next.js props
            if (movieHtml.includes('{"props":{"pageProps":')) {
                console.log("SUCCESS: Found Next.js props!");
                const $m = cheerio.load(movieHtml);
                let script = $m('script')
                    .toArray()
                    .find((scriptEl) => {
                        const content = (scriptEl.children[0])?.data || '';
                        return content.includes('{"props":{"pageProps":');
                    });
                if (script) {
                    const jsonString = (script.children[0]).data;
                    const start = jsonString.indexOf('{"props":{"pageProps":');
                    const json = JSON.parse(jsonString.slice(start));
                    if (json.props.pageProps.thisMovie?.videos) {
                        console.log("Videos found:", json.props.pageProps.thisMovie.videos);
                    } else {
                        console.log("No videos in props.");
                    }
                }

            } else {
                console.log("Next.js props NOT found.");

                // Check if it's the old style Cuevana (server list in HTML)
                if (movieHtml.includes('id="OptOptions"')) {
                    console.log("Found #OptOptions - Old style Cuevana detected!");
                }
            }
        }

    } catch (err) {
        console.error(err);
    }
}

testCuevana();
