import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
};

type Props = {
  count?: number;
  color?: string;
  active?: boolean;
  style?: ViewStyle;
};

function FloatingParticles({ count = 12, color = '#ffffff', active = true, style }: Props) {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 4,
      duration: 4000 + Math.random() * 6000,
      delay: Math.random() * 3000,
    }));
  }, [count]);

  if (!active) return null;

  return (
    <View pointerEvents="none" style={[styles.container, style]}>
      {particles.map((p) => (
        <ParticleItem key={p.id} particle={p} color={color} />
      ))}
    </View>
  );
}

const ParticleItem = memo(function ParticleItem({
  particle,
  color,
}: {
  particle: Particle;
  color: string;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const anim = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0.5,
              duration: particle.duration * 0.3,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: particle.duration * 0.7,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(translateY, {
            toValue: -60,
            duration: particle.duration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    }, particle.delay);

    return () => clearTimeout(timeout);
  }, [opacity, particle.delay, particle.duration, translateY]);

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: `${particle.x}%`,
          top: `${particle.y}%`,
          width: particle.size,
          height: particle.size,
          borderRadius: particle.size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    />
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
  },
});

export default memo(FloatingParticles);
