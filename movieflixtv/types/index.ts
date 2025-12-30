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
  media_type?: 'movie' | 'tv';
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
  mediaType: 'movie' | 'tv';
  localUri: string;
  containerPath?: string;
  createdAt: number;
  bytesWritten?: number;
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
}
