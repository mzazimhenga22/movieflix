import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';

interface VoiceSearchOrbProps {
    onPress: () => void;
    isListening?: boolean;
    size?: number;
    accentColor?: string;
}

const VoiceSearchOrb: React.FC<VoiceSearchOrbProps> = ({
    onPress,
    isListening = false,
    size = 48,
    accentColor = '#e50914',
}) => {
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const rippleScale = useRef(new Animated.Value(0.8)).current;
    const rippleOpacity = useRef(new Animated.Value(0.6)).current;
    const glowAnim = useRef(new Animated.Value(0)).current;
    const waveAnims = useRef([
        new Animated.Value(0.2),
        new Animated.Value(0.4),
        new Animated.Value(0.3),
        new Animated.Value(0.5),
        new Animated.Value(0.35),
    ]).current;

    const [pressed, setPressed] = useState(false);

    // Idle pulse animation
    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.08,
                    duration: 1200,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1200,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, []);

    // Ripple effect when listening
    useEffect(() => {
        if (isListening) {
            const ripple = Animated.loop(
                Animated.parallel([
                    Animated.sequence([
                        Animated.timing(rippleScale, {
                            toValue: 2.5,
                            duration: 1000,
                            easing: Easing.out(Easing.ease),
                            useNativeDriver: true,
                        }),
                        Animated.timing(rippleScale, {
                            toValue: 0.8,
                            duration: 0,
                            useNativeDriver: true,
                        }),
                    ]),
                    Animated.sequence([
                        Animated.timing(rippleOpacity, {
                            toValue: 0,
                            duration: 1000,
                            useNativeDriver: true,
                        }),
                        Animated.timing(rippleOpacity, {
                            toValue: 0.6,
                            duration: 0,
                            useNativeDriver: true,
                        }),
                    ]),
                ])
            );
            ripple.start();
            return () => ripple.stop();
        }
    }, [isListening]);

    // Glow animation when listening
    useEffect(() => {
        if (isListening) {
            const glow = Animated.loop(
                Animated.sequence([
                    Animated.timing(glowAnim, {
                        toValue: 1,
                        duration: 600,
                        useNativeDriver: true,
                    }),
                    Animated.timing(glowAnim, {
                        toValue: 0.3,
                        duration: 600,
                        useNativeDriver: true,
                    }),
                ])
            );
            glow.start();
            return () => glow.stop();
        } else {
            Animated.timing(glowAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [isListening]);

    // Voice waveform animation
    useEffect(() => {
        if (isListening) {
            const animations = waveAnims.map((anim, index) =>
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(anim, {
                            toValue: 0.9 + Math.random() * 0.1,
                            duration: 150 + index * 50,
                            useNativeDriver: true,
                        }),
                        Animated.timing(anim, {
                            toValue: 0.2 + Math.random() * 0.2,
                            duration: 150 + index * 50,
                            useNativeDriver: true,
                        }),
                    ])
                )
            );
            animations.forEach((a) => a.start());
            return () => animations.forEach((a) => a.stop());
        } else {
            waveAnims.forEach((anim) => {
                Animated.timing(anim, {
                    toValue: 0.3,
                    duration: 200,
                    useNativeDriver: true,
                }).start();
            });
        }
    }, [isListening]);

    const handlePressIn = () => setPressed(true);
    const handlePressOut = () => setPressed(false);

    const glowOpacity = glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.6],
    });

    return (
        <View style={[styles.container, { width: size * 2.5, height: size * 2.5 }]}>
            {/* Outer glow ring */}
            <Animated.View
                style={[
                    styles.glowRing,
                    {
                        width: size * 2.2,
                        height: size * 2.2,
                        borderRadius: size * 1.1,
                        opacity: glowOpacity,
                        borderColor: accentColor,
                    },
                ]}
            />

            {/* Ripple effect */}
            {isListening && (
                <Animated.View
                    style={[
                        styles.ripple,
                        {
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            borderColor: accentColor,
                            transform: [{ scale: rippleScale }],
                            opacity: rippleOpacity,
                        },
                    ]}
                />
            )}

            {/* Main orb button */}
            <TouchableOpacity
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.9}
            >
                <Animated.View
                    style={[
                        styles.orbOuter,
                        {
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            transform: [
                                { scale: pressed ? 0.92 : pulseAnim },
                            ],
                        },
                    ]}
                >
                    <LinearGradient
                        colors={isListening ? [accentColor, '#ff4757'] : ['#3a3a4f', '#1a1a2e']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.orbGradient, { borderRadius: size / 2 }]}
                    >
                        {isListening ? (
                            // Voice waveform visualization
                            <View style={styles.waveContainer}>
                                {waveAnims.map((anim, index) => (
                                    <Animated.View
                                        key={index}
                                        style={[
                                            styles.waveBar,
                                            {
                                                backgroundColor: '#fff',
                                                transform: [{ scaleY: anim }],
                                            },
                                        ]}
                                    />
                                ))}
                            </View>
                        ) : (
                            <Ionicons name="mic" size={size * 0.45} color="#fff" />
                        )}
                    </LinearGradient>
                </Animated.View>
            </TouchableOpacity>

            {/* Floating particles around orb */}
            {isListening && (
                <>
                    {[0, 1, 2, 3].map((i) => (
                        <Animated.View
                            key={i}
                            style={[
                                styles.floatingDot,
                                {
                                    backgroundColor: accentColor,
                                    transform: [
                                        { rotate: `${i * 90}deg` },
                                        { translateY: -size * 0.9 },
                                    ],
                                    opacity: glowAnim,
                                },
                            ]}
                        />
                    ))}
                </>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    glowRing: {
        position: 'absolute',
        borderWidth: 2,
        backgroundColor: 'transparent',
    },
    ripple: {
        position: 'absolute',
        borderWidth: 2,
        backgroundColor: 'transparent',
    },
    orbOuter: {
        shadowColor: '#e50914',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 10,
    },
    orbGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    waveContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        height: 24,
    },
    waveBar: {
        width: 3,
        height: 20,
        borderRadius: 2,
    },
    floatingDot: {
        position: 'absolute',
        width: 6,
        height: 6,
        borderRadius: 3,
    },
});

export default VoiceSearchOrb;
