
export class DirectYtResolver {
    private static baseUrl = 'https://www.youtube.com';
    private static cachedApiKey: string | null = null;
    private static cachedVisitorData: string | null = null;

    private static headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
    };

    static async getStream(videoId: string, type: 'audio' | 'video'): Promise<{ url: string; headers: Record<string, string>; mimeType?: string } | null> {
        try {
            await this.ensureConfig();
            if (!this.cachedApiKey) return null;

            const apiUrl = `https://www.youtube.com/youtubei/v1/player?key=${this.cachedApiKey}&prettyPrint=false`;
            
            // Prioritized list of clients. ANDROID_VR is currently the most stable for direct streams in 2026.
            const clients = [
                {
                    name: 'ANDROID_VR',
                    version: '1.60.19',
                    platform: 'MOBILE',
                    userAgent: 'com.google.android.youtube.vr/1.60.19 (Linux; U; Android 12; en_US) gzip',
                    clientName: 'ANDROID_VR'
                },
                {
                    name: 'MWEB',
                    version: '2.20260312.01.00',
                    platform: 'MOBILE',
                    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36',
                    clientName: 'MWEB'
                },
                {
                    name: 'TVHTML5',
                    version: '7.20260312.16.00',
                    platform: 'TV',
                    userAgent: 'Mozilla/5.0 (SmartTV; Google TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                    clientName: 'TVHTML5'
                },
                {
                    name: 'ANDROID_TESTSUITE',
                    version: '1.9.3',
                    platform: 'ANDROID',
                    userAgent: 'com.google.android.youtube.testsuite/1.9.3 (Linux; U; Android 12; en_US) gzip',
                    clientName: 'ANDROID_TESTSUITE'
                }
            ];

            for (const client of clients) {
                try {
                    console.log(`[DirectYt] Testing ${client.name} for ${videoId}`);
                    
                    const body: any = {
                        context: {
                            client: {
                                clientName: client.clientName,
                                clientVersion: client.version,
                                platform: client.platform,
                                hl: 'en-US',
                                gl: 'US',
                                utcOffsetMinutes: 0,
                            },
                        },
                        videoId: videoId,
                        playbackContext: {
                            contentPlaybackContext: {
                                signatureTimestamp: 20514,
                            },
                        },
                        racyCheckOk: true,
                        contentCheckOk: true,
                    };

                    if (this.cachedVisitorData) {
                        body.context.client.visitorData = this.cachedVisitorData;
                    }

                    const reqHeaders: any = { 
                        ...this.headers, 
                        'Content-Type': 'application/json',
                        'User-Agent': client.userAgent,
                        'X-Goog-Visitor-Id': this.cachedVisitorData || '',
                        'X-YouTube-Client-Name': client.clientName === 'MWEB' ? '2' : '1',
                        'X-YouTube-Client-Version': client.version
                    };

                    const res = await fetch(apiUrl, {
                        method: 'POST',
                        headers: reqHeaders,
                        body: JSON.stringify(body),
                    });

                    if (!res.ok) continue;

                    const data = await res.json();
                    
                    if (data.playabilityStatus?.status === 'OK' && data.streamingData) {
                        const stream = this.extractStream(data, type);
                        if (stream) {
                            console.log(`[DirectYt] Success with ${client.name}`);
                            return {
                                url: stream.url,
                                mimeType: stream.mimeType,
                                headers: {
                                    'User-Agent': client.userAgent,
                                    'Referer': 'https://www.youtube.com/',
                                    'Origin': 'https://www.youtube.com'
                                }
                            };
                        }
                    } else if (data.playabilityStatus?.reason) {
                        console.warn(`[DirectYt] ${client.name} rejected: ${data.playabilityStatus.reason}`);
                    }
                } catch (clientErr) {
                    console.warn(`[DirectYt] Client ${client.name} error:`, clientErr);
                }
            }

            return null;
        } catch (err) {
            console.error('[DirectYt] Global error:', err);
            return null;
        }
    }

    static async getNext(videoId: string): Promise<any[]> {
        try {
            await this.ensureConfig();
            const apiUrl = `https://www.youtube.com/youtubei/v1/next?key=${this.cachedApiKey}`;
            const body = {
                context: { client: { clientName: 'WEB', clientVersion: '2.20240101.01.00' } },
                videoId: videoId,
            };
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { ...this.headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) return [];
            const data = await res.json();
            const results: any[] = [];
            const contents = data.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results || [];
            contents.forEach((item: any) => {
                const r = item.compactVideoRenderer;
                if (r) results.push({ videoId: r.videoId, title: r.title?.simpleText, artist: r.shortBylineText?.runs?.[0]?.text, thumbnail: r.thumbnail?.thumbnails?.[0]?.url });
            });
            return results;
        } catch (e) { return []; }
    }

    private static async ensureConfig() {
        if (this.cachedApiKey) return;
        try {
            const res = await fetch(this.baseUrl, { headers: this.headers });
            const html = await res.text();
            const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"(.+?)"/);
            if (apiKeyMatch) this.cachedApiKey = apiKeyMatch[1];
            const visitorDataMatch = html.match(/"visitorData":"(.+?)"/);
            if (visitorDataMatch) this.cachedVisitorData = visitorDataMatch[1];
        } catch (e) {
            this.cachedApiKey = process.env.EXPO_PUBLIC_YOUTUBE_INNERTUBE_KEY || '';
        }
    }

    private static extractStream(data: any, type: 'audio' | 'video'): { url: string; mimeType: string } | null {
        const formats = [...(data.streamingData?.formats || []), ...(data.streamingData?.adaptiveFormats || [])];
        if (!formats.length) return null;
        
        // Filter out formats without direct URLs (those with signatureCipher need JS decryption)
        const playableFormats = formats.filter((f: any) => f.url && !f.signatureCipher);
        if (!playableFormats.length) return null;

        let best;
        if (type === 'audio') {
            best = playableFormats
                .filter((f: any) => f.mimeType?.includes('audio'))
                .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        } else {
            // For video, look for muxed streams (video + audio) first
            const muxed = playableFormats.filter((f: any) => 
                f.mimeType?.includes('video/mp4') && (f.audioQuality || f.audioSampleRate)
            );
            best = muxed.length > 0 
                ? muxed.sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0] 
                : playableFormats.filter((f: any) => f.mimeType?.includes('video/mp4')).sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];
        }
        return best ? { url: best.url, mimeType: best.mimeType } : null;
    }
}
