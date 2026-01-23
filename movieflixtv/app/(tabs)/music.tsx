import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { usePStream } from '../../src/pstream/usePStream';
import { useTvAccent } from '../components/TvAccentContext';
import TvGlassPanel from '../components/TvGlassPanel';
import TvPosterCard from '../components/TvPosterCard';
import { TvFocusable } from '../components/TvSpatialNavigation';
import TvVirtualKeyboard from '../components/TvVirtualKeyboard';

export default function MusicScreen() {
    const router = useRouter();
    const { setAccentColor } = useTvAccent();
    const [query, setQuery] = useState('');
    const [songs, setSongs] = useState<any[]>([]);

    // Destructure searchMusic from usePStream hook
    const { searchMusic, loading } = usePStream();

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const listRef = useRef<FlatList<any> | null>(null);
    const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastScrollIndexRef = useRef<number | null>(null);

    const GRID_COLUMNS = 4;
    const CARD_WIDTH = 170;
    // Use a card height similar to search.tsx or customize for music (often square for albums)
    const CARD_HEIGHT = CARD_WIDTH + 40;
    const GRID_ROW_GAP = 14;
    const GRID_ROW_HEIGHT = CARD_HEIGHT + GRID_ROW_GAP;

    const getGridItemLayout = useCallback(
        (_: ArrayLike<any> | null | undefined, index: number) => {
            const row = Math.floor(index / GRID_COLUMNS);
            return { length: GRID_ROW_HEIGHT, offset: GRID_ROW_HEIGHT * row, index };
        },
        [GRID_ROW_HEIGHT],
    );

    // Set default accent color for Music screen
    useEffect(() => {
        setAccentColor('#e91e63'); // Pinkish for music, or keep red
    }, [setAccentColor]);

    // Handle Search with Debounce
    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        const q = query.trim();
        if (q.length <= 1) {
            setSongs([]);
            return;
        }

        debounceRef.current = setTimeout(() => {
            searchMusic(q).then((results) => {
                if (results) {
                    // Adapt results to what TvPosterCard expects (id, poster_path, title)
                    // Assuming ytMusic returns { videoId, title, artist, thumbnail }
                    const adapted = results.map((item: any) => ({
                        id: item.videoId,
                        title: item.title,
                        poster_path: item.thumbnail,
                        media_type: 'music', // Custom type
                        overview: item.artist, // Use overview for artist name
                    }));
                    setSongs(adapted);
                } else {
                    setSongs([]);
                }
            }).catch((e) => {
                console.error(e);
                setSongs([]);
            });
        }, 500);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
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
        setQuery((prev) => {
            const next = prev + value;
            return next.length > 48 ? next.slice(0, 48) : next;
        });
    };

    const queryHint = query.trim().length ? query : 'Search songs, artists…';

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#e91e63', '#070815', '#05060f']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            <View style={styles.shell}>
                <TvGlassPanel accent="#e91e63" style={styles.panel}>
                    <View style={styles.panelInner}>
                        <View style={styles.topBar}>
                            <View style={styles.titleRow}>
                                <Ionicons name="musical-notes" size={20} color="#fff" />
                                <Text style={styles.title}>Music</Text>
                            </View>

                            <View style={styles.searchPill}>
                                <Ionicons name="search" size={16} color="rgba(255,255,255,0.82)" />
                                <Text style={styles.searchText} numberOfLines={1}>
                                    {queryHint}
                                </Text>
                            </View>

                            <TvFocusable
                                onPress={() => setQuery('')}
                                isTVSelectable={true}
                                accessibilityLabel="Clear search"
                                style={({ focused }: any) => [styles.clearBtn, focused ? styles.clearBtnFocused : null]}
                            >
                                <Text style={styles.clearText}>Clear</Text>
                            </TvFocusable>
                        </View>

                        <View style={styles.columns}>
                            <View style={styles.leftPane}>
                                <TvVirtualKeyboard onKeyPress={handleKeyPress} />
                                <Text style={styles.tip}>Tip: press Delete to erase, Clear to reset.</Text>
                            </View>

                            <View style={styles.rightPane}>
                                {loading ? (
                                    <View style={styles.center}>
                                        <ActivityIndicator color="#fff" />
                                        <Text style={styles.centerText}>Searching…</Text>
                                    </View>
                                ) : query.trim().length <= 1 ? (
                                    <View style={styles.center}>
                                        <Ionicons name="search-outline" size={48} color="rgba(255,255,255,0.4)" />
                                        <Text style={styles.centerTitle}>Start typing</Text>
                                        <Text style={styles.centerText}>Use the keyboard to find songs.</Text>
                                    </View>
                                ) : songs.length === 0 ? (
                                    <View style={styles.center}>
                                        <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.4)" />
                                        <Text style={styles.centerTitle}>No results</Text>
                                        <Text style={styles.centerText}>Try a different search.</Text>
                                        <TvFocusable
                                            onPress={() => setQuery('')}
                                            tvPreferredFocus
                                            isTVSelectable={true}
                                            accessibilityLabel="Clear and try again"
                                            style={({ focused }: any) => [styles.retryBtn, focused && styles.retryBtnFocused]}
                                        >
                                            <Ionicons name="refresh-outline" size={18} color="#fff" />
                                            <Text style={styles.retryBtnText}>Clear and try again</Text>
                                        </TvFocusable>
                                    </View>
                                ) : (
                                    <FlatList
                                        ref={(r) => {
                                            listRef.current = r;
                                        }}
                                        data={songs}
                                        keyExtractor={(it) => it.id}
                                        numColumns={GRID_COLUMNS}
                                        columnWrapperStyle={styles.gridRow}
                                        contentContainerStyle={styles.grid}
                                        getItemLayout={getGridItemLayout}
                                        initialNumToRender={12}
                                        maxToRenderPerBatch={12}
                                        updateCellsBatchingPeriod={50}
                                        windowSize={5}
                                        removeClippedSubviews
                                        renderItem={({ item, index }) => (
                                            <TvPosterCard
                                                item={item} // TvPosterCard expects { id, title, poster_path, overview/vote_average }
                                                width={CARD_WIDTH}
                                                onFocus={() => {
                                                    if (lastScrollIndexRef.current === index) return;
                                                    lastScrollIndexRef.current = index;

                                                    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
                                                    scrollTimerRef.current = setTimeout(() => {
                                                        try {
                                                            listRef.current?.scrollToIndex({ index, viewPosition: 0.35, animated: false });
                                                        } catch { }
                                                    }, 60);
                                                }}
                                                onPress={(selected) => {
                                                    // Convert TvPosterCard's selected item back to params for navigation
                                                    // We need to pass videoId, title, artist, thumbnail
                                                    router.push({
                                                        pathname: '/music-player',
                                                        params: {
                                                            videoId: selected.id,
                                                            title: selected.title,
                                                            artist: selected.overview, // We stored artist in overview
                                                            thumbnail: selected.poster_path
                                                        }
                                                    });
                                                }}
                                            />
                                        )}
                                    />
                                )}
                            </View>
                        </View>
                    </View>
                </TvGlassPanel>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#030408' },
    shell: { flex: 1, paddingLeft: 108, paddingRight: 40, paddingTop: 28, paddingBottom: 28, alignItems: 'center' },
    panel: { flex: 1, width: '100%', maxWidth: 1560 },
    panelInner: { flex: 1, padding: 22 },
    topBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 8, paddingBottom: 18 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { color: '#fff', fontSize: 18, fontWeight: '900' },
    searchPill: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 42,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.20)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    searchText: { flex: 1, color: 'rgba(255,255,255,0.86)', fontSize: 13, fontWeight: '900' },
    columns: { flex: 1, flexDirection: 'row', gap: 18 },
    leftPane: {
        width: 560,
        borderRadius: 24,
        padding: 18,
        backgroundColor: 'rgba(0,0,0,0.16)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    rightPane: { flex: 1 },
    clearBtn: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    clearBtnFocused: { transform: [{ scale: 1.03 }], borderColor: '#fff' },
    clearText: { color: '#fff', fontSize: 13, fontWeight: '900' },
    tip: { marginTop: 12, color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    centerTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 12 },
    centerText: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '700' },
    retryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 16,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 16,
        backgroundColor: 'rgba(233, 30, 99, 0.8)',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    retryBtnFocused: {
        transform: [{ scale: 1.08 }],
        borderColor: '#fff',
        borderWidth: 3,
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 12,
        elevation: 10,
    },
    retryBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '900',
    },
    grid: { paddingTop: 10, paddingBottom: 20 },
    gridRow: { gap: 14 },
});
