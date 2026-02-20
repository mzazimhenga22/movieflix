const https = require('https');

const FEED_URL = "https://thorgxctdyxgqjpnmcwa.supabase.co/functions/v1/app-update";

console.log('--- Debugging Supabase Update Feed ---');
console.log(`Fetching feed from: ${FEED_URL}`);

https.get(FEED_URL, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        if (res.statusCode === 200) {
            try {
                const json = JSON.parse(data);
                console.log('Feed Response:', JSON.stringify(json, null, 2));
            } catch (e) {
                console.log('Raw Body:', data);
            }
        } else {
            console.log('Body:', data);
        }
    });
}).on('error', e => console.error(e));
