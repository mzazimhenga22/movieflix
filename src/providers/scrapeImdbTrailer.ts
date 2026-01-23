export const scrapeImdbTrailer = async ({
  imdb_id,
}: {
  imdb_id: string;
}): Promise<StreamResult | null> => {
  if (!imdb_id) return null;

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    Accept: '*/*',
  };

  try {
    /** STEP 1 — Fetch title page */
    const titleRes = await fetch(`https://www.imdb.com/title/${imdb_id}/`, {
      headers,
    });

    if (!titleRes.ok) return null;
    const titleHtml = await titleRes.text();

    // Try multiple patterns to find video ID
    let videoId = null;
    const patterns = [
      /\/video\/(vi\d+)/,
      /\"video\":\s*\"(vi\d+)\"/,
      /\"videoId\":\s*\"(vi\d+)\"/,
      /data-video-id=\"(vi\d+)\"/,
      /href=\"\/video\/(vi\d+)/
    ];

    for (const p of patterns) {
      const m = titleHtml.match(p);
      if (m) {
        videoId = m[1];
        break;
      }
    }

    if (!videoId) {
      // Fallback: Try /mediaindex (Video Gallery)
      try {
        const mediaRes = await fetch(`https://www.imdb.com/title/${imdb_id}/mediaindex`, {
          headers,
        });

        if (mediaRes.ok) {
          const mediaHtml = await mediaRes.text();
          // Look for any video link
          const m = mediaHtml.match(/\/video\/(vi\d+)/);
          if (m) {
            videoId = m[1];
          } else {
            // Try "related videos" pattern
            const m2 = mediaHtml.match(/data-video-id=\"(vi\d+)\"/);
            if (m2) videoId = m2[1];
          }
        }
      } catch (e) {
        // ignore
      }
    }

    if (!videoId) return null;

    /** STEP 2 — Fetch embed page */
    const embedRes = await fetch(
      `https://www.imdb.com/videoembed/${videoId}`,
      { headers }
    );

    if (!embedRes.ok) return null;
    const embedHtml = await embedRes.text();

    /** STEP 3 — Look for ANY media URLs (MP4 / HLS / DASH) */
    const candidates: StreamResult[] = [];

    // MP4
    const mp4Matches = embedHtml.match(
      /https:[^"' ]+\.mp4[^"' ]*/g
    );
    mp4Matches?.forEach((url) =>
      candidates.push({ url, type: 'mp4' })
    );

    // HLS / M3U8
    const m3u8Matches = embedHtml.match(
      /https:[^"' ]+\.m3u8[^"' ]*/g
    );
    m3u8Matches?.forEach((url) =>
      candidates.push({ url, type: 'hls' })
    );

    // DASH
    const dashMatches = embedHtml.match(
      /https:[^"' ]+\.mpd[^"' ]*/g
    );
    dashMatches?.forEach((url) =>
      candidates.push({ url, type: 'dash' })
    );

    if (candidates.length === 0) {
      // IMDb blocks all media URLs now
      return null;
    }

    /** STEP 4 — Prefer best format */
    /** STEP 4 — Prefer best format & VALIDATE */
    // Sort by preference first
    const sorted = [
      ...candidates.filter(c => c.type === 'hls'),
      ...candidates.filter(c => c.type === 'mp4'),
      ...candidates.filter(c => c.type !== 'hls' && c.type !== 'mp4')
    ];

    for (const candidate of sorted) {
      try {
        const check = await fetch(candidate.url, { method: 'HEAD', headers });
        if (check.ok) {
          return candidate;
        }
      } catch (e) {
        console.warn('Trailer candidate check failed:', e);
      }
    }

    return null;
  } catch (err) {
    console.error('IMDb trailer scrape failed:', err);
    return null;
  }
};

type StreamResult = {
  url: string;
  type: 'mp4' | 'hls' | 'dash' | 'unknown';
  quality?: string;
};
