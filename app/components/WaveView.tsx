import { requireNativeComponent, ViewProps } from 'react-native';

interface WaveViewProps extends ViewProps {
  color?: string;
}

export const WaveView = requireNativeComponent<WaveViewProps>('WaveView');
