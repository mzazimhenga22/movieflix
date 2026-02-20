import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity } from 'react-native';

interface AnimatedStatProps {
  value: number;
  label: string;
  hint?: string;
  onPress?: () => void;
  delay?: number;
  accentColor?: string;
}

const AnimatedStat = memo(function AnimatedStat({
  value,
  label,
  hint,
  onPress,
  delay = 0,
  accentColor,
}: AnimatedStatProps) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [delay, scaleAnim, opacityAnim]);

  useEffect(() => {
    countAnim.setValue(0);
    Animated.timing(countAnim, {
      toValue: value,
      duration: 800,
      delay: delay + 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    const listener = countAnim.addListener(({ value: v }) => {
      setDisplayValue(Math.round(v));
    });
    return () => countAnim.removeListener(listener);
  }, [value, delay, countAnim]);

  const content = (
    <Animated.View
      style={[
        styles.statBox,
        hint && styles.statBoxInteractive,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <Text style={[styles.statValue, accentColor ? { textShadowColor: accentColor } : undefined]}>
        {displayValue}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint && <Text style={styles.statHint}>{hint}</Text>}
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
});

const styles = StyleSheet.create({
  statBox: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '900',
    color: 'white',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  statBoxInteractive: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  statHint: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    letterSpacing: 0.4,
    fontWeight: '500',
  },
});

export default AnimatedStat;
