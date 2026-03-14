import { FastMovieRail } from '@/components/FastMovieRail';
import FeaturedMovie from '@/components/FeaturedMovie';
import MovieList from '@/components/MovieList';
import MovieTrailerCarousel from '@/components/MovieTrailerCarousel';
import SongList from '@/components/SongList';
import LiquidGlass from '@/components/app-components/LiquidGlass';
import { Media } from '@/types/index';
import React, { memo } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import DuoShowcase from './DuoShowcase';
import EditorialCard from './EditorialCard';
import GenreShowcase from './GenreShowcase';
import Top10Rail from './Top10Rail';

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
}

export const ContinueWatchingSection = memo(function ContinueWatchingSection({
  movies,
  onItemPress,
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
        />
      </View>
    </Animated.View>
  );
}, (prev, next) => {
  if (prev.movies.length !== next.movies.length) return false;
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
}

export const BecauseYouWatchedSection = memo(function BecauseYouWatchedSection({
  lastWatched,
  movies,
  onItemPress,
  fadeStyle,
}: BecauseYouWatchedSectionProps) {
  if (movies.length === 0) return null;
  return (
    <Animated.View style={fadeStyle}>
      <View style={styles.sectionBlock}>
        {Platform.OS === 'android' ? (
          <FastMovieRail
            title={`Because you watched ${lastWatched.title || lastWatched.name}`}
            movies={movies}
            onItemPress={onItemPress}
          />
        ) : (
          <MovieList
            title={`Because you watched ${lastWatched.title || lastWatched.name}`}
            movies={movies}
            onItemPress={onItemPress}
          />
        )}
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
}

export const FavoriteGenreSection = memo(function FavoriteGenreSection({
  genreName,
  loading,
  movies,
  onItemPress,
  fadeStyle,
}: FavoriteGenreSectionProps) {
  if (movies.length === 0) return null;
  return (
    <Animated.View style={fadeStyle}>
      <View style={styles.sectionBlock}>
        {Platform.OS === 'android' ? (
          <FastMovieRail
            title={loading ? `Loading ${genreName} picks…` : `${genreName} Picks`}
            movies={movies}
            onItemPress={onItemPress}
          />
        ) : (
          <MovieList
            title={loading ? `Loading ${genreName} picks…` : `${genreName} Picks`}
            movies={movies}
            onItemPress={onItemPress}
          />
        )}
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
  trailers: (Media & { trailerUrl: string })[];
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
  variant?: 'default' | 'large' | 'compact' | 'spotlight';
  glassColor?: string;
}

export const ProgressiveMovieSection = memo(function ProgressiveMovieSection({
  title,
  movies,
  onItemPress,
  variant,
  fadeStyle,
  glassColor,
}: ProgressiveMovieSectionProps) {
  if (movies.length === 0) return null;

  const isDefaultVariant = !variant || variant === 'default' || variant === 'compact';

  return (
    <Animated.View style={fadeStyle}>
      {glassColor && (
        <LiquidGlass
          tintOpacity={0.05}
          tintColor={glassColor}
          cornerRadius={0}
          borderOpacity={0}
          style={[StyleSheet.absoluteFill, { borderTopWidth: 1, borderBottomWidth: 1, borderColor: `${glassColor}33` }]}
        />
      )}
      <View style={[styles.sectionBlock, glassColor ? { marginVertical: 12, paddingVertical: 12 } : {}]}>
        {Platform.OS === 'android' && isDefaultVariant ? (
          <FastMovieRail
            title={title}
            movies={movies}
            onItemPress={onItemPress}
          />
        ) : (
          <MovieList
            title={title}
            movies={movies}
            onItemPress={onItemPress}
            variant={variant}
          />
        )}
      </View>
    </Animated.View>
  );
}, (prev, next) => {
  if (prev.title !== next.title) return false;
  if (prev.movies.length !== next.movies.length) return false;
  // Compare first and last item IDs for quick check
  if (prev.movies[0]?.id !== next.movies[0]?.id) return false;
  return true;
});

// Top 10 Countdown Section
interface Top10SectionProps extends BaseSectionProps {
  movies: Media[];
  onItemPress: (item: Media) => void;
}

export const Top10Section = memo(function Top10Section({
  movies,
  onItemPress,
  fadeStyle,
}: Top10SectionProps) {
  if (movies.length === 0) return null;
  return (
    <Animated.View style={fadeStyle}>
      <Top10Rail
        movies={movies}
        onItemPress={onItemPress}
      />
    </Animated.View>
  );
}, (prev, next) => {
  if (prev.movies.length !== next.movies.length) return false;
  if (prev.movies[0]?.id !== next.movies[0]?.id) return false;
  return true;
});

// Duo Showcase Section
interface DuoShowcaseSectionProps extends BaseSectionProps {
  title: string;
  movies: Media[];
  onItemPress: (item: Media) => void;
}

export const DuoShowcaseSection = memo(function DuoShowcaseSection({
  title,
  movies,
  onItemPress,
  fadeStyle,
}: DuoShowcaseSectionProps) {
  if (movies.length < 2) return null;
  return (
    <Animated.View style={fadeStyle}>
      <DuoShowcase
        title={title}
        movies={movies}
        onItemPress={onItemPress}
      />
    </Animated.View>
  );
}, (prev, next) => {
  if (prev.title !== next.title) return false;
  if (prev.movies.length !== next.movies.length) return false;
  if (prev.movies[0]?.id !== next.movies[0]?.id) return false;
  return true;
});

// Editorial Card Section
interface EditorialSectionProps extends BaseSectionProps {
  movie: Media;
  onPress: (item: Media) => void;
}

export const EditorialSection = memo(function EditorialSection({
  movie,
  onPress,
  fadeStyle,
}: EditorialSectionProps) {
  if (!movie) return null;
  return (
    <Animated.View style={fadeStyle}>
      <EditorialCard movie={movie} onPress={onPress} />
    </Animated.View>
  );
}, (prev, next) => prev.movie?.id === next.movie?.id);

// Genre Showcase Section (hero + grid)
interface GenreShowcaseSectionProps extends BaseSectionProps {
  title: string;
  icon: string;
  themeColors: [string, string];
  movies: Media[];
  onItemPress: (item: Media) => void;
}

export const GenreShowcaseSection = memo(function GenreShowcaseSection({
  title,
  icon,
  themeColors,
  movies,
  onItemPress,
  fadeStyle,
}: GenreShowcaseSectionProps) {
  if (movies.length < 3) return null;
  return (
    <Animated.View style={fadeStyle}>
      <GenreShowcase
        title={title}
        icon={icon}
        themeColors={themeColors}
        movies={movies}
        onItemPress={onItemPress}
      />
    </Animated.View>
  );
}, (prev, next) => {
  if (prev.title !== next.title) return false;
  if (prev.movies.length !== next.movies.length) return false;
  if (prev.movies[0]?.id !== next.movies[0]?.id) return false;
  return true;
});

export default function DummyRoute() { return null; }
