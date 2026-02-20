import fetch from 'node-fetch';

const baseUrl = 'https://lmscript.xyz'; // From util.ts
const movieTitle = 'Deadpool & Wolverine';

async function testLookmovie() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl);
        console.log(`Homepage status: ${home.status}`);

        // Search API
        const searchUrl = `${baseUrl}/v1/movies?filters[q]=${encodeURIComponent(movieTitle)}`;
        console.log(`Searching: ${searchUrl}`);
        const searchRes = await fetch(searchUrl);
        console.log(`Search Status: ${searchRes.status}`);

        if (searchRes.ok) {
            const json = await searchRes.json();
            console.log(`Found ${json.items?.length || 0} items`);
            if (json.items && json.items.length > 0) {
                const first = json.items[0];
                console.log(`First item: ${first.title} (${first.year}) - ID: ${first.id_movie}`);

                // Get streams
                const streamUrl = `${baseUrl}/v1/movies/view?expand=streams,subtitles&id=${first.id_movie}`;
                console.log(`Fetching streams: ${streamUrl}`);
                const streamRes = await fetch(streamUrl);
                const streamJson = await streamRes.json();
                console.log("Streams found:", Object.keys(streamJson.streams || {}));
            }
        }

    } catch (e) {
        console.error(e);
    }
}

testLookmovie();
