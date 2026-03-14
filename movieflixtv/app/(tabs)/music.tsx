
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    View,
    Dimensions,
    ScrollView,
    Image,
    Animated,
    Easing,
} from 'react-native';

import { usePStream } from '../../src/pstream/usePStream';
import { useTvAccent } from '../components/TvAccentContext';
import { LiquidWaveformView, LiquidGlassCard, LiquidGlassButton, LiquidChipView } from '../../components/app-components/LiquidNativeViews';
import TvGlassPanel from '../components/TvGlassPanel';
import TvPosterCard from '../components/TvPosterCard';
import { TvFocusable } from '../components/TvSpatialNavigation';
import TvVirtualKeyboard from '../components/TvVirtualKeyboard';
import NativeTvGlowView from '../components/NativeTvGlowView';

const { width, height } = Dimensions.get('window');

const CATEGORIES = ['All', 'Trending', 'Relax', 'Workout', 'Party', 'Focus', 'Meditation'];
const MOODS = [
  { name: 'Deep Focus', color: '#4facfe', icon: 'brain', description: 'Concentration & Flow' },
  { name: 'Late Night', color: '#667eea', icon: 'weather-night', description: 'Chill Vibes' },
  { name: 'Pure Energy', color: '#f093fb', icon: 'lightning-bolt', description: 'High Intensity' },
  { name: 'Chilled Vibe', color: '#84fab0', icon: 'leaf', description: 'Relaxed & Calm' },
  { name: 'Romance', color: '#ff6b9d', icon: 'heart', description: 'Love Songs' },
  { name: 'Throwback', color: '#ffd700', icon: 'time', description: 'Classic Hits' },
];

const PLAYLISTS = [
  { name: 'Global Top 50', image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400', tracks: '50 songs' },
  { name: 'Lo-fi Beats', image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400', tracks: '120 songs' },
  { name: 'Glow Up Pop', image: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=400', tracks: '85 songs' },
];

export default function MusicScreen() {
    const router = useRouter();
    const { accentColor, setAccentColor } = useTvAccent();
    const [query, setQuery] = useState('');
    const [songs, setSongs] = useState<any[]>([]);
    const [recentlyPlayed, setRecentlyPlayed] = useState<any[]>([]);
    const [activeCategory, setActiveCategory] = useState('All');
    const [heroTrack, setHeroTrack] = useState<any | null>(null);

    const { searchMusic, loading } = usePStream();

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const listRef = useRef<FlatList<any> | null>(null);
    const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastScrollIndexRef = useRef<number | null>(null);
    
    // Animations for hero section
    const heroPulseAnim = useRef(new Animated.Value(0)).current;
    const heroGlowAnim = useRef(new Animated.Value(0.5)).current;

    const GRID_COLUMNS = 4;
    const CARD_WIDTH = 220; 
    const CARD_HEIGHT = CARD_WIDTH + 70;
    const GRID_ROW_GAP = 25;
    const GRID_ROW_HEIGHT = CARD_HEIGHT + GRID_ROW_GAP;

    const getGridItemLayout = useCallback(
        (_: ArrayLike<any> | null | undefined, index: number) => {
            const row = Math.floor(index / GRID_COLUMNS);
            return { length: GRID_ROW_HEIGHT, offset: GRID_ROW_HEIGHT * row, index };
        },
        [GRID_ROW_HEIGHT],
    );

    useEffect(() => {
        setAccentColor('#ff2d55'); 
    }, [setAccentColor]);

    // Hero pulsing animation
    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(heroPulseAnim, {
                    toValue: 1,
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(heroPulseAnim, {
                    toValue: 0,
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [heroPulseAnim]);

    // Hero glow animation
    useEffect(() => {
        const glow = Animated.loop(
            Animated.sequence([
                Animated.timing(heroGlowAnim, {
                    toValue: 0.8,
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(heroGlowAnim, {
                    toValue: 0.5,
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );
        glow.start();
        return () => glow.stop();
    }, [heroGlowAnim]);

    // Initial load
    useEffect(() => {
        if (!query) {
            searchMusic('trending music 2026').then(res => {
                if (res) {
                    const adapted = res.map((item: any) => ({
                        id: item.videoId,
                        title: item.title,
                        poster_path: item.thumbnail,
                        backdrop_path: item.thumbnail,
                        media_type: 'music',
                        overview: item.artist,
                        artist: item.artist,
                        thumbnail: item.thumbnail,
                        videoId: item.videoId,
                    }));
                    setSongs(adapted);
                    setHeroTrack(adapted[0] || null);
                    setRecentlyPlayed(adapted.slice(1, 6));
                }
            });
        }
    }, [searchMusic]);

    // Handle Search with Debounce
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        const q = query.trim();
        if (q.length <= 1 && q.length > 0) return;

        debounceRef.current = setTimeout(() => {
            const finalQ = q.length === 0 ? 'trending music 2026' : q;
            searchMusic(finalQ).then((results) => {
                if (results) {
                    const adapted = results.map((item: any) => ({
                        id: item.videoId,
                        title: item.title,
                        poster_path: item.thumbnail,
                        backdrop_path: item.thumbnail,
                        media_type: 'music',
                        overview: item.artist,
                        artist: item.artist,
                        thumbnail: item.thumbnail,
                        videoId: item.videoId,
                    }));
                    setSongs(adapted);
                    setHeroTrack(adapted[0] || null);
                }
            }).catch(console.error);
        }, 500);

        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query, searchMusic]);

    const handleKeyPress = (value: string) => {
        if (value === 'DEL') {
            setQuery((prev) => prev.slice(0, -1));
            return;
        }
        if (value === 'CLEAR') {
            setQuery('');
            return;
        }
        setQuery((prev) => (prev + value).slice(0, 48));
    };

    const handlePlayTrack = useCallback((track: any) => {
        // Navigate to player
        router.push({
            pathname: '/music-player',
            params: {
                videoId: track.videoId || track.id,
                title: track.title,
                artist: track.artist || track.overview,
                thumbnail: track.thumbnail || track.poster_path
            }
        });
        
        // Add to recently played
        setRecentlyPlayed(prev => {
            const filtered = prev.filter(s => String(s.videoId || s.id) !== String(track.videoId || track.id));
            return [track, ...filtered].slice(0, 10);
        });
    }, [router]);

    const queryHint = query.trim().length ? query : 'Search songs, artists, or genres…';

    const heroScaleAnim = heroPulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.02],
    });

    return (
        <View style={styles.container}>
            <View style={StyleSheet.absoluteFill}>
                <LinearGradient colors={['#0f1025', '#05060f']} style={StyleSheet.absoluteFill} />
                <NativeTvGlowView color={accentColor} style={StyleSheet.absoluteFill} />
                <View style={[styles.bgCircle, { top: -200, right: -200, backgroundColor: `${accentColor}15` }]} />
                <View style={[styles.bgCircle, { bottom: -300, left: -200, width: 800, height: 800, backgroundColor: 'rgba(124, 58, 237, 0.08)' }]} />
            </View>

            <View style={styles.shell}>
                <View style={styles.header}>
                    <View style={styles.titleContainer}>
                        <Text style={styles.headerSubtitle}>PREMIUM AUDIO</Text>
                        <Text style={styles.headerTitle}>Music Discovery</Text>
                    </View>
                    
                    <TvGlassPanel accent={accentColor} native compact borderRadius={24} glowIntensity="subtle" style={styles.searchBarGlass}>
                        <View style={styles.searchPill}>
                            <Ionicons name="search" size={24} color="rgba(255,255,255,0.7)" />
                            <Text style={styles.searchText} numberOfLines={1}>{queryHint}</Text>
                        </View>
                    </TvGlassPanel>

                    <TvFocusable
                        onPress={() => setQuery('')}
                        style={({ focused }: any) => [
                            styles.clearBtnWrap,
                            focused && styles.glassFocus
                        ]}
                    >
                        <TvGlassPanel accent={accentColor} native compact borderRadius={24} glowIntensity="subtle" style={styles.clearBtn}>
                            <Ionicons name="close" size={20} color="#fff" />
                            <Text style={styles.clearText}>Clear</Text>
                        </TvGlassPanel>
                    </TvFocusable>
                </View>

                <View style={styles.mainContent}>
                    <View style={styles.leftPane}>
                        <TvGlassPanel accent={accentColor} native borderRadius={32} glowIntensity="subtle" style={styles.keyboardGlass}>
                            <TvVirtualKeyboard onKeyPress={handleKeyPress} />
                        </TvGlassPanel>
                        
                        {/* Categories with Native Chips */}
                        <View style={styles.sideSection}>
                            <Text style={styles.sideTitle}>Categories</Text>
                            <View style={styles.catGrid}>
                                {CATEGORIES.slice(0, 6).map(cat => (
                                    <LiquidChipView
                                        key={cat}
                                        label={cat}
                                        selected={activeCategory === cat}
                                        onPress={() => {
                                            setActiveCategory(cat);
                                            setQuery(cat === 'All' ? '' : cat);
                                        }}
                                        size="medium"
                                    />
                                ))}
                            </View>
                        </View>

                        {/* Moods with Native Liquid Glass */}
                        <View style={styles.sideSection}>
                            <Text style={styles.sideTitle}>Your Mood</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moodScroll}>
                                {MOODS.map(mood => (
                                    <TvFocusable 
                                        key={mood.name} 
                                        style={({ focused }: any) => [styles.moodBtnWrap, focused && styles.glassFocus]}
                                        onPress={() => setQuery(mood.name)}
                                    >
                                        <TvGlassPanel accent={mood.color} native compact borderRadius={15} glowIntensity="subtle" style={styles.moodBtn}>
                                            <MaterialCommunityIcons name={mood.icon as any} size={24} color={mood.color} />
                                            <View style={styles.moodTextWrap}>
                                                <Text style={styles.moodText}>{mood.name}</Text>
                                                <Text style={styles.moodDesc}>{mood.description}</Text>
                                            </View>
                                        </TvGlassPanel>
                                    </TvFocusable>
                                ))}
                            </ScrollView>
                        </View>

                        {/* Featured Playlists */}
                        <View style={styles.sideSection}>
                            <Text style={styles.sideTitle}>Featured Playlists</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playlistScroll}>
                                {PLAYLISTS.map((pl, i) => (
                                    <TvFocusable key={i} style={({ focused }: any) => [styles.playlistWrap, focused && styles.glassFocus]}>
                                        <LiquidGlassCard
                                            style={styles.playlistCard}
                                            posterPath={pl.image}
                                            title={pl.name}
                                            subtitle={pl.tracks}
                                            interactive={true}
                                            glowIntensity={0.3}
                                        />
                                    </TvFocusable>
                                ))}
                            </ScrollView>
                        </View>
                    </View>

                    <View style={styles.rightPane}>
                        {/* Hero Card - Featured Track */}
                        {heroTrack && (
                            <Animated.View style={[styles.heroContainer, { transform: [{ scale: heroScaleAnim }] }]}>
                                <TvFocusable
                                    onPress={() => handlePlayTrack(heroTrack)}
                                    style={({ focused }: any) => [styles.heroFocusWrap, focused && styles.heroFocused]}
                                >
                                    <TvGlassPanel accent={accentColor} native borderRadius={32} glowIntensity="strong" style={styles.heroGlass}>
                                        <Image source={{ uri: heroTrack.thumbnail }} style={styles.heroImage} />
                                        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']} style={styles.heroOverlay} />
                                        
                                        {/* Native Waveform Visualizer */}
                                        <View style={styles.heroVisualizer}>
                                            <LiquidWaveformView
                                                style={styles.waveform}
                                                barCount={32}
                                                animated={true}
                                                color={accentColor}
                                            />
                                        </View>
                                        
                                        <View style={styles.heroContent}>
                                            <View style={styles.heroBadge}>
                                                <Text style={styles.heroBadgeText}>TRENDING NOW</Text>
                                            </View>
                                            <Text style={styles.heroTitle} numberOfLines={2}>{heroTrack.title}</Text>
                                            <Text style={styles.heroArtist}>{heroTrack.artist || 'Featured Artist'}</Text>
                                            
                                            <View style={styles.heroActions}>
                                                <LiquidGlassButton
                                                    icon="play"
                                                    label="Play"
                                                    size="large"
                                                    variant="primary"
                                                    onPress={() => handlePlayTrack(heroTrack)}
                                                />
                                                <LiquidGlassButton
                                                    icon="add"
                                                    label="Queue"
                                                    size="medium"
                                                    variant="secondary"
                                                />
                                            </View>
                                        </View>
                                    </TvGlassPanel>
                                </TvFocusable>
                            </Animated.View>
                        )}

                        {/* Recently Played */}
                        {recentlyPlayed.length > 0 && (
                            <View style={styles.recentSection}>
                                <Text style={styles.sectionTitle}>Recently Played</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentScroll}>
                                    {recentlyPlayed.map((item, i) => (
                                        <TvFocusable
                                            key={i}
                                            onPress={() => handlePlayTrack(item)}
                                            style={({ focused }: any) => [styles.recentCardWrap, focused && styles.glassFocus]}
                                        >
                                            <LiquidGlassCard
                                                style={styles.recentCard}
                                                posterPath={item.thumbnail}
                                                title={item.title}
                                                interactive={true}
                                                glowIntensity={0.3}
                                            />
                                        </TvFocusable>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        {/* Main Grid */}
                        <View style={styles.gridSection}>
                            <Text style={styles.sectionTitle}>{activeCategory} Picks</Text>
                            
                            {loading ? (
                                <View style={styles.center}>
                                    <ActivityIndicator size="large" color={accentColor} />
                                    <Text style={styles.centerText}>Tuning your frequencies…</Text>
                                </View>
                            ) : songs.length === 0 ? (
                                <View style={styles.center}>
                                    <Ionicons name="search-outline" size={64} color="rgba(255,255,255,0.2)" />
                                    <Text style={styles.centerTitle}>No matches found</Text>
                                </View>
                            ) : (
                                <FlatList
                                    ref={(r) => { listRef.current = r; }}
                                    data={songs.slice(1)} // Skip hero track
                                    keyExtractor={(it) => it.id}
                                    numColumns={GRID_COLUMNS}
                                    columnWrapperStyle={styles.gridRow}
                                    contentContainerStyle={styles.grid}
                                    getItemLayout={getGridItemLayout}
                                    showsVerticalScrollIndicator={false}
                                    renderItem={({ item, index }) => (
                                        <TvPosterCard
                                            item={item}
                                            width={CARD_WIDTH}
                                            onFocus={() => {
                                                if (lastScrollIndexRef.current === index) return;
                                                lastScrollIndexRef.current = index;
                                                if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
                                                scrollTimerRef.current = setTimeout(() => {
                                                    try { listRef.current?.scrollToIndex({ index, viewPosition: 0.2, animated: true }); } catch { }
                                                }, 100);
                                            }}
                                            onPress={(selected) => handlePlayTrack(selected)}
                                        />
                                    )}
                                />
                            )}
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#030408' },
    bgCircle: { position: 'absolute', width: 600, height: 600, borderRadius: 400, filter: 'blur(100px)' as any },
    shell: { flex: 1, paddingHorizontal: 60, paddingVertical: 40 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 30, gap: 25 },
    titleContainer: { marginRight: 20 },
    headerSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
    headerTitle: { color: '#fff', fontSize: 42, fontWeight: '900' },
    searchBarGlass: { flex: 1, height: 72 },
    searchPill: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25, gap: 15 },
    searchText: { flex: 1, color: '#fff', fontSize: 20, fontWeight: '600' },
    clearBtnWrap: { borderRadius: 24 },
    clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 72, paddingHorizontal: 25, borderRadius: 24 },
    clearText: { color: '#fff', fontSize: 18, fontWeight: '700' },
    glassFocus: { transform: [{ scale: 1.04 }], shadowColor: '#fff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 10 },
    mainContent: { flex: 1, flexDirection: 'row', gap: 40 },
    leftPane: { width: 620 },
    keyboardGlass: { height: 420, padding: 25 },
    sideSection: { marginTop: 25 },
    sideTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '900', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' },
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    moodScroll: { gap: 12 },
    moodBtnWrap: { borderRadius: 15 },
    moodBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 15, minWidth: 170 },
    moodTextWrap: { flex: 1 },
    moodText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    moodDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', marginTop: 2 },
    playlistScroll: { gap: 15 },
    playlistWrap: { borderRadius: 20 },
    playlistCard: { width: 150, height: 150 },
    rightPane: { flex: 1 },
    heroContainer: { marginBottom: 25, height: 280 },
    heroFocusWrap: { borderRadius: 32 },
    heroFocused: { transform: [{ scale: 1.02 }] },
    heroGlass: { flex: 1, overflow: 'hidden' },
    heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    heroOverlay: { ...StyleSheet.absoluteFillObject },
    heroVisualizer: { 
        position: 'absolute', 
        left: 25, 
        right: 25, 
        bottom: 100, 
        height: 40,
        justifyContent: 'flex-end',
    },
    waveform: { flex: 1 },
    heroContent: { flex: 1, justifyContent: 'flex-end', padding: 25 },
    heroBadge: { 
        backgroundColor: 'rgba(255,255,255,0.2)', 
        paddingHorizontal: 12, 
        paddingVertical: 6, 
        borderRadius: 10, 
        alignSelf: 'flex-start',
        marginBottom: 12,
    },
    heroBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    heroTitle: { fontSize: 28, fontWeight: '900', color: '#fff', marginBottom: 6 },
    heroArtist: { fontSize: 18, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 15 },
    heroActions: { flexDirection: 'row', gap: 15 },
    recentSection: { marginBottom: 20 },
    sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 12 },
    recentScroll: { gap: 15 },
    recentCardWrap: { borderRadius: 16 },
    recentCard: { width: 140, height: 140 },
    gridSection: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, minHeight: 300 },
    centerText: { color: 'rgba(255,255,255,0.5)', fontSize: 18, fontWeight: '600', textAlign: 'center' },
    centerTitle: { color: '#fff', fontSize: 28, fontWeight: '900' },
    grid: { paddingBottom: 100 },
    gridRow: { gap: GRID_ROW_GAP },
});
