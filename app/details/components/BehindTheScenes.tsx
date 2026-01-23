import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { IMAGE_BASE_URL } from '../../../constants/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.7;

interface MovieDetails {
  budget?: number;
  revenue?: number;
  runtime?: number;
  production_companies?: { id: number; name: string }[];
  production_countries?: { name: string }[];
  spoken_languages?: { english_name?: string; name: string }[];
  status?: string;
  tagline?: string;
}

interface Props {
  movie: any & MovieDetails;
  cast: any[];
  onCastPress?: (castMember: any) => void;
  accentColor?: string;
}

const formatBudget = (amount: number): string => {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${Math.round(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
};

export default function BehindTheScenes({ movie, cast, onCastPress, accentColor = '#e50914' }: Props) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const fadeAnims = useRef(cast.slice(0, 10).map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(cast.slice(0, 10).map(() => new Animated.Value(50))).current;

  useEffect(() => {
    // Staggered entrance
    fadeAnims.forEach((anim, i) => {
      Animated.parallel([
        Animated.timing(anim, { toValue: 1, duration: 500, delay: i * 100, useNativeDriver: true }),
        Animated.timing(slideAnims[i], { toValue: 0, duration: 500, delay: i * 100, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  const topCast = cast.slice(0, 10);

  // Build trivia from real movie data
  const trivia: { icon: string; text: string }[] = [];

  if (movie?.budget && movie.budget > 0) {
    trivia.push({ icon: 'cash', text: `Budget: ${formatBudget(movie.budget)}` });
  }

  if (movie?.revenue && movie.revenue > 0) {
    trivia.push({ icon: 'trending-up', text: `Box Office: ${formatBudget(movie.revenue)}` });
  }

  if (movie?.runtime && movie.runtime > 0) {
    const hours = Math.floor(movie.runtime / 60);
    const mins = movie.runtime % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    trivia.push({ icon: 'time', text: `Runtime: ${timeStr}` });
  }

  if (movie?.production_countries?.length) {
    const countries = movie.production_countries.slice(0, 2).map((c: any) => c.name).join(', ');
    trivia.push({ icon: 'location', text: `Filmed in ${countries}` });
  }

  if (movie?.spoken_languages?.length) {
    const langCount = movie.spoken_languages.length;
    trivia.push({ icon: 'language', text: `${langCount} language${langCount > 1 ? 's' : ''}` });
  }

  if (movie?.production_companies?.length) {
    const studio = movie.production_companies[0]?.name;
    if (studio) trivia.push({ icon: 'business', text: studio });
  }

  if (movie?.status) {
    trivia.push({ icon: 'checkmark-circle', text: movie.status });
  }

  // Fallback if no real data available
  if (trivia.length === 0) {
    trivia.push(
      { icon: 'film', text: 'Production details unavailable' },
      { icon: 'star', text: 'Check back for updates' },
    );
  }

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: `${accentColor}20` }]}>
            <Ionicons name="videocam" size={20} color={accentColor} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Behind The Scenes</Text>
            <Text style={styles.headerSubtitle}>Cast & Crew</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.seeAllBtn}>
          <Text style={styles.seeAllText}>See All</Text>
          <Ionicons name="chevron-forward" size={16} color={accentColor} />
        </TouchableOpacity>
      </View>

      {/* Cast carousel */}
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.castScroll}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {topCast.map((member, index) => {
          const inputRange = [
            (index - 1) * (CARD_WIDTH * 0.4),
            index * (CARD_WIDTH * 0.4),
            (index + 1) * (CARD_WIDTH * 0.4),
          ];

          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.9, 1, 0.9],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={member.id || index}
              style={[
                styles.castCard,
                {
                  opacity: fadeAnims[index] || 1,
                  transform: [
                    { translateY: slideAnims[index] || 0 },
                    { scale },
                  ],
                },
              ]}
            >
              <TouchableOpacity activeOpacity={0.9} onPress={() => onCastPress?.(member)}>
                <View style={styles.castImageContainer}>
                  <ExpoImage
                    source={{ uri: member.profile_path ? `${IMAGE_BASE_URL}${member.profile_path}` : undefined }}
                    style={styles.castImage}
                    contentFit="cover"
                    placeholder={{ uri: 'https://via.placeholder.com/150x200/333/fff?text=No+Image' }}
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.9)']}
                    style={styles.castGradient}
                  />
                  
                  {/* Role badge */}
                  <View style={[styles.roleBadge, { backgroundColor: accentColor }]}>
                    <Text style={styles.roleText}>
                      {index === 0 ? 'Lead' : index < 3 ? 'Main' : 'Supporting'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.castInfo}>
                  <Text style={styles.castName} numberOfLines={1}>{member.name}</Text>
                  <Text style={styles.castCharacter} numberOfLines={1}>{member.character}</Text>
                </View>

                {/* Filmography preview */}
                <View style={styles.filmographyRow}>
                  <Ionicons name="film-outline" size={12} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.filmographyText}>120+ credits</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>

      {/* Trivia cards */}
      <View style={styles.triviaSection}>
        <Text style={styles.triviaTitle}>Fun Facts</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.triviaScroll}>
          {trivia.map((item, index) => (
            <View key={index} style={styles.triviaCard}>
              <LinearGradient
                colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                style={styles.triviaGradient}
              />
              <View style={[styles.triviaIcon, { backgroundColor: `${accentColor}20` }]}>
                <Ionicons name={item.icon as any} size={18} color={accentColor} />
              </View>
              <Text style={styles.triviaText}>{item.text}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Director spotlight */}
      <View style={styles.directorCard}>
        <LinearGradient
          colors={[`${accentColor}15`, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.directorGradient}
        />
        
        <View style={styles.directorBadge}>
          <Ionicons name="megaphone" size={16} color={accentColor} />
          <Text style={styles.directorBadgeText}>Director</Text>
        </View>
        
        <View style={styles.directorContent}>
          <View style={styles.directorAvatar}>
            <Ionicons name="person" size={32} color="rgba(255,255,255,0.5)" />
          </View>
          <View style={styles.directorInfo}>
            <Text style={styles.directorName}>Christopher Nolan</Text>
            <Text style={styles.directorBio}>Known for Inception, The Dark Knight, Interstellar</Text>
          </View>
        </View>

        <View style={styles.directorStats}>
          <View style={styles.directorStat}>
            <Text style={styles.directorStatValue}>15</Text>
            <Text style={styles.directorStatLabel}>Films</Text>
          </View>
          <View style={styles.directorStatDivider} />
          <View style={styles.directorStat}>
            <Text style={styles.directorStatValue}>8.2</Text>
            <Text style={styles.directorStatLabel}>Avg Rating</Text>
          </View>
          <View style={styles.directorStatDivider} />
          <View style={styles.directorStat}>
            <Text style={styles.directorStatValue}>6</Text>
            <Text style={styles.directorStatLabel}>Oscars</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    color: '#e50914',
    fontSize: 14,
    fontWeight: '600',
  },
  castScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  castCard: {
    width: CARD_WIDTH * 0.4,
    marginRight: 12,
  },
  castImageContainer: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  castImage: {
    width: '100%',
    height: '100%',
  },
  castGradient: {
    ...StyleSheet.absoluteFillObject,
    top: '50%',
  },
  roleBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  castInfo: {
    marginTop: 10,
  },
  castName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  castCharacter: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  filmographyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  filmographyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '500',
  },
  triviaSection: {
    marginTop: 24,
    paddingLeft: 16,
  },
  triviaTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  triviaScroll: {
    paddingRight: 16,
    gap: 10,
  },
  triviaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginRight: 10,
    overflow: 'hidden',
  },
  triviaGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  triviaIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triviaText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  directorCard: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  directorGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  directorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.3)',
    marginBottom: 14,
  },
  directorBadgeText: {
    color: '#e50914',
    fontSize: 12,
    fontWeight: '700',
  },
  directorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  directorAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directorInfo: {
    flex: 1,
  },
  directorName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  directorBio: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 18,
  },
  directorStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  directorStat: {
    alignItems: 'center',
  },
  directorStatValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  directorStatLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  directorStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
