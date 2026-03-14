import React from 'react';
import { requireNativeComponent, ViewProps, Platform, View } from 'react-native';

interface WaveViewProps extends ViewProps {
  color?: string;
}

let NativeWaveView: React.ComponentType<WaveViewProps> | null = null;

try {
  if (Platform.OS === 'android') {
    NativeWaveView = requireNativeComponent<WaveViewProps>('WaveView');
  }
} catch (e) {
  console.warn('WaveView native component not found:', e);
}

export const WaveView = (props: WaveViewProps) => {
  if (!NativeWaveView) {
    return <View {...props} />;
  }
  return <NativeWaveView {...props} />;
};
