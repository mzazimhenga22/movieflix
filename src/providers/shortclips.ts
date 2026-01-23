export type StreamResult = {
    url: string;
    type: 'mp4' | 'hls' | 'dash' | 'unknown';
};

export async function scrapeClipCafeStreamRN(
    embedId: string
): Promise<StreamResult | null> {
    try {
        const res = await fetch(`https://clip.cafe/e/${embedId}`, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
                Accept: '*/*',
                Referer: 'https://clip.cafe/',
            },
        });

        if (!res.ok) return null;

        const html = await res.text();

        // 1️⃣ Try MP4
        const mp4 = html.match(/https?:\/\/[^"' ]+\.mp4[^"' ]*/);
        if (mp4) {
            return { url: mp4[0], type: 'mp4' };
        }

        // 2️⃣ Try HLS
        const m3u8 = html.match(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/);
        if (m3u8) {
            return { url: m3u8[0], type: 'hls' };
        }

        // 3️⃣ Try DASH
        const mpd = html.match(/https?:\/\/[^"' ]+\.mpd[^"' ]*/);
        if (mpd) {
            return { url: mpd[0], type: 'dash' };
        }

        // 4️⃣ Try JSON-style config
        const jsonUrl = html.match(
            /"(https?:\/\/[^"]+\.(m3u8|mp4|mpd)[^"]*)"/
        );
        if (jsonUrl) {
            const ext = jsonUrl[2];
            let type: StreamResult['type'] = 'unknown';
            if (ext === 'mp4') type = 'mp4';
            if (ext === 'm3u8') type = 'hls';
            if (ext === 'mpd') type = 'dash';

            return {
                url: jsonUrl[1],
                type,
            };
        }

        return null;
    } catch (e) {
        console.warn('clip.cafe RN scrape failed', e);
        return null;
    }
}

function slugify(text: string | null | undefined): string {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')     // Replace spaces with -
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-');  // Replace multiple - with single -
}

export async function searchClipCafe(
    title: string,
    year?: string
): Promise<StreamResult | null> {
    try {
        // 1. Construct probable movie page URL
        // Format usually: https://clip.cafe/The-Matrix-1999/
        if (!year) year = '';
        const slug = slugify(title) + (year ? `-${year}` : '');
        const movieUrl = `https://clip.cafe/${slug}/`;

        console.log('Searching ClipCafe:', movieUrl);

        const res = await fetch(movieUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
            },
        });

        if (!res.ok) {
            console.log('ClipCafe search failed:', res.status);
            return null;
        }

        const html = await res.text();

        // 2. Find a clip link
        // Pattern: href="/The-Matrix-1999/dodge-this/" OR href="The-Matrix-1999/dodge-this/"
        // Regex: href=["']/?slug/[^"']+["']
        const clipRegex = new RegExp(`href=["']/?${slug}\\/[^"']+["']`, 'gi');
        const matches = html.match(clipRegex);

        if (!matches || matches.length === 0) {
            console.log('No clips found for movie');
            return null;
        }

        // Pick a random clip or the first one
        const randomClipAttr = matches[Math.floor(Math.random() * matches.length)];
        let clipPath = randomClipAttr.split('"')[1]; // /The-Matrix-1999/dodge-this/

        // Handle quotes if regex matched single quotes? My regex uses " in split...
        // Actually regex matched href=["']... so split('"') might be wrong if it used single quotes!
        // Robust way: extract content between quotes.
        const pathMatch = randomClipAttr.match(/href=["']([^"']+)["']/);
        if (pathMatch) clipPath = pathMatch[1];

        if (!clipPath.startsWith('/')) {
            clipPath = '/' + clipPath;
        }

        // 3. Go to clip page to get embed ID
        const clipUrl = `https://clip.cafe${clipPath}`;
        const clipRes = await fetch(clipUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
            },
        });

        if (!clipRes.ok) return null;

        const clipHtml = await clipRes.text();
        const embedMatch = clipHtml.match(/clip\.cafe\/e\/([a-zA-Z0-9_-]+)/);

        if (!embedMatch) return null;

        const embedId = embedMatch[1];

        // 4. Get the stream
        return await scrapeClipCafeStreamRN(embedId);

    } catch (e) {
        console.warn('ClipCafe search error', e);
        return null;
    }
}

/**
 * Search for ALL clips for a movie (grouped viewing)
 * Returns multiple clips from the same movie so users can watch them all together
 */
export async function searchClipCafeMultiple(
    title: string,
    year?: string,
    maxClips: number = 5
): Promise<Array<StreamResult & { clipName: string }>> {
    try {
        if (!year) year = '';
        const slug = slugify(title) + (year ? `-${year}` : '');
        const movieUrl = `https://clip.cafe/${slug}/`;

        console.log('[ClipCafe] Searching for multiple clips:', movieUrl);

        const res = await fetch(movieUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
            },
        });

        if (!res.ok) return [];

        const html = await res.text();

        // Find all clip links for this movie
        const clipRegex = new RegExp(`href=[\"']/?${slug}\\/([^\"'/]+)\\/?[\"']`, 'gi');
        const matches = [...html.matchAll(clipRegex)];

        if (!matches || matches.length === 0) {
            console.log('[ClipCafe] No clips found for movie:', title);
            return [];
        }

        // Get unique clip paths
        const uniqueClipPaths = Array.from(new Set(matches.map(m => m[1]))).slice(0, maxClips);
        console.log(`[ClipCafe] Found ${uniqueClipPaths.length} unique clips for ${title}`);

        const results: Array<StreamResult & { clipName: string }> = [];

        // Fetch each clip (with small delay to avoid rate limiting)
        for (let i = 0; i < uniqueClipPaths.length; i++) {
            const clipPath = uniqueClipPaths[i];
            try {
                const clipUrl = `https://clip.cafe/${slug}/${clipPath}/`;
                const clipRes = await fetch(clipUrl, {
                    headers: {
                        'User-Agent':
                            'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
                    },
                });

                if (!clipRes.ok) continue;

                const clipHtml = await clipRes.text();
                const embedMatch = clipHtml.match(/clip\.cafe\/e\/([a-zA-Z0-9_-]+)/);

                if (!embedMatch) continue;

                const stream = await scrapeClipCafeStreamRN(embedMatch[1]);
                if (stream) {
                    // Clean up clip name: "dodge-this" -> "Dodge This"
                    const clipName = clipPath
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase());

                    results.push({
                        ...stream,
                        clipName,
                    });
                }

                // Small delay between requests
                if (i < uniqueClipPaths.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            } catch (e) {
                // Continue to next clip on error
            }
        }

        console.log(`[ClipCafe] Successfully fetched ${results.length} clips for ${title}`);
        return results;

    } catch (e) {
        console.warn('[ClipCafe] Multiple clips search error', e);
        return [];
    }
}


export async function browseClipCafeGenre(
    genre: string,
    limit: number = 5
): Promise<Array<StreamResult & { title: string; poster?: string }>> {
    try {
        // No trailing slash as verified
        const url = `https://clip.cafe/t/${genre}`;
        console.log(`[ClipCafe] Browsing genre: ${genre}`);

        const res = await fetch(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        if (!res.ok) return [];

        const html = await res.text();

        // Verified regex: finds links ending in -YEAR/
        // Matches href="some-movie-2023/" or href="/some-movie-2023/"
        const yearPatternMatches = html.match(/href="([^"]+-\d{4}\/)"/g);

        if (!yearPatternMatches) {
            console.log('[ClipCafe] No movies found in genre (Regex match failed)');
            return [];
        }

        const uniquePaths = Array.from(new Set(yearPatternMatches.map(m => {
            const match = m.match(/href="([^"]+)"/);
            return match ? match[1] : null;
        }))).filter(Boolean) as string[];

        // Shuffle and pick subset
        const shuffled = uniquePaths.sort(() => 0.5 - Math.random()).slice(0, limit);
        console.log(`[ClipCafe] Found ${uniquePaths.length} movies. Fetching ${shuffled.length} sequentially...`);

        // RATE-LIMITED SEQUENTIAL FETCHING to avoid bot detection
        const results: Array<StreamResult & { title: string; poster?: string }> = [];

        for (let i = 0; i < shuffled.length; i++) {
            const path = shuffled[i];
            try {
                // Normalize path to get slug: "meg-2-the-trench-2023"
                const cleanPath = path.replace(/^\//, '').replace(/\/$/, '');

                // Extract title: Meg-2-The-Trench-2023 -> Meg 2 The Trench
                const parts = cleanPath.split('-');
                const year = parts.pop(); // Remove year
                const title = parts.join(' ');

                if (!title) continue;

                console.log(`[ClipCafe] [${i + 1}/${shuffled.length}] Searching: "${title}" (${year})`);

                const clip = await searchClipCafe(title, year);

                if (clip) {
                    results.push({
                        ...clip,
                        title: title,
                    });
                }

                // Add delay between requests to avoid bot detection (500-1500ms random)
                if (i < shuffled.length - 1) {
                    const delay = 500 + Math.floor(Math.random() * 1000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } catch (e) {
                console.warn('[ClipCafe] Genre item resolution failed', e);
            }
        }

        console.log(`[ClipCafe] Successfully fetched ${results.length} clips for genre: ${genre}`);
        return results;

    } catch (e) {
        console.error('[ClipCafe] Genre browse failed', e);
        return [];
    }
}

/**
 * Browse clips by genre with clips GROUPED by movie
 * Returns multiple clips per movie so users watch all clips from one movie before moving to next
 */
export async function browseClipCafeGenreGrouped(
    genre: string,
    moviesLimit: number = 3,
    clipsPerMovie: number = 3
): Promise<Array<StreamResult & { title: string; clipName: string; movieIndex: number }>> {
    try {
        const url = `https://clip.cafe/t/${genre}`;
        console.log(`[ClipCafe] Browsing genre (grouped): ${genre}`);

        const res = await fetch(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        if (!res.ok) return [];

        const html = await res.text();

        const yearPatternMatches = html.match(/href="([^"]+-\d{4}\/)"/g);

        if (!yearPatternMatches) {
            console.log('[ClipCafe] No movies found in genre');
            return [];
        }

        const uniquePaths = Array.from(new Set(yearPatternMatches.map(m => {
            const match = m.match(/href="([^"]+)"/);
            return match ? match[1] : null;
        }))).filter(Boolean) as string[];

        // Shuffle and pick limited movies
        const shuffled = uniquePaths.sort(() => 0.5 - Math.random()).slice(0, moviesLimit);
        console.log(`[ClipCafe] Found ${uniquePaths.length} movies. Fetching ${shuffled.length} with grouped clips...`);

        const results: Array<StreamResult & { title: string; clipName: string; movieIndex: number }> = [];

        for (let movieIdx = 0; movieIdx < shuffled.length; movieIdx++) {
            const path = shuffled[movieIdx];
            try {
                const cleanPath = path.replace(/^\//, '').replace(/\/$/, '');
                const parts = cleanPath.split('-');
                const year = parts.pop();
                const title = parts.join(' ');

                if (!title) continue;

                console.log(`[ClipCafe] [${movieIdx + 1}/${shuffled.length}] Fetching clips for: "${title}" (${year})`);

                // Fetch multiple clips for this movie
                const clips = await searchClipCafeMultiple(title, year, clipsPerMovie);

                // Add all clips from this movie to results
                for (const clip of clips) {
                    results.push({
                        ...clip,
                        title: title,
                        movieIndex: movieIdx,
                    });
                }

                // Delay between movies
                if (movieIdx < shuffled.length - 1) {
                    const delay = 500 + Math.floor(Math.random() * 500);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } catch (e) {
                console.warn('[ClipCafe] Failed to fetch movie clips', e);
            }
        }

        console.log(`[ClipCafe] Successfully fetched ${results.length} grouped clips for genre: ${genre}`);
        return results;

    } catch (e) {
        console.error('[ClipCafe] Grouped genre browse failed', e);
        return [];
    }
}
// ... existing code ...

/**
 * FAST: Browse genre and return movie items WITHOUT resolving video streams yet.
 * This allows the UI to load immediately.
 */
export async function browseClipCafeGenreMoviesLazy(
    genre: string,
    limit: number = 10
): Promise<Array<{ title: string; year: string; slug: string; id: string }>> {
    try {
        const url = `https://clip.cafe/t/${genre}`;
        console.log(`[ClipCafe] Browsing genre (lazy): ${genre}`);

        const res = await fetch(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        if (!res.ok) return [];

        const html = await res.text();

        // Match movie links
        const yearPatternMatches = html.match(/href="([^"]+-\d{4}\/)"/g);

        if (!yearPatternMatches) {
            console.log('[ClipCafe] No movies found in genre (lazy)');
            return [];
        }

        const uniquePaths = Array.from(new Set(yearPatternMatches.map(m => {
            const match = m.match(/href="([^"]+)"/);
            return match ? match[1] : null;
        }))).filter(Boolean) as string[];

        // Shuffle and take limit
        const shuffled = uniquePaths.sort(() => 0.5 - Math.random()).slice(0, limit);

        const results = shuffled.map((path, idx) => {
            // Normalize path to get slug: "meg-2-the-trench-2023"
            const cleanPath = path.replace(/^\//, '').replace(/\/$/, '');
            const parts = cleanPath.split('-');
            const year = parts.pop() || '';
            const title = parts.join(' ');

            return {
                title,
                year,
                slug: cleanPath,
                id: `cc-${cleanPath}-${idx}`
            };
        });

        console.log(`[ClipCafe] Lazy found ${results.length} movies for ${genre}`);
        return results;

    } catch (e) {
        console.error('[ClipCafe] Lazy browse failed', e);
        return [];
    }
}
