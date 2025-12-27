import { getAllStreaks, updateStreakForContext } from '@/lib/streaks/streakManager';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    FlatList,
    Modal,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import ScreenWrapper from '../../../../components/ScreenWrapper';
import { findOrCreateConversation, getFollowing, Profile } from '../../../messaging/controller';
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
  const [followers, setFollowers] = useState<Profile[]>([]);
  const [selectedFollowerIds, setSelectedFollowerIds] = useState<Set<string>>(new Set());
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [isBootstrapping, setBootstrapping] = useState(false);
  const [spotlightStreak, setSpotlightStreak] = useState<Streak | null>(null);
  const [spotlightRect, setSpotlightRect] = useState<StreakRect | null>(null);
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

  const loadStreaks = useCallback(async () => {
    try {
      const entries = await getAllStreaks();
      const parsed: Streak[] = entries
        .map(([key, value]) => {
          if (!value) return null;
          try {
            const data = JSON.parse(value) as {
              count?: number;
              lastDate?: string;
              partnerName?: string;
              partnerId?: string;
              type?: string;
            };
            const id = key;
            const sourceType = data.type ?? 'chat';
            let activityLabel = '';
            if (sourceType === 'chat') {
              activityLabel = data.partnerName ? `Chat with ${data.partnerName}` : 'Chat streak';
            } else if (sourceType === 'story') {
              activityLabel = data.partnerName ? `Stories by ${data.partnerName}` : 'Posted stories';
            } else {
              activityLabel = 'Feed activity';
            }

            return {
              id,
              days: data.count ?? 0,
              activity: activityLabel,
              lastUpdate: data.lastDate || 'Unknown',
              partnerId: data.partnerId ?? null,
              sourceType,
            } as Streak;
          } catch {
            return null;
          }
        })
        .filter((s): s is Streak => !!s)
        .sort((a, b) => {
          // Chat streaks first
          const aIsChat = a.sourceType === 'chat';
          const bIsChat = b.sourceType === 'chat';
          if (aIsChat && !bIsChat) return -1;
          if (!aIsChat && bIsChat) return 1;

          // Newest last update first (YYYY-MM-DD)
          const aDate = a.lastUpdate || '';
          const bDate = b.lastUpdate || '';
          if (aDate !== bDate) {
            return bDate.localeCompare(aDate);
          }

          // Fallback by days
          return (b.days || 0) - (a.days || 0);
        });

      setStreaks(parsed);
    } catch (err) {
      console.error('Failed to load streaks', err);
      setStreaks([]);
    }
  }, []);

  useEffect(() => {
    void loadStreaks();
  }, [loadStreaks]);

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
      const parts = streak.id.split(':');
      const conversationId = parts.length >= 3 ? parts[2] : null;
      if (conversationId) {
        router.push({
          pathname: '/messaging/chat/[id]',
          params: { id: conversationId, fromStreak: '1' },
        });
      }
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
  };

  const closeStreakSpotlight = () => {
    setSpotlightStreak(null);
    setSpotlightRect(null);
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
          await updateStreakForContext({
            kind: 'chat',
            conversationId,
            partnerId: person.id,
            partnerName: person.displayName ?? null,
          });
        } catch (err) {
          console.error('Failed to start streak with', person.id, err);
        }
      }

      await loadStreaks();

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
      />

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
          <TouchableOpacity
            style={styles.spotlightTouch}
            activeOpacity={1}
            onPress={closeStreakSpotlight}
          >
            <View style={styles.spotlightBackdrop} />
          </TouchableOpacity>

          <View
            style={[
              styles.spotlightRowContainer,
              { top: spotlightRect.y + 24 },
            ]}
          >
            <LinearGradient
              colors={['#ff4b4b', '#ff8080']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.spotlightCard}
            >
              <Text style={styles.spotlightTitle}>
                {spotlightStreak.activity}
              </Text>
              <Text style={styles.spotlightSubtitle}>
                {spotlightStreak.days} day streak · Last {spotlightStreak.lastUpdate}
              </Text>
            </LinearGradient>
          </View>

          <View
            style={[
              styles.spotlightContent,
              { top: spotlightRect.y + spotlightRect.height + 32 },
            ]}
          >
            <View style={styles.spotlightActionsRow}>
              <TouchableOpacity
                style={styles.spotlightPill}
                onPress={() => {
                  handleOpenStreak(spotlightStreak);
                  closeStreakSpotlight();
                }}
              >
                <Text style={styles.spotlightPillText}>Open chat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.spotlightPill, styles.spotlightPillSecondary]}
                onPress={closeStreakSpotlight}
              >
                <Text style={styles.spotlightPillSecondaryText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  spotlightTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlightBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  spotlightContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  spotlightCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  spotlightTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  spotlightSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
  },
  spotlightActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  spotlightRowContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  spotlightActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  spotlightPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  spotlightPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  spotlightPillSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  spotlightPillSecondaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
});
