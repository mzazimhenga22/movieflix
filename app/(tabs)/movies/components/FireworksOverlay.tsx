import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#5ac8fa', '#af52de', '#ff2d55', '#ff9f0a'] as const;

interface Particle {
  key: string;
  angle: number;
  distance: number;
  color: string;
  size: number;
  gravity: number;
}

interface Burst {
  key: string;
  x: number;
  peakY: number;
  anim: Animated.Value;
  delayMs: number;
  particles: Particle[];
}

export default function FireworksOverlay({ trigger }: { trigger: number }) {
  const { width, height } = useWindowDimensions();
  const [active, setActive] = useState(false);
  const burstsRef = useRef<Burst[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!trigger) return;

    // Generate bursts
    burstsRef.current = Array.from({ length: 12 }, (_, idx) => {
      const x = rand(width * 0.1, width * 0.9);
      const peakY = rand(height * 0.3, height * 0.6);
      const particleCount = Math.round(rand(16, 24));
      const baseRadius = rand(50, 90);
      const gravity = rand(40, 70);
      const delayMs = idx * 100 + Math.round(rand(0, 150));

      const particles: Particle[] = Array.from({ length: particleCount }, (__, pIdx) => {
        const angle = (pIdx / particleCount) * Math.PI * 2 + rand(-0.15, 0.15);
        const distance = baseRadius * rand(0.7, 1.2);
        const color = COLORS[Math.floor(rand(0, COLORS.length))];
        const size = Math.round(rand(3, 5));
        return { key: `p-${idx}-${pIdx}`, angle, distance, color, size, gravity };
      });

      return {
        key: `burst-${trigger}-${idx}`,
        x,
        peakY,
        anim: new Animated.Value(0),
        delayMs,
        particles,
      };
    });

    setActive(true);

    // Start animations
    const animations = burstsRef.current.map((burst) => {
      burst.anim.setValue(0);
      return Animated.timing(burst.anim, {
        toValue: 1,
        duration: 1800,
        delay: burst.delayMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
    });

    Animated.parallel(animations).start();

    timeoutRef.current = setTimeout(() => setActive(false), 3000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      burstsRef.current.forEach((b) => b.anim.stopAnimation());
    };
  }, [trigger, width, height]);

  if (!active) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {burstsRef.current.map((burst) => {
        const rocketY = burst.anim.interpolate({
          inputRange: [0, 0.35, 1],
          outputRange: [0, -burst.peakY, -burst.peakY],
        });

        const rocketOpacity = burst.anim.interpolate({
          inputRange: [0, 0.32, 0.38],
          outputRange: [1, 1, 0],
        });

        const trailOpacity = burst.anim.interpolate({
          inputRange: [0, 0.1, 0.32, 0.4],
          outputRange: [0, 0.8, 0.5, 0],
        });

        const trailScaleY = burst.anim.interpolate({
          inputRange: [0, 0.1, 0.35],
          outputRange: [0.1, 1, 0.5],
        });

        return (
          <View key={burst.key} style={[styles.burstWrap, { left: burst.x, bottom: 0 }]}>
            {/* Trail */}
            <Animated.View
              style={[
                styles.trail,
                {
                  opacity: trailOpacity,
                  transform: [{ translateY: rocketY }, { scaleY: trailScaleY }],
                },
              ]}
            />

            {/* Rocket */}
            <Animated.View
              style={[
                styles.rocket,
                {
                  opacity: rocketOpacity,
                  transform: [{ translateY: rocketY }],
                },
              ]}
            />

            {/* Burst core flash */}
            <Animated.View
              style={[
                styles.burstCore,
                {
                  opacity: burst.anim.interpolate({
                    inputRange: [0.34, 0.38, 0.5],
                    outputRange: [0, 1, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    { translateY: rocketY },
                    {
                      scale: burst.anim.interpolate({
                        inputRange: [0.34, 0.42, 0.5],
                        outputRange: [0.5, 2, 0],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            />

            {/* Particles */}
            {burst.particles.map((p) => {
              const endX = Math.cos(p.angle) * p.distance;
              const endY = Math.sin(p.angle) * p.distance + p.gravity;

              return (
                <Animated.View
                  key={p.key}
                  style={[
                    styles.particle,
                    {
                      backgroundColor: p.color,
                      width: p.size,
                      height: p.size,
                      borderRadius: p.size / 2,
                      opacity: burst.anim.interpolate({
                        inputRange: [0.35, 0.42, 0.85, 1],
                        outputRange: [0, 1, 0.7, 0],
                        extrapolate: 'clamp',
                      }),
                      transform: [
                        {
                          translateX: burst.anim.interpolate({
                            inputRange: [0.35, 0.6, 1],
                            outputRange: [0, endX * 0.8, endX * 0.6],
                            extrapolate: 'clamp',
                          }),
                        },
                        {
                          translateY: burst.anim.interpolate({
                            inputRange: [0.35, 0.5, 0.7, 1],
                            outputRange: [-burst.peakY, -burst.peakY + endY * 0.4, -burst.peakY + endY * 0.7, -burst.peakY + endY + p.gravity],
                            extrapolate: 'clamp',
                          }),
                        },
                        {
                          scale: burst.anim.interpolate({
                            inputRange: [0.35, 0.45, 0.8, 1],
                            outputRange: [0.3, 1.2, 1, 0.5],
                            extrapolate: 'clamp',
                          }),
                        },
                      ],
                    },
                  ]}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
  },
  burstWrap: {
    position: 'absolute',
    width: 1,
    height: 1,
  },
  trail: {
    position: 'absolute',
    width: 3,
    height: 120,
    borderRadius: 2,
    left: -1.5,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  rocket: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
    bottom: 0,
    left: -2.5,
  },
  burstCore: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    left: -8,
    bottom: 0,
  },
  particle: {
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
});
