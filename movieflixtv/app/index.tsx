import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { authPromise } from '@/constants/firebase';
import AmbientGlow from './components/AmbientGlow';
import FloatingParticles from './components/FloatingParticles';

export default function TvSplash() {
  const didNavigate = useRef(false);
  const [status, setStatus] = useState('Initializing...');
  const [statusIcon, setStatusIcon] = useState<'cloud-outline' | 'checkmark-circle' | 'alert-circle'>('cloud-outline');

  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleSlide = useRef(new Animated.Value(40)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const statusOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringRotate = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.spring(titleSlide, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
        Animated.timing(titleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start();
    }, 300);

    setTimeout(() => {
      Animated.timing(statusOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 600);

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(ringRotate, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    Animated.timing(progressAnim, { toValue: 1, duration: 3000, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;

    const go = async () => {
      try {
        const auth = await authPromise;
        unsub = onAuthStateChanged(auth, async (user) => {
          if (didNavigate.current) return;

          if (!user) {
            setStatus('Sign in to continue');
            setStatusIcon('alert-circle');
            timeout = setTimeout(() => {
              if (didNavigate.current) return;
              didNavigate.current = true;
              router.replace('/(auth)/login');
            }, 1200);
            return;
          }

          setStatus('Syncing your profiles...');
          setStatusIcon('checkmark-circle');
          timeout = setTimeout(() => {
            if (didNavigate.current) return;
            didNavigate.current = true;
            router.replace('/select-profile');
          }, 900);
        });
      } catch {
        setStatus('Configuration error');
        setStatusIcon('alert-circle');
        // Navigate to login on error after delay
        fallbackTimeout = setTimeout(() => {
          if (didNavigate.current) return;
          didNavigate.current = true;
          router.replace('/(auth)/login');
        }, 2000);
      }
    };

    void go();
    
    // Fallback: if nothing happens in 5 seconds, go to login
    const safetyTimeout = setTimeout(() => {
      if (didNavigate.current) return;
      didNavigate.current = true;
      router.replace('/(auth)/login');
    }, 5000);

    return () => {
      try { unsub?.(); } catch {}
      if (timeout) clearTimeout(timeout);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      clearTimeout(safetyTimeout);
    };
  }, []);

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0512', '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <AmbientGlow color="#e50914" intensity={0.2} />
      <FloatingParticles count={15} color="#7dd8ff" />

      <View style={styles.cornerGlowTL}>
        <LinearGradient colors={['rgba(125,216,255,0.25)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.cornerGlowBR}>
        <LinearGradient colors={['rgba(229,9,20,0.2)', 'transparent']} start={{ x: 1, y: 1 }} end={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
      </View>

      <View style={styles.center}>
        <Animated.View
          style={[
            styles.ringOuter,
            {
              transform: [
                { scale: pulseAnim },
                { rotate: ringRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
              ],
            },
          ]}
        >
          <LinearGradient colors={['#7dd8ff', '#06b6d4', '#e50914', '#7dd8ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ringGradient} />
        </Animated.View>

        <Animated.View
          style={[
            styles.ringInner,
            { transform: [{ rotate: ringRotate.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] }) }] },
          ]}
        >
          <LinearGradient colors={['#e50914', '#ff6b35', '#7dd8ff', '#e50914']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ringGradient} />
        </Animated.View>

        <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <Animated.View style={[styles.logoGlow, { opacity: pulseAnim.interpolate({ inputRange: [1, 1.08], outputRange: [0.4, 0.7] }) }]} />
          <LinearGradient colors={['#e50914', '#b20710']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logoBg}>
            <Svg width={80} height={80} viewBox="0 0 24 24">
              <Path d="M8 5v14l11-7z" fill="#fff" />
            </Svg>
          </LinearGradient>
        </Animated.View>

        <Animated.View style={[styles.titleWrap, { opacity: titleOpacity, transform: [{ translateY: titleSlide }] }]}>
          <Text style={styles.title}>MOVIEFLIX</Text>
          <View style={styles.subtitleRow}>
            <View style={styles.subtitleLine} />
            <Text style={styles.subtitle}>TV</Text>
            <View style={styles.subtitleLine} />
          </View>
        </Animated.View>
      </View>

      <Animated.View style={[styles.statusCard, { opacity: statusOpacity }]}>
        <LinearGradient
          colors={['rgba(15,18,35,0.92)', 'rgba(5,6,15,0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.statusRow}>
          <View style={styles.statusIconWrap}>
            <Ionicons name={statusIcon} size={22} color={statusIcon === 'checkmark-circle' ? '#22d3ee' : statusIcon === 'alert-circle' ? '#fbbf24' : '#fff'} />
          </View>
          <View style={styles.statusTextWrap}>
            <Text style={styles.statusTitle}>{status}</Text>
            <Text style={styles.statusSubtitle}>Your big screen experience awaits</Text>
          </View>
        </View>
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      </Animated.View>

      <View style={styles.footer}>
        <Text style={styles.footerPrefix}>Powered by</Text>
        <Text style={styles.footerBrand}>MovieFlix</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05060f' },
  cornerGlowTL: { position: 'absolute', top: 0, left: 0, width: 300, height: 300, borderRadius: 150 },
  cornerGlowBR: { position: 'absolute', bottom: 0, right: 0, width: 350, height: 350, borderRadius: 175 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringOuter: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
    opacity: 0.5,
  },
  ringInner: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
    opacity: 0.4,
  },
  ringGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 130, borderWidth: 3, borderColor: 'transparent' },
  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  logoGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#e50914' },
  logoBg: {
    width: 130,
    height: 130,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 20,
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  titleWrap: { marginTop: 32, alignItems: 'center' },
  title: {
    fontSize: 56,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 12,
    textShadowColor: 'rgba(229,9,20,0.7)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 18,
  },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 14 },
  subtitleLine: { width: 40, height: 2, backgroundColor: 'rgba(125,216,255,0.5)' },
  subtitle: { fontSize: 20, fontWeight: '800', color: 'rgba(255,255,255,0.8)', letterSpacing: 8 },
  statusCard: {
    position: 'absolute',
    bottom: 60,
    left: 60,
    right: 60,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    overflow: 'hidden',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statusIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  statusTextWrap: { flex: 1 },
  statusTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  statusSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 2 },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#22d3ee', borderRadius: 2 },
  footer: { position: 'absolute', bottom: 20, alignSelf: 'center', alignItems: 'center' },
  footerPrefix: { color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  footerBrand: { color: '#e50914', fontSize: 14, fontWeight: '900', letterSpacing: 2, marginTop: 2 },
});
