export type StreamResult = {
  url: string;
  type: 'mp4' | 'hls' | 'dash' | 'unknown';
  quality?: string;
};

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    console.warn('Fetch failed', url, e);
    return null;
  }
}

export const scrapeImdbTrailer = async ({
  imdb_id,
}: {
  imdb_id: string;
}): Promise<StreamResult | null> => {
  if (!imdb_id) return null;

  try {
    // 1. Fetch Title Page to find Video ID
    let html = await fetchText(`https://www.imdb.com/title/${imdb_id}/`);
    let videoId: string | null = null;

    if (html) {
      // Common patterns for video ID in IMDb HTML
      const patterns = [
        /\/video\/(vi\d+)/,
        /"video":\s*"(vi\d+)"/,
        /"videoId":\s*"(vi\d+)"/,
        /data-video-id="(vi\d+)"/,
        /href="\/video\/(vi\d+)/
      ];

      for (const p of patterns) {
        const m = html.match(p);
        if (m && m[1]) {
          videoId = m[1];
          break;
        }
      }
    }

    // Fallback to mediaindex page if not found on main page
    if (!videoId) {
      html = await fetchText(`https://www.imdb.com/title/${imdb_id}/mediaindex`);
      if (html) {
         const m = html.match(/\/video\/(vi\d+)/) || html.match(/data-video-id="(vi\d+)"/);
         if (m && m[1]) videoId = m[1];
      }
    }

    if (!videoId) return null;

    // 2. Fetch Embed Page using the Video ID
    const embedHtml = await fetchText(`https://www.imdb.com/videoembed/${videoId}`);
    if (!embedHtml) return null;

    // 3. Extract Stream URL from Embed HTML
    // Look for HLS (.m3u8) first
    const m3u8Match = embedHtml.match(/https:[^"'\s]+\.m3u8[^"'\s]*/);
    if (m3u8Match) {
      return { url: m3u8Match[0], type: 'hls' };
    }

    // Look for MP4
    const mp4Match = embedHtml.match(/https:[^"'\s]+\.mp4[^"'\s]*/);
    if (mp4Match) {
      return { url: mp4Match[0], type: 'mp4' };
    }

    return null;

  } catch (err) {
    console.warn('JS IMDb trailer scrape failed:', err);
    return null;
  }
};