import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

// Genre-specific colors
const GENRE_COLORS: Record<number, [string, string]> = {
    28: ['#ff4757', '#ff6b81'], // Action
    12: ['#ffa502', '#ff7f50'], // Adventure
    16: ['#7bed9f', '#2ed573'], // Animation
    35: ['#ff6348', '#ff9f43'], // Comedy
    80: ['#485460', '#718093'], // Crime
    99: ['#70a1ff', '#1e90ff'], // Documentary
    18: ['#8e44ad', '#9b59b6'], // Drama
    10751: ['#ff9ff3', '#f368e0'], // Family
    14: ['#5352ed', '#70a1ff'], // Fantasy
    36: ['#9c88ff', '#8c7ae6'], // History
    27: ['#2f3542', '#57606f'], // Horror
    10402: ['#1abc9c', '#16a085'], // Music
    9648: ['#6c5ce7', '#a29bfe'], // Mystery
    10749: ['#fd79a8', '#e84393'], // Romance
    878: ['#00d2d3', '#0abde3'], // Sci-Fi
    10770: ['#ff6b6b', '#ee5a52'], // TV Movie
    53: ['#1e272e', '#485460'], // Thriller
    10752: ['#636e72', '#2d3436'], // War
    37: ['#d35400', '#e67e22'], // Western
    10762: ['#00cec9', '#00b894'], // Kids (TV genre)
};

interface GenreOrbProps {
    id: number;
    name: string;
    isSelected: boolean;
    onPress: () => void;
    index: number;
    isFavorite?: boolean;
}

const GenreOrb: React.FC<GenreOrbProps> = ({
    id,
    name,
    isSelected,
    onPress,
    index,
    isFavorite = false,
}) => {
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const floatAnim = useRef(new Animated.Value(0)).current;
    const glowAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const colors = GENRE_COLORS[id] || ['#7C3AED', '#a855f7'];

    // Entrance animation
    useEffect(() => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            delay: index * 40,
            tension: 70,
            friction: 8,
            useNativeDriver: true,
        }).start();
    }, [index]);

    // Floating animation
    useEffect(() => {
        const float = Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, {
                    toValue: 1,
                    duration: 2500 + Math.random() * 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(floatAnim, {
                    toValue: 0,
                    duration: 2500 + Math.random() * 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );
        float.start();
        return () => float.stop();
    }, []);

    // Selection pulse
    useEffect(() => {
        if (isSelected) {
            Animated.parallel([
                Animated.spring(glowAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                }),
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(pulseAnim, {
                            toValue: 1.05,
                            duration: 800,
                            useNativeDriver: true,
                        }),
                        Animated.timing(pulseAnim, {
                            toValue: 1,
                            duration: 800,
                            useNativeDriver: true,
                        }),
                    ])
                ),
            ]).start();
        } else {
            Animated.spring(glowAnim, {
                toValue: 0,
                useNativeDriver: true,
            }).start();
            pulseAnim.setValue(1);
        }
    }, [isSelected]);

    const floatY = floatAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -6],
    });

    const glowScale = glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.8, 1.3],
    });

    const glowOpacity = glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.5],
    });

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    transform: [
                        { scale: scaleAnim },
                        { translateY: floatY },
                    ],
                },
            ]}
        >
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.85}
                style={styles.touchable}
            >
                {/* Outer glow */}
                <Animated.View
                    style={[
                        styles.glowRing,
                        {
                            backgroundColor: colors[0],
                            transform: [{ scale: glowScale }],
                            opacity: glowOpacity,
                        },
                    ]}
                />

                {/* Main orb */}
                <Animated.View
                    style={[
                        styles.orbWrapper,
                        { transform: [{ scale: pulseAnim }] },
                    ]}
                >
                    <LinearGradient
                        colors={isSelected ? colors : ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                            styles.orb,
                            isSelected && {
                                borderColor: colors[0],
                                shadowColor: colors[0],
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.name,
                                isSelected && { color: '#fff', fontWeight: '800' },
                            ]}
                            numberOfLines={1}
                        >
                            {name}
                        </Text>
                    </LinearGradient>
                </Animated.View>

                {/* Favorite star */}
                {isFavorite && (
                    <View style={[styles.favoriteBadge, { backgroundColor: colors[0] }]}>
                        <Text style={styles.favoriteIcon}>★</Text>
                    </View>
                )}

                {/* Selection checkmark */}
                {isSelected && (
                    <View style={[styles.checkBadge, { backgroundColor: colors[0] }]}>
                        <Text style={styles.checkIcon}>✓</Text>
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        margin: 6,
    },
    touchable: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    glowRing: {
        position: 'absolute',
        width: 90,
        height: 44,
        borderRadius: 22,
        opacity: 0.4,
    },
    orbWrapper: {
        borderRadius: 22,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    orb: {
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.12)',
        minWidth: 80,
        alignItems: 'center',
    },
    name: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
    favoriteBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#0a0a1a',
    },
    favoriteIcon: {
        color: '#fff',
        fontSize: 10,
    },
    checkBadge: {
        position: 'absolute',
        bottom: -4,
        right: -4,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#0a0a1a',
    },
    checkIcon: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
});

export default GenreOrb;
