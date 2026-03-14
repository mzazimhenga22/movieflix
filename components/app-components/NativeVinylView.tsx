import React from 'react';
import { requireNativeComponent, ViewProps, Platform, View } from 'react-native';

interface NativeVinylViewProps extends ViewProps {
  accentColor?: string;
  isPlaying?: boolean;
  imageUrl?: string;
}

let NativeComp: React.ComponentType<NativeVinylViewProps> | null = null;

try {
  if (Platform.OS === 'android') {
    NativeComp = requireNativeComponent<NativeVinylViewProps>('NativeVinylView');
  }
} catch (e) {
  console.warn('NativeVinylView not found:', e);
}

const NativeVinylView = (props: NativeVinylViewProps) => {
  if (!NativeComp) return <View {...props} />;
  return <NativeComp {...props} />;
};

export default NativeVinylView;
