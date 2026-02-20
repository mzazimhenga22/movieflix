import React from 'react';
import { requireNativeComponent, ViewProps } from 'react-native';

interface NativeWaveformViewProps extends ViewProps {
  accentColor?: string;
  isPlaying?: boolean;
}

const NativeWaveformView = requireNativeComponent<NativeWaveformViewProps>('NativeWaveformView');

export default NativeWaveformView;
