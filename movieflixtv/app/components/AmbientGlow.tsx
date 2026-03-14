import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

type Props = {
  color?: string;
  intensity?: number;
  animated?: boolean;
  style?: ViewStyle;
};

function AmbientGlow({ color = '#e50914', intensity = 0.35, animated = true, style }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const colorAnim = useRef(new Animated.Value(0)).current;
  const prevColor = useRef(color);

  useEffect(() => {
    if (prevColor.current !== color) {
      colorAnim.setValue(0);
      Animated.timing(colorAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        prevColor.current = color;
      });
    }
  }, [color, colorAnim]);

  useEffect(() => {
    if (!animated) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [animated, pulseAnim]);

  const opacityBase = Math.min(1, Math.max(0, intensity));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        style,
        { transform: [{ scale: pulseAnim }], opacity: opacityBase },
      ]}
    >
      <LinearGradient
        colors={[`${color}55`, `${color}22`, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topGlow}
      />
      <LinearGradient
        colors={[`${color}44`, `${color}18`, 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.leftGlow}
      />
      <LinearGradient
        colors={[`${color}44`, `${color}18`, 'transparent']}
        start={{ x: 1, y: 0.5 }}
        end={{ x: 0, y: 0.5 }}
        style={styles.rightGlow}
      />
      <View style={[styles.centerOrb, { backgroundColor: `${color}18` }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: '50%',
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 999,
  },
  leftGlow: {
    position: 'absolute',
    top: '20%',
    left: 0,
    width: '30%',
    bottom: '20%',
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  rightGlow: {
    position: 'absolute',
    top: '20%',
    right: 0,
    width: '30%',
    bottom: '20%',
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  centerOrb: {
    position: 'absolute',
    top: '25%',
    left: '25%',
    right: '25%',
    bottom: '40%',
    borderRadius: 999,
  },
});

export default memo(AmbientGlow);
