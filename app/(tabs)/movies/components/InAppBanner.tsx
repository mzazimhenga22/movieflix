import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const InAppBanner: React.FC<{
  item: {
    id: string;
    message: string;
    actionLabel?: string;
    action?: () => void;
  };
  accent?: string | null;
  onDismiss?: () => void;
}> = ({ item, accent, onDismiss }) => {
  const translateY = useRef(new Animated.Value(-150)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dismissedRef = useRef(false);

  const triggerDismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.92,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -220,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(drag, {
        toValue: { x: -200, y: -120 },
        duration: 240,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss?.();
    });
  }, [drag, onDismiss, opacity, scale, translateY]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 100,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gesture) => {
          const nextX = Math.min(0, gesture.dx);
          const nextY = Math.min(0, gesture.dy);
          drag.setValue({ x: nextX, y: nextY });
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldDismiss = gesture.dx < -70 || gesture.dy < -70 || gesture.dx + gesture.dy < -110;
          if (shouldDismiss) {
            triggerDismiss();
          } else {
            Animated.spring(drag, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: true,
              friction: 7,
            }).start();
          }
        },
      }),
    [drag, triggerDismiss],
  );

  const baseTop = Platform.OS === 'ios' ? 50 : 30;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      pointerEvents="auto"
      style={[
        styles.bannerWrap,
        {
          transform: [
            { translateX: drag.x },
            { translateY: Animated.add(translateY, drag.y) },
            { scale },
          ],
          opacity,
          top: baseTop
        },
      ]}
    >
      <LinearGradient
        colors={[
          accent ?? '#ff6b9d',
          accent ? `${accent}dd` : '#ff8fab',
          accent ? `${accent}aa` : '#ffb3d9',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bannerInner}
      >
        {/* Love-themed decorative elements */}

        <View style={styles.decorationLeft}>
          <Ionicons name="sparkles" size={18} color="rgba(255,255,255,0.85)" />
        </View>

        <View style={styles.content}>
          <View style={styles.textBlock}>
            <Text style={styles.bannerEyebrow}>Heads up</Text>
            <Text style={styles.bannerText} numberOfLines={3}>
              {item.message}
            </Text>
          </View>

          <View style={styles.bannerActions}>
            {item.actionLabel && item.action ? (
              <TouchableOpacity
                onPress={() => {
                  item.action?.();
                  triggerDismiss();
                }}
                style={styles.bannerButton}
              >
                <LinearGradient
                  colors={['#ffffff', '#f8f9ff']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.bannerButtonText}>{item.actionLabel}</Text>
                  <Ionicons name="arrow-forward" size={12} color="#ff6b9d" style={styles.buttonIcon} />
                </LinearGradient>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity onPress={triggerDismiss} style={styles.dismissPill}>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.decorationRight}>
          <Ionicons name="cloud-outline" size={20} color="rgba(255,255,255,0.7)" />
        </View>
      </LinearGradient>

      {/* Floating hearts animation */}
      <View style={styles.floatingElements}>
        <Animated.View style={[styles.floatingHeart, { opacity: opacity, transform: [{ translateY: Animated.multiply(opacity, -10) }] }]}>
          <Ionicons name="heart" size={8} color="rgba(255,255,255,0.6)" />
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bannerWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    shadowColor: '#ff6b9d',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 15,
  },
  bannerInner: {
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 28,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    minHeight: 110,
    overflow: 'hidden',
  },
  decorationLeft: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textBlock: {
    flex: 1,
    marginRight: 12,
  },
  bannerEyebrow: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontWeight: '700',
  },
  bannerText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bannerButtonText: {
    color: '#ff6b9d',
    fontWeight: '700',
    fontSize: 12,
    marginRight: 4,
  },
  buttonIcon: {
    marginLeft: 2,
  },
  decorationRight: {
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  floatingElements: {
    position: 'absolute',
    top: -8,
    right: 20,
    width: 20,
    height: 20,
  },
  floatingHeart: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
});

export default InAppBanner;
