import React from 'react';
import { requireNativeComponent, ViewProps } from 'react-native';

interface NativeVinylViewProps extends ViewProps {
  accentColor?: string;
  isPlaying?: boolean;
  imageUrl?: string;
}

const NativeVinylView = requireNativeComponent<NativeVinylViewProps>('NativeVinylView');

export default NativeVinylView;
