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
// LiquidHeroView - Cinematic Hero Background
// ============================================================================

type NativeLiquidHeroViewProps = {
  accentColor?: number | null;
  secondaryColor?: number | null;
  glowIntensity?: number;
  animated?: boolean;
  style?: ViewStyle;
};

export type LiquidHeroViewProps = ViewProps & {
  accentColor?: string;
  secondaryColor?: string;
  glowIntensity?: number;
  animated?: boolean;
  children?: React.ReactNode;
};

let NativeHeroComponent: React.ComponentType<NativeLiquidHeroViewProps> | null = null;

function getNativeHero() {
  if (Platform.OS !== 'android') return null;
  if (!NativeHeroComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('LiquidHeroView') || UIManager.getViewManagerConfig?.('LiquidHeroView')) {
        NativeHeroComponent = requireNativeComponent<NativeLiquidHeroViewProps>('LiquidHeroView');
      }
    } catch { NativeHeroComponent = null; }
  }
  return NativeHeroComponent;
}

export const LiquidHeroView = React.memo(function LiquidHeroView({
  accentColor = '#e50914',
  secondaryColor = '#22d3ee',
  glowIntensity = 0.4,
  animated = true,
  style,
  children,
  ...rest
}: LiquidHeroViewProps) {
  const NativeComponent = useMemo(() => getNativeHero(), []);
  const processedAccent = useMemo(() => processColor(accentColor), [accentColor]);
  const processedSecondary = useMemo(() => processColor(secondaryColor), [secondaryColor]);

  if (NativeComponent) {
    return (
      <NativeComponent
        style={[styles.hero, style]}
        accentColor={processedAccent}
        secondaryColor={processedSecondary}
        glowIntensity={glowIntensity}
        animated={animated}
        {...rest}
      >
        {children}
      </NativeComponent>
    );
  }

  return <View style={[styles.hero, style]} {...rest}>{children}</View>;
});

// ============================================================================
// LiquidRatingBadge - Premium Rating Badge
// ============================================================================

type NativeLiquidRatingBadgeProps = {
  rating?: number;
  accentColor?: number | null;
  showStar?: boolean;
  style?: ViewStyle;
};

export type LiquidRatingBadgeProps = ViewProps & {
  rating?: number;
  accentColor?: string;
  showStar?: boolean;
  size?: number;
};

let NativeRatingComponent: React.ComponentType<NativeLiquidRatingBadgeProps> | null = null;

function getNativeRating() {
  if (Platform.OS !== 'android') return null;
  if (!NativeRatingComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('LiquidRatingBadge') || UIManager.getViewManagerConfig?.('LiquidRatingBadge')) {
        NativeRatingComponent = requireNativeComponent<NativeLiquidRatingBadgeProps>('LiquidRatingBadge');
      }
    } catch { NativeRatingComponent = null; }
  }
  return NativeRatingComponent;
}

export const LiquidRatingBadge = React.memo(function LiquidRatingBadge({
  rating = 0,
  accentColor = '#e50914',
  showStar = true,
  size = 60,
  style,
  ...rest
}: LiquidRatingBadgeProps) {
  const NativeComponent = useMemo(() => getNativeRating(), []);
  const processedAccent = useMemo(() => processColor(accentColor), [accentColor]);

  const containerStyle = useMemo(() => [
    styles.ratingBadge,
    { minWidth: size, minHeight: size * 0.5 },
    style
  ], [size, style]);

  if (NativeComponent) {
    return (
      <NativeComponent
        style={containerStyle}
        rating={rating}
        accentColor={processedAccent}
        showStar={showStar}
        {...rest}
      />
    );
  }

  // Fallback
  const isHighRated = rating >= 7.5;
  return (
    <View style={[containerStyle, styles.ratingFallback, isHighRated && styles.ratingHigh]} {...rest}>
      {showStar && <View style={[styles.star, { backgroundColor: isHighRated ? '#ffd700' : '#fff' }]} />}
      <View style={styles.ratingTextWrap}>
        <View style={styles.ratingText}>{rating.toFixed(1)}</View>
      </View>
    </View>
  );
});

// ============================================================================
// LiquidWaveformView - Real-time Audio Waveform
// ============================================================================

type NativeLiquidWaveformViewProps = {
  barColor?: number | null;
  secondaryColor?: number | null;
  barCount?: number;
  isPlaying?: boolean;
  style?: ViewStyle;
};

export type LiquidWaveformViewProps = ViewProps & {
  barColor?: string;
  secondaryColor?: string;
  barCount?: number;
  isPlaying?: boolean;
  height?: number;
  onAmplitudeUpdate?: (amplitudes: number[]) => void;
};

let NativeWaveformComponent: React.ComponentType<NativeLiquidWaveformViewProps> | null = null;

function getNativeWaveform() {
  if (Platform.OS !== 'android') return null;
  if (!NativeWaveformComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('LiquidWaveformView') || UIManager.getViewManagerConfig?.('LiquidWaveformView')) {
        NativeWaveformComponent = requireNativeComponent<NativeLiquidWaveformViewProps>('LiquidWaveformView');
      }
    } catch { NativeWaveformComponent = null; }
  }
  return NativeWaveformComponent;
}

export const LiquidWaveformView = React.memo(function LiquidWaveformView({
  barColor = '#ff2d55',
  secondaryColor = '#22d3ee',
  barCount = 48,
  isPlaying = false,
  height = 120,
  style,
  ...rest
}: LiquidWaveformViewProps) {
  const NativeComponent = useMemo(() => getNativeWaveform(), []);
  const processedBarColor = useMemo(() => processColor(barColor), [barColor]);
  const processedSecondaryColor = useMemo(() => processColor(secondaryColor), [secondaryColor]);

  const containerStyle = useMemo(() => [
    styles.waveform,
    { height },
    style
  ], [height, style]);

  if (NativeComponent) {
    return (
      <NativeComponent
        style={containerStyle}
        barColor={processedBarColor}
        secondaryColor={processedSecondaryColor}
        barCount={barCount}
        isPlaying={isPlaying}
        {...rest}
      />
    );
  }

  return <View style={containerStyle} {...rest} />;
});

// ============================================================================
// LiquidChipView - Premium Category Chip
// ============================================================================

type NativeLiquidChipViewProps = {
  text?: string;
  accentColor?: number | null;
  selected?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
};

export type LiquidChipViewProps = ViewProps & {
  text?: string;
  accentColor?: string;
  selected?: boolean;
  onPress?: () => void;
};

let NativeChipComponent: React.ComponentType<NativeLiquidChipViewProps> | null = null;

function getNativeChip() {
  if (Platform.OS !== 'android') return null;
  if (!NativeChipComponent) {
    try {
      if (UIManager.hasViewManagerConfig?.('LiquidChipView') || UIManager.getViewManagerConfig?.('LiquidChipView')) {
        NativeChipComponent = requireNativeComponent<NativeLiquidChipViewProps>('LiquidChipView');
      }
    } catch { NativeChipComponent = null; }
  }
  return NativeChipComponent;
}

export const LiquidChipView = React.memo(function LiquidChipView({
  text = '',
  accentColor = '#e50914',
  selected = false,
  onPress,
  style,
  ...rest
}: LiquidChipViewProps) {
  const NativeComponent = useMemo(() => getNativeChip(), []);
  const processedAccent = useMemo(() => processColor(accentColor), [accentColor]);

  const containerStyle = useMemo(() => [
    styles.chip,
    selected && styles.chipSelected,
    style
  ], [selected, style]);

  if (NativeComponent) {
    return (
      <NativeComponent
        style={containerStyle}
        text={text}
        accentColor={processedAccent}
        selected={selected}
        onPress={onPress}
        {...rest}
      />
    );
  }

  // Fallback
  return (
    <View 
      style={[
        containerStyle, 
        { backgroundColor: selected ? accentColor : 'rgba(15,18,30,0.65)', borderColor: selected ? accentColor : 'rgba(255,255,255,0.1)' }
      ]} 
      onTouchEnd={onPress}
      {...rest}
    >
      <View style={styles.chipText}>{text}</View>
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  hero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  ratingFallback: {
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  ratingHigh: {
    borderColor: 'rgba(255,215,0,0.5)',
  },
  star: {
    width: 12,
    height: 12,
    marginRight: 6,
  },
  ratingTextWrap: {
    flex: 1,
  },
  ratingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  waveform: {
    backgroundColor: 'transparent',
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(15,18,30,0.65)',
  },
  chipSelected: {
    borderColor: 'rgba(229,9,20,0.8)',
  },
  chipText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
});

// Export all
export default {
  LiquidHeroView,
  LiquidRatingBadge,
  LiquidWaveformView,
  LiquidChipView,
};
