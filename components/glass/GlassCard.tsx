import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  intensity?: 'light' | 'medium' | 'heavy';
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  glowColor?: string;
  glowIntensity?: number;
  backgroundColor?: string;
  active?: boolean;
  padding?: number;
}

const intensityMap = {
  light: { opacity: 0.12, blur: 6 },
  medium: { opacity: 0.28, blur: 12 },
  heavy: { opacity: 0.45, blur: 20 },
};

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  onPress,
  intensity = 'medium',
  borderRadius = 20,
  borderWidth = 1.5,
  borderColor = 'rgba(255, 255, 255, 0.15)',
  glowColor = '#FF9500',
  glowIntensity = 0.4,
  backgroundColor = '#1A1A2E',
  active = false,
  padding = 16,
}) => {
  const { opacity } = intensityMap[intensity];
  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      onPress={onPress}
      activeOpacity={0.9}
      style={[
        styles.container,
        {
          borderRadius,
          borderWidth: active ? borderWidth + 0.5 : borderWidth,
          borderColor: active ? glowColor : borderColor,
          backgroundColor: `${backgroundColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
          padding,
        },
        style,
      ]}
    >
      {/* Glow effect */}
      <LinearGradient
        colors={[
          `${glowColor}${Math.round(glowIntensity * 50).toString(16).padStart(2, '0')}`,
          'transparent',
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={[StyleSheet.absoluteFill, { borderRadius, opacity: 0.7 }]}
      />
      
      {/* Top shine */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.15)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.4 }}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      
      {/* Bottom shadow */}
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.2)']}
        start={{ x: 0.5, y: 0.6 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      
      {children}
    </Container>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
});

export default GlassCard;
