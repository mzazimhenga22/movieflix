import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FlixyOrb from './FlixyOrb';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STORAGE_KEY = 'flixy_walkthrough_completed';

// Tour step configuration - Flixy moves around to spotlight UI elements
interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  // Where Flixy should position (relative to screen)
  flixyPosition: 'center' | 'bottom-left' | 'bottom-center' | 'top-center';
  // Which navbar tab to spotlight (0-indexed), or null for center screen
  spotlightTabIndex: number | null;
  // Speech bubble direction
  bubbleDirection: 'up' | 'down' | 'left' | 'right';
  mood: 'happy' | 'excited' | 'thinking' | 'waving';
  accentColor: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Hey there! 👋',
    description: "I'm Flixy, your movie companion! Let me show you around.",
    icon: 'sparkles',
    flixyPosition: 'center',
    spotlightTabIndex: null,
    bubbleDirection: 'down',
    mood: 'waving',
    accentColor: '#e50914',
  },
  {
    id: 'home',
    title: 'Home',
    description: 'Your personalized feed with trending movies and shows!',
    icon: 'home',
    flixyPosition: 'bottom-center',
    spotlightTabIndex: 0, // Home/movies tab
    bubbleDirection: 'up',
    mood: 'happy',
    accentColor: '#7dd8ff',
  },
  {
    id: 'categories',
    title: 'Categories',
    description: 'Browse movies by genre - action, comedy, drama and more!',
    icon: 'grid',
    flixyPosition: 'bottom-center',
    spotlightTabIndex: 1, // Categories tab
    bubbleDirection: 'up',
    mood: 'thinking',
    accentColor: '#a855f7',
  },
  {
    id: 'search',
    title: 'Search',
    description: 'Find any movie or show instantly!',
    icon: 'search',
    flixyPosition: 'bottom-center',
    spotlightTabIndex: 2, // Search tab
    bubbleDirection: 'up',
    mood: 'happy',
    accentColor: '#10b981',
  },
  {
    id: 'downloads',
    title: 'Downloads',
    description: 'Save movies to watch offline - perfect for flights and commutes!',
    icon: 'download',
    flixyPosition: 'bottom-center',
    spotlightTabIndex: 3, // Downloads tab
    bubbleDirection: 'up',
    mood: 'excited',
    accentColor: '#f59e0b',
  },
  {
    id: 'marketplace',
    title: 'Marketplace',
    description: 'Shop exclusive movie merch and collectibles!',
    icon: 'bag',
    flixyPosition: 'bottom-center',
    spotlightTabIndex: 4, // Marketplace tab
    bubbleDirection: 'up',
    mood: 'happy',
    accentColor: '#ec4899',
  },
  {
    id: 'more',
    title: 'More Features',
    description: 'Interactive content, games, and special experiences await!',
    icon: 'sparkles',
    flixyPosition: 'bottom-center',
    spotlightTabIndex: 5, // Interactive/More tab
    bubbleDirection: 'up',
    mood: 'excited',
    accentColor: '#06b6d4',
  },
  {
    id: 'ready',
    title: "You're all set! 🎬",
    description: 'Tap me anytime for tips. Now go explore!',
    icon: 'rocket',
    flixyPosition: 'center',
    spotlightTabIndex: null,
    bubbleDirection: 'down',
    mood: 'excited',
    accentColor: '#e50914',
  },
];

// Calculate navbar tab position
function getTabSpotlightPosition(tabIndex: number, insetBottom: number): { x: number; y: number; width: number; height: number } {
  const TAB_COUNT = 6;
  const NAV_WIDTH = SCREEN_WIDTH * 0.96;
  const NAV_LEFT = (SCREEN_WIDTH - NAV_WIDTH) / 2;
  const TAB_WIDTH = NAV_WIDTH / TAB_COUNT;
  const NAV_HEIGHT = 72;
  const NAV_BOTTOM = Platform.OS === 'ios' ? (insetBottom || 12) : (insetBottom ? insetBottom + 6 : 10);

  return {
    x: NAV_LEFT + (tabIndex * TAB_WIDTH) + (TAB_WIDTH / 2) - 35,
    y: SCREEN_HEIGHT - NAV_BOTTOM - NAV_HEIGHT - 10,
    width: 70,
    height: 80,
  };
}

// Get Flixy position based on step config
function getFlixyPosition(
  step: TourStep,
  insetBottom: number
): { x: number; y: number } {
  const NAV_HEIGHT = 72;
  const NAV_BOTTOM = Platform.OS === 'ios' ? (insetBottom || 12) : (insetBottom ? insetBottom + 6 : 10);
  const FLIXY_SIZE = 120;

  switch (step.flixyPosition) {
    case 'center':
      return {
        x: SCREEN_WIDTH / 2 - FLIXY_SIZE / 2,
        y: SCREEN_HEIGHT / 2 - FLIXY_SIZE - 40,
      };
    case 'bottom-center':
      // Position Flixy above the navbar, centered on the spotlighted tab
      if (step.spotlightTabIndex !== null) {
        const tabPos = getTabSpotlightPosition(step.spotlightTabIndex, insetBottom);
        return {
          x: tabPos.x + tabPos.width / 2 - FLIXY_SIZE / 2,
          y: SCREEN_HEIGHT - NAV_BOTTOM - NAV_HEIGHT - FLIXY_SIZE - 80,
        };
      }
      return {
        x: SCREEN_WIDTH / 2 - FLIXY_SIZE / 2,
        y: SCREEN_HEIGHT - NAV_BOTTOM - NAV_HEIGHT - FLIXY_SIZE - 60,
      };
    case 'bottom-left':
      return {
        x: 20,
        y: SCREEN_HEIGHT - NAV_BOTTOM - NAV_HEIGHT - FLIXY_SIZE - 60,
      };
    case 'top-center':
      return {
        x: SCREEN_WIDTH / 2 - FLIXY_SIZE / 2,
        y: 100,
      };
    default:
      return {
        x: SCREEN_WIDTH / 2 - FLIXY_SIZE / 2,
        y: SCREEN_HEIGHT / 2 - FLIXY_SIZE / 2,
      };
  }
}

interface FlixyWalkthroughProps {
  onComplete: () => void;
}

export default function FlixyWalkthrough({ onComplete }: FlixyWalkthroughProps) {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(0);
  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  // Animations
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const flixyX = useRef(new Animated.Value(SCREEN_WIDTH / 2 - 60)).current;
  const flixyY = useRef(new Animated.Value(SCREEN_HEIGHT / 2 - 100)).current;
  const flixyScale = useRef(new Animated.Value(0)).current;
  const bubbleOpacity = useRef(new Animated.Value(0)).current;
  const bubbleScale = useRef(new Animated.Value(0.8)).current;
  const spotlightOpacity = useRef(new Animated.Value(0)).current;

  // Initial entrance
  useEffect(() => {
    const pos = getFlixyPosition(step, insets.bottom);
    flixyX.setValue(pos.x);
    flixyY.setValue(pos.y);

    Animated.sequence([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.spring(flixyScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(bubbleOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(bubbleScale, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // Animate to new step
  const animateToStep = useCallback((nextStep: number) => {
    const nextStepData = TOUR_STEPS[nextStep];
    const pos = getFlixyPosition(nextStepData, insets.bottom);

    // Fade out bubble
    Animated.timing(bubbleOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setCurrentStep(nextStep);

      // Move Flixy
      Animated.parallel([
        Animated.spring(flixyX, {
          toValue: pos.x,
          tension: 40,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(flixyY, {
          toValue: pos.y,
          tension: 40,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(spotlightOpacity, {
          toValue: nextStepData.spotlightTabIndex !== null ? 1 : 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Fade in new bubble
        Animated.parallel([
          Animated.timing(bubbleOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.spring(bubbleScale, {
            toValue: 1,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
      });
    });
  }, [flixyX, flixyY, bubbleOpacity, bubbleScale, spotlightOpacity, insets.bottom]);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      // Complete walkthrough
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(flixyScale, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => { });
        onComplete();
      });
    } else {
      animateToStep(currentStep + 1);
    }
  }, [isLastStep, currentStep, animateToStep, overlayOpacity, flixyScale, onComplete]);

  const handleSkip = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(flixyScale, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => { });
      onComplete();
    });
  }, [overlayOpacity, flixyScale, onComplete]);

  // Spotlight position for current step
  const spotlightPos = step.spotlightTabIndex !== null
    ? getTabSpotlightPosition(step.spotlightTabIndex, insets.bottom)
    : null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Dark overlay */}
      <Animated.View
        style={[styles.overlay, { opacity: overlayOpacity }]}
        pointerEvents="none"
      />

      {/* Spotlight cutout effect */}
      {spotlightPos && (
        <Animated.View
          style={[
            styles.spotlight,
            {
              left: spotlightPos.x,
              top: spotlightPos.y,
              width: spotlightPos.width,
              height: spotlightPos.height,
              opacity: spotlightOpacity,
            },
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={[`${step.accentColor}40`, `${step.accentColor}20`]}
            style={styles.spotlightGlow}
          />
        </Animated.View>
      )}

      {/* Tap area to continue */}
      <Pressable style={styles.tapArea} onPress={handleNext}>
        {/* Skip button */}
        {!isLastStep && (
          <Pressable style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}

        {/* Step indicator */}
        <View style={[styles.stepIndicator, { top: insets.top + 60 }]}>
          {TOUR_STEPS.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.stepDot,
                idx === currentStep && { backgroundColor: step.accentColor, width: 24 },
                idx < currentStep && { backgroundColor: 'rgba(255,255,255,0.6)' },
              ]}
            />
          ))}
        </View>

        {/* Flixy character */}
        <Animated.View
          style={[
            styles.flixyContainer,
            {
              transform: [
                { translateX: flixyX },
                { translateY: flixyY },
                { scale: flixyScale },
              ],
            },
          ]}
        >
          {/* Glow behind Flixy */}
          <View style={[styles.flixyGlow, { backgroundColor: step.accentColor }]} />

          {/* Flixy */}
          <FlixyOrb size={120} mood={step.mood} />

          {/* Speech bubble */}
          <Animated.View
            style={[
              styles.speechBubble,
              step.bubbleDirection === 'up' && styles.bubbleUp,
              step.bubbleDirection === 'down' && styles.bubbleDown,
              {
                opacity: bubbleOpacity,
                transform: [{ scale: bubbleScale }],
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(30,30,40,0.95)', 'rgba(20,20,30,0.98)']}
              style={styles.bubbleGradient}
            >
              <View style={styles.bubbleHeader}>
                <View style={[styles.bubbleIcon, { backgroundColor: `${step.accentColor}30` }]}>
                  <Ionicons name={step.icon as any} size={20} color={step.accentColor} />
                </View>
                <Text style={styles.bubbleTitle}>{step.title}</Text>
              </View>
              <Text style={styles.bubbleDescription}>{step.description}</Text>
              <View style={styles.bubbleFooter}>
                <Text style={styles.tapHint}>
                  {isLastStep ? 'Tap to start!' : 'Tap to continue'}
                </Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
              </View>
            </LinearGradient>
            {/* Bubble pointer */}
            <View
              style={[
                styles.bubblePointer,
                step.bubbleDirection === 'up' && styles.pointerDown,
                step.bubbleDirection === 'down' && styles.pointerUp,
                { borderTopColor: 'rgba(25,25,35,0.95)' },
              ]}
            />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

// Utility to check if walkthrough should be shown
export async function shouldShowWalkthrough(): Promise<boolean> {
  try {
    const completed = await AsyncStorage.getItem(STORAGE_KEY);
    return completed !== 'true';
  } catch {
    return true;
  }
}

// Reset walkthrough (for testing)
export async function resetWalkthrough(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  tapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    zIndex: 100,
  },
  skipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  stepIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 100,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  spotlight: {
    position: 'absolute',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  spotlightGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
  },
  flixyContainer: {
    position: 'absolute',
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  flixyGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    opacity: 0.3,
  },
  speechBubble: {
    position: 'absolute',
    width: SCREEN_WIDTH - 40,
    maxWidth: 340,
    borderRadius: 20,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  bubbleUp: {
    bottom: 130,
    left: -(SCREEN_WIDTH - 40) / 2 + 60,
  },
  bubbleDown: {
    top: 130,
    left: -(SCREEN_WIDTH - 40) / 2 + 60,
  },
  bubbleGradient: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  bubbleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  bubbleDescription: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  tapHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  bubblePointer: {
    position: 'absolute',
    left: '50%',
    marginLeft: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  pointerUp: {
    top: -9,
    transform: [{ rotate: '180deg' }],
  },
  pointerDown: {
    bottom: -9,
  },
});
