const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(fetchUrl(res.headers.location));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function verifyMoviePage() {
    // Test case: The Matrix (1999)
    // URL Format guess: https://clip.cafe/The-Matrix-1999/ (Case sensitivity? Space replacement?)
    const movieUrl = 'https://clip.cafe/The-Matrix-1999/';
    console.log('Fetching movie page:', movieUrl);

    try {
        const html = await fetchUrl(movieUrl);

        // Check if we got a valid page (e.g. look for movie title or clip links)
        if (html.includes('The Matrix (1999)')) {
            console.log('SUCCESS: Movie page found.');
        } else {
            console.log('WARNING: Movie title not found in response (might still be valid).');
        }

        // Look for links to clips. Pattern from previous step: /The-Matrix-1999/dodge-this/
        // or just href="/The-Matrix-1999/..."
        const clipLinks = html.match(/href="\/The-Matrix-1999\/[^"]+"/g);

        if (clipLinks && clipLinks.length > 0) {
            console.log(`Found ${clipLinks.length} potential clip links.`);
            console.log('First 3:', clipLinks.slice(0, 3));

            // Now, picking one link, we need to find its Embed ID.
            // Do we need to visit the clip page? Or is the ID in the list page?
            // Previous verification showed ID in the clip page source.

            const firstClipPath = clipLinks[0].split('"')[1];
            const clipPageUrl = `https://clip.cafe${firstClipPath}`;
            console.log('Fetching clip page:', clipPageUrl);

            const clipHtml = await fetchUrl(clipPageUrl);
            const embedMatch = clipHtml.match(/clip\.cafe\/e\/([a-zA-Z0-9_-]+)/);
            if (embedMatch) {
                console.log('Found Embed ID:', embedMatch[1]);
            } else {
                console.log('Could not find Embed ID on clip page.');
            }

        } else {
            console.log('FAILURE: No clip links found on movie page.');
            // console.log(html.substring(0, 500));
        }

    } catch (err) {
        console.error('Error:', err.message);
    }
}

verifyMoviePage();
