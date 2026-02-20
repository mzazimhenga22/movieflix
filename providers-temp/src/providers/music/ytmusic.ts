
export interface MusicSearchQuery {
    query: string;
}

export interface MusicSong {
    title: string;
    artist: string;
    album: string | undefined;
    duration: string | undefined;
    videoId: string;
    thumbnail: string | undefined;
}

export class YouTubeMusic {
    private baseUrl = 'https://music.youtube.com';
    private headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
    };

    async search(query: string): Promise<MusicSong[]> {
        try {
            // 1. Fetch homepage to get API Key and Client Version
            const homeRes = await fetch(this.baseUrl, { headers: this.headers });
            const html = await homeRes.text();

            const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"(.+?)"/);
            const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;

            const clientVersionMatch = html.match(/"clientVersion":"([\d\.]+)"/);
            const clientVersion = clientVersionMatch ? clientVersionMatch[1] : '1.20240101.01.00';

            if (!apiKey) {
                throw new Error('Could not find YouTube Music API Key');
            }

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

    private parseSearchResults(json: any): MusicSong[] {
        const songs: MusicSong[] = [];

        const tabs = json.contents?.tabbedSearchResultsRenderer?.tabs;
        const correctTab = tabs?.find((t: any) => t.tabRenderer?.selected)?.tabRenderer;
        const sections = correctTab?.content?.sectionListRenderer?.contents;

        if (!sections) return [];

        sections.forEach((sec: any) => {
            const shelf = sec.musicShelfRenderer;
            if (shelf) {
                // We only care about the shelf if it looks like songs results
                // Usually filtered search only returns one shelf
                shelf.contents.forEach((item: any) => {
                    const mrb = item.musicResponsiveListItemRenderer;
                    if (mrb) {
                        const title = mrb.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
                        const videoId = mrb.playlistItemData?.videoId;

                        // Artist/Album info is usually in the second column
                        const metadataRuns = mrb.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;

                        // Usually: [Artist, " • ", Album, " • ", Duration] or [Artist, " • ", Duration]
                        // Let's crude parse:
                        const artist = metadataRuns?.find((r: any) =>
                            r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC') || // Artist channel
                            r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('MPRE') // Artist page
                        )?.text || metadataRuns?.[0]?.text || 'Unknown Artist';

                        // Find thumbnail
                        const thumbnail = mrb.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.pop()?.url;

                        if (title && videoId) {
                            songs.push({
                                title,
                                artist,
                                album: undefined, // Hard to extract reliably without more logic
                                duration: undefined,
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

export const ytMusic = new YouTubeMusic();
