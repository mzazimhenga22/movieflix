import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { base64ToDataUri, GRAIN_PNG_BASE64 } from './engineer';

type VideoMaskingOverlayProps = {
  enabled?: boolean;
  intensity?: number;
};

export function VideoMaskingOverlay({ enabled = true, intensity = 0.12 }: VideoMaskingOverlayProps) {
  const drift = useRef(new Animated.Value(0)).current;
  const grainUri = useMemo(() => base64ToDataUri(GRAIN_PNG_BASE64, 'image/png'), []);

  useEffect(() => {
    if (!enabled) return;
    const anim = Animated.loop(
      Animated.timing(drift, {
        toValue: 1,
        duration: 45000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => {
      anim.stop();
      drift.setValue(0);
    };
  }, [drift, enabled]);

  if (!enabled || intensity <= 0) return null;

  const translate = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.Image
        source={{ uri: grainUri }}
        resizeMode="repeat"
        style={[
          styles.grain,
          {
            // Keep the effect effectively imperceptible.
            opacity: Math.max(0, Math.min(0.09, intensity)),
            transform: [{ translateX: translate }, { translateY: translate }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
});
