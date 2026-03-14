import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ScrollView,
    Dimensions,
    Animated,
    Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAccent } from '@/components/app-components/AccentContext';

const { width } = Dimensions.get('window');
const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';

const FAVORITES_KEY = '@movieflix_movie_favorites';

export type MovieData = {
    id: number;
    title: string;
    poster: string;
    backdrop?: string;
    runtime: number;
    year: string;
    type: 'movie' | 'tv';
    overview?: string;
    vote_average?: number;
    genres?: string[];
};

type Props = {
    visible: boolean;
    onClose: () => void;
    onSelect: (movie: MovieData) => void;
};

type SearchResult = {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string;
    backdrop_path?: string;
    release_date?: string;
    first_air_date?: string;
    media_type: 'movie' | 'tv';
    overview?: string;
    vote_average?: number;
    genre_ids?: number[];
};

const GENRE_MAP: Record<number, string> = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

export default function ChatMoviePicker({ visible, onClose, onSelect }: Props) {
    const { accentColor } = useAccent();
    const accent = accentColor || '#e50914';

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [trending, setTrending] = useState<SearchResult[]>([]);
    const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
    const [selectedDetails, setSelectedDetails] = useState<MovieData | null>(null);
    const [loading, setLoading] = useState(false);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [favorites, setFavorites] = useState<MovieData[]>([]);
    const [showFavorites, setShowFavorites] = useState(false);
    const [activeTab, setActiveTab] = useState<'search' | 'trending' | 'favorites'>('trending');
    
    const scrollX = useRef(new Animated.Value(0)).current;
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load favorites and trending on mount
    useEffect(() => {
        loadFavorites();
        fetchTrending();
    }, []);

    const loadFavorites = async () => {
        try {
            const data = await AsyncStorage.getItem(FAVORITES_KEY);
            if (data) setFavorites(JSON.parse(data));
        } catch (e) {
            console.warn('Failed to load favorites:', e);
        }
    };

    const fetchTrending = async () => {
        try {
            const [movieRes, tvRes] = await Promise.all([
                fetch(`${TMDB_BASE}/trending/movie/week?api_key=${TMDB_API_KEY}`),
                fetch(`${TMDB_BASE}/trending/tv/week?api_key=${TMDB_API_KEY}`),
            ]);
            const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);
            const combined = [
                ...(movieData.results || []).slice(0, 5).map((r: any) => ({ ...r, media_type: 'movie' })),
                ...(tvData.results || []).slice(0, 5).map((r: any) => ({ ...r, media_type: 'tv' })),
            ];
            setTrending(combined);
        } catch (e) {
            console.warn('Failed to fetch trending:', e);
        }
    };

    const handleSearch = useCallback(async (text: string) => {
        setQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (text.trim().length < 2) {
            setResults([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            try {
                setLoading(true);
                const url = `${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(text)}&include_adult=false`;
                const res = await fetch(url);
                const data = await res.json();

                const filtered = (data.results || [])
                    .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
                    .slice(0, 15);

                setResults(filtered);
            } catch (err) {
                console.warn('[ChatMoviePicker] Search error:', err);
            } finally {
                setLoading(false);
            }
        }, 400);
    }, []);

    const handleSelectItem = useCallback(async (item: SearchResult) => {
        setSelectedItem(item);
        setDetailsLoading(true);

        try {
            const endpoint = item.media_type === 'movie' ? 'movie' : 'tv';
            const url = `${TMDB_BASE}/${endpoint}/${item.id}?api_key=${TMDB_API_KEY}`;
            const res = await fetch(url);
            const data = await res.json();

            const runtime = item.media_type === 'movie'
                ? data.runtime || 0
                : data.episode_run_time?.[0] || data.runtime || 0;

            const year = item.media_type === 'movie'
                ? (item.release_date || '').split('-')[0]
                : (item.first_air_date || '').split('-')[0];

            setSelectedDetails({
                id: item.id,
                title: item.title || item.name || 'Unknown',
                poster: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : '',
                backdrop: item.backdrop_path ? `${TMDB_BACKDROP_BASE}${item.backdrop_path}` : '',
                runtime,
                year,
                type: item.media_type,
                overview: data.overview || item.overview,
                vote_average: data.vote_average || item.vote_average,
                genres: (data.genres || item.genre_ids?.map((id: number) => GENRE_MAP[id]) || []).slice(0, 3).map((g: any) => g.name || g),
            });
        } catch (err) {
            console.warn('[ChatMoviePicker] Details error:', err);
            setSelectedDetails({
                id: item.id,
                title: item.title || item.name || 'Unknown',
                poster: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : '',
                runtime: 0,
                year: (item.release_date || item.first_air_date || '').split('-')[0],
                type: item.media_type,
            });
        } finally {
            setDetailsLoading(false);
        }
    }, []);

    const handleSend = useCallback(() => {
        if (selectedDetails) {
            onSelect(selectedDetails);
            onClose();
        }
    }, [selectedDetails, onSelect, onClose]);

    const toggleFavorite = async () => {
        if (!selectedDetails) return;
        const isFav = favorites.some(f => f.id === selectedDetails.id);
        const newFavs = isFav 
            ? favorites.filter(f => f.id !== selectedDetails.id)
            : [...favorites, selectedDetails];
        setFavorites(newFavs);
        await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavs));
        Alert.alert(isFav ? 'Removed from Favorites' : 'Added to Favorites', selectedDetails.title);
    };

    const isFavorite = selectedDetails ? favorites.some(f => f.id === selectedDetails.id) : false;

    const formatRuntime = (mins: number) => {
        if (!mins) return '';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const renderItem = ({ item }: { item: SearchResult }) => {
        const isSelected = selectedItem?.id === item.id;
        const title = item.title || item.name;
        const year = (item.release_date || item.first_air_date || '').split('-')[0];

        return (
            <TouchableOpacity
                style={[styles.movieItem, isSelected && { borderColor: accent, backgroundColor: `${accent}15` }]}
                activeOpacity={0.8}
                onPress={() => handleSelectItem(item)}
            >
                {item.poster_path ? (
                    <Image
                        source={{ uri: `${TMDB_IMAGE_BASE}${item.poster_path}` }}
                        style={styles.moviePoster}
                    />
                ) : (
                    <View style={[styles.moviePoster, styles.noPoster]}>
                        <Ionicons name="film-outline" size={24} color="rgba(255,255,255,0.3)" />
                    </View>
                )}
                <View style={styles.movieInfo}>
                    <Text style={styles.movieTitle} numberOfLines={2}>{title}</Text>
                    <View style={styles.movieMeta}>
                        <Text style={styles.movieYear}>{year}</Text>
                        <View style={[styles.typeBadge, { backgroundColor: item.media_type === 'movie' ? accent : '#6366f1' }]}>
                            <Text style={styles.typeText}>{item.media_type === 'movie' ? 'Movie' : 'TV'}</Text>
                        </View>
                    </View>
                </View>
                {isSelected && (
                    <Ionicons name="checkmark-circle" size={24} color={accent} />
                )}
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.sheet}>
                    <LinearGradient
                        colors={['rgba(35,40,55,0.98)', 'rgba(25,28,40,0.98)']}
                        style={StyleSheet.absoluteFill}
                    />

                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Share Movie or Show</Text>
                        <TouchableOpacity onPress={() => setShowFavorites(!showFavorites)} style={styles.closeBtn}>
                            <Ionicons name={showFavorites ? "heart" : "heart-outline"} size={22} color={showFavorites ? accent : "#fff"} />
                        </TouchableOpacity>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabBar}>
                        <TouchableOpacity 
                            style={[styles.tab, activeTab === 'trending' && { borderBottomColor: accent }]} 
                            onPress={() => setActiveTab('trending')}
                        >
                            <Text style={[styles.tabText, activeTab === 'trending' && styles.activeTabText]}>Trending</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.tab, activeTab === 'search' && { borderBottomColor: accent }]} 
                            onPress={() => setActiveTab('search')}
                        >
                            <Text style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>Search</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.tab, activeTab === 'favorites' && { borderBottomColor: accent }]} 
                            onPress={() => setActiveTab('favorites')}
                        >
                            <Text style={[styles.tabText, activeTab === 'favorites' && styles.activeTabText]}>Favorites</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Search (only in search tab) */}
                    {activeTab === 'search' && (
                        <View style={styles.searchContainer}>
                            <Ionicons name="search" size={18} color="rgba(255,255,255,0.5)" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search movies & TV shows..."
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                value={query}
                                onChangeText={handleSearch}
                                returnKeyType="search"
                            />
                        </View>
                    )}

                    {/* Trending Carousel */}
                    {activeTab === 'trending' && trending.length > 0 && !selectedItem && (
                        <View style={styles.carouselSection}>
                            <ScrollView 
                                horizontal 
                                showsHorizontalScrollIndicator={false}
                                decelerationRate="fast"
                                snapToInterval={width * 0.7}
                                contentContainerStyle={styles.carouselContent}
                            >
                                {trending.map((item, i) => (
                                    <TouchableOpacity 
                                        key={`${item.media_type}-${item.id}`} 
                                        style={styles.carouselCard}
                                        onPress={() => handleSelectItem(item)}
                                        activeOpacity={0.9}
                                    >
                                        <Image 
                                            source={{ uri: item.backdrop_path ? `${TMDB_BACKDROP_BASE}${item.backdrop_path}` : `${TMDB_IMAGE_BASE}${item.poster_path}` }} 
                                            style={styles.carouselImage} 
                                        />
                                        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={StyleSheet.absoluteFill} />
                                        <View style={styles.carouselInfo}>
                                            <Text style={styles.carouselTitle} numberOfLines={2}>{item.title || item.name}</Text>
                                            <View style={styles.carouselMeta}>
                                                <Text style={styles.carouselYear}>{(item.release_date || item.first_air_date || '').split('-')[0]}</Text>
                                                <View style={[styles.typeBadge, { backgroundColor: item.media_type === 'movie' ? accent : '#6366f1' }]}>
                                                    <Text style={styles.typeText}>{item.media_type === 'movie' ? 'Movie' : 'TV'}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {/* Results / Favorites */}
                    {activeTab === 'search' && loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={accent} />
                        </View>
                    ) : activeTab === 'search' && results.length > 0 ? (
                        <FlatList
                            data={results}
                            keyExtractor={(item) => `${item.media_type}-${item.id}`}
                            renderItem={renderItem}
                            style={styles.list}
                            contentContainerStyle={styles.listContent}
                        />
                    ) : activeTab === 'favorites' ? (
                        favorites.length > 0 ? (
                            <FlatList
                                data={favorites}
                                keyExtractor={(item) => `${item.type}-${item.id}`}
                                renderItem={({ item }) => {
                                    const isSelected = selectedDetails?.id === item.id;
                                    return (
                                        <TouchableOpacity
                                            style={[styles.movieItem, isSelected && { borderColor: accent, backgroundColor: `${accent}15` }]}
                                            activeOpacity={0.8}
                                            onPress={() => {
                                                setSelectedDetails(item);
                                                setSelectedItem({ id: item.id, title: item.title, name: item.title, media_type: item.type } as any);
                                            }}
                                        >
                                            {item.poster ? (
                                                <Image source={{ uri: item.poster }} style={styles.moviePoster} />
                                            ) : (
                                                <View style={[styles.moviePoster, styles.noPoster]}>
                                                    <Ionicons name="film-outline" size={24} color="rgba(255,255,255,0.3)" />
                                                </View>
                                            )}
                                            <View style={styles.movieInfo}>
                                                <Text style={styles.movieTitle} numberOfLines={2}>{item.title}</Text>
                                                <Text style={styles.movieYear}>{item.year}</Text>
                                            </View>
                                            {isSelected && <Ionicons name="checkmark-circle" size={24} color={accent} />}
                                        </TouchableOpacity>
                                    );
                                }}
                                style={styles.list}
                                contentContainerStyle={styles.listContent}
                            />
                        ) : (
                            <View style={styles.emptyState}>
                                <Ionicons name="heart-outline" size={40} color="rgba(255,255,255,0.3)" />
                                <Text style={styles.emptyText}>No favorites yet</Text>
                            </View>
                        )
                    ) : activeTab === 'search' && query.length >= 2 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="film-outline" size={40} color="rgba(255,255,255,0.3)" />
                            <Text style={styles.emptyText}>No results found</Text>
                        </View>
                    ) : activeTab === 'search' ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="search" size={40} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.emptyText}>Search for movies or TV shows</Text>
                        </View>
                    ) : null}

                    {/* Selected preview & send */}
                    {selectedDetails && (
                        <View style={styles.footer}>
                            <TouchableOpacity style={styles.selectedPreview} onPress={toggleFavorite}>
                                {selectedDetails.poster ? (
                                    <Image source={{ uri: selectedDetails.poster }} style={styles.selectedPoster} />
                                ) : (
                                    <View style={[styles.selectedPoster, styles.noPoster]}>
                                        <Ionicons name="film" size={20} color="rgba(255,255,255,0.3)" />
                                    </View>
                                )}
                                <View style={styles.selectedInfo}>
                                    <Text style={styles.selectedTitle} numberOfLines={1}>{selectedDetails.title}</Text>
                                    <Text style={styles.selectedMeta}>
                                        {selectedDetails.year}
                                        {selectedDetails.runtime > 0 && ` • ${formatRuntime(selectedDetails.runtime)}`}
                                    </Text>
                                    {selectedDetails.vote_average && (
                                        <View style={styles.ratingRow}>
                                            <Ionicons name="star" size={12} color="#FFD700" />
                                            <Text style={styles.ratingText}>{selectedDetails.vote_average.toFixed(1)}</Text>
                                        </View>
                                    )}
                                    {selectedDetails.genres && selectedDetails.genres.length > 0 && (
                                        <Text style={styles.genreText} numberOfLines={1}>{selectedDetails.genres.join(', ')}</Text>
                                    )}
                                </View>
                                <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={20} color={isFavorite ? accent : "rgba(255,255,255,0.4)"} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.sendBtn, { backgroundColor: accent }, detailsLoading && { opacity: 0.6 }]}
                                onPress={handleSend}
                                disabled={detailsLoading}
                                activeOpacity={0.9}
                            >
                                {detailsLoading ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name="send" size={18} color="#fff" />
                                        <Text style={styles.sendText}>Send</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    sheet: {
        height: '85%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    closeBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    tabBar: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    tab: {
        flex: 1,
        paddingVertical: 14,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontWeight: '600',
    },
    activeTabText: {
        color: '#fff',
        fontWeight: '700',
    },
    carouselSection: {
        height: 200,
        marginTop: 12,
    },
    carouselContent: {
        paddingHorizontal: 16,
        gap: 12,
    },
    carouselCard: {
        width: width * 0.65,
        height: 180,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#111',
    },
    carouselImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    carouselInfo: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
    },
    carouselTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 6,
    },
    carouselMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    carouselYear: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        marginHorizontal: 16,
        marginVertical: 12,
        paddingHorizontal: 12,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 10,
        color: '#fff',
        fontSize: 15,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    list: {
        flex: 1,
    },
    listContent: {
        padding: 16,
        paddingBottom: 140,
    },
    movieItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderRadius: 12,
        marginBottom: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    moviePoster: {
        width: 50,
        height: 75,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    noPoster: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    movieInfo: {
        flex: 1,
        marginLeft: 12,
    },
    movieTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    movieMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    movieYear: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    typeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingBottom: 32,
        backgroundColor: 'rgba(25,28,40,0.95)',
        gap: 12,
    },
    selectedPreview: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    selectedPoster: {
        width: 40,
        height: 60,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    selectedInfo: {
        flex: 1,
    },
    selectedTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    selectedMeta: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        marginTop: 2,
    },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    ratingText: { color: '#FFD700', fontSize: 11, fontWeight: '700' },
    genreText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 },
    sendBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
    },
    sendText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
});
