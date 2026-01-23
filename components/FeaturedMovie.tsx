import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Animated, PixelRatio, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { IMAGE_BASE_URL } from '@/constants/api';
import { Media } from '@/types';
import { useRouter } from 'expo-router';
import { useNavigationGuard } from '@/hooks/use-navigation-guard';
import { useAccent } from '@/app/components/AccentContext';
import * as Haptics from 'expo-haptics';

interface FeaturedMovieProps {
  movie: Media;
  getGenreNames: (genreIds: number[]) => string;
  onInfoPress?: (movie: Media) => void;
}

const FeaturedMovie: React.FC<FeaturedMovieProps> = ({ movie, getGenreNames, onInfoPress }) => {
  // Fast animations - start at 0.85 so it's nearly visible immediately
  const fadeAnim = useRef(new Animated.Value(0.85)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;
  const contentAnim = useRef(new Animated.Value(0.9)).current;

  const router = useRouter();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  
  const fontScale = PixelRatio.getFontScale();
  const cardHeight = Math.round(320 + Math.max(0, fontScale - 1) * 60);

  const rating = (movie?.vote_average || 0).toFixed(1);
  const ratingNum = parseFloat(rating);
  const isHighRated = ratingNum >= 7.5;
  const matchPercent = ((movie?.vote_average || 0) * 10).toFixed(0);

  // Quick entrance - no delay, fast spring
  useEffect(() => {
    fadeAnim.setValue(0.85);
    scaleAnim.setValue(0.97);
    contentAnim.setValue(0.9);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 100,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [movie]);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (movie) {
      deferNav(() => router.push(`/details/${movie.id}?mediaType=${movie.media_type || 'movie'}`));
    }
  };

  const handlePlayPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    handlePress();
  };

  if (!movie) return null;

  const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const genres = getGenreNames(movie.genre_ids || []);

  return (
    <Animated.View 
      style={[
        styles.cardContainer, 
        { 
          height: cardHeight,
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }
      ]}
    >
      {/* Ambient glow behind card */}
      <View style={[styles.ambientGlow, { backgroundColor: accent, opacity: 0.2 }]} />

      <TouchableOpacity onPress={handlePress} activeOpacity={0.95} style={styles.touchable}>
        {/* Main card with glass effect */}
        <View style={styles.cardInner}>
          {/* Background poster */}
          <View style={styles.posterContainer}>
            <ExpoImage
              source={{ uri: `${IMAGE_BASE_URL}${movie.backdrop_path || movie.poster_path}` }}
              style={styles.backdropImage}
              contentFit="cover"
              transition={400}
            />
            {/* Cinematic gradient overlays */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(8,10,18,0.85)', 'rgba(8,10,18,0.98)']}
              locations={[0, 0.4, 0.7, 1]}
              style={styles.gradientOverlay}
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.5)', 'transparent', 'transparent']}
              locations={[0, 0.3, 1]}
              style={styles.topGradient}
            />
            {/* Side vignette */}
            <LinearGradient
              colors={[`${accent}30`, 'transparent', 'transparent', `${accent}20`]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.sideVignette}
            />
          </View>

          {/* Top badges row */}
          <View style={styles.topBadgesRow}>
            <View style={styles.featuredBadge}>
              <LinearGradient
                colors={[accent, '#ff6b6b']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.featuredBadgeGradient}
              >
                <Ionicons name="sparkles" size={12} color="#fff" />
                <Text style={styles.featuredBadgeText}>FEATURED</Text>
              </LinearGradient>
            </View>
            
            {isHighRated && (
              <View style={styles.topRatedBadge}>
                <Ionicons name="trophy" size={11} color="#ffd700" />
                <Text style={styles.topRatedText}>TOP RATED</Text>
              </View>
            )}
          </View>

          {/* Rating circle - floating glass */}
          <View style={styles.ratingCircleWrap}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={60} tint="dark" style={styles.ratingCircle}>
                <Text style={[styles.ratingNumber, isHighRated && styles.ratingNumberHigh]}>{rating}</Text>
                <View style={styles.ratingStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <FontAwesome
                      key={star}
                      name={ratingNum >= star * 2 ? 'star' : ratingNum >= star * 2 - 1 ? 'star-half-o' : 'star-o'}
                      size={8}
                      color={isHighRated ? '#ffd700' : '#fff'}
                    />
                  ))}
                </View>
              </BlurView>
            ) : (
              <View style={[styles.ratingCircle, styles.ratingCircleAndroid]}>
                <Text style={[styles.ratingNumber, isHighRated && styles.ratingNumberHigh]}>{rating}</Text>
                <View style={styles.ratingStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <FontAwesome
                      key={star}
                      name={ratingNum >= star * 2 ? 'star' : ratingNum >= star * 2 - 1 ? 'star-half-o' : 'star-o'}
                      size={8}
                      color={isHighRated ? '#ffd700' : '#fff'}
                    />
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Content section */}
          <Animated.View style={[styles.contentSection, { opacity: contentAnim }]}>
            {/* Mini poster thumbnail */}
            <View style={styles.posterThumbWrap}>
              <ExpoImage
                source={{ uri: `${IMAGE_BASE_URL}${movie.poster_path}` }}
                style={styles.posterThumb}
                contentFit="cover"
                transition={300}
              />
              <LinearGradient
                colors={[`${accent}60`, 'transparent']}
                style={styles.posterThumbGlow}
              />
            </View>

            {/* Text content */}
            <View style={styles.textContent}>
              <Text style={styles.movieTitle} numberOfLines={2}>
                {movie.title || movie.name}
              </Text>

              {/* Meta pills row */}
              <View style={styles.metaPillsRow}>
                <View style={[styles.matchPill, { backgroundColor: `${accent}ee` }]}>
                  <Text style={styles.matchText}>{matchPercent}% Match</Text>
                </View>
                {year ? (
                  <View style={styles.yearPill}>
                    <Text style={styles.yearText}>{year}</Text>
                  </View>
                ) : null}
                <View style={styles.hdPill}>
                  <Text style={styles.hdText}>HD</Text>
                </View>
              </View>

              {/* Genres */}
              {genres ? (
                <Text style={styles.genresText} numberOfLines={1}>
                  {genres}
                </Text>
              ) : null}

              {/* Overview snippet */}
              {movie.overview ? (
                <Text style={styles.overviewText} numberOfLines={2}>
                  {movie.overview}
                </Text>
              ) : null}
            </View>
          </Animated.View>

          {/* Action buttons */}
          <Animated.View style={[styles.actionsRow, { opacity: contentAnim }]}>
            {/* Primary Play button */}
            <TouchableOpacity 
                style={styles.playButton} 
                onPress={handlePlayPress}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#ffffff', '#f0f0f0']}
                  style={styles.playButtonGradient}
                >
                  <View style={styles.playIconWrap}>
                    <Ionicons name="play" size={22} color="#000" style={{ marginLeft: 2 }} />
                  </View>
                  <Text style={styles.playButtonText}>Play Now</Text>
                </LinearGradient>
            </TouchableOpacity>

            {/* Secondary actions */}
            <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.8}>
              <Ionicons name="add" size={22} color="#fff" />
              <Text style={styles.secondaryButtonText}>My List</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.infoButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (onInfoPress) {
                  onInfoPress(movie);
                } else {
                  handlePress();
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="information-circle-outline" size={24} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareButton} activeOpacity={0.8}>
              <Ionicons name="share-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </Animated.View>

          {/* Bottom accent line */}
          <LinearGradient
            colors={[accent, '#ff6b6b', accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentLine}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginHorizontal: 14,
    borderRadius: 24,
    overflow: 'hidden',
    marginTop: 4,
  },
  ambientGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
  },
  touchable: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  cardInner: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(8,10,18,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  posterContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropImage: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  sideVignette: {
    ...StyleSheet.absoluteFillObject,
  },
  topBadgesRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    gap: 10,
    zIndex: 10,
  },
  featuredBadge: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  featuredBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  featuredBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  topRatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  topRatedText: {
    color: '#ffd700',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  ratingCircleWrap: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
  },
  ratingCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  ratingCircleAndroid: {
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  ratingNumber: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  ratingNumberHigh: {
    color: '#ffd700',
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  contentSection: {
    position: 'absolute',
    bottom: 75,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  posterThumbWrap: {
    width: 85,
    height: 127,
    borderRadius: 14,
    overflow: 'hidden',
    marginRight: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  posterThumb: {
    width: '100%',
    height: '100%',
  },
  posterThumbGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    borderRadius: 30,
    opacity: 0.5,
  },
  textContent: {
    flex: 1,
    paddingBottom: 4,
  },
  movieTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  metaPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  matchPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  matchText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  yearPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  yearText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  hdPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  hdText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  genresText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  overviewText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    lineHeight: 17,
  },
  actionsRow: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  playButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
  },
  playIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  infoButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  accentLine: {
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
    height: 3,
    borderRadius: 2,
  },
});

export default FeaturedMovie;
