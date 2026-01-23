async function run() {
    console.log('Verifying browseClipCafeGenre logic...');

    const genre = 'action';
    const limit = 3;
    const url = `https://clip.cafe/t/${genre}`;

    const fs = require('fs');
    console.log(`Fetching ${url}...`);
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!res.ok) {
            console.error('Fetch failed:', res.status);
            return;
        }

        const html = await res.text();
        fs.writeFileSync('debug_genre.html', html);
        console.log('HTML saved to debug_genre.html');

        // Search for any href containing a year pattern like -1999, -2023, etc.
        // This is flexible to find /Movie-Name-Year/ or similar
        const yearPatternMatches = html.match(/href="([^"]+-\d{4}\/)"/g);

        if (!yearPatternMatches) {
            console.log('No year-pattern links found.');
            // Debug: print some hrefs
            const allHrefs = html.match(/href="([^"]+)"/g);
            console.log('First 20 hrefs:', allHrefs ? allHrefs.slice(0, 20) : 'None');
            return;
        }

        console.log(`Found ${yearPatternMatches.length} year-pattern links.`);

        // Extract the paths
        const uniquePaths = Array.from(new Set(yearPatternMatches.map(m => {
            const match = m.match(/href="([^"]+)"/);
            return match ? match[1] : null;
        }))).filter(Boolean);

        console.log(`Found ${uniquePaths.length} unique movie paths.`);
        console.log('Sample paths:', uniquePaths.slice(0, 5));

        // Extract titles from paths
        // /The-Matrix-1999/ -> The Matrix
        const uniqueTitles = uniquePaths.map(p => {
            const clean = p.replace(/^\//, '').replace(/\/$/, ''); // Remove slashes
            const parts = clean.split('-');
            parts.pop(); // Remove year
            return parts.join(' ');
        });

        console.log('Sample titles:', uniqueTitles.slice(0, 5));

        // Proposed Strategy: Cache these titles, then search for them.
        console.log('Strategy verification complete: We can extract titles.');

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
