const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function run() {
    try {
        const html = await fetchUrl('https://www.imdb.com/title/tt0133093/');
        console.log('HTML Length:', html.length);

        // Try to find ANY video link or ID
        const patterns = [
            /\/video\/(vi\d+)/,
            /\"video\":\s*\"(vi\d+)\"/,
            /\"videoId\":\s*\"(vi\d+)\"/,
            /data-video-id=\"(vi\d+)\"/,
            /href=\"\/video\/(vi\d+)/
        ];

        for (const p of patterns) {
            const match = html.match(p);
            if (match) {
                console.log(`Match for ${p}:`, match[1]);
            }
        }

    } catch (e) {
        console.error(e);
    }
}
run();
