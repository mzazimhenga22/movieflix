// @ts-ignore Deno types
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { makeProviders, makeStandardFetcher } from "./providers.ts";

interface MediaPayload {
  type: 'movie' | 'show';
  title: string;
  tmdbId: string;
  imdbId?: string;
  releaseYear: number;
  season?: {
    number: number;
    tmdbId: string;
    title: string;
    episodeCount?: number;
  };
  episode?: {
    number: number;
    tmdbId: string;
  };
}

interface ScrapeOptions {
  sourceOrder?: string[];
  debugTag?: string;
}

interface RequestBody {
  payload: MediaPayload;
  options?: ScrapeOptions;
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body: RequestBody = await req.json();
    const { payload, options = {} } = body;

    console.log(`[${options.debugTag || 'Scrape'}] Processing ${payload.type}: ${payload.title}`);

    // Create providers controller
    const standardFetcher = makeStandardFetcher(fetch);
    const providers = makeProviders({
      fetcher: standardFetcher,
      proxiedFetcher: standardFetcher,
      proxyStreams: true,
      target: 'any',
      externalSources: 'all',
      features: {
        requires: [],
        disallowed: [],
      },
    });

    // Build the media object for providers
    const media = payload.type === 'movie' ? {
      type: 'movie' as const,
      title: payload.title,
      tmdbId: parseInt(payload.tmdbId),
      releaseYear: payload.releaseYear,
      imdbId: payload.imdbId,
    } : {
      type: 'show' as const,
      title: payload.title,
      tmdbId: parseInt(payload.tmdbId),
      releaseYear: payload.releaseYear,
      imdbId: payload.imdbId,
      season: {
        number: payload.season!.number,
        tmdbId: payload.season!.tmdbId,
        title: payload.season!.title,
        episodeCount: payload.season!.episodeCount,
      },
      episode: {
        number: payload.episode!.number,
        tmdbId: payload.episode!.tmdbId,
      },
    };

    // Build runner options
    const runnerOps = {
      media,
      fetcher: standardFetcher,
      proxiedFetcher: standardFetcher,
      proxyStreams: true,
      features: {
        requires: [],
        disallowed: [],
      },
      sourceOrder: options.sourceOrder,
    };

    const pickBestQuality = (qualities: Record<string, any> = {}) => {
      const order = ['1080', '720', '480', '360', 'unknown'];
      for (const key of order) {
        if (qualities[key]) return { key, value: qualities[key] };
      }
      const firstKey = Object.keys(qualities)[0];
      if (firstKey) return { key: firstKey, value: qualities[firstKey] };
      return null;
    };

    // Run providers
    const result = await providers.runAll(runnerOps);

    if (!result) {
      throw new Error('No streams found');
    }

    console.log(`[${options.debugTag || 'Scrape'}] Success: ${result.sourceId}${result.embedId ? ` -> ${result.embedId}` : ''}`);

    let uri: string | undefined;
    const streamHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...(result.stream.headers || {}),
      ...(result.stream.preferredHeaders || {}),
    };

    if (result.stream.type === 'hls') {
      uri = result.stream.playlist;
    } else if (result.stream.type === 'file') {
      const bestQuality = pickBestQuality(result.stream.qualities || {});
      if (!bestQuality || !bestQuality.value?.url) {
        throw new Error('No stream URL found');
      }
      uri = bestQuality.value.url;
      Object.assign(streamHeaders, bestQuality.value.headers || {});
    } else if ('url' in (result.stream as any)) {
      uri = (result.stream as any).url;
    }

    if (!uri) {
      throw new Error('No stream URL found');
    }

    // Format response
    const response = {
      uri,
      headers: streamHeaders,
      stream: {
        type: result.stream.type === 'hls' ? 'hls' : 'mp4',
        captions: result.stream.captions?.map((caption: any) => ({
          id: caption.id || caption.url,
          language: caption.language,
          type: caption.type === 'vtt' ? 'vtt' : 'srt',
          url: caption.url,
        })),
        preferredHeaders: streamHeaders,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Scrape error:', error);

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});
