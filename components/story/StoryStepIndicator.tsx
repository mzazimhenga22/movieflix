import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type UploadStep = 'media' | 'edit' | 'music' | 'share';

const STEPS: { key: UploadStep; label: string }[] = [
    { key: 'media', label: 'Media' },
    { key: 'edit', label: 'Edit' },
    { key: 'music', label: 'Music' },
    { key: 'share', label: 'Share' },
];

type Props = {
    currentStep: UploadStep;
    accent?: string;
};

export default function StoryStepIndicator({ currentStep, accent = '#e50914' }: Props) {
    const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

    return (
        <View style={styles.container}>
            <View style={styles.progressTrack}>
                {STEPS.map((step, index) => {
                    const isActive = index <= currentIndex;
                    const isCurrent = index === currentIndex;

                    return (
                        <View key={step.key} style={styles.stepContainer}>
                            {/* Connector line before (except first) */}
                            {index > 0 && (
                                <View style={[styles.connector, isActive && { backgroundColor: accent }]} />
                            )}

                            {/* Step dot */}
                            <View style={[styles.dot, isActive && { borderColor: accent }]}>
                                {isActive && (
                                    <LinearGradient
                                        colors={isCurrent ? [accent, '#ff8a00'] : [accent, accent]}
                                        style={styles.dotFill}
                                    />
                                )}
                            </View>

                            {/* Step label */}
                            <Text
                                style={[
                                    styles.label,
                                    isActive && { color: '#fff', fontWeight: '700' },
                                    isCurrent && { color: accent },
                                ]}
                            >
                                {step.label}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 16,
        paddingHorizontal: 20,
    },
    progressTrack: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    stepContainer: {
        flex: 1,
        alignItems: 'center',
        position: 'relative',
    },
    connector: {
        position: 'absolute',
        top: 10,
        left: -50,
        right: 50,
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
        zIndex: -1,
    },
    dot: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    dotFill: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    label: {
        marginTop: 6,
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '500',
        textAlign: 'center',
    },
});
