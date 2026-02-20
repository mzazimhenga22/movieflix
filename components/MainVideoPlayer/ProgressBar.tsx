import React from 'react';
import { View, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';

interface ProgressBarProps {
  positionMillis: number;
  durationMillis: number;
  onValueChange: (value: number) => void;
}

export function ProgressBar({ positionMillis, durationMillis, onValueChange }: ProgressBarProps) {
  return (
    <View style={styles.container}>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={durationMillis}
        value={positionMillis}
        onValueChange={onValueChange}
        minimumTrackTintColor="#FFFFFF"
        maximumTrackTintColor="#000000"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginHorizontal: 10,
  },
  slider: {
    width: '100%',
    height: 40,
  },
});
