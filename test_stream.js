
const https = require('https');

const videoId = 'dQw4w9WgXcQ'; // Rick Astley
const musicId = 'diIQSK5fkUQ'; // Nicki Minaj

function get(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...headers
            }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function post(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            method: 'POST',
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...headers
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

async function testStream(id) {
    console.log(`\nTesting Video ID: ${id}`);
    
    // 1. Try a more stable Piped instance
    const pipedInstances = [
        'https://pipedapi.kavin.rocks',
        'https://api.piped.private.coffee'
    ];

    for (const instance of pipedInstances) {
        try {
            console.log(`Trying Piped: ${instance}...`);
            const dataRaw = await get(`${instance}/streams/${id}`);
            const data = JSON.parse(dataRaw);
            const stream = data.hls || (data.audioStreams && data.audioStreams[0]?.url);
            if (stream) {
                console.log(`✅ Success via Piped!`);
                console.log(`URL: ${stream.substring(0, 80)}...`);
                return stream;
            }
        } catch (e) {
            console.log(`Piped ${instance} failed.`);
        }
    }

    // 2. Try DirectYT
    console.log('Trying DirectYT Fallback...');
    try {
        const html = await get('https://www.youtube.com');
        const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"(.+?)"/);
        if (!apiKeyMatch) throw new Error('No API Key');
        const apiKey = apiKeyMatch[1];
        
        const apiUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
        const body = {
            context: {
                client: {
                    clientName: 'ANDROID_TESTSUITE',
                    clientVersion: '1.9.3',
                    hl: 'en-US',
                    gl: 'US'
                }
            },
            videoId: id
        };

        const resRaw = await post(apiUrl, body, {
            'User-Agent': 'com.google.android.youtube.testsuite/1.9.3 (Linux; U; Android 12; en_US) gzip'
        });
        const data = JSON.parse(resRaw);
        
        if (data.streamingData) {
            const formats = [...(data.streamingData.formats || []), ...(data.streamingData.adaptiveFormats || [])];
            const best = formats.find(f => f.url);
            if (best) {
                console.log('✅ Success via DirectYT!');
                console.log(`URL: ${best.url.substring(0, 80)}...`);
                return best.url;
            } else {
                console.log('❌ DirectYT returned formats but all require cipher decryption.');
            }
        } else {
            console.log(`❌ DirectYT Status: ${data.playabilityStatus?.status} - ${data.playabilityStatus?.reason || ''}`);
        }
    } catch (e) {
        console.log('DirectYT Fallback failed:', e.message);
    }

    return null;
}

(async () => {
    // Try Rick Astley first as it's the most reliable "open" stream
    let result = await testStream(videoId);
    if (!result) result = await testStream(musicId);
    
    if (result) {
        console.log('\nFINAL STATUS: SUCCESS');
    } else {
        console.log('\nFINAL STATUS: FAILURE');
    }
})();
