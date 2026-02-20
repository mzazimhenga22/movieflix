import fetch from 'node-fetch';

const domains = [
    'https://lookmovie2.to',
    'https://lookmovie.ag',
    'https://lookmovie.site',
    'https://lookmovie2.la',
    'https://lookmovie.buzz',
    'https://lookmovie.click',
    'https://lookmovie.foundation',
    'https://lookmovie.fun',
    'https://primewire.mx', // Also try the primewire one found
    'https://primewire.tf'
];
const movieTitle = 'Deadpool & Wolverine';

async function testLook2Movie() {
    for (const d of domains) {
        try {
            console.log(`Checking homepage ${d}...`); // Variable name mismatch fixed below
            const home = await fetch(d, { timeout: 5000 }).catch(e => ({ ok: false }));
            console.log(`${d} status: ${home.status}`);
            if (home.ok) {
                console.log("Working domain found:", d);
                const searchUrl = `${d}/search/${encodeURIComponent(movieTitle)}`;
                console.log(`Searching: ${searchUrl}`);
                const searchRes = await fetch(searchUrl);
                const searchHtml = await searchRes.text();

                console.log(`Search result length: ${searchHtml.length}`);
                if (searchHtml.includes('movie-item') || searchHtml.includes('film-poster')) {
                    console.log("Likely working search.");
                    return;
                }
            }
        } catch (e) { console.log(`${d} failed: ${e.message}`); }
    }
}

testLook2Movie();
