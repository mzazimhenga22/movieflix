import fetch from 'node-fetch';

async function searchYtMusic(query) {
    const baseUrl = 'https://music.youtube.com';
    try {
        console.log("Fetching homepage for config...");
        const homeRes = await fetch(baseUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
        });
        const html = await homeRes.text();

        // Extract Key and Client Version
        const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"(.+?)"/);
        const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;

        const contextMatch = html.match(/"INNERTUBE_CONTEXT":\s*({.+?})\s*,\s*"INNERTUBE_API_KEY"/);
        // Context might be harder to regex as it is a nested object.
        // Let's try to find clientVersion at least.
        const clientVersionMatch = html.match(/"clientVersion":"([\d\.]+)"/);
        const clientVersion = clientVersionMatch ? clientVersionMatch[1] : '1.20240101.01.00';

        if (!apiKey) {
            console.log("Could not find API Key.");
            return;
        }

        console.log(`API Key: ${apiKey}`);

        // Construct Request
        const apiUrl = `https://music.youtube.com/youtubei/v1/search?key=${apiKey}`;
        const body = {
            context: {
                client: {
                    clientName: 'WEB_REMIX',
                    clientVersion: clientVersion,
                }
            },
            query: query,
            params: "Eg-KAQwIABAAGAAgACgAMABqChAAGAAgACgAMQA=" // Filter for 'Songs' (protobuf encoding usually constant for simple filters)
            // 'Eg-KAQwIABAAGAAgACgAMABqChAAGAAgACgAMQA=' is often 'Songs' filter.
            // Let's try without params first or standard search.
        };

        console.log(`Searching API: ${query}`);
        const apiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://music.youtube.com',
                'Referer': 'https://music.youtube.com/'
            },
            body: JSON.stringify(body)
        });

        const json = await apiRes.json();

        // Parse results
        const sections = json.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;

        if (sections) {
            // Find finding the section that has songs
            // Usually the first section if filtered, or looks like "Songs"
            sections.forEach(sec => {
                const shelf = sec.musicShelfRenderer;
                if (shelf) {
                    const title = shelf.title?.runs?.[0]?.text;
                    console.log(`\nSection: ${title}`);
                    shelf.contents.forEach(item => {
                        const mrb = item.musicResponsiveListItemRenderer;
                        if (mrb) {
                            const title = mrb.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs[0].text;
                            const videoId = mrb.playlistItemData?.videoId;
                            const artist = mrb.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text.runs.map(r => r.text).join('');
                            console.log(`- ${title} (${artist}) [${videoId}]`);
                        }
                    });
                }
            });
        } else {
            console.log("No sections found in API response.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

async function run() {
    await searchYtMusic("Let It Go Frozen");
    await searchYtMusic("Golden Jungkook");
}

run();
