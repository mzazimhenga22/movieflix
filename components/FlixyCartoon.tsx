import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    View
} from 'react-native';

type FlixyMood = 'happy' | 'neutral' | 'thinking' | 'excited' | 'sleeping' | 'waving';
type FlixyAction = 'idle' | 'walking' | 'jumping' | 'dancing' | 'running' | 'celebrating' | 'waving'; // Added waving

interface FlixyCartoonProps {
    size?: number;
    mood?: FlixyMood;
    action?: FlixyAction;
}

/**
 * FlixyCartoon - 3D Animated Mascot
 * Uses sprite swapping for complex actions (walking) + native transforms for smooth effects (bouncing).
 */
const FlixyCartoon: React.FC<FlixyCartoonProps> = ({
    size = 180,
    mood = 'happy',
    action = 'idle'
}) => {
    // Animation refs
    const floatAnim = useRef(new Animated.Value(0)).current;
    const bounceAnim = useRef(new Animated.Value(1)).current;

    // Sprite state for walking animation
    const [walkFrame, setWalkFrame] = useState(0);

    // Determine image source based on action/mood state
    const getImageSource = () => {
        // High priority actions
        // if (action === 'jumping' || action === 'celebrating') { // reusing jump for celebrating
        //     return require('../assets/images/flixy_jump.png');
        // }

        // if (action === 'walking' || action === 'running') {
        //     return walkFrame === 0
        //         ? require('../assets/images/flixy_walk1.png')
        //         : require('../assets/images/flixy_walk2.png');
        // }

        // // Mood/Action overrides
        // if (action === 'waving' || mood === 'waving' || mood === 'excited') {
        //     return require('../assets/images/flixy_waving.png');
        // }

        // Default idle/neutral - using new 3D mascot asset
        return require('../assets/images/flixy_3d.png');
    };

    // Walking animation loop (Sprite swap)
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (action === 'walking' || action === 'running') {
            const speed = action === 'running' ? 150 : 300;
            interval = setInterval(() => {
                setWalkFrame(prev => (prev === 0 ? 1 : 0));
            }, speed);
        } else {
            setWalkFrame(0); // Reset to first frame when not walking
        }
        return () => clearInterval(interval);
    }, [action]);

    // Native transform animations
    useEffect(() => {
        // Reset animations
        floatAnim.setValue(0);
        bounceAnim.setValue(1);

        const animations: Animated.CompositeAnimation[] = [];

        // Float animation (Breathing/Idle) - Always active slightly to keep it alive
        const floatAnimation = Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, {
                    toValue: -5,
                    duration: 2000,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(floatAnim, {
                    toValue: 5,
                    duration: 2000,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        );
        animations.push(floatAnimation);
        floatAnimation.start();

        // Bounce effect for exciting actions
        if (action === 'jumping' || action === 'celebrating' || action === 'dancing') {
            const bounceLoop = Animated.loop(
                Animated.sequence([
                    Animated.timing(bounceAnim, {
                        toValue: 1.1,
                        duration: 300,
                        easing: Easing.out(Easing.back(1.5)),
                        useNativeDriver: true,
                    }),
                    Animated.timing(bounceAnim, {
                        toValue: 0.95,
                        duration: 300,
                        easing: Easing.inOut(Easing.quad),
                        useNativeDriver: true,
                    }),
                    Animated.timing(bounceAnim, {
                        toValue: 1,
                        duration: 200,
                        easing: Easing.inOut(Easing.quad),
                        useNativeDriver: true,
                    }),
                ])
            );
            animations.push(bounceLoop);
            bounceLoop.start();
        }

        return () => {
            animations.forEach(anim => anim.stop());
        };
    }, [action, floatAnim, bounceAnim]);

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.Image
                source={getImageSource()}
                style={{
                    width: size,
                    height: size,
                    resizeMode: 'contain',
                    transform: [
                        { translateY: floatAnim },
                        { scale: bounceAnim }
                    ],
                }}
            />
        </View>
    );
};

export default FlixyCartoon;
