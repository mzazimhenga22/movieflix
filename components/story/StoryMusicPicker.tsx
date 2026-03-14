import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import { usePStream } from '../../src/pstream/usePStream';
import LiquidGlass from '../app-components/LiquidGlass';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AnyVideoView = VideoView as any;

// Preview Video component
const MusicPreviewVideo = memo(({ uri, shouldPlay }: { uri: string; shouldPlay: boolean }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (shouldPlay) player.play();
    else player.pause();
  }, [shouldPlay, player]);

  return (
    <AnyVideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      showsPlaybackControls={false}
    />
  );
});

export type MusicTrack = {
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string;
    duration?: number;
};

type Props = {
    accent?: string;
    previewUri?: string | null;
    previewType?: 'image' | 'video' | null;
    previewOverlayText?: string;
    onSelect: (track: MusicTrack, startTime: number) => void;
    onSkip: () => void;
};

export default function StoryMusicPicker({ 
    accent = '#e50914', 
    previewUri, 
    previewType, 
    previewOverlayText,
    onSelect, 
    onSkip 
}: Props) {
    const { searchMusic, getMusicStream, loading } = usePStream();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<MusicTrack[]>([]);
    const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
    const [startTime, setStartTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);

    const soundRef = useRef<Audio.Sound | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (soundRef.current) {
                soundRef.current.unloadAsync().catch(() => { });
            }
        };
    }, []);

    // Search with debounce
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
                    const mapped: MusicTrack[] = songs.slice(0, 20).map((s: any) => ({
                        videoId: s.videoId || s.id,
                        title: s.title || 'Unknown',
                        artist: s.artist || s.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
                        thumbnail: s.thumbnail || s.thumbnails?.[0]?.url || '',
                        duration: s.duration || 0,
                    }));
                    setResults(mapped);
                }
            } catch (err) {
                console.warn('[StoryMusicPicker] Search error:', err);
            }
        }, 400);
    }, [searchMusic]);

    // Preview track
    const handlePreview = useCallback(async (track: MusicTrack) => {
        // Stop current playback
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
                    { shouldPlay: true, positionMillis: startTime * 1000 }
                );
                soundRef.current = sound;
                setIsPlaying(true);

                // Auto-stop after 15 seconds (story preview)
                setTimeout(async () => {
                    if (soundRef.current) {
                        await soundRef.current.stopAsync();
                        setIsPlaying(false);
                    }
                }, 15000);
            }
        } catch (err) {
            console.warn('[StoryMusicPicker] Preview error:', err);
        } finally {
            setPreviewLoading(false);
        }
    }, [selectedTrack, isPlaying, startTime, getMusicStream]);

    // Use selected track
    const handleUseTrack = useCallback(() => {
        if (selectedTrack) {
            // Stop playback
            if (soundRef.current) {
                soundRef.current.stopAsync().catch(() => { });
            }
            onSelect(selectedTrack, startTime);
        }
    }, [selectedTrack, startTime, onSelect]);

    const renderTrackItem = ({ item }: { item: MusicTrack }) => {
        const isSelected = selectedTrack?.videoId === item.videoId;
        const isCurrentlyPlaying = isSelected && isPlaying;

        return (
            <TouchableOpacity
                style={[styles.trackItem, isSelected && styles.trackItemSelected]}
                activeOpacity={0.8}
                onPress={() => handlePreview(item)}
            >
                <Image source={{ uri: item.thumbnail }} style={styles.trackThumb} />
                <View style={styles.trackInfo}>
                    <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
                </View>
                <View style={styles.trackAction}>
                    {previewLoading && isSelected ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Ionicons
                            name={isCurrentlyPlaying ? 'pause-circle' : 'play-circle'}
                            size={32}
                            color={isSelected ? accent : 'rgba(255,255,255,0.7)'}
                        />
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Instagram-like Story Preview */}
            {previewUri && (
                <View style={styles.previewSection}>
                    <View style={styles.previewContainer}>
                        {previewType === 'video' ? (
                            <MusicPreviewVideo uri={previewUri} shouldPlay={isPlaying} />
                        ) : (
                            <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        )}
                        
                        {/* Gradient overlay */}
                        <LinearGradient
                            colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.7)']}
                            style={StyleSheet.absoluteFill}
                        />
                        
                        {/* Overlay Text */}
                        {previewOverlayText && (
                            <LiquidGlass
                                cornerRadius={12}
                                blurRadius={50}
                                tintOpacity={0.5}
                                borderOpacity={0.2}
                                style={styles.overlayTextChip}
                            >
                                <Text style={styles.overlayTextPreview} numberOfLines={2}>
                                    {previewOverlayText}
                                </Text>
                            </LiquidGlass>
                        )}
                        
                        {/* Now Playing Badge */}
                        {selectedTrack && (
                            <View style={styles.nowPlayingBadge}>
                                <View style={styles.musicVisualizer}>
                                    {[0, 1, 2, 3].map((i) => (
                                        <View 
                                            key={i} 
                                            style={[
                                                styles.visualizerBar, 
                                                { 
                                                    backgroundColor: accent,
                                                    height: isPlaying ? 8 + Math.random() * 8 : 4,
                                                }
                                            ]} 
                                        />
                                    ))}
                                </View>
                                <Text style={styles.nowPlayingText} numberOfLines={1}>
                                    {isPlaying ? '♫ ' : ''}{selectedTrack.title}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            )}

            {/* Search Bar */}
            <View style={[styles.searchContainer, previewUri && styles.searchWithPreview]}>
                <Ionicons name="search" size={18} color="rgba(255,255,255,0.6)" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search songs..."
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={query}
                    onChangeText={handleSearch}
                    returnKeyType="search"
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
                        <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Results */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={accent} />
                    <Text style={styles.loadingText}>Searching...</Text>
                </View>
            ) : results.length > 0 ? (
                <FlatList
                    data={results}
                    keyExtractor={(item) => item.videoId}
                    renderItem={renderTrackItem}
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            ) : query.length >= 2 ? (
                <View style={styles.emptyState}>
                    <Ionicons name="musical-notes-outline" size={48} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.emptyText}>No songs found</Text>
                </View>
            ) : (
                <View style={styles.emptyState}>
                    <Ionicons name="musical-notes" size={48} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.emptyTitle}>Add music to your story</Text>
                    <Text style={styles.emptyText}>Search for a song to play over your story</Text>
                </View>
            )}

            {/* Bottom Actions */}
            <View style={styles.bottomActions}>
                <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
                    <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>

                {selectedTrack && (
                    <TouchableOpacity style={styles.useBtn} activeOpacity={0.9} onPress={handleUseTrack}>
                        <LinearGradient
                            colors={['#ff8a00', accent]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.useBtnGradient}
                        >
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={styles.useBtnText}>Use this song</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        paddingHorizontal: 12,
        marginHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
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
        gap: 12,
    },
    loadingText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
    },
    list: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 80,
    },
    trackItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        marginBottom: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    trackItemSelected: {
        backgroundColor: 'rgba(229,9,20,0.15)',
        borderColor: 'rgba(229,9,20,0.4)',
    },
    trackThumb: {
        width: 50,
        height: 50,
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
    trackAction: {
        marginLeft: 8,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 8,
    },
    emptyTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
        marginTop: 8,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        textAlign: 'center',
    },
    bottomActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
    },
    skipBtn: {
        paddingVertical: 12,
        paddingHorizontal: 20,
    },
    skipText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 15,
        fontWeight: '600',
    },
    useBtn: {
        flex: 1,
        borderRadius: 14,
        overflow: 'hidden',
    },
    useBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        gap: 8,
    },
    useBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    // Instagram-like preview styles
    previewSection: {
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    previewContainer: {
        width: '100%',
        aspectRatio: 9 / 16,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    overlayTextChip: {
        position: 'absolute',
        bottom: 20,
        left: 16,
        right: 16,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    overlayTextPreview: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        textAlign: 'center',
    },
    nowPlayingBadge: {
        position: 'absolute',
        top: 16,
        left: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    nowPlayingText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        maxWidth: 140,
    },
    musicVisualizer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        width: 20,
    },
    visualizerBar: {
        width: 3,
        borderRadius: 1.5,
    },
    searchWithPreview: {
        marginTop: 0,
    },
});
