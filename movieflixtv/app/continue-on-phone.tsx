import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { TvFocusable } from './components/TvSpatialNavigation';

const FEATURE_CONFIG: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  marketplace: { label: 'Marketplace', icon: 'bag-outline', color: '#22d3ee' },
  social: { label: 'Social Feed', icon: 'camera-outline', color: '#a855f7' },
  messaging: { label: 'Messaging', icon: 'chatbubble-outline', color: '#10b981' },
  subscriptions: { label: 'Subscriptions', icon: 'card-outline', color: '#f59e0b' },
  profiles: { label: 'Profile Management', icon: 'person-outline', color: '#ec4899' },
};

export default function ContinueOnPhoneScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ feature?: string }>();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  const config = useMemo(() => {
    const key = (params?.feature ?? '').toLowerCase();
    return FEATURE_CONFIG[key] ?? { label: 'This feature', icon: 'phone-portrait-outline' as const, color: '#e50914' };
  }, [params?.feature]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -8, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.8, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0512', '#070815', '#05060f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Ambient glow */}
      <Animated.View style={[styles.ambientGlow, { backgroundColor: config.color, opacity: glowAnim }]} />

      {/* Floating particles */}
      <View style={styles.particlesContainer}>
        {[...Array(6)].map((_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                left: `${15 + i * 15}%`,
                top: `${20 + (i % 3) * 25}%`,
                backgroundColor: i % 2 === 0 ? config.color : 'rgba(255,255,255,0.3)',
                transform: [{ translateY: Animated.multiply(floatAnim, i % 2 === 0 ? 1 : -1) }],
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.content}>
        {/* Phone mockup - shows realistic premium screen */}
        <Animated.View style={[styles.phoneContainer, { transform: [{ scale: pulseAnim }, { translateY: floatAnim }] }]}>
          <View style={styles.phoneMockup}>
            <LinearGradient
              colors={['rgba(20,15,25,0.98)', 'rgba(10,8,18,0.99)']}
              style={styles.phoneScreen}
            >
              {/* Phone notch */}
              <View style={styles.phoneNotch} />

              {/* Status bar */}
              <View style={styles.phoneStatusBar}>
                <Text style={styles.phoneTime}>9:41</Text>
                <View style={styles.phoneStatusIcons}>
                  <Ionicons name="cellular" size={12} color="#fff" />
                  <Ionicons name="wifi" size={12} color="#fff" />
                  <Ionicons name="battery-full" size={12} color="#fff" />
                </View>
              </View>

              {/* Header */}
              <View style={styles.phoneHeader}>
                <View style={[styles.phoneBackBtn, { backgroundColor: `${config.color}40` }]}>
                  <Ionicons name="arrow-back" size={14} color="#fff" />
                </View>
                <View>
                  <Text style={styles.phoneHeaderLabel}>Profile Plans</Text>
                  <Text style={styles.phoneHeaderTitle}>Go Premium</Text>
                </View>
              </View>

              {/* Hero badge */}
              <View style={[styles.phonePremiumBadge, { backgroundColor: `${config.color}30` }]}>
                <Ionicons name="diamond" size={12} color={config.color} />
                <Text style={[styles.phonePremiumBadgeText, { color: config.color }]}>Premium</Text>
              </View>

              {/* Hero text */}
              <Text style={styles.phoneHeroTitle}>More profiles,{'\n'}more control.</Text>
              <Text style={styles.phoneHeroSubtitle}>Unlock Plus or Premium to add up to 5 profiles</Text>

              {/* Plan cards mini preview */}
              <View style={styles.phonePlanCards}>
                {/* Free */}
                <View style={styles.phonePlanCard}>
                  <Text style={styles.phonePlanName}>Starter</Text>
                  <Text style={styles.phonePlanPrice}>0 KSH</Text>
                  <View style={styles.phonePlanFeature}>
                    <View style={styles.phonePlanDot} />
                    <Text style={styles.phonePlanFeatureText}>1 profile</Text>
                  </View>
                </View>

                {/* Plus */}
                <View style={[styles.phonePlanCard, styles.phonePlanCardHighlight]}>
                  <View style={[styles.phonePopularBadge, { backgroundColor: config.color }]}>
                    <Text style={styles.phonePopularText}>POPULAR</Text>
                  </View>
                  <Text style={styles.phonePlanName}>Plus</Text>
                  <Text style={[styles.phonePlanPrice, { color: config.color }]}>100 KSH</Text>
                  <View style={styles.phonePlanFeature}>
                    <View style={[styles.phonePlanDot, { backgroundColor: config.color }]} />
                    <Text style={styles.phonePlanFeatureText}>3 profiles</Text>
                  </View>
                </View>

                {/* Premium */}
                <View style={styles.phonePlanCard}>
                  <Text style={styles.phonePlanName}>Premium</Text>
                  <Text style={styles.phonePlanPrice}>200 KSH</Text>
                  <View style={styles.phonePlanFeature}>
                    <View style={styles.phonePlanDot} />
                    <Text style={styles.phonePlanFeatureText}>5 profiles</Text>
                  </View>
                </View>
              </View>

              {/* CTA button */}
              <View style={[styles.phoneCtaBtn, { backgroundColor: config.color }]}>
                <Text style={styles.phoneCtaText}>Upgrade Now</Text>
              </View>

              {/* Home indicator */}
              <View style={styles.phoneHomeIndicator} />
            </LinearGradient>
          </View>
          {/* Phone glow */}
          <Animated.View style={[styles.phoneGlow, { backgroundColor: config.color, opacity: glowAnim }]} />
        </Animated.View>

        {/* Info card */}
        <View style={styles.cardContainer}>
          <BlurView intensity={25} tint="dark" style={styles.card}>
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.cardHighlight}
            />

            <View style={[styles.iconBadge, { backgroundColor: `${config.color}20` }]}>
              <Ionicons name={config.icon} size={28} color={config.color} />
            </View>

            <Text style={styles.title}>Continue on Phone</Text>
            <Text style={styles.subtitle}>
              <Text style={{ color: config.color, fontWeight: '800' }}>{config.label}</Text> is available in the MovieFlix mobile app.
            </Text>

            <View style={styles.stepsContainer}>
              <View style={styles.step}>
                <View style={[styles.stepNumber, { borderColor: config.color }]}>
                  <Text style={[styles.stepNumberText, { color: config.color }]}>1</Text>
                </View>
                <Text style={styles.stepText}>Open MovieFlix on your phone</Text>
              </View>
              <View style={styles.stepDivider} />
              <View style={styles.step}>
                <View style={[styles.stepNumber, { borderColor: config.color }]}>
                  <Text style={[styles.stepNumberText, { color: config.color }]}>2</Text>
                </View>
                <Text style={styles.stepText}>Navigate to {config.label}</Text>
              </View>
              <View style={styles.stepDivider} />
              <View style={styles.step}>
                <View style={[styles.stepNumber, { borderColor: config.color }]}>
                  <Text style={[styles.stepNumberText, { color: config.color }]}>3</Text>
                </View>
                <Text style={styles.stepText}>Come back to TV when done</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <TvFocusable
                onPress={() => router.back()}
                tvPreferredFocus
                isTVSelectable={true}
                accessibilityLabel="Go back"
                style={({ focused }: any) => [
                  styles.primaryBtn,
                  { backgroundColor: config.color },
                  focused && styles.btnFocused,
                ]}
              >
                <Ionicons name="arrow-back" size={18} color="#fff" />
                <Text style={styles.primaryText}>Go Back</Text>
              </TvFocusable>

              <TvFocusable
                onPress={() => router.push('/(tabs)/movies')}
                isTVSelectable={true}
                accessibilityLabel="Go home"
                style={({ focused }: any) => [styles.secondaryBtn, focused && styles.secondaryBtnFocused]}
              >
                <Ionicons name="home-outline" size={18} color="rgba(255,255,255,0.85)" />
                <Text style={styles.secondaryText}>Home</Text>
              </TvFocusable>
            </View>
          </BlurView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  ambientGlow: {
    position: 'absolute',
    top: '20%',
    left: '30%',
    width: 400,
    height: 400,
    borderRadius: 200,
    opacity: 0.15,
  },
  particlesContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.5,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 60,
    gap: 80,
  },
  phoneContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneMockup: {
    width: 220,
    height: 440,
    borderRadius: 36,
    backgroundColor: '#1a1a2e',
    borderWidth: 4,
    borderColor: '#2a2a3e',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 20,
  },
  phoneScreen: {
    flex: 1,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  phoneNotch: {
    width: 80,
    height: 24,
    backgroundColor: '#0a0a14',
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 4,
  },
  phoneStatusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  phoneTime: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  phoneStatusIcons: {
    flexDirection: 'row',
    gap: 4,
  },
  phoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  phoneBackBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneHeaderLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  phoneHeaderTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  phonePremiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 8,
  },
  phonePremiumBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  phoneHeroTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
    marginBottom: 4,
  },
  phoneHeroSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    lineHeight: 12,
    marginBottom: 12,
  },
  phonePlanCards: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  phonePlanCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  phonePlanCardHighlight: {
    borderColor: 'rgba(229,9,20,0.5)',
    backgroundColor: 'rgba(229,9,20,0.08)',
  },
  phonePopularBadge: {
    position: 'absolute',
    top: -6,
    right: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  phonePopularText: {
    color: '#fff',
    fontSize: 6,
    fontWeight: '800',
  },
  phonePlanName: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 2,
  },
  phonePlanPrice: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 4,
  },
  phonePlanFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phonePlanDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  phonePlanFeatureText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 7,
  },
  phoneCtaBtn: {
    alignSelf: 'stretch',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneCtaText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  phoneHomeIndicator: {
    width: 100,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 8,
  },
  phoneGlow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    zIndex: -1,
  },
  cardContainer: {
    flex: 1,
    maxWidth: 600,
  },
  card: {
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 40,
    overflow: 'hidden',
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '900',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 32,
  },
  stepsContainer: {
    gap: 4,
    marginBottom: 36,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '800',
  },
  stepText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '600',
  },
  stepDivider: {
    width: 2,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginLeft: 15,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 20,
  },
  btnFocused: {
    transform: [{ scale: 1.08 }],
    borderColor: '#fff',
    borderWidth: 2,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },
  primaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  secondaryBtnFocused: {
    transform: [{ scale: 1.04 }],
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  secondaryText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '700',
  },
});
