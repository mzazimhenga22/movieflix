import React from 'react';
import { requireNativeComponent, View, Text } from 'react-native';

interface NativeGlassControlProps extends React.ComponentProps<typeof View> {
    iconName: string;
    onPress?: (event: any) => void;
}

const NativeGlassControlNative = requireNativeComponent('NativeGlassControl') as unknown as React.ComponentType<NativeGlassControlProps> | null;

// Fallback component if native module is not available
const NativeGlassControlFallback: React.FC<NativeGlassControlProps> = ({ iconName, style }) => (
    <View style={style}>
        <Text>{iconName}</Text>
    </View>
);

const NativeGlassControl = NativeGlassControlNative || NativeGlassControlFallback;

export default NativeGlassControl;
