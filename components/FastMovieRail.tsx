import { Media } from '@/types/index';
import React, { useCallback } from 'react';
import { Platform, requireNativeComponent } from 'react-native';
import type { NativeSyntheticEvent } from 'react-native/Libraries/Types/CoreEventTypes';
import type { ViewStyle } from 'react-native/Libraries/StyleSheet/StyleSheetTypes';

interface FastMovieRailProps {
    title: string;
    movies: string;
    accentColor?: string;
    style?: ViewStyle | ViewStyle[];
    onItemPress?: (event: NativeSyntheticEvent<{ id: string; media_type: string; id_number: number }>) => void;
    onSeeAllPress?: (event: NativeSyntheticEvent<{}>) => void;
}

const NativeFastMovieRail = requireNativeComponent('FastMovieRail') as unknown as React.ComponentType<FastMovieRailProps>;

interface Props {
    title: string;
    movies: Media[];
    accentColor?: string;
    onItemPress: (item: Media) => void;
    onSeeAllPress?: () => void;
}

export const FastMovieRail: React.FC<Props> = ({
    title,
    movies,
    accentColor = '#E50914',
    onItemPress,
    onSeeAllPress,
}) => {
    const handleItemPress = useCallback(
        (event: NativeSyntheticEvent<{ id: string; media_type: string; id_number: number }>) => {
            const { id, media_type, id_number } = event.nativeEvent;
            const item: Partial<Media> = {
                id: id_number || parseInt(id, 10),
                media_type: media_type as any,
            };
            onItemPress(item as Media);
        },
        [onItemPress]
    );

    const handleSeeAllPress = useCallback(() => {
        onSeeAllPress?.();
    }, [onSeeAllPress]);

    if (Platform.OS !== 'android') {
        return null;
    }

    return (
        <NativeFastMovieRail
            style={{ height: 320, marginBottom: 16 } as ViewStyle}
            title={title}
            movies={JSON.stringify(movies)}
            accentColor={accentColor}
            onItemPress={handleItemPress}
            onSeeAllPress={handleSeeAllPress}
        />
    );
};
