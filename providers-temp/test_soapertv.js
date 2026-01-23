import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { URLSearchParams } from 'url';

const baseUrl = 'https://soaper.cc';
const movieTitle = 'Deadpool & Wolverine';

async function testSoaper() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl);
        console.log(`Homepage status: ${home.status}`);

        // Search
        const searchUrl = `${baseUrl}/search.html?keyword=${encodeURIComponent(movieTitle)}`;
        console.log(`Searching: ${searchUrl}`);
        const searchRes = await fetch(searchUrl);
        const searchHtml = await searchRes.text();
        const $ = cheerio.load(searchHtml);

        const firstResult = $('.thumbnail').first();
        const title = firstResult.find('h5 a').text();
        const url = firstResult.find('h5 a').attr('href');

        console.log(`First Result: ${title} -> ${url}`);

        if (url) {
            const showLink = `${baseUrl}${url}`;
            console.log(`Fetching show page: ${showLink}`);
            const showRes = await fetch(showLink);
            const showHtml = await showRes.text();
            const $s = cheerio.load(showHtml);

            const pass = $s('#hId').attr('value');
            console.log(`Pass value found: ${!!pass} (${pass})`);

            if (pass) {
                const formData = new URLSearchParams();
                formData.append('pass', pass);
                formData.append('e2', '0');
                formData.append('server', '0');

                const infoEndpoint = `${baseUrl}/home/index/getMInfoAjax`;
                console.log(`Fetching stream info from ${infoEndpoint}...`);

                const streamRes = await fetch(infoEndpoint, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Referer': showLink,
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                const streamJson = await streamRes.json();
                console.log('Stream JSON val exists:', !!streamJson.val);
                if (streamJson.val) {
                    console.log('Stream URL:', `${baseUrl}/${streamJson.val}`);
                }
            }
        }

    } catch (e) {
        console.error(e);
    }
}

testSoaper();
