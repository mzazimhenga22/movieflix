export interface Media {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  backdrop_path?: string;
  overview?: string;
  media_type?: 'movie' | 'tv' | 'music';
  videoId?: string;
  imdb_id?: string | null;
  adult?: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  seasonTitle?: string;
  episodeTitle?: string;
  watchProgress?: {
    positionMillis: number;
    durationMillis: number;
    progress: number;
    updatedAt: number;
  };
  artist?: string;
  artists?: { name: string }[];
  localUri?: string;
}

export interface Genre {
  id: number;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string;
}

export interface DownloadItem {
  id: string;
  mediaId?: number;
  title: string;
  mediaType: 'movie' | 'tv' | 'music';
  localUri: string;
  containerPath?: string;
  createdAt: number;
  bytesWritten?: number;
  totalBytes?: number;
  runtimeMinutes?: number;
  releaseDate?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
  sourceUrl?: string;
  downloadType?: 'file' | 'hls';
  segmentCount?: number;
  totalSegments?: number;
  artist?: string | null;
  videoId?: string;
  // Partial download support
  isPartial?: boolean; // True if download incomplete but playable
  partialProgress?: number; // 0-1 progress of partial download
  playableDuration?: number; // Duration in seconds that's playable
  downloadStatus?: 'completed' | 'downloading' | 'paused' | 'error';
}
