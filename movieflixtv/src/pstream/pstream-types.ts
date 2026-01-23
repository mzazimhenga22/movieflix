export type Qualities = '4k' | '1080' | '720' | '480' | '360' | 'unknown' | string;

export type QualityEntry = {
    type?: string;
    url?: string;
};

export type QualitiesMap = Record<string, QualityEntry> & Partial<Record<Qualities, QualityEntry>>;

export type PStreamMoviePayload = {
    type: 'movie';
    title: string;
    tmdbId: string;
    releaseYear: number;
    imdbId?: string;
};

export type PStreamShowPayload = {
    type: 'show';
    title: string;
    tmdbId: string;
    releaseYear: number;
    imdbId?: string;
    season: { number: number; tmdbId: string; title: string; episodeCount?: number };
    episode: { number: number; tmdbId: string };
};

export type PStreamMediaPayload = PStreamMoviePayload | PStreamShowPayload;

export type PStreamScrapeOptions = {
    sourceOrder?: string[];
    embedOrder?: string[];
    debugTag?: string;
    forceProxyStreams?: boolean;
};

export type PStreamCaption = {
    url?: string;
    lang?: string;
    id?: string;
    type?: string;
};

export type PStreamStream = {
    id?: string;
    type: 'file' | 'hls' | string;
    playlist?: string;
    headers?: Record<string, string>;
    preferredHeaders?: Record<string, string>;
    qualities?: QualitiesMap;
    flags?: string[];
    captions?: PStreamCaption[];
};

export type PStreamPlayback = {
    uri: string;
    headers?: Record<string, string>;
    stream: PStreamStream;
    sourceId?: string;
    embedId?: string;
    proxied?: boolean;
};
