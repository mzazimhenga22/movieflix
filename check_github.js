const https = require('https');

const url = 'https://api.github.com/repos/mzazimhenga22/movieflix/releases?per_page=5';

const options = {
    headers: {
        'User-Agent': 'node.js'
    }
};

https.get(url, options, (res) => {
    console.log('Status:', res.statusCode);
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        if (res.statusCode === 200) {
            try {
                const releases = JSON.parse(data);
                releases.forEach(release => {
                    console.log('Release:', release.tag_name);
                    if (release.assets && release.assets.length > 0) {
                        release.assets.forEach(asset => {
                            console.log('  - Asset:', asset.name);
                        });
                    } else {
                        console.log('  (No assets)');
                    }
                    console.log('---');
                });
            } catch (e) {
                console.log('Error parsing JSON', e);
            }
        } else {
            console.log('Body:', data.substring(0, 200));
        }
    });
}).on('error', (e) => {
    console.log('Error:', e.message);
});
