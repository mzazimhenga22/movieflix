const https = require('https');

const url = 'https://clip.cafe/t/action/';
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

https.get(url, { headers }, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('HTML Preview:', data.substring(0, 2000));

        // Try to find movie links regex
        // Usually they look like <a href="https://clip.cafe/Movie-Name-Year/" ...
        // Try to find ANY href starting with clip.cafe
        const links = data.match(/href="(https:\/\/clip\.cafe\/[^"]+)"/g);
        if (links) {
            console.log(`Found ${links.length} links. First 10:`, links.slice(0, 10));
        } else {
            // Fallback: try relative links
            const relative = data.match(/href="\/([^"]+)"/g);
            if (relative) console.log('Found relative links:', relative.slice(0, 10));
        }
    });
}).on('error', (e) => {
    console.error(e);
});
