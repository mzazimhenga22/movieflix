const https = require('https');

// --- Logic from UpdateGate.tsx ---

function parseVersionParts(version) {
    const raw = version.trim().split('-')[0];
    if (!raw) return null;

    // Extract something like 1.0.1 from strings like: v1.0.1, v.1.01, release-1.2.3
    const match = raw.match(/\d+(?:\.\d+)*/);
    const cleaned = (match?.[0] ?? '').trim();
    if (!cleaned) return null;

    const parts = cleaned.split('.');

    // Heuristic for tags like "1.01" (often intended as 1.0.1)
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
    console.log(`Parsing "${a}" ->`, pa);
    console.log(`Parsing "${b}" ->`, pb);

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

// --- Fetch Logic ---

const REPO = 'mzazimhenga22/movieflix';
const LOCAL_VERSION = '1.0.3'; // Simulating the user's local version

console.log(`\n--- Debugging UpdateGate Logic ---`);
console.log(`Local Version: ${LOCAL_VERSION}`);
console.log(`Repo: ${REPO}`);

const url = `https://api.github.com/repos/${REPO}/releases/latest`;
const options = {
    headers: { 'User-Agent': 'node.js' }
};

console.log(`Fetching latest release from: ${url}...`);

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        if (res.statusCode === 200) {
            try {
                const release = JSON.parse(data);
                const latestTag = release.tag_name;
                console.log(`Latest GitHub Tag: "${latestTag}"`);

                const comparison = compareVersions(latestTag, LOCAL_VERSION);
                console.log(`Comparison Result: ${comparison}`);

                if (comparison > 0) {
                    console.log('✅ Update SHOULD BE detected (Latest > Local)');
                } else if (comparison < 0) {
                    console.log('❌ Update NOT detected (Latest < Local)');
                } else {
                    console.log('❌ Update NOT detected (Latest == Local)');
                }

                // Debugging specific weird cases from history if any
                if (latestTag.includes('v.')) {
                    console.log('\n[!] Warning: Tag contains "v."', latestTag);
                    const standard = latestTag.replace('v.', 'v');
                    console.log(`    If it was "${standard}", parsed would be:`, parseVersionParts(standard));
                }

            } catch (e) {
                console.error('Error parsing JSON:', e);
            }
        } else {
            console.error(`Request failed with status ${res.statusCode}: ${data}`);
        }
    });
}).on('error', (e) => {
    console.error('Network Error:', e.message);
});
