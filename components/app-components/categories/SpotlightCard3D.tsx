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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SpotlightCard3DProps {
    id: string;
    title: string;
    image: string;
    subtitle?: string;
    onPress: () => void;
    index: number;
    accentColor?: string;
}

const SpotlightCard3D: React.FC<SpotlightCard3DProps> = ({
    id,
    title,
    image,
    subtitle,
    onPress,
    index,
    accentColor = '#e50914',
}) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const rotateX = useRef(new Animated.Value(0)).current;
    const rotateY = useRef(new Animated.Value(0)).current;
    const shimmerAnim = useRef(new Animated.Value(0)).current;
    const [pressed, setPressed] = useState(false);

    const handlePressIn = () => {
        setPressed(true);
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 0.96,
                useNativeDriver: true,
            }),
            Animated.timing(rotateX, {
                toValue: 4,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(rotateY, {
                toValue: -2,
                duration: 150,
                useNativeDriver: true,
            }),
        ]).start();

        // Shimmer
        Animated.loop(
            Animated.timing(shimmerAnim, {
                toValue: 1,
                duration: 1200,
                useNativeDriver: true,
            })
        ).start();
    };

    const handlePressOut = () => {
        setPressed(false);
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 180,
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
        outputRange: [-200, 400],
    });

    return (
        <Animated.View
            style={[
                styles.container,
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
                    {/* Background image */}
                    <Image
                        source={{ uri: image }}
                        style={styles.image}
                        contentFit="cover"
                        transition={300}
                    />

                    {/* Holographic overlay */}
                    <LinearGradient
                        colors={[
                            'rgba(255,255,255,0.1)',
                            'transparent',
                            'rgba(255,255,255,0.05)',
                        ]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.holoOverlay}
                    />

                    {/* Dark gradient overlay */}
                    <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)']}
                        style={styles.gradient}
                    />

                    {/* Shimmer effect */}
                    {pressed && (
                        <Animated.View
                            style={[
                                styles.shimmer,
                                { transform: [{ translateX: shimmerTranslate }] },
                            ]}
                        >
                            <LinearGradient
                                colors={[
                                    'transparent',
                                    'rgba(255,255,255,0.25)',
                                    'transparent',
                                ]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.shimmerGradient}
                            />
                        </Animated.View>
                    )}

                    {/* Spotlight beam effect */}
                    <View style={[styles.spotlightBeam, { backgroundColor: accentColor + '20' }]} />

                    {/* Content */}
                    <View style={styles.content}>
                        <View style={styles.badge}>
                            <Ionicons name="sparkles" size={10} color="#fff" />
                            <Text style={styles.badgeText}>SPOTLIGHT</Text>
                        </View>
                        <Text style={styles.title}>{title}</Text>
                        {subtitle && (
                            <Text style={styles.subtitle} numberOfLines={1}>
                                {subtitle}
                            </Text>
                        )}
                    </View>

                    {/* Play icon */}
                    <View style={styles.playContainer}>
                        <BlurView intensity={40} tint="dark" style={styles.playBlur}>
                            <Ionicons name="play" size={20} color="#fff" />
                        </BlurView>
                    </View>

                    {/* Border glow */}
                    {pressed && (
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
    container: {
        width: 220,
        height: 140,
        marginRight: 12,
    },
    touchable: {
        flex: 1,
    },
    card: {
        flex: 1,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#1a1a2e',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 10,
    },
    image: {
        ...StyleSheet.absoluteFillObject,
    },
    holoOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    gradient: {
        ...StyleSheet.absoluteFillObject,
    },
    shimmer: {
        ...StyleSheet.absoluteFillObject,
    },
    shimmerGradient: {
        width: 80,
        height: '100%',
    },
    spotlightBeam: {
        position: 'absolute',
        top: -50,
        right: 0,
        width: 100,
        height: 200,
        transform: [{ rotate: '25deg' }],
    },
    content: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 14,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: 'flex-start',
        marginBottom: 6,
    },
    badgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        marginTop: 2,
    },
    playContainer: {
        position: 'absolute',
        top: 12,
        right: 12,
    },
    playBlur: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    glowBorder: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 20,
        borderWidth: 2,
        pointerEvents: 'none',
    },
});

export default SpotlightCard3D;
