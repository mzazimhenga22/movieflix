import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Alert,
  Share,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  FadeIn,
  FadeOut,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import TrackPlayer, { useProgress, usePlaybackState, State } from 'react-native-track-player';
import { usePStream } from '../../../src/pstream/usePStream';
import { LyricsResolver } from '../../../src/pstream/LyricsResolver';
import { useGlobalMusicPlayer } from '../GlobalMusicPlayer';
import LiquidGlass from '../LiquidGlass';
import { useThemeColor } from '../../../hooks/useThemeColor';

const { width, height } = Dimensions.get('window');

interface MusicPlayerModalProps {
  isVisible: boolean;
  onClose: () => void;
  activeTrack: any;
  queue: any[];
  onNext: () => void;
  onPrev: () => void;
  onTrackSelect?: (track: any) => void;
}

const VisualizerBar = ({ index, isPlaying, color }: { index: number, isPlaying: boolean, color: string }) => {
    const heightVal = useSharedValue(15);
    
    useEffect(() => {
        if (isPlaying) {
            heightVal.value = withRepeat(
                withSequence(
                    withTiming(15 + Math.random() * 30, { duration: 300 + Math.random() * 200 }),
                    withTiming(10 + Math.random() * 10, { duration: 300 + Math.random() * 200 })
                ),
                -1,
                true
            );
        } else {
            heightVal.value = withTiming(10);
        }
    }, [isPlaying]);

    const animatedStyle = useAnimatedStyle(() => ({
        height: heightVal.value,
        backgroundColor: color,
        opacity: isPlaying ? 0.8 : 0.3,
    }));

    return <Animated.View style={[styles.vizBar, animatedStyle]} />;
};

const MusicPlayerModal: React.FC<MusicPlayerModalProps> = ({
  isVisible,
  onClose,
  activeTrack,
  queue,
  onNext,
  onPrev,
  onTrackSelect,
}) => {
  const { playTrack, playNext, addToQueue, togglePlay, isPlaying, downloadTrack, activeFormat } = useGlobalMusicPlayer();
  const accentColor = useThemeColor({}, 'primary');
  const progress = useProgress();
  const playbackState = usePlaybackState();
  const isLoading = playbackState.state === State.Buffering || playbackState.state === State.Loading;
  
  // States
  const [lyrics, setLyrics] = useState<any[]>([]);
  const [relatedTracks, setRelatedTracks] = useState<any[]>([]);
  const [showLyrics, setShowLyrics] = useState(false);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [activeTab, setActiveTab] = useState<'next' | 'related'>('next');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const mainScrollRef = useRef<ScrollView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['30%', '75%'], []);

  const albumAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(isPlaying ? 1 : 0.9) },
      { rotate: withTiming(`${isPlaying ? 0 : -3}deg`) }
    ],
    opacity: withTiming(isPlaying ? 1 : 0.8),
  }));

  // Load Metadata (Lyrics & Related)
  useEffect(() => {
    let active = true;
    const fetchMeta = async () => {
      if (!activeTrack) return;
      setLyrics([]);
      setLoadingLyrics(true);
      try {
        const lyricsRes = await LyricsResolver.getLyrics(activeTrack.title, activeTrack.artist);
        if (active && lyricsRes?.lines) setLyrics(lyricsRes.lines);
      } catch (e) {} finally {
        if (active) setLoadingLyrics(false);
      }
    };
    fetchMeta();
    return () => { active = false; };
  }, [activeTrack]);

  const activeLyricIndex = useMemo(() => {
    if (!lyrics.length) return -1;
    return lyrics.findIndex((l, i) => {
      const next = lyrics[i + 1];
      return progress.position >= l.time && (!next || progress.position < next.time);
    });
  }, [progress.position, lyrics]);

  useEffect(() => {
    if (showLyrics && activeLyricIndex !== -1) {
        // Offset for title/artist area (~100) + visualizer area (~80) + dynamic lyric offset
        const offset = 180 + (activeLyricIndex * 71);
        mainScrollRef.current?.scrollTo({ y: offset, animated: true });
    }
  }, [activeLyricIndex, showLyrics]);

  // Sleep Timer Logic
  useEffect(() => {
      if (sleepTimer !== null && sleepTimer > 0) {
          const timer = setTimeout(() => {
              if (sleepTimer === 1) {
                  TrackPlayer.pause();
                  setSleepTimer(null);
                  Alert.alert('Sleep Timer', 'Playback paused.');
              } else {
                  setSleepTimer(sleepTimer - 1);
              }
          }, 60000); 
          return () => clearTimeout(timer);
      }
  }, [sleepTimer]);

  const handleSeek = (percentage: number) => TrackPlayer.seekTo(percentage * progress.duration);

  const togglePlaybackSpeed = () => {
      const speeds = [1, 1.25, 1.5, 2, 0.75];
      const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
      setPlaybackSpeed(next);
      TrackPlayer.setRate(next);
  };

  const handleShare = async () => {
      try {
          await Share.share({
              message: `Listening to ${activeTrack.title} by ${activeTrack.artist || 'Unknown Artist'} on MovieFlix!`,
              url: activeTrack.thumbnail,
          });
      } catch (e) {}
  };

  const handleDownload = async () => {
      if (isDownloading) return;
      setIsDownloading(true);
      try {
          await downloadTrack(activeTrack);
          Alert.alert('Download Started', 'Track has been added to your offline library.');
      } catch (e) {
          Alert.alert('Download Error', 'Failed to start download. Please try again.');
      } finally {
          setIsDownloading(false);
      }
  };

  const changeQuality = () => {
      Alert.alert('Audio Quality', 'Bit-rate is automatically optimized for your connection.', [
          { text: 'OK', style: 'default' }
      ]);
  };

  const setTimer = () => {
      Alert.alert('Sleep Timer', 'Set pause timer', [
          { text: 'Off', onPress: () => setSleepTimer(null) },
          { text: '15 min', onPress: () => setSleepTimer(15) },
          { text: '30 min', onPress: () => setSleepTimer(30) },
          { text: '1 hour', onPress: () => setSleepTimer(60) },
      ]);
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };

  const currentIdx = queue ? queue.indexOf(activeTrack) : -1;
  const upNextQueue = queue ? queue.slice(currentIdx + 1) : [];
  const nextTrack = upNextQueue.length > 0 ? upNextQueue[0] : null;

  const renderBackdrop = useCallback((p: any) => <BottomSheetBackdrop {...p} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6} />, []);

  const handleTrackAction = (track: any) => {
    Alert.alert(
      track.title,
      track.artist || 'Track Options',
      [
        { text: 'Download', onPress: () => downloadTrack(track) },
        { text: 'Play Next', onPress: () => playNext(track) },
        { text: 'Add to Queue', onPress: () => addToQueue(track) },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const renderQueueItem = (item: any, index: number) => (
    <TouchableOpacity 
      key={item.id || item.videoId || index}
      style={styles.queueItem} 
      onPress={() => {
        if (activeTab === 'related') {
            // For related items, play it immediately and clear the previous up-next queue to start fresh discovery
            playTrack(item, [activeTrack, item]);
        } else {
            onTrackSelect?.(item);
        }
        bottomSheetRef.current?.close();
      }}
    >
      <Image source={{ uri: item.thumbnail }} style={styles.queueThumb} />
      <View style={styles.queueInfo}>
        <Text style={styles.queueTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.queueArtist} numberOfLines={1}>{item.artist || item.uploaderName}</Text>
      </View>
      <TouchableOpacity style={styles.queueAction} onPress={() => handleTrackAction(item)}>
        <Ionicons name="ellipsis-vertical" size={20} color="rgba(255,255,255,0.4)" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        
        {/* Immersive Background */}
        <View style={StyleSheet.absoluteFill}>
            <Image source={{ uri: activeTrack?.thumbnail }} style={StyleSheet.absoluteFill} blurRadius={10} />
            <LiquidGlass 
                cornerRadius={0} 
                tintOpacity={0.4} 
                tintColor="#000" 
                blurRadius={100} 
                style={StyleSheet.absoluteFill} 
            />
            <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFill} />
            <View style={[styles.bgCircle, { backgroundColor: `${accentColor}20`, top: -100, right: -100 }]} />
        </View>

        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <LiquidGlass cornerRadius={22} tintOpacity={0.15} style={styles.miniIconGlass}>
                <Ionicons name="chevron-down" size={28} color="#fff" />
              </LiquidGlass>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerStatus}>NOW PLAYING</Text>
            <Text style={styles.headerAlbum} numberOfLines={1}>{activeTrack?.artist || 'Music'}</Text>
          </View>
          <TouchableOpacity style={styles.headerBtn} onPress={handleShare}>
             <LiquidGlass cornerRadius={22} tintOpacity={0.15} style={styles.miniIconGlass}>
                <Ionicons name="share-outline" size={22} color="#fff" />
             </LiquidGlass>
          </TouchableOpacity>
        </View>

        <ScrollView 
          ref={mainScrollRef}
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false} 
          bounces={true}
        >
          <View style={styles.main}>
            {!showLyrics ? (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.playerView}>
                <Animated.View style={[styles.albumWrapper, albumAnimStyle]}>
                  <LiquidGlass cornerRadius={40} tintOpacity={0.1} breathingEffect style={styles.albumGlass}>
                    <Image source={{ uri: activeTrack?.thumbnail }} style={styles.albumArt} />
                    <LinearGradient colors={['rgba(255,255,255,0.1)', 'transparent']} style={StyleSheet.absoluteFill} />
                  </LiquidGlass>
                  {isLoading && <View style={styles.absLoader}><ActivityIndicator size="large" color={accentColor} /></View>}
                </Animated.View>
                
                <View style={styles.vizContainer}>
                    {[...Array(16)].map((_, i) => <VisualizerBar key={i} index={i} isPlaying={isPlaying} color={accentColor} />)}
                </View>

                <View style={styles.trackInfo}>
                  <View style={styles.titleRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title} numberOfLines={2}>{activeTrack?.title}</Text>
                        <View style={styles.artistRow}>
                            <Text style={styles.artist}>{activeTrack?.artist || 'Unknown Artist'}</Text>
                            <TouchableOpacity onPress={changeQuality} style={styles.qualityPill}>
                                <Text style={[styles.qualityText, { color: accentColor }]}>{activeFormat || 'AAC'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={styles.sideActions}>
                        <TouchableOpacity style={styles.sideBtn} onPress={handleDownload} disabled={isDownloading}>
                            <LiquidGlass cornerRadius={25} tintOpacity={0.1} style={styles.sideGlass}>
                                {isDownloading ? (
                                    <ActivityIndicator size="small" color={accentColor} />
                                ) : (
                                    <Ionicons name="cloud-download-outline" size={24} color="#fff" />
                                )}
                            </LiquidGlass>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sideBtn}>
                            <LiquidGlass cornerRadius={25} tintOpacity={0.1} style={styles.sideGlass}>
                                <Ionicons name="heart-outline" size={24} color="#fff" />
                            </LiquidGlass>
                        </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.lyricsView}>
                <LiquidGlass cornerRadius={32} tintOpacity={0.05} style={styles.lyricsGlass}>
                    {loadingLyrics ? (
                    <View style={styles.center}><ActivityIndicator size="large" color={accentColor} /></View>
                    ) : lyrics.length > 0 ? (
                    <View style={styles.lyricsList}>
                        {lyrics.map((item, index) => (
                            <Text 
                                key={index}
                                style={[styles.lyricLine, index === activeLyricIndex && { color: '#fff', fontSize: 32 }]}
                            >
                                {item.text}
                            </Text>
                        ))}
                    </View>
                    ) : (
                    <View style={styles.center}><Text style={styles.noLyrics}>Lyrics not available</Text></View>
                    )}
                </LiquidGlass>
              </Animated.View>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.progressSection}>
            <TouchableOpacity activeOpacity={1} style={styles.progressBarWrapper} onPress={(e) => handleSeek(e.nativeEvent.locationX / (width - 60))}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${(progress.position / progress.duration) * 100 || 0}%`, backgroundColor: accentColor }]} />
                <View style={[styles.progressKnob, { left: `${(progress.position / progress.duration) * 100 || 0}%`, backgroundColor: '#fff' }]} />
              </View>
            </TouchableOpacity>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(progress.position)}</Text>
              <Text style={styles.timeText}>{formatTime(progress.duration)}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity onPress={togglePlaybackSpeed}>
                <View style={styles.speedBadge}>
                    <Text style={styles.speedText}>{playbackSpeed}x</Text>
                </View>
            </TouchableOpacity>
            <View style={styles.centerControls}>
              <TouchableOpacity onPress={onPrev}><Ionicons name="play-skip-back" size={38} color="#fff" /></TouchableOpacity>
              <TouchableOpacity style={[styles.playBtn, { backgroundColor: '#fff' }]} onPress={togglePlay}>
                <Ionicons name={isPlaying ? "pause" : "play"} size={44} color="#000" style={{ marginLeft: isPlaying ? 0 : 4 }} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onNext}><Ionicons name="play-skip-forward" size={38} color="#fff" /></TouchableOpacity>
            </View>
            <TouchableOpacity onPress={setTimer}>
                <Ionicons name="timer-outline" size={26} color={sleepTimer ? accentColor : "rgba(255,255,255,0.4)"} />
                {sleepTimer && <View style={[styles.timerDot, { backgroundColor: accentColor }]} />}
            </TouchableOpacity>
          </View>

          <View style={styles.bottomActions}>
            <TouchableOpacity onPress={() => setShowLyrics(!showLyrics)} style={styles.actionBtn}>
                <LiquidGlass cornerRadius={16} tintOpacity={showLyrics ? 0.3 : 0.1} tintColor={showLyrics ? accentColor : undefined} style={styles.actionGlass}>
                    <MaterialCommunityIcons name="microphone-variant" size={22} color={showLyrics ? "#fff" : "rgba(255,255,255,0.6)"} />
                </LiquidGlass>
                <Text style={[styles.actionText, showLyrics && { color: '#fff' }]}>Lyrics</Text>
            </TouchableOpacity>
            
            {nextTrack && (
              <View style={styles.nextPreview}>
                <Text style={styles.nextLabel}>UP NEXT</Text>
                <Text style={styles.nextTitle} numberOfLines={1}>{nextTrack.title}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.actionBtn} onPress={() => bottomSheetRef.current?.expand()}>
                <LiquidGlass cornerRadius={16} tintOpacity={0.1} style={styles.actionGlass}>
                    <Ionicons name="list" size={22} color="rgba(255,255,255,0.6)" />
                </LiquidGlass>
                <Text style={styles.actionText}>Queue</Text>
            </TouchableOpacity>
          </View>
        </View>

        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          backgroundStyle={styles.bottomSheet}
          handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)', width: 40 }}
        >
          <View style={styles.sheetContent}>
            <View style={styles.sheetHeader}>
                <View style={styles.tabContainer}>
                    <TouchableOpacity onPress={() => setActiveTab('next')} style={[styles.tab, activeTab === 'next' && { borderBottomColor: accentColor }]}>
                        <Text style={[styles.tabText, activeTab === 'next' && styles.activeTabText]}>Up Next</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setActiveTab('related')} style={[styles.tab, activeTab === 'related' && { borderBottomColor: accentColor }]}>
                        <Text style={[styles.tabText, activeTab === 'related' && styles.activeTabText]}>Related</Text>
                    </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => bottomSheetRef.current?.close()} style={styles.closeSheetBtn}>
                    <Ionicons name="close-circle" size={28} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
            </View>
            
            <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 60 }}>
              {(activeTab === 'next' ? upNextQueue : relatedTracks).map((item, index) => renderQueueItem(item, index))}
              {(activeTab === 'next' ? upNextQueue : relatedTracks).length === 0 && (
                <View style={styles.emptySheet}>
                  <Ionicons name={activeTab === 'next' ? "list-outline" : "sparkles-outline"} size={48} color="rgba(255,255,255,0.1)" />
                  <Text style={styles.emptySheetText}>{activeTab === 'next' ? 'End of Queue' : 'No related songs found'}</Text>
                </View>
              )}
            </BottomSheetScrollView>
          </View>
        </BottomSheet>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgCircle: { position: 'absolute', width: 300, height: 300, borderRadius: 150, filter: 'blur(80px)' as any },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, paddingTop: 60, height: 120, zIndex: 10 },
  headerBtn: { width: 44, height: 44 },
  miniIconGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, alignItems: 'center' },
  headerStatus: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  headerAlbum: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 4 },
  scrollContent: { paddingTop: 20, paddingBottom: 280 },
  main: { flex: 1, paddingHorizontal: 30 },
  playerView: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  albumWrapper: { width: width - 60, height: width - 60, borderRadius: 40, elevation: 40, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 20 } },
  albumGlass: { flex: 1, overflow: 'hidden' },
  albumArt: { width: '100%', height: '100%', resizeMode: 'cover' },
  absLoader: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', borderRadius: 40 },
  vizContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 50, gap: 4, marginTop: 30 },
  vizBar: { width: 4, borderRadius: 2, minHeight: 4 },
  trackInfo: { marginTop: 30, width: '100%' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  artistRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 12 },
  artist: { color: 'rgba(255,255,255,0.6)', fontSize: 20, fontWeight: '700' },
  qualityPill: { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  qualityText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  sideActions: { flexDirection: 'row', gap: 12 },
  sideBtn: { width: 48, height: 48 },
  sideGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  likeBtn: { width: 50, height: 50, marginLeft: 20 },
  likeGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lyricsView: { flex: 1, marginTop: 20 },
  lyricsGlass: { flex: 1, padding: 25, minHeight: height * 0.6 },
  lyricsList: { paddingVertical: 10 },
  lyricLine: { color: 'rgba(255,255,255,0.25)', fontSize: 26, fontWeight: '800', marginBottom: 35, lineHeight: 38 },
  noLyrics: { color: 'rgba(255,255,255,0.4)', fontSize: 18, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', bottom: 0, width: '100%', paddingBottom: 50, paddingHorizontal: 30 },
  progressSection: { marginBottom: 35 },
  progressBarWrapper: { paddingVertical: 10 },
  progressBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, position: 'relative' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressKnob: { width: 14, height: 14, borderRadius: 7, position: 'absolute', top: -4, marginLeft: -7, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  timeText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '800' },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10 },
  centerControls: { flexDirection: 'row', alignItems: 'center', gap: 35 },
  playBtn: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 15, elevation: 15 },
  speedBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  speedText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  timerDot: { width: 6, height: 6, borderRadius: 3, position: 'absolute', top: -2, right: -2 },
  bottomActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 45 },
  actionBtn: { alignItems: 'center', gap: 8 },
  actionGlass: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  nextPreview: { flex: 1, marginHorizontal: 25, alignItems: 'center' },
  nextLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  nextTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '700', marginTop: 4 },
  bottomSheet: { backgroundColor: 'rgba(15, 15, 20, 0.98)', borderTopLeftRadius: 40, borderTopRightRadius: 40 },
  sheetContent: { flex: 1 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 20 },
  tabContainer: { flexDirection: 'row', paddingHorizontal: 30, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', marginBottom: 20, flex: 1 },
  tab: { paddingVertical: 20, marginRight: 40, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabText: { color: 'rgba(255,255,255,0.35)', fontSize: 18, fontWeight: '800' },
  activeTabText: { color: '#fff' },
  closeSheetBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -15 },
  queueItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 30, paddingVertical: 12 },
  queueThumb: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#111' },
  queueInfo: { flex: 1, marginLeft: 18 },
  queueTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  queueArtist: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 3, fontWeight: '600' },
  queueAction: { padding: 12 },
  emptySheet: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptySheetText: { color: 'rgba(255,255,255,0.2)', fontSize: 18, fontWeight: '700', marginTop: 20 },
});

export default MusicPlayerModal;
