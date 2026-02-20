import fetch from 'node-fetch';

const tmdbId = '533535'; // Deadpool & Wolverine
const url = `https://vidsrc.xyz/embed/movie/${tmdbId}`;

async function testVidsrc() {
    try {
        console.log(`Fetching ${url}...`);
        const res = await fetch(url);
        console.log(`Status: ${res.status}`);
        if (res.ok) {
            const html = await res.text();
            console.log("HTML Start:", html.substring(0, 200));
        }
    } catch (e) { console.error(e); }
}

testVidsrc();
