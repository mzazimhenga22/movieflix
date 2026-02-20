
const https = require('https');
const fs = require('fs');

const API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const CLIENT_VERSION = '1.20240101.01.00';

const context = {
    client: {
        clientName: 'WEB_REMIX',
        clientVersion: CLIENT_VERSION,
    },
};

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Origin': 'https://music.youtube.com',
    'Referer': 'https://music.youtube.com/',
};

function post(endpoint, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(`https://music.youtube.com/youtubei/v1/${endpoint}?key=${API_KEY}`, {
            method: 'POST',
            headers: headers,
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    try {
        console.log('Fetching Next endpoint...');
        // "Golden" video ID
        const nextData = await post('next', { context, videoId: '9_bTl2vvYQg' });

        // Find Lyrics Browse ID
        const tabs = nextData.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;
        if (!tabs) {
            console.log('No tabs found in Next response');
            return;
        }

        const lyricsTab = tabs.find(t => t.tabRenderer?.title === 'Lyrics');
        if (!lyricsTab) {
            console.log('No Lyrics tab found');
            return;
        }

        const browseId = lyricsTab.tabRenderer.endpoint?.browseEndpoint?.browseId;
        console.log('Found Lyrics Browse ID:', browseId);

        if (browseId) {
            console.log('Fetching Browse (Lyrics) endpoint with ANDROID...');
            const browseData = await post('browse', { context, browseId });

            // Dump full JSON to file to inspect structure properly
            fs.writeFileSync('lyrics_dump.json', JSON.stringify(browseData, null, 2));
            console.log('Dumped response to lyrics_dump.json');

            // Dump relevant part
            const section = browseData.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer;
            if (section) {
                console.log('Found Description Shelf Lyrics (Unsynced?):', section.description?.runs?.map(r => r.text).join(''));
                console.log('Footer:', section.footer?.runs?.map(r => r.text).join(''));
            } else {
                console.log('Checking for synced lyrics structure...');
                // Sometimes it's in a specific renderer
                console.log(JSON.stringify(browseData, null, 2));
            }
        }

    } catch (e) {
        console.error(e);
    }
}

run();
