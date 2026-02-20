import type { ScrapeMedia } from '../providers-temp/lib/index.js';

export const SOURCE_BASE_ORDER = [
  'cuevana3',
  'wecima',
  'tugaflix',
  'ridomovies',
  'hdrezka',
  'warezcdn',
  'insertunit',
  'soapertv',
  'autoembed',
  'myanime',
  'ee3',
  'fsharetv',
  'vidsrc',
  'zoechip',
  'mp4hydra',
  'embedsu',
  'slidemovies',
  'iosmirror',
  'iosmirrorpv',
  'vidapiclick',
  'coitus',
  'streambox',
  'nunflix',
  '8stream',
  'animeflv',
  'cinemaos',
  'nepu',
  'pirxcy',
  'vidsrcvip',
  'madplay',
  'rgshows',
  'vidify',
  'zunime',
  'vidnest',
  'animetsu',
  'lookmovie',
  'turbovid',
  'pelisplushd',
  'primewire',
  'movies4f',
  'debrid',
  'cinehdplus',
];

export const GENERAL_PRIORITY_SOURCE_IDS = [
  'cuevana3',
  'wecima',
  'tugaflix',
  'zoechip',
  'vidsrc',
  'vidsrcvip',
  'warezcdn',
  'lookmovie',
  'pirxcy',
  'insertunit',
  'streambox',
  'primewire',
  'debrid',
  'movies4f',
  'hdrezka',
  'soapertv',
];

export const ANIME_PRIORITY_SOURCE_IDS = ['animetsu', 'animeflv', 'zunime', 'myanime'];

export function buildSourceOrder(preferAnime: boolean): string[] {
  const priority = preferAnime ? ANIME_PRIORITY_SOURCE_IDS : GENERAL_PRIORITY_SOURCE_IDS;
  const blockedAnime = preferAnime ? [] : ANIME_PRIORITY_SOURCE_IDS;
  const combined = [
    ...priority,
    ...SOURCE_BASE_ORDER.filter((id) => !priority.includes(id) && !blockedAnime.includes(id)),
    // When not preferring anime, skip anime sources entirely; when preferring, allow generals afterward
    ...(preferAnime ? GENERAL_PRIORITY_SOURCE_IDS.filter((id) => !priority.includes(id)) : []),
  ];
  const seen = new Set<string>();
  return combined.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

type RouteParams = Record<string, string | number | string[] | undefined>;

const getStringParam = (params: RouteParams, key: string): string | undefined => {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : String(value[0]);
  }
  return typeof value === 'string' ? value : String(value);
};

const parseNumberParam = (params: RouteParams, key: string): number | undefined => {
  const raw = getStringParam(params, key);
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export type VideoScrapeContext = {
  media: ScrapeMedia;
  mediaType: 'movie' | 'tv';
  displayTitle: string;
  formattedTitle: string;
  preferAnimeSources: boolean;
};

export function buildVideoScrapeContext(params: RouteParams): VideoScrapeContext | null {
  const tmdbId = getStringParam(params, 'tmdbId');
  const rawMediaType = getStringParam(params, 'mediaType');
  if (!tmdbId || !rawMediaType) return null;

  const rawTitle = getStringParam(params, 'title');
  const displayTitle = rawTitle && rawTitle.trim().length > 0 ? rawTitle.trim() : 'Now Playing';
  const preferAnimeSources = getStringParam(params, 'contentHint') === 'anime';
  const fallbackYear = (() => {
    const parsed = parseNumberParam(params, 'releaseYear');
    return typeof parsed === 'number' ? parsed : new Date().getFullYear();
  })();
  const imdbId = getStringParam(params, 'imdbId');

  if (rawMediaType === 'tv') {
    const seasonNumber = parseNumberParam(params, 'seasonNumber') ?? 1;
    const episodeNumber = parseNumberParam(params, 'episodeNumber') ?? 1;
    const seasonTitle = getStringParam(params, 'seasonTitle') ?? `Season ${seasonNumber}`;
    const seasonTmdbId = getStringParam(params, 'seasonTmdbId') ?? '';
    const episodeTmdbId = getStringParam(params, 'episodeTmdbId') ?? '';
    const seasonEpisodeCount = parseNumberParam(params, 'seasonEpisodeCount');

    const media: ScrapeMedia = {
      type: 'show',
      title: displayTitle,
      tmdbId,
      imdbId,
      releaseYear: fallbackYear,
      season: {
        number: seasonNumber,
        tmdbId: seasonTmdbId,
        title: seasonTitle,
        ...(seasonEpisodeCount ? { episodeCount: seasonEpisodeCount } : {}),
      },
      episode: {
        number: episodeNumber,
        tmdbId: episodeTmdbId,
      },
    };

    const formattedTitle = `${displayTitle} • S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;

    return {
      media,
      mediaType: 'tv',
      displayTitle,
      formattedTitle,
      preferAnimeSources,
    };
  }

  const media: ScrapeMedia = {
    type: 'movie',
    title: displayTitle,
    tmdbId,
    imdbId,
    releaseYear: fallbackYear,
  };

  return {
    media,
    mediaType: 'movie',
    displayTitle,
    formattedTitle: displayTitle,
    preferAnimeSources,
  };
}

export function buildScrapeDebugTag(kind: string, title: string): string | undefined {
  return __DEV__ ? `[${kind}] ${title}` : undefined;
}
