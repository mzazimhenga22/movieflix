import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Media } from '../../types';
import PulsePlaceholder from './PulsePlaceholder'; // Corrected import

interface Props {
  movie: Media | null;
  isLoading: boolean;
}

const MovieInfo: React.FC<Props> = ({ movie, isLoading }) => {
  return (
    <View style={styles.contentContainer}>
      {isLoading ? (
        <PulsePlaceholder style={styles.titlePlaceholder} />
      ) : (
        <Text style={styles.title}>{movie?.title || movie?.name}</Text>
      )}

      {isLoading ? (
        <PulsePlaceholder style={styles.datePlaceholder} />
      ) : (
        <Text style={styles.releaseDate}>Release Date: {movie?.release_date || movie?.first_air_date || 'N/A'}</Text>
      )}

      {!isLoading && movie && (
        <View style={styles.metaRow}>
          {typeof movie.vote_average === 'number' && (
            <View style={styles.metaPill}>
              <Text style={styles.metaPillLabel}>Score</Text>
              <Text style={styles.metaPillValue}>{movie.vote_average.toFixed(1)}</Text>
            </View>
          )}
          {movie.media_type && (
            <View style={styles.metaPillSoft}>
              <Text style={styles.metaPillValue}>{movie.media_type === 'tv' ? 'Series' : 'Movie'}</Text>
            </View>
          )}
        </View>
      )}

      {isLoading ? (
        <>
          <PulsePlaceholder style={styles.overviewPlaceholderLine} />
          <PulsePlaceholder style={[styles.overviewPlaceholderLine, { width: '92%' }]} />
          <PulsePlaceholder style={[styles.overviewPlaceholderLine, { width: '85%' }]} />
        </>
      ) : (
        <Text style={styles.overview}>{movie?.overview}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  title: {
    color: 'white',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  titlePlaceholder: {
    width: '60%',
    height: 28,
    borderRadius: 8,
    marginBottom: 8,
  },
  datePlaceholder: {
    width: 120,
    height: 14,
    borderRadius: 6,
    marginBottom: 12,
  },
  releaseDate: {
    color: '#cfcfcf',
    fontSize: 13,
    marginBottom: 12,
  },
  overview: {
    color: '#dcdcdc',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  overviewPlaceholderLine: {
    width: '100%',
    height: 14,
    borderRadius: 6,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  metaPillSoft: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  metaPillLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaPillValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default MovieInfo;
