import { useAccent } from '@/components/app-components/AccentContext';
import LiquidGlass from '@/components/app-components/LiquidGlass';
import { IMAGE_BASE_URL } from '@/constants/api';
import { Media } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useRef } from 'react';
import {
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';

interface EditorialCardProps {
    movie: Media;
    onPress: (item: Media) => void;
}

const EditorialCard: React.FC<EditorialCardProps> = ({ movie, onPress }) => {
    const { width: screenWidth } = useWindowDimensions();
    const { accentColor } = useAccent();
    const accent = accentColor || '#e50914';
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const cardHeight = Math.round(screenWidth * 0.55);

    const handlePressIn = useCallback(() => {
        Animated.spring(scaleAnim, {
            toValue: 0.97,
            tension: 300,
            friction: 10,
            useNativeDriver: true,
        }).start();
    }, [scaleAnim]);

    const handlePressOut = useCallback(() => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 200,
            friction: 8,
            useNativeDriver: true,
        }).start();
    }, [scaleAnim]);

    const rating = (movie.vote_average || 0).toFixed(1);
    const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
    const overview = movie.overview || '';
    const isHighRated = (movie.vote_average || 0) >= 7.5;

    return (
        <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
            <TouchableOpacity
                activeOpacity={1}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={() => onPress(movie)}
                style={[styles.card, { height: cardHeight }]}
            >
                <ExpoImage
                    source={{ uri: `${IMAGE_BASE_URL}${movie.backdrop_path || movie.poster_path}` }}
                    style={StyleSheet.absoluteFillObject}
                    contentFit="cover"
                    transition={300}
                    cachePolicy="memory-disk"
                />

                {/* Cinematic gradient overlay */}
                <LinearGradient
                    colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.92)']}
                    locations={[0, 0.4, 1]}
                    style={StyleSheet.absoluteFillObject}
                />

                {/* Side accent strip */}
                <LinearGradient
                    colors={[`${accent}60`, 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.15, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                />

                {/* "EDITOR'S PICK" tag */}
                <View style={styles.tagContainer}>
                    <LiquidGlass
                        tintOpacity={0.2}
                        tintColor={accent}
                        cornerRadius={8}
                        borderOpacity={0.3}
                        glowColor={accent}
                        glowIntensity={0.4}
                        fastMode={true}
                        style={styles.tagGlass}
                    >
                        <Ionicons name="diamond" size={10} color={accent} />
                        <Text style={[styles.tagText, { color: accent }]}>EDITOR'S PICK</Text>
                    </LiquidGlass>
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <Text style={styles.title} numberOfLines={2}>
                        {movie.title || movie.name}
                    </Text>

                    <View style={styles.metaRow}>
                        <View style={styles.ratingBadge}>
                            <Ionicons name="star" size={12} color={isHighRated ? '#ffd700' : '#fff'} />
                            <Text style={[styles.ratingText, isHighRated && { color: '#ffd700' }]}>{rating}</Text>
                        </View>
                        {Boolean(year) && <Text style={styles.yearText}>{year}</Text>}
                        <Text style={styles.typeText}>
                            {movie.media_type === 'tv' ? 'Series' : 'Movie'}
                        </Text>
                    </View>

                    {overview.length > 0 && (
                        <Text style={styles.overview} numberOfLines={2}>
                            {overview}
                        </Text>
                    )}

                    <View style={[styles.ctaButton, { backgroundColor: accent }]}>
                        <Ionicons name="play" size={14} color="#fff" />
                        <Text style={styles.ctaText}>Watch Now</Text>
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: 16,
        marginVertical: 16,
    },
    card: {
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: '#1a1a1e',
    },
    tagContainer: {
        position: 'absolute',
        top: 14,
        left: 14,
    },
    tagGlass: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    tagText: {
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 1.2,
    },
    content: {
        position: 'absolute',
        bottom: 18,
        left: 18,
        right: 18,
    },
    title: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '900',
        letterSpacing: 0.3,
        marginBottom: 8,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 6,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    ratingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 8,
    },
    ratingText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '800',
    },
    yearText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontWeight: '600',
    },
    typeText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    overview: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 12,
    },
    ctaButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 14,
    },
    ctaText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
});

export default memo(EditorialCard);
