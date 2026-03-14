import { useAccent } from '@/components/app-components/AccentContext';
import LiquidGlass from '@/components/app-components/LiquidGlass';
import { IMAGE_BASE_URL } from '@/constants/api';
import { useMyList } from '@/src/store/myListStore';
import { Media } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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

interface DuoShowcaseProps {
    title: string;
    movies: Media[];
    onItemPress: (item: Media) => void;
    maxItems?: number;
}

const DuoCard = memo(function DuoCard({
    item,
    cardWidth,
    accent,
    onPress,
}: {
    item: Media;
    cardWidth: number;
    accent: string;
    onPress: () => void;
}) {
    const { isInList, toggle } = useMyList(item.id);
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const cardHeight = Math.round(cardWidth * 0.72);
    const rating = (item.vote_average || 0).toFixed(1);
    const isHighRated = (item.vote_average || 0) >= 7.5;

    const handlePressIn = useCallback(() => {
        Animated.spring(scaleAnim, {
            toValue: 0.96,
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
        <Animated.View style={[styles.duoCardWrap, { width: cardWidth, transform: [{ scale: scaleAnim }] }]}>
            <TouchableOpacity
                activeOpacity={1}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={onPress}
                style={[styles.duoCard, { height: cardHeight }]}
            >
                <LiquidGlass
                    glowColor={accent}
                    tintOpacity={0.12}
                    cornerRadius={18}
                    glowIntensity={0.3}
                    borderOpacity={0.2}
                    fastMode={true}
                    style={styles.duoGlass}
                >
                    <ExpoImage
                        source={{ uri: `${IMAGE_BASE_URL}${item.backdrop_path || item.poster_path}` }}
                        style={styles.duoImage}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                    />
                    <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.92)']}
                        locations={[0, 0.5, 1]}
                        style={StyleSheet.absoluteFillObject}
                    />

                    {/* Rating badge */}
                    <View style={styles.duoRating}>
                        <Ionicons name="star" size={11} color={isHighRated ? '#ffd700' : '#fff'} />
                        <Text style={[styles.duoRatingText, isHighRated && { color: '#ffd700' }]}>{rating}</Text>
                    </View>

                    {/* My List */}
                    <TouchableOpacity
                        style={styles.duoListBtn}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            toggle(item);
                        }}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <View style={[styles.duoListCircle, isInList && { backgroundColor: accent }]}>
                            <Ionicons name={isInList ? 'checkmark' : 'add'} size={14} color="#fff" />
                        </View>
                    </TouchableOpacity>

                    {/* Bottom content */}
                    <View style={styles.duoContent}>
                        <Text style={styles.duoTitle} numberOfLines={2}>
                            {item.title || item.name}
                        </Text>
                        <View style={styles.duoMeta}>
                            <View style={styles.duoTypeBadge}>
                                <Text style={styles.duoTypeText}>
                                    {item.media_type === 'tv' ? 'Series' : 'Movie'}
                                </Text>
                            </View>
                            {Boolean(item.release_date || item.first_air_date) && (
                                <Text style={styles.duoYear}>
                                    {(item.release_date || item.first_air_date || '').slice(0, 4)}
                                </Text>
                            )}
                        </View>
                    </View>
                </LiquidGlass>
            </TouchableOpacity>
        </Animated.View>
    );
});

const DuoShowcase: React.FC<DuoShowcaseProps> = ({
    title,
    movies,
    onItemPress,
    maxItems = 6,
}) => {
    const { width: screenWidth } = useWindowDimensions();
    const { accentColor } = useAccent();
    const accent = accentColor || '#e50914';
    const gap = 12;
    const padding = 18;
    const cardWidth = Math.floor((screenWidth - padding * 2 - gap) / 2);
    const items = movies.slice(0, maxItems);

    if (items.length < 2) return null;

    // Build pairs
    const pairs: Media[][] = [];
    for (let i = 0; i < items.length; i += 2) {
        const pair = items.slice(i, i + 2);
        if (pair.length === 2) pairs.push(pair);
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <View style={[styles.headerDot, { backgroundColor: accent }]} />
                    <Text style={styles.headerTitle}>{title}</Text>
                </View>
            </View>

            <View style={[styles.grid, { paddingHorizontal: padding, gap }]}>
                {pairs.map((pair, pairIdx) => (
                    <View key={pairIdx} style={[styles.row, { gap }]}>
                        {pair.map((item) => (
                            <DuoCard
                                key={item.id}
                                item={item}
                                cardWidth={cardWidth}
                                accent={accent}
                                onPress={() => onItemPress(item)}
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
        marginTop: 24,
        marginBottom: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        marginBottom: 14,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        shadowOpacity: 0.6,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
    },
    headerTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    grid: {
        gap: 12,
    },
    row: {
        flexDirection: 'row',
    },
    duoCardWrap: {},
    duoCard: {
        borderRadius: 18,
        overflow: 'hidden',
    },
    duoGlass: {
        flex: 1,
        borderRadius: 18,
        overflow: 'hidden',
    },
    duoImage: {
        width: '100%',
        height: '100%',
    },
    duoRating: {
        position: 'absolute',
        top: 8,
        left: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 10,
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    duoRatingText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '800',
    },
    duoListBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
    },
    duoListCircle: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    duoContent: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        right: 8,
    },
    duoTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '800',
        marginBottom: 4,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    duoMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    duoTypeBadge: {
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    duoTypeText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    duoYear: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 10,
        fontWeight: '600',
    },
});

export default memo(DuoShowcase);
