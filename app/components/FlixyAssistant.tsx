import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import FlixyOrb from './FlixyOrb';
import { useFlixySettings } from './FlixySettingsProvider';
import { useFlixyVoice } from './FlixyVoice';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type FlixyMood = 'happy' | 'neutral' | 'thinking' | 'excited' | 'sleeping' | 'waving';
type FlixyAction = 'idle' | 'walking' | 'jumping' | 'dancing' | 'running' | 'celebrating';

// Screen-specific tips and suggestions
const SCREEN_TIPS: Record<string, {
    greeting: string;
    tips: string[];
    suggestions: { label: string; route: string; icon: string }[];
    mood: FlixyMood;
    action: FlixyAction;
}> = {
    movies: {
        greeting: "Hey there! 🎬",
        tips: [
            "Swipe up to discover trending movies!",
            "Tap the heart to add to your watchlist",
            "Long press any movie for quick actions",
            "Check out the new releases section!",
        ],
        suggestions: [
            { label: "Browse Downloads", route: "/downloads", icon: "cloud-download" },
            { label: "Watch Parties", route: "/watchparty", icon: "people" },
            { label: "My List", route: "/my-list", icon: "bookmark" },
        ],
        mood: 'happy',
        action: 'idle',
    },
    home: {
        greeting: "Welcome back! ✨",
        tips: [
            "Your personalized feed is ready",
            "New episodes are waiting for you!",
            "Don't forget to check your messages",
        ],
        suggestions: [
            { label: "Movies", route: "/(tabs)/movies", icon: "film" },
            { label: "Social Feed", route: "/social-feed", icon: "people-circle" },
            { label: "Messages", route: "/messaging", icon: "chatbubbles" },
        ],
        mood: 'excited',
        action: 'dancing',
    },
    profile: {
        greeting: "Looking good! 💫",
        tips: [
            "Update your avatar to stand out",
            "Connect with more friends",
            "Check your watch history",
        ],
        suggestions: [
            { label: "Edit Profile", route: "/edit-profile", icon: "create" },
            { label: "Settings", route: "/settings", icon: "settings" },
            { label: "Premium", route: "/premium", icon: "star" },
        ],
        mood: 'happy',
        action: 'idle',
    },
    search: {
        greeting: "What shall we find? 🔍",
        tips: [
            "Try searching by actor name",
            "Use voice search for faster results",
            "Browse by genre for inspiration",
        ],
        suggestions: [
            { label: "Trending", route: "/(tabs)/movies", icon: "trending-up" },
            { label: "Categories", route: "/see-all", icon: "grid" },
        ],
        mood: 'thinking',
        action: 'idle',
    },
    messaging: {
        greeting: "Let's chat! 💬",
        tips: [
            "Share movies with your friends!",
            "Start a watch party together",
            "React to messages with emojis",
        ],
        suggestions: [
            { label: "Calls", route: "/calls", icon: "call" },
            { label: "Find Friends", route: "/profile-search", icon: "person-add" },
        ],
        mood: 'excited',
        action: 'dancing',
    },
    downloads: {
        greeting: "Offline & Ready! 📥",
        tips: [
            "Your downloads are safe here",
            "Watch without internet anytime",
            "Auto-delete expired downloads",
        ],
        suggestions: [
            { label: "Find More", route: "/(tabs)/movies", icon: "search" },
            { label: "Storage", route: "/settings", icon: "folder" },
        ],
        mood: 'happy',
        action: 'idle',
    },
    socialFeed: {
        greeting: "What's trending? 🔥",
        tips: [
            "Double-tap to like a reel!",
            "Swipe up for more amazing content",
            "Follow creators you love",
            "Share reels with your friends",
        ],
        suggestions: [
            { label: "Go Live", route: "/social-feed/live-setup", icon: "videocam" },
            { label: "Create Post", route: "/social-feed/post-create", icon: "add-circle" },
            { label: "Messages", route: "/messaging", icon: "chatbubbles" },
        ],
        mood: 'excited',
        action: 'dancing',
    },
    marketplace: {
        greeting: "Shop & Discover! 🛍️",
        tips: [
            "Find exclusive movie merch here!",
            "Check out today's deals",
            "Sell your own products too",
            "Secure checkout with escrow",
        ],
        suggestions: [
            { label: "My Orders", route: "/marketplace/orders", icon: "receipt" },
            { label: "Sell Item", route: "/marketplace/sell", icon: "pricetag" },
            { label: "Wishlist", route: "/marketplace/wishlist", icon: "heart" },
        ],
        mood: 'happy',
        action: 'celebrating',
    },
    default: {
        greeting: "Hi there! 👋",
        tips: [
            "I'm Flixy, your movie companion!",
            "Tap me anytime for help",
            "Explore and enjoy!",
        ],
        suggestions: [
            { label: "Home", route: "/(tabs)", icon: "home" },
            { label: "Movies", route: "/(tabs)/movies", icon: "film" },
        ],
        mood: 'waving',
        action: 'idle',
    },
};

interface FlixyAssistantProps {
    screen?: string;
    messageCount?: number;
    visible?: boolean;
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    onDismiss?: () => void;
    customTip?: string;
    showTip?: boolean;
    bottomOffset?: number;
}

export default function FlixyAssistant({
    screen = 'default',
    messageCount = 0,
    visible = true,
    position = 'bottom-right',
    onDismiss,
    customTip,
    showTip = false,
    bottomOffset = 100,
}: FlixyAssistantProps) {
    // ... (rest of the component state/hooks)
    const [isExpanded, setIsExpanded] = useState(showTip);
    const [currentTipIndex, setCurrentTipIndex] = useState(0);
    const [autoShowTimer, setAutoShowTimer] = useState<NodeJS.Timeout | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Animation refs
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const bubbleAnim = useRef(new Animated.Value(0)).current;
    const badgeScaleAnim = useRef(new Animated.Value(0)).current;
    const bubbleOpacity = useRef(new Animated.Value(0)).current;
    const flixyBounce = useRef(new Animated.Value(1)).current;
    const collapseAnim = useRef(new Animated.Value(0)).current;

    const screenConfig = SCREEN_TIPS[screen] || SCREEN_TIPS.default;
    const tips = customTip ? [customTip] : screenConfig.tips;

    // Voice activation hook
    const { simulateWakeWord } = useFlixyVoice();

    // Check if Flixy is enabled in settings
    const { settings, isLoaded } = useFlixySettings();
    const isEnabled = isLoaded ? settings.assistantEnabled : true;

    // Entrance animation
    useEffect(() => {
        if (visible) {
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 50,
                friction: 7,
                useNativeDriver: true,
            }).start();

            // Auto-collapse after 3 seconds if not expanded
            const collapseTimer = setTimeout(() => {
                if (!isExpanded) {
                    setIsCollapsed(true);
                    Animated.spring(collapseAnim, {
                        toValue: 1,
                        tension: 80,
                        friction: 10,
                        useNativeDriver: true,
                    }).start();
                }
            }, 3000);

            return () => clearTimeout(collapseTimer);
        } else {
            Animated.timing(scaleAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, scaleAnim, isExpanded, collapseAnim]);

    // Message badge animation
    useEffect(() => {
        if (messageCount > 0) {
            Animated.sequence([
                Animated.spring(badgeScaleAnim, {
                    toValue: 1.3,
                    tension: 100,
                    friction: 5,
                    useNativeDriver: true,
                }),
                Animated.spring(badgeScaleAnim, {
                    toValue: 1,
                    tension: 50,
                    friction: 7,
                    useNativeDriver: true,
                }),
            ]).start();

            // Bounce Flixy when new messages arrive
            Animated.sequence([
                Animated.timing(flixyBounce, {
                    toValue: 1.1,
                    duration: 150,
                    easing: Easing.out(Easing.back(2)),
                    useNativeDriver: true,
                }),
                Animated.timing(flixyBounce, {
                    toValue: 1,
                    duration: 150,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [messageCount, badgeScaleAnim, flixyBounce]);

    // Auto-show tip periodically
    useEffect(() => {
        if (showTip && !isExpanded) {
            const timer = setTimeout(() => {
                setIsExpanded(true);
            }, 3000);
            setAutoShowTimer(timer);
            return () => clearTimeout(timer);
        }
    }, [showTip, isExpanded]);

    // Bubble animation
    useEffect(() => {
        if (isExpanded) {
            Animated.parallel([
                Animated.spring(bubbleAnim, {
                    toValue: 1,
                    tension: 50,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.timing(bubbleOpacity, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(bubbleAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(bubbleOpacity, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [isExpanded, bubbleAnim, bubbleOpacity]);

    // Cycle through tips
    useEffect(() => {
        if (isExpanded && tips.length > 1) {
            const interval = setInterval(() => {
                setCurrentTipIndex((prev) => (prev + 1) % tips.length);
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [isExpanded, tips.length]);

    const handlePress = useCallback(() => {
        // Expand from collapsed state
        if (isCollapsed) {
            setIsCollapsed(false);
            Animated.spring(collapseAnim, {
                toValue: 0,
                tension: 80,
                friction: 10,
                useNativeDriver: true,
            }).start();
            return;
        }
        setIsExpanded((prev) => !prev);
    }, [isCollapsed, collapseAnim]);

    const handleSuggestionPress = useCallback((route: string) => {
        setIsExpanded(false);
        router.push(route as any);
    }, []);

    const handleDismiss = useCallback(() => {
        setIsExpanded(false);
        onDismiss?.();
    }, [onDismiss]);

    const getPositionStyle = () => {
        const screenHeight = Dimensions.get('window').height;
        // Default to bottom-right if not specified
        if (!position) return { bottom: bottomOffset, right: 20 };

        if (position === 'bottom-left') {
            return { bottom: bottomOffset, left: 20 };
        }
        if (position === 'top-right') {
            return { top: 100, right: 20 };
        }
        if (position === 'top-left') {
            return { top: 100, left: 20 };
        }

        // Default bottom-right
        return { bottom: bottomOffset, right: 20 };
    };

    const getBubblePosition = () => {
        // If docked on left, bubble goes right. If docked on right, bubble goes left.
        if (position.includes('left')) {
            return { left: 85 }; // Shift to the right of the orb
        }
        return { right: 85 }; // Shift to the left of the orb
    };

    if (!visible || !isEnabled) return null;

    return (
        <View style={[styles.container, getPositionStyle()]} pointerEvents="box-none">
            {/* Speech Bubble */}
            {isExpanded && (
                <Animated.View
                    style={[
                        styles.bubbleContainer,
                        getBubblePosition(),
                        {
                            opacity: bubbleOpacity,
                            transform: [
                                { scale: bubbleAnim },
                                {
                                    translateY: bubbleAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [20, 0],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    <BlurView intensity={80} tint="dark" style={styles.bubbleBlur}>
                        <LinearGradient
                            colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)']}
                            style={styles.bubbleGradient}
                        >
                            {/* Close button */}
                            <Pressable style={styles.closeButton} onPress={handleDismiss}>
                                <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
                            </Pressable>

                            {/* Greeting */}
                            <Text style={styles.greeting}>{screenConfig.greeting}</Text>

                            {/* Current tip */}
                            <View style={styles.tipContainer}>
                                <Ionicons name="bulb" size={16} color="#ffeb3b" />
                                <Text style={styles.tipText}>{tips[currentTipIndex]}</Text>
                            </View>

                            {/* Tip indicators */}
                            {tips.length > 1 && (
                                <View style={styles.tipIndicators}>
                                    {tips.map((_, index) => (
                                        <View
                                            key={index}
                                            style={[
                                                styles.tipDot,
                                                index === currentTipIndex && styles.tipDotActive,
                                            ]}
                                        />
                                    ))}
                                </View>
                            )}

                            {/* Message notification */}
                            {messageCount > 0 && (
                                <Pressable
                                    style={styles.messageNotification}
                                    onPress={() => handleSuggestionPress('/messaging')}
                                >
                                    <LinearGradient
                                        colors={['#e50914', '#b20710']}
                                        style={styles.messageGradient}
                                    >
                                        <Ionicons name="chatbubbles" size={16} color="#fff" />
                                        <Text style={styles.messageText}>
                                            {messageCount} new message{messageCount > 1 ? 's' : ''}!
                                        </Text>
                                        <Ionicons name="chevron-forward" size={16} color="#fff" />
                                    </LinearGradient>
                                </Pressable>
                            )}

                            {/* Suggestions */}
                            <View style={styles.suggestionsContainer}>
                                <Text style={styles.suggestionsLabel}>Quick actions</Text>
                                <View style={styles.suggestions}>
                                    {/* Voice activation button */}
                                    <Pressable
                                        style={[styles.suggestionButton, styles.voiceButton]}
                                        onPress={() => {
                                            setIsExpanded(false);
                                            simulateWakeWord();
                                        }}
                                    >
                                        <Ionicons name="mic" size={18} color="#fff" />
                                        <Text style={[styles.suggestionText, { color: '#fff' }]}>Hey Flixy</Text>
                                    </Pressable>

                                    {screenConfig.suggestions.slice(0, 2).map((suggestion, index) => (
                                        <Pressable
                                            key={index}
                                            style={styles.suggestionButton}
                                            onPress={() => handleSuggestionPress(suggestion.route)}
                                        >
                                            <Ionicons name={suggestion.icon as any} size={18} color="#e50914" />
                                            <Text style={styles.suggestionText}>{suggestion.label}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                        </LinearGradient>
                    </BlurView>

                    {/* Bubble pointer - adjust rotation based on side */}
                    <View style={[
                        styles.bubblePointer,
                        position.includes('left') ? styles.pointerLeft : styles.pointerRight
                    ]} />
                </Animated.View>
            )}

            {/* Flixy Character Button */}
            <Pressable onPress={handlePress}>
                <Animated.View
                    style={[
                        styles.flixyButton,
                        {
                            transform: [
                                { scale: Animated.multiply(scaleAnim, flixyBounce) },
                                {
                                    translateX: collapseAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0, -50],  // Slide left when collapsed
                                    })
                                },
                            ],
                            opacity: collapseAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 0.7],  // Slightly dim when collapsed
                            }),
                        },
                    ]}
                >
                    {/* Flixy Orb */}
                    <View style={styles.flixyWrapper}>
                        <FlixyOrb
                            size={70}
                            mood={screenConfig.mood}
                            action={isExpanded ? 'dancing' : screenConfig.action}
                        />
                    </View>

                    {/* Message badge */}
                    {messageCount > 0 && (
                        <Animated.View
                            style={[
                                styles.messageBadge,
                                {
                                    transform: [{ scale: badgeScaleAnim }],
                                },
                            ]}
                        >
                            <LinearGradient
                                colors={['#ff4444', '#e50914']}
                                style={styles.badgeGradient}
                            >
                                <Text style={styles.badgeText}>
                                    {messageCount > 99 ? '99+' : messageCount}
                                </Text>
                            </LinearGradient>
                        </Animated.View>
                    )}

                    {/* Tap hint when not expanded */}
                    {!isExpanded && (
                        <Animated.View
                            style={[
                                styles.tapHint,
                                {
                                    opacity: scaleAnim,
                                },
                            ]}
                        >
                            <Text style={styles.tapHintText}>Tap me!</Text>
                        </Animated.View>
                    )}
                </Animated.View>
            </Pressable>
        </View>
    );
}

// Hook to use Flixy Assistant easily
export function useFlixyAssistant(screen: string) {
    const [messageCount, setMessageCount] = useState(0);
    const [showTip, setShowTip] = useState(true);

    const showNotification = useCallback((count: number) => {
        setMessageCount(count);
    }, []);

    const hideTip = useCallback(() => {
        setShowTip(false);
    }, []);

    return {
        screen,
        messageCount,
        showTip,
        showNotification,
        hideTip,
    };
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        zIndex: 1000,
        alignItems: 'flex-end',
    },
    flixyButton: {
        width: 80,
        height: 100,
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    glowRing: {
        position: 'absolute',
        bottom: 0,
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: '#e50914',
        transform: [{ scaleX: 1.2 }],
    },
    flixyWrapper: {
        position: 'absolute',
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    messageBadge: {
        position: 'absolute',
        top: 15,
        right: 0,
        minWidth: 24,
        height: 24,
        borderRadius: 12,
        overflow: 'hidden',
    },
    badgeGradient: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '900',
    },
    tapHint: {
        position: 'absolute',
        top: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
    },
    tapHintText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '600',
    },
    bubbleContainer: {
        position: 'absolute',
        bottom: 20,
        width: SCREEN_WIDTH - 100,
        maxWidth: 320,
        borderRadius: 20,
        overflow: 'visible',
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 15,
    },
    bubbleBlur: {
        borderRadius: 20,
        overflow: 'hidden',
    },
    bubbleGradient: {
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    closeButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    greeting: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 12,
        paddingRight: 30,
    },
    tipContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 8,
        backgroundColor: 'rgba(255,235,59,0.1)',
        padding: 10,
        borderRadius: 12,
    },
    tipText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 14,
        lineHeight: 20,
        flex: 1,
    },
    tipIndicators: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        marginBottom: 12,
    },
    tipDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    tipDotActive: {
        backgroundColor: '#ffeb3b',
        width: 18,
    },
    messageNotification: {
        marginBottom: 12,
        borderRadius: 12,
        overflow: 'hidden',
    },
    messageGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
    },
    messageText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
    suggestionsContainer: {
        marginTop: 4,
    },
    suggestionsLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    suggestions: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    suggestionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(229,9,20,0.15)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(229,9,20,0.3)',
    },
    suggestionText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    voiceButton: {
        backgroundColor: '#e50914',
        borderColor: '#e50914',
    },
    bubblePointer: {
        position: 'absolute',
        bottom: -8,
        width: 16,
        height: 16,
        backgroundColor: 'rgba(30,30,30,0.9)',
        transform: [{ rotate: '45deg' }],
    },
    pointerRight: {
        right: -8, // Pointing to the right (if bubble is on left)
        transform: [{ rotate: '-90deg' }],
    },
    pointerLeft: {
        left: -8, // Pointing to the left (if bubble is on right)
        transform: [{ rotate: '90deg' }],
    },
});
