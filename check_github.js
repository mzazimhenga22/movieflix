const https = require('https');

const url = 'https://api.github.com/repos/mzazimhenga22/movieflix/releases/latest';

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
                const json = JSON.parse(data);
                console.log('Tag:', json.tag_name);
            } catch (e) {
                console.log('Error parsing JSON');
            }
        } else {
            console.log('Body:', data.substring(0, 200));
        }
    });
}).on('error', (e) => {
    console.log('Error:', e.message);
});
