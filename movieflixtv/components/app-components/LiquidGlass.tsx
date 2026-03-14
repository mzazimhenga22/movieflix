import { BlurView } from 'expo-blur';
import React, { useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  UIManager,
  View,
  processColor,
  requireNativeComponent,
} from 'react-native';

type NativeLiquidGlassProps = {
  cornerRadius?: number;
  tintOpacity?: number;
  glowIntensity?: number;
  borderWidth?: number;
  borderOpacity?: number;
  tintColor?: number | null;
  borderColor?: number | null;
  glowColor?: number | null;
  animated?: boolean;
  style?: any;
};

export type LiquidGlassProps = React.ComponentProps<typeof View> & {
  cornerRadius?: number;
  tintOpacity?: number;
  tintColor?: string;
  borderOpacity?: number;
  borderColor?: string;
  glowColor?: string;
  glowIntensity?: number;
  borderWidth?: number;
  animated?: boolean;
  fastMode?: boolean;
  children?: React.ReactNode;
};

let NativeGlassComponent: React.ComponentType<NativeLiquidGlassProps> | null = null;

function getNativeGlass() {
  if (Platform.OS !== 'android') return null;
  if (!NativeGlassComponent) {
    try {
      const hasViewManager = 'hasViewManagerConfig' in UIManager
        ? UIManager.hasViewManagerConfig('LiquidGlassView')
        : UIManager.getViewManagerConfig('LiquidGlassView') != null;

      if (hasViewManager) {
        NativeGlassComponent = requireNativeComponent<NativeLiquidGlassProps>('LiquidGlassView');
      }
    } catch {
      NativeGlassComponent = null;
    }
  }
  return NativeGlassComponent;
}

const LiquidGlass = React.memo(function LiquidGlass({
  cornerRadius = 24,
  tintOpacity = 0.16,
  tintColor = '#10131A',
  borderOpacity = 0.22,
  borderColor = '#FFFFFF',
  glowColor = '#E50914',
  glowIntensity = 0.22,
  borderWidth = 1.25,
  animated = false,
  fastMode = false,
  style,
  children,
  ...rest
}: LiquidGlassProps) {
  const NativeComponent = useMemo(() => getNativeGlass(), []);
  const processedTintColor = useMemo(() => processColor(tintColor), [tintColor]);
  const processedBorderColor = useMemo(() => processColor(borderColor), [borderColor]);
  const processedGlowColor = useMemo(() => processColor(glowColor), [glowColor]);

  const containerStyle = useMemo(
    () => [styles.base, { borderRadius: cornerRadius }, style],
    [cornerRadius, style]
  );

  if (NativeComponent && !fastMode) {
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
        />
        {children}
      </View>
    );
  }

  return (
    <View style={containerStyle} pointerEvents="box-none" {...rest}>
      {Platform.OS === 'ios' && !fastMode ? (
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: tintColor, opacity: tintOpacity },
          ]}
        />
      )}
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

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});

export default LiquidGlass;
