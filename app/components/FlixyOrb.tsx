import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming
} from 'react-native-reanimated';

export type FlixyMood = 'happy' | 'neutral' | 'thinking' | 'excited' | 'sleeping' | 'waving';
export type FlixyAction = 'idle' | 'walking' | 'jumping' | 'dancing' | 'running' | 'celebrating';

interface FlixyOrbProps {
    size?: number;
    mood?: FlixyMood;
    action?: FlixyAction;
}

export default function FlixyOrb({ size = 80, mood = 'neutral', action = 'idle' }: FlixyOrbProps) {
    // Animation/Shared Values
    const pulse = useSharedValue(1);
    const rotation = useSharedValue(0);
    const coreColorProgress = useSharedValue(0);
    const ringScale = useSharedValue(1);
    const ringOpacity = useSharedValue(0.6);

    // Determine colors/speed based on mood
    const isExcited = mood === 'excited' || mood === 'waving';
    const isThinking = mood === 'thinking';

    // Animation config
    const pulseDuration = isExcited ? 1000 : 2000;
    const rotateDuration = isThinking ? 2000 : isExcited ? 3000 : 8000;

    // Start animations
    useEffect(() => {
        // Breathing pulse
        pulse.value = 1;
        pulse.value = withRepeat(
            withSequence(
                withTiming(1.1, { duration: pulseDuration, easing: Easing.inOut(Easing.ease) }),
                withTiming(1, { duration: pulseDuration, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );

        // Continuous rotation
        rotation.value = 0;
        rotation.value = withRepeat(
            withTiming(360, { duration: rotateDuration, easing: Easing.linear }),
            -1,
            false
        );

        // Color shift loop
        coreColorProgress.value = withRepeat(
            withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );

        // Subtle ring pulse
        ringScale.value = withRepeat(
            withSequence(
                withTiming(1.2, { duration: 2500 }),
                withTiming(1, { duration: 2500 })
            ),
            -1,
            true
        );

    }, [isExcited, isThinking, pulseDuration, rotateDuration]);

    // Animated Styles
    const coreStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: pulse.value }],
        };
    });

    const ringStyle1 = useAnimatedStyle(() => {
        return {
            transform: [
                { rotate: `${rotation.value}deg` },
                { scale: ringScale.value },
            ],
            opacity: ringOpacity.value,
        };
    });

    const ringStyle2 = useAnimatedStyle(() => {
        return {
            transform: [
                { rotate: `-${rotation.value * 0.8}deg` },
                { scale: ringScale.value * 1.1 },
            ],
            opacity: ringOpacity.value * 0.6,
        };
    });

    const ringStyle3 = useAnimatedStyle(() => {
        return {
            transform: [
                { rotateX: `${rotation.value * 0.5}deg` },
                { rotateY: `${rotation.value * 0.5}deg` },
                { scale: 1.3 },
            ],
            opacity: 0.3,
        };
    });

    // Color definitions
    const gradientColors = isExcited
        ? ['#ff4b4b', '#ff9068'] // Red/Orange for excited
        : isThinking
            ? ['#4b6cb7', '#182848'] // Deep Blue for thinking
            : ['#00d2ff', '#3a7bd5']; // Cyan/Blue default

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            {/* Outer Glow Ring */}
            <Animated.View style={[styles.ringContainer, ringStyle3]}>
                <LinearGradient
                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0)']}
                    style={styles.thinRing}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
            </Animated.View>

            {/* Middle Rotating Ring */}
            <Animated.View style={[styles.ringContainer, ringStyle2]}>
                <LinearGradient
                    colors={['transparent', 'rgba(255,255,255,0.6)', 'transparent']}
                    style={styles.orbitRing}
                />
            </Animated.View>

            {/* Inner Rotating Ring */}
            <Animated.View style={[styles.ringContainer, ringStyle1]}>
                <LinearGradient
                    colors={['rgba(255,255,255,0.8)', 'transparent', 'rgba(255,255,255,0.8)']}
                    style={styles.orbitRing}
                />
            </Animated.View>

            {/* Core Orb */}
            <Animated.View style={[styles.core, coreStyle]}>
                <LinearGradient
                    colors={gradientColors as any}
                    style={styles.gradient}
                    start={{ x: 0.2, y: 0.2 }}
                    end={{ x: 0.8, y: 0.8 }}
                />

                {/* Shine Glint */}
                <LinearGradient
                    colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
                    style={styles.glint}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    core: {
        width: '60%',
        height: '60%',
        borderRadius: 999,
        overflow: 'hidden',
        // Shadow/Glow
        shadowColor: '#00d2ff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 20,
        elevation: 10,
    },
    gradient: {
        flex: 1,
        borderRadius: 999,
    },
    glint: {
        position: 'absolute',
        top: '15%',
        left: '15%',
        width: '30%',
        height: '30%',
        borderRadius: 999,
        opacity: 0.7,
    },
    ringContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    orbitRing: {
        width: '100%',
        height: '100%',
        borderRadius: 999,
        borderWidth: 2,
        borderColor: 'transparent',
        // We simulate a ring with gradient border by trickery or just simpler partial opacity
        borderTopColor: 'rgba(255,255,255,0.5)',
        borderRightColor: 'transparent',
        borderBottomColor: 'rgba(255,255,255,0.2)',
        borderLeftColor: 'transparent',
    },
    thinRing: {
        width: '100%',
        height: '100%',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
});
