import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  movie: any;
  accentColor?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function ImmersiveStats({ movie, accentColor = '#e50914' }: Props) {
  const progressAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  
  const scaleAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Staggered card entrance
    scaleAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: 1,
        friction: 6,
        delay: i * 150,
        useNativeDriver: true,
      }).start();
    });

    // Progress animations
    progressAnims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 1500,
        delay: 500 + i * 200,
        useNativeDriver: false,
      }).start();
    });

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const popularity = Math.min(movie?.popularity || 0, 1000);
  const voteAverage = movie?.vote_average || 0;
  const voteCount = movie?.vote_count || 0;

  const stats = [
    {
      icon: 'flame',
      label: 'Popularity',
      value: Math.round(popularity),
      maxValue: 1000,
      color: '#ff6b35',
      gradient: ['#ff6b35', '#ff3b30'],
    },
    {
      icon: 'star',
      label: 'Rating',
      value: voteAverage,
      maxValue: 10,
      color: '#ffd700',
      gradient: ['#ffd700', '#ff9500'],
      suffix: '/10',
    },
    {
      icon: 'people',
      label: 'Votes',
      value: voteCount,
      maxValue: Math.max(voteCount * 1.5, 10000),
      color: '#5ac8fa',
      gradient: ['#5ac8fa', '#007aff'],
      format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString(),
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerDot} />
        <Text style={styles.headerTitle}>Movie Stats</Text>
        <Text style={styles.headerSubtitle}>Real-time analytics</Text>
      </View>

      <View style={styles.statsGrid}>
        {stats.map((stat, index) => (
          <Animated.View
            key={stat.label}
            style={[
              styles.statCard,
              {
                transform: [{ scale: scaleAnims[index] }],
                opacity: scaleAnims[index],
              },
            ]}
          >
            <LinearGradient
              colors={[`${stat.color}15`, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}
            />

            {/* Circular progress */}
            <View style={styles.circleContainer}>
              <Svg width={80} height={80} viewBox="0 0 100 100">
                <Defs>
                  <SvgGradient id={`grad-${index}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <Stop offset="0%" stopColor={stat.gradient[0]} />
                    <Stop offset="100%" stopColor={stat.gradient[1]} />
                  </SvgGradient>
                </Defs>
                {/* Background circle */}
                <Circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="8"
                  fill="transparent"
                />
                {/* Progress circle */}
                <AnimatedCircle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke={`url(#grad-${index})`}
                  strokeWidth="8"
                  fill="transparent"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={progressAnims[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [2 * Math.PI * 40, 2 * Math.PI * 40 * (1 - stat.value / stat.maxValue)],
                  })}
                  transform="rotate(-90 50 50)"
                />
              </Svg>

              {/* Center content */}
              <View style={styles.circleCenter}>
                <Ionicons name={stat.icon as any} size={20} color={stat.color} />
              </View>
            </View>

            <Text style={styles.statValue}>
              {stat.format ? stat.format(stat.value) : stat.value.toFixed(stat.suffix ? 1 : 0)}
              {stat.suffix && <Text style={styles.statSuffix}>{stat.suffix}</Text>}
            </Text>
            <Text style={styles.statLabel}>{stat.label}</Text>

            {/* Sparkle decoration */}
            <Animated.View style={[styles.sparkle, { transform: [{ scale: pulseAnim }] }]}>
              <Ionicons name="sparkles" size={12} color={stat.color} />
            </Animated.View>
          </Animated.View>
        ))}
      </View>

      {/* Bottom info bar */}
      <View style={styles.infoBar}>
        <View style={styles.infoItem}>
          <Ionicons name="language-outline" size={16} color="rgba(255,255,255,0.6)" />
          <Text style={styles.infoText}>{movie?.original_language?.toUpperCase() || 'EN'}</Text>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.infoItem}>
          <Ionicons name="calendar-outline" size={16} color="rgba(255,255,255,0.6)" />
          <Text style={styles.infoText}>{movie?.release_date?.slice(0, 4) || 'TBA'}</Text>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.infoItem}>
          <Ionicons name="film-outline" size={16} color="rgba(255,255,255,0.6)" />
          <Text style={styles.infoText}>{movie?.runtime ? `${movie.runtime}m` : 'N/A'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4cd964',
    shadowColor: '#4cd964',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
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
    marginLeft: 'auto',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  circleContainer: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  circleCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  statSuffix: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
  },
  sparkle: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  infoText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '700',
  },
  infoDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
