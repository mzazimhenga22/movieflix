import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';

import QRCode from 'react-native-qrcode-svg';
import { TvFocusable } from '../components/TvSpatialNavigation';

export default function TvSignupScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const cardAnim = useRef(new Animated.Value(0)).current;
  const logoAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.spring(logoAnim, { toValue: 1, friction: 8, tension: 50, useNativeDriver: true }),
      Animated.spring(cardAnim, { toValue: 1, friction: 9, tension: 55, useNativeDriver: true }),
    ]).start();
  }, [cardAnim, logoAnim]);

  const isCompact = screenHeight < 800;
  const cardMaxWidth = Math.min(700, screenWidth - 160);

  // Deep link to app store or app sign up page
  const signupUrl = 'https://movieflix.app/signup'; // Replace with actual URL

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0d1a12', '#0d0815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Accent glow */}
      <View style={styles.glowContainer}>
        <LinearGradient
          colors={['rgba(80,200,120,0.12)', 'transparent']}
          style={styles.glow}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>

      {/* Logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoAnim,
            transform: [{ translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
          },
        ]}
      >
        <View style={styles.logoIcon}>
          <Ionicons name="film" size={28} color="#50c878" />
        </View>
        <Text style={styles.logoText}>MovieFlix</Text>
      </Animated.View>

      {/* Main card */}
      <Animated.View
        style={[
          styles.card,
          { maxWidth: cardMaxWidth },
          {
            opacity: cardAnim,
            transform: [
              { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
              { scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)', 'transparent']}
          style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />

        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconBadge}>
              <Ionicons name="phone-portrait-outline" size={32} color="#50c878" />
            </View>
            <Text style={[styles.title, isCompact && styles.titleCompact]}>Sign Up on Mobile</Text>
            <Text style={styles.subtitle}>
              To create a new account, please use the MovieFlix app on your phone or tablet.
            </Text>
          </View>

          {/* QR Code */}
          <View style={styles.qrSection}>
            <View style={styles.qrBox}>
              <QRCode
                value={signupUrl}
                size={160}
                quietZone={12}
                backgroundColor="#ffffff"
                color="#000000"
              />
            </View>
            <Text style={styles.qrHint}>Scan to download the app</Text>
          </View>

          {/* Steps */}
          <View style={styles.steps}>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
              <Text style={styles.stepText}>Download MovieFlix on your phone</Text>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
              <Text style={styles.stepText}>Create your account in the app</Text>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
              <Text style={styles.stepText}>Sign in here using QR code or email</Text>
            </View>
          </View>

          {/* Back button */}
          <TvFocusable
            onPress={() => router.replace('/(auth)/login')}
            tvPreferredFocus
            isTVSelectable={true}
            accessibilityLabel="Back to sign in"
            style={({ focused }: any) => [styles.backBtn, focused && styles.backBtnFocused]}
          >
            <Ionicons name="arrow-back-outline" size={20} color="#fff" />
            <Text style={styles.backText}>Back to Sign In</Text>
          </TvFocusable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 80,
    paddingVertical: 32,
  },
  glowContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  glow: {
    flex: 1,
    borderBottomLeftRadius: 500,
    borderBottomRightRadius: 500,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  logoIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: 'rgba(80,200,120,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(80,200,120,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  card: {
    width: '100%',
    borderRadius: 32,
    padding: 40,
    backgroundColor: 'rgba(10,12,25,0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 20,
  },
  content: {
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(80,200,120,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(80,200,120,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 28,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
    maxWidth: 450,
    lineHeight: 22,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  qrBox: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  qrHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  steps: {
    width: '100%',
    maxWidth: 380,
    gap: 12,
    marginBottom: 28,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(80,200,120,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    color: '#50c878',
    fontSize: 14,
    fontWeight: '900',
  },
  stepText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  backBtnFocused: {
    transform: [{ scale: 1.03 }],
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  backText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
