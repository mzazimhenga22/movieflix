import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Image, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Media } from '@/types';
import { usePStream } from '../src/pstream/usePStream';
import { useTvAccent } from '../app/components/TvAccentContext';
import TvGlassPanel from '../app/components/TvGlassPanel';
import { TvFocusable } from '../app/components/TvSpatialNavigation';
import { LiquidWaveformView, LiquidGlassButton } from './app-components/LiquidNativeViews';

// ============================================================================
// Context Types
// ============================================================================

type TvMusicPlayerContextValue = {
  currentTrack: Media | null;
  queue: Media[];
  playerVisible: boolean;
  accentColor: string;
  playTrack: (track: Media, fullQueue?: Media[], accentColor?: string) => Promise<void>;
  playNext: (track: Media) => Promise<void>;
  addToQueue: (track: Media) => Promise<void>;
  openPlayer: () => void;
  closePlayer: () => void;
  setAccentColor: (color: string) => void;
  nextInQueue: () => void;
  prevInQueue: () => void;
};

const TvMusicPlayerContext = createContext<TvMusicPlayerContextValue | null>(null);

export const useTvMusicPlayer = () => {
  const ctx = useContext(TvMusicPlayerContext);
  if (!ctx) throw new Error('useTvMusicPlayer must be used within TvMusicPlayerProvider');
  return ctx;
};

// ============================================================================
// Mini Player (TV)
// ============================================================================

type MiniPlayerProps = {
  track: Media | null;
  accentColor: string;
  onOpen: () => void;
};

const TvMiniPlayer = ({ track, accentColor, onOpen }: MiniPlayerProps) => {
  const slideAnim = useRef(new Animated.Value(150)).current;
  const waveformAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(waveformAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(waveformAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  if (!track) return null;

  return (
    <Animated.View style={[styles.miniContainer, { transform: [{ translateY: slideAnim }] }]}>
      <TvFocusable onPress={onOpen} style={({ focused }: any) => [styles.miniWrapper, focused && styles.miniFocused]}>
        <TvGlassPanel accent={accentColor} native compact borderRadius={24} glowIntensity="subtle" style={styles.miniGlass}>
          <View style={styles.miniContent}>
            <Image source={{ uri: (track as any).thumbnail }} style={styles.miniThumb} />
            <View style={styles.miniInfo}>
              <Text style={styles.miniTitle} numberOfLines={1}>{track.title || track.name}</Text>
              <Text style={styles.miniArtist} numberOfLines={1}>{(track as any).artist || 'Unknown Artist'}</Text>
            </View>
            {/* Mini Waveform */}
            <View style={styles.miniWaveform}>
              <LiquidWaveformView
                style={styles.miniWaveformView}
                barCount={16}
                color={accentColor}
                animated={true}
              />
            </View>
            <View style={[styles.miniPlay, { backgroundColor: accentColor }]}>
              <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
            </View>
          </View>
        </TvGlassPanel>
      </TvFocusable>
    </Animated.View>
  );
};

// ============================================================================
// Provider
// ============================================================================

export const TvMusicPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const { accentColor, setAccentColor: setTvAccent } = useTvAccent();
  const { getMusicStream } = usePStream();

  const [playerVisible, setPlayerVisible] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Media | null>(null);
  const [queue, setQueue] = useState<Media[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Media[]>([]);

  // Load recently played from storage
  useEffect(() => {
    AsyncStorage.getItem('tv_recently_played').then(raw => {
      if (raw) {
        try {
          setRecentlyPlayed(JSON.parse(raw));
        } catch {}
      }
    });
  }, []);

  // Save recently played
  useEffect(() => {
    if (recentlyPlayed.length > 0) {
      AsyncStorage.setItem('tv_recently_played', JSON.stringify(recentlyPlayed.slice(0, 20)));
    }
  }, [recentlyPlayed]);

  const playTrack = useCallback(async (track: Media, fullQueue: Media[] = [], color?: string) => {
    if (color) {
      setTvAccent(color);
    }

    setCurrentTrack(track);
    setQueue(fullQueue.length > 0 ? fullQueue : [track]);
    setPlayerVisible(true);

    // Add to recently played
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(t => String(t.id) !== String(track.id));
      return [track, ...filtered].slice(0, 20);
    });

    // Navigate to player with params
    router.push({
      pathname: '/music-player',
      params: {
        videoId: (track as any).videoId || track.id,
        title: track.title || track.name,
        artist: (track as any).artist || track.overview,
        thumbnail: (track as any).thumbnail || track.poster_path,
      }
    });
  }, [router, setTvAccent]);

  const playNext = useCallback(async (track: Media) => {
    setQueue(prev => {
      const newQueue = [...prev];
      const trackId = String((track as any).videoId || track.id);
      const existingIdx = newQueue.findIndex(t => String((t as any).videoId || t.id) === trackId);
      if (existingIdx !== -1) newQueue.splice(existingIdx, 1);
      // Add after current
      const currentIdx = newQueue.findIndex(t => String((t as any).videoId || t.id) === String((currentTrack as any)?.videoId || currentTrack?.id));
      newQueue.splice((currentIdx ?? 0) + 1, 0, track);
      return newQueue;
    });
  }, [currentTrack]);

  const addToQueue = useCallback(async (track: Media) => {
    setQueue(prev => {
      const trackId = String((track as any).videoId || track.id);
      const exists = prev.some(t => String((t as any).videoId || t.id) === trackId);
      if (exists) return prev;
      return [...prev, track];
    });
  }, []);

  const nextInQueue = useCallback(() => {
    const currentIdx = queue.findIndex(t => String((t as any).videoId || t.id) === String((currentTrack as any)?.videoId || currentTrack?.id));
    if (currentIdx !== -1 && currentIdx < queue.length - 1) {
      const nextTrack = queue[currentIdx + 1];
      playTrack(nextTrack, queue, accentColor);
    }
  }, [queue, currentTrack, accentColor, playTrack]);

  const prevInQueue = useCallback(() => {
    const currentIdx = queue.findIndex(t => String((t as any).videoId || t.id) === String((currentTrack as any)?.videoId || currentTrack?.id));
    if (currentIdx > 0) {
      const prevTrack = queue[currentIdx - 1];
      playTrack(prevTrack, queue, accentColor);
    }
  }, [queue, currentTrack, accentColor, playTrack]);

  const openPlayer = useCallback(() => {
    if (currentTrack) {
      router.push({
        pathname: '/music-player',
        params: {
          videoId: (currentTrack as any).videoId || currentTrack.id,
          title: currentTrack.title || currentTrack.name,
          artist: (currentTrack as any).artist || currentTrack.overview,
          thumbnail: (currentTrack as any).thumbnail || currentTrack.poster_path,
        }
      });
    }
  }, [currentTrack, router]);

  const closePlayer = useCallback(() => {
    setPlayerVisible(false);
    router.back();
  }, [router]);

  const value = useMemo(() => ({
    currentTrack,
    queue,
    playerVisible,
    accentColor,
    playTrack,
    playNext,
    addToQueue,
    openPlayer,
    closePlayer,
    setAccentColor: setTvAccent,
    nextInQueue,
    prevInQueue,
  }), [
    currentTrack, queue, playerVisible, accentColor,
    playTrack, playNext, addToQueue, openPlayer, closePlayer,
    setTvAccent, nextInQueue, prevInQueue
  ]);

  return (
    <TvMusicPlayerContext.Provider value={value}>
      {children}
      {currentTrack && !playerVisible && (
        <TvMiniPlayer
          track={currentTrack}
          accentColor={accentColor}
          onOpen={openPlayer}
        />
      )}
    </TvMusicPlayerContext.Provider>
  );
};

const styles = StyleSheet.create({
  miniContainer: {
    position: 'absolute',
    bottom: 80,
    left: 80,
    right: 80,
    height: 80,
    zIndex: 999,
  },
  miniWrapper: {
    flex: 1,
    borderRadius: 24,
  },
  miniFocused: {
    transform: [{ scale: 1.02 }],
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  miniGlass: {
    flex: 1,
    padding: 10,
  },
  miniContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniThumb: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: '#222',
  },
  miniInfo: {
    flex: 1,
    marginLeft: 18,
  justifyContent: 'center',
  },
  miniTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  miniArtist: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
  },
  miniWaveform: {
    width: 120,
    height: 40,
    marginHorizontal: 15,
  },
  miniWaveformView: {
    flex: 1,
  },
  miniPlay: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TvMusicPlayerProvider;
