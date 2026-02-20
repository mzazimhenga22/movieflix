import fetch from 'node-fetch';

const streamboxBase = 'https://vidjoy.pro/embed/api/fastfetch';
const tmdbId = '533535'; // Deadpool & Wolverine

async function testStreamBox() {
    try {
        const url = `${streamboxBase}/${tmdbId}?sr=0`;
        console.log(`Fetching ${url}...`);

        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        console.log(`Status: ${res.status}`);

        if (res.ok) {
            const json = await res.json();
            console.log("Response snippet:", JSON.stringify(json).substring(0, 200));
            if (json.url) {
                console.log("Stream URL found.");
            }
        }
    } catch (e) { console.error(e.message); }
}

testStreamBox();
