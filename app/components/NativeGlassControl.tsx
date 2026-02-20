import React from 'react';
import { requireNativeComponent, View } from 'react-native';

interface NativeGlassControlProps extends React.ComponentProps<typeof View> {
    iconName: string;
    onPress?: (event: any) => void;
}

const NativeGlassControl = requireNativeComponent('NativeGlassControl') as unknown as React.ComponentType<NativeGlassControlProps>;

export default NativeGlassControl;
