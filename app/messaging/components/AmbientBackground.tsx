import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccent } from '../../components/AccentContext';
import { withAlpha } from '@/lib/colorUtils';

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export default function AmbientBackground({ intensity = 1 }: { intensity?: number }) {
  const { width, height } = useWindowDimensions();
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';

  const orb1Opacity = useRef(new Animated.Value(0.3 * intensity)).current;
  const orb2Opacity = useRef(new Animated.Value(0.2 * intensity)).current;
  const orb3Opacity = useRef(new Animated.Value(0.25 * intensity)).current;

  useEffect(() => {
    // Simple opacity pulse for orbs
    const animate1 = Animated.loop(
      Animated.sequence([
        Animated.timing(orb1Opacity, {
          toValue: 0.5 * intensity,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(orb1Opacity, {
          toValue: 0.2 * intensity,
          duration: 4000,
          useNativeDriver: true,
        }),
      ])
    );

    const animate2 = Animated.loop(
      Animated.sequence([
        Animated.timing(orb2Opacity, {
          toValue: 0.4 * intensity,
          duration: 5000,
          useNativeDriver: true,
        }),
        Animated.timing(orb2Opacity, {
          toValue: 0.15 * intensity,
          duration: 5000,
          useNativeDriver: true,
        }),
      ])
    );

    const animate3 = Animated.loop(
      Animated.sequence([
        Animated.timing(orb3Opacity, {
          toValue: 0.45 * intensity,
          duration: 3500,
          useNativeDriver: true,
        }),
        Animated.timing(orb3Opacity, {
          toValue: 0.2 * intensity,
          duration: 3500,
          useNativeDriver: true,
        }),
      ])
    );

    animate1.start();
    animate2.start();
    animate3.start();

    return () => {
      animate1.stop();
      animate2.stop();
      animate3.stop();
    };
  }, [intensity, orb1Opacity, orb2Opacity, orb3Opacity]);

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Mesh gradient background */}
      <LinearGradient
        colors={[
          withAlpha(accent, 0.12),
          'rgba(15,17,25,0.95)',
          'rgba(8,10,18,1)',
        ]}
        locations={[0, 0.5, 1]}
        style={styles.meshGradient}
      />

      {/* Static positioned orbs with animated opacity */}
      <Animated.View
        style={[
          styles.orb,
          {
            width: 200,
            height: 200,
            borderRadius: 100,
            backgroundColor: withAlpha(accent, 0.2),
            top: height * 0.1,
            left: -50,
            opacity: orb1Opacity,
          },
        ]}
      />

      <Animated.View
        style={[
          styles.orb,
          {
            width: 160,
            height: 160,
            borderRadius: 80,
            backgroundColor: 'rgba(100,150,255,0.12)',
            top: height * 0.4,
            right: -40,
            opacity: orb2Opacity,
          },
        ]}
      />

      <Animated.View
        style={[
          styles.orb,
          {
            width: 180,
            height: 180,
            borderRadius: 90,
            backgroundColor: withAlpha(accent, 0.15),
            bottom: height * 0.2,
            left: width * 0.3,
            opacity: orb3Opacity,
          },
        ]}
      />

      {/* Vignette effect */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.3)']}
        locations={[0.7, 1]}
        style={styles.vignette}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  meshGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
  },
});
