import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useRef, useState } from 'react';
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
} from 'react-native';

import { useAccent } from '../../../components/AccentContext';

const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

export type MovieData = {
    id: number;
    title: string;
    poster: string;
    runtime: number;
    year: string;
    type: 'movie' | 'tv';
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
    release_date?: string;
    first_air_date?: string;
    media_type: 'movie' | 'tv';
};

export default function ChatMoviePicker({ visible, onClose, onSelect }: Props) {
    const { accentColor } = useAccent();
    const accent = accentColor || '#e50914';

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
    const [selectedDetails, setSelectedDetails] = useState<MovieData | null>(null);
    const [loading, setLoading] = useState(false);
    const [detailsLoading, setDetailsLoading] = useState(false);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                runtime,
                year,
                type: item.media_type,
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
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Search */}
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

                    {/* Results */}
                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={accent} />
                        </View>
                    ) : results.length > 0 ? (
                        <FlatList
                            data={results}
                            keyExtractor={(item) => `${item.media_type}-${item.id}`}
                            renderItem={renderItem}
                            style={styles.list}
                            contentContainerStyle={styles.listContent}
                        />
                    ) : query.length >= 2 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="film-outline" size={40} color="rgba(255,255,255,0.3)" />
                            <Text style={styles.emptyText}>No results found</Text>
                        </View>
                    ) : (
                        <View style={styles.emptyState}>
                            <Ionicons name="videocam" size={40} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.emptyText}>Search for movies or TV shows</Text>
                        </View>
                    )}

                    {/* Selected preview & send */}
                    {selectedDetails && (
                        <View style={styles.footer}>
                            <View style={styles.selectedPreview}>
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
                                </View>
                            </View>
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
