
const fetch = global.fetch || require('node-fetch');

// Mock content of scrapeImdbTrailer.ts to run in Node
const scrapeImdbTrailer = async ({ imdb_id }) => {
    if (!imdb_id) return null;

    console.log(`[Verify] Fetching IMDb page for ${imdb_id}...`);
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        Accept: '*/*',
    };

    try {
        const titleRes = await fetch(`https://www.imdb.com/title/${imdb_id}/`, { headers });
        if (!titleRes.ok) {
            console.error('[Verify] Failed to fetch title page:', titleRes.status);
            return null;
        }
        const titleHtml = await titleRes.text();

        let videoId = null;
        const patterns = [
            /\/video\/(vi\d+)/,
            /\"video\":\s*\"(vi\d+)\"/,
            /\"videoId\":\s*\"(vi\d+)\"/,
            /data-video-id=\"(vi\d+)\"/,
            /href=\"\/video\/(vi\d+)/
        ];

        for (const p of patterns) {
            const m = titleHtml.match(p);
            if (m) {
                videoId = m[1];
                console.log(`[Verify] Found Video ID: ${videoId}`);
                break;
            }
        }

        if (!videoId) {
            console.warn('[Verify] No video ID found on main page. Trying /mediaindex...');
            try {
                const mediaRes = await fetch(`https://www.imdb.com/title/${imdb_id}/mediaindex`, { headers });
                if (mediaRes.ok) {
                    const mediaHtml = await mediaRes.text();
                    const videoIdMatch = mediaHtml.match(/\/video\/(vi\d+)/);
                    if (videoIdMatch) {
                        videoId = videoIdMatch[1];
                        console.log(`[Verify] Found Video ID in mediaindex: ${videoId}`);
                    }
                }
            } catch (e) {
                console.warn('[Verify] Failed to fetch mediaindex', e);
            }
        }

        if (!videoId) {
            console.warn('[Verify] No video ID found on page or mediaindex.');
            return null;
        }

        console.log(`[Verify] Fetching embed page for ${videoId}...`);
        const embedRes = await fetch(`https://www.imdb.com/videoembed/${videoId}`, { headers });
        if (!embedRes.ok) return null;
        const embedHtml = await embedRes.text();

        const candidates = [];
        const mp4Matches = embedHtml.match(/https:[^"' ]+\.mp4[^"' ]*/g);
        mp4Matches?.forEach((url) => candidates.push({ url, type: 'mp4' }));

        const m3u8Matches = embedHtml.match(/https:[^"' ]+\.m3u8[^"' ]*/g);
        m3u8Matches?.forEach((url) => candidates.push({ url, type: 'hls' }));

        if (candidates.length === 0) {
            console.warn('[Verify] No media URLs found in embed code.');
            return null;
        }

        console.log(`[Verify] Found ${candidates.length} candidates.`);
        // Return the best one (prefer mp4 for test visibility)
        return candidates.find(c => c.type === 'mp4') || candidates[0];

    } catch (err) {
        console.error('[Verify] Scrape failed:', err);
        return null;
    }
};

// Test with "Inception" (tt1375666) and "Wicked" (tt2402320 - usually has active layout)
(async () => {
    console.log('--- Starting IMDb Verification ---');

    // Test 1: Inception
    const res1 = await scrapeImdbTrailer({ imdb_id: 'tt1375666' });
    if (res1) {
        console.log('✅ SUCCESS (Inception):', res1.url);
    } else {
        console.error('❌ FAILED (Inception)');
    }

    console.log('\n---');

    // Test 2: Wicked (Recent)
    const res2 = await scrapeImdbTrailer({ imdb_id: 'tt2402320' });
    if (res2) {
        console.log('✅ SUCCESS (Wicked):', res2.url);
    } else {
        console.error('❌ FAILED (Wicked)');
    }
})();
