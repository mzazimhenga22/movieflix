import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Particle {
    id: number;
    x: Animated.Value;
    y: Animated.Value;
    opacity: Animated.Value;
    scale: Animated.Value;
    rotation: Animated.Value;
    size: number;
    color: string;
}

interface ParticleSystemProps {
    particleCount?: number;
    colors?: string[];
    minSize?: number;
    maxSize?: number;
    speed?: number;
    type?: 'float' | 'sparkle' | 'rain' | 'snow';
    style?: object;
}

const ParticleSystem: React.FC<ParticleSystemProps> = ({
    particleCount = 20,
    colors = ['#fff', '#e50914', '#7B68EE', '#00CED1'],
    minSize = 2,
    maxSize = 6,
    speed = 1,
    type = 'float',
    style,
}) => {
    const animationsRef = useRef<Animated.CompositeAnimation[]>([]);

    const particles = useMemo<Particle[]>(() => {
        return Array.from({ length: particleCount }, (_, i) => ({
            id: i,
            x: new Animated.Value(Math.random() * SCREEN_WIDTH),
            y: new Animated.Value(Math.random() * SCREEN_HEIGHT),
            opacity: new Animated.Value(Math.random() * 0.5 + 0.3),
            scale: new Animated.Value(Math.random() * 0.5 + 0.5),
            rotation: new Animated.Value(0),
            size: Math.random() * (maxSize - minSize) + minSize,
            color: colors[Math.floor(Math.random() * colors.length)],
        }));
    }, [particleCount, colors, minSize, maxSize]);

    useEffect(() => {
        particles.forEach((particle) => {
            const duration = (3000 + Math.random() * 4000) / speed;

            const createAnimation = () => {
                const animations: Animated.CompositeAnimation[] = [];

                if (type === 'float') {
                    // Floating upward with horizontal drift
                    animations.push(
                        Animated.loop(
                            Animated.parallel([
                                Animated.sequence([
                                    Animated.timing(particle.y, {
                                        toValue: -50,
                                        duration: duration,
                                        useNativeDriver: true,
                                    }),
                                    Animated.timing(particle.y, {
                                        toValue: SCREEN_HEIGHT + 50,
                                        duration: 0,
                                        useNativeDriver: true,
                                    }),
                                ]),
                                Animated.sequence([
                                    Animated.timing(particle.x, {
                                        toValue: particle.x._value + (Math.random() * 100 - 50),
                                        duration: duration / 2,
                                        useNativeDriver: true,
                                    }),
                                    Animated.timing(particle.x, {
                                        toValue: particle.x._value - (Math.random() * 100 - 50),
                                        duration: duration / 2,
                                        useNativeDriver: true,
                                    }),
                                ]),
                                Animated.loop(
                                    Animated.sequence([
                                        Animated.timing(particle.opacity, {
                                            toValue: 0.8,
                                            duration: duration / 4,
                                            useNativeDriver: true,
                                        }),
                                        Animated.timing(particle.opacity, {
                                            toValue: 0.2,
                                            duration: duration / 4,
                                            useNativeDriver: true,
                                        }),
                                    ])
                                ),
                            ])
                        )
                    );
                } else if (type === 'sparkle') {
                    // Twinkling in place
                    animations.push(
                        Animated.loop(
                            Animated.parallel([
                                Animated.sequence([
                                    Animated.timing(particle.scale, {
                                        toValue: 1.5,
                                        duration: 500 + Math.random() * 500,
                                        useNativeDriver: true,
                                    }),
                                    Animated.timing(particle.scale, {
                                        toValue: 0.3,
                                        duration: 500 + Math.random() * 500,
                                        useNativeDriver: true,
                                    }),
                                ]),
                                Animated.sequence([
                                    Animated.timing(particle.opacity, {
                                        toValue: 1,
                                        duration: 300,
                                        useNativeDriver: true,
                                    }),
                                    Animated.timing(particle.opacity, {
                                        toValue: 0,
                                        duration: 700,
                                        useNativeDriver: true,
                                    }),
                                ]),
                                Animated.timing(particle.rotation, {
                                    toValue: 360,
                                    duration: 2000,
                                    useNativeDriver: true,
                                }),
                            ])
                        )
                    );
                } else if (type === 'rain' || type === 'snow') {
                    const horizontalDrift = type === 'snow' ? 30 : 5;
                    animations.push(
                        Animated.loop(
                            Animated.parallel([
                                Animated.sequence([
                                    Animated.timing(particle.y, {
                                        toValue: SCREEN_HEIGHT + 50,
                                        duration: duration,
                                        useNativeDriver: true,
                                    }),
                                    Animated.timing(particle.y, {
                                        toValue: -50,
                                        duration: 0,
                                        useNativeDriver: true,
                                    }),
                                ]),
                                Animated.loop(
                                    Animated.sequence([
                                        Animated.timing(particle.x, {
                                            toValue: particle.x._value + horizontalDrift,
                                            duration: duration / 4,
                                            useNativeDriver: true,
                                        }),
                                        Animated.timing(particle.x, {
                                            toValue: particle.x._value - horizontalDrift,
                                            duration: duration / 4,
                                            useNativeDriver: true,
                                        }),
                                    ])
                                ),
                            ])
                        )
                    );
                }

                animations.forEach((anim) => anim.start());
                animationsRef.current.push(...animations);
            };

            setTimeout(createAnimation, Math.random() * 2000);
        });

        return () => {
            animationsRef.current.forEach((anim) => anim.stop());
            animationsRef.current = [];
        };
    }, [particles, type, speed]);

    return (
        <View style={[styles.container, style]} pointerEvents="none">
            {particles.map((particle) => {
                const spin = particle.rotation.interpolate({
                    inputRange: [0, 360],
                    outputRange: ['0deg', '360deg'],
                });

                return (
                    <Animated.View
                        key={particle.id}
                        style={[
                            styles.particle,
                            {
                                width: particle.size,
                                height: particle.size,
                                borderRadius: particle.size / 2,
                                backgroundColor: particle.color,
                                transform: [
                                    { translateX: particle.x },
                                    { translateY: particle.y },
                                    { scale: particle.scale },
                                    { rotate: spin },
                                ],
                                opacity: particle.opacity,
                            },
                        ]}
                    />
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
    },
    particle: {
        position: 'absolute',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
    },
});

export default ParticleSystem;
