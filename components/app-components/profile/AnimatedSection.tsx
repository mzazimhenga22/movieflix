import React, { memo, useEffect, useRef } from 'react';
import { Animated } from 'react-native';

interface AnimatedSectionProps {
  children: React.ReactNode;
  delay?: number;
  style?: any;
}

const AnimatedSection = memo(function AnimatedSection({ children, delay = 0, style }: AnimatedSectionProps) {
  const translateY = useRef(new Animated.Value(30)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 10,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [delay, translateY, opacity]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
});

export default AnimatedSection;
