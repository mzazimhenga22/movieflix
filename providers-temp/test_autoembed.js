import fetch from 'node-fetch';

const domains = [
    'https://player.autoembed.cc/embed/movie',
    'https://autoembed.cc/embed/movie'
];
const tmdbId = '533535';

async function testAutoembed() {
    for (const d of domains) {
        try {
            const url = `${d}/${tmdbId}`;
            console.log(`Fetching ${url}...`);
            const res = await fetch(url);
            console.log(`${d} Status: ${res.status}`);

            if (res.ok) {
                const html = await res.text();
                // Check if it's an embed page
                if (html.includes('iframe') || html.includes('player')) {
                    console.log("Embed page found!");
                    console.log("Snippet:", html.substring(0, 500));
                } else {
                    console.log("Not an embed page?");
                    console.log("Snippet:", html.substring(0, 500));
                }
                break;
            }
        } catch (e) { console.log(`${d} Failed: ${e.message}`); }
    }
}

testAutoembed();
