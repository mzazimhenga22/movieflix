const https = require('https');

const API_KEY = "1ba41bda48d0f1c90954f4811637b6d6";
const API_BASE_URL = 'https://api.themoviedb.org/3';

// --- HELPER: fetchUrl ---
function fetchUrl(url, headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(fetchUrl(res.headers.location, headers));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ body: data, headers: res.headers, status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300 }));
        }).on('error', reject);
    });
}

// --- SHORTCLIPS LOGIC ---
function slugify(text) {
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
}

async function scrapeClipCafeStreamRN(embedId) {
    try {
        const res = await fetchUrl(`https://clip.cafe/e/${embedId}`);
        if (!res.ok) return null;
        const html = res.body;

        const mp4 = html.match(/https?:\/\/[^"' ]+\.mp4[^"' ]*/);
        if (mp4) return { url: mp4[0], type: 'mp4' };

        const jsonUrl = html.match(/"(https?:\/\/[^"]+\.(m3u8|mp4|mpd)[^"]*)"/);
        if (jsonUrl) return { url: jsonUrl[1], type: 'video' };

        return null;
    } catch (e) { return null; }
}

async function searchClipCafe(title, year) {
    try {
        if (!year) year = '';
        const slug = slugify(title) + (year ? `-${year}` : '');
        const movieUrl = `https://clip.cafe/${slug}/`;
        console.log(`[ClipCafe] Searching: ${movieUrl}`);

        const res = await fetchUrl(movieUrl);
        if (!res.ok) {
            console.log(`[ClipCafe] Failed: ${res.status}`);
            return null;
        }

        const html = res.body;
        const clipRegex = new RegExp(`href=["']/?${slug}\\/[^"']+["']`, 'gi');
        const matches = html.match(clipRegex);

        if (!matches || matches.length === 0) {
            console.log(`[ClipCafe] No clips link found regex match.`);
            return null;
        }

        const randomClipAttr = matches[0]; // Just take first
        let clipPath = randomClipAttr.split('"')[1];
        const pathMatch = randomClipAttr.match(/href=["']([^"']+)["']/);
        if (pathMatch) clipPath = pathMatch[1];
        if (!clipPath.startsWith('/')) clipPath = '/' + clipPath;

        console.log(`[ClipCafe] Found clip path: ${clipPath}`);

        const clipUrl = `https://clip.cafe${clipPath}`;
        const clipRes = await fetchUrl(clipUrl);
        if (!clipRes.ok) return null;

        const embedMatch = clipRes.body.match(/clip\.cafe\/e\/([a-zA-Z0-9_-]+)/);
        if (!embedMatch) return null;

        return await scrapeClipCafeStreamRN(embedMatch[1]);
    } catch (e) {
        console.warn('[ClipCafe] Error:', e.message);
        return null;
    }
}

// --- IMDB TRAILER LOGIC ---
async function scrapeImdbTrailer(imdb_id) {
    if (!imdb_id) return null;
    try {
        console.log(`[IMDB] Scrape ID: ${imdb_id}`);
        const titleRes = await fetchUrl(`https://www.imdb.com/title/${imdb_id}/`);
        if (!titleRes.ok) return null;

        const videoIdMatch = titleRes.body.match(/\/video\/(vi\d+)/);
        if (!videoIdMatch) {
            console.log('[IMDB] No video ID found with primary regex. Length:', titleRes.body.length);
            const patterns = [
                /\/video\/(vi\d+)/,
                /\"video\":\s*\"(vi\d+)\"/,
                /\"videoId\":\s*\"(vi\d+)\"/,
                /data-video-id=\"(vi\d+)\"/
            ];
            for (const p of patterns) {
                const m = titleRes.body.match(p);
                if (m) console.log(`   Match for ${p}:`, m[1]);
            }
            return null;
        }

        const videoId = videoIdMatch[1];
        console.log(`[IMDB] Found Video ID: ${videoId}`);

        const embedUrl = `https://www.imdb.com/videoembed/${videoId}`;
        const embedRes = await fetchUrl(embedUrl);

        if (!embedRes.ok) {
            console.log(`[IMDB] Embed page failed: ${embedRes.status}`);
            return null;
        }

        console.log(`[IMDB] Embed page fetched. Length: ${embedRes.body.length}`);
        // console.log('Embed Body Preview:', embedRes.body.substring(0, 500)); 

        const mp4Matches = embedRes.body.match(/https:[^"' ]+\.mp4[^"' ]*/g);
        if (mp4Matches && mp4Matches.length > 0) {
            return { url: mp4Matches[0], type: 'mp4' };
        } else {
            console.log('[IMDB] No MP4 matches found in embed page');
            // Log all scripts to see if data is in JSON blob
            // const scripts = embedRes.body.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
            // console.log('Scripts found:', scripts ? scripts.length : 0);
        }
        return null;
    } catch (e) {
        console.error('[IMDB] Error:', e.message);
        return null;
    }
}

// --- MAIN SIMULATION ---
async function run() {
    console.log('Fetching Popular Movies...');
    const url = `${API_BASE_URL}/movie/popular?api_key=${API_KEY}&language=en-US&page=1`;
    const res = await fetchUrl(url);
    if (!res.ok) {
        console.error('TMDB Error:', res.status, res.body);
        return;
    }

    let data;
    try { data = JSON.parse(res.body); } catch (e) { console.error('JSON Parse Error'); return; }

    const movies = [{ title: 'The Matrix', release_date: '1999-03-30', id: 603 }];
    console.log(`Processing ${movies.length} movies...`);

    const finalItems = [];

    for (const movie of movies) {
        console.log(`\nMovie: ${movie.title} (${movie.release_date})`);
        const year = movie.release_date ? movie.release_date.substring(0, 4) : undefined;

        // 1. ClipCafe
        const clip = await searchClipCafe(movie.title, year);
        if (clip) {
            console.log('✅ Found Clip:', clip.url);
            finalItems.push('clip');
        } else {
            console.log('❌ No Clip found');
        }

        // 2. IMDB Trailer
        const extUrl = `${API_BASE_URL}/movie/${movie.id}/external_ids?api_key=${API_KEY}`;
        const extRes = await fetchUrl(extUrl);
        let imdbId = null;
        if (extRes.ok) {
            try {
                const extData = JSON.parse(extRes.body);
                imdbId = extData.imdb_id;
            } catch (e) { }
        }

        if (imdbId) {
            const trailer = await scrapeImdbTrailer(imdbId);
            if (trailer) {
                console.log('✅ Found Trailer:', trailer.url);
                finalItems.push('trailer');
            } else {
                console.log('❌ No Trailer found');
            }
        } else {
            console.log('❌ No IMDB ID found');
        }
    }

    console.log(`\nTotal Items: ${finalItems.length}`);
}

run();
