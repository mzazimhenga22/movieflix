import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Media } from '../../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.5;

interface ResultCard3DProps {
    item: Media;
    onPress: () => void;
    index: number;
    accentColor?: string;
}

const ResultCard3D: React.FC<ResultCard3DProps> = ({
    item,
    onPress,
    index,
    accentColor = '#e50914',
}) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const rotateX = useRef(new Animated.Value(0)).current;
    const rotateY = useRef(new Animated.Value(0)).current;
    const shimmerAnim = useRef(new Animated.Value(0)).current;
    const [isPressed, setIsPressed] = useState(false);

    const posterUrl = item.poster_path
        ? item.poster_path.startsWith('http')
            ? item.poster_path
            : `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : null;

    const title = item.title || item.name || 'Unknown';
    const year = (item.release_date || item.first_air_date)?.split('-')[0];
    const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
    const isMusic = item.media_type === 'music';

    const handlePressIn = () => {
        setIsPressed(true);
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 0.95,
                useNativeDriver: true,
            }),
            Animated.timing(rotateX, {
                toValue: 5,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(rotateY, {
                toValue: -3,
                duration: 150,
                useNativeDriver: true,
            }),
        ]).start();

        // Shimmer effect
        Animated.loop(
            Animated.timing(shimmerAnim, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
            })
        ).start();
    };

    const handlePressOut = () => {
        setIsPressed(false);
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 200,
                friction: 10,
                useNativeDriver: true,
            }),
            Animated.spring(rotateX, {
                toValue: 0,
                useNativeDriver: true,
            }),
            Animated.spring(rotateY, {
                toValue: 0,
                useNativeDriver: true,
            }),
        ]).start();
        shimmerAnim.stopAnimation();
        shimmerAnim.setValue(0);
    };

    const shimmerTranslate = shimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-CARD_WIDTH, CARD_WIDTH * 2],
    });

    return (
        <Animated.View
            style={[
                styles.cardContainer,
                {
                    transform: [
                        { scale: scaleAnim },
                        { perspective: 1000 },
                        {
                            rotateX: rotateX.interpolate({
                                inputRange: [-10, 10],
                                outputRange: ['-10deg', '10deg'],
                            }),
                        },
                        {
                            rotateY: rotateY.interpolate({
                                inputRange: [-10, 10],
                                outputRange: ['-10deg', '10deg'],
                            }),
                        },
                    ],
                },
            ]}
        >
            <TouchableOpacity
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={1}
                style={styles.touchable}
            >
                <View style={styles.card}>
                    {/* Poster/Thumbnail */}
                    {posterUrl ? (
                        <Image
                            source={{ uri: posterUrl }}
                            style={styles.poster}
                            contentFit="cover"
                            transition={300}
                        />
                    ) : (
                        <View style={styles.posterPlaceholder}>
                            <Ionicons
                                name={isMusic ? 'musical-notes' : 'film'}
                                size={40}
                                color="rgba(255,255,255,0.3)"
                            />
                        </View>
                    )}

                    {/* Gradient overlay */}
                    <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,0.95)']}
                        style={styles.gradient}
                    />

                    {/* Shimmer effect */}
                    {isPressed && (
                        <Animated.View
                            style={[
                                styles.shimmer,
                                {
                                    transform: [{ translateX: shimmerTranslate }],
                                },
                            ]}
                        >
                            <LinearGradient
                                colors={[
                                    'transparent',
                                    'rgba(255,255,255,0.2)',
                                    'transparent',
                                ]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.shimmerGradient}
                            />
                        </Animated.View>
                    )}

                    {/* Content */}
                    <View style={styles.content}>
                        {/* Media type badge */}
                        <View
                            style={[
                                styles.typeBadge,
                                { backgroundColor: isMusic ? '#1DB954' : accentColor },
                            ]}
                        >
                            <Text style={styles.typeBadgeText}>
                                {isMusic
                                    ? 'SONG'
                                    : item.media_type === 'tv'
                                        ? 'TV'
                                        : 'MOVIE'}
                            </Text>
                        </View>

                        {/* Rating */}
                        {rating && !isMusic && (
                            <View style={styles.ratingBadge}>
                                <Ionicons name="star" size={10} color="#ffc107" />
                                <Text style={styles.ratingText}>{rating}</Text>
                            </View>
                        )}

                        {/* Title and metadata */}
                        <View style={styles.textContent}>
                            <Text style={styles.title} numberOfLines={2}>
                                {title}
                            </Text>
                            {year && <Text style={styles.year}>{year}</Text>}
                            {isMusic && item.overview && (
                                <Text style={styles.artist} numberOfLines={1}>
                                    {item.overview}
                                </Text>
                            )}
                        </View>

                        {/* Play button */}
                        <View style={styles.playButton}>
                            <BlurView intensity={40} tint="dark" style={styles.playBlur}>
                                <Ionicons name="play" size={18} color="#fff" />
                            </BlurView>
                        </View>
                    </View>

                    {/* Border glow on press */}
                    {isPressed && (
                        <View
                            style={[
                                styles.glowBorder,
                                { borderColor: accentColor },
                            ]}
                        />
                    )}
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    cardContainer: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        marginBottom: 16,
    },
    touchable: {
        flex: 1,
    },
    card: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#1a1a2e',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
    },
    poster: {
        ...StyleSheet.absoluteFillObject,
    },
    posterPlaceholder: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#2a2a4a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    gradient: {
        ...StyleSheet.absoluteFillObject,
    },
    shimmer: {
        ...StyleSheet.absoluteFillObject,
    },
    shimmerGradient: {
        width: 60,
        height: '100%',
    },
    content: {
        ...StyleSheet.absoluteFillObject,
        padding: 12,
        justifyContent: 'flex-end',
    },
    typeBadge: {
        position: 'absolute',
        top: 10,
        left: 10,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    typeBadgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    ratingBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
    },
    ratingText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    textContent: {
        marginBottom: 8,
    },
    title: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 18,
        marginBottom: 4,
    },
    year: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
    },
    artist: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
        marginTop: 2,
    },
    playButton: {
        position: 'absolute',
        right: 10,
        bottom: 10,
    },
    playBlur: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    glowBorder: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 16,
        borderWidth: 2,
        pointerEvents: 'none',
    },
});

export default ResultCard3D;
