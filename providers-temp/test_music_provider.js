
// Mock fetch globally for the compiled TS (or use ts-node if available, but staying simple)
// Actually, since I'm running in node, I need to make sure the provider file can be run.
// The provider uses `fetch`. Node 18+ has fetch. 
// But the provider is .ts. I can't run it directly with node unless I compile it or use ts-node.
// Since I don't want to mess with ts-config, I will manually transpile the logic I just wrote into a test js file 
// OR I can use the existing 'test_ytmusic.js' logic which is basically identical.

// Use the exact code I wrote to the file to verify it compiles/runs logic-wise.
// But I can't strictly import the TS file.
// I will create a JS version of the class in the test file to verify the logic "as implemented".

import fetch from 'node-fetch';

class YouTubeMusic {
    constructor() {
        this.baseUrl = 'https://music.youtube.com';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        };
    }

    async search(query) {
        try {
            // 1. Fetch homepage
            console.log("Fetching homepage...");
            const homeRes = await fetch(this.baseUrl, { headers: this.headers });
            const html = await homeRes.text();

            const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"(.+?)"/);
            const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;

            const clientVersionMatch = html.match(/"clientVersion":"([\d\.]+)"/);
            const clientVersion = clientVersionMatch ? clientVersionMatch[1] : '1.20240101.01.00';

            if (!apiKey) {
                throw new Error('Could not find YouTube Music API Key');
            }
            console.log(`API Key found: ${apiKey}`);

            // 2. Search API
            const apiUrl = `${this.baseUrl}/youtubei/v1/search?key=${apiKey}`;
            const body = {
                context: {
                    client: {
                        clientName: 'WEB_REMIX',
                        clientVersion: clientVersion,
                    },
                },
                query: query,
                params: 'Eg-KAQwIABAAGAAgACgAMABqChAAGAAgACgAMQA=', // Songs filter
            };

            console.log(`Searching for: ${query}`);
            const apiRes = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    ...this.headers,
                    'Content-Type': 'application/json',
                    Origin: this.baseUrl,
                    Referer: `${this.baseUrl}/`,
                },
                body: JSON.stringify(body),
            });

            if (!apiRes.ok) {
                throw new Error(`YouTube Music API Error: ${apiRes.status}`);
            }

            const json = await apiRes.json();
            return this.parseSearchResults(json);
        } catch (error) {
            console.error('YouTube Music Search Error:', error);
            throw error;
        }
    }

    parseSearchResults(json) {
        const songs = [];

        const tabs = json.contents?.tabbedSearchResultsRenderer?.tabs;
        const correctTab = tabs?.find((t) => t.tabRenderer?.selected)?.tabRenderer;
        const sections = correctTab?.content?.sectionListRenderer?.contents;

        if (!sections) return [];

        sections.forEach((sec) => {
            const shelf = sec.musicShelfRenderer;
            if (shelf) {
                shelf.contents.forEach((item) => {
                    const mrb = item.musicResponsiveListItemRenderer;
                    if (mrb) {
                        const title = mrb.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
                        const videoId = mrb.playlistItemData?.videoId;

                        const metadataRuns = mrb.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;

                        const artist = metadataRuns?.find((r) =>
                            r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC') ||
                            r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('MPRE')
                        )?.text || metadataRuns?.[0]?.text || 'Unknown Artist';

                        // Find thumbnail
                        // The structure is mrb.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails (array)
                        const thumbnails = mrb.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
                        const thumbnail = thumbnails ? thumbnails[thumbnails.length - 1].url : undefined;

                        if (title && videoId) {
                            songs.push({
                                title,
                                artist,
                                videoId,
                                thumbnail,
                            });
                        }
                    }
                });
            }
        });

        return songs;
    }
}

async function run() {
    const provider = new YouTubeMusic();
    const songs = await provider.search("Golden Jungkook");
    console.log(`Found ${songs.length} songs`);
    if (songs.length) {
        console.log("First result:", songs[0]);
    }
}

run();
