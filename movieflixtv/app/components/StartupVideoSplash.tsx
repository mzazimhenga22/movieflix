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
import { LinearGradient } from 'expo-linear-gradient';
import Video from 'react-native-video';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  visible: boolean;
  onDone: () => void;
};

export default function StartupVideoSplash({ visible, onDone }: Props) {
  const [key, setKey] = useState(0);
  const source = useMemo(() => require('../../assets/videos/startup.mp4'), []);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
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

  const particles = useRef(
    Array.from({ length: 25 }, () => ({
      x: Math.random() * SCREEN_WIDTH,
      y: SCREEN_HEIGHT + Math.random() * 100,
      size: 4 + Math.random() * 8,
      speed: 0.5 + Math.random() * 1,
      opacity: 0.3 + Math.random() * 0.5,
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    setKey((k) => k + 1);

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.spring(logoScaleAnim, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
        Animated.timing(logoRotateAnim, { toValue: 1, duration: 1200, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      ]).start();
    }, 400);

    Animated.loop(
      Animated.timing(ringAnim, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(waveAnim, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: false })
    ).start();

    Animated.loop(
      Animated.timing(particleAnim, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(textFadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.spring(textSlideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
      ]).start();
    }, 800);

    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 2500, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, [visible]);

  const handleVideoEnd = useCallback(() => {
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(exitAnim, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
      ]),
    ]).start(() => onDone());
  }, [onDone, exitAnim, scaleAnim]);

  // Safety timeout - auto-dismiss after 6 seconds in case video doesn't trigger onEnd
  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => {
      onDone();
    }, 6000);
    return () => clearTimeout(timeout);
  }, [visible, onDone]);

  if (!visible) return null;

  const waveHeight = SCREEN_HEIGHT * 0.12;

  return (
    <Animated.View style={[styles.container, { opacity: exitAnim, transform: [{ scale: scaleAnim }] }]} pointerEvents="none">
      <Video
        key={`bg-${key}`}
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        repeat={false}
        paused={false}
        muted
      />

      <View style={styles.androidBlur} />

      <LinearGradient
        colors={['rgba(6,182,212,0.25)', 'rgba(229,9,20,0.35)', 'rgba(10,0,20,0.95)']}
        locations={[0, 0.4, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.wavesContainer}>
        <Svg width={SCREEN_WIDTH} height={waveHeight} style={styles.waveSvg}>
          <Defs>
            <SvgGradient id="tvWave1" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#7dd8ff" stopOpacity="0.4" />
              <Stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
            </SvgGradient>
            <SvgGradient id="tvWave2" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
              <Stop offset="100%" stopColor="#0891b2" stopOpacity="0.15" />
            </SvgGradient>
          </Defs>
          <Path
            d={`M0,${waveHeight * 0.4} Q${SCREEN_WIDTH * 0.25},${waveHeight * 0.2} ${SCREEN_WIDTH * 0.5},${waveHeight * 0.4} T${SCREEN_WIDTH},${waveHeight * 0.3} L${SCREEN_WIDTH},${waveHeight} L0,${waveHeight} Z`}
            fill="url(#tvWave1)"
          />
          <Path
            d={`M0,${waveHeight * 0.5} Q${SCREEN_WIDTH * 0.3},${waveHeight * 0.7} ${SCREEN_WIDTH * 0.6},${waveHeight * 0.5} T${SCREEN_WIDTH},${waveHeight * 0.6} L${SCREEN_WIDTH},${waveHeight} L0,${waveHeight} Z`}
            fill="url(#tvWave2)"
          />
        </Svg>
      </View>

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

      <View style={styles.centerContent}>
        <Animated.View
          style={[
            styles.ringOuter,
            {
              opacity: ringAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.6, 0.3] }),
              transform: [
                { scale: pulseAnim },
                { rotate: ringAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
              ],
            },
          ]}
        >
          <LinearGradient colors={['#7dd8ff', '#06b6d4', '#e50914', '#7dd8ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ringGradient} />
        </Animated.View>

        <Animated.View
          style={[
            styles.ringMiddle,
            {
              opacity: 0.5,
              transform: [{ rotate: ringAnim.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] }) }],
            },
          ]}
        >
          <LinearGradient colors={['#e50914', '#ff6b35', '#7dd8ff', '#e50914']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ringGradient} />
        </Animated.View>

        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [
                { scale: logoScaleAnim },
                { rotate: logoRotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '0deg'] }) },
              ],
            },
          ]}
        >
          <Animated.View style={[styles.logoGlow, { opacity: pulseAnim.interpolate({ inputRange: [1, 1.15], outputRange: [0.4, 0.8] }) }]} />
          <LinearGradient colors={['#e50914', '#b20710']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logoBackground}>
            <View style={styles.playIcon}>
              <Svg width={70} height={70} viewBox="0 0 24 24">
                <Path d="M8 5v14l11-7z" fill="#fff" />
              </Svg>
            </View>
            <Animated.View
              style={[
                styles.logoShimmer,
                { transform: [{ translateX: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-140, 200] }) }] },
              ]}
            />
          </LinearGradient>
          <Animated.View
            style={[
              styles.ripple,
              {
                opacity: pulseAnim.interpolate({ inputRange: [1, 1.15], outputRange: [0.6, 0] }),
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
        </Animated.View>

        <Animated.View style={[styles.textContainer, { opacity: textFadeAnim, transform: [{ translateY: textSlideAnim }] }]}>
          <Text style={styles.brandName}>MOVIEFLIX</Text>
          <View style={styles.taglineContainer}>
            <View style={styles.taglineLine} />
            <Text style={styles.tagline}>TV Experience</Text>
            <View style={styles.taglineLine} />
          </View>
        </Animated.View>
      </View>

      <Video
        key={key}
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        repeat={false}
        paused={false}
        muted
        onEnd={handleVideoEnd}
        onError={handleVideoEnd}
      />

      <Animated.View style={[styles.loadingContainer, { opacity: textFadeAnim }]}>
        <View style={styles.loadingBar}>
          <Animated.View
            style={[
              styles.loadingProgress,
              { transform: [{ translateX: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-SCREEN_WIDTH + 100, 0] }) }] },
            ]}
          />
        </View>
        <Text style={styles.loadingText}>Preparing your cinematic experience...</Text>
      </Animated.View>

      <View style={[styles.cornerAccent, styles.topLeft]}>
        <LinearGradient colors={['rgba(125,216,255,0.4)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
      </View>
      <View style={[styles.cornerAccent, styles.topRight]}>
        <LinearGradient colors={['rgba(229,9,20,0.4)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
      </View>
      <View style={[styles.cornerAccent, styles.bottomLeft]}>
        <LinearGradient colors={['rgba(6,182,212,0.3)', 'transparent']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
      </View>
      <View style={[styles.cornerAccent, styles.bottomRight]}>
        <LinearGradient colors={['rgba(255,107,53,0.3)', 'transparent']} start={{ x: 1, y: 1 }} end={{ x: 0, y: 0 }} style={StyleSheet.absoluteFillObject} />
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
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  wavesContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.12,
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
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  ringMiddle: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  ringGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 140,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  logoContainer: {
    width: 140,
    height: 140,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  logoGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#e50914',
  },
  logoBackground: {
    width: 140,
    height: 140,
    borderRadius: 40,
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
    marginLeft: 10,
  },
  logoShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: [{ skewX: '-20deg' }],
  },
  ripple: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 4,
    borderColor: '#7dd8ff',
  },
  textContainer: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.18,
    alignItems: 'center',
  },
  brandName: {
    fontSize: 52,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 10,
    textShadowColor: 'rgba(229,9,20,0.8)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
  taglineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 16,
  },
  taglineLine: {
    width: 50,
    height: 2,
    backgroundColor: 'rgba(125,216,255,0.5)',
  },
  tagline: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 50,
    left: 60,
    right: 60,
    alignItems: 'center',
  },
  loadingBar: {
    width: '100%',
    height: 4,
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
    marginTop: 16,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
  },
  cornerAccent: {
    position: 'absolute',
    width: 200,
    height: 200,
  },
  topLeft: { top: 0, left: 0 },
  topRight: { top: 0, right: 0 },
  bottomLeft: { bottom: 0, left: 0 },
  bottomRight: { bottom: 0, right: 0 },
});
