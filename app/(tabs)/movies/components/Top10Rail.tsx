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

interface Top10RailProps {
    movies: Media[];
    onItemPress: (item: Media) => void;
    myListIds?: number[];
    onToggleMyList?: (item: Media) => void;
}

const RANK_COLORS = [
    ['#FFD700', '#FF8C00'], // Gold
    ['#C0C0C0', '#8A8A8A'], // Silver
    ['#CD7F32', '#8B4513'], // Bronze
    ['#E0E0E0', '#9E9E9E'], // 4+
];

const RankCard = memo(function RankCard({
    item,
    rank,
    cardWidth,
    isInList,
    accent,
    onPress,
    onToggleList,
}: {
    item: Media;
    rank: number;
    cardWidth: number;
    isInList: boolean;
    accent: string;
    onPress: () => void;
    onToggleList: () => void;
}) {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const cardHeight = Math.round(cardWidth * 1.45);
    const rankColors = rank <= 3 ? RANK_COLORS[rank - 1] : RANK_COLORS[3];

    const handlePressIn = useCallback(() => {
        Animated.spring(scaleAnim, {
            toValue: 0.95,
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
                style={[styles.rankCard, { width: cardWidth, height: cardHeight }]}
            >
                {/* The big rank number — positioned to the left, overlapping */}
                <View style={styles.rankNumberContainer}>
                    <Text
                        style={[
                            styles.rankNumber,
                            {
                                fontSize: cardHeight * 0.65,
                                color: rankColors[0],
                                textShadowColor: rankColors[1],
                            },
                        ]}
                    >
                        {rank}
                    </Text>
                </View>

                {/* Poster — offset to the right */}
                <View style={styles.posterContainer}>
                    <LiquidGlass
                        glowColor={rank <= 3 ? rankColors[0] : accent}
                        tintOpacity={0.15}
                        cornerRadius={16}
                        glowIntensity={rank <= 3 ? 0.6 : 0.3}
                        borderOpacity={0.3}
                        fastMode={true}
                        style={styles.posterGlass}
                    >
                        <ExpoImage
                            source={{ uri: `${IMAGE_BASE_URL}${item.poster_path}` }}
                            style={styles.posterImage}
                            contentFit="cover"
                            transition={200}
                            cachePolicy="memory-disk"
                        />
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.85)']}
                            locations={[0.55, 1]}
                            style={styles.posterGradient}
                        />

                        {/* My List */}
                        <TouchableOpacity
                            style={styles.myListBtn}
                            onPress={onToggleList}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <View style={[styles.myListCircle, isInList && { backgroundColor: accent }]}>
                                <Ionicons name={isInList ? 'checkmark' : 'add'} size={15} color="#fff" />
                            </View>
                        </TouchableOpacity>

                        {/* Title & meta at bottom */}
                        <View style={styles.cardMeta}>
                            <Text style={styles.cardTitle} numberOfLines={2}>
                                {item.title || item.name}
                            </Text>
                            <View style={styles.metaRow}>
                                <Text style={styles.ratingText}>
                                    ⭐ {(item.vote_average || 0).toFixed(1)}
                                </Text>
                                <Text style={styles.yearText}>
                                    {(item.release_date || item.first_air_date || '').slice(0, 4)}
                                </Text>
                            </View>
                        </View>
                    </LiquidGlass>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
});

const Top10Rail: React.FC<Top10RailProps> = ({
    movies,
    onItemPress,
    myListIds = [],
    onToggleMyList,
}) => {
    const { width: screenWidth } = useWindowDimensions();
    const { accentColor } = useAccent();
    const accent = accentColor || '#e50914';
    const cardWidth = Math.min(screenWidth * 0.52, 220);
    const top10 = movies.slice(0, 10);

    if (top10.length === 0) return null;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <LinearGradient
                        colors={['#FFD700', '#FF8C00']}
                        style={styles.headerAccent}
                    />
                    <Text style={styles.headerTitle}>Top 10</Text>
                    <View style={styles.headerBadge}>
                        <Ionicons name="flame" size={14} color="#FF6B35" />
                    </View>
                </View>
            </View>

            <Animated.FlatList
                data={top10}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                keyExtractor={(item: Media) => `top10-${item.id}`}
                renderItem={({ item, index }: { item: Media; index: number }) => (
                    <RankCard
                        item={item}
                        rank={index + 1}
                        cardWidth={cardWidth}
                        isInList={myListIds.includes(item.id)}
                        accent={accent}
                        onPress={() => onItemPress(item)}
                        onToggleList={() => onToggleMyList?.(item)}
                    />
                )}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: 20,
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
    headerAccent: {
        width: 4,
        height: 24,
        borderRadius: 2,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    headerBadge: {
        backgroundColor: 'rgba(255,107,53,0.15)',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,107,53,0.3)',
    },
    listContent: {
        paddingHorizontal: 18,
        paddingVertical: 8,
        gap: 4,
    },
    rankCard: {
        flexDirection: 'row',
        marginRight: 4,
    },
    rankNumberContainer: {
        width: '38%',
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingRight: 0,
        zIndex: 2,
    },
    rankNumber: {
        fontWeight: '900',
        fontStyle: 'italic',
        textShadowOffset: { width: 2, height: 3 },
        textShadowRadius: 8,
        includeFontPadding: false,
        lineHeight: undefined,
    },
    posterContainer: {
        flex: 1,
        marginLeft: -15,
        zIndex: 3,
    },
    posterGlass: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden',
    },
    posterImage: {
        width: '100%',
        height: '100%',
        borderRadius: 16,
    },
    posterGradient: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 16,
    },
    myListBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
    },
    myListCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardMeta: {
        position: 'absolute',
        bottom: 10,
        left: 10,
        right: 10,
    },
    cardTitle: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '800',
        marginBottom: 4,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    ratingText: {
        color: '#ffd700',
        fontSize: 11,
        fontWeight: '700',
    },
    yearText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
        fontWeight: '600',
    },
});

export default memo(Top10Rail);
