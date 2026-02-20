const https = require('https');

const REPO = 'mzazimhenga22/movieflix';
const HEADERS = { 'User-Agent': 'node.js' };

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: HEADERS }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(e); }
                } else {
                    reject(new Error(`Status ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

(async () => {
    try {
        console.log('--- Debugging GitHub Release Status ---');

        // 1. Check what "latest" endpoint returns
        console.log('1. Fetching /releases/latest ...');
        const latestRelease = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`);
        console.log(`   > "latest" endpoint returns tag: [${latestRelease.tag_name}]`);
        console.log(`   > Prerelease: ${latestRelease.prerelease}`);

        // 2. Check the actual list of releases (which includes prereleases)
        console.log('\n2. Fetching /releases (list) ...');
        const allReleases = await fetchJson(`https://api.github.com/repos/${REPO}/releases?per_page=5`);

        console.log('   > Recent releases found:');
        allReleases.forEach(r => {
            console.log(`     - Tag: [${r.tag_name}] | Prerelease: ${r.prerelease} | Draft: ${r.draft} | Created: ${r.created_at}`);
        });

        const actualLatestTag = allReleases[0]?.tag_name;

        console.log('\n--- Conclusion ---');
        if (latestRelease.tag_name !== actualLatestTag) {
            console.log(`⚠️ MISMATCH DETECTED!`);
            console.log(`   The app is checking "${latestRelease.tag_name}" (Stable API)`);
            console.log(`   But the actual newest release is "${actualLatestTag}"`);

            if (allReleases[0].prerelease) {
                console.log(`   CAUSE: "${actualLatestTag}" is marked as a PRE-RELEASE.`);
                console.log(`   The /releases/latest API ignores pre-releases.`);
            }
        } else {
            console.log('✅ "latest" endpoint matches the newest release tag.');
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
})();
