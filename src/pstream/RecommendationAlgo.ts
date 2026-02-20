
export class RecommendationAlgo {
    /**
     * Process and merge new recommendations into the existing queue.
     * Creates a radio-style mix: same artist songs interleaved with genre-similar artists.
     *
     * Pattern example for "Perfect" by Ed Sheeran:
     *   Ed Sheeran -> Ed Sheeran -> Anne-Marie -> Khalid -> Ed Sheeran -> Sam Smith -> ...
     */
    static processQueue(currentQueue: any[], newRelated: any[], currentTrack: any): any[] {
        if (!newRelated || newRelated.length === 0) return [];

        const existingIds = new Set(currentQueue.map(item => String(item.videoId || item.id)));
        if (currentTrack?.videoId) existingIds.add(String(currentTrack.videoId));
        if (currentTrack?.id) existingIds.add(String(currentTrack.id));

        const candidates = newRelated.filter(item => {
            const id = String(item.videoId || item.id);
            return id && !existingIds.has(id);
        });

        if (candidates.length === 0) return [];

        const currentArtist = this.extractArtist(currentTrack);
        const sameArtist: any[] = [];
        const otherArtists: any[] = [];

        candidates.forEach(track => {
            const trackArtist = this.extractArtist(track);
            if (currentArtist && trackArtist && this.artistMatch(currentArtist, trackArtist)) {
                sameArtist.push(track);
            } else {
                otherArtists.push(track);
            }
        });

        // Build radio-style interleaved queue:
        // 2 same-artist, then 1 different-artist, repeat
        // This keeps the vibe while introducing discovery
        const result: any[] = [];
        let sameIdx = 0;
        let otherIdx = 0;

        while (sameIdx < sameArtist.length || otherIdx < otherArtists.length) {
            // 2 from same artist
            if (sameIdx < sameArtist.length) result.push(sameArtist[sameIdx++]);
            if (sameIdx < sameArtist.length) result.push(sameArtist[sameIdx++]);
            // 1 from different artist (genre-similar)
            if (otherIdx < otherArtists.length) result.push(otherArtists[otherIdx++]);
        }

        // If no same-artist songs, just return others in order
        if (sameArtist.length === 0) return otherArtists;

        return result;
    }

    private static extractArtist(track: any): string {
        return (
            track?.artist ||
            track?.uploaderName ||
            track?.channelTitle ||
            (Array.isArray(track?.artists) ? track.artists[0]?.name : '') ||
            ''
        ).toLowerCase().trim();
    }

    private static artistMatch(a: string, b: string): boolean {
        if (!a || !b) return false;
        if (a === b) return true;
        // Handle partial matches like "Ed Sheeran" vs "Ed Sheeran - Topic"
        return a.includes(b) || b.includes(a);
    }
}
