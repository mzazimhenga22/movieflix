import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

interface FlixyOrbTVProps {
    size?: number;
    isFocused?: boolean;
    isActive?: boolean;
    accent?: string;
    /** Time in ms before orb docks (default: 10000 = 10s) */
    dockAfterMs?: number;
}

/**
 * FlixyOrbTV - Siri-like animated orb for TV
 * Multi-layered gradient sphere with glow effects
 * Docks (shrinks + dims) after inactivity
 */
function FlixyOrbTV({
    size = 140,
    isFocused = false,
    isActive = false,
    accent = '#e50914',
    dockAfterMs = 10000,
}: FlixyOrbTVProps) {
    const [isDocked, setIsDocked] = useState(false);
    const dockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Animation refs - all using native driver
    const scale1 = useRef(new Animated.Value(1)).current;
    const scale2 = useRef(new Animated.Value(1)).current;
    const scale3 = useRef(new Animated.Value(1)).current;
    const rotate = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0.6)).current;
    const focusGlow = useRef(new Animated.Value(0)).current;

    // Docking animations
    const dockScale = useRef(new Animated.Value(1)).current;
    const dockOpacity = useRef(new Animated.Value(1)).current;

    // Reset dock timer on focus or activity
    useEffect(() => {
        // Clear existing timer
        if (dockTimerRef.current) {
            clearTimeout(dockTimerRef.current);
            dockTimerRef.current = null;
        }

        if (isFocused || isActive) {
            // Wake up if docked
            if (isDocked) {
                setIsDocked(false);
                Animated.parallel([
                    Animated.spring(dockScale, {
                        toValue: 1,
                        tension: 100,
                        friction: 8,
                        useNativeDriver: true,
                    }),
                    Animated.timing(dockOpacity, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                    }),
                ]).start();
            }
        } else {
            // Start dock timer
            dockTimerRef.current = setTimeout(() => {
                setIsDocked(true);
                // Animate to docked state
                Animated.parallel([
                    Animated.spring(dockScale, {
                        toValue: 0.4,
                        tension: 80,
                        friction: 10,
                        useNativeDriver: true,
                    }),
                    Animated.timing(dockOpacity, {
                        toValue: 0.35,
                        duration: 600,
                        easing: Easing.out(Easing.ease),
                        useNativeDriver: true,
                    }),
                ]).start();
            }, dockAfterMs);
        }

        return () => {
            if (dockTimerRef.current) {
                clearTimeout(dockTimerRef.current);
            }
        };
    }, [isFocused, isActive, dockAfterMs, isDocked, dockScale, dockOpacity]);

    // Continuous rotation (slower when docked)
    useEffect(() => {
        const rotateAnimation = Animated.loop(
            Animated.timing(rotate, {
                toValue: 1,
                duration: isDocked ? 30000 : 10000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        rotateAnimation.start();
        return () => rotateAnimation.stop();
    }, [rotate, isDocked]);

    // Focus glow animation
    useEffect(() => {
        Animated.timing(focusGlow, {
            toValue: isFocused ? 1 : 0,
            duration: 200,
            useNativeDriver: true,
        }).start();
    }, [isFocused, focusGlow]);

    // Breathing/active animations
    useEffect(() => {
        if (isDocked) {
            // Stop all breathing when docked
            scale1.setValue(1);
            scale2.setValue(1);
            scale3.setValue(1);
            return;
        }

        if (isActive) {
            // Dynamic animations when active
            const animations = [
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(scale1, {
                            toValue: 1.18,
                            duration: 400 + Math.random() * 150,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                        Animated.timing(scale1, {
                            toValue: 0.88,
                            duration: 400 + Math.random() * 150,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                    ])
                ),
                Animated.loop(
                    Animated.sequence([
                        Animated.delay(80),
                        Animated.timing(scale2, {
                            toValue: 1.22,
                            duration: 450 + Math.random() * 150,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                        Animated.timing(scale2, {
                            toValue: 0.85,
                            duration: 450 + Math.random() * 150,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                    ])
                ),
                Animated.loop(
                    Animated.sequence([
                        Animated.delay(160),
                        Animated.timing(scale3, {
                            toValue: 1.28,
                            duration: 500 + Math.random() * 150,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                        Animated.timing(scale3, {
                            toValue: 0.82,
                            duration: 500 + Math.random() * 150,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                    ])
                ),
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(pulse, {
                            toValue: 1,
                            duration: 250,
                            useNativeDriver: true,
                        }),
                        Animated.timing(pulse, {
                            toValue: 0.6,
                            duration: 250,
                            useNativeDriver: true,
                        }),
                    ])
                ),
            ];

            animations.forEach(anim => anim.start());
            return () => animations.forEach(anim => anim.stop());
        } else {
            // Calm breathing when idle
            const breathe1 = Animated.loop(
                Animated.sequence([
                    Animated.timing(scale1, {
                        toValue: 1.06,
                        duration: 2500,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale1, {
                        toValue: 1,
                        duration: 2500,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ])
            );
            const breathe2 = Animated.loop(
                Animated.sequence([
                    Animated.delay(600),
                    Animated.timing(scale2, {
                        toValue: 1.08,
                        duration: 3000,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale2, {
                        toValue: 1,
                        duration: 3000,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ])
            );
            const breathe3 = Animated.loop(
                Animated.sequence([
                    Animated.delay(1200),
                    Animated.timing(scale3, {
                        toValue: 1.1,
                        duration: 3500,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale3, {
                        toValue: 1,
                        duration: 3500,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ])
            );

            breathe1.start();
            breathe2.start();
            breathe3.start();

            return () => {
                breathe1.stop();
                breathe2.stop();
                breathe3.stop();
            };
        }
    }, [isActive, isDocked, scale1, scale2, scale3, pulse]);

    const rotateInterpolate = rotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const orbSize = size * 0.65;

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    width: size,
                    height: size,
                    transform: [{ scale: dockScale }],
                    opacity: dockOpacity,
                }
            ]}
        >
            {/* Focus ring glow */}
            <Animated.View
                style={[
                    styles.focusRing,
                    {
                        width: size + 20,
                        height: size + 20,
                        borderRadius: (size + 20) / 2,
                        opacity: focusGlow,
                        borderColor: accent,
                        shadowColor: accent,
                    },
                ]}
            />

            {/* Outer glow layer 3 */}
            <Animated.View
                style={[
                    styles.orbLayer,
                    {
                        width: orbSize * 1.7,
                        height: orbSize * 1.7,
                        borderRadius: orbSize * 0.85,
                        transform: [{ scale: scale3 }, { rotate: rotateInterpolate }],
                        opacity: isDocked ? 0.08 : pulse.interpolate({
                            inputRange: [0.6, 1],
                            outputRange: [0.12, 0.28],
                        }),
                    },
                ]}
            >
                <LinearGradient
                    colors={isDocked ? ['#555', '#444', '#333'] : ['#ff0080', '#ff4d4d', accent, '#ff6b35']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>

            {/* Middle glow layer 2 */}
            <Animated.View
                style={[
                    styles.orbLayer,
                    {
                        width: orbSize * 1.35,
                        height: orbSize * 1.35,
                        borderRadius: orbSize * 0.675,
                        transform: [{ scale: scale2 }, { rotate: rotateInterpolate }],
                        opacity: isDocked ? 0.2 : 0.45,
                    },
                ]}
            >
                <LinearGradient
                    colors={isDocked ? ['#666', '#555', '#444'] : [accent, '#ff4081', '#ff6b6b', accent]}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>

            {/* Core orb layer 1 */}
            <Animated.View
                style={[
                    styles.orbLayer,
                    styles.orbCore,
                    {
                        width: orbSize,
                        height: orbSize,
                        borderRadius: orbSize / 2,
                        transform: [{ scale: scale1 }],
                        shadowColor: isDocked ? '#333' : accent,
                    },
                ]}
            >
                <LinearGradient
                    colors={isDocked ? ['#555', '#444', '#333', '#444'] : ['#ff4081', accent, '#b20710', accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                {/* Inner highlight */}
                <View style={[styles.orbHighlight, isDocked && styles.orbHighlightDocked]} />
            </Animated.View>

            {/* Center icon */}
            <View style={styles.iconContainer}>
                <Ionicons
                    name={isDocked ? 'moon' : isActive ? 'mic' : 'mic-outline'}
                    size={orbSize * 0.32}
                    color={isDocked ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.95)'}
                />
            </View>

            {/* TV-specific label - "Sleeping" when docked */}
            {(isFocused || isDocked) && (
                <Animated.View
                    style={[
                        styles.label,
                        { opacity: isFocused ? focusGlow : 0.6 },
                    ]}
                >
                    <LinearGradient
                        colors={['rgba(0,0,0,0.85)', 'rgba(20,20,30,0.9)']}
                        style={styles.labelGradient}
                    >
                        <Ionicons
                            name={isDocked ? 'moon' : 'tv'}
                            size={14}
                            color={isDocked ? '#888' : accent}
                        />
                        <Animated.Text style={[styles.labelText, isDocked && styles.labelTextDocked]}>
                            {isDocked ? 'ZZZ' : 'FLIXY'}
                        </Animated.Text>
                    </LinearGradient>
                </Animated.View>
            )}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    focusRing: {
        position: 'absolute',
        borderWidth: 3,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 25,
        elevation: 20,
    },
    orbLayer: {
        position: 'absolute',
        overflow: 'hidden',
    },
    orbCore: {
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 35,
        elevation: 18,
    },
    orbHighlight: {
        position: 'absolute',
        top: '12%',
        left: '18%',
        width: '32%',
        height: '22%',
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.28)',
    },
    orbHighlightDocked: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    iconContainer: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        position: 'absolute',
        bottom: -35,
        borderRadius: 16,
        overflow: 'hidden',
    },
    labelGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    labelText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 2,
    },
    labelTextDocked: {
        color: '#888',
    },
});

export default memo(FlixyOrbTV);
