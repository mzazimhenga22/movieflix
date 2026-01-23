
export class DirectYtResolver {
    private static baseUrl = 'https://music.youtube.com';
    private static cachedApiKey: string | null = null;
    private static cachedClientVersion: string | null = null;

    private static headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/',
    };

    static async getStream(videoId: string, type: 'audio' | 'video'): Promise<{ url: string; headers: Record<string, string> } | null> {
        try {
            await this.ensureConfig();
            if (!this.cachedApiKey) return null;

            const apiUrl = `${this.baseUrl}/youtubei/v1/player?key=${this.cachedApiKey}`;
            const body = {
                context: {
                    client: {
                        clientName: 'WEB_REMIX',
                        clientVersion: this.cachedClientVersion || '1.20240101.01.00',
                    },
                },
                videoId: videoId,
            };

            const clients = [
                {
                    name: 'WEB_REMIX',
                    version: this.cachedClientVersion || '1.20240101.01.00',
                },
                {
                    name: 'ANDROID',
                    version: '19.09.37',
                },
                {
                    name: 'IOS',
                    version: '19.09.3',
                }
            ];

            for (const client of clients) {
                try {
                    console.log(`[DirectYt] Trying client: ${client.name}`);
                    body.context.client.clientName = client.name;
                    body.context.client.clientVersion = client.version;

                    const res = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { ...this.headers, 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });

                    if (!res.ok) {
                        console.warn(`[DirectYt] ${client.name} request failed: ${res.status}`);
                        continue;
                    }

                    const data = await res.json();
                    if (!data.streamingData) {
                        console.warn(`[DirectYt] ${client.name} returned no streamingData`);
                        if (client.name === 'IOS') { // Log playability on last attempt
                            console.warn('[DirectYt] Playability:', JSON.stringify(data.playabilityStatus));
                        }
                        continue;
                    }

                    const stream = this.extractStream(data, type);
                    if (stream) {
                        console.log(`[DirectYt] Resolved ${type} for ${videoId} using ${client.name}`);
                        // Return URL with the headers used to simulate the request
                        return {
                            url: stream,
                            headers: {
                                'User-Agent': this.headers['User-Agent'],
                                'Referer': 'https://music.youtube.com/',
                                'Origin': 'https://music.youtube.com'
                            }
                        };
                    } else {
                        console.log(`[DirectYt] ${client.name} returned only unusable (ciphered) streams`);
                    }
                } catch (clientErr) {
                    console.warn(`[DirectYt] Error with ${client.name}:`, clientErr);
                }
            }

            console.warn(`[DirectYt] All clients failed to resolve usable stream for ${videoId}`);
            return null;
        } catch (err) {
            console.warn('[DirectYt] Error:', err);
            return null;
        }
    }

    private static async ensureConfig() {
        if (this.cachedApiKey) return;
        try {
            const res = await fetch(this.baseUrl, { headers: this.headers });
            const html = await res.text();

            const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"(.+?)"/);
            if (apiKeyMatch) {
                this.cachedApiKey = apiKeyMatch[1];
            } else {
                // Fallback to known working key (fetched Jan 2026)
                console.warn('[DirectYt] Could not scrape API Key, using fallback');
                this.cachedApiKey = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
            }

            const clientVerMatch = html.match(/"clientVersion":"([\d\.]+)"/);
            if (clientVerMatch) {
                this.cachedClientVersion = clientVerMatch[1];
            } else {
                console.warn('[DirectYt] Could not scrape Client Version, using fallback');
                this.cachedClientVersion = '1.20260114.03.00';
            }
        } catch (e) {
            console.warn('[DirectYt] config fetch failed, using fallbacks');
            this.cachedApiKey = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
            this.cachedClientVersion = '1.20260114.03.00';
        }
    }

    private static extractStream(data: any, type: 'audio' | 'video'): string | null {
        const formats = [
            ...(data.streamingData?.formats || []),
            ...(data.streamingData?.adaptiveFormats || [])
        ];

        if (!formats.length) return null;

        // Diagnostic: Check for signature cipher
        const ciphered = formats.filter((f: any) => f.signatureCipher || f.cipher);
        if (ciphered.length > 0) {
            console.log(`[DirectYt] Found ${ciphered.length} ciphered formats (playable via DirectYt might be limited)`);
        }

        let bestFormat;

        if (type === 'audio') {
            // Prefer M4A/AAC audio
            bestFormat = formats
                .filter((f: any) => f.url && f.mimeType?.includes('audio'))
                .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))
                .find((f: any) => f.mimeType.includes('mp4') || f.mimeType.includes('audio/mp4'));

            if (!bestFormat) {
                // Fallback to any audio
                bestFormat = formats
                    .filter((f: any) => f.url && f.mimeType?.includes('audio'))
                    .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            }
        } else {
            // Video: Priority 1 - Muxed MP4 (Video + Audio)
            const muxedFormats = formats.filter((f: any) =>
                f.url &&
                f.mimeType?.includes('video/mp4') &&
                (f.audioQuality || f.audioSampleRate) // Ensure audio track exists
            );

            if (muxedFormats.length > 0) {
                // Sort by quality (height)
                bestFormat = muxedFormats.sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];
                console.log(`[DirectYt] Selected muxed video format: ${bestFormat.qualityLabel} (${bestFormat.height}p)`);
            } else {
                console.warn('[DirectYt] No muxed MP4 formats found with URL. Returning best available video (might be silent).');
                // Fallback to any MP4 video (likely adaptive/silent)
                bestFormat = formats
                    .filter((f: any) => f.url && f.mimeType?.includes('video/mp4'))
                    .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];
            }
        }

        return bestFormat?.url || null;
    }
}
