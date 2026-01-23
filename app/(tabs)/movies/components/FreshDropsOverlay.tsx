import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

interface Drop {
  id: string;
  x: number;
  size: number;
  delay: number;
  duration: number;
  swayAmount: number;
  rotation: number;
}

interface Splash {
  id: string;
  x: number;
  delay: number;
}

function WaterDrop({ drop, screenHeight, anim }: { drop: Drop; screenHeight: number; anim: Animated.Value }) {
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-drop.size * 2, screenHeight + 20],
  });

  const translateX = anim.interpolate({
    inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
    outputRange: [0, drop.swayAmount * 0.5, -drop.swayAmount * 0.3, drop.swayAmount * 0.4, -drop.swayAmount * 0.2, 0],
  });

  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${drop.rotation}deg`],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.05, 0.9, 1],
    outputRange: [0, 0.9, 0.85, 0],
  });

  const scaleY = anim.interpolate({
    inputRange: [0, 0.3, 0.6, 1],
    outputRange: [0.8, 1.15, 1.05, 1],
  });

  const width = drop.size * 0.7;
  const height = drop.size;

  return (
    <Animated.View
      style={[
        styles.dropContainer,
        {
          left: drop.x,
          width: width + 4,
          height: height + 6,
          opacity,
          transform: [{ translateY }, { translateX }, { rotate }, { scaleY }],
        },
      ]}
    >
      {/* Drop glow */}
      <View style={[styles.dropGlow, { width: width * 1.8, height: height * 1.5 }]} />
      
      {/* Main drop body */}
      <LinearGradient
        colors={['rgba(120,200,255,0.95)', 'rgba(60,150,220,0.9)', 'rgba(30,100,180,0.85)']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={[
          styles.dropBody,
          {
            width,
            height,
            borderTopLeftRadius: width * 0.5,
            borderTopRightRadius: width * 0.5,
            borderBottomLeftRadius: width * 0.8,
            borderBottomRightRadius: width * 0.8,
          },
        ]}
      >
        {/* Highlight reflection */}
        <View
          style={[
            styles.dropHighlight,
            {
              width: width * 0.25,
              height: height * 0.35,
              left: width * 0.2,
              top: height * 0.15,
              borderRadius: width * 0.15,
            },
          ]}
        />
        {/* Secondary highlight */}
        <View
          style={[
            styles.dropHighlightSmall,
            {
              width: width * 0.12,
              height: height * 0.15,
              left: width * 0.55,
              top: height * 0.35,
              borderRadius: width * 0.1,
            },
          ]}
        />
      </LinearGradient>
    </Animated.View>
  );
}

function SplashEffect({ splash, screenHeight, anim }: { splash: Splash; screenHeight: number; anim: Animated.Value }) {
  const splashScale = anim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.2, 1.2, 0],
  });

  const splashOpacity = anim.interpolate({
    inputRange: [0, 0.15, 0.6, 1],
    outputRange: [0, 0.8, 0.4, 0],
  });

  const rippleScale = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1.5, 2],
  });

  const rippleOpacity = anim.interpolate({
    inputRange: [0, 0.2, 0.7, 1],
    outputRange: [0, 0.6, 0.2, 0],
  });

  return (
    <View style={[styles.splashContainer, { left: splash.x, bottom: 60 }]}>
      {/* Ripple ring */}
      <Animated.View
        style={[
          styles.ripple,
          {
            opacity: rippleOpacity,
            transform: [{ scale: rippleScale }],
          },
        ]}
      />
      
      {/* Splash droplets */}
      {[-25, -12, 0, 12, 25].map((offsetX, i) => (
        <Animated.View
          key={i}
          style={[
            styles.splashDroplet,
            {
              opacity: splashOpacity,
              transform: [
                { scale: splashScale },
                { translateX: offsetX * (1 + Math.random() * 0.3) },
                {
                  translateY: anim.interpolate({
                    inputRange: [0, 0.4, 1],
                    outputRange: [0, -20 - Math.random() * 15, 10],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(150,220,255,0.9)', 'rgba(80,170,230,0.7)']}
            style={styles.splashDropletInner}
          />
        </Animated.View>
      ))}
    </View>
  );
}

export default function FreshDropsOverlay({ trigger }: { trigger: number }) {
  const { width, height } = useWindowDimensions();
  const [active, setActive] = useState(false);
  const dropsRef = useRef<Drop[]>([]);
  const splashesRef = useRef<Splash[]>([]);
  const dropAnimsRef = useRef<Animated.Value[]>([]);
  const splashAnimsRef = useRef<Animated.Value[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!trigger) return;

    // Generate drops
    dropsRef.current = Array.from({ length: 35 }, (_, i) => ({
      id: `drop-${trigger}-${i}`,
      x: rand(10, width - 30),
      size: rand(14, 26),
      delay: rand(0, 800),
      duration: rand(1800, 2800),
      swayAmount: rand(8, 25) * (Math.random() > 0.5 ? 1 : -1),
      rotation: rand(-15, 15),
    }));

    // Generate splashes at bottom
    splashesRef.current = Array.from({ length: 12 }, (_, i) => ({
      id: `splash-${trigger}-${i}`,
      x: rand(20, width - 40),
      delay: rand(400, 1600),
    }));

    // Create animation values
    dropAnimsRef.current = dropsRef.current.map(() => new Animated.Value(0));
    splashAnimsRef.current = splashesRef.current.map(() => new Animated.Value(0));

    setActive(true);

    // Animate drops
    const dropAnims = dropAnimsRef.current.map((anim, i) => {
      const drop = dropsRef.current[i];
      return Animated.timing(anim, {
        toValue: 1,
        duration: drop.duration,
        delay: drop.delay,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      });
    });

    // Animate splashes
    const splashAnims = splashAnimsRef.current.map((anim, i) => {
      const splash = splashesRef.current[i];
      return Animated.timing(anim, {
        toValue: 1,
        duration: 600,
        delay: splash.delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
    });

    Animated.parallel([...dropAnims, ...splashAnims]).start();

    timeoutRef.current = setTimeout(() => setActive(false), 3500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      dropAnimsRef.current.forEach((a) => a.stopAnimation());
      splashAnimsRef.current.forEach((a) => a.stopAnimation());
    };
  }, [trigger, width, height]);

  if (!active) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {/* Water drops */}
      {dropsRef.current.map((drop, i) => (
        <WaterDrop
          key={drop.id}
          drop={drop}
          screenHeight={height}
          anim={dropAnimsRef.current[i]}
        />
      ))}

      {/* Splash effects */}
      {splashesRef.current.map((splash, i) => (
        <SplashEffect
          key={splash.id}
          splash={splash}
          screenHeight={height}
          anim={splashAnimsRef.current[i]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    overflow: 'hidden',
  },
  dropContainer: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(100,180,255,0.15)',
    borderRadius: 100,
  },
  dropBody: {
    overflow: 'hidden',
  },
  dropHighlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  dropHighlightSmall: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  splashContainer: {
    position: 'absolute',
    width: 60,
    height: 40,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  ripple: {
    position: 'absolute',
    width: 50,
    height: 20,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'rgba(120,200,255,0.5)',
    backgroundColor: 'transparent',
  },
  splashDroplet: {
    position: 'absolute',
    width: 6,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  splashDropletInner: {
    flex: 1,
    borderRadius: 4,
  },
});
