import fetch from 'node-fetch';

const baseUrl = 'https://backend.animetsu.to';
const path = '/api/anime/tiddies'; // Verified from source

async function testAnimetsu() {
    try {
        console.log(`Checking backend ${baseUrl}...`);
        const home = await fetch(baseUrl, { timeout: 5000 }).catch(e => ({ ok: false, status: 'Error' }));
        console.log(`Homepage status: ${home.status}`);

        const url = `${baseUrl}${path}?server=pahe&id=1&num=1&subType=dub`;
        console.log(`Fetching ${url}...`);
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Origin': baseUrl,
                'Referer': 'https://animetsu.to/'
            }
        });
        console.log(`Status: ${res.status}`);

        if (res.ok) {
            const json = await res.json();
            console.log("Response:", JSON.stringify(json).substring(0, 100));
        } else {
            console.log(`Error: ${res.statusText}`);
        }

    } catch (e) { console.error(e.message); }
}

testAnimetsu();
