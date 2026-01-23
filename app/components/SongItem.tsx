import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { IMAGE_BASE_URL } from '../../constants/api';
import { Media } from '../../types';

interface SongCardProps {
    item: Media;
    accentColor: string;
    onPress: () => void;
    width?: number;
}

export const SongCard = memo(function SongCard({
    item,
    accentColor,
    onPress,
    width = 140,
}: SongCardProps) {
    const posterUri = item.poster_path ? (item.poster_path.startsWith('http') ? item.poster_path : `${IMAGE_BASE_URL}${item.poster_path}`) : null;
    const title = item.title || item.name || 'Unknown';

    return (
        <TouchableOpacity style={[styles.songCard, { width }]} onPress={onPress} activeOpacity={0.8}>
            <View style={[styles.songCardImage, { width, height: width }]}>
                {posterUri ? (
                    <ExpoImage source={{ uri: posterUri }} style={styles.songCardImg} contentFit="cover" />
                ) : (
                    <View style={[styles.songCardImg, styles.thumbPlaceholder]}>
                        <Ionicons name="musical-notes" size={width * 0.17} color="rgba(255,255,255,0.3)" />
                    </View>
                )}
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.songCardGradient} />
                <View style={[styles.songCardPlayBtn, { backgroundColor: accentColor }]}>
                    <FontAwesome name="play" size={width * 0.07} color="#fff" />
                </View>
            </View>
            <Text style={styles.songCardTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.songCardSubtitle}>Soundtrack</Text>
        </TouchableOpacity>
    );
});

interface SongRowProps {
    item: Media;
    index: number;
    accentColor: string;
    onPress: () => void;
}

export const SongRow = memo(function SongRow({
    item,
    index,
    accentColor,
    onPress,
}: SongRowProps) {
    const posterUri = item.poster_path ? (item.poster_path.startsWith('http') ? item.poster_path : `${IMAGE_BASE_URL}${item.poster_path}`) : null;
    const title = item.title || item.name || 'Unknown';
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

    return (
        <TouchableOpacity style={styles.songRow} onPress={onPress} activeOpacity={0.7}>
            <Text style={styles.songIndex}>{String(index + 1).padStart(2, '0')}</Text>
            <View style={styles.songThumb}>
                {posterUri ? (
                    <ExpoImage source={{ uri: posterUri }} style={styles.songThumbImg} contentFit="cover" />
                ) : (
                    <View style={[styles.songThumbImg, styles.thumbPlaceholder]}>
                        <Ionicons name="musical-notes" size={16} color="rgba(255,255,255,0.3)" />
                    </View>
                )}
            </View>
            <View style={styles.songMeta}>
                <Text style={styles.songTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.songSubtitle} numberOfLines={1}>{year ? `${year} • ` : ''}{item.media_type === 'music' ? 'YT Music' : 'Soundtrack'}</Text>
            </View>
            {rating && (
                <View style={styles.ratingPill}>
                    <Ionicons name="star" size={10} color="#fbbf24" />
                    <Text style={styles.ratingText}>{rating}</Text>
                </View>
            )}
            <View style={[styles.miniPlayBtn, { backgroundColor: accentColor }]}>
                <FontAwesome name="play" size={12} color="#fff" />
            </View>
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    songCard: {
        marginRight: 14,
    },
    songCardImage: {
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginBottom: 10,
    },
    songCardImg: {
        width: '100%',
        height: '100%',
    },
    songCardGradient: {
        ...StyleSheet.absoluteFillObject,
    },
    songCardPlayBtn: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    songCardTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    songCardSubtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
    },
    thumbPlaceholder: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    songRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    songIndex: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        fontWeight: '700',
        width: 28,
    },
    songThumb: {
        width: 52,
        height: 52,
        borderRadius: 12,
        overflow: 'hidden',
        marginRight: 14,
    },
    songThumbImg: {
        width: '100%',
        height: '100%',
    },
    songMeta: {
        flex: 1,
    },
    songTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    songSubtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
    },
    ratingPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(251,191,36,0.15)',
        marginRight: 12,
    },
    ratingText: {
        color: '#fbbf24',
        fontSize: 11,
        fontWeight: '700',
    },
    miniPlayBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
