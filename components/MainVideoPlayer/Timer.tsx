import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface TimerProps {
  positionMillis: number;
  durationMillis: number;
}

export function Timer({ positionMillis, durationMillis }: TimerProps) {
  const formatTime = (millis: number) => {
    const totalSeconds = millis / 1000;
    const seconds = Math.floor(totalSeconds % 60);
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{formatTime(positionMillis)} / {formatTime(durationMillis)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    color: '#FFF',
  },
});
