const https = require('https');

// --- CONFIGURATION ---
const SIMULATED_TV_LOCAL_VERSION = '1.0.0';
const SIMULATED_ENV_FEED_URL = 'https://thorgxctdyxgqjpnmcwa.supabase.co/functions/v1/app-update'; // Assuming same env
const GITHUB_REPO = 'mzazimhenga22/movieflix';

// --- LOGIC FROM TV UpdateGate.tsx ---

function parseVersionParts(version) {
    const raw = version.trim().split('-')[0];
    if (!raw) return null;
    const match = raw.match(/\d+(?:\.\d+)*/);
    const cleaned = (match?.[0] ?? '').trim();
    if (!cleaned) return null;
    const parts = cleaned.split('.');
    if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && parts[1].length >= 2) {
        const major = Number(parts[0]);
        const minor = Number(parts[1].slice(0, 1));
        const patch = Number(parts[1].slice(1));
        if ([major, minor, patch].some((n) => Number.isNaN(n))) return null;
        return [major, minor, patch];
    }
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => Number.isNaN(n))) return null;
    return nums;
}

function compareVersions(a, b) {
    const pa = parseVersionParts(a);
    const pb = parseVersionParts(b);
    if (!pa || !pb) return a === b ? 0 : a > b ? 1 : -1;
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
        const av = pa[i] ?? 0;
        const bv = pb[i] ?? 0;
        if (av > bv) return 1;
        if (av < bv) return -1;
    }
    return 0;
}

function fetchJson(url) {
    console.log(`fetching ${url} ...`);
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'node.js', 'Cache-Control': 'no-cache' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
                } else {
                    reject(new Error(`Status ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
    });
}

// --- SIMULATION ---

async function runSimulation() {
    console.log(`\n=== TV UpdateGate Simulation ===`);
    console.log(`Local TV Version (Simulated): "${SIMULATED_TV_LOCAL_VERSION}"`);
    console.log(`Feed URL Configured: "${SIMULATED_ENV_FEED_URL}"\n`);

    try {
        let latestVersion = null;
        let source = 'NONE';
        let actionUrl = '';

        // 1. Check Feed (if configured)
        if (SIMULATED_ENV_FEED_URL) {
            console.log(`[1] Checking configured Feed URL...`);
            try {
                const feed = await fetchJson(SIMULATED_ENV_FEED_URL);
                console.log(`    > Feed Response:`, JSON.stringify(feed, null, 2));
                latestVersion = (feed.latestVersion ?? '').trim();
                actionUrl = (feed.url ?? feed.androidUrl ?? '').trim();
                source = 'FEED';
            } catch (e) {
                console.error(`    > Feed Check Failed: ${e.message}`);
            }
        }

        // 2. Check GitHub (Fallback)
        if (!latestVersion) {
            console.log(`[2] Checking GitHub (Fallback)...`);
            try {
                const release = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
                console.log(`    > GitHub Tag: ${release.tag_name}`);
                latestVersion = (release.tag_name ?? '').trim();
                actionUrl = `https://github.com/${GITHUB_REPO}/releases/latest/download/movieflix.apk`; // Hardcoded in TV UpdateGate!
                source = 'GITHUB';
            } catch (e) {
                console.error(`    > GitHub Check Failed: ${e.message}`);
            }
        }

        console.log(`\n--- Comparison ---`);
        if (!latestVersion) {
            console.log(`❌ Failed to determine latest version from any source.`);
            return;
        }

        console.log(`Source: ${source}`);
        console.log(`Latest Version: "${latestVersion}"`);
        console.log(`Local Version:  "${SIMULATED_TV_LOCAL_VERSION}"`);
        console.log(`Action URL:     "${actionUrl}"`);

        const diff = compareVersions(latestVersion, SIMULATED_TV_LOCAL_VERSION);
        console.log(`Compare Result: ${diff}`);

        if (diff > 0) {
            console.log(`✅ UPDATE DETECTED! UseGate should show prompt.`);

            // ISSUE CHECK: Does the action URL point to the correct file?
            if (actionUrl.includes('movieflix.apk') && !actionUrl.includes('movieflixtv.apk')) {
                console.log(`⚠️  WARNING: Action URL points to 'movieflix.apk' (Phone App?) instead of 'movieflixtv.apk'!`);
            }
        } else {
            console.log(`❌ NO UPDATE DETECTED. (Latest <= Local)`);
        }

    } catch (e) {
        console.error('Simulation crashed:', e);
    }
}

runSimulation();
