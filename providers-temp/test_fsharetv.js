import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const baseUrl = 'https://fsharetv.co';
const movieTitle = 'Deadpool & Wolverine';

async function testFshare() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl);
        console.log(`Homepage status: ${home.status}`);

        const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(movieTitle)}`;
        console.log(`Searching: ${searchUrl}`);
        const searchRes = await fetch(searchUrl);
        const searchHtml = await searchRes.text();
        const $ = cheerio.load(searchHtml);

        const firstResult = $('.movie-item').first();
        const title = firstResult.find('b').text();
        const url = firstResult.find('a').attr('href');

        console.log(`First Result: ${title} -> ${url}`);

        if (url) {
            const watchUrl = `${baseUrl}${url.replace('/movie', '/w')}`;
            console.log(`Fetching watch page: ${watchUrl}`);
            const watchRes = await fetch(watchUrl);
            const watchHtml = await watchRes.text();

            const fileIdMatch = watchHtml.match(/Movie\.setSource\('([^']*)'/);
            const fileId = fileIdMatch ? fileIdMatch[1] : null;
            console.log(`File ID: ${fileId}`);

            if (fileId) {
                const apiUrl = `${baseUrl}/api/file/${fileId}/source?type=watch`;
                console.log(`Fetching API: ${apiUrl}`);
                const apiRes = await fetch(apiUrl);
                const json = await apiRes.json();
                console.log("Sources found:", json.data?.file?.sources?.length || 0);
                if (json.data?.file?.sources) {
                    console.log(JSON.stringify(json.data.file.sources, null, 2));
                }
            }
        }
    } catch (e) { console.error(e); }
}

testFshare();
