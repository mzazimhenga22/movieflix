
// components/ScreenWrapper.tsx
import React from 'react';
import { View, StyleSheet, StatusBar, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

type ScreenWrapperProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  disableTopInset?: boolean;
};

const ScreenWrapper = ({ children, style, disableTopInset = false }: ScreenWrapperProps) => {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={['#05060f', '#0a0f1f', '#06060b']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <View style={styles.glow} />
      <View style={[styles.container, { paddingTop: disableTopInset ? 0 : insets.top }, style]}>
        <StatusBar barStyle="light-content" />
        {children}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'rgba(12,12,18,0.55)',
  },
  glow: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 180,
    backgroundColor: 'rgba(110,179,255,0.18)',
    opacity: 0.8,
    transform: [{ scale: 1.1 }],
  },
});

export default ScreenWrapper;
