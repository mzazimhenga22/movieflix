import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { TouchableOpacity, View } from 'react-native';

interface NativeGlassControlProps extends React.ComponentProps<typeof View> {
    iconName: string;
    showGlassBackground?: boolean;
    glassColor?: string;
    glassGlowColor?: string;
    onPress?: (event: any) => void;
}

const NativeGlassControl: React.FC<NativeGlassControlProps> = ({ iconName, onPress, style, ...rest }) => {
    // Map custom native icon names to standard Ionicons
    const getMappedIcon = (name: string): any => {
        if (name === 'seek-back') return 'play-back';
        if (name === 'seek-forward') return 'play-forward';
        return name as any;
    };

    return (
        <TouchableOpacity
            onPress={onPress}
            style={[style, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' }]}
            activeOpacity={0.7}
        >
            <Ionicons name={getMappedIcon(iconName)} size={28} color="#fff" />
        </TouchableOpacity>
    );
};

export default NativeGlassControl;
