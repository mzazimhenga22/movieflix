import { Ionicons } from '@expo/vector-icons';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    ImageBackground,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View
} from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { LyricsResolver } from '../src/pstream/LyricsResolver';
import { usePStream } from '../src/pstream/usePStream';
import { useTvAccent } from './components/TvAccentContext';
import { TvFocusable } from './components/TvSpatialNavigation';

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
    const videoRef = useRef<Video>(null);
    const [mode, setMode] = useState<PlayerMode>('video');
    const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [streamData, setStreamData] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Lyrics State
    const [lyrics, setLyrics] = useState<LyricLine[]>([]);
    const [showLyrics, setShowLyrics] = useState(false);
    const [currentLyricIndex, setCurrentLyricIndex] = useState(0);

    // Queue State
    const [queue, setQueue] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    const activeTrack = queue[currentIndex] || { videoId, title, artist, thumbnail };

    // Animation
    const rotateAnim = useSharedValue(0);

    // Init Queue
    useEffect(() => {
        if (videoId) {
            setQueue([{ videoId, title, artist, thumbnail }]);
            setCurrentIndex(0);
        }
    }, [videoId]);

    // Handle Next
    const handleNext = () => {
        if (currentIndex < queue.length - 1) {
            setCurrentIndex(prev => prev + 1);
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
                // Fetch Lyrics in parallel
                LyricsResolver.getLyrics(String(activeTrack.title), String(activeTrack.artist))
                    .then(res => {
                        if (active && res?.lines) setLyrics(res.lines);
                    })
                    .catch(() => { });

                console.log(`[MusicPlayer] Fetching ${mode} stream for:`, vidId);
                const stream: any = await getMusicStream(vidId, mode);

                if (active) {
                    if (stream?.uri) {
                        console.log('[MusicPlayer] Stream ready:', stream.uri);
                        setStreamData(stream);
                        // Append related to queue
                        if (stream.related && stream.related.length > 0) {
                            setQueue(prev => {
                                const newItems = stream.related.map((r: any) => ({
                                    videoId: r.videoId,
                                    title: r.title,
                                    artist: r.artist,
                                    thumbnail: r.thumbnail
                                }));
                                // Filter dupes
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
                console.error('[MusicPlayer] Error fetching stream:', e);
                if (active) {
                    setError('Error loading stream');
                    setLoading(false);
                }
            }
        };

        fetchStream();
        return () => { active = false; };
    }, [activeTrack, mode]);

    // Format Time
    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // Vinyl Rotation
    useEffect(() => {
        if (status?.isLoaded && status.isPlaying && mode === 'audio') {
            rotateAnim.value = withRepeat(
                withTiming(360, { duration: 3000, easing: Easing.linear }),
                -1,
                false
            );
        } else {
            cancelAnimation(rotateAnim);
        }
    }, [status, mode]);

    const vinylStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotateAnim.value}deg` }]
    }));

    // Lyrics Auto-Scroll
    useEffect(() => {
        if (!status?.isLoaded || !lyrics.length) return;
        const currentTime = status.positionMillis / 1000;

        const index = lyrics.findIndex((line, i) => {
            const nextLine = lyrics[i + 1];
            return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
        });

        if (index !== -1 && index !== currentLyricIndex) {
            setCurrentLyricIndex(index);
        }
    }, [status, lyrics]);

    const handlePlayPause = async () => {
        if (!videoRef.current || !status?.isLoaded) return;
        if (status.isPlaying) {
            await videoRef.current.pauseAsync();
        } else {
            await videoRef.current.playAsync();
        }
    };

    const handleGoBack = () => {
        if (showLyrics) {
            setShowLyrics(false);
        } else {
            router.back();
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Background */}
            <ImageBackground
                source={{ uri: String(thumbnail || 'https://image.tmdb.org/t/p/w500/1E5baAaEse26fej7uHcjOgEE2t2.jpg') }}
                style={StyleSheet.absoluteFill}
                blurRadius={80}
            >
                <View style={styles.overlay} />
            </ImageBackground>

            {/* Top Bar with Back Button */}
            <View style={styles.topBar}>
                <TvFocusable
                    style={({ focused }: any) => [styles.backBtn, focused && styles.btnFocused]}
                    onPress={handleGoBack}
                >
                    <Ionicons name="arrow-back" size={28} color="#fff" />
                    <Text style={styles.backBtnText}>Back</Text>
                </TvFocusable>
            </View>

            {/* Video Player (Hidden in Audio Mode) */}
            {streamData && (
                <Video
                    ref={videoRef}
                    source={{
                        uri: streamData.uri,
                        headers: streamData.headers
                    }}
                    style={mode === 'video' ? styles.video : styles.hiddenVideo}
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay
                    isLooping={false}
                    progressUpdateIntervalMillis={100}
                    onPlaybackStatusUpdate={(s) => {
                        setStatus(s);
                        if (s.didJustFinish) {
                            handleNext();
                        }
                    }}
                    onError={(e) => console.error("Video Error:", e)}
                />
            )}

            {/* Main Layout */}
            <View style={styles.content}>

                {/* Visualizer / Artwork Area */}
                <View style={styles.visualArea}>
                    {mode === 'audio' || !streamData ? (
                        <Animated.View style={[styles.vinylContainer, vinylStyle]}>
                            <Image
                                source={{ uri: String(thumbnail) }}
                                style={styles.vinylArt}
                            />
                            <View style={styles.vinylHole} />
                        </Animated.View>
                    ) : null}

                    {/* Lyrics Overlay */}
                    {showLyrics && (
                        <View style={styles.lyricsOverlay}>
                            <ScrollView
                                contentContainerStyle={styles.lyricsScroll}
                                showsVerticalScrollIndicator={false}
                            >
                                {lyrics.map((line, i) => (
                                    <Text
                                        key={i}
                                        style={[
                                            styles.lyricLine,
                                            i === currentLyricIndex && styles.activeLyric,
                                            i === currentLyricIndex && { color: primaryColor }
                                        ]}
                                    >
                                        {line.text}
                                    </Text>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>

                {/* Info & Controls */}
                <View style={styles.controlsArea}>
                    <Text style={styles.title} numberOfLines={2}>{activeTrack.title}</Text>
                    <Text style={styles.artist}>{activeTrack.artist}</Text>

                    {/* Progress Bar */}
                    <View style={styles.progressContainer}>
                        <View style={styles.progressBarBg}>
                            <View style={[
                                styles.progressBarFill,
                                {
                                    width: status?.isLoaded ? `${(status.positionMillis / status.durationMillis!) * 100}%` : '0%',
                                    backgroundColor: primaryColor
                                }
                            ]} />
                        </View>
                        <View style={styles.timeRow}>
                            <Text style={styles.timeText}>
                                {status?.isLoaded ? formatTime(status.positionMillis) : '0:00'}
                            </Text>
                            <Text style={styles.timeText}>
                                {status?.isLoaded ? formatTime(status.durationMillis!) : '0:00'}
                            </Text>
                        </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.buttonRow}>
                        <TvFocusable
                            style={({ focused }: any) => [styles.modeBtn, focused && styles.btnFocused]}
                            onPress={() => setMode(m => m === 'video' ? 'audio' : 'video')}
                        >
                            <Ionicons
                                name={mode === 'video' ? "musical-notes" : "videocam"}
                                size={24}
                                color="#fff"
                            />
                            <Text style={styles.btnText}>
                                {mode === 'video' ? 'Switch to Audio' : 'Switch to Video'}
                            </Text>
                        </TvFocusable>

                        <TvFocusable
                            style={({ focused }: any) => [styles.modeBtn, focused && styles.btnFocused]}
                            onPress={handlePrev}
                        >
                            <Ionicons name="play-skip-back" size={24} color="#fff" />
                        </TvFocusable>

                        <TvFocusable
                            style={({ focused }: any) => [styles.playBtn, { backgroundColor: primaryColor }, focused && styles.playBtnFocused]}
                            onPress={handlePlayPause}
                            tvPreferredFocus
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Ionicons
                                    name={status?.isLoaded && status.isPlaying ? "pause" : "play"}
                                    size={32}
                                    color="#fff"
                                />
                            )}
                        </TvFocusable>

                        <TvFocusable
                            style={({ focused }: any) => [styles.modeBtn, focused && styles.btnFocused]}
                            onPress={handleNext}
                        >
                            <Ionicons name="play-skip-forward" size={24} color="#fff" />
                        </TvFocusable>

                        {lyrics.length > 0 && (
                            <TvFocusable
                                style={({ focused }: any) => [styles.modeBtn, focused && styles.btnFocused]}
                                onPress={() => setShowLyrics(!showLyrics)}
                            >
                                <Ionicons name="mic" size={24} color={showLyrics ? primaryColor : "#fff"} />
                                <Text style={styles.btnText}>Lyrics</Text>
                            </TvFocusable>
                        )}
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    topBar: {
        position: 'absolute',
        top: 40,
        left: 40,
        zIndex: 100,
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    backBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    video: {
        width: '100%',
        height: '100%',
        position: 'absolute',
    },
    hiddenVideo: {
        width: 1,
        height: 1,
        opacity: 0,
    },
    content: {
        flex: 1,
        flexDirection: 'row',
        padding: 50,
    },
    visualArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    controlsArea: {
        flex: 0.8,
        justifyContent: 'center',
        paddingLeft: 50,
    },
    // Vinyl Styles
    vinylContainer: {
        width: 400,
        height: 400,
        borderRadius: 200,
        backgroundColor: '#111',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 10,
        borderColor: '#222',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    vinylArt: {
        width: 250,
        height: 250,
        borderRadius: 125,
    },
    vinylHole: {
        position: 'absolute',
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#000',
        borderWidth: 2,
        borderColor: '#333',
    },
    // INFO
    title: {
        color: '#fff',
        fontSize: 36,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    artist: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 24,
        marginBottom: 40,
    },
    // Progress
    progressContainer: {
        marginBottom: 40,
    },
    progressBarBg: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 10,
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    timeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    timeText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontWeight: '600',
    },
    // Buttons
    buttonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 20,
    },
    playBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    playBtnFocused: {
        transform: [{ scale: 1.1 }],
        borderWidth: 3,
        borderColor: '#fff',
    },
    modeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    btnFocused: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        transform: [{ scale: 1.05 }],
        borderWidth: 2,
        borderColor: '#fff',
    },
    btnText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
    // Lyrics
    lyricsOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderRadius: 24,
        padding: 30,
        justifyContent: 'center',
    },
    lyricsScroll: {
        paddingVertical: 50,
        alignItems: 'center',
    },
    lyricLine: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 24,
        marginVertical: 10,
        textAlign: 'center',
        fontWeight: '600',
    },
    activeLyric: {
        fontSize: 28,
        fontWeight: 'bold',
        opacity: 1,
        transform: [{ scale: 1.05 }],
    },
});
