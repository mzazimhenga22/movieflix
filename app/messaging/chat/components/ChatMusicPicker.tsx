import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

import { usePStream } from '../../../../src/pstream/usePStream';
import { useAccent } from '../../../components/AccentContext';

export type MusicData = {
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string;
};

type Props = {
    visible: boolean;
    onClose: () => void;
    onSelect: (music: MusicData) => void;
};

export default function ChatMusicPicker({ visible, onClose, onSelect }: Props) {
    const { accentColor } = useAccent();
    const accent = accentColor || '#e50914';
    const { searchMusic, getMusicStream, loading } = usePStream();

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<MusicData[]>([]);
    const [selectedTrack, setSelectedTrack] = useState<MusicData | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);

    const soundRef = useRef<Audio.Sound | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (soundRef.current) {
                soundRef.current.unloadAsync().catch(() => { });
            }
        };
    }, []);

    useEffect(() => {
        if (!visible) {
            // Reset on close
            if (soundRef.current) {
                soundRef.current.stopAsync().catch(() => { });
            }
            setIsPlaying(false);
            setSelectedTrack(null);
        }
    }, [visible]);

    const handleSearch = useCallback(async (text: string) => {
        setQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (text.trim().length < 2) {
            setResults([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            try {
                const songs = await searchMusic(text.trim());
                if (songs && Array.isArray(songs)) {
                    const mapped: MusicData[] = songs.slice(0, 15).map((s: any) => ({
                        videoId: s.videoId || s.id,
                        title: s.title || 'Unknown',
                        artist: s.artist || s.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
                        thumbnail: s.thumbnail || s.thumbnails?.[0]?.url || '',
                    }));
                    setResults(mapped);
                }
            } catch (err) {
                console.warn('[ChatMusicPicker] Search error:', err);
            }
        }, 400);
    }, [searchMusic]);

    const handlePreview = useCallback(async (track: MusicData) => {
        if (soundRef.current) {
            await soundRef.current.unloadAsync();
            soundRef.current = null;
        }

        if (selectedTrack?.videoId === track.videoId && isPlaying) {
            setIsPlaying(false);
            return;
        }

        setSelectedTrack(track);
        setPreviewLoading(true);
        setIsPlaying(false);

        try {
            const streamResult = await getMusicStream(track.videoId, 'audio');
            if (streamResult?.uri) {
                const { sound } = await Audio.Sound.createAsync(
                    { uri: streamResult.uri },
                    { shouldPlay: true }
                );
                soundRef.current = sound;
                setIsPlaying(true);

                setTimeout(async () => {
                    if (soundRef.current) {
                        await soundRef.current.stopAsync();
                        setIsPlaying(false);
                    }
                }, 15000);
            }
        } catch (err) {
            console.warn('[ChatMusicPicker] Preview error:', err);
        } finally {
            setPreviewLoading(false);
        }
    }, [selectedTrack, isPlaying, getMusicStream]);

    const handleSelect = useCallback(() => {
        if (selectedTrack) {
            if (soundRef.current) {
                soundRef.current.stopAsync().catch(() => { });
            }
            onSelect(selectedTrack);
            onClose();
        }
    }, [selectedTrack, onSelect, onClose]);

    const renderItem = ({ item }: { item: MusicData }) => {
        const isSelected = selectedTrack?.videoId === item.videoId;
        const isCurrentlyPlaying = isSelected && isPlaying;

        return (
            <TouchableOpacity
                style={[styles.trackItem, isSelected && { borderColor: accent, backgroundColor: `${accent}15` }]}
                activeOpacity={0.8}
                onPress={() => handlePreview(item)}
            >
                <Image source={{ uri: item.thumbnail }} style={styles.trackThumb} />
                <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
                </View>
                {previewLoading && isSelected ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <Ionicons
                        name={isCurrentlyPlaying ? 'pause-circle' : 'play-circle'}
                        size={28}
                        color={isSelected ? accent : 'rgba(255,255,255,0.6)'}
                    />
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
                        <Text style={styles.headerTitle}>Share Music</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Search */}
                    <View style={styles.searchContainer}>
                        <Ionicons name="search" size={18} color="rgba(255,255,255,0.5)" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search songs..."
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
                            keyExtractor={(item) => item.videoId}
                            renderItem={renderItem}
                            style={styles.list}
                            contentContainerStyle={styles.listContent}
                        />
                    ) : query.length >= 2 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="musical-notes-outline" size={40} color="rgba(255,255,255,0.3)" />
                            <Text style={styles.emptyText}>No songs found</Text>
                        </View>
                    ) : (
                        <View style={styles.emptyState}>
                            <Ionicons name="musical-notes" size={40} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.emptyText}>Search for a song to share</Text>
                        </View>
                    )}

                    {/* Send button */}
                    {selectedTrack && (
                        <View style={styles.footer}>
                            <TouchableOpacity
                                style={[styles.sendBtn, { backgroundColor: accent }]}
                                onPress={handleSelect}
                                activeOpacity={0.9}
                            >
                                <Ionicons name="send" size={18} color="#fff" />
                                <Text style={styles.sendText}>Send Song</Text>
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
        height: '80%',
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
        paddingBottom: 100,
    },
    trackItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderRadius: 12,
        marginBottom: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    trackThumb: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    trackInfo: {
        flex: 1,
        marginLeft: 12,
    },
    trackTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    trackArtist: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        marginTop: 2,
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
        padding: 16,
        paddingBottom: 32,
        backgroundColor: 'rgba(25,28,40,0.95)',
    },
    sendBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 14,
    },
    sendText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});
