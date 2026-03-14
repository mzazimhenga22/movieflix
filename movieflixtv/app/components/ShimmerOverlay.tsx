import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, type ViewStyle } from 'react-native';

type Props = {
  active?: boolean;
  color?: string;
  duration?: number;
  style?: ViewStyle;
};

function ShimmerOverlay({ active = true, color = '#ffffff', duration = 2400, style }: Props) {
  const translateX = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    if (!active) {
      translateX.setValue(-1);
      return;
    }

    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [active, duration, translateX]);

  if (!active) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.shimmer,
        style,
        {
          transform: [
            {
              translateX: translateX.interpolate({
                inputRange: [-1, 1],
                outputRange: [-400, 400],
              }),
            },
          ],
        },
      ]}
    >
      <LinearGradient
        colors={['transparent', `${color}08`, `${color}18`, `${color}08`, 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradient}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  gradient: {
    width: 400,
    height: '100%',
    transform: [{ skewX: '-20deg' }],
  },
});

export default memo(ShimmerOverlay);
