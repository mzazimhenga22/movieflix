
interface LyricLine {
    time: number; // in seconds
    text: string;
}

interface LyricsResult {
    synced: boolean;
    lines: LyricLine[];
    plain?: string;
}

export class LyricsResolver {
    private static baseUrl = 'https://lrclib.net/api';

    static async getLyrics(
        trackName: string,
        artistName: string,
        durationMs?: number
    ): Promise<LyricsResult | null> {
        try {
            if (!trackName || !artistName) return null;

            // Construct query params
            const params = new URLSearchParams({
                message: 'hello', // Dummy param
                artist_name: artistName,
                track_name: trackName,
            });

            if (durationMs) {
                params.append('duration', String(durationMs / 1000));
            }

            console.log(`[Lyrics] Fetching for "${trackName}" by "${artistName}"`);
            const res = await fetch(`${this.baseUrl}/get?${params.toString()}`);

            if (!res.ok) {
                if (res.status === 404) {
                    console.warn('[Lyrics] Not found on LRCLIB');
                    // Try search endpoint if exact match failed (optional future improvement)
                }
                return null;
            }

            const data = await res.json();

            if (data.syncedLyrics) {
                console.log('[Lyrics] Found synced lyrics');
                return {
                    synced: true,
                    lines: this.parseLRC(data.syncedLyrics),
                    plain: data.plainLyrics
                };
            } else if (data.plainLyrics) {
                console.log('[Lyrics] Found static lyrics');
                return {
                    synced: false,
                    lines: [{ time: 0, text: data.plainLyrics }],
                    plain: data.plainLyrics
                };
            }

            return null;
        } catch (e) {
            console.warn('[Lyrics] Fetch failed:', e);
            return null;
        }
    }

    private static parseLRC(lrc: string): LyricLine[] {
        const lines: LyricLine[] = [];
        // Regex for [mm:ss.xx]
        const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

        const rawLines = lrc.split('\n');
        for (const raw of rawLines) {
            const match = raw.match(regex);
            if (match) {
                const min = parseInt(match[1]);
                const sec = parseInt(match[2]);
                const ms = parseFloat(`0.${match[3]}`);

                const time = min * 60 + sec + ms;
                const text = match[4].trim();

                if (text) {
                    lines.push({ time, text });
                }
            }
        }
        return lines;
    }
}
