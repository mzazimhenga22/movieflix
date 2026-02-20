import React, { useRef, useEffect } from 'react';
import { Animated } from 'react-native';

const PulsePlaceholder: React.FC<{ style?: any }> = ({ style }) => {
  const anim = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[
        { backgroundColor: '#171717', borderRadius: 6, opacity: anim },
        style,
      ]}
    />
  );
};

export default PulsePlaceholder;
