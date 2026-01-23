import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useMemo, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

type Props = {
  children: ReactNode;
  accent?: string;
  style?: ViewStyle;
  glowIntensity?: 'subtle' | 'medium' | 'strong';
  animated?: boolean;
};

function TvGlassPanel({
  children,
  accent = '#e50914',
  style,
  glowIntensity = 'medium',
}: Props) {
  // Lightweight - no animations, no BlurView for old TV performance
  const intensityMap = { subtle: 0.08, medium: 0.12, strong: 0.18 };
  const glowLevel = intensityMap[glowIntensity];

  const accentColor = useMemo(() => {
    const hex = Math.round(glowLevel * 255).toString(16).padStart(2, '0');
    return `${accent}${hex}`;
  }, [accent, glowLevel]);

  return (
    <View style={[styles.outer, style]}>
      {/* Simple accent wash - no animation */}
      <LinearGradient
        pointerEvents="none"
        colors={[accentColor, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(0,0,0,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  content: {
    flex: 1,
  },
});

export default memo(TvGlassPanel);
