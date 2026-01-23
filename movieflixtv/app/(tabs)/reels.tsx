import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Easing,
    Image,
    Platform,
    StyleSheet,
    Text,
    TVEventHandler,
    useTVEventHandler,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTvAccent } from '../components/TvAccentContext';
import { TV_SIDE_NAV_WIDTH } from '../components/TvSideNav';
import { TvFocusable } from '../components/TvSpatialNavigation';

import { useTvReelsFeed } from '../../hooks/useTvReelsFeed';
import { browseClipCafeGenreMoviesLazy, searchClipCafe } from '../../src/providers/shortclips';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function TvReelsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { accentColor } = useTvAccent();
    const accent = accentColor || '#e50914';

    const { reels: initialReels, loading: fetching, error } = useTvReelsFeed();
    const [reels, setReels] = useState<any[]>([]);

    useEffect(() => {
        if (initialReels.length > 0 && reels.length === 0) {
            setReels(initialReels);
        }
    }, [initialReels]);

    const [buffering, setBuffering] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [muted, setMuted] = useState(false);
    
    // Track where focus is
    const [isGenreListFocused, setIsGenreListFocused] = useState(false);
    const [isVideoFocused, setIsVideoFocused] = useState(false);

    const videoRef = useRef<Video>(null);
    const indexRef = useRef(currentIndex);

    useEffect(() => {
        indexRef.current = currentIndex;
    }, [currentIndex]);

    /* -------------------------------------------------------------------------- */
    /*                                Genre Logic                                 */
    /* -------------------------------------------------------------------------- */
    const GENRES = ['For You', 'Action', 'Comedy', 'Horror', 'Sci-Fi', 'Thriller', 'Drama', 'Romance', 'Animation', 'Adventure'];
    const [selectedGenre, setSelectedGenre] = useState('For You');
    const [genreLoading, setGenreLoading] = useState(false);

    // Fetch Genre Clips
    useEffect(() => {
        if (selectedGenre === 'For You') {
            if (initialReels.length > 0) setReels(initialReels);
            return;
        }

        (async () => {
            setGenreLoading(true);
            try {
                const clips = await browseClipCafeGenreMoviesLazy(selectedGenre.toLowerCase(), 15);
                const mapped = clips.map((clip, idx) => ({
                    id: `g-${clip.slug}-${idx}-${Date.now()}`,
                    type: 'clip',
                    title: clip.title,
                    videoUrl: null,
                    meta: { title: clip.title, year: clip.year },
                    avatar: null,
                    username: 'MovieFlix',
                    description: `Browse ${selectedGenre}`,
                    likes: Math.floor(Math.random() * 500) + 10,
                }));

                setCurrentIndex(0);
                setReels(mapped);
            } catch (e) {
                console.log('Error fetching genre', e);
            } finally {
                setGenreLoading(false);
            }
        })();
    }, [selectedGenre, initialReels]);

    // Lazy Resolution Logic for TV
    const resolvedIndicesRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        resolvedIndicesRef.current.clear();
    }, [selectedGenre]);

    useEffect(() => {
        const resolveUrl = async (index: number) => {
            if (index < 0 || index >= reels.length) return;
            const item = reels[index];
            if (item.videoUrl || item.type !== 'clip') return;

            const itemKey = String(item.id);
            if (resolvedIndicesRef.current.has(itemKey)) return;
            resolvedIndicesRef.current.add(itemKey);

            const meta = item.meta;
            if (!meta || !meta.title) return;

            try {
                const result = await searchClipCafe(meta.title, meta.year);
                if (result && result.url) {
                    setReels(prevReels => {
                        const newReels = [...prevReels];
                        const idx = newReels.findIndex(r => String(r.id) === itemKey);
                        if (idx !== -1) {
                            newReels[idx] = { ...newReels[idx], videoUrl: result.url };
                        }
                        return newReels;
                    });
                }
            } catch (e) {
                console.warn(`[TvReels] Failed to resolve ${meta.title}`, e);
            }
        };

        resolveUrl(currentIndex);
        resolveUrl(currentIndex + 1);
        resolveUrl(currentIndex + 2);
    }, [currentIndex, reels]);

    // TV Event Handler for Vertical Swipe Logic within the Video Player
    useTVEventHandler((evt) => {
        if (!isVideoFocused) return;
        
        // When video is focused, Up/Down controls the reel index
        // UNLESS we are at index 0 and press UP -> then we let native focus system take over to move to tabs
        
        if (evt.eventType === 'down') {
            if (currentIndex < reels.length - 1) {
                setCurrentIndex(prev => prev + 1);
            }
            // If at end, do nothing (or loop?)
        } else if (evt.eventType === 'up') {
            if (currentIndex > 0) {
                setCurrentIndex(prev => prev - 1);
            }
            // If at 0, allow focus to escape upwards naturally to the Genre Tabs
        } else if (evt.eventType === 'select') {
             // Mute/Unmute
             setMuted(m => !m);
        }
    });

    const currentReel = reels[currentIndex];
    const spinAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        spinAnim.setValue(0);
        Animated.loop(
            Animated.timing(spinAnim, {
                toValue: 1,
                duration: 4000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();
    }, [currentIndex]);

    const spin = spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const isWidescreen = currentReel?.type === 'trailer' || currentReel?.type === 'clip';

    if (fetching && reels.length === 0) {
        return (
            <View style={[styles.container, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={accent} />
                <Text style={[styles.loadingText, { marginTop: 20 }]}>Loading feed...</Text>
            </View>
        );
    }

    if (!currentReel) {
        return (
            <View style={[styles.container, { backgroundColor: '#000' }]}>
                <View style={styles.emptyState}>
                    <Ionicons name="film-outline" size={64} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.emptyTitle}>No Content Found</Text>
                    <Text style={styles.emptySubtitle}>{error || 'Check back later for new videos'}</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Background Ambience */}
            {isWidescreen ? (
                <View style={StyleSheet.absoluteFill}>
                    <Image
                        source={{ uri: currentReel.avatar || undefined }}
                        style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
                        blurRadius={90}
                    />
                    <LinearGradient
                        colors={['#000', 'transparent', '#000']}
                        style={StyleSheet.absoluteFill}
                    />
                </View>
            ) : (
                <View style={StyleSheet.absoluteFill}>
                    <Image
                        source={{ uri: currentReel.avatar || undefined }}
                        style={[StyleSheet.absoluteFill, { opacity: 0.6 }]}
                        blurRadius={40}
                    />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />
                </View>
            )}

            {/* Genre Tabs (Native Focusable) */}
            <View style={[styles.genreContainer, { top: insets.top + (Platform.OS === 'android' ? 20 : 60) }]}>
                {GENRES.map((g, idx) => {
                    const isSelected = selectedGenre === g;
                    return (
                        <TvFocusable
                            key={g}
                            onPress={() => setSelectedGenre(g)}
                            onFocus={() => setIsGenreListFocused(true)}
                            onBlur={() => setIsGenreListFocused(false)}
                            isTVSelectable
                            style={({ focused }: any) => [
                                styles.genreChip,
                                isSelected && styles.genreChipSelected,
                                focused && styles.genreChipFocused
                            ]}
                        >
                            <Text style={[styles.genreText, isSelected && styles.genreTextSelected]}>{g}</Text>
                        </TvFocusable>
                    )
                })}
            </View>

            {genreLoading && (
                <View style={styles.centerParams}>
                    <ActivityIndicator size="large" color={accent} />
                </View>
            )}

            {/* Video Player Container (Native Focusable) */}
            <View style={isWidescreen ? styles.videoContainerWide : styles.videoContainerVertical}>
                <TvFocusable
                    style={StyleSheet.absoluteFill}
                    onFocus={() => setIsVideoFocused(true)}
                    onBlur={() => setIsVideoFocused(false)}
                    isTVSelectable
                    accessibilityLabel="Reel Player"
                >
                    {reels.map((item, index) => {
                        // Render Current and Next (Preload)
                        // We also keep Previous mounted briefly to smooth out backward nav, or unmount it.
                        // For TV memory, strictly windowing [currentIndex, currentIndex + 1] is safest.
                        if (index < currentIndex || index > currentIndex + 1) return null;

                        const isCurrent = index === currentIndex;
                        const isPreloading = index === currentIndex + 1;

                        if (!item.videoUrl) return null;

                        return (
                            <Video
                                key={item.id}
                                ref={isCurrent ? videoRef : undefined}
                                source={{ uri: item.videoUrl }}
                                style={[
                                    styles.video, 
                                    StyleSheet.absoluteFill, // Ensure they stack
                                    { opacity: isCurrent ? 1 : 0 } // Hide preloader
                                ]}
                                resizeMode={isWidescreen ? ResizeMode.CONTAIN : ResizeMode.COVER}
                                shouldPlay={isCurrent && isVideoFocused} // Only play if current AND focused (or just current if auto-play desired)
                                isLooping
                                isMuted={muted}
                                onLoadStart={() => {
                                    if (isCurrent) setBuffering(true);
                                }}
                                onLoad={() => {
                                    if (isCurrent) setBuffering(false);
                                }}
                                onError={(e) => console.log('Video error', e)}
                            />
                        );
                    })}
                </TvFocusable>
            </View>

            {/* Buffering Indicator */}
            {buffering && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.loadingText}>Buffering...</Text>
                </View>
            )}

            {/* Overlays / Info (Visual Only) */}
            <LinearGradient
                colors={['transparent', isWidescreen ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.8)']}
                style={[styles.bottomGradient, { paddingBottom: insets.bottom + 40 }]}
                pointerEvents="none" 
            >
                <View style={styles.infoContainer}>
                    <View style={styles.avatarRow}>
                        {currentReel.type === 'feed' && (
                            <View style={styles.avatarContainer}>
                                {currentReel.avatar ? (
                                    <Image source={{ uri: currentReel.avatar }} style={styles.avatar} />
                                ) : (
                                    <View style={[styles.avatar, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
                                        <Ionicons name="person" size={20} color="#fff" />
                                    </View>
                                )}
                            </View>
                        )}

                        <View>
                            <Text style={styles.username}>
                                {(currentReel.type === 'trailer' || currentReel.type === 'clip')
                                    ? 'MovieFlix Clips'
                                    : (currentReel.username || currentReel.user || 'User')}
                            </Text>
                            {currentReel.type === 'trailer' && <Text style={styles.sponsoredBadge}>Official Trailer</Text>}
                            {currentReel.type === 'clip' && <Text style={styles.sponsoredBadge}>Movie Scene</Text>}
                        </View>
                    </View>

                    <Text style={isWidescreen ? styles.titleLarge : styles.description}>
                        {currentReel.title}
                    </Text>

                    {currentReel.description && (
                        <Text style={styles.subDescription} numberOfLines={2}>
                            {currentReel.description}
                        </Text>
                    )}

                    <View style={styles.musicRow}>
                        <Ionicons name="musical-notes" size={16} color="#fff" />
                        <Text style={styles.musicText} numberOfLines={1}>{currentReel.music || 'Original Audio'}</Text>
                    </View>
                </View>

                {/* Right Side Actions */}
                <View style={styles.actionsContainer}>
                    <View style={styles.actionButton}>
                        {currentReel.type === 'feed' && (
                            <>
                                <View style={styles.iconCircle}>
                                    <Ionicons name="heart" size={30} color={currentReel.likes ? accent : '#fff'} />
                                </View>
                                <Text style={styles.actionText}>{currentReel.likes || 0}</Text>
                            </>
                        )}
                    </View>

                    <View style={styles.actionButton}>
                        <View style={styles.iconCircle}>
                            <Ionicons name={muted ? "volume-mute" : "volume-high"} size={30} color="#fff" />
                        </View>
                        <Text style={styles.actionText}>{muted ? 'Muted' : 'Unmuted'}</Text>
                    </View>

                    {(currentReel.type === 'feed') && (
                        <View style={[styles.discContainer, { borderColor: '#333' }]}>
                            <Animated.View style={{ transform: [{ rotate: spin }] }}>
                                <Image
                                    source={{ uri: currentReel.avatar || 'https://via.placeholder.com/50' }}
                                    style={styles.discImage}
                                />
                            </Animated.View>
                        </View>
                    )}
                </View>
            </LinearGradient>

            {/* Header / Top Info */}
            <View style={[styles.header, { paddingTop: insets.top + 20 }]} pointerEvents="none">
                <Text style={styles.headerTitle}>
                    {currentReel.type === 'trailer' ? 'Movie Trailers' : (currentReel.type === 'clip' ? 'Movie Scenes' : 'Social Feed')}
                </Text>
                <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>
                        {currentIndex + 1} / {reels.length}
                    </Text>
                </View>
            </View>

            {/* Progress indicators */}
            <View style={[styles.progressContainer, { top: insets.top + 70 }]} pointerEvents="none">
                {reels.map((_: any, index: number) => (
                    <View
                        key={index}
                        style={[
                            styles.progressBar,
                            {
                                backgroundColor: index === currentIndex ? accent : 'rgba(255,255,255,0.3)',
                                flex: index === currentIndex ? 2 : 1,
                            },
                        ]}
                    />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        marginLeft: TV_SIDE_NAV_WIDTH,
    },
    // Widescreen layout: Centered, 16:9 aspect ratio max width
    videoContainerWide: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    // Vertical layout: TikTok style (9:16 centered)
    videoContainerVertical: {
        height: '100%',
        aspectRatio: 9 / 16,
        alignSelf: 'center',
        backgroundColor: '#000',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
    },
    video: {
        width: '100%',
        height: '100%',
    },
    backgroundOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
    },
    loadingText: {
        color: '#fff',
        marginTop: 12,
        fontSize: 16,
        fontWeight: '600',
    },
    bottomGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 300,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingHorizontal: 60, // Extra padding for TV safe area
    },
    infoContainer: {
        flex: 1,
        marginRight: 40,
        paddingBottom: 20,
    },
    avatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatarContainer: {
        marginRight: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#fff',
        padding: 2,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    username: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    sponsoredBadge: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '600',
    },
    titleLarge: {
        color: '#fff',
        fontSize: 32,
        fontWeight: '800',
        marginBottom: 12,
        letterSpacing: 0.5,
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    description: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 8,
        lineHeight: 24,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    subDescription: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        marginBottom: 12,
        maxWidth: 600,
    },
    musicRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    musicText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
    actionsContainer: {
        alignItems: 'center',
        paddingBottom: 20,
        gap: 20,
    },
    actionButton: {
        alignItems: 'center',
        gap: 8,
    },
    iconCircle: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 5,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    actionText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    discContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#222',
        borderWidth: 8,
        borderColor: '#111',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
    },
    discImage: {
        width: 30,
        height: 30,
        borderRadius: 15,
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 60,
        right: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        textShadowColor: 'rgba(0,0,0,0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    headerBadge: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    headerBadgeText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    progressContainer: {
        position: 'absolute',
        right: 60,
        top: 100, // Adjusted based on logic or can be dynamic
        width: 200,
        height: 4,
        flexDirection: 'row',
        gap: 4,
    },
    progressBar: {
        height: 4,
        borderRadius: 2,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    emptyTitle: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '700',
    },
    emptySubtitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 16,
    },
    focusIndicator: {
        position: 'absolute',
        top: 8,
        left: 8,
        right: 8,
        bottom: 8,
        borderWidth: 3,
        borderRadius: 12,
        borderColor: 'transparent',
    },
    genreContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 60,
        zIndex: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    genreChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 30,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    genreChipSelected: {
        backgroundColor: '#e50914',
    },
    genreChipFocused: { // When user is actively browsing tabs
        borderColor: '#fff',
        transform: [{ scale: 1.1 }]
    },
    genreText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '600',
    },
    genreTextSelected: {
        color: '#fff',
        fontWeight: '700',
    },
    centerParams: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        zIndex: 60
    }
});
