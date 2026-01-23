import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import FlixyOrbTV from './FlixyOrbTV';

// TV-specific APIs - only available on react-native-tvos
let useTVEventHandler: any = null;
let TVFocusGuideView: any = View; // Fallback to View on web

if (Platform.OS !== 'web') {
    try {
        const RN = require('react-native');
        useTVEventHandler = RN.useTVEventHandler;
        TVFocusGuideView = RN.TVFocusGuideView || View;
    } catch {
        // Not available
    }
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// TV-specific screen tips with remote-friendly suggestions
const TV_SCREEN_TIPS: Record<string, {
    greeting: string;
    tips: string[];
    suggestions: { label: string; route: string; icon: string }[];
    mood: 'happy' | 'neutral' | 'thinking' | 'excited' | 'sleeping';
}> = {
    home: {
        greeting: "Welcome to MovieFlix TV! 📺",
        tips: [
            "Use your remote's arrow keys to navigate",
            "Press OK/Select to choose an item",
            "Press Back to return to previous screen",
        ],
        suggestions: [
            { label: "Browse Movies", route: "/(tabs)/movies", icon: "film" },
            { label: "Continue Watching", route: "/(tabs)", icon: "play" },
            { label: "Settings", route: "/premium", icon: "settings" },
        ],
        mood: 'happy',
    },
    movies: {
        greeting: "Let's find something great! 🎬",
        tips: [
            "Navigate left/right to browse categories",
            "Navigate up/down within categories",
            "Press OK to see movie details",
        ],
        suggestions: [
            { label: "Watch Party", route: "/watchparty/player", icon: "people" },
            { label: "Continue on Phone", route: "/continue-on-phone", icon: "phone-portrait" },
        ],
        mood: 'excited',
    },
    details: {
        greeting: "Great choice! 🍿",
        tips: [
            "Press Play to start watching",
            "Navigate down for more info",
            "Use Back to return to browse",
        ],
        suggestions: [
            { label: "Play Now", route: "/video-player", icon: "play" },
        ],
        mood: 'excited',
    },
    default: {
        greeting: "Hi there! 👋",
        tips: [
            "I'm Flixy, your TV guide!",
            "Press OK on me for tips",
            "Use arrows to navigate the app",
        ],
        suggestions: [
            { label: "Home", route: "/(tabs)", icon: "home" },
            { label: "Movies", route: "/(tabs)/movies", icon: "film" },
        ],
        mood: 'happy',
    },
};

interface FlixyAssistantTVProps {
    screen?: string;
    visible?: boolean;
    position?: 'bottom-right' | 'bottom-left';
}

/**
 * FlixyAssistantTV - TV-optimized Flixy assistant
 * Uses D-pad/remote navigation instead of voice
 * Large focus states for 10-foot viewing distance
 */
export default function FlixyAssistantTV({
    screen = 'default',
    visible = true,
    position = 'bottom-right',
}: FlixyAssistantTVProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [currentTipIndex, setCurrentTipIndex] = useState(0);
    const [focusedSuggestion, setFocusedSuggestion] = useState(-1);

    // Animation refs
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const bubbleAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const screenConfig = TV_SCREEN_TIPS[screen] || TV_SCREEN_TIPS.default;

    // Handle TV remote events (native only)
    useEffect(() => {
        if (Platform.OS === 'web' || !useTVEventHandler || !isExpanded) return;

        // TV event handler is only available on native TV platforms
    }, [isExpanded, focusedSuggestion, screenConfig.suggestions]);

    // Entrance animation
    useEffect(() => {
        if (visible) {
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 50,
                friction: 7,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, scaleAnim]);

    // Pulse animation when focused
    useEffect(() => {
        if (isFocused && !isExpanded) {
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            );
            pulse.start();
            return () => pulse.stop();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isFocused, isExpanded, pulseAnim]);

    // Bubble animation
    useEffect(() => {
        if (isExpanded) {
            Animated.spring(bubbleAnim, {
                toValue: 1,
                tension: 50,
                friction: 8,
                useNativeDriver: true,
            }).start();
            setFocusedSuggestion(0);
        } else {
            Animated.timing(bubbleAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
            setFocusedSuggestion(-1);
        }
    }, [isExpanded, bubbleAnim]);

    // Cycle tips
    useEffect(() => {
        if (isExpanded) {
            const interval = setInterval(() => {
                setCurrentTipIndex((prev) => (prev + 1) % screenConfig.tips.length);
            }, 4000);
            return () => clearInterval(interval);
        }
    }, [isExpanded, screenConfig.tips.length]);

    const handlePress = useCallback(() => {
        setIsExpanded((prev) => !prev);
    }, []);

    const positionStyle = position === 'bottom-left'
        ? { bottom: 60, left: 40 }
        : { bottom: 60, right: 40 };

    if (!visible) return null;

    return (
        <View style={[styles.container, positionStyle]} pointerEvents="box-none">
            {/* Speech Bubble */}
            {isExpanded && (
                <Animated.View
                    style={[
                        styles.bubbleContainer,
                        {
                            opacity: bubbleAnim,
                            transform: [
                                { scale: bubbleAnim },
                                {
                                    translateY: bubbleAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [30, 0],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    <LinearGradient
                        colors={['rgba(30,30,40,0.95)', 'rgba(20,20,30,0.98)']}
                        style={styles.bubbleGradient}
                    >
                        {/* Greeting */}
                        <Text style={styles.greeting}>{screenConfig.greeting}</Text>

                        {/* Current tip */}
                        <View style={styles.tipContainer}>
                            <Ionicons name="bulb" size={24} color="#ffeb3b" />
                            <Text style={styles.tipText}>{screenConfig.tips[currentTipIndex]}</Text>
                        </View>

                        {/* Tip indicators */}
                        <View style={styles.tipIndicators}>
                            {screenConfig.tips.map((_, index) => (
                                <View
                                    key={index}
                                    style={[
                                        styles.tipDot,
                                        index === currentTipIndex && styles.tipDotActive,
                                    ]}
                                />
                            ))}
                        </View>

                        {/* Navigation suggestions */}
                        <TVFocusGuideView style={styles.suggestionsContainer}>
                            <Text style={styles.suggestionsLabel}>NAVIGATE WITH ↑↓ • SELECT WITH OK</Text>
                            {screenConfig.suggestions.map((suggestion, index) => (
                                <Pressable
                                    key={index}
                                    style={[
                                        styles.suggestionButton,
                                        focusedSuggestion === index && styles.suggestionFocused,
                                    ]}
                                    onPress={() => {
                                        router.push(suggestion.route as any);
                                        setIsExpanded(false);
                                    }}
                                    onFocus={() => setFocusedSuggestion(index)}
                                    hasTVPreferredFocus={index === 0}
                                >
                                    <Ionicons
                                        name={suggestion.icon as any}
                                        size={24}
                                        color={focusedSuggestion === index ? '#fff' : '#e50914'}
                                    />
                                    <Text
                                        style={[
                                            styles.suggestionText,
                                            focusedSuggestion === index && styles.suggestionTextFocused,
                                        ]}
                                    >
                                        {suggestion.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </TVFocusGuideView>

                        {/* Close hint */}
                        <Text style={styles.closeHint}>Press BACK or MENU to close</Text>
                    </LinearGradient>
                </Animated.View>
            )}

            {/* Flixy Character Button */}
            <Pressable
                onPress={handlePress}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                style={[
                    styles.flixyButton,
                    isFocused && styles.flixyButtonFocused,
                ]}
            >
                <Animated.View
                    style={{
                        transform: [{ scale: Animated.multiply(scaleAnim, pulseAnim) }],
                    }}
                >
                    <FlixyOrbTV
                        size={100}
                        isFocused={isFocused}
                        isActive={isExpanded}
                        accent="#e50914"
                    />
                </Animated.View>

                {/* Hint text */}
                {!isExpanded && (
                    <Animated.View style={[styles.hintBadge, { opacity: scaleAnim }]}>
                        <Text style={styles.hintText}>
                            {isFocused ? 'Press OK for tips!' : 'Focus me!'}
                        </Text>
                    </Animated.View>
                )}
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        zIndex: 1000,
        alignItems: 'flex-end',
    },
    flixyButton: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        borderRadius: 20,
    },
    flixyButtonFocused: {
        backgroundColor: 'rgba(229,9,20,0.2)',
    },
    hintBadge: {
        position: 'absolute',
        top: -10,
        backgroundColor: 'rgba(0,0,0,0.85)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#e50914',
    },
    hintText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    bubbleContainer: {
        position: 'absolute',
        bottom: 180,
        right: 0,
        width: Math.min(SCREEN_WIDTH * 0.4, 500),
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 3,
        borderColor: 'rgba(229,9,20,0.5)',
    },
    bubbleGradient: {
        padding: 28,
    },
    greeting: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '800',
        marginBottom: 20,
    },
    tipContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 16,
        backgroundColor: 'rgba(255,235,59,0.1)',
        padding: 16,
        borderRadius: 16,
    },
    tipText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 20,
        lineHeight: 28,
        flex: 1,
    },
    tipIndicators: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 20,
    },
    tipDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    tipDotActive: {
        backgroundColor: '#ffeb3b',
        width: 30,
    },
    suggestionsContainer: {
        gap: 12,
    },
    suggestionsLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: 1,
    },
    suggestionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: 'rgba(229,9,20,0.15)',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: 'rgba(229,9,20,0.3)',
    },
    suggestionFocused: {
        backgroundColor: '#e50914',
        borderColor: '#ff4081',
        transform: [{ scale: 1.02 }],
    },
    suggestionText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '600',
    },
    suggestionTextFocused: {
        fontWeight: '800',
    },
    closeHint: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 16,
    },
});
