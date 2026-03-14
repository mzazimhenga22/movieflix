import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface TrendingItem {
    id: string;
    label: string;
    icon?: string;
    gradient?: [string, string];
    isHot?: boolean;
}

interface TrendingChipsProps {
    items: TrendingItem[];
    onPress: (item: TrendingItem) => void;
    accentColor?: string;
}

const TrendingChip: React.FC<{
    item: TrendingItem;
    onPress: () => void;
    delay: number;
}> = ({ item, onPress, delay }) => {
    const translateY = useRef(new Animated.Value(20)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const floatAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Staggered entrance animation
        Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
                Animated.spring(translateY, {
                    toValue: 0,
                    tension: 60,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]),
        ]).start();

        // Continuous floating animation
        const float = Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, {
                    toValue: 1,
                    duration: 2000 + Math.random() * 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(floatAnim, {
                    toValue: 0,
                    duration: 2000 + Math.random() * 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );
        float.start();
        return () => float.stop();
    }, [delay]);

    const handlePressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.92,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 200,
            friction: 10,
            useNativeDriver: true,
        }).start();
    };

    const floatY = floatAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -6],
    });

    const gradient = item.gradient || ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.05)'];

    return (
        <Animated.View
            style={[
                styles.chipWrapper,
                {
                    opacity,
                    transform: [
                        { translateY: Animated.add(translateY, floatY) },
                        { scale: scaleAnim },
                    ],
                },
            ]}
        >
            <TouchableOpacity
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={1}
            >
                <BlurView intensity={25} tint="dark" style={styles.chipBlur}>
                    <LinearGradient
                        colors={gradient as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.chipGradient}
                    >
                        {item.isHot && (
                            <View style={styles.hotBadge}>
                                <Ionicons name="flame" size={10} color="#fff" />
                            </View>
                        )}
                        {item.icon && (
                            <Ionicons
                                name={item.icon as any}
                                size={14}
                                color="rgba(255,255,255,0.9)"
                                style={styles.chipIcon}
                            />
                        )}
                        <Text style={styles.chipText}>{item.label}</Text>
                    </LinearGradient>
                </BlurView>
            </TouchableOpacity>
        </Animated.View>
    );
};

const TrendingChips: React.FC<TrendingChipsProps> = ({
    items,
    onPress,
    accentColor = '#e50914',
}) => {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Ionicons name="trending-up" size={16} color={accentColor} />
                <Text style={styles.headerText}>Trending Now</Text>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {items.map((item, index) => (
                    <TrendingChip
                        key={item.id}
                        item={item}
                        onPress={() => onPress(item)}
                        delay={index * 80}
                    />
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    headerText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    scrollContent: {
        paddingRight: 20,
        gap: 10,
    },
    chipWrapper: {
        marginRight: 2,
    },
    chipBlur: {
        borderRadius: 20,
        overflow: 'hidden',
    },
    chipGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    chipIcon: {
        marginRight: 6,
    },
    chipText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    hotBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#ff4757',
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default TrendingChips;
