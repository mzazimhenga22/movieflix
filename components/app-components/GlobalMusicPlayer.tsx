import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Animated, AppState, AppStateStatus, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TrackPlayer, { 
  State, 
  usePlaybackState, 
  useTrackPlayerEvents, 
  Event, 
} from 'react-native-track-player';
import type { Media } from '../../types';
import MusicPlayerModal from './music/MusicPlayerModal';
import { initializeTrackPlayer, ensureTrackPlayer } from '../../lib/trackPlayerInit';
import { usePStream } from '../../src/pstream/usePStream';
import LiquidGlass from './LiquidGlass';
import { enqueueDownload } from '../../lib/downloadManager';
import { useSubscription } from '../../providers/SubscriptionProvider';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

type GlobalMusicPlayerContextValue = {
  currentTrack: Media | null;
  queue: Media[];
  playerVisible: boolean;
  playerActive: boolean;
  accentColor: string;
  activeFormat: string | null;
  playTrack: (track: Media, fullQueue?: Media[], accentColor?: string) => Promise<void>;
  playNext: (track: Media) => Promise<void>;
  addToQueue: (track: Media) => Promise<void>;
  downloadTrack: (track: Media) => Promise<void>;
  openPlayer: () => void;
  closePlayer: () => void;
  stopPlayer: () => Promise<void>;
  setAccentColor: (color: string) => void;
  nextInQueue: () => Promise<void>;
  prevInQueue: () => Promise<void>;
  togglePlay: () => Promise<void>;
  isPlaying: boolean;
};

const GlobalMusicPlayerContext = createContext<GlobalMusicPlayerContextValue | null>(null);

export const useGlobalMusicPlayer = () => {
  const ctx = useContext(GlobalMusicPlayerContext);
  if (!ctx) throw new Error('useGlobalMusicPlayer must be used within GlobalMusicPlayerProvider');
  return ctx;
};

const MiniPlayer = ({ track, isPlaying, onToggle, onOpen, accentColor }: any) => {
    const slideAnim = useRef(new Animated.Value(100)).current;

    useEffect(() => {
        Animated.spring(slideAnim, {
            toValue: 0,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
        }).start();
    }, []);

    if (!track) return null;
    
    return (
        <Animated.View style={[styles.miniPlayerContainer, { transform: [{ translateY: slideAnim }] }]}>
            <TouchableOpacity onPress={onOpen} activeOpacity={0.9} style={{ flex: 1 }}>
                <LiquidGlass cornerRadius={22} tintOpacity={0.85} tintColor="#111" style={styles.miniGlass}>
                    <View style={styles.miniContent}>
                        <Image source={{ uri: track.thumbnail }} style={styles.miniThumb} />
                        <View style={styles.miniInfo}>
                            <Text style={styles.miniTitle} numberOfLines={1}>{track.title}</Text>
                            <Text style={styles.miniArtist} numberOfLines={1}>{track.artist || 'Unknown Artist'}</Text>
                        </View>
                        <TouchableOpacity onPress={onToggle} style={[styles.miniPlay, { backgroundColor: accentColor }]}>
                            <Ionicons name={isPlaying ? "pause" : "play"} size={20} color="#fff" style={{ marginLeft: isPlaying ? 0 : 2 }} />
                        </TouchableOpacity>
                    </View>
                </LiquidGlass>
            </TouchableOpacity>
        </Animated.View>
    );
};

export const GlobalMusicPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { getMusicStream } = usePStream();
  const { currentPlan } = useSubscription();
  const router = useRouter();
  
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerActive, setPlayerActive] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Media | null>(null);
  const [queue, setQueue] = useState<Media[]>([]);
  const [accentColor, setAccentColor] = useState('#1db954');
  const [activeFormat, setActiveFormat] = useState<string | null>(null);
  
  const playbackState = usePlaybackState();
  const isPlaying = playbackState.state === State.Playing;

  useEffect(() => {
    initializeTrackPlayer().catch(e => console.warn('[GlobalMusicPlayer] Init failed:', e));
  }, []);

  // Background Playback Gate: Stop if user is 'free' and app goes to background
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (currentPlan === 'free') {
          console.log('[GlobalMusicPlayer] Pausing playback for free user in background');
          await TrackPlayer.pause();
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [currentPlan]);

  const resolveAndAdd = async (track: Media, insertAt?: number) => {
    await ensureTrackPlayer();
    const videoId = String((track as any).videoId || track.id);
    
    try {
      console.log(`[GlobalMusicPlayer] Preparing track ${videoId}`);
      
      let streamUri = track.localUri;
      let headers = undefined;
      let format = null;

      if (!streamUri) {
        console.log(`[GlobalMusicPlayer] Resolving remote stream for ${videoId}`);
        const stream = await getMusicStream(videoId, 'audio');
        if (!stream?.uri) return null;
        streamUri = stream.uri;
        headers = stream.headers;
        format = stream.mimeType?.includes('mp4') ? 'M4A' : 'MP3';
      } else {
        console.log(`[GlobalMusicPlayer] Using local URI for ${videoId}: ${streamUri}`);
        format = 'OFFLINE';
      }

      const trackObj = {
        id: videoId,
        url: streamUri,
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        artwork: track.thumbnail || (track as any).poster_path,
        headers: headers,
        format: format, // Store in metadata
      };

      if (insertAt !== undefined) {
        await TrackPlayer.add([trackObj], insertAt);
      } else {
        await TrackPlayer.add([trackObj]);
      }
      return trackObj;
    } catch (e) {
      console.error('[GlobalMusicPlayer] Resolve failed', e);
      return null;
    }
  };

  const nextInQueue = useCallback(async () => {
    const currentIdx = queue.findIndex(t => String((t as any).videoId || t.id) === String((currentTrack as any)?.videoId || currentTrack?.id));
    if (currentIdx !== -1 && currentIdx < queue.length - 1) {
        const nextTrack = queue[currentIdx + 1];
        const trackObj = await resolveAndAdd(nextTrack);
        if (trackObj) {
            const index = await TrackPlayer.getActiveTrackIndex();
            await TrackPlayer.skip((index ?? 0) + 1);
            await TrackPlayer.play();
        }
    }
  }, [currentTrack, queue]);

  const prevInQueue = useCallback(async () => {
    await TrackPlayer.skipToPrevious();
  }, []);

  // Sync current track from TrackPlayer events
  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged, Event.PlaybackQueueEnded], async (event) => {
    if (event.type === Event.PlaybackActiveTrackChanged) {
      if (event.track) {
        const trackData = event.track as any;
        const match = queue.find(t => String((t as any).videoId || t.id) === String(trackData.id));
        if (match) setCurrentTrack(match);
        setActiveFormat(trackData.format || 'AAC');
      }
      
      // Auto-resolve next track pre-emptively
      const currentIdx = queue.findIndex(t => String((t as any).videoId || t.id) === String((currentTrack as any)?.videoId || currentTrack?.id));
      if (currentIdx !== -1 && currentIdx < queue.length - 1) {
          const nextTrack = queue[currentIdx + 1];
          const nativeQueue = await TrackPlayer.getQueue();
          const nextId = String((nextTrack as any).videoId || nextTrack.id);
          if (!nativeQueue.some(t => String(t.id) === nextId)) {
              console.log(`[GlobalMusicPlayer] Pre-resolving next track: ${nextId}`);
              await resolveAndAdd(nextTrack);
          }
      }
    }
    
    if (event.type === Event.PlaybackQueueEnded) {
        console.log('[GlobalMusicPlayer] Queue ended, trying next...');
        await nextInQueue();
    }
  });

  const playTrack = useCallback(async (track: Media, fullQueue: Media[] = [], nextAccent?: string) => {
    try {
      await ensureTrackPlayer();
      await TrackPlayer.reset();
      
      setPlayerActive(true);
      setPlayerVisible(true);
      if (nextAccent) setAccentColor(nextAccent);
      
      const trackObj = await resolveAndAdd(track);
      if (trackObj) {
        setCurrentTrack(track);
        setQueue(fullQueue.length > 0 ? fullQueue : [track]);
        setActiveFormat(trackObj.format);
        setTimeout(async () => {
            await TrackPlayer.play();
        }, 100);
      }
    } catch (e) {
      console.error('[GlobalMusicPlayer] playTrack failed:', e);
    }
  }, [getMusicStream]);

  const playNext = useCallback(async (track: Media) => {
    const currentIdx = await TrackPlayer.getActiveTrackIndex();
    await resolveAndAdd(track, (currentIdx ?? 0) + 1);
    setQueue(prev => {
      const newQueue = [...prev];
      const trackId = String((track as any).videoId || track.id);
      const existingIdx = newQueue.findIndex(t => String((t as any).videoId || t.id) === trackId);
      if (existingIdx !== -1) newQueue.splice(existingIdx, 1);
      newQueue.splice((currentIdx ?? 0) + 1, 0, track);
      return newQueue;
    });
  }, [currentTrack]);

  const addToQueue = useCallback(async (track: Media) => {
    await resolveAndAdd(track);
    setQueue(prev => {
      const trackId = String((track as any).videoId || track.id);
      const exists = prev.some(t => String((t as any).videoId || t.id) === trackId);
      if (exists) return prev;
      return [...prev, track];
    });
  }, []);

  const downloadTrack = useCallback(async (track: Media) => {
    // Download Gate: Must be Premium
    if (currentPlan !== 'premium') {
        Alert.alert(
            'Premium Feature',
            'Offline listening is only available for Premium members. Upgrade now to save your favorites!',
            [
                { text: 'Later', style: 'cancel' },
                { text: 'Upgrade', onPress: () => router.push('/premium') }
            ]
        );
        return;
    }

    const videoId = String((track as any).videoId || track.id);
    try {
      console.log(`[GlobalMusicPlayer] Preparing download for ${videoId}`);
      const stream = await getMusicStream(videoId, 'audio');
      if (!stream?.uri) {
        throw new Error('Could not resolve stream for download');
      }

      const qualityLabel = stream.mimeType?.includes('mp4') ? 'M4A' : 'MP3';

      await enqueueDownload({
        title: track.title || 'Unknown Track',
        mediaId: Number(track.id) || undefined,
        mediaType: 'music',
        artist: track.artist || 'Unknown Artist',
        videoId: videoId,
        posterPath: track.thumbnail || (track as any).poster_path,
        sourceUrl: stream.uri,
        headers: stream.headers,
        downloadType: 'file',
        qualityLabel: qualityLabel,
      });
      console.log(`[GlobalMusicPlayer] Download enqueued for ${videoId} (${qualityLabel})`);
    } catch (e) {
      console.error('[GlobalMusicPlayer] Download failed', e);
      throw e;
    }
  }, [getMusicStream, currentPlan, router]);

  const togglePlay = useCallback(async () => {
    const state = (await TrackPlayer.getPlaybackState()).state;
    if (state === State.Playing) await TrackPlayer.pause();
    else await TrackPlayer.play();
  }, []);

  const openPlayer = useCallback(() => currentTrack && setPlayerVisible(true), [currentTrack]);
  const closePlayer = useCallback(() => setPlayerVisible(false), []);

  const stopPlayer = useCallback(async () => {
    await TrackPlayer.reset();
    setPlayerVisible(false);
    setPlayerActive(false);
    setCurrentTrack(null);
    setQueue([]);
  }, []);

  const value = useMemo(() => ({
    currentTrack, queue, playerVisible, playerActive, accentColor, activeFormat,
    playTrack, playNext, addToQueue, downloadTrack, openPlayer, closePlayer, stopPlayer,
    setAccentColor, nextInQueue, prevInQueue, togglePlay, isPlaying
  }), [accentColor, closePlayer, currentTrack, queue, openPlayer, playTrack, playNext, addToQueue, downloadTrack, playerActive, playerVisible, stopPlayer, nextInQueue, prevInQueue, togglePlay, isPlaying, activeFormat]);

  return (
    <GlobalMusicPlayerContext.Provider value={value}>
      {children}
      {playerActive && !playerVisible && (
          <MiniPlayer 
            track={currentTrack} 
            isPlaying={isPlaying} 
            onToggle={togglePlay} 
            onOpen={openPlayer} 
            accentColor={accentColor}
          />
      )}
      <MusicPlayerModal
        isVisible={playerVisible}
        activeTrack={currentTrack}
        queue={queue}
        onClose={closePlayer}
        onNext={nextInQueue}
        onPrev={prevInQueue}
        onTrackSelect={(t) => playTrack(t, queue)}
      />
    </GlobalMusicPlayerContext.Provider>
  );
};

const styles = StyleSheet.create({
    miniPlayerContainer: {
        position: 'absolute',
        bottom: 100, // Above bottom tabs
        left: 20,
        right: 20,
        height: 72,
        zIndex: 999,
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
        width: 52,
        height: 52,
        borderRadius: 12,
        backgroundColor: '#222',
    },
    miniInfo: {
        flex: 1,
        marginLeft: 15,
    },
    miniTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    miniArtist: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        marginTop: 2,
    },
    miniPlay: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    }
});

export default GlobalMusicPlayerProvider;
