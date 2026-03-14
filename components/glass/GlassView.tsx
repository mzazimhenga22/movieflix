import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GlassViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: 'light' | 'medium' | 'heavy';
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  glowColor?: string;
  glowIntensity?: number;
  backgroundColor?: string;
}

const intensityMap = {
  light: { opacity: 0.15, blur: 8 },
  medium: { opacity: 0.35, blur: 16 },
  heavy: { opacity: 0.55, blur: 24 },
};

export const GlassView: React.FC<GlassViewProps> = ({
  children,
  style,
  intensity = 'medium',
  borderRadius = 16,
  borderWidth = 1,
  borderColor = 'rgba(255, 255, 255, 0.2)',
  glowColor = '#FF9500',
  glowIntensity = 0.3,
  backgroundColor = '#1A1A2E',
}) => {
  const { opacity } = intensityMap[intensity];

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          borderWidth,
          borderColor,
          backgroundColor: `${backgroundColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
        },
        style,
      ]}
    >
      {/* Glow effect */}
      <LinearGradient
        colors={[`${glowColor}${Math.round(glowIntensity * 40).toString(16).padStart(2, '0')}`, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius, opacity: 0.6 }]}
      />
      
      {/* Inner highlight */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.1)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default GlassView;
