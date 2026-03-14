import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, type ViewStyle } from 'react-native';

type Props = {
  focused: boolean;
  color?: string;
  borderRadius?: number;
  intensity?: number;
  style?: ViewStyle;
};

function FocusGlow({ focused, color = '#ffffff', borderRadius = 20, intensity = 0.6, style }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: focused ? intensity : 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: focused ? 1 : 0.95,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused, intensity, opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { borderRadius, opacity, transform: [{ scale }] },
        style,
      ]}
    >
      <LinearGradient
        colors={[`${color}00`, `${color}35`, `${color}00`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      <Animated.View
        style={[
          styles.border,
          {
            borderRadius,
            borderColor: color,
            opacity: opacity.interpolate({
              inputRange: [0, intensity],
              outputRange: [0, 0.85],
            }),
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
  },
});

export default memo(FocusGlow);
