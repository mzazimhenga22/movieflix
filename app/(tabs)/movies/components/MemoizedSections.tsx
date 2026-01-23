import React, { memo } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import MovieList from '@/components/MovieList';
import FeaturedMovie from '@/components/FeaturedMovie';
import SongList from '@/components/SongList';
import MovieTrailerCarousel, { type MovieTrailerCarouselHandle } from '@/components/MovieTrailerCarousel';
import { Media } from '@/types';

const styles = StyleSheet.create({
  sectionBlock: {
    marginBottom: 20,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
});

interface BaseSectionProps {
  fadeStyle: any;
}

// Featured Section
interface FeaturedSectionProps extends BaseSectionProps {
  movie: Media;
  getGenreNames: (ids: number[]) => string;
  onInfoPress: (movie: Media) => void;
}

export const FeaturedSection = memo(function FeaturedSection({
  movie,
  getGenreNames,
  onInfoPress,
  fadeStyle,
}: FeaturedSectionProps) {
  return (
    <Animated.View style={fadeStyle}>
      <View style={styles.sectionBlock}>
        <FeaturedMovie movie={movie} getGenreNames={getGenreNames} onInfoPress={onInfoPress} />
      </View>
    </Animated.View>
  );
}, (prev, next) => prev.movie?.id === next.movie?.id);

// Continue Watching Section - uses MovieList (fewer items, needs progress)
interface ContinueWatchingSectionProps extends BaseSectionProps {
  movies: Media[];
  onItemPress: (item: Media) => void;
  myListIds: number[];
  onToggleMyList: (item: Media) => void;
}

export const ContinueWatchingSection = memo(function ContinueWatchingSection({
  movies,
  onItemPress,
  myListIds,
  onToggleMyList,
  fadeStyle,
}: ContinueWatchingSectionProps) {
  if (movies.length === 0) return null;
  return (
    <Animated.View style={fadeStyle}>
      <View style={styles.sectionBlock}>
        <MovieList
          title="Continue Watching"
          movies={movies}
          onItemPress={onItemPress}
          showProgress
          myListIds={myListIds}
          onToggleMyList={onToggleMyList}
        />
      </View>
    </Animated.View>
  );
}, (prev, next) => {
  if (prev.movies.length !== next.movies.length) return false;
  if (prev.myListIds.length !== next.myListIds.length) return false;
  for (let i = 0; i < prev.movies.length; i++) {
    if (prev.movies[i]?.id !== next.movies[i]?.id) return false;
  }
  return true;
});

// Because You Watched Section
interface BecauseYouWatchedSectionProps extends BaseSectionProps {
  lastWatched: Media;
  movies: Media[];
  onItemPress: (item: Media) => void;
  myListIds: number[];
  onToggleMyList: (item: Media) => void;
}

export const BecauseYouWatchedSection = memo(function BecauseYouWatchedSection({
  lastWatched,
  movies,
  onItemPress,
  myListIds,
  onToggleMyList,
  fadeStyle,
}: BecauseYouWatchedSectionProps) {
  if (movies.length === 0) return null;
  return (
    <Animated.View style={fadeStyle}>
      <View style={styles.sectionBlock}>
        <MovieList
          title={`Because you watched ${lastWatched.title || lastWatched.name}`}
          movies={movies}
          onItemPress={onItemPress}
          myListIds={myListIds}
          onToggleMyList={onToggleMyList}
        />
      </View>
    </Animated.View>
  );
}, (prev, next) => {
  if (prev.lastWatched?.id !== next.lastWatched?.id) return false;
  if (prev.movies.length !== next.movies.length) return false;
  return true;
});

// Favorite Genre Section
interface FavoriteGenreSectionProps extends BaseSectionProps {
  genreName: string;
  loading: boolean;
  movies: Media[];
  onItemPress: (item: Media) => void;
  myListIds: number[];
  onToggleMyList: (item: Media) => void;
}

export const FavoriteGenreSection = memo(function FavoriteGenreSection({
  genreName,
  loading,
  movies,
  onItemPress,
  myListIds,
  onToggleMyList,
  fadeStyle,
}: FavoriteGenreSectionProps) {
  if (movies.length === 0) return null;
  return (
    <Animated.View style={fadeStyle}>
      <View style={styles.sectionBlock}>
        <MovieList
          title={loading ? `Loading ${genreName} picks…` : `${genreName} Picks`}
          movies={movies}
          onItemPress={onItemPress}
          myListIds={myListIds}
          onToggleMyList={onToggleMyList}
        />
      </View>
    </Animated.View>
  );
}, (prev, next) => {
  if (prev.genreName !== next.genreName) return false;
  if (prev.loading !== next.loading) return false;
  if (prev.movies.length !== next.movies.length) return false;
  return true;
});

// Songs Section
interface SongsSectionProps extends BaseSectionProps {
  songs: any[];
  onOpenAll: () => void;
}

export const SongsSection = memo(function SongsSection({
  songs,
  onOpenAll,
  fadeStyle,
}: SongsSectionProps) {
  return (
    <Animated.View style={fadeStyle}>
      <View style={styles.sectionBlock}>
        <SongList title="Songs of the Moment" songs={songs} onOpenAll={onOpenAll} />
      </View>
    </Animated.View>
  );
}, (prev, next) => prev.songs.length === next.songs.length);

// Trailers Section
interface TrailersSectionProps extends BaseSectionProps {
  trailers: Media[];
  onTrailerPress: (item: Media) => void;
  carouselRef: any;
}

export const TrailersSection = memo(function TrailersSection({
  trailers,
  onTrailerPress,
  carouselRef,
  fadeStyle,
}: TrailersSectionProps) {
  if (trailers.length === 0) return null;
  return (
    <Animated.View style={fadeStyle}>
      <View style={styles.sectionBlock}>
        <MovieTrailerCarousel ref={carouselRef} trailers={trailers} onTrailerPress={onTrailerPress} />
      </View>
    </Animated.View>
  );
}, (prev, next) => prev.trailers.length === next.trailers.length);

// Generic Progressive Movie Section
interface ProgressiveMovieSectionProps extends BaseSectionProps {
  title: string;
  movies: Media[];
  onItemPress: (item: Media) => void;
  myListIds: number[];
  onToggleMyList: (item: Media) => void;
}

export const ProgressiveMovieSection = memo(function ProgressiveMovieSection({
  title,
  movies,
  onItemPress,
  myListIds,
  onToggleMyList,
  fadeStyle,
}: ProgressiveMovieSectionProps) {
  if (movies.length === 0) return null;
  return (
    <Animated.View style={fadeStyle}>
      <View style={styles.sectionBlock}>
        <MovieList
          title={title}
          movies={movies}
          onItemPress={onItemPress}
          myListIds={myListIds}
          onToggleMyList={onToggleMyList}
        />
      </View>
    </Animated.View>
  );
}, (prev, next) => {
  if (prev.title !== next.title) return false;
  if (prev.movies.length !== next.movies.length) return false;
  if (prev.myListIds !== next.myListIds) return false;
  // Compare first and last item IDs for quick check
  if (prev.movies[0]?.id !== next.movies[0]?.id) return false;
  return true;
});
