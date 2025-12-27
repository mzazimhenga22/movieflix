import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import ScreenWrapper from '../../../../components/ScreenWrapper';
import { useAccent } from '../../AccentContext';
import { accentGradient } from '../../../../lib/colorUtils';
import StoriesRow from '../StoriesRow';

export default function StoriesScreen() {
  const router = useRouter();
  const { accentColor, setAccentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const buttonGradient = accentGradient('#e50914', 0.25);
  const gradientFade = useRef(new Animated.Value(0)).current;
  const gradientPalettes = useMemo(() => (
    [
      [accent, '#150a13', '#05060f'],
      ['#1a0f1f', '#0b0512', '#050509'],
      ['#29123a', '#100720', '#050509'],
    ]
  ), [accent]);
  const [gradientIndex, setGradientIndex] = React.useState(0);
  const paletteCount = gradientPalettes.length;
  const nextGradientIndex = (gradientIndex + 1) % paletteCount;

  useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  useEffect(() => {
    const interval = setInterval(() => {
      gradientFade.setValue(0);
      Animated.timing(gradientFade, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }).start(() => {
        setGradientIndex((prev) => (prev + 1) % paletteCount);
        gradientFade.setValue(0);
      });
    }, 9000);
    return () => clearInterval(interval);
  }, [gradientFade, paletteCount]);

  return (
    <ScreenWrapper>
      <View style={styles.background} pointerEvents="none">
        <LinearGradient
          colors={gradientPalettes[gradientIndex]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientLayer}
        />
        <Animated.View pointerEvents="none" style={[styles.gradientLayer, { opacity: gradientFade }]}> 
          <LinearGradient
            colors={gradientPalettes[nextGradientIndex]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientLayer}
          />
        </Animated.View>
        <LinearGradient
          colors={['rgba(125,216,255,0.18)', 'rgba(255,255,255,0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.bgOrbPrimary}
        />
        <LinearGradient
          colors={['rgba(95,132,255,0.14)', 'rgba(255,255,255,0)']}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={styles.bgOrbSecondary}
        />
      </View>
      <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.accentDot, { backgroundColor: accent, shadowColor: accent }]} />
            <View>
              <Text style={styles.title}>Stories</Text>
              <Text style={styles.subtitle}>Share your cinematic day</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              activeOpacity={0.9}
              onPress={() => router.push('/social-feed/notifications')}
            >
              <LinearGradient
                colors={['#f34b4b', '#c41545']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <Ionicons name="notifications-outline" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              activeOpacity={0.9}
              onPress={() => router.push('/social-feed/match-swipe')}
            >
              <LinearGradient
                colors={['#ff8c37', '#ff375f']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <Ionicons name="flame" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, { shadowColor: accent }]} activeOpacity={0.9} onPress={() => router.push('/story-upload')}>
              <LinearGradient
                colors={buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <Ionicons name="camera" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

      <View style={styles.card}>
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <StoriesRow showAddStory />
          {/* TODO: Add story highlights and archived stories sections */}
        </ScrollView>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: -80,
    left: -40,
    opacity: 0.5,
    transform: [{ rotate: '15deg' }],
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    bottom: -100,
    right: -30,
    opacity: 0.45,
    transform: [{ rotate: '-10deg' }],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  iconBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  iconGradient: {
    padding: 10,
    borderRadius: 16,
  },
  card: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(5,6,15,0.65)',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
});
