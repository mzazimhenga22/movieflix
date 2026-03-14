// components/ScreenWrapper.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing
} from 'react-native-reanimated';
import LiquidGlass from './app-components/LiquidGlass';
import { useAccent } from './app-components/AccentContext';

type ScreenWrapperProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  disableTopInset?: boolean;
};

const AnimatedBlob = ({ color, size, startPos, endPos, duration }: any) => {
  const translateX = useSharedValue(startPos.x);
  const translateY = useSharedValue(startPos.y);
  const scale = useSharedValue(1);

  useEffect(() => {
    translateX.value = withRepeat(
      withSequence(
        withTiming(endPos.x, { duration, easing: Easing.inOut(Easing.ease) }),
        withTiming(startPos.x, { duration, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    translateY.value = withRepeat(
      withSequence(
        withTiming(endPos.y, { duration: duration * 1.2, easing: Easing.inOut(Easing.ease) }),
        withTiming(startPos.y, { duration: duration * 1.2, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: duration * 0.9, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.8, { duration: duration * 0.9, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [duration, endPos, startPos, translateX, translateY, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value }
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.blob,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
};

const ScreenWrapper = ({ children, style, disableTopInset = false }: ScreenWrapperProps) => {
  const insets = useSafeAreaInsets();
  const { accentColor } = useAccent();

  return (
    <View style={styles.root}>
      {/* Animated ambient blobs behind the glass */}
      <AnimatedBlob
        color={`${accentColor}55`}
        size={400}
        startPos={{ x: -100, y: -100 }}
        endPos={{ x: 100, y: 200 }}
        duration={12000}
      />
      <AnimatedBlob
        color={`${accentColor}33`}
        size={500}
        startPos={{ x: 200, y: 500 }}
        endPos={{ x: -100, y: 300 }}
        duration={16000}
      />
      
      {/* Front frosted glass overlay */}
      <LiquidGlass
        glowColor="transparent"
        tintColor="#05060f"
        tintOpacity={0.82}
        cornerRadius={0}
        glowIntensity={0}
        borderWidth={0}
        style={styles.glassContainer}
        animated={false}
      >
        <View style={[styles.container, { paddingTop: disableTopInset ? 0 : insets.top }, style]}>
          <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
          {children}
        </View>
      </LiquidGlass>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020308',
    overflow: 'hidden',
  },
  glassContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  blob: {
    position: 'absolute',
    opacity: 0.8,
  },
});

export default ScreenWrapper;
