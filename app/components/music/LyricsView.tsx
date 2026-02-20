import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const ITEM_HEIGHT = 40; // Approx height of a specific line

interface LyricLine {
    time: number;
    text: string;
}

interface LyricsViewProps {
    lyrics: LyricLine[];
    currentTime: number; // in seconds
    onClose: () => void;
    isLoading?: boolean;
}

export function LyricsView({ lyrics, currentTime, onClose, isLoading }: LyricsViewProps) {
    const flatListRef = useRef<FlatList>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    // Auto-scroll logic based on time
    useEffect(() => {
        if (!lyrics || lyrics.length === 0) return;

        // Find current line
        const index = lyrics.findIndex((line, i) => {
            const nextLine = lyrics[i + 1];
            return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
        });

        if (index !== -1 && index !== activeIndex) {
            setActiveIndex(index);

            // Scroll to center the active line
            flatListRef.current?.scrollToIndex({
                index,
                animated: true,
                viewOffset: height / 2.5, // Center offset
                viewPosition: 0.5
            });
        }
    }, [currentTime, lyrics]);

    const renderItem = ({ item, index }: { item: LyricLine, index: number }) => {
        const isActive = index === activeIndex;
        return (
            <TouchableOpacity
                style={[styles.line, isActive && styles.activeLine]}
                activeOpacity={0.8}
            // Future: seek on press
            >
                <Text style={[styles.text, isActive && styles.activeText]}>
                    {item.text}
                </Text>
            </TouchableOpacity>
        );
    };

    if (isLoading) {
        return (
            <View style={styles.container}>
                <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.center}>
                    <Text style={styles.loadingText}>Loading Lyrics...</Text>
                </View>
            </View>
        )
    }

    return (
        <Animated.View style={styles.container} entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)}>
            <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill} />

            <LinearGradient
                colors={['rgba(0,0,0,0.8)', 'transparent', 'transparent', 'rgba(0,0,0,0.8)']}
                locations={[0, 0.1, 0.9, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            <FlatList
                ref={flatListRef}
                data={lyrics}
                renderItem={renderItem}
                keyExtractor={(item, i) => i.toString()}
                contentContainerStyle={styles.listContent}
                getItemLayout={(data, index) => ({
                    length: 50, // Approx height + margin
                    offset: 50 * index,
                    index,
                })}
                showsVerticalScrollIndicator={false}
                initialNumToRender={20}
            />

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 100,
        justifyContent: 'center',
        alignItems: 'center',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    listContent: {
        paddingVertical: height / 2,
        paddingHorizontal: 20,
    },
    line: {
        marginBottom: 16,
        alignItems: 'center',
        opacity: 0.4,
        transform: [{ scale: 0.95 }]
    },
    activeLine: {
        opacity: 1,
        transform: [{ scale: 1.05 }],
        marginBottom: 24,
        marginTop: 8
    },
    text: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '600',
        textAlign: 'center',
        fontFamily: 'System', // iOS Default
    },
    activeText: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '800',
        textShadowColor: 'rgba(255, 255, 255, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    loadingText: {
        color: '#fff',
        fontSize: 16,
        opacity: 0.7
    },
    closeButton: {
        position: 'absolute',
        bottom: 50,
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)'
    },
    closeText: {
        color: '#fff',
        fontWeight: '600'
    }
});
