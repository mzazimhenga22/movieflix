import React from 'react';
import { Platform, requireNativeComponent, UIManager, View } from 'react-native';

interface NativeWaveformViewProps extends React.ComponentProps<typeof View> {
  accentColor?: string;
  isPlaying?: boolean;
}

let NativeComp: React.ComponentType<NativeWaveformViewProps> | null = null;

if (Platform.OS === 'android') {
  if (UIManager.getViewManagerConfig('NativeWaveformView') != null) {
    try {
      NativeComp = requireNativeComponent('NativeWaveformView') as unknown as React.ComponentType<NativeWaveformViewProps>;
    } catch (e) {
      console.warn('NativeWaveformView not found:', e);
    }
  } else {
    // Silently fall back
  }
}

const NativeWaveformView = (props: NativeWaveformViewProps) => {
  if (!NativeComp) return <View {...props} />;
  return <NativeComp {...props} />;
};

export default NativeWaveformView;
