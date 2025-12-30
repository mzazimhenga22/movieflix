import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

type Props = {
  children: ReactNode;
  accent?: string;
  style?: ViewStyle;
};

export default function TvGlassPanel({ children, accent = '#e50914', style }: Props) {
  return (
    <View style={[styles.outer, style]}>
      <BlurView intensity={22} tint="dark" style={styles.blur}>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.03)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[`${accent}22`, 'rgba(0,0,0,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.content}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(5,6,15,0.18)',
  },
  blur: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
