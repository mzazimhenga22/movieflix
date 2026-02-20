const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            resolve({ statusCode: res.statusCode, location: res.headers.location });
            res.resume(); // Consume (discard) body
        }).on('error', reject);
    });
}

async function debugUrls() {
    const urls = [
        'https://clip.cafe/The-Matrix-1999/', // Capitalized (Known from clip URL)
        'https://clip.cafe/the-matrix-1999/', // Lowercase (My slugify)
        'https://clip.cafe/movies/The-Matrix-1999/',
        'https://clip.cafe/movies/the-matrix-1999/'
    ];

    for (const url of urls) {
        try {
            const res = await fetchUrl(url);
            console.log(`URL: ${url} -> Status: ${res.statusCode} Location: ${res.location || 'N/A'}`);
        } catch (err) {
            console.log(`URL: ${url} -> Error: ${err.message}`);
        }
    }
}

debugUrls();
