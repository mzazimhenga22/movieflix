import React, { useMemo, useEffect, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  UIManager,
  View,
  processColor,
  requireNativeComponent,
  type ViewStyle,
  type ViewProps,
  Animated,
  Easing,
} from 'react-native';

// ============================================================================
// Native TvGlow View - Background Glow Effect
// ============================================================================

type NativeTvGlowViewProps = {
  color?: number | null;
  intensity?: number;
  style?: ViewStyle;
};

export type TvGlowViewProps = ViewProps & {
  color?: string;
  intensity?: number;
};

let NativeComponent: React.ComponentType<NativeTvGlowViewProps> | null = null;

function getNativeComponent() {
  if (Platform.OS !== 'android') return null;
  if (!NativeComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('TvGlowView') || UIManager.getViewManagerConfig?.('TvGlowView')) {
        NativeComponent = requireNativeComponent<NativeTvGlowViewProps>('TvGlowView');
      }
    } catch { NativeComponent = null; }
  }
  return NativeComponent;
}

export default function NativeTvGlowView({
  color = '#e50914',
  intensity = 0.15,
  style,
  children,
  ...rest
}: TvGlowViewProps & { children?: React.ReactNode }) {
  const Native = useMemo(() => getNativeComponent(), []);
  const processedColor = useMemo(() => processColor(color), [color]);
  
  // Animated glow for fallback
  const glowAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [glowAnim]);

  if (Native) {
    return (
      <Native
        style={[StyleSheet.absoluteFill, style]}
        color={processedColor}
        intensity={intensity}
        {...rest}
      >
        {children}
      </Native>
    );
  }

  // Fallback with animated gradient circles
  const scale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });

  const opacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.25],
  });

  return (
    <View style={[StyleSheet.absoluteFill, style]} {...rest} pointerEvents="none">
      <Animated.View
        style={[
          styles.glowCircle,
          {
            backgroundColor: color,
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glowCircle: {
    position: 'absolute',
    top: -300,
    right: -200,
    width: 800,
    height: 800,
    borderRadius: 400,
    filter: 'blur(100px)' as any,
  },
});
