import https from 'https';
import fetch from 'node-fetch';

const agent = new https.Agent({
    rejectUnauthorized: false
});

const baseUrl = 'https://api.vdrk.site'; // Found in cert altnames
const tmdbId = '533535'; // Deadpool & Wolverine (TMDB ID)

function digitToLetterMap(digit) {
    const map = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    return map[parseInt(digit, 10)];
}

function encodeTmdbId(tmdb) {
    let raw = tmdb.split('').map(digitToLetterMap).join('');
    const reversed = raw.split('').reverse().join('');
    return btoa(btoa(reversed));
}

async function testVidsrc() {
    try {
        const encodedId = encodeTmdbId(tmdbId);
        const url = `${baseUrl}/movie/${encodedId}`;
        console.log(`Testing ${url}`);

        const res = await fetch(url, {
            agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
            }
        });
        console.log(`Status: ${res.status}`);

        if (!res.ok) {
            console.log("Request failed");
            return;
        }

        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));

    } catch (e) {
        console.error(e);
    }
}

testVidsrc();
