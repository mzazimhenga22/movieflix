// using global fetch


async function scrapeImdbTrailer(imdb_id) {
    if (!imdb_id) return null;

    const headers = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: '*/*',
    };

    console.log(`[1] Fetching title page: https://www.imdb.com/title/${imdb_id}/`);
    try {
        const titleRes = await fetch(`https://www.imdb.com/title/${imdb_id}/`, {
            headers,
        });

        if (!titleRes.ok) {
            console.error(`[Scraper] Title fetch failed: ${titleRes.status} ${titleRes.statusText}`);
            return null;
        }
        const titleHtml = await titleRes.text();
        // console.log("Title HTML Preview:", titleHtml.substring(0, 500));

        // Try multiple patterns to find video ID
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
                console.log(`[Scraper] Found videoId: ${videoId} using pattern ${p}`);
                break;
            }
        }

        if (!videoId) {
            console.error('[Scraper] No video ID found on title page.');
            return null;
        }

        console.log(`[2] Fetching embed page: https://www.imdb.com/videoembed/${videoId}`);
        const embedRes = await fetch(
            `https://www.imdb.com/videoembed/${videoId}`,
            { headers }
        );

        if (!embedRes.ok) {
            console.error(`[Scraper] Embed fetch failed: ${embedRes.status}`);
            return null;
        }
        const embedHtml = await embedRes.text();
        console.log("Embed HTML Preview:", embedHtml.substring(0, 500));

        const candidates = [];

        // MP4
        const mp4Matches = embedHtml.match(
            /https:[^"' ]+\.mp4[^"' ]*/g
        );
        mp4Matches?.forEach((url) =>
            candidates.push({ url, type: 'mp4' })
        );

        // HLS / M3U8
        const m3u8Matches = embedHtml.match(
            /https:[^"' ]+\.m3u8[^"' ]*/g
        );
        m3u8Matches?.forEach((url) =>
            candidates.push({ url, type: 'hls' })
        );

        console.log(`[Scraper] Found ${candidates.length} candidates.`);
        if (candidates.length > 0) {
            console.log("Top candidate:", candidates[0]);
        }

        return {
            url: candidates.length > 0 ? candidates[0].url : null,
            type: candidates.length > 0 ? candidates[0].type : null,
            candidates: candidates
        };

    } catch (err) {
        console.error('IMDb trailer scrape failed:', err);
        return null;
    }
}

async function searchClipCafeLocal(query, year) {
    const slug = query
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

    const searchUrl = `https://clip.cafe/${slug}-trailer/`;
    console.log(`[ClipCafe] Checking: ${searchUrl}`);

    try {
        const res = await fetch(searchUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            },
        });

        if (res.ok) {
            // We found a direct trailer page!
            // Extract the embed ID or just confirm existence.
            // Usually we need to parse the player to get the Stream URL.
            const html = await res.text();
            // ... verify player ...
            console.log(`[ClipCafe] Found page at ${searchUrl}`);
            return { url: searchUrl, type: 'page' };
        } else {
            console.log(`[ClipCafe] 404 at ${searchUrl}`);
        }
    } catch (e) { console.error(e); }
    return null;
}

async function run() {
    // Wicked Part 1 IMDB ID
    const imdbId = 'tt19847976';
    console.log(`Testing scraper for ${imdbId}...`);
    const result = await scrapeImdbTrailer(imdbId);
    console.log("IMDB Result:", result);

    if (result && result.candidates && result.candidates.length > 0) {
        console.log(`Checking ${result.candidates.length} candidates...`);
        for (const cand of result.candidates) {
            try {
                // Check without headers first
                const check = await fetch(cand.url, { method: 'HEAD' });
                console.log(`[${cand.type}] Status: ${check.status}`);

                // If failed, check with headers
                if (check.status >= 400) {
                    const checkHeaders = await fetch(cand.url, {
                        method: 'HEAD',
                        headers: {
                            'Referer': 'https://www.imdb.com/',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
                        }
                    });
                    console.log(`[${cand.type}] Status (Ref): ${checkHeaders.status}`);
                }

            } catch (e) {
                console.log(`[${cand.type}] Error: ${e.message}`);
            }
        }
    }

    console.log("Testing ClipCafe fallback...");
    const clip = await searchClipCafeLocal("Wicked", "2024");
    console.log("ClipCafe Result:", clip);
}

run();
