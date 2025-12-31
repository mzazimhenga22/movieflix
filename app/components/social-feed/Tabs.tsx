import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
  AccessibilityRole,
  Platform,
} from 'react-native';

type Tab = 'Feed' | 'Recommended' | 'Live' | 'Movie Match';

interface Props {
  active: Tab;
  onChangeTab: (tab: Tab) => void;
}

const tabs: Tab[] = ['Feed', 'Recommended', 'Live', 'Movie Match'];

export default function FeedTabs({ active, onChangeTab }: Props) {
  // value 0..1 used to animate active indicator
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [active, anim]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.container} accessibilityRole="tablist">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollInner}
        >
          {tabs.map((tab) => {
            const isActive = tab === active;
            const accessibleRole: AccessibilityRole = 'tab';

            return (
              <Pressable
                key={tab}
                onPress={() => onChangeTab(tab)}
                style={({ pressed }) => [
                  styles.tabBtn,
                  isActive && styles.tabBtnActive,
                  pressed && styles.tabPressed,
                ]}
                accessibilityRole={accessibleRole}
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${tab} tab`}
              >
                <Text
                  style={[styles.tabText, isActive && styles.tabTextActive]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  maxFontSizeMultiplier={1.2}
                >
                  {tab}
                </Text>

                {/* Animated glassy indicator */}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.activeIndicator,
                    isActive
                      ? {
                          opacity: anim,
                          transform: [
                            {
                              scaleX: anim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.85, 1],
                              }),
                            },
                            {
                              translateY: anim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [6, 0],
                              }),
                            },
                          ],
                        }
                      : { opacity: 0.0, transform: [{ scale: 0.85 }, { translateY: 6 }] },
                  ]}
                >
                  {/* inner highlight to sell the glass look */}
                  <View style={styles.indicatorInner} />
                </Animated.View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

type Style = {
  wrapper: ViewStyle;
  container: ViewStyle;
  scrollInner: ViewStyle;
  tabBtn: ViewStyle;
  tabBtnActive: ViewStyle;
  tabPressed: ViewStyle;
  tabText: TextStyle;
  tabTextActive: TextStyle;
  activeIndicator: ViewStyle;
  indicatorInner: ViewStyle;
};

const styles = StyleSheet.create<Style>({
  wrapper: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    // keep wrapper transparent so the glass blends with background
    backgroundColor: 'transparent',
  },
  container: {
    // subtle frosted panel using translucent fills + thin border
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    // soft outer shadow for depth
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 24,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  scrollInner: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    paddingHorizontal: 2,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 92,
    backgroundColor: 'transparent',
  },
  tabBtnActive: {
    // slightly stronger glass fill on active
    backgroundColor: 'rgba(255,255,255,0.03)',
    // faint glow using a colored shadow to hint brand accent
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(255,61,61,0.12)',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 1,
        shadowRadius: 14,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  tabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.995 }],
  },
  tabText: {
    color: '#d7d7d7',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  tabTextActive: {
    color: '#7dd8ff', // warm accent color
    fontSize: 14,
    fontWeight: '700',
  },
  activeIndicator: {
    marginTop: 8,
    width: 36,
    height: 8,
    borderRadius: 999,
    // glassy base: translucent bright pill
    backgroundColor: 'rgba(125,216,255,0.12)',
    alignSelf: 'center',
    // subtle outer glow
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(125,216,255,0.12)',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 1,
        shadowRadius: 12,
      },
      android: {
        elevation: 1,
      },
      default: {},
    }),
    overflow: 'hidden',
  },
  indicatorInner: {
    flex: 1,
    margin: 1,
    borderRadius: 999,
    // inner highlight gradient mimic (lighter center)
    backgroundColor: 'rgba(255,255,255,0.12)',
    opacity: 0.95,
  },
});
