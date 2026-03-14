
async function check(videoId, label) {
    console.log(`[Test] Checking ${label} (${videoId})...`);
    
    // Scrape config
    let apiKey = '';
    let visitorData = '';
    try {
        const res = await fetch('https://www.youtube.com', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const html = await res.text();
        apiKey = html.match(/"INNERTUBE_API_KEY":"(.+?)"/)?.[1] || '';
        visitorData = html.match(/"visitorData":"(.+?)"/)?.[1] || '';
    } catch (e) { return false; }

    // Try TV client
    const apiUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
    const body = {
        context: {
            client: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.20230801.00.00', platform: 'TV' }
        },
        videoId: videoId
    };

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Visitor-Id': visitorData },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        const hasStream = !!(data.streamingData?.formats?.find(f => f.url) || data.streamingData?.adaptiveFormats?.find(f => f.url));
        console.log(`[Test] ${label} -> Playability: ${data.playabilityStatus?.status}, Stream Found: ${hasStream}`);
        return hasStream;
    } catch (e) { return false; }
}

(async () => {
    const musicOk = await check('fdz_cabS9BU', 'Official Music');
    const videoOk = await check('jNQXAC9IVRw', 'Standard Video');
    process.exit((musicOk || videoOk) ? 0 : 1);
})();
