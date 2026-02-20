
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

    private static normalizeText(value: string) {
        return value
            .toLowerCase()
            .replace(/\(.*?\)|\[.*?\]/g, ' ')
            .replace(/\b(official|audio|video|lyrics|lyric|mv|hd|4k|remaster(ed)?|live|visualizer)\b/g, ' ')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    private static scoreCandidate(
        candidate: any,
        trackName: string,
        artistName?: string,
        durationMs?: number,
    ) {
        const trackNorm = this.normalizeText(trackName);
        const artistNorm = artistName ? this.normalizeText(artistName) : '';
        const candTrack = this.normalizeText(candidate?.trackName || candidate?.track || candidate?.title || '');
        const candArtist = this.normalizeText(candidate?.artistName || candidate?.artist || '');
        let score = 0;
        if (candTrack === trackNorm) score += 3;
        else if (candTrack && trackNorm && (candTrack.includes(trackNorm) || trackNorm.includes(candTrack))) score += 2;
        if (artistNorm && candArtist && (candArtist.includes(artistNorm) || artistNorm.includes(candArtist))) score += 2;
        if (durationMs && candidate?.duration) {
            const diff = Math.abs(candidate.duration * 1000 - durationMs);
            if (diff < 3000) score += 2;
            else if (diff < 8000) score += 1;
        }
        if (candidate?.syncedLyrics) score += 2;
        if (candidate?.plainLyrics) score += 1;
        return score;
    }

    private static buildPlainLines(plain: string, durationMs?: number): LyricLine[] {
        const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean);
        if (!lines.length) return [];
        if (lines.length === 1) return [{ time: 0, text: lines[0] }];
        const durationSec = durationMs ? Math.max(durationMs / 1000, 30) : Math.max(lines.length * 2, 180);
        const step = durationSec / Math.max(lines.length, 1);
        return lines.map((text, index) => ({ time: index * step, text }));
    }

    static async getLyrics(
        trackName: string,
        artistName: string,
        durationMs?: number
    ): Promise<LyricsResult | null> {
        try {
            const track = String(trackName ?? '').trim();
            const artist = String(artistName ?? '').trim();
            if (!track) return null;

            // Construct query params
            const params = new URLSearchParams({
                track_name: track,
            });

            if (artist) {
                params.append('artist_name', artist);
            }

            if (durationMs) {
                params.append('duration', String(durationMs / 1000));
            }

            console.log(`[Lyrics] Fetching for "${track}"${artist ? ` by "${artist}"` : ''}`);
            const res = await fetch(`${this.baseUrl}/get?${params.toString()}`);

            if (!res.ok) {
                if (res.status === 404) {
                    console.warn('[Lyrics] Not found on LRCLIB');
                    // Try search endpoint if exact match failed (optional future improvement)
                }
                return null;
            }

            const data = await res.json();

            if (data?.syncedLyrics) {
                console.log('[Lyrics] Found synced lyrics');
                return {
                    synced: true,
                    lines: this.parseLRC(data.syncedLyrics),
                    plain: data.plainLyrics
                };
            }

            if (data?.plainLyrics) {
                console.log('[Lyrics] Found static lyrics');
                return {
                    synced: false,
                    lines: this.buildPlainLines(data.plainLyrics, durationMs),
                    plain: data.plainLyrics
                };
            }

            // Fallback: search for closest match
            const searchParams = new URLSearchParams({ track_name: track });
            if (artist) searchParams.append('artist_name', artist);
            const searchRes = await fetch(`${this.baseUrl}/search?${searchParams.toString()}`);
            if (!searchRes.ok) return null;
            const searchData = await searchRes.json();
            const results = Array.isArray(searchData) ? searchData : searchData?.results || [];
            if (!results.length) return null;

            const best = results
                .map((candidate: any) => ({ candidate, score: this.scoreCandidate(candidate, track, artist, durationMs) }))
                .sort((a, b) => b.score - a.score)[0]?.candidate;

            if (!best) return null;
            if (best.syncedLyrics || best.plainLyrics) {
                return {
                    synced: Boolean(best.syncedLyrics),
                    lines: best.syncedLyrics
                        ? this.parseLRC(best.syncedLyrics)
                        : this.buildPlainLines(best.plainLyrics, durationMs),
                    plain: best.plainLyrics
                };
            }

            if (best.trackName || best.artistName) {
                return await this.getLyrics(best.trackName || track, best.artistName || artist, durationMs);
            }

            return null;
        } catch (e) {
            console.warn('[Lyrics] Fetch failed:', e);
            return null;
        }
    }

    private static parseLRC(lrc: string): LyricLine[] {
        const lines: LyricLine[] = [];
        const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
        const rawLines = lrc.split('\n');
        for (const raw of rawLines) {
            const matches = Array.from(raw.matchAll(timeRegex));
            if (!matches.length) continue;
            const text = raw.replace(timeRegex, '').trim();
            if (!text) continue;
            matches.forEach((match) => {
                const min = parseInt(match[1], 10);
                const sec = parseInt(match[2], 10);
                const ms = match[3] ? parseFloat(`0.${match[3]}`) : 0;
                const time = min * 60 + sec + ms;
                lines.push({ time, text });
            });
        }
        return lines.sort((a, b) => a.time - b.time);
    }
}
