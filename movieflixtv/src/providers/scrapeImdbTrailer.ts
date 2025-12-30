type StreamResult = {
  url: string;
  type: 'mp4' | 'hls' | 'dash' | 'unknown';
  quality?: string;
};

export const scrapeImdbTrailer = async ({
  imdb_id,
}: {
  imdb_id: string;
}): Promise<StreamResult | null> => {
  if (!imdb_id) return null;

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    Accept: '*/*',
  };

  try {
    /** STEP 1 — Fetch title page */
    const titleRes = await fetch(`https://www.imdb.com/title/${imdb_id}/`, {
      headers,
    });

    if (!titleRes.ok) return null;
    const titleHtml = await titleRes.text();

    const videoIdMatch = titleHtml.match(/\/video\/(vi\d+)/);
    if (!videoIdMatch) return null;

    const videoId = videoIdMatch[1];

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
    const preferred =
      candidates.find((c) => c.type === 'hls') ||
      candidates.find((c) => c.type === 'mp4') ||
      candidates[0];

    return preferred;
  } catch (err) {
    console.error('IMDb trailer scrape failed:', err);
    return null;
  }
};
