import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TvAmbientModeProps {
    /** Enable ambient mode */
    enabled?: boolean;
    /** Inactivity timeout in ms before showing (default: 2 min) */
    inactivityTimeout?: number;
    /** Array of image URLs to display */
    images?: string[];
    /** Accent color */
    accent?: string;
    /** Callback when user dismisses ambient mode */
    onDismiss?: () => void;
}

interface FloatingImage {
    id: string;
    uri: string;
    startX: number;
    startY: number;
    size: number;
    duration: number;
    delay: number;
}

/**
 * TvAmbientMode - Screensaver with floating movie artwork
 * Triggers after inactivity, dismissed by any remote input
 */
function TvAmbientMode({
    enabled = true,
    inactivityTimeout = 120000, // 2 minutes
    images = [],
    accent = '#e50914',
    onDismiss,
}: TvAmbientModeProps) {
    const [isActive, setIsActive] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Animation refs
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const clockPulse = useRef(new Animated.Value(1)).current;

    // Generate floating images with random positions
    const floatingImages = useRef<FloatingImage[]>(
        images.slice(0, 8).map((uri, index) => ({
            id: `img-${index}`,
            uri,
            startX: Math.random() * (SCREEN_WIDTH - 200),
            startY: Math.random() * (SCREEN_HEIGHT - 300),
            size: 150 + Math.random() * 100,
            duration: 30000 + Math.random() * 20000,
            delay: index * 2000,
        }))
    ).current;

    // Reset inactivity timer on any interaction
    const resetInactivityTimer = useCallback(() => {
        if (inactivityTimer.current) {
            clearTimeout(inactivityTimer.current);
        }

        if (isActive) {
            // Dismiss ambient mode
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start(() => {
                setIsActive(false);
                onDismiss?.();
            });
        }

        if (enabled) {
            inactivityTimer.current = setTimeout(() => {
                setIsActive(true);
            }, inactivityTimeout);
        }
    }, [enabled, inactivityTimeout, isActive, fadeAnim, onDismiss]);

    // Initialize inactivity detection
    useEffect(() => {
        if (enabled) {
            resetInactivityTimer();
        }

        return () => {
            if (inactivityTimer.current) {
                clearTimeout(inactivityTimer.current);
            }
        };
    }, [enabled, resetInactivityTimer]);

    // Fade in when active
    useEffect(() => {
        if (isActive) {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 1500,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
            }).start();

            // Clock pulse animation
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(clockPulse, {
                        toValue: 1.02,
                        duration: 2000,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(clockPulse, {
                        toValue: 1,
                        duration: 2000,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ])
            );
            pulse.start();

            return () => pulse.stop();
        }
    }, [isActive, fadeAnim, clockPulse]);

    // Update clock every minute
    useEffect(() => {
        if (!isActive) return;

        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 60000);

        return () => clearInterval(interval);
    }, [isActive]);

    const handlePress = useCallback(() => {
        resetInactivityTimer();
    }, [resetInactivityTimer]);

    if (!isActive) return null;

    const formatTime = (date: Date) => {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
        });
    };

    return (
        <Pressable onPress={handlePress} style={StyleSheet.absoluteFill}>
            <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
                {/* Dark background with gradient */}
                <LinearGradient
                    colors={['#050610', '#0a0c18', '#050610']}
                    style={StyleSheet.absoluteFill}
                />

                {/* Ambient glow spots */}
                <View style={[styles.glowSpot, styles.glowSpot1, { backgroundColor: accent }]} />
                <View style={[styles.glowSpot, styles.glowSpot2]} />

                {/* Floating images with Ken Burns effect */}
                {floatingImages.map((img) => (
                    <FloatingArtwork key={img.id} {...img} />
                ))}

                {/* Clock and date */}
                <Animated.View
                    style={[
                        styles.clockContainer,
                        { transform: [{ scale: clockPulse }] },
                    ]}
                >
                    <Text style={styles.time}>{formatTime(currentTime)}</Text>
                    <Text style={styles.date}>{formatDate(currentTime)}</Text>
                </Animated.View>

                {/* Brand watermark */}
                <View style={styles.watermark}>
                    <LinearGradient
                        colors={[accent, '#ff4081']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.watermarkIcon}
                    >
                        <Ionicons name="play" size={20} color="#fff" />
                    </LinearGradient>
                    <Text style={styles.watermarkText}>MOVIEFLIX</Text>
                </View>

                {/* Dismiss hint */}
                <View style={styles.dismissHint}>
                    <Ionicons name="return-down-back" size={18} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.dismissHintText}>Press any button to dismiss</Text>
                </View>
            </Animated.View>
        </Pressable>
    );
}

/**
 * Individual floating artwork with Ken Burns effect
 */
function FloatingArtwork({
    uri,
    startX,
    startY,
    size,
    duration,
    delay,
}: Omit<FloatingImage, 'id'>) {
    const translateX = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Fade in after delay
        Animated.timing(opacity, {
            toValue: 0.6,
            duration: 2000,
            delay,
            useNativeDriver: true,
        }).start();

        // Ken Burns - slow pan and zoom
        const panAnimation = Animated.loop(
            Animated.sequence([
                Animated.parallel([
                    Animated.timing(translateX, {
                        toValue: 40 + Math.random() * 30,
                        duration: duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(translateY, {
                        toValue: -30 + Math.random() * 20,
                        duration: duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale, {
                        toValue: 1.1,
                        duration: duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ]),
                Animated.parallel([
                    Animated.timing(translateX, {
                        toValue: 0,
                        duration: duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(translateY, {
                        toValue: 0,
                        duration: duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale, {
                        toValue: 1,
                        duration: duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ]),
            ])
        );
        panAnimation.start();

        return () => panAnimation.stop();
    }, [translateX, translateY, scale, opacity, duration, delay]);

    return (
        <Animated.View
            style={[
                styles.floatingImage,
                {
                    left: startX,
                    top: startY,
                    width: size,
                    height: size * 1.5,
                    opacity,
                    transform: [{ translateX }, { translateY }, { scale }],
                },
            ]}
        >
            <Image
                source={{ uri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
            />
            {/* Soft vignette overlay */}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.4)']}
                style={StyleSheet.absoluteFill}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#050610',
    },
    glowSpot: {
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: 200,
        opacity: 0.15,
    },
    glowSpot1: {
        top: -100,
        right: -50,
    },
    glowSpot2: {
        bottom: -100,
        left: -50,
        backgroundColor: '#4a00e0',
    },
    floatingImage: {
        position: 'absolute',
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 15 },
        shadowOpacity: 0.6,
        shadowRadius: 30,
        elevation: 20,
    },
    clockContainer: {
        position: 'absolute',
        bottom: 120,
        left: 80,
    },
    time: {
        color: '#fff',
        fontSize: 120,
        fontWeight: '200',
        letterSpacing: -4,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 4 },
        textShadowRadius: 20,
    },
    date: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 28,
        fontWeight: '500',
        marginTop: 8,
    },
    watermark: {
        position: 'absolute',
        bottom: 40,
        right: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: 0.5,
    },
    watermarkIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    watermarkText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 4,
    },
    dismissHint: {
        position: 'absolute',
        bottom: 40,
        left: 80,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dismissHintText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        fontWeight: '500',
    },
});

export default memo(TvAmbientMode);
