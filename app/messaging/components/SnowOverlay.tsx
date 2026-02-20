import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

type Flake = {
  key: string;
  x: number;
  size: number;
  opacity: number;
  drift: number;
  y: Animated.Value;
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export default function SnowOverlay({ enabled }: { enabled: boolean }) {
  const { width, height } = useWindowDimensions();
  const runningRef = useRef(false);

  const flakes: Flake[] = useMemo(() => {
    const count = Math.max(40, Math.min(110, Math.round(width / 4.5)));
    return Array.from({ length: count }).map((_, i) => {
      const size = rand(2.5, 6.5);
      const opacity = rand(0.28, 0.9);
      const x = rand(0, Math.max(1, width - size));
      const drift = rand(-18, 18);
      const y = new Animated.Value(rand(-height, height));
      return { key: `flake-${i}`, x, size, opacity, drift, y };
    });
  }, [height, width]);

  useEffect(() => {
    if (!enabled) return;
    runningRef.current = true;

    const animations: Animated.CompositeAnimation[] = [];
    flakes.forEach((flake, idx) => {
      const start = () => {
        if (!runningRef.current) return;
        const duration = rand(3200, 7400);
        const delay = rand(0, 450) + idx * 6;
        flake.y.setValue(rand(-height, -flake.size));
        const anim = Animated.timing(flake.y, {
          toValue: height + flake.size + 12,
          duration,
          delay,
          easing: Easing.linear,
          useNativeDriver: true,
        });
        animations.push(anim);
        anim.start(({ finished }) => {
          if (!runningRef.current) return;
          if (finished) start();
        });
      };
      start();
    });

    return () => {
      runningRef.current = false;
      animations.forEach((a) => {
        try {
          a.stop();
        } catch {
          // ignore
        }
      });
    };
  }, [enabled, flakes, height]);

  if (!enabled) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {flakes.map((flake) => (
        <Animated.View
          key={flake.key}
          style={[
            styles.flake,
            {
              width: flake.size,
              height: flake.size,
              borderRadius: flake.size / 2,
              opacity: flake.opacity,
              left: flake.x,
              transform: [
                { translateY: flake.y },
                { translateX: flake.y.interpolate({ inputRange: [-height, height], outputRange: [0, flake.drift] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  flake: {
    position: 'absolute',
    top: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
});
