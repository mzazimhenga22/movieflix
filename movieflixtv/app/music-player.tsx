import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View,
    Alert,
} from 'react-native';
import Animated, { 
    Easing, 
    cancelAnimation, 
    useAnimatedStyle, 
    useSharedValue, 
    withRepeat, 
    withTiming,
    FadeIn,
    FadeOut,
    withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { LyricsResolver } from '../src/pstream/LyricsResolver';
import { usePStream } from '../src/pstream/usePStream';
import { useTvAccent } from './components/TvAccentContext';
import { TvFocusable } from './components/TvSpatialNavigation';
import LiquidGlass from '../components/app-components/LiquidGlass';

const { width, height } = Dimensions.get('window');

type PlayerMode = 'video' | 'audio';

interface LyricLine {
    time: number;
    text: string;
}

export default function MusicPlayer() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { videoId, title, artist, thumbnail } = params;
    const { accentColor: primaryColor } = useTvAccent();
    const { getMusicStream } = usePStream();

    // Player State
    const [mode, setMode] = useState<PlayerMode>('video');
    const [loading, setLoading] = useState(true);
    const [streamData, setStreamData] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [playerState, setPlayerState] = useState({
        isPlaying: false,
        position: 0,
        duration: 0,
    });

    const player = useVideoPlayer(streamData?.uri || null, (p) => {
        p.loop = false;
    });

    useEffect(() => {
        const subPlaying = player.addListener('playingChange', (playing) => {
            setPlayerState(s => ({ ...s, isPlaying: playing }));
        });
        const subTime = player.addListener('timeUpdate', (data) => {
            setPlayerState(s => ({
                ...s,
                position: data.currentTime * 1000,
                duration: data.duration * 1000,
            }));
        });
        const subStatus = player.addListener('statusChange', (status) => {
            if (status === 'ready') setLoading(false);
            if (status === 'loading') setLoading(true);
        });
        const subEnd = player.addListener('playToEnd', () => {
            handleNext();
        });
        return () => {
            subPlaying.remove();
            subTime.remove();
            subStatus.remove();
            subEnd.remove();
        };
    }, [player]);

    // Lyrics State
    const [lyrics, setLyrics] = useState<LyricLine[]>([]);
    const [showLyrics, setShowLyrics] = useState(false);
    const [currentLyricIndex, setCurrentLyricIndex] = useState(0);
    const lyricsScrollRef = useRef<ScrollView>(null);

    // Queue State
    const [queue, setQueue] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    const activeTrack = queue[currentIndex] || { videoId, title, artist, thumbnail };

    // Animations
    const rotateAnim = useSharedValue(0);
    const scaleAnim = useSharedValue(1);

    // Init Queue
    useEffect(() => {
        if (videoId) {
            setQueue([{ videoId, title, artist, thumbnail }]);
            setCurrentIndex(0);
        }
    }, [videoId]);

    // Handle Next/Prev
    const handleNext = () => {
        if (currentIndex < queue.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            console.log('[TV Player] Queue ended');
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    // Load Stream
    useEffect(() => {
        let active = true;
        const fetchStream = async () => {
            const vidId = String(activeTrack.videoId || '');
            if (!vidId) return;
            setLoading(true);
            setError(null);
            setStreamData(null);

            try {
                LyricsResolver.getLyrics(String(activeTrack.title), String(activeTrack.artist))
                    .then(res => {
                        if (active && res?.lines) setLyrics(res.lines);
                    })
                    .catch(() => { });

                const stream: any = await getMusicStream(vidId, mode);

                if (active) {
                    if (stream?.uri) {
                        setStreamData(stream);
                        if (stream.related && stream.related.length > 0) {
                            setQueue(prev => {
                                const newItems = stream.related.map((r: any) => ({
                                    videoId: r.videoId,
                                    title: r.title,
                                    artist: r.artist,
                                    thumbnail: r.thumbnail
                                }));
                                const existingIds = new Set(prev.map(p => p.videoId));
                                const unique = newItems.filter((i: any) => !existingIds.has(i.videoId));
                                return [...prev, ...unique];
                            });
                        }
                    } else {
                        setError('Stream unavailable');
                    }
                    setLoading(false);
                }
            } catch (e) {
                console.error('[MusicPlayer] Error:', e);
                if (active) {
                    setError('Error loading stream');
                    setLoading(false);
                }
            }
        };

        fetchStream();
        return () => { active = false; };
    }, [activeTrack, mode]);

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // Vinyl & Scale Animations
    useEffect(() => {
        if (playerState.isPlaying) {
            scaleAnim.value = withSpring(1.05);
            if (mode === 'audio') {
                rotateAnim.value = withRepeat(
                    withTiming(360, { duration: 4000, easing: Easing.linear }),
                    -1,
                    false
                );
            }
        } else {
            scaleAnim.value = withSpring(0.95);
            cancelAnimation(rotateAnim);
        }
    }, [playerState.isPlaying, mode]);

    const vinylStyle = useAnimatedStyle(() => ({
        transform: [
            { rotate: `${rotateAnim.value}deg` },
            { scale: scaleAnim.value }
        ]
    }));

    // Lyrics Auto-Scroll (TV)
    useEffect(() => {
        if (!lyrics.length) return;
        const currentTime = playerState.position / 1000;
        const index = lyrics.findIndex((line, i) => {
            const nextLine = lyrics[i + 1];
            return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
        });

        if (index !== -1 && index !== currentLyricIndex) {
            setCurrentLyricIndex(index);
            // On TV we use standard ScrollView scrolling
            lyricsScrollRef.current?.scrollTo({ y: index * 80, animated: true });
        }
    }, [playerState.position, lyrics]);

    const handlePlayPause = () => {
        if (playerState.isPlaying) player.pause();
        else player.play();
    };

    const handleGoBack = () => {
        if (showLyrics) setShowLyrics(false);
        else router.back();
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" hidden />

            <View style={StyleSheet.absoluteFill}>
                <Image
                    source={{ uri: String(activeTrack.thumbnail || thumbnail) }}
                    style={StyleSheet.absoluteFill}
                />
                <LiquidGlass 
                    cornerRadius={0} 
                    tintOpacity={0.45} 
                    tintColor="#000" 
                    blurRadius={100} 
                    style={StyleSheet.absoluteFill} 
                />
                <LinearGradient 
                    colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.9)']} 
                    style={StyleSheet.absoluteFill} 
                />
                <View style={[styles.bgCircle, { backgroundColor: `${primaryColor}15`, top: -150, right: -150, width: 700, height: 700 }]} />
            </View>

            {streamData && mode === 'video' && (
                <Animated.View entering={FadeIn} exiting={FadeOut} style={StyleSheet.absoluteFill}>
                    <VideoView
                        player={player}
                        style={styles.video}
                        contentFit="cover"
                        showsPlaybackControls={false}
                    />
                    <LinearGradient 
                        colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.8)']} 
                        style={StyleSheet.absoluteFill} 
                    />
                </Animated.View>
            )}

            <View style={styles.topBar}>
                <TvFocusable
                    style={({ focused }: any) => [styles.backBtn, focused && { backgroundColor: primaryColor, borderColor: '#fff' }]}
                    onPress={handleGoBack}
                >
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                    <Text style={styles.backBtnText}>Back</Text>
                </TvFocusable>
                
                <View style={styles.nowPlayingBadge}>
                    <Text style={styles.nowPlayingText}>NOW PLAYING</Text>
                    {playerState.isPlaying && <ActivityIndicator size="small" color={primaryColor} style={{ marginLeft: 10 }} />}
                </View>
            </View>

            <View style={styles.content}>
                <View style={styles.visualArea}>
                    {mode === 'audio' || !streamData ? (
                        <Animated.View style={[styles.vinylWrapper, vinylStyle]}>
                            <LiquidGlass cornerRadius={250} tintOpacity={0.1} breathingEffect style={styles.vinylGlass}>
                                <Image
                                    source={{ uri: String(activeTrack.thumbnail || thumbnail) }}
                                    style={styles.vinylArt}
                                />
                                <View style={styles.vinylHole}>
                                    <View style={[styles.vinylHoleInner, { backgroundColor: primaryColor }]} />
                                </View>
                            </LiquidGlass>
                        </Animated.View>
                    ) : (
                        <View style={styles.lyricsToggleArea}>
                             {!showLyrics && (
                                 <TvFocusable 
                                    onPress={() => setShowLyrics(true)}
                                    style={({ focused }: any) => [styles.controlBtn, { width: 300, alignSelf: 'center' }, focused && styles.btnFocused]}
                                 >
                                     <MaterialCommunityIcons name="microphone-variant" size={28} color="#fff" />
                                     <Text style={styles.btnLabel}>SHOW LYRICS</Text>
                                 </TvFocusable>
                             )}
                        </View>
                    )}

                    {showLyrics && (
                        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.lyricsPanel}>
                            <LiquidGlass cornerRadius={40} tintOpacity={0.15} style={styles.lyricsGlass}>
                                <ScrollView
                                    ref={lyricsScrollRef}
                                    contentContainerStyle={styles.lyricsScroll}
                                    showsVerticalScrollIndicator={false}
                                    scrollEnabled={true} // Enabled for TV remote scroll
                                >
                                    {lyrics.map((line, i) => (
                                        <Text
                                            key={i}
                                            style={[
                                                styles.lyricLine,
                                                i === currentLyricIndex && { color: '#fff', fontSize: 42, opacity: 1, fontWeight: '900' }
                                            ]}
                                        >
                                            {line.text}
                                        </Text>
                                    ))}
                                    {!lyrics.length && <Text style={styles.lyricLine}>Lyrics not available</Text>}
                                </ScrollView>
                            </LiquidGlass>
                        </Animated.View>
                    )}
                </View>

                <View style={styles.controlsArea}>
                    <LiquidGlass cornerRadius={40} tintOpacity={0.1} style={styles.infoGlass}>
                        <View style={styles.trackMeta}>
                            <Text style={styles.title} numberOfLines={2}>{activeTrack.title}</Text>
                            <Text style={styles.artist}>{activeTrack.artist || 'Unknown Artist'}</Text>
                        </View>

                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBg}>
                                <View style={[
                                    styles.progressBarFill,
                                    {
                                        width: playerState.duration > 0 ? `${(playerState.position / playerState.duration) * 100}%` : '0%',
                                        backgroundColor: primaryColor
                                    }
                                ]} />
                            </View>
                            <View style={styles.timeRow}>
                                <Text style={styles.timeText}>{formatTime(playerState.position)}</Text>
                                <Text style={styles.timeText}>{formatTime(playerState.duration)}</Text>
                            </View>
                        </View>

                        <View style={styles.buttonRow}>
                            <TvFocusable
                                style={({ focused }: any) => [styles.controlBtn, focused && styles.btnFocused]}
                                onPress={() => setMode(m => m === 'video' ? 'audio' : 'video')}
                            >
                                <MaterialCommunityIcons 
                                    name={mode === 'video' ? "music-box-outline" : "video-outline"} 
                                    size={28} 
                                    color="#fff" 
                                />
                                <Text style={styles.btnLabel}>{mode === 'video' ? 'AUDIO' : 'VIDEO'}</Text>
                            </TvFocusable>

                            <TvFocusable
                                style={({ focused }: any) => [styles.controlBtn, focused && styles.btnFocused]}
                                onPress={handlePrev}
                            >
                                <Ionicons name="play-skip-back" size={28} color="#fff" />
                            </TvFocusable>

                            <TvFocusable
                                style={({ focused }: any) => [styles.playBtn, { backgroundColor: '#fff' }, focused && { transform: [{ scale: 1.15 }], borderWidth: 4, borderColor: primaryColor }]}
                                onPress={handlePlayPause}
                                tvPreferredFocus
                            >
                                {loading ? (
                                    <ActivityIndicator color="#000" />
                                ) : (
                                    <Ionicons
                                        name={playerState.isPlaying ? "pause" : "play"}
                                        size={48}
                                        color="#000"
                                        style={{ marginLeft: playerState.isPlaying ? 0 : 6 }}
                                    />
                                )}
                            </TvFocusable>

                            <TvFocusable
                                style={({ focused }: any) => [styles.controlBtn, focused && styles.btnFocused]}
                                onPress={handleNext}
                            >
                                <Ionicons name="play-skip-forward" size={28} color="#fff" />
                            </TvFocusable>

                            <TvFocusable
                                style={({ focused }: any) => [styles.controlBtn, focused && styles.btnFocused]}
                                onPress={() => setShowLyrics(!showLyrics)}
                            >
                                <MaterialCommunityIcons name="microphone-variant" size={28} color={showLyrics ? primaryColor : "#fff"} />
                                <Text style={[styles.btnLabel, showLyrics && { color: primaryColor }]}>LYRICS</Text>
                            </TvFocusable>
                        </View>
                    </LiquidGlass>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    bgCircle: { position: 'absolute', borderRadius: 400, filter: 'blur(100px)' as any },
    topBar: { position: 'absolute', top: 50, left: 60, right: 60, zIndex: 100, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
    backBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
    nowPlayingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 15 },
    nowPlayingText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
    video: { width: '100%', height: '100%' },
    content: { flex: 1, flexDirection: 'row', padding: 60, paddingTop: 140 },
    visualArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    controlsArea: { flex: 0.85, justifyContent: 'center', paddingLeft: 60 },
    infoGlass: { flex: 1, padding: 50, justifyContent: 'center' },
    vinylWrapper: { width: 500, height: 500, elevation: 50, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 40, shadowOffset: { width: 0, height: 20 } },
    vinylGlass: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
    vinylArt: { width: 480, height: 480, borderRadius: 240 },
    vinylHole: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    vinylHoleInner: { width: 12, height: 12, borderRadius: 6 },
    trackMeta: { marginBottom: 60 },
    title: { color: '#fff', fontSize: 52, fontWeight: '900', marginBottom: 15, letterSpacing: -1 },
    artist: { color: 'rgba(255,255,255,0.6)', fontSize: 28, fontWeight: '700' },
    progressContainer: { marginBottom: 60 },
    progressBarBg: { height: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden', marginBottom: 15 },
    progressBarFill: { height: '100%', borderRadius: 5 },
    timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
    timeText: { color: 'rgba(255,255,255,0.4)', fontSize: 18, fontWeight: '800' },
    buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 30 },
    playBtn: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 20 },
    controlBtn: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingHorizontal: 28, paddingVertical: 18, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 2, borderColor: 'transparent' },
    btnFocused: { backgroundColor: 'rgba(255,255,255,0.15)', transform: [{ scale: 1.1 }], borderColor: '#fff' },
    btnLabel: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
    lyricsToggleArea: { height: 100, justifyContent: 'center' },
    lyricsPanel: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
    lyricsGlass: { flex: 1, padding: 40, justifyContent: 'center' },
    lyricsScroll: { paddingVertical: height * 0.4, alignItems: 'center' },
    lyricLine: { color: 'rgba(255,255,255,0.2)', fontSize: 36, marginVertical: 20, textAlign: 'center', fontWeight: '800', width: '90%' },
});
