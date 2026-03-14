import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GlassButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  borderRadius?: number;
  glowColor?: string;
  icon?: React.ReactNode;
}

const variantStyles = {
  primary: {
    backgroundColor: '#E50914',
    glowColor: '#FF6B6B',
    textColor: '#FFFFFF',
  },
  secondary: {
    backgroundColor: '#2A1A3E',
    glowColor: '#FF9500',
    textColor: '#FFFFFF',
  },
  ghost: {
    backgroundColor: 'transparent',
    glowColor: '#FFFFFF',
    textColor: '#FFFFFF',
  },
};

const sizeStyles = {
  small: { paddingVertical: 8, paddingHorizontal: 16, fontSize: 14 },
  medium: { paddingVertical: 12, paddingHorizontal: 24, fontSize: 16 },
  large: { paddingVertical: 16, paddingHorizontal: 32, fontSize: 18 },
};

export const GlassButton: React.FC<GlassButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  textStyle,
  borderRadius = 24,
  glowColor: customGlowColor,
  icon,
}) => {
  const variant = variantStyles[variant];
  const size = sizeStyles[size];
  const glowColor = customGlowColor || variant.glowColor;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.container,
        {
          borderRadius,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {/* Glass background */}
      <LinearGradient
        colors={[
          `${variant.backgroundColor}E6`,
          `${variant.backgroundColor}B3`,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      
      {/* Glow effect */}
      <LinearGradient
        colors={[`${glowColor}40`, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius, opacity: 0.5 }]}
      />
      
      {/* Border */}
      <LinearGradient
        colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.border, { borderRadius }]}
      />

      <Text
        style={[
          styles.text,
          {
            color: variant.textColor,
            fontSize: size.fontSize,
            marginLeft: icon ? 8 : 0,
          },
          textStyle,
        ]}
      >
        {loading ? <ActivityIndicator color={variant.textColor} size="small" /> : title}
      </Text>
      
      {icon && !loading}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  border: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default GlassButton;
