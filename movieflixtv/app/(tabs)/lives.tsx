import useLiveStreams from '@/hooks/useLiveStreams';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState, useRef, useEffect } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
    Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTvAccent } from '../components/TvAccentContext';
import TvGlassPanel from '../components/TvGlassPanel';
import { TV_SIDE_NAV_WIDTH } from '../components/TvSideNav';
import { TvFocusable } from '../components/TvSpatialNavigation';
import { LiquidLiveBadge, LiquidGlassCard, LiquidShimmer } from '../../components/app-components/LiquidNativeViews';
import NativeTvGlowView from '../components/NativeTvGlowView';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = 320;
const CARD_HEIGHT = 200;

export default function TvLivesScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { accentColor } = useTvAccent();
    const accent = accentColor || '#e50914';

    const [liveStreams, loaded] = useLiveStreams();
    const [focusedId, setFocusedId] = useState<string | null>(null);

    const handleWatchStream = (streamId: string) => {
        router.push(`/live/${streamId}` as any);
    };

    const isLoading = !loaded;

    return (
        <View style={styles.container}>
            <View style={StyleSheet.absoluteFill}>
                <LinearGradient
                    colors={['rgba(255, 75, 75, 0.08)', 'rgba(0,0,0,0)']}
                    style={styles.headerGradient}
                    pointerEvents="none"
                />
                <NativeTvGlowView color="#ff4b4b" style={StyleSheet.absoluteFill} />
            </View>

            <TvGlassPanel accent={accent} native style={styles.glassPanel}>
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
                >
                    {/* Header */}
                    <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
                        <View style={styles.headerLeft}>
                            <View style={styles.liveIconContainer}>
                                <View style={styles.liveDot} />
                                <Ionicons name="radio" size={28} color="#ff4b4b" />
                            </View>
                            <Text style={styles.title}>Live Now</Text>
                        </View>

                        <TvGlassPanel accent={accent} native compact borderRadius={16} glowIntensity="subtle" style={styles.headerBadge}>
                            <Text style={styles.headerBadgeText}>
                                {liveStreams.length} {liveStreams.length === 1 ? 'Stream' : 'Streams'}
                            </Text>
                        </TvGlassPanel>
                    </View>

                    {/* Loading state */}
                    {isLoading && (
                        <View style={styles.loadingState}>
                            <ActivityIndicator size="large" color="#ff4b4b" />
                            <Text style={styles.loadingText}>Finding live streams...</Text>
                        </View>
                    )}

                    {/* Empty state */}
                    {!isLoading && liveStreams.length === 0 && (
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIconContainer}>
                                <Ionicons name="radio-outline" size={72} color="rgba(255,75,75,0.5)" />
                                <View style={styles.emptyPulse} />
                            </View>
                            <Text style={styles.emptyTitle}>No Live Streams</Text>
                            <Text style={styles.emptySubtitle}>
                                Live streams created on the mobile app will appear here.
                            </Text>
                            <Text style={styles.emptyHint}>
                                Open MovieFlix on your phone to go live!
                            </Text>
                        </View>
                    )}

                    {/* Streams grid */}
                    {!isLoading && liveStreams.length > 0 && (
                        <View style={styles.grid}>
                            {liveStreams.map((stream, index) => {
                                const isFocused = focusedId === stream.id;
                                const thumbnailSource = stream.coverUrl
                                    ? { uri: stream.coverUrl }
                                    : null;

                                return (
                                    <TvFocusable
                                        key={stream.id}
                                        onFocus={() => setFocusedId(stream.id)}
                                        onBlur={() => setFocusedId(null)}
                                        onPress={() => handleWatchStream(stream.id)}
                                        isTVSelectable
                                        tvPreferredFocus={index === 0}
                                        style={styles.cardPressable}
                                    >
                                        <LiquidGlassCard
                                            style={[
                                                styles.card,
                                                isFocused && { borderColor: accent, transform: [{ scale: 1.02 }] }
                                            ]}
                                            glowColor={isFocused ? accent : undefined}
                                        >
                                            {/* Thumbnail */}
                                            <View style={styles.thumbnailContainer}>
                                                {thumbnailSource ? (
                                                    <Image source={thumbnailSource} style={styles.thumbnail} />
                                                ) : (
                                                    <LinearGradient
                                                        colors={['#2a2a3a', '#1a1a2a']}
                                                        style={styles.thumbnailPlaceholder}
                                                    >
                                                        <Ionicons name="videocam" size={48} color="rgba(255,255,255,0.3)" />
                                                    </LinearGradient>
                                                )}

                                                {/* Native Live indicator */}
                                                <LiquidLiveBadge
                                                    viewerCount={Math.max(stream.viewersCount, 0)}
                                                    style={styles.liveBadge}
                                                />

                                                {/* Focus overlay */}
                                                {isFocused && (
                                                    <View style={styles.focusOverlay}>
                                                        <View style={[styles.playButton, { backgroundColor: accent }]}>
                                                            <Ionicons name="play" size={32} color="#fff" />
                                                        </View>
                                                    </View>
                                                )}
                                            </View>

                                            {/* Stream info */}
                                            <View style={styles.streamInfo}>
                                                <Text style={styles.streamTitle} numberOfLines={1}>
                                                    {stream.title}
                                                </Text>
                                                <Text style={styles.hostName} numberOfLines={1}>
                                                    {stream.hostName ?? 'Unknown host'}
                                                </Text>
                                            </View>
                                        </LiquidGlassCard>
                                    </TvFocusable>
                                );
                            })}
                        </View>
                    )}

                    {/* Footer hint */}
                    {!isLoading && liveStreams.length > 0 && (
                        <View style={styles.footerHint}>
                            <Ionicons name="information-circle-outline" size={18} color="rgba(255,255,255,0.4)" />
                            <Text style={styles.footerHintText}>
                                Use your remote to select a stream and start watching
                            </Text>
                        </View>
                    )}
                </ScrollView>
            </TvGlassPanel>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#05060f',
        marginLeft: TV_SIDE_NAV_WIDTH,
    },
    glassPanel: {
        flex: 1,
        margin: 16,
        marginLeft: 24,
    },
    headerGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 200,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    liveIconContainer: {
        position: 'relative',
    },
    liveDot: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ff4b4b',
    },
    title: {
        fontSize: 36,
        fontWeight: '800',
        color: '#fff',
    },
    headerBadge: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 16,
    },
    headerBadgeText: {
        color: '#ff4b4b',
        fontSize: 14,
        fontWeight: '700',
    },
    loadingState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 120,
        gap: 16,
    },
    loadingText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 16,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 100,
        gap: 16,
    },
    emptyIconContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    emptyPulse: {
        position: 'absolute',
        top: -20,
        left: -20,
        right: -20,
        bottom: -20,
        borderRadius: 60,
        borderWidth: 2,
        borderColor: 'rgba(255,75,75,0.2)',
    },
    emptyTitle: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '700',
    },
    emptySubtitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 16,
        textAlign: 'center',
        maxWidth: 400,
    },
    emptyHint: {
        color: '#ff4b4b',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 8,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 24,
    },
    cardPressable: {
        width: CARD_WIDTH,
    },
    card: {
        width: CARD_WIDTH,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    thumbnailContainer: {
        position: 'relative',
        width: '100%',
        height: CARD_HEIGHT,
    },
    thumbnail: {
        width: '100%',
        height: '100%',
        backgroundColor: '#2a2a2a',
    },
    thumbnailPlaceholder: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    liveBadge: {
        position: 'absolute',
        top: 12,
        left: 12,
    },
    focusOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    playButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    streamInfo: {
        padding: 16,
        gap: 4,
    },
    streamTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    hostName: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    footerHint: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 40,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    footerHintText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
    },
});
