import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const FloatingParticle = React.memo(function FloatingParticle({
    delay,
    size,
    startX,
    color
}: {
    delay: number;
    size: number;
    startX: number;
    color: string;
}) {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = () => {
            anim.setValue(0);
            Animated.timing(anim, {
                toValue: 1,
                duration: 6000,
                delay,
                easing: Easing.linear,
                useNativeDriver: true,
            }).start(() => loop());
        };
        loop();
    }, [anim, delay]);

    const translateY = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -120],
    });

    const opacity = anim.interpolate({
        inputRange: [0, 0.15, 0.7, 1],
        outputRange: [0, 0.35, 0.35, 0],
    });

    return (
        <Animated.View
            pointerEvents="none"
            style={{
                position: 'absolute',
                bottom: 80,
                left: startX,
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
                opacity,
                transform: [{ translateY }],
            }}
        />
    );
});

export const FloatingParticles = React.memo(function FloatingParticles({
    accentColor,
    screenWidth
}: {
    accentColor: string;
    screenWidth: number;
}) {
    // Only 4 particles for performance
    const particles = useMemo(() => [
        { id: 0, delay: 0, size: 4, startX: screenWidth * 0.15, color: accentColor },
        { id: 1, delay: 1500, size: 3, startX: screenWidth * 0.45, color: '#ffffff' },
        { id: 2, delay: 3000, size: 5, startX: screenWidth * 0.75, color: accentColor },
        { id: 3, delay: 4500, size: 3, startX: screenWidth * 0.3, color: 'rgba(255,255,255,0.8)' },
    ], [accentColor, screenWidth]);

    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            {particles.map((p) => (
                <FloatingParticle key={p.id} {...p} />
            ))}
        </View>
    );
});
