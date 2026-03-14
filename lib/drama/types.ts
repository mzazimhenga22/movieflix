/**
 * Short Drama & Movie Clip Types
 */

// Short Drama Types
export interface ShortDrama {
  id: string;
  title: string;
  description?: string;
  thumbnail: string;
  episodes: DramaEpisode[];
  genre: string[];
  rating?: number;
  views?: number;
  source: DramaSource;
  createdAt?: string;
}

export interface DramaEpisode {
  id: string;
  dramaId: string;
  episodeNumber: number;
  title?: string;
  thumbnail: string;
  duration?: number;
  videoUrl?: string;
  isLocked: boolean;
  coinsRequired?: number;
}

export interface DramaSearchResult {
  dramas: ShortDrama[];
  total: number;
  page: number;
  hasMore: boolean;
}

export type DramaSource = 'dramabox' | 'reelshort' | 'shortmax' | 'freeshort' | 'user';

// Movie Clip Types
export interface MovieClip {
  id: string;
  quote: string;
  movieTitle: string;
  movieYear?: string;
  character?: string;
  actor?: string;
  thumbnail: string;
  videoUrl?: string;
  youtubeId?: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
  source: ClipSource;
  tmdbId?: number;
  imdbId?: string;
}

export interface ClipSearchResult {
  clips: MovieClip[];
  total: number;
  page: number;
  hasMore: boolean;
  query: string;
}

export interface MovieQuotes {
  movieId: string;
  movieTitle: string;
  quotes: MovieClip[];
}

export type ClipSource = 'playphrase' | 'yarn' | 'tmdb' | 'youtube' | 'user';

// Combined Content Type
export interface DramaContent {
  type: 'drama' | 'clip';
  drama?: ShortDrama;
  clip?: MovieClip;
}
