import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, Animated, Easing, PixelRatio } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { IMAGE_BASE_URL } from '@/constants/api';
import { Media } from '@/types';
import { useRouter } from 'expo-router';

interface FeaturedMovieProps {
  movie: Media;
  getGenreNames: (genreIds: number[]) => string;
  onInfoPress?: (movie: Media) => void;
}

const FeaturedMovie: React.FC<FeaturedMovieProps> = ({ movie, getGenreNames, onInfoPress }) => {
  const slideAnim = useRef(new Animated.Value(250)).current; // Start position (off-screen below)
  const parallax = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const fontScale = PixelRatio.getFontScale();
  const cardHeight = Math.round(250 + Math.max(0, fontScale - 1) * 90);

  useEffect(() => {
    slideAnim.setValue(250); // Reset to start position for the new movie
    Animated.timing(slideAnim, {
      toValue: 0, // Animate to final position (on-screen)
      duration: 700,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();

    parallax.setValue(0);
    Animated.timing(parallax, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [movie, parallax, slideAnim]);

  const handlePress = () => {
    if (movie) {
      router.push(`/details/${movie.id}?mediaType=${movie.media_type || 'movie'}`);
    }
  };


  if (!movie) return null;

  return (
    <View style={[styles.cardContainer, { height: cardHeight }]}>
      <Animated.View
        style={{
          transform: [
            { translateY: slideAnim },
            {
              translateY: parallax.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        }}
      >
        <TouchableOpacity onPress={handlePress} activeOpacity={0.92}>
          <LinearGradient
            colors={['rgba(255,255,255,0.08)', 'rgba(8,10,20,0.9)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.featuredMovieCard, { height: cardHeight }]}
          >
            <Image
              source={{ uri: `${IMAGE_BASE_URL}${movie.poster_path}` }}
              style={styles.featuredMovieImage}
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.45)']}
              style={styles.overlay}
            >
              <View style={styles.detailsRow}>
                <View style={styles.detailsContainer}>
                  <Text style={styles.eyebrow}>Featured tonight</Text>
                  <Text style={styles.featuredMovieTitle} numberOfLines={2}>
                    {movie.title || movie.name}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={styles.matchPill}>
                      <Text style={styles.matchText}>
                        {((movie.vote_average || 0) * 10).toFixed(0)}% match
                      </Text>
                    </View>
                    <Text style={styles.metaText}>
                      {(movie.release_date || movie.first_air_date || '').slice(0, 4)}
                    </Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText} numberOfLines={1}>
                      {getGenreNames(movie.genre_ids || [])}
                    </Text>
                  </View>
                </View>
                <View style={styles.ratingContainer}>
                  <FontAwesome name="star" size={16} color="gold" />
                  <Text style={styles.ratingText}>{(movie.vote_average || 0).toFixed(1)}</Text>
                </View>
              </View>
              <View style={styles.featuredMovieActions}>
                <TouchableOpacity style={styles.primaryPlayButton} onPress={handlePress}>
                  <Ionicons name="play" size={18} color="#000" />
                  <Text style={styles.primaryPlayText}>Play</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryPill}>
                  <FontAwesome name="plus" size={16} color="#fff" />
                  <Text style={styles.secondaryText}>My List</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryIcon}
                  onPress={() => {
                    if (onInfoPress) {
                      onInfoPress(movie);
                    } else {
                      handlePress();
                    }
                  }}
                >
                  <FontAwesome name="info-circle" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 0,
    backgroundColor: 'rgba(5,6,15,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
  },
  featuredMovieCard: {
    justifyContent: 'flex-end',
    borderRadius: 20,
    overflow: 'hidden',
  },
  featuredMovieImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    resizeMode: 'cover',
    opacity: 0.3,
  },
  overlay: {
    padding: 16,
    borderRadius: 18,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  detailsContainer: {
    flex: 1,
    marginRight: 10,
    minWidth: 0,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  featuredMovieTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    rowGap: 6,
  },
  matchPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(229,9,20,0.96)',
  },
  matchText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  metaText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  metaDot: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexShrink: 0,
  },
  ratingText: {
    color: 'white',
    marginLeft: 5,
    fontSize: 16,
    fontWeight: 'bold',
  },
  featuredMovieActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
    flexWrap: 'wrap',
    rowGap: 10,
  },
  primaryPlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  primaryPlayText: {
    color: '#000',
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  secondaryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  secondaryIcon: {
    padding: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
});

export default FeaturedMovie;
