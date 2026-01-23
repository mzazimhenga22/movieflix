import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IMAGE_BASE_URL } from '../../../constants/api';
import { buildProfileScopedKey } from '../../../lib/profileStorage';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface WatchProgress {
  positionMillis: number;
  durationMillis: number;
  progress: number;
  updatedAt?: number;
}

interface Props {
  visible: boolean;
  movie: any;
  onPlay: () => void;
  onDismiss: () => void;
  accentColor?: string;
}

export default function FloatingMiniPlayer({ 
  visible, 
  movie, 
  onPlay, 
  onDismiss, 
  accentColor = '#e50914',
}: Props) {
  const translateY = useRef(new Animated.Value(150)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Load active profile ID
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  
  useEffect(() => {
    AsyncStorage.getItem('activeProfile').then(stored => {
      if (stored) {
        const parsed = JSON.parse(stored);
        setActiveProfileId(parsed?.id ?? null);
      }
    }).catch(() => {});
  }, []);
  
  // Watch progress state - connected to watch history
  const [watchProgress, setWatchProgress] = useState<WatchProgress | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Load watch progress from storage
  useEffect(() => {
    if (!movie?.id || !visible) return;
    
    const loadProgress = async () => {
      try {
        const profileId = activeProfileId;
        const key = buildProfileScopedKey('watchHistory', profileId);
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          const history = JSON.parse(stored);
          // Find this movie's progress
          const mediaKey = `${movie.media_type || 'movie'}-${movie.id}`;
          const entry = history[mediaKey];
          if (entry?.watchProgress) {
            setWatchProgress(entry.watchProgress);
            // Animate to current progress
            Animated.timing(progressAnim, {
              toValue: entry.watchProgress.progress * 100,
              duration: 500,
              useNativeDriver: false,
            }).start();
          }
        }
      } catch (err) {
        console.warn('[FloatingMiniPlayer] Failed to load watch progress', err);
      }
    };
    
    loadProgress();
  }, [movie?.id, visible, activeProfileId]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, friction: 8, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();

      // Subtle pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 150, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10,
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 100) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.timing(translateX, {
            toValue: gestureState.dx > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onDismiss();
            translateX.setValue(0);
          });
        } else {
          Animated.spring(translateX, { toValue: 0, friction: 6, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  if (!movie) return null;

  // Format time remaining
  const formatTimeRemaining = () => {
    if (!watchProgress?.durationMillis || !watchProgress?.positionMillis) return null;
    const remainingMs = watchProgress.durationMillis - watchProgress.positionMillis;
    const remainingMins = Math.ceil(remainingMs / 60000);
    if (remainingMins < 60) return `${remainingMins}m left`;
    const hours = Math.floor(remainingMins / 60);
    const mins = remainingMins % 60;
    return `${hours}h ${mins}m left`;
  };

  // Format last watched
  const formatLastWatched = () => {
    if (!watchProgress?.updatedAt) return null;
    const diff = Date.now() - watchProgress.updatedAt;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const progressPercent = watchProgress ? Math.round(watchProgress.progress * 100) : 0;
  const timeRemaining = formatTimeRemaining();
  const lastWatched = formatLastWatched();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }, { translateX }, { scale }],
          opacity,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <LinearGradient
        colors={['rgba(25,25,35,0.98)', 'rgba(15,15,22,0.98)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      />

      {/* Accent border glow */}
      <View style={[styles.accentBorder, { backgroundColor: accentColor }]} />

      {/* Progress bar - shows actual watch progress */}
      <View style={styles.progressContainer}>
        <Animated.View
          style={[
            styles.progressBar,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
              backgroundColor: accentColor,
            },
          ]}
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Thumbnail */}
        <View style={styles.thumbnailContainer}>
          <ExpoImage
            source={{ uri: movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : undefined }}
            style={styles.thumbnail}
            contentFit="cover"
            transition={200}
          />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.thumbnailGradient} />
          
          {/* Play overlay */}
          <TouchableOpacity style={styles.playOverlay} onPress={onPlay} activeOpacity={0.9}>
            <Animated.View style={[styles.playCircle, { transform: [{ scale: pulseAnim }], backgroundColor: accentColor }]}>
              <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
            </Animated.View>
          </TouchableOpacity>
          
          {/* Progress badge on thumbnail */}
          {progressPercent > 0 && (
            <View style={[styles.progressBadge, { backgroundColor: accentColor }]}>
              <Text style={styles.progressBadgeText}>{progressPercent}%</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{movie.title || movie.name}</Text>
          
          {/* Watch status */}
          <View style={styles.statusRow}>
            {progressPercent > 0 ? (
              <>
                <Ionicons name="play-circle" size={12} color={accentColor} />
                <Text style={[styles.statusText, { color: accentColor }]}>
                  {timeRemaining || 'Continue watching'}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="play-circle-outline" size={12} color="rgba(255,255,255,0.5)" />
                <Text style={styles.statusText}>Start watching</Text>
              </>
            )}
          </View>
          
          {/* Mini stats */}
          <View style={styles.miniStats}>
            <View style={styles.miniStat}>
              <Ionicons name="star" size={11} color="#ffd700" />
              <Text style={styles.miniStatText}>{movie.vote_average?.toFixed(1) || 'N/A'}</Text>
            </View>
            {lastWatched && (
              <View style={styles.miniStat}>
                <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.5)" />
                <Text style={styles.miniStatText}>{lastWatched}</Text>
              </View>
            )}
            {movie.runtime && (
              <View style={styles.miniStat}>
                <Ionicons name="film-outline" size={11} color="rgba(255,255,255,0.5)" />
                <Text style={styles.miniStatText}>{movie.runtime}m</Text>
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={onPlay} activeOpacity={0.8}>
            <LinearGradient colors={[accentColor, `${accentColor}cc`]} style={styles.actionGradient}>
              <Ionicons name="play" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.closeBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Swipe hint */}
      <View style={styles.swipeHint}>
        <View style={styles.swipeIndicator} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 12,
    right: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 16,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  accentBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.8,
  },
  progressContainer: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 2,
  },
  progressBar: {
    height: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
  },
  thumbnailContainer: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  progressBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '500',
  },
  miniStats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  miniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  miniStatText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionGradient: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeHint: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  swipeIndicator: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});
