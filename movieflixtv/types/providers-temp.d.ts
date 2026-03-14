declare module '../../providers-temp/lib/index.js' {
  export type Qualities = '4k' | '1080' | '720' | '480' | '360' | 'unknown' | string;

  export type QualityEntry = {
    type?: string;
    url?: string;
  };

  export type QualitiesMap = Record<string, QualityEntry> & Partial<Record<Qualities, QualityEntry>>;

  export type ScrapeMedia = {
    type: 'movie' | 'show';
    title: string;
    tmdbId: string;
    releaseYear: number;
    imdbId?: string;
    season?: { number: number; title?: string; episodeCount?: number };
    episode?: { number: number; title?: string };
  };

  export type Stream = {
    id: string;
    type: 'file' | 'hls' | string;
    playlist?: string;
    headers?: Record<string, string>;
    preferredHeaders?: Record<string, string>;
    qualities?: QualitiesMap;
    flags?: string[];
    captions?: Array<{ url?: string; lang?: string }>;
    title?: string;
  };

  // Minimal runtime exports used by the app (typed loosely on purpose)
  export const targets: {
    BROWSER: string;
    BROWSER_EXTENSION: string;
    NATIVE: string;
    ANY: string;
  };

  export function makeStandardFetcher(fetchLike: any): any;
  export function makeSimpleProxyFetcher(proxyUrl: string, fetchLike: any): any;
  export function makeProviders(options: any): {
    runAll(runnerOps: any): Promise<{ sourceId: string; embedId?: string; stream: Stream } | null>;
  };

  export function setM3U8ProxyUrl(proxyUrl: string): void;

  export { };
}
