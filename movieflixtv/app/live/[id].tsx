import { listenToLiveComments, listenToLiveStream } from '@/lib/liveService';
import type { LiveStream, LiveStreamComment } from '@/lib/liveTypes';
import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Platform,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTvAccent } from '../components/TvAccentContext';
import { TvFocusable } from '../components/TvSpatialNavigation';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function TvLiveRoomScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const { accentColor } = useTvAccent();
    const accent = accentColor || '#e50914';

    const streamId = typeof params.id === 'string' ? params.id : '';

    const [stream, setStream] = useState<LiveStream | null>(null);
    const [comments, setComments] = useState<LiveStreamComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showComments, setShowComments] = useState(true);

    const videoRef = useRef<Video>(null);
    const commentsListRef = useRef<FlatList>(null);

    // Pulse animation for live indicator
    const pulseAnim = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [pulseAnim]);

    // Subscribe to stream updates
    useEffect(() => {
        if (!streamId) {
            setError('Invalid stream ID');
            setLoading(false);
            return;
        }

        const unsubStream = listenToLiveStream(streamId, (s: LiveStream | null) => {
            if (!s) {
                setError('Stream not found');
                setLoading(false);
                return;
            }
            if (s.status === 'ended') {
                setError('This live stream has ended');
            }
            setStream(s);
            setLoading(false);
        });

        const unsubComments = listenToLiveComments(streamId, (c: LiveStreamComment[]) => {
            setComments(c);
        }, { limitCount: 50 });

        return () => {
            unsubStream();
            unsubComments();
        };
    }, [streamId]);

    // Auto-scroll comments
    useEffect(() => {
        if (comments.length > 0) {
            setTimeout(() => {
                commentsListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [comments.length]);

    const handleBack = () => {
        router.back();
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <LinearGradient colors={['#1a1a2e', '#0a0a0f']} style={StyleSheet.absoluteFill} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#ff4b4b" />
                    <Text style={styles.loadingText}>Connecting to live stream...</Text>
                </View>
            </View>
        );
    }

    if (error || !stream) {
        return (
            <View style={styles.container}>
                <LinearGradient colors={['#1a1a2e', '#0a0a0f']} style={StyleSheet.absoluteFill} />
                <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle-outline" size={72} color="#ff4b4b" />
                    <Text style={styles.errorTitle}>{error || 'Stream Unavailable'}</Text>
                    <Text style={styles.errorSubtitle}>
                        {stream?.status === 'ended'
                            ? 'The host has ended this live stream'
                            : 'Unable to load the live stream'}
                    </Text>
                    <TvFocusable
                        onPress={handleBack}
                        isTVSelectable
                        tvPreferredFocus
                        style={styles.backButtonPressable}
                    >
                        <View style={[styles.backButton, { backgroundColor: accent }]}>
                            <Ionicons name="arrow-back" size={20} color="#fff" />
                            <Text style={styles.backButtonText}>Go Back</Text>
                        </View>
                    </TvFocusable>
                </View>
            </View>
        );
    }

    const hasHlsStream = Boolean(stream.playbackHlsUrl);

    return (
        <View style={styles.container}>
            {/* Video Player */}
            {hasHlsStream ? (
                <Video
                    ref={videoRef}
                    source={{ uri: stream.playbackHlsUrl! }}
                    style={styles.video}
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay
                    isMuted={false}
                    isLooping={false}
                    useNativeControls={false}
                />
            ) : (
                <View style={styles.noStreamContainer}>
                    <LinearGradient
                        colors={['#2a2a3a', '#1a1a2a']}
                        style={StyleSheet.absoluteFill}
                    />
                    <Ionicons name="videocam-off-outline" size={64} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.noStreamText}>
                        Direct video stream not available
                    </Text>
                    <Text style={styles.noStreamHint}>
                        Watch this stream on the mobile app for the best experience
                    </Text>
                </View>
            )}

            {/* Top gradient */}
            <LinearGradient
                colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.4)', 'transparent']}
                style={styles.topGradient}
                pointerEvents="none"
            />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
                <TvFocusable
                    onPress={handleBack}
                    isTVSelectable
                    tvPreferredFocus
                    style={styles.headerBackPressable}
                >
                    <View style={styles.headerBack}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </View>
                </TvFocusable>

                <View style={styles.liveIndicator}>
                    <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
                    <Text style={styles.liveText}>LIVE</Text>
                    <Text style={styles.viewerCount}>
                        <Ionicons name="eye" size={14} color="#fff" /> {stream.viewersCount}
                    </Text>
                </View>
            </View>

            {/* Bottom gradient */}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
                style={styles.bottomGradient}
                pointerEvents="none"
            />

            {/* Stream info and comments */}
            <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 20 }]}>
                {/* Host info */}
                <View style={styles.hostInfo}>
                    {stream.coverUrl ? (
                        <Image source={{ uri: stream.coverUrl }} style={styles.hostAvatar} />
                    ) : (
                        <View style={[styles.hostAvatar, styles.hostAvatarPlaceholder]}>
                            <Ionicons name="person" size={24} color="#fff" />
                        </View>
                    )}
                    <View style={styles.hostDetails}>
                        <Text style={styles.streamTitle} numberOfLines={2}>
                            {stream.title}
                        </Text>
                        <Text style={styles.hostName}>
                            {stream.hostName ?? 'Live Host'}
                        </Text>
                    </View>
                </View>

                {/* Comments */}
                {showComments && comments.length > 0 && (
                    <View style={styles.commentsContainer}>
                        <FlatList
                            ref={commentsListRef}
                            data={comments.slice(-10)}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <View style={styles.commentItem}>
                                    {Platform.OS === 'ios' || Platform.OS === 'web' ? (
                                        <BlurView intensity={30} tint="dark" style={styles.commentBlur}>
                                            <Text style={styles.commentUser}>{item.username ?? 'Viewer'}</Text>
                                            <Text style={styles.commentText}>{item.text}</Text>
                                        </BlurView>
                                    ) : (
                                        <View style={[styles.commentBlur, styles.commentBlurFallback]}>
                                            <Text style={styles.commentUser}>{item.username ?? 'Viewer'}</Text>
                                            <Text style={styles.commentText}>{item.text}</Text>
                                        </View>
                                    )}
                                </View>
                            )}
                            showsVerticalScrollIndicator={false}
                            style={styles.commentsList}
                        />
                    </View>
                )}

                {/* Controls hint */}
                <View style={styles.controlsHint}>
                    <Text style={styles.hintText}>Press Back to exit</Text>
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
    video: {
        ...StyleSheet.absoluteFillObject,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
    },
    loadingText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 18,
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        paddingHorizontal: 40,
    },
    errorTitle: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '700',
        textAlign: 'center',
    },
    errorSubtitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 20,
    },
    backButtonPressable: {
        borderRadius: 12,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
    },
    backButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    noStreamContainer: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    noStreamText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 20,
        fontWeight: '600',
    },
    noStreamHint: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        textAlign: 'center',
        maxWidth: 400,
    },
    topGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 180,
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 40,
    },
    headerBackPressable: {
        borderRadius: 24,
    },
    headerBack: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    liveIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    liveDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ff4b4b',
    },
    liveText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '800',
    },
    viewerCount: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        marginLeft: 8,
    },
    bottomGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: SCREEN_HEIGHT * 0.5,
    },
    bottomContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 40,
    },
    hostInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 20,
    },
    hostAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 3,
        borderColor: '#ff4b4b',
    },
    hostAvatarPlaceholder: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    hostDetails: {
        flex: 1,
    },
    streamTitle: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '800',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    hostName: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 16,
        marginTop: 4,
    },
    commentsContainer: {
        maxHeight: 200,
        marginBottom: 16,
    },
    commentsList: {
        flex: 1,
    },
    commentItem: {
        marginBottom: 8,
        maxWidth: 400,
    },
    commentBlur: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 16,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    commentBlurFallback: {
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    commentUser: {
        color: '#ff4b4b',
        fontSize: 14,
        fontWeight: '700',
    },
    commentText: {
        color: '#fff',
        fontSize: 14,
        flex: 1,
    },
    controlsHint: {
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    hintText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        textAlign: 'center',
    },
});
