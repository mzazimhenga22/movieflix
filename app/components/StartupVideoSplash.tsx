import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Video from 'react-native-video';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop, Path } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  visible: boolean;
  onDone: () => void;
  maxDuration?: number; // Maximum duration before auto-dismiss (ms)
};

const DEFAULT_MAX_DURATION = 5000; // 5 seconds max

export default function StartupVideoSplash({ visible, onDone, maxDuration = DEFAULT_MAX_DURATION }: Props) {
  const [key, setKey] = useState(0);
  const [showContent, setShowContent] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const source = useMemo(() => require('../../assets/videos/startup.mp4'), []);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCalledDone = useRef(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const logoScaleAnim = useRef(new Animated.Value(0)).current;
  const logoRotateAnim = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;
  const particleAnim = useRef(new Animated.Value(0)).current;
  const textFadeAnim = useRef(new Animated.Value(0)).current;
  const textSlideAnim = useRef(new Animated.Value(30)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const exitAnim = useRef(new Animated.Value(1)).current;

  // Particle positions
  const particles = useRef(
    Array.from({ length: 20 }, () => ({
      x: Math.random() * SCREEN_WIDTH,
      y: SCREEN_HEIGHT + Math.random() * 100,
      size: 3 + Math.random() * 6,
      speed: 0.5 + Math.random() * 1,
      opacity: 0.3 + Math.random() * 0.5,
    }))
  ).current;

  // Safe done caller - ensures onDone is only called once
  const safeDone = useCallback(() => {
    if (hasCalledDone.current) return;
    hasCalledDone.current = true;
    
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Exit animation sequence
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(exitAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setShowContent(false);
      onDone();
    });
  }, [onDone, exitAnim, scaleAnim]);

  useEffect(() => {
    if (!visible) return;
    
    // Reset state
    hasCalledDone.current = false;
    setKey((k) => k + 1);
    setShowContent(true);
    setVideoEnded(false);
    setVideoLoaded(false);

    // Set a maximum timeout - auto-dismiss if video takes too long
    timeoutRef.current = setTimeout(() => {
      if (!hasCalledDone.current) {
        console.log('[StartupVideoSplash] Auto-dismissing due to timeout');
        safeDone();
      }
    }, maxDuration);

    // Start entrance animations
    Animated.parallel([
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      // Scale up
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Logo animations with delay
    setTimeout(() => {
      Animated.parallel([
        // Logo scale with bounce
        Animated.spring(logoScaleAnim, {
          toValue: 1,
          tension: 80,
          friction: 6,
          useNativeDriver: true,
        }),
        // Logo subtle rotation
        Animated.timing(logoRotateAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]).start();
    }, 400);

    // Ring animation
    Animated.loop(
      Animated.timing(ringAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Water wave animation
    Animated.loop(
      Animated.timing(waveAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      })
    ).start();

    // Particle float animation
    Animated.loop(
      Animated.timing(particleAnim, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Text animations with delay
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(textFadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(textSlideAnim, {
          toValue: 0,
          tension: 50,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start();
    }, 800);

    // Shimmer animation
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 2500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Cleanup on unmount or when visibility changes
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [visible, maxDuration, safeDone]);

  const handleVideoEnd = useCallback(() => {
    setVideoEnded(true);
    safeDone();
  }, [safeDone]);

  const handleVideoLoad = useCallback(() => {
    setVideoLoaded(true);
  }, []);

  const handleVideoError = useCallback(() => {
    // If video fails to load, dismiss immediately
    console.log('[StartupVideoSplash] Video error, dismissing');
    safeDone();
  }, [safeDone]);

  if (!visible) return null;

  // Wave paths
  const waveHeight = SCREEN_HEIGHT * 0.15;
  const wave1Y = waveAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [waveHeight * 0.3, waveHeight * 0.5, waveHeight * 0.3],
  });
  const wave2Y = waveAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [waveHeight * 0.5, waveHeight * 0.3, waveHeight * 0.5],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: exitAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
      pointerEvents="none"
    >
      {/* Background video - blurred cover */}
      <Video
        key={`bg-${key}`}
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        repeat={false}
        paused={false}
        muted
      />

      {/* Blur overlay */}
      {Platform.OS === 'ios' ? (
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.androidBlur} />
      )}

      {/* Gradient overlay */}
      <LinearGradient
        colors={['rgba(6,182,212,0.3)', 'rgba(229,9,20,0.4)', 'rgba(10,0,20,0.95)']}
        locations={[0, 0.4, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Animated water waves at bottom */}
      <View style={styles.wavesContainer}>
        <Svg width={SCREEN_WIDTH} height={waveHeight} style={styles.waveSvg}>
          <Defs>
            <SvgGradient id="splashWave1" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#7dd8ff" stopOpacity="0.4" />
              <Stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
            </SvgGradient>
            <SvgGradient id="splashWave2" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
              <Stop offset="100%" stopColor="#0891b2" stopOpacity="0.15" />
            </SvgGradient>
          </Defs>
          <AnimatedPath
            d={wave1Y.interpolate({
              inputRange: [0, waveHeight],
              outputRange: [
                `M0,${waveHeight * 0.4} Q${SCREEN_WIDTH * 0.25},${waveHeight * 0.2} ${SCREEN_WIDTH * 0.5},${waveHeight * 0.4} T${SCREEN_WIDTH},${waveHeight * 0.3} L${SCREEN_WIDTH},${waveHeight} L0,${waveHeight} Z`,
                `M0,${waveHeight * 0.3} Q${SCREEN_WIDTH * 0.25},${waveHeight * 0.5} ${SCREEN_WIDTH * 0.5},${waveHeight * 0.3} T${SCREEN_WIDTH},${waveHeight * 0.4} L${SCREEN_WIDTH},${waveHeight} L0,${waveHeight} Z`,
              ],
            })}
            fill="url(#splashWave1)"
          />
          <AnimatedPath
            d={wave2Y.interpolate({
              inputRange: [0, waveHeight],
              outputRange: [
                `M0,${waveHeight * 0.5} Q${SCREEN_WIDTH * 0.3},${waveHeight * 0.7} ${SCREEN_WIDTH * 0.6},${waveHeight * 0.5} T${SCREEN_WIDTH},${waveHeight * 0.6} L${SCREEN_WIDTH},${waveHeight} L0,${waveHeight} Z`,
                `M0,${waveHeight * 0.6} Q${SCREEN_WIDTH * 0.3},${waveHeight * 0.4} ${SCREEN_WIDTH * 0.6},${waveHeight * 0.6} T${SCREEN_WIDTH},${waveHeight * 0.5} L${SCREEN_WIDTH},${waveHeight} L0,${waveHeight} Z`,
              ],
            })}
            fill="url(#splashWave2)"
          />
        </Svg>
      </View>

      {/* Floating particles */}
      {particles.map((particle, i) => (
        <Animated.View
          key={i}
          style={[
            styles.particle,
            {
              left: particle.x,
              width: particle.size,
              height: particle.size,
              borderRadius: particle.size / 2,
              opacity: particleAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [particle.opacity * 0.5, particle.opacity, particle.opacity * 0.5],
              }),
              transform: [
                {
                  translateY: particleAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [particle.y, particle.y - SCREEN_HEIGHT - 100],
                  }),
                },
                {
                  translateX: particleAnim.interpolate({
                    inputRange: [0, 0.25, 0.5, 0.75, 1],
                    outputRange: [0, 10 * particle.speed, 0, -10 * particle.speed, 0],
                  }),
                },
              ],
            },
          ]}
        />
      ))}

      {/* Center content */}
      <View style={styles.centerContent}>
        {/* Animated rings */}
        <Animated.View
          style={[
            styles.ringOuter,
            {
              opacity: ringAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.3, 0.6, 0.3],
              }),
              transform: [
                { scale: pulseAnim },
                {
                  rotate: ringAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['#7dd8ff', '#06b6d4', '#e50914', '#7dd8ff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ringGradient}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.ringMiddle,
            {
              opacity: 0.5,
              transform: [
                {
                  rotate: ringAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['360deg', '0deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['#e50914', '#ff6b35', '#7dd8ff', '#e50914']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ringGradient}
          />
        </Animated.View>

        {/* Logo container */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [
                { scale: logoScaleAnim },
                {
                  rotate: logoRotateAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['-10deg', '0deg'],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Logo glow */}
          <Animated.View
            style={[
              styles.logoGlow,
              {
                opacity: pulseAnim.interpolate({
                  inputRange: [1, 1.15],
                  outputRange: [0.4, 0.8],
                }),
              },
            ]}
          />

          {/* Logo background */}
          <LinearGradient
            colors={['#e50914', '#b20710']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoBackground}
          >
            {/* Play icon */}
            <View style={styles.playIcon}>
              <Svg width={50} height={50} viewBox="0 0 24 24">
                <Path
                  d="M8 5v14l11-7z"
                  fill="#fff"
                />
              </Svg>
            </View>

            {/* Shimmer effect */}
            <Animated.View
              style={[
                styles.logoShimmer,
                {
                  transform: [
                    {
                      translateX: shimmerAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-100, 150],
                      }),
                    },
                  ],
                },
              ]}
            />
          </LinearGradient>

          {/* Water ripple effect */}
          <Animated.View
            style={[
              styles.ripple,
              {
                opacity: pulseAnim.interpolate({
                  inputRange: [1, 1.15],
                  outputRange: [0.6, 0],
                }),
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
        </Animated.View>

        {/* Brand text */}
        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: textFadeAnim,
              transform: [{ translateY: textSlideAnim }],
            },
          ]}
        >
          <Text style={styles.brandName}>MOVIEFLIX</Text>
          <View style={styles.taglineContainer}>
            <View style={styles.taglineLine} />
            <Text style={styles.tagline}>Stream the extraordinary</Text>
            <View style={styles.taglineLine} />
          </View>
        </Animated.View>
      </View>

      {/* Main video - contained */}
      <Video
        key={key}
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        repeat={false}
        paused={false}
        muted
        onLoad={handleVideoLoad}
        onEnd={handleVideoEnd}
        onError={handleVideoError}
      />

      {/* Bottom loading indicator */}
      <Animated.View
        style={[
          styles.loadingContainer,
          {
            opacity: textFadeAnim,
          },
        ]}
      >
        <View style={styles.loadingBar}>
          <Animated.View
            style={[
              styles.loadingProgress,
              {
                transform: [
                  {
                    translateX: shimmerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-SCREEN_WIDTH + 80, 0],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
        <Text style={styles.loadingText}>Loading your experience...</Text>
      </Animated.View>

      {/* Decorative corner accents */}
      <View style={[styles.cornerAccent, styles.topLeft]}>
        <LinearGradient
          colors={['rgba(125,216,255,0.4)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <View style={[styles.cornerAccent, styles.topRight]}>
        <LinearGradient
          colors={['rgba(229,9,20,0.4)', 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <View style={[styles.cornerAccent, styles.bottomLeft]}>
        <LinearGradient
          colors={['rgba(6,182,212,0.3)', 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <View style={[styles.cornerAccent, styles.bottomRight]}>
        <LinearGradient
          colors={['rgba(255,107,53,0.3)', 'transparent']}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 9999,
  },
  androidBlur: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  wavesContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.15,
  },
  waveSvg: {
    position: 'absolute',
    bottom: 0,
  },
  particle: {
    position: 'absolute',
    backgroundColor: '#7dd8ff',
  },
  centerContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOuter: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  ringMiddle: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  ringGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  logoGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#e50914',
  },
  logoBackground: {
    width: 100,
    height: 100,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  playIcon: {
    marginLeft: 8,
  },
  logoShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: [{ skewX: '-20deg' }],
  },
  ripple: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#7dd8ff',
  },
  textContainer: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.25,
    alignItems: 'center',
  },
  brandName: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 8,
    textShadowColor: 'rgba(229,9,20,0.8)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
  taglineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  taglineLine: {
    width: 30,
    height: 1,
    backgroundColor: 'rgba(125,216,255,0.5)',
  },
  tagline: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 60,
    left: 40,
    right: 40,
    alignItems: 'center',
  },
  loadingBar: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  loadingProgress: {
    height: '100%',
    width: '100%',
    backgroundColor: '#7dd8ff',
    borderRadius: 2,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
  },
  cornerAccent: {
    position: 'absolute',
    width: 150,
    height: 150,
  },
  topLeft: {
    top: 0,
    left: 0,
  },
  topRight: {
    top: 0,
    right: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
  },
});
