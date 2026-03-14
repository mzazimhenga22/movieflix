import React from 'react';
import { Text, StyleSheet, TextStyle, TextProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

interface GlassTextProps extends TextProps {
  children: React.ReactNode;
  variant?: 'default' | 'title' | 'subtitle' | 'caption' | 'gradient';
  glow?: boolean;
  glowColor?: string;
  style?: TextStyle;
  gradientColors?: string[];
}

const variantStyles = {
  default: { fontSize: 16, fontWeight: '400' as const, color: '#FFFFFF' },
  title: { fontSize: 28, fontWeight: '800' as const, color: '#FFFFFF' },
  subtitle: { fontSize: 20, fontWeight: '700' as const, color: '#FFFFFF' },
  caption: { fontSize: 12, fontWeight: '500' as const, color: 'rgba(255,255,255,0.7)' },
  gradient: { fontSize: 24, fontWeight: '800' as const },
};

export const GlassText: React.FC<GlassTextProps> = ({
  children,
  variant = 'default',
  glow = false,
  glowColor = '#FF9500',
  style,
  gradientColors = ['#FF9500', '#FF6B6B', '#E50914'],
  ...rest
}) => {
  const variant = variantStyles[variant];

  if (variant === 'gradient') {
    return (
      <MaskedView
        maskElement={
          <Text style={[styles.text, variant, style]} {...rest}>
            {children}
          </Text>
        }
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </MaskedView>
    );
  }

  return (
    <Text
      style={[
        styles.text,
        variant,
        glow && {
          textShadowColor: `${glowColor}80`,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 10,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  text: {
    letterSpacing: 0.3,
  },
});

export default GlassText;
