import React, { useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  UIManager,
  View,
  processColor,
  requireNativeComponent,
  type ViewStyle,
  type ViewProps,
} from 'react-native';

// ============================================================================
// LiquidGlassPro - Premium AGSL-powered glass with all effects
// ============================================================================

type NativeLiquidGlassProProps = {
  cornerRadius?: number;
  tintOpacity?: number;
  glowIntensity?: number;
  borderWidth?: number;
  borderOpacity?: number;
  tintColor?: number | null;
  borderColor?: number | null;
  glowColor?: number | null;
  animated?: boolean;
  interactive?: boolean;
  morphOnPress?: boolean;
  refractionStrength?: number;
  chromaticAberration?: number;
  style?: ViewStyle;
};

export type LiquidGlassProProps = ViewProps & {
  cornerRadius?: number;
  tintOpacity?: number;
  tintColor?: string;
  borderOpacity?: number;
  borderColor?: string;
  glowColor?: string;
  glowIntensity?: number;
  borderWidth?: number;
  animated?: boolean;
  interactive?: boolean;
  morphOnPress?: boolean;
  refractionStrength?: number;
  chromaticAberration?: number;
  children?: React.ReactNode;
};

let NativeGlassProComponent: React.ComponentType<NativeLiquidGlassProProps> | null = null;

function getNativeGlassPro() {
  if (Platform.OS !== 'android') return null;
  if (!NativeGlassProComponent) {
    try {
      const hasViewManager = 'hasViewManagerConfig' in UIManager
        ? UIManager.hasViewManagerConfig('LiquidGlassProView')
        : UIManager.getViewManagerConfig('LiquidGlassProView') != null;

      if (hasViewManager) {
        NativeGlassProComponent = requireNativeComponent<NativeLiquidGlassProProps>('LiquidGlassProView');
      }
    } catch {
      NativeGlassProComponent = null;
    }
  }
  return NativeGlassProComponent;
}

export const LiquidGlassPro = React.memo(function LiquidGlassPro({
  cornerRadius = 24,
  tintOpacity = 0.18,
  tintColor = '#0a0e18',
  borderOpacity = 0.25,
  borderColor = '#FFFFFF',
  glowColor = '#e50914',
  glowIntensity = 0.15,
  borderWidth = 1.5,
  animated = true,
  interactive = false,
  morphOnPress = true,
  refractionStrength = 12,
  chromaticAberration = 0.8,
  style,
  children,
  ...rest
}: LiquidGlassProProps) {
  const NativeComponent = useMemo(() => getNativeGlassPro(), []);
  const processedTintColor = useMemo(() => processColor(tintColor), [tintColor]);
  const processedBorderColor = useMemo(() => processColor(borderColor), [borderColor]);
  const processedGlowColor = useMemo(() => processColor(glowColor), [glowColor]);

  const containerStyle = useMemo(
    () => [styles.base, { borderRadius: cornerRadius }, style],
    [cornerRadius, style]
  );

  if (NativeComponent) {
    return (
      <View style={containerStyle} pointerEvents="box-none" {...rest}>
        <NativeComponent
          style={StyleSheet.absoluteFill}
          cornerRadius={cornerRadius}
          tintOpacity={tintOpacity}
          glowIntensity={glowIntensity}
          borderWidth={borderWidth}
          borderOpacity={borderOpacity}
          tintColor={processedTintColor}
          borderColor={processedBorderColor}
          glowColor={processedGlowColor}
          animated={animated}
          interactive={interactive}
          morphOnPress={morphOnPress}
          refractionStrength={refractionStrength}
          chromaticAberration={chromaticAberration}
        />
        {children}
      </View>
    );
  }

  // Fallback to basic glass styling
  return (
    <View style={[containerStyle, { backgroundColor: tintColor, opacity: tintOpacity }]} pointerEvents="box-none" {...rest}>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: cornerRadius,
            borderWidth,
            borderColor: `rgba(255,255,255,${borderOpacity})`,
          },
        ]}
      />
      {children}
    </View>
  );
});

// ============================================================================
// LiquidGlassButton - Mind-blowing interactive glass button
// ============================================================================

type NativeLiquidGlassButtonProps = {
  cornerRadius?: number;
  tintColor?: number | null;
  glowColor?: number | null;
  glowIntensity?: number;
  borderWidth?: number;
  borderOpacity?: number;
  iconName?: string;
  iconColor?: number | null;
  iconSize?: number;
  animated?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
};

export type LiquidGlassButtonProps = ViewProps & {
  cornerRadius?: number;
  tintColor?: string;
  glowColor?: string;
  glowIntensity?: number;
  borderWidth?: number;
  borderOpacity?: number;
  iconName?: 'play' | 'pause' | 'add' | 'plus' | 'heart' | 'search' | 'home' | 'download' | 'settings' | 'info' | 'close';
  iconColor?: string;
  iconSize?: number;
  animated?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
};

let NativeGlassButtonComponent: React.ComponentType<NativeLiquidGlassButtonProps> | null = null;

function getNativeGlassButton() {
  if (Platform.OS !== 'android') return null;
  if (!NativeGlassButtonComponent) {
    try {
      const hasViewManager = 'hasViewManagerConfig' in UIManager
        ? UIManager.hasViewManagerConfig('LiquidGlassButton')
        : UIManager.getViewManagerConfig('LiquidGlassButton') != null;

      if (hasViewManager) {
        NativeGlassButtonComponent = requireNativeComponent<NativeLiquidGlassButtonProps>('LiquidGlassButton');
      }
    } catch {
      NativeGlassButtonComponent = null;
    }
  }
  return NativeGlassButtonComponent;
}

export const LiquidGlassButton = React.memo(function LiquidGlassButton({
  cornerRadius = 24,
  tintColor = '#0d1220',
  glowColor = '#e50914',
  glowIntensity = 0.2,
  borderWidth = 1.2,
  borderOpacity = 0.3,
  iconName = 'play',
  iconColor = '#FFFFFF',
  iconSize = 20,
  animated = true,
  onPress,
  style,
  children,
  ...rest
}: LiquidGlassButtonProps) {
  const NativeComponent = useMemo(() => getNativeGlassButton(), []);
  const processedTintColor = useMemo(() => processColor(tintColor), [tintColor]);
  const processedGlowColor = useMemo(() => processColor(glowColor), [glowColor]);
  const processedIconColor = useMemo(() => processColor(iconColor), [iconColor]);

  const containerStyle = useMemo(
    () => [styles.base, { borderRadius: cornerRadius }, style],
    [cornerRadius, style]
  );

  if (NativeComponent) {
    return (
      <NativeComponent
        style={[containerStyle, { minHeight: 48 }]}
        cornerRadius={cornerRadius}
        tintColor={processedTintColor}
        glowColor={processedGlowColor}
        glowIntensity={glowIntensity}
        borderWidth={borderWidth}
        borderOpacity={borderOpacity}
        iconName={iconName}
        iconColor={processedIconColor}
        iconSize={iconSize}
        animated={animated}
        onPress={onPress}
        {...rest}
      >
        {children}
      </NativeComponent>
    );
  }

  // Fallback
  return (
    <View style={[containerStyle, styles.buttonFallback]} onTouchEnd={onPress} {...rest}>
      {children}
    </View>
  );
});

// ============================================================================
// LiquidGlassSlider - Mind-blowing liquid glass slider
// ============================================================================

type NativeLiquidGlassSliderProps = {
  accentColor?: number | null;
  trackColor?: number | null;
  glowColor?: number | null;
  glowIntensity?: number;
  trackHeight?: number;
  thumbSize?: number;
  minValue?: number;
  maxValue?: number;
  value?: number;
  animated?: boolean;
  showValue?: boolean;
  style?: ViewStyle;
  onValueChange?: (event: { nativeEvent: { value: number } }) => void;
};

export type LiquidGlassSliderProps = ViewProps & {
  accentColor?: string;
  trackColor?: string;
  glowColor?: string;
  glowIntensity?: number;
  trackHeight?: number;
  thumbSize?: number;
  minValue?: number;
  maxValue?: number;
  value?: number;
  animated?: boolean;
  showValue?: boolean;
  onValueChange?: (value: number) => void;
};

let NativeGlassSliderComponent: React.ComponentType<NativeLiquidGlassSliderProps> | null = null;

function getNativeGlassSlider() {
  if (Platform.OS !== 'android') return null;
  if (!NativeGlassSliderComponent) {
    try {
      const hasViewManager = 'hasViewManagerConfig' in UIManager
        ? UIManager.hasViewManagerConfig('LiquidGlassSlider')
        : UIManager.getViewManagerConfig('LiquidGlassSlider') != null;

      if (hasViewManager) {
        NativeGlassSliderComponent = requireNativeComponent<NativeLiquidGlassSliderProps>('LiquidGlassSlider');
      }
    } catch {
      NativeGlassSliderComponent = null;
    }
  }
  return NativeGlassSliderComponent;
}

export const LiquidGlassSlider = React.memo(function LiquidGlassSlider({
  accentColor = '#e50914',
  trackColor = '#1a1a2e',
  glowColor = '#e50914',
  glowIntensity = 0.3,
  trackHeight = 6,
  thumbSize = 40,
  minValue = 0,
  maxValue = 1,
  value = 0.5,
  animated = true,
  showValue = false,
  onValueChange,
  style,
  ...rest
}: LiquidGlassSliderProps) {
  const NativeComponent = useMemo(() => getNativeGlassSlider(), []);
  const processedAccentColor = useMemo(() => processColor(accentColor), [accentColor]);
  const processedTrackColor = useMemo(() => processColor(trackColor), [trackColor]);
  const processedGlowColor = useMemo(() => processColor(glowColor), [glowColor]);

  const containerStyle = useMemo(
    () => [styles.base, { minHeight: thumbSize + 20 }, style],
    [thumbSize, style]
  );

  const handleValueChange = (event: { nativeEvent: { value: number } }) => {
    onValueChange?.(event.nativeEvent.value);
  };

  if (NativeComponent) {
    return (
      <NativeComponent
        style={containerStyle}
        accentColor={processedAccentColor}
        trackColor={processedTrackColor}
        glowColor={processedGlowColor}
        glowIntensity={glowIntensity}
        trackHeight={trackHeight}
        thumbSize={thumbSize}
        minValue={minValue}
        maxValue={maxValue}
        value={value}
        animated={animated}
        showValue={showValue}
        onValueChange={handleValueChange}
        {...rest}
      />
    );
  }

  // Fallback
  return <View style={[containerStyle, styles.sliderFallback]} {...rest} />;
});

// ============================================================================
// LiquidGlassProgressRing - Cinematic loading ring
// ============================================================================

type NativeLiquidGlassProgressRingProps = {
  ringColor?: number | null;
  secondaryColor?: number | null;
  ringWidth?: number;
  glowIntensity?: number;
  progress?: number;
  indeterminate?: boolean;
  style?: ViewStyle;
};

export type LiquidGlassProgressRingProps = ViewProps & {
  ringColor?: string;
  secondaryColor?: string;
  ringWidth?: number;
  glowIntensity?: number;
  progress?: number;
  indeterminate?: boolean;
  size?: number;
};

let NativeGlassProgressRingComponent: React.ComponentType<NativeLiquidGlassProgressRingProps> | null = null;

function getNativeGlassProgressRing() {
  if (Platform.OS !== 'android') return null;
  if (!NativeGlassProgressRingComponent) {
    try {
      const hasViewManager = 'hasViewManagerConfig' in UIManager
        ? UIManager.hasViewManagerConfig('LiquidGlassProgressRing')
        : UIManager.getViewManagerConfig('LiquidGlassProgressRing') != null;

      if (hasViewManager) {
        NativeGlassProgressRingComponent = requireNativeComponent<NativeLiquidGlassProgressRingProps>('LiquidGlassProgressRing');
      }
    } catch {
      NativeGlassProgressRingComponent = null;
    }
  }
  return NativeGlassProgressRingComponent;
}

export const LiquidGlassProgressRing = React.memo(function LiquidGlassProgressRing({
  ringColor = '#e50914',
  secondaryColor = '#22d3ee',
  ringWidth = 4,
  glowIntensity = 0.4,
  progress = 0,
  indeterminate = true,
  size = 48,
  style,
  ...rest
}: LiquidGlassProgressRingProps) {
  const NativeComponent = useMemo(() => getNativeGlassProgressRing(), []);
  const processedRingColor = useMemo(() => processColor(ringColor), [ringColor]);
  const processedSecondaryColor = useMemo(() => processColor(secondaryColor), [secondaryColor]);

  const containerStyle = useMemo(
    () => [styles.base, { width: size, height: size }, style],
    [size, style]
  );

  if (NativeComponent) {
    return (
      <NativeComponent
        style={containerStyle}
        ringColor={processedRingColor}
        secondaryColor={processedSecondaryColor}
        ringWidth={ringWidth}
        glowIntensity={glowIntensity}
        progress={progress}
        indeterminate={indeterminate}
        {...rest}
      />
    );
  }

  // Fallback
  return <View style={[containerStyle, styles.progressFallback]} {...rest} />;
});

// ============================================================================
// LiquidGlassCard - Premium card with advanced glass morphism
// ============================================================================

type NativeLiquidGlassCardProps = {
  cornerRadius?: number;
  tintColor?: number | null;
  glowColor?: number | null;
  glowIntensity?: number;
  interactive?: boolean;
  animated?: boolean;
  style?: ViewStyle;
};

export type LiquidGlassCardProps = ViewProps & {
  cornerRadius?: number;
  tintColor?: string;
  glowColor?: string;
  glowIntensity?: number;
  interactive?: boolean;
  animated?: boolean;
  children?: React.ReactNode;
};

let NativeGlassCardComponent: React.ComponentType<NativeLiquidGlassCardProps> | null = null;

function getNativeGlassCard() {
  if (Platform.OS !== 'android') return null;
  if (!NativeGlassCardComponent) {
    try {
      const hasViewManager = 'hasViewManagerConfig' in UIManager
        ? UIManager.hasViewManagerConfig('LiquidGlassCard')
        : UIManager.getViewManagerConfig('LiquidGlassCard') != null;

      if (hasViewManager) {
        NativeGlassCardComponent = requireNativeComponent<NativeLiquidGlassCardProps>('LiquidGlassCard');
      }
    } catch {
      NativeGlassCardComponent = null;
    }
  }
  return NativeGlassCardComponent;
}

export const LiquidGlassCard = React.memo(function LiquidGlassCard({
  cornerRadius = 24,
  tintColor = '#0d1220',
  glowColor = '#e50914',
  glowIntensity = 0.18,
  interactive = true,
  animated = true,
  style,
  children,
  ...rest
}: LiquidGlassCardProps) {
  const NativeComponent = useMemo(() => getNativeGlassCard(), []);
  const processedTintColor = useMemo(() => processColor(tintColor), [tintColor]);
  const processedGlowColor = useMemo(() => processColor(glowColor), [glowColor]);

  const containerStyle = useMemo(
    () => [styles.base, { borderRadius: cornerRadius }, style],
    [cornerRadius, style]
  );

  if (NativeComponent) {
    return (
      <View style={containerStyle} pointerEvents="box-none" {...rest}>
        <NativeComponent
          style={StyleSheet.absoluteFill}
          cornerRadius={cornerRadius}
          tintColor={processedTintColor}
          glowColor={processedGlowColor}
          glowIntensity={glowIntensity}
          interactive={interactive}
          animated={animated}
        />
        {children}
      </View>
    );
  }

  // Fallback
  return (
    <View style={[containerStyle, { backgroundColor: tintColor, opacity: 0.85 }]} pointerEvents="box-none" {...rest}>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: cornerRadius,
            borderWidth: 1.5,
            borderColor: `rgba(255,255,255,0.28)`,
          },
        ]}
      />
      {children}
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  buttonFallback: {
    backgroundColor: 'rgba(13, 18, 32, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  sliderFallback: {
    backgroundColor: 'rgba(26, 26, 46, 0.5)',
    borderRadius: 4,
  },
  progressFallback: {
    backgroundColor: 'transparent',
    borderRadius: 24,
  },
});

// Export all components
export default {
  LiquidGlassPro,
  LiquidGlassButton,
  LiquidGlassSlider,
  LiquidGlassProgressRing,
  LiquidGlassCard,
};
