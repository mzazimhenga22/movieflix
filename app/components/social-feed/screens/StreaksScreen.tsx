import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import ScreenWrapper from '../../../../components/ScreenWrapper';
import {
  getAchievementProgress,
  getEarnedBadges,
} from '../../../../lib/achievements/achievementManager';
import {
  AchievementProgress,
  Badge,
  BadgeId,
  BadgeProgress,
  BADGES,
  EarnedBadges,
  xpForNextLevel
} from '../../../../lib/achievements/types';
import {
  Conversation,
  findOrCreateConversation,
  getFollowing,
  onAuthChange,
  onConversationsUpdate,
  Profile,
} from '../../../messaging/controller';
import { useAccent } from '../../AccentContext';

interface Streak {
  id: string;
  days: number;
  activity: string;
  lastUpdate: string;
  partnerId?: string | null;
  sourceType?: string;
}

type StreakRect = { x: number; y: number; width: number; height: number };

type GradientPalette = [string, string, string];

interface StreakRowProps {
  item: Streak;
  onPress: (streak: Streak) => void;
  onLongPress: (streak: Streak, rect: StreakRect) => void;
}

const StreakRow = ({ item, onPress, onLongPress }: StreakRowProps) => {
  const rowRef = React.useRef<View | null>(null);

  const handleLongPress = () => {
    if (!rowRef.current) return;
    rowRef.current.measureInWindow((x, y, width, height) => {
      onLongPress(item, { x, y, width, height });
    });
  };

  return (
    <TouchableOpacity
      ref={rowRef}
      activeOpacity={0.85}
      onPress={() => onPress(item)}
      onLongPress={handleLongPress}
    >
      <LinearGradient
        colors={['#ff4b4b', '#ff8080']}
        style={styles.streakCard}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.streakContent}>
          <Text style={styles.streakDays}>{item.days}</Text>
          <Text style={styles.streakLabel}>days</Text>
        </View>
        <View style={styles.streakInfo}>
          <View style={styles.streakTitleRow}>
            <Text style={styles.streakActivity}>{item.activity}</Text>
            {item.sourceType && (
              <Text style={styles.streakTag}>
                {item.sourceType === 'chat'
                  ? 'Chat'
                  : item.sourceType === 'story'
                    ? 'Stories'
                    : 'Feed'}
              </Text>
            )}
          </View>
          <Text style={styles.streakUpdate}>Last: {item.lastUpdate}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

export default function StreaksScreen() {
  const router = useRouter();
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [followers, setFollowers] = useState<Profile[]>([]);
  const [selectedFollowerIds, setSelectedFollowerIds] = useState<Set<string>>(new Set());
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [isBootstrapping, setBootstrapping] = useState(false);
  const [spotlightStreak, setSpotlightStreak] = useState<Streak | null>(null);
  const [spotlightRect, setSpotlightRect] = useState<StreakRect | null>(null);
  const spotlightAnim = useRef(new Animated.Value(0)).current;
  const spotlightPulse = useRef(new Animated.Value(0)).current;

  // Achievement badges state
  const [badges, setBadges] = useState<EarnedBadges | null>(null);
  const [achievementProgress, setAchievementProgress] = useState<AchievementProgress | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const badgeUnlockAnim = useRef(new Animated.Value(0)).current;
  const { accentColor, setAccentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const gradientFade = useRef(new Animated.Value(0)).current;
  const gradientPalettes = useMemo<GradientPalette[]>(() => (
    [
      [accent, '#140a21', '#050508'],
      ['#1e0f2f', '#09040f', '#050505'],
      ['#291239', '#100620', '#050509'],
    ]
  ), [accent]);
  const [gradientIndex, setGradientIndex] = useState(0);
  const paletteCount = gradientPalettes.length;
  const nextGradientIndex = (gradientIndex + 1) % paletteCount;

  useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  useEffect(() => {
    return onAuthChange((user) => setUid(user?.uid ?? null));
  }, []);

  // Load achievement badges
  useEffect(() => {
    if (!uid) {
      setBadges(null);
      setAchievementProgress(null);
      return;
    }

    const loadAchievements = async () => {
      const [earnedBadges, progress] = await Promise.all([
        getEarnedBadges(uid),
        getAchievementProgress(uid),
      ]);
      setBadges(earnedBadges);
      setAchievementProgress(progress);
    };

    loadAchievements();
  }, [uid]);

  useEffect(() => {
    const interval = setInterval(() => {
      gradientFade.setValue(0);
      Animated.timing(gradientFade, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }).start(() => {
        setGradientIndex((prev) => (prev + 1) % paletteCount);
        gradientFade.setValue(0);
      });
    }, 9000);
    return () => clearInterval(interval);
  }, [gradientFade, paletteCount]);

  const followerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of followers) {
      map[f.id] = f.displayName || 'User';
    }
    return map;
  }, [followers]);

  useEffect(() => {
    if (!uid) {
      setStreaks([]);
      return;
    }

    return onConversationsUpdate(
      (conversations: Conversation[]) => {
        const parsed: Streak[] = (conversations || [])
          .filter((c) => !c.isGroup && !c.isBroadcast)
          .map((c) => {
            const count = Number((c as any)?.streakCount ?? 0) || 0;
            const lastDay = typeof (c as any)?.streakLastDay === 'string' ? (c as any).streakLastDay : '';
            const expiresAtMs = Number((c as any)?.streakExpiresAtMs ?? 0) || 0;
            if (!count || !lastDay) return null;
            if (expiresAtMs > 0 && expiresAtMs <= Date.now()) return null;
            const members: string[] = Array.isArray(c.members) ? (c.members as any) : [];
            const otherId = members.find((m) => m && m !== uid) ?? null;
            const otherName = otherId ? followerNameById[String(otherId)] : '';
            return {
              id: c.id,
              days: count,
              activity: otherName ? `Chat with ${otherName}` : 'Chat streak',
              lastUpdate: lastDay,
              partnerId: otherId ? String(otherId) : null,
              sourceType: 'chat',
            } as Streak;
          })
          .filter((s): s is Streak => !!s)
          .sort((a, b) => {
            const aDate = a.lastUpdate || '';
            const bDate = b.lastUpdate || '';
            if (aDate !== bDate) return bDate.localeCompare(aDate);
            return (b.days || 0) - (a.days || 0);
          });

        setStreaks(parsed);
      },
      { uid },
    );
  }, [uid, followerNameById]);

  useEffect(() => {
    const loadFollowers = async () => {
      try {
        const list = await getFollowing();
        setFollowers(list);
      } catch (err) {
        console.error('Failed to load followers for streaks', err);
      }
    };

    void loadFollowers();
  }, []);

  const handleOpenStreak = (streak: Streak) => {
    if (streak.sourceType === 'chat') {
      router.push({
        pathname: '/messaging/chat/[id]',
        params: { id: streak.id, fromStreak: '1' },
      });
      return;
    }

    if (streak.sourceType === 'story' && streak.partnerId) {
      router.push('/social-feed/stories');
      return;
    }
  };

  const openStreakSpotlight = (streak: Streak, rect: StreakRect) => {
    setSpotlightStreak(streak);
    setSpotlightRect(rect);
    spotlightAnim.setValue(0);
    Animated.spring(spotlightAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
    // Start pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(spotlightPulse, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(spotlightPulse, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const closeStreakSpotlight = () => {
    Animated.timing(spotlightAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setSpotlightStreak(null);
      setSpotlightRect(null);
      spotlightPulse.stopAnimation();
    });
  };

  const toggleFollowerSelection = (id: string) => {
    setSelectedFollowerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleStartStreaks = async () => {
    if (selectedFollowerIds.size === 0 || isBootstrapping) {
      setPickerVisible(false);
      return;
    }
    setBootstrapping(true);
    try {
      const selected = followers.filter(f => selectedFollowerIds.has(f.id));
      let firstConversationId: string | null = null;

      for (const person of selected) {
        try {
          const conversationId = await findOrCreateConversation(person);
          if (!firstConversationId) {
            firstConversationId = conversationId;
          }
        } catch (err) {
          console.error('Failed to start streak with', person.id, err);
        }
      }

      if (firstConversationId) {
        router.push({
          pathname: '/messaging/chat/[id]',
          params: { id: firstConversationId, fromStreak: '1' },
        });
      }

      setSelectedFollowerIds(new Set());
    } finally {
      setBootstrapping(false);
      setPickerVisible(false);
    }
  };

  const renderStreak = ({ item }: { item: Streak }) => (
    <StreakRow item={item} onPress={handleOpenStreak} onLongPress={openStreakSpotlight} />
  );

  const handleBadgePress = (badge: Badge) => {
    setSelectedBadge(badge);
    setShowBadgeModal(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const getBadgeProgress = (badgeId: BadgeId): BadgeProgress => {
    return badges?.earnedBadges[badgeId] || { progress: 0, currentValue: 0 };
  };

  const xpInfo = xpForNextLevel(badges?.totalXP || 0);
  const level = badges?.level || 1;

  return (
    <ScreenWrapper>
      <View style={styles.background} pointerEvents="none">
        <LinearGradient
          colors={gradientPalettes[gradientIndex]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientLayer}
        />
        <Animated.View pointerEvents="none" style={[styles.gradientLayer, { opacity: gradientFade }]}>
          <LinearGradient
            colors={gradientPalettes[nextGradientIndex]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientLayer}
          />
        </Animated.View>
        <LinearGradient
          colors={['rgba(125,216,255,0.18)', 'rgba(255,255,255,0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.bgOrbPrimary}
        />
        <LinearGradient
          colors={['rgba(95,132,255,0.14)', 'rgba(255,255,255,0)']}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={styles.bgOrbSecondary}
        />
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Your Streaks</Text>
        <TouchableOpacity
          style={styles.startButton}
          activeOpacity={0.85}
          onPress={() => setPickerVisible(true)}
        >
          <Text style={styles.startButtonText}>Start streaks</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={streaks}
        renderItem={renderStreak}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.list}
        ListFooterComponent={
          <>
            {/* Achievements Section */}
            <View style={styles.achievementsSection}>
              <View style={styles.achievementsHeader}>
                <Text style={styles.achievementsTitle}>🏆 Achievements</Text>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelText}>Level {level}</Text>
                </View>
              </View>

              {/* XP Progress Bar */}
              <View style={styles.xpContainer}>
                <View style={styles.xpBarBg}>
                  <View style={[styles.xpBarFill, { width: `${(xpInfo.current / xpInfo.needed) * 100}%` }]} />
                </View>
                <Text style={styles.xpText}>{badges?.totalXP || 0} XP</Text>
              </View>

              {/* Badge Grid */}
              <View style={styles.badgeGrid}>
                {BADGES.map((badge) => {
                  const progress = getBadgeProgress(badge.id);
                  const isEarned = !!progress.earnedAt;

                  return (
                    <TouchableOpacity
                      key={badge.id}
                      style={[
                        styles.badgeCard,
                        isEarned && styles.badgeCardEarned,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => handleBadgePress(badge)}
                    >
                      <View style={styles.badgeIconWrap}>
                        <Text style={[
                          styles.badgeIcon,
                          !isEarned && styles.badgeIconLocked,
                        ]}>
                          {badge.icon}
                        </Text>
                        {isEarned && (
                          <View style={styles.badgeCheckmark}>
                            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                          </View>
                        )}
                      </View>
                      <Text style={[
                        styles.badgeName,
                        !isEarned && styles.badgeNameLocked,
                      ]} numberOfLines={1}>
                        {badge.name}
                      </Text>
                      {!isEarned && (
                        <View style={styles.badgeProgressBar}>
                          <View style={[styles.badgeProgressFill, { width: `${progress.progress}%` }]} />
                        </View>
                      )}
                      {isEarned && (
                        <Text style={styles.badgeXp}>+{badge.xp} XP</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        }
      />

      <Modal
        transparent
        visible={showBadgeModal}
        animationType="fade"
        onRequestClose={() => setShowBadgeModal(false)}
      >
        <View style={styles.badgeModalOverlay}>
          <TouchableOpacity
            style={styles.badgeModalBackdrop}
            activeOpacity={1}
            onPress={() => setShowBadgeModal(false)}
          />
          {selectedBadge && (
            <View style={styles.badgeModalCard}>
              <View style={styles.badgeModalIconWrap}>
                <Text style={styles.badgeModalIcon}>{selectedBadge.icon}</Text>
              </View>
              <Text style={styles.badgeModalTitle}>{selectedBadge.name}</Text>
              <Text style={styles.badgeModalDesc}>{selectedBadge.description}</Text>

              <View style={styles.badgeModalStats}>
                <View style={styles.badgeModalStatItem}>
                  <Text style={styles.badgeModalStatLabel}>XP Value</Text>
                  <Text style={styles.badgeModalStatValue}>+{selectedBadge.xp}</Text>
                </View>
                <View style={styles.badgeModalDivider} />
                <View style={styles.badgeModalStatItem}>
                  <Text style={styles.badgeModalStatLabel}>Status</Text>
                  {(() => {
                    const progress = getBadgeProgress(selectedBadge.id);
                    const isEarned = !!progress.earnedAt;
                    return (
                      <Text style={[
                        styles.badgeModalStatValue,
                        isEarned ? { color: '#4CAF50' } : { color: 'rgba(255,255,255,0.6)' }
                      ]}>
                        {isEarned ? 'Unlocked' : `${progress.currentValue}/${selectedBadge.requirement}`}
                      </Text>
                    );
                  })()}
                </View>
              </View>

              <TouchableOpacity
                style={styles.badgeModalCloseBtn}
                onPress={() => setShowBadgeModal(false)}
              >
                <Text style={styles.badgeModalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      <Modal
        transparent
        visible={isPickerVisible}
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setPickerVisible(false)}
          />
          <SafeAreaView style={styles.sheetContainer}>
            <Text style={styles.sheetTitle}>Start streak with</Text>
            <FlatList
              data={followers}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              contentContainerStyle={styles.sheetList}
              renderItem={({ item }) => {
                const selected = selectedFollowerIds.has(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.followerRow, selected && styles.followerRowSelected]}
                    activeOpacity={0.85}
                    onPress={() => toggleFollowerSelection(item.id)}
                  >
                    <View style={styles.followerAvatar} />
                    <View style={styles.followerInfo}>
                      <Text style={styles.followerName}>
                        {item.displayName || 'User'}
                      </Text>
                    </View>
                    <View style={[styles.checkbox, selected && styles.checkboxSelected]} />
                  </TouchableOpacity>
                );
              }}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.sheetButton, styles.sheetButtonSecondary]}
                onPress={() => setPickerVisible(false)}
              >
                <Text style={styles.sheetButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetButton, styles.sheetButtonPrimary]}
                onPress={handleStartStreaks}
                disabled={isBootstrapping}
              >
                <Text style={styles.sheetButtonPrimaryText}>
                  {isBootstrapping ? 'Starting…' : 'Start streak'}
                </Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {spotlightStreak && spotlightRect && (
        <View style={styles.spotlightOverlay} pointerEvents="box-none">
          {/* Animated blur backdrop */}
          <Animated.View
            style={[
              styles.spotlightBackdropContainer,
              { opacity: spotlightAnim },
            ]}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={closeStreakSpotlight}
            >
              {Platform.OS === 'ios' ? (
                <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
              ) : (
                <View style={styles.spotlightBackdropAndroid} />
              )}
              {/* Animated gradient orbs */}
              <Animated.View
                style={[
                  styles.spotlightOrb1,
                  {
                    opacity: spotlightPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 0.7],
                    }),
                    transform: [
                      {
                        scale: spotlightPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.2],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <LinearGradient
                  colors={['#ff4b4b', '#ff8080', 'transparent']}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                />
              </Animated.View>
              <Animated.View
                style={[
                  styles.spotlightOrb2,
                  {
                    opacity: spotlightPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 0.3],
                    }),
                    transform: [
                      {
                        scale: spotlightPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1.1, 0.9],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <LinearGradient
                  colors={['#ffa726', '#ff7043', 'transparent']}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                />
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>

          {/* Spotlight card */}
          <Animated.View
            style={[
              styles.spotlightRowContainer,
              {
                top: spotlightRect.y,
                opacity: spotlightAnim,
                transform: [
                  {
                    scale: spotlightAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.95, 1],
                    }),
                  },
                  {
                    translateY: spotlightAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.spotlightCardOuter}>
              <LinearGradient
                colors={['#ff4b4b', '#ff6b6b', '#ff8080']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.spotlightCard}
              >
                {/* Fire icon with glow */}
                <View style={styles.spotlightFireWrap}>
                  <Animated.View
                    style={[
                      styles.spotlightFireGlow,
                      {
                        opacity: spotlightPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 1],
                        }),
                        transform: [
                          {
                            scale: spotlightPulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 1.3],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                  <Text style={styles.spotlightFireIcon}>🔥</Text>
                </View>

                <View style={styles.spotlightCardContent}>
                  <Text style={styles.spotlightDays}>{spotlightStreak.days}</Text>
                  <Text style={styles.spotlightDaysLabel}>day streak</Text>
                  <Text style={styles.spotlightTitle}>{spotlightStreak.activity}</Text>
                  <Text style={styles.spotlightSubtitle}>Last active {spotlightStreak.lastUpdate}</Text>
                </View>

                {/* Decorative sparkles */}
                <View style={styles.spotlightSparkle1}>
                  <Ionicons name="sparkles" size={14} color="rgba(255,255,255,0.6)" />
                </View>
                <View style={styles.spotlightSparkle2}>
                  <Ionicons name="sparkles" size={10} color="rgba(255,255,255,0.4)" />
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Action buttons */}
          <Animated.View
            style={[
              styles.spotlightContent,
              {
                top: spotlightRect.y + 140,
                opacity: spotlightAnim,
                transform: [
                  {
                    translateY: spotlightAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.spotlightActionsCard}>
              {Platform.OS === 'ios' && (
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
              )}
              <View style={styles.spotlightActionsRow}>
                <TouchableOpacity
                  style={styles.spotlightActionBtn}
                  onPress={() => {
                    handleOpenStreak(spotlightStreak);
                    closeStreakSpotlight();
                  }}
                >
                  <View style={[styles.spotlightActionIcon, { backgroundColor: 'rgba(255,75,75,0.2)' }]}>
                    <Ionicons name="chatbubble" size={18} color="#ff4b4b" />
                  </View>
                  <Text style={styles.spotlightActionText}>Open chat</Text>
                </TouchableOpacity>

                <View style={styles.spotlightActionDivider} />

                <TouchableOpacity
                  style={styles.spotlightActionBtn}
                  onPress={closeStreakSpotlight}
                >
                  <View style={[styles.spotlightActionIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                    <Ionicons name="close" size={18} color="#fff" />
                  </View>
                  <Text style={styles.spotlightActionText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </View>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    top: -80,
    left: -50,
    opacity: 0.55,
    transform: [{ rotate: '14deg' }],
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    bottom: -100,
    right: -20,
    opacity: 0.42,
    transform: [{ rotate: '-12deg' }],
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  startButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  streakCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  streakContent: {
    alignItems: 'center',
    marginRight: 16,
  },
  streakDays: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  streakLabel: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
  },
  streakInfo: {
    flex: 1,
  },
  streakTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streakActivity: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  streakTag: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  streakUpdate: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    backgroundColor: '#05060f',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  sheetList: {
    paddingBottom: 12,
  },
  followerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  followerRowSelected: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  followerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginRight: 10,
  },
  followerInfo: {
    flex: 1,
  },
  followerName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  checkboxSelected: {
    backgroundColor: '#e50914',
    borderColor: '#e50914',
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  sheetButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginLeft: 8,
  },
  sheetButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  sheetButtonSecondaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  sheetButtonPrimary: {
    backgroundColor: '#e50914',
  },
  sheetButtonPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  spotlightOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  spotlightBackdropContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlightBackdropAndroid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  spotlightOrb1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: '20%',
    left: -50,
    overflow: 'hidden',
  },
  spotlightOrb2: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    bottom: '25%',
    right: -30,
    overflow: 'hidden',
  },
  spotlightContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  spotlightRowContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  spotlightCardOuter: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#ff4b4b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  spotlightCard: {
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
  },
  spotlightFireWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  spotlightFireGlow: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,150,50,0.5)',
  },
  spotlightFireIcon: {
    fontSize: 36,
  },
  spotlightCardContent: {
    alignItems: 'center',
  },
  spotlightDays: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  spotlightDaysLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: -4,
    marginBottom: 8,
  },
  spotlightTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  spotlightSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
  },
  spotlightSparkle1: {
    position: 'absolute',
    top: 16,
    right: 20,
  },
  spotlightSparkle2: {
    position: 'absolute',
    bottom: 20,
    left: 24,
  },
  spotlightActionsCard: {
    backgroundColor: Platform.OS === 'android' ? 'rgba(20,20,30,0.95)' : 'rgba(20,20,30,0.7)',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  spotlightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  spotlightActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  spotlightActionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotlightActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  spotlightActionDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  // Achievement badge styles
  achievementsSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  achievementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  achievementsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  levelBadge: {
    backgroundColor: 'rgba(229,9,20,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e50914',
  },
  levelText: {
    color: '#e50914',
    fontSize: 13,
    fontWeight: '700',
  },
  xpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  xpBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: '#e50914',
    borderRadius: 4,
  },
  xpText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 50,
    textAlign: 'right',
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeCard: {
    width: (Dimensions.get('window').width - 32 - 24) / 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  badgeCardEarned: {
    backgroundColor: 'rgba(229,9,20,0.1)',
    borderColor: 'rgba(229,9,20,0.3)',
  },
  badgeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  badgeIcon: {
    fontSize: 28,
  },
  badgeIconLocked: {
    opacity: 0.4,
  },
  badgeCheckmark: {
    position: 'absolute',
    bottom: -2,
    right: -2,
  },
  badgeName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeNameLocked: {
    color: 'rgba(255,255,255,0.5)',
  },
  badgeProgressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  badgeProgressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
  },
  badgeXp: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4CAF50',
  },
  // Badge Modal Styles
  badgeModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  badgeModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  badgeModalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1a1a24',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  badgeModalIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  badgeModalIcon: {
    fontSize: 40,
  },
  badgeModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  badgeModalDesc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  badgeModalStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  badgeModalStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  badgeModalStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  badgeModalStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  badgeModalDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  badgeModalCloseBtn: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    alignItems: 'center',
  },
  badgeModalCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
