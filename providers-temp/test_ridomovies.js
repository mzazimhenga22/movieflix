import fetch from 'node-fetch';

const baseUrl = 'https://ridomovies.tv';
const apiBase = `${baseUrl}/core/api`;
const movieTitle = 'Deadpool & Wolverine';

async function testRido() {
    try {
        console.log(`Checking homepage ${baseUrl}...`);
        const home = await fetch(baseUrl);
        console.log(`Homepage status: ${home.status}`);

        const searchUrl = `${apiBase}/search?q=${encodeURIComponent(movieTitle)}`;
        console.log(`Searching API: ${searchUrl}`);
        const searchRes = await fetch(searchUrl);
        const searchJson = await searchRes.json();

        console.log(`Found ${searchJson.data?.items?.length || 0} items`);

        if (searchJson.data?.items?.length > 0) {
            const item = searchJson.data.items[0];
            console.log(`First item: ${item.title} (${item.contentable.releaseYear})`);
            console.log(`Full Slug: ${item.fullSlug}`);

            const videoUrl = `${apiBase}/${item.fullSlug}/videos`;
            console.log(`Fetching videos: ${videoUrl}`);
            const vidRes = await fetch(videoUrl);
            const vidJson = await vidRes.json();

            if (vidJson.data && vidJson.data.length > 0) {
                console.log("Embeds found:");
                vidJson.data.forEach(v => console.log(`- ${v.url}`));
            } else {
                console.log("No videos found.");
            }
        }

    } catch (e) { console.error(e); }
}

testRido();
