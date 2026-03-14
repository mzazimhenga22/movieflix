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
    useWindowDimensions
} from 'react-native';

interface GenreShowcaseProps {
    title: string;
    icon: string;
    themeColors: [string, string]; // gradient pair
    movies: Media[];
    onItemPress: (item: Media) => void;
    myListIds?: number[];
    onToggleMyList?: (item: Media) => void;
}

const HeroCard = memo(function HeroCard({
    item,
    width,
    height,
    accent,
    isInList,
    onPress,
    onToggleList,
}: {
    item: Media;
    width: number;
    height: number;
    accent: string;
    isInList: boolean;
    onPress: () => void;
    onToggleList: () => void;
}) {
    const scaleAnim = useRef(new Animated.Value(1)).current;

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

    const rating = (item.vote_average || 0).toFixed(1);

    return (
        <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
            <TouchableOpacity
                activeOpacity={1}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={onPress}
                style={[styles.heroCard, { width, height }]}
            >
                <ExpoImage
                    source={{ uri: `${IMAGE_BASE_URL}${item.backdrop_path || item.poster_path}` }}
                    style={StyleSheet.absoluteFillObject}
                    contentFit="cover"
                    transition={250}
                    cachePolicy="memory-disk"
                />
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.95)']}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFillObject}
                />

                {/* Rating pill */}
                <View style={styles.heroPill}>
                    <Ionicons name="star" size={13} color="#ffd700" />
                    <Text style={styles.heroPillText}>{rating}</Text>
                </View>

                {/* My List */}
                <TouchableOpacity
                    style={styles.heroListBtn}
                    onPress={onToggleList}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <View style={[styles.heroListCircle, isInList && { backgroundColor: accent }]}>
                        <Ionicons name={isInList ? 'checkmark' : 'add'} size={16} color="#fff" />
                    </View>
                </TouchableOpacity>

                <View style={styles.heroContent}>
                    <Text style={styles.heroTitle} numberOfLines={2}>
                        {item.title || item.name}
                    </Text>
                    {item.overview ? (
                        <Text style={styles.heroOverview} numberOfLines={2}>
                            {item.overview}
                        </Text>
                    ) : null}
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
});

const SmallCard = memo(function SmallCard({
    item,
    size,
    isInList,
    accent,
    onPress,
    onToggleList,
}: {
    item: Media;
    size: number;
    isInList: boolean;
    accent: string;
    onPress: () => void;
    onToggleList: () => void;
}) {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = useCallback(() => {
        Animated.spring(scaleAnim, {
            toValue: 0.94,
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

    return (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
                activeOpacity={1}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={onPress}
                style={[styles.smallCard, { width: size, height: Math.round(size * 1.45) }]}
            >
                <ExpoImage
                    source={{ uri: `${IMAGE_BASE_URL}${item.poster_path}` }}
                    style={styles.smallImage}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                />
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.85)']}
                    locations={[0.6, 1]}
                    style={StyleSheet.absoluteFillObject}
                />
                <TouchableOpacity
                    style={styles.smallListBtn}
                    onPress={onToggleList}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                    <View style={[styles.smallListCircle, isInList && { backgroundColor: accent }]}>
                        <Ionicons name={isInList ? 'checkmark' : 'add'} size={12} color="#fff" />
                    </View>
                </TouchableOpacity>
                <Text style={styles.smallTitle} numberOfLines={2}>
                    {item.title || item.name}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );
});

const GenreShowcase: React.FC<GenreShowcaseProps> = ({
    title,
    icon,
    themeColors,
    movies,
    onItemPress,
    myListIds = [],
    onToggleMyList,
}) => {
    const { width: screenWidth } = useWindowDimensions();
    const { accentColor } = useAccent();
    const accent = accentColor || themeColors[0];

    const heroMovie = movies[0];
    const gridMovies = movies.slice(1, 7); // Up to 6 small cards
    const heroWidth = screenWidth - 36;
    const heroHeight = Math.round(heroWidth * 0.55);
    const gap = 10;
    const smallSize = Math.floor((screenWidth - 36 - gap * 2) / 3);

    if (!heroMovie || movies.length < 3) return null;

    // Build rows of 3
    const rows: Media[][] = [];
    for (let i = 0; i < gridMovies.length; i += 3) {
        rows.push(gridMovies.slice(i, i + 3));
    }

    return (
        <View style={styles.container}>
            {/* Themed background */}
            <LinearGradient
                colors={[`${themeColors[0]}18`, `${themeColors[1]}08`, 'transparent']}
                style={styles.themeBg}
            />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <LiquidGlass
                        glowColor={themeColors[0]}
                        tintOpacity={0.25}
                        tintColor={themeColors[0]}
                        cornerRadius={12}
                        glowIntensity={0.5}
                        borderOpacity={0.4}
                        fastMode={true}
                        style={styles.iconBubble}
                    >
                        <Text style={styles.iconEmoji}>{icon}</Text>
                    </LiquidGlass>
                    <View>
                        <Text style={styles.headerTitle}>{title}</Text>
                        <Text style={[styles.headerSub, { color: themeColors[0] }]}>
                            {movies.length} titles
                        </Text>
                    </View>
                </View>
                <LinearGradient
                    colors={themeColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.headerLine}
                />
            </View>

            {/* Hero card */}
            <View style={styles.heroWrap}>
                <HeroCard
                    item={heroMovie}
                    width={heroWidth}
                    height={heroHeight}
                    accent={accent}
                    isInList={myListIds.includes(heroMovie.id)}
                    onPress={() => onItemPress(heroMovie)}
                    onToggleList={() => onToggleMyList?.(heroMovie)}
                />
            </View>

            {/* Small cards grid */}
            <View style={[styles.gridWrap, { paddingHorizontal: 18 }]}>
                {rows.map((row, rowIdx) => (
                    <View key={rowIdx} style={[styles.gridRow, { gap }]}>
                        {row.map((item) => (
                            <SmallCard
                                key={item.id}
                                item={item}
                                size={smallSize}
                                isInList={myListIds.includes(item.id)}
                                accent={accent}
                                onPress={() => onItemPress(item)}
                                onToggleList={() => onToggleMyList?.(item)}
                            />
                        ))}
                    </View>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 12,
        overflow: 'hidden',
    },
    themeBg: {
        ...StyleSheet.absoluteFillObject,
    },
    header: {
        paddingHorizontal: 18,
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconBubble: {
        width: 42,
        height: 42,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconEmoji: {
        fontSize: 22,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 0.3,
    },
    headerSub: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginTop: 1,
    },
    headerLine: {
        flex: 1,
        height: 2,
        borderRadius: 1,
        marginLeft: 14,
        opacity: 0.4,
    },
    heroWrap: {
        paddingHorizontal: 18,
        marginBottom: 10,
    },
    heroCard: {
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#1a1a1e',
    },
    heroPill: {
        position: 'absolute',
        top: 10,
        left: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 0.5,
        borderColor: 'rgba(255,215,0,0.3)',
    },
    heroPillText: {
        color: '#ffd700',
        fontSize: 12,
        fontWeight: '800',
    },
    heroListBtn: {
        position: 'absolute',
        top: 10,
        right: 10,
    },
    heroListCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroContent: {
        position: 'absolute',
        bottom: 14,
        left: 14,
        right: 14,
    },
    heroTitle: {
        color: '#fff',
        fontSize: 19,
        fontWeight: '900',
        marginBottom: 4,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 6,
    },
    heroOverview: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        lineHeight: 17,
    },
    gridWrap: {
        gap: 10,
    },
    gridRow: {
        flexDirection: 'row',
    },
    smallCard: {
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#1a1a1e',
    },
    smallImage: {
        width: '100%',
        height: '100%',
        borderRadius: 14,
    },
    smallListBtn: {
        position: 'absolute',
        top: 6,
        right: 6,
    },
    smallListCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    smallTitle: {
        position: 'absolute',
        bottom: 6,
        left: 6,
        right: 6,
        color: '#fff',
        fontSize: 11,
        fontWeight: '800',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
});

export default memo(GenreShowcase);
