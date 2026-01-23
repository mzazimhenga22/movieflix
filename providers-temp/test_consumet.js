import fetch from 'node-fetch';

const baseUrl = 'https://api.1anime.app/anime/zoro';
const query = 'One Piece';

async function testConsumet() {
    try {
        const searchUrl = `${baseUrl}/${encodeURIComponent(query)}?page=1`;
        console.log(`Searching: ${searchUrl}`);
        const res = await fetch(searchUrl);
        console.log(`Status: ${res.status}`);

        if (!res.ok) {
            console.log('Search failed.');
            return;
        }

        const json = await res.json();
        console.log(`Found ${json.results?.length} results.`);

        if (json.results?.length) {
            const first = json.results[0];
            console.log(`First result: ${first.title} (${first.id})`);

            const infoUrl = `${baseUrl}/info?id=${first.id}`;
            console.log(`Fetching info: ${infoUrl}`);
            const infoRes = await fetch(infoUrl);
            const infoJson = await infoRes.json();

            console.log(`Episodes found: ${infoJson.episodes?.length}`);
        }

    } catch (e) {
        console.error(e);
    }
}

testConsumet();
