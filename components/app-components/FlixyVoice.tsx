import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useFlixySettings } from './FlixySettingsProvider';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Voice command patterns
const VOICE_COMMANDS: { pattern: RegExp; action: string; route?: string; response: string }[] = [
    { pattern: /go to movies|show movies|open movies/i, action: 'navigate', route: '/(tabs)/movies', response: "Opening Movies for you!" },
    { pattern: /go to home|show home|take me home/i, action: 'navigate', route: '/(tabs)', response: "Taking you home!" },
    { pattern: /go to profile|show profile|my profile/i, action: 'navigate', route: '/profile', response: "Here's your profile!" },
    { pattern: /go to messages|open chat|show messages/i, action: 'navigate', route: '/messaging', response: "Opening your messages!" },
    { pattern: /go to marketplace|open shop|show shop/i, action: 'navigate', route: '/marketplace', response: "Let's go shopping!" },
    { pattern: /go to downloads|my downloads|offline/i, action: 'navigate', route: '/downloads', response: "Here are your downloads!" },
    { pattern: /search for (.+)/i, action: 'search', response: "Searching for $1..." },
    { pattern: /play (.+)/i, action: 'play', response: "Looking for $1..." },
    { pattern: /what can you do|help|commands/i, action: 'help', response: "I can navigate, search, and help you discover movies!" },
    { pattern: /hello|hi|hey/i, action: 'greet', response: "Hey there! How can I help?" },
    { pattern: /thank you|thanks/i, action: 'thanks', response: "You're welcome! Enjoy your movies!" },
];

interface FlixyVoiceContextType {
    isListening: boolean;
    isActive: boolean;
    activateFlixy: () => void;
    deactivateFlixy: () => void;
    simulateWakeWord: () => void;
}

const FlixyVoiceContext = createContext<FlixyVoiceContextType>({
    isListening: false,
    isActive: false,
    activateFlixy: () => { },
    deactivateFlixy: () => { },
    simulateWakeWord: () => { },
});

export const useFlixyVoice = () => useContext(FlixyVoiceContext);

interface FlixyVoiceProviderProps {
    children: React.ReactNode;
}

/**
 * FlixyVoiceProvider - Global voice activation provider
 * Provides voice activation functionality with Siri-like UI
 */
export function FlixyVoiceProvider({ children }: FlixyVoiceProviderProps) {
    const [isActive, setIsActive] = useState(false);
    const [isListeningForCommand, setIsListeningForCommand] = useState(false);

    // Get settings to check if voice is enabled
    const { settings, isLoaded } = useFlixySettings();
    const voiceEnabled = isLoaded ? settings.voiceEnabled : true;

    const activateFlixy = useCallback(() => {
        if (!voiceEnabled) return;
        setIsActive(true);
    }, [voiceEnabled]);

    const deactivateFlixy = useCallback(() => {
        setIsActive(false);
        setIsListeningForCommand(false);
    }, []);

    const simulateWakeWord = useCallback(() => {
        if (!voiceEnabled) return;
        setIsActive(true);
        setIsListeningForCommand(true);
    }, [voiceEnabled]);

    return (
        <FlixyVoiceContext.Provider
            value={{
                isListening: isListeningForCommand,
                isActive,
                activateFlixy,
                deactivateFlixy,
                simulateWakeWord,
            }}
        >
            {children}
            <FlixyVoiceModal
                visible={isActive}
                onClose={deactivateFlixy}
                isListening={isListeningForCommand}
                setIsListening={setIsListeningForCommand}
            />
        </FlixyVoiceContext.Provider>
    );
}

interface FlixyVoiceModalProps {
    visible: boolean;
    onClose: () => void;
    isListening: boolean;
    setIsListening: (value: boolean) => void;
}

/**
 * Siri-like animated orb component
 */
function SiriOrb({ isListening, size = 180 }: { isListening: boolean; size?: number }) {
    // Multiple animated values for complex orb animation
    const scale1 = useRef(new Animated.Value(1)).current;
    const scale2 = useRef(new Animated.Value(1)).current;
    const scale3 = useRef(new Animated.Value(1)).current;
    const rotate = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0.6)).current;

    useEffect(() => {
        // Base rotation animation
        const rotateAnimation = Animated.loop(
            Animated.timing(rotate, {
                toValue: 1,
                duration: 8000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        rotateAnimation.start();

        return () => rotateAnimation.stop();
    }, [rotate]);

    useEffect(() => {
        if (isListening) {
            // More dynamic animations when listening
            const animations = [
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(scale1, {
                            toValue: 1.15,
                            duration: 400 + Math.random() * 200,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                        Animated.timing(scale1, {
                            toValue: 0.9,
                            duration: 400 + Math.random() * 200,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                    ])
                ),
                Animated.loop(
                    Animated.sequence([
                        Animated.delay(100),
                        Animated.timing(scale2, {
                            toValue: 1.2,
                            duration: 500 + Math.random() * 200,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                        Animated.timing(scale2, {
                            toValue: 0.85,
                            duration: 500 + Math.random() * 200,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                    ])
                ),
                Animated.loop(
                    Animated.sequence([
                        Animated.delay(200),
                        Animated.timing(scale3, {
                            toValue: 1.25,
                            duration: 600 + Math.random() * 200,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                        Animated.timing(scale3, {
                            toValue: 0.8,
                            duration: 600 + Math.random() * 200,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                    ])
                ),
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(pulse, {
                            toValue: 1,
                            duration: 300,
                            useNativeDriver: true,
                        }),
                        Animated.timing(pulse, {
                            toValue: 0.6,
                            duration: 300,
                            useNativeDriver: true,
                        }),
                    ])
                ),
            ];

            animations.forEach(anim => anim.start());

            return () => {
                animations.forEach(anim => anim.stop());
            };
        } else {
            // Calm breathing animation when idle
            const breathe1 = Animated.loop(
                Animated.sequence([
                    Animated.timing(scale1, {
                        toValue: 1.05,
                        duration: 2000,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale1, {
                        toValue: 1,
                        duration: 2000,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ])
            );
            const breathe2 = Animated.loop(
                Animated.sequence([
                    Animated.delay(500),
                    Animated.timing(scale2, {
                        toValue: 1.08,
                        duration: 2500,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale2, {
                        toValue: 1,
                        duration: 2500,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ])
            );
            const breathe3 = Animated.loop(
                Animated.sequence([
                    Animated.delay(1000),
                    Animated.timing(scale3, {
                        toValue: 1.1,
                        duration: 3000,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale3, {
                        toValue: 1,
                        duration: 3000,
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
    }, [isListening, scale1, scale2, scale3, pulse]);

    const rotateInterpolate = rotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const orbSize = size * 0.7;

    return (
        <View style={[styles.orbContainer, { width: size, height: size }]}>
            {/* Outer glow layer 3 */}
            <Animated.View
                style={[
                    styles.orbLayer,
                    {
                        width: orbSize * 1.6,
                        height: orbSize * 1.6,
                        borderRadius: orbSize * 0.8,
                        transform: [{ scale: scale3 }, { rotate: rotateInterpolate }],
                        opacity: pulse.interpolate({
                            inputRange: [0.6, 1],
                            outputRange: [0.15, 0.3],
                        }),
                    },
                ]}
            >
                <LinearGradient
                    colors={['#ff0080', '#ff4d4d', '#e50914', '#ff6b35']}
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
                        width: orbSize * 1.3,
                        height: orbSize * 1.3,
                        borderRadius: orbSize * 0.65,
                        transform: [{ scale: scale2 }, { rotate: rotateInterpolate }],
                        opacity: 0.4,
                    },
                ]}
            >
                <LinearGradient
                    colors={['#e50914', '#ff4081', '#ff6b6b', '#e50914']}
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
                    },
                ]}
            >
                <LinearGradient
                    colors={['#ff4081', '#e50914', '#b20710', '#e50914']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                {/* Inner highlight */}
                <View style={styles.orbHighlight} />
            </Animated.View>

            {/* Center icon */}
            <View style={styles.orbIconContainer}>
                <Ionicons
                    name={isListening ? 'mic' : 'mic-outline'}
                    size={orbSize * 0.3}
                    color="rgba(255,255,255,0.95)"
                />
            </View>
        </View>
    );
}

/**
 * Sound wave visualization - smooth curves
 */
function SoundWaves({ isListening }: { isListening: boolean }) {
    const bars = 7;
    const animations = useRef(
        Array(bars).fill(0).map(() => new Animated.Value(0.3))
    ).current;

    useEffect(() => {
        if (isListening) {
            const runningAnimations = animations.map((anim, index) =>
                Animated.loop(
                    Animated.sequence([
                        Animated.delay(index * 80),
                        Animated.timing(anim, {
                            toValue: 0.3 + Math.random() * 0.7,
                            duration: 150 + Math.random() * 150,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                        Animated.timing(anim, {
                            toValue: 0.2 + Math.random() * 0.3,
                            duration: 150 + Math.random() * 150,
                            easing: Easing.inOut(Easing.sin),
                            useNativeDriver: true,
                        }),
                    ])
                )
            );

            runningAnimations.forEach(anim => anim.start());

            return () => {
                runningAnimations.forEach(anim => anim.stop());
                animations.forEach(anim => anim.setValue(0.3));
            };
        } else {
            animations.forEach(anim => anim.setValue(0.3));
        }
    }, [isListening, animations]);

    if (!isListening) return null;

    return (
        <View style={styles.wavesContainer}>
            {animations.map((anim, index) => (
                <Animated.View
                    key={index}
                    style={[
                        styles.waveBar,
                        {
                            height: 40,
                            transform: [{ scaleY: anim }],
                            backgroundColor: index % 2 === 0 ? '#e50914' : '#ff4081',
                        },
                    ]}
                />
            ))}
        </View>
    );
}

/**
 * FlixyVoiceModal - Siri-like voice activation UI
 */
function FlixyVoiceModal({ visible, onClose, isListening, setIsListening }: FlixyVoiceModalProps) {
    const [transcript, setTranscript] = useState('');
    const [response, setResponse] = useState('');

    // Animation refs
    const containerScale = useRef(new Animated.Value(0)).current;
    const containerOpacity = useRef(new Animated.Value(0)).current;

    // Entrance animation
    useEffect(() => {
        if (visible) {
            setTranscript('');
            setResponse('');

            Animated.parallel([
                Animated.spring(containerScale, {
                    toValue: 1,
                    tension: 65,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.timing(containerOpacity, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(containerScale, {
                    toValue: 0.8,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(containerOpacity, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible, containerScale, containerOpacity]);

    // Process voice command
    const processCommand = useCallback((text: string) => {
        const lowerText = text.toLowerCase();

        for (const cmd of VOICE_COMMANDS) {
            const match = lowerText.match(cmd.pattern);
            if (match) {
                let responseText = cmd.response;
                if (match[1]) {
                    responseText = responseText.replace('$1', match[1]);
                }

                setResponse(responseText);

                if (cmd.action === 'navigate' && cmd.route) {
                    setTimeout(() => {
                        onClose();
                        router.push(cmd.route as any);
                    }, 1500);
                } else {
                    setTimeout(onClose, 2000);
                }
                return;
            }
        }

        setResponse("I'm not sure about that. Try asking me to go somewhere!");
        setTimeout(onClose, 2500);
    }, [onClose]);

    // Simulate speech recognition
    const startListening = useCallback(() => {
        setIsListening(true);
        setTranscript('Listening...');

        setTimeout(() => {
            const simulatedPhrases = [
                'Go to movies',
                'Show my profile',
                'Open messages',
                'Hello Flixy',
                'What can you do',
            ];
            const randomPhrase = simulatedPhrases[Math.floor(Math.random() * simulatedPhrases.length)];

            setTranscript(randomPhrase);
            setIsListening(false);
            processCommand(randomPhrase);
        }, 2000);
    }, [processCommand, setIsListening]);

    // Auto-start listening when modal opens
    useEffect(() => {
        if (visible && !isListening && !response) {
            const timer = setTimeout(startListening, 500);
            return () => clearTimeout(timer);
        }
    }, [visible, isListening, response, startListening]);

    const handleMicPress = () => {
        if (!isListening && !response) {
            startListening();
        }
    };

    if (!visible) return null;

    return (
        <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose}>
                <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

                <Animated.View
                    style={[
                        styles.modalContainer,
                        {
                            transform: [{ scale: containerScale }],
                            opacity: containerOpacity,
                        },
                    ]}
                >
                    {/* Glass card */}
                    <View style={styles.glassCard}>
                        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                        
                        {/* Gradient border */}
                        <LinearGradient
                            colors={['rgba(229,9,20,0.3)', 'rgba(255,64,129,0.1)', 'transparent']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.gradientBorder}
                        />

                        {/* Close button */}
                        <Pressable style={styles.closeButton} onPress={onClose}>
                            <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
                        </Pressable>

                        {/* Flixy branding */}
                        <Text style={styles.brandText}>Flixy</Text>

                        {/* Siri-like orb */}
                        <Pressable onPress={handleMicPress}>
                            <SiriOrb isListening={isListening} size={200} />
                        </Pressable>

                        {/* Sound waves */}
                        <View style={styles.wavesWrapper}>
                            <SoundWaves isListening={isListening} />
                        </View>

                        {/* Transcript / Response */}
                        <View style={styles.textContainer}>
                            {response ? (
                                <Text style={styles.responseText}>{response}</Text>
                            ) : (
                                <Text style={styles.transcriptText}>
                                    {transcript || 'Tap to speak...'}
                                </Text>
                            )}
                        </View>

                        {/* Status indicator */}
                        <View style={styles.statusContainer}>
                            <View style={[styles.statusDot, isListening && styles.statusDotActive]} />
                            <Text style={styles.statusText}>
                                {isListening ? 'Listening' : response ? 'Done' : 'Ready'}
                            </Text>
                        </View>

                        {/* Quick suggestions */}
                        <View style={styles.suggestionsContainer}>
                            {['Movies', 'Profile', 'Messages'].map((suggestion, index) => (
                                <Pressable
                                    key={index}
                                    style={styles.suggestionChip}
                                    onPress={() => {
                                        const command = `Go to ${suggestion.toLowerCase()}`;
                                        setTranscript(command);
                                        processCommand(command);
                                    }}
                                >
                                    <Text style={styles.suggestionText}>{suggestion}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

/**
 * Floating voice activation button - Siri-like orb style
 */
export function FlixyVoiceButton() {
    const { simulateWakeWord } = useFlixyVoice();
    const scale = useRef(new Animated.Value(0)).current;
    const glow = useRef(new Animated.Value(0.5)).current;

    useEffect(() => {
        // Entrance animation
        Animated.spring(scale, {
            toValue: 1,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
        }).start();

        // Glow pulse
        Animated.loop(
            Animated.sequence([
                Animated.timing(glow, {
                    toValue: 1,
                    duration: 1500,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(glow, {
                    toValue: 0.5,
                    duration: 1500,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, [scale, glow]);

    return (
        <Animated.View
            style={[
                styles.floatingButton,
                {
                    transform: [{ scale }],
                },
            ]}
        >
            {/* Glow effect */}
            <Animated.View
                style={[
                    styles.floatingButtonGlow,
                    {
                        opacity: glow,
                        transform: [
                            {
                                scale: glow.interpolate({
                                    inputRange: [0.5, 1],
                                    outputRange: [1, 1.3],
                                }),
                            },
                        ],
                    },
                ]}
            />
            <Pressable onPress={simulateWakeWord} style={styles.floatingButtonInner}>
                <LinearGradient
                    colors={['#ff4081', '#e50914', '#b20710']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.floatingButtonGradient}
                >
                    <Ionicons name="mic" size={24} color="#fff" />
                </LinearGradient>
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        width: SCREEN_WIDTH - 32,
        maxWidth: 400,
    },
    glassCard: {
        borderRadius: 32,
        padding: 24,
        paddingTop: 40,
        alignItems: 'center',
        backgroundColor: 'rgba(20, 20, 25, 0.85)',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    gradientBorder: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 120,
    },
    closeButton: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    brandText: {
        fontSize: 15,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 16,
    },
    orbContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    orbLayer: {
        position: 'absolute',
        overflow: 'hidden',
    },
    orbCore: {
        shadowColor: '#e50914',
        shadowOpacity: 0.6,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 0 },
        elevation: 15,
    },
    orbHighlight: {
        position: 'absolute',
        top: '15%',
        left: '20%',
        width: '30%',
        height: '20%',
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.25)',
    },
    orbIconContainer: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    wavesWrapper: {
        height: 50,
        marginTop: 20,
        marginBottom: 10,
    },
    wavesContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        height: 50,
    },
    waveBar: {
        width: 4,
        borderRadius: 2,
    },
    textContainer: {
        minHeight: 60,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    transcriptText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 18,
        textAlign: 'center',
        fontWeight: '500',
    },
    responseText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 20,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    statusDotActive: {
        backgroundColor: '#4ade80',
    },
    statusText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    suggestionsContainer: {
        flexDirection: 'row',
        gap: 10,
    },
    suggestionChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    suggestionText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: '500',
    },
    floatingButton: {
        position: 'absolute',
        bottom: 180,
        left: 20,
        width: 56,
        height: 56,
    },
    floatingButtonGlow: {
        position: 'absolute',
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#e50914',
    },
    floatingButtonInner: {
        width: 56,
        height: 56,
        borderRadius: 28,
        overflow: 'hidden',
    },
    floatingButtonGradient: {
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default FlixyVoiceProvider;
