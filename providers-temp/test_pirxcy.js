import fetch from 'node-fetch';

const baseUrl = 'https://mbp.pirxcy.dev';
const tmdbId = '533535'; // Deadpool & Wolverine

async function testPirxcy() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl, { timeout: 5000 }).catch(e => ({ ok: false, status: 'Error' }));
        console.log(`Homepage status: ${home.status}`);

        const searchUrl = `${baseUrl}/search?q=Deadpool&type=movie`;
        console.log(`Searching: ${searchUrl}`);
        const searchRes = await fetch(searchUrl);
        console.log(`Search status: ${searchRes.status}`);

        if (searchRes.ok) {
            const json = await searchRes.json();
            console.log(`Results: ${json.data?.length}`);
            if (json.data?.length) {
                const first = json.data[0];
                console.log(`First result: ${first.title} (${first.id})`);

                const detailUrl = `${baseUrl}/details/movie/${first.id}`;
                console.log(`Fetching details: ${detailUrl}`);
                const detailRes = await fetch(detailUrl);
                const detailJson = await detailRes.json();
                console.log(`TMDB Match: ${detailJson.data?.tmdb_id}`);
            }
        }

    } catch (e) { console.error(e.message); }
}

testPirxcy();
