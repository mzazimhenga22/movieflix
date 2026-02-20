import fetch from 'node-fetch';

const baseUrl = 'https://api.coitus.ca'; // lol what a name
const tmdbId = '533535';

async function testCoitus() {
    try {
        const url = `${baseUrl}/movie/${tmdbId}`;
        console.log(`Fetching ${url}...`);
        const res = await fetch(url);
        console.log(`Status: ${res.status}`);

        if (res.ok) {
            const json = await res.json();
            console.log("Response key check:", Object.keys(json));
            if (json.videoSource) {
                console.log(`VideoSource found: ${json.videoSource.substring(0, 50)}...`);
            }
        } else {
            const txt = await res.text();
            console.log(txt);
        }

    } catch (e) { console.error(e.message); }
}

testCoitus();
