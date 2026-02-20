import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { IMAGE_BASE_URL } from '../../../constants/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  movie: any;
  onPlay: () => void;
  onTrailer: () => void;
  accentColor?: string;
}

export default function CinematicHero({ movie, onPlay, onTrailer, accentColor = '#e50914' }: Props) {
  const parallaxAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const particleAnims = useRef(Array.from({ length: 20 }, () => ({
    x: new Animated.Value(Math.random() * SCREEN_WIDTH),
    y: new Animated.Value(SCREEN_HEIGHT),
    opacity: new Animated.Value(0),
  }))).current;

  useEffect(() => {
    // Pulse animation for play button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();

    // Shimmer effect
    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 3000, useNativeDriver: true })
    ).start();

    // Floating particles
    particleAnims.forEach((particle, i) => {
      const animateParticle = () => {
        particle.y.setValue(SCREEN_HEIGHT + 20);
        particle.opacity.setValue(0);
        particle.x.setValue(Math.random() * SCREEN_WIDTH);

        Animated.parallel([
          Animated.timing(particle.y, {
            toValue: -50,
            duration: 8000 + Math.random() * 4000,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(particle.opacity, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
            Animated.timing(particle.opacity, { toValue: 0, duration: 7000, useNativeDriver: true }),
          ]),
        ]).start(() => animateParticle());
      };

      setTimeout(animateParticle, i * 400);
    });
  }, []);

  const rating = movie?.vote_average?.toFixed(1) || '0.0';
  const year = movie?.release_date?.slice(0, 4) || movie?.first_air_date?.slice(0, 4) || '';

  return (
    <View style={styles.container}>
      {/* Background poster with parallax */}
      <Animated.View style={[styles.posterContainer, { transform: [{ translateY: parallaxAnim }] }]}>
        <ExpoImage
          source={{ uri: movie?.backdrop_path ? `${IMAGE_BASE_URL}${movie.backdrop_path}` : undefined }}
          style={styles.backdropImage}
          contentFit="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(10,10,15,0.95)', 'rgba(10,10,15,1)']}
          locations={[0, 0.4, 0.75, 1]}
          style={styles.gradient}
        />
      </Animated.View>

      {/* Floating particles */}
      {particleAnims.map((particle, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.particle,
            {
              backgroundColor: i % 3 === 0 ? accentColor : i % 3 === 1 ? '#ffd700' : '#fff',
              transform: [{ translateX: particle.x }, { translateY: particle.y }],
              opacity: particle.opacity,
            },
          ]}
        />
      ))}

      {/* Movie poster card */}
      <View style={styles.posterCard}>
        <ExpoImage
          source={{ uri: movie?.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : undefined }}
          style={styles.posterImage}
          contentFit="cover"
        />
        <LinearGradient
          colors={[`${accentColor}00`, `${accentColor}40`]}
          style={styles.posterGlow}
        />
        
        {/* Rating badge */}
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={14} color="#ffd700" />
          <Text style={styles.ratingText}>{rating}</Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{movie?.title || movie?.name}</Text>
        
        <View style={styles.metaRow}>
          {year && (
            <View style={styles.metaPill}>
              <Text style={styles.metaText}>{year}</Text>
            </View>
          )}
          {movie?.runtime && (
            <View style={styles.metaPill}>
              <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.metaText}>{movie.runtime}m</Text>
            </View>
          )}
          <View style={[styles.metaPill, { backgroundColor: `${accentColor}30`, borderColor: `${accentColor}50` }]}>
            <Text style={[styles.metaText, { color: accentColor }]}>HD</Text>
          </View>
        </View>

        {/* Genres */}
        {movie?.genres && (
          <View style={styles.genreRow}>
            {movie.genres.slice(0, 3).map((genre: any, i: number) => (
              <View key={genre.id} style={styles.genreChip}>
                <Text style={styles.genreText}>{genre.name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity onPress={onPlay} activeOpacity={0.9}>
            <Animated.View style={[styles.playButton, { transform: [{ scale: pulseAnim }], backgroundColor: accentColor }]}>
              <LinearGradient
                colors={[accentColor, '#ff6b35']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.playGradient}
              >
                <Ionicons name="play" size={28} color="#fff" />
                <Text style={styles.playText}>Play Now</Text>
              </LinearGradient>
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.trailerButton} onPress={onTrailer}>
            <Ionicons name="videocam-outline" size={22} color="#fff" />
            <Text style={styles.trailerText}>Trailer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Cinematic frame */}
      <View style={styles.frameTop} />
      <View style={styles.frameBottom} />
      
      {/* Shimmer overlay */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shimmer,
          {
            transform: [{
              translateX: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
              }),
            }],
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.05)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shimmerGradient}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: SCREEN_HEIGHT * 0.75,
    overflow: 'hidden',
  },
  posterContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropImage: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  posterCard: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    width: 180,
    height: 270,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  ratingBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ratingText: {
    color: '#ffd700',
    fontSize: 12,
    fontWeight: '800',
  },
  content: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  metaText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  genreRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  genreText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  playGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  playText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  trailerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  trailerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  frameTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 24,
    backgroundColor: '#0a0a0f',
  },
  frameBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 24,
    backgroundColor: '#0a0a0f',
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH * 2,
  },
  shimmerGradient: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
});
