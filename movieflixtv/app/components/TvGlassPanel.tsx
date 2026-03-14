import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useMemo, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import LiquidGlass from '@/components/app-components/LiquidGlass';
import { LiquidGlassPro, LiquidGlassCard } from '@/components/app-components/LiquidGlassPro';

type Props = {
  children: ReactNode;
  accent?: string;
  style?: ViewStyle;
  glowIntensity?: 'subtle' | 'medium' | 'strong' | 'ultra';
  animated?: boolean;
  borderRadius?: number;
  compact?: boolean;
  native?: boolean;
  pro?: boolean;
  interactive?: boolean;
  chromaticAberration?: boolean;
};

function TvGlassPanel({
  children,
  accent = '#e50914',
  style,
  glowIntensity = 'medium',
  animated = false,
  borderRadius = 28,
  compact = false,
  native = false,
  pro = false,
  interactive = false,
  chromaticAberration = true,
}: Props) {
  const intensityMap = { subtle: 0.06, medium: 0.1, strong: 0.14, ultra: 0.22 };
  const glowLevel = intensityMap[glowIntensity];

  const accentColor = useMemo(() => {
    const hex = Math.round(glowLevel * 255).toString(16).padStart(2, '0');
    return `${accent}${hex}`;
  }, [accent, glowLevel]);

  // Use pro version for enhanced visual effects on Android
  if (native && pro && Platform.OS === 'android') {
    return (
      <LiquidGlassPro
        cornerRadius={borderRadius}
        tintOpacity={compact ? 0.14 : 0.18}
        glowIntensity={compact ? Math.max(glowLevel, 0.1) : glowLevel * 1.2}
        borderOpacity={compact ? 0.22 : 0.28}
        borderWidth={compact ? 1.25 : 1.5}
        glowColor={accent}
        animated={animated}
        interactive={interactive}
        morphOnPress={interactive}
        refractionStrength={compact ? 8 : 12}
        chromaticAberration={chromaticAberration ? 0.8 : 0}
        style={[styles.outer, compact && styles.outerCompact, { borderRadius }, style]}
      >
        <View style={styles.content}>{children}</View>
      </LiquidGlassPro>
    );
  }

  // Use card version for interactive elements
  if (native && interactive && Platform.OS === 'android') {
    return (
      <LiquidGlassCard
        cornerRadius={borderRadius}
        tintOpacity={compact ? 0.16 : 0.22}
        glowColor={accent}
        glowIntensity={glowLevel * 1.1}
        interactive={interactive}
        animated={animated}
        style={[styles.outer, compact && styles.outerCompact, { borderRadius }, style]}
      >
        <View style={styles.content}>{children}</View>
      </LiquidGlassCard>
    );
  }

  if (native) {
    return (
      <LiquidGlass
        cornerRadius={borderRadius}
        tintOpacity={compact ? 0.12 : 0.16}
        glowIntensity={compact ? Math.max(glowLevel, 0.08) : glowLevel * 1.4}
        borderOpacity={compact ? 0.18 : 0.22}
        borderWidth={compact ? 1 : 1.25}
        glowColor={accent}
        animated={animated}
        fastMode={!animated}
        style={[styles.outer, compact && styles.outerCompact, { borderRadius }, style]}
      >
        <View style={styles.content}>{children}</View>
      </LiquidGlass>
    );
  }

  return (
    <View style={[styles.outer, compact && styles.outerCompact, { borderRadius }, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={[accentColor, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.04)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 0.7 }}
        style={[styles.edgeLight, { borderRadius }]}
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
    backgroundColor: 'rgba(9,12,20,0.86)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 20,
    elevation: 12,
  },
  outerCompact: {
    borderWidth: 1,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  edgeLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
  },
  content: {
    flex: 1,
  },
});

export default memo(TvGlassPanel);
