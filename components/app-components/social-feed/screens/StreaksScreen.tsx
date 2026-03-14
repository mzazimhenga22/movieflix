import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
  View,
  StatusBar,
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
  onAuthChange,
  onConversationsUpdate,
  Profile,
  getFollowing,
  findOrCreateConversation,
} from '@/app/messaging/controller';
import { useAccent } from '../../AccentContext';
import LiquidGlass from '../../LiquidGlass';

const { width } = Dimensions.get('window');

interface Streak {
  id: string;
  days: number;
  activity: string;
  lastUpdate: string;
  partnerId?: string | null;
  sourceType?: string;
}

export default function StreaksScreen() {
  const router = useRouter();
  const { accentColor, setAccentColor } = useAccent();
  const accent = accentColor || '#ff4b4b';
  
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [followers, setFollowers] = useState<Profile[]>([]);
  const [badges, setBadges] = useState<EarnedBadges | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  
  const scrollY = useRef(new Animated.Value(0)).current;
  
  // Cinematic animations
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const flamePulse = useRef(new Animated.Value(1)).current;
  const headerScale = useRef(new Animated.Value(0.9)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const orbRotate = useRef(new Animated.Value(0)).current;
  
  // Fire particles
  const fireParticles = useRef(
    Array.from({ length: 8 }, (_, i) => ({
      y: new Animated.Value(100 + Math.random() * 50),
      x: new Animated.Value(Math.random() * 100),
      scale: new Animated.Value(0.5 + Math.random() * 0.5),
      opacity: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    setAccentColor('#ff4b4b');
    
    // Entrance animation
    Animated.parallel([
      Animated.spring(headerScale, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.timing(headerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    
    // Flame pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(flamePulse, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(flamePulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
    
    // Holographic shimmer
    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 3000, useNativeDriver: true })
    ).start();
    
    // Orb rotation
    Animated.loop(
      Animated.timing(orbRotate, { toValue: 1, duration: 10000, useNativeDriver: true })
    ).start();
    
    // Fire particles
    fireParticles.forEach((particle, i) => {
      const animateParticle = () => {
        particle.y.setValue(120);
        particle.opacity.setValue(0);
        particle.x.setValue(10 + Math.random() * 80);
        
        Animated.parallel([
          Animated.timing(particle.y, { toValue: -20, duration: 3000 + Math.random() * 2000, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(particle.opacity, { toValue: 0.8, duration: 300, useNativeDriver: true }),
            Animated.timing(particle.opacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
          ]),
        ]).start(() => animateParticle());
      };
      
      setTimeout(animateParticle, i * 400);
    });
    
    return onAuthChange((user) => setUid(user?.uid ?? null));
  }, [setAccentColor]);

  useEffect(() => {
    if (!uid) return;
    const loadData = async () => {
      const [earned, list] = await Promise.all([getEarnedBadges(uid), getFollowing()]);
      setBadges(earned);
      setFollowers(list);
    };
    loadData();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return onConversationsUpdate((convs) => {
      const parsed = (convs || []).filter(c => !c.isGroup).map(c => {
        const count = (c as any).streakCount || 0;
        if (!count) return null;
        return {
          id: c.id,
          days: count,
          activity: `Chat streak`,
          lastUpdate: (c as any).streakLastDay || '',
          sourceType: 'chat'
        };
      }).filter(s => !!s) as Streak[];
      setStreaks(parsed.sort((a, b) => b.days - a.days));
    }, { uid });
  }, [uid]);

  const xpInfo = xpForNextLevel(badges?.totalXP || 0);
  const level = badges?.level || 1;

  const renderStreak = ({ item, index }: { item: Streak; index: number }) => (
    <Animated.View 
      style={[
        styles.streakWrapper,
        {
          opacity: headerOpacity,
          transform: [{
            translateY: headerOpacity.interpolate({ inputRange: [0, 1], outputRange: [15, 0] })
          }]
        }
      ]}
    >
      <LiquidGlass 
        cornerRadius={24} 
        tintOpacity={0.12} 
        tintColor="#ff4b4b"
        glowColor="#ff4b4b"
        glowIntensity={0.35}
        borderOpacity={0.35}
        chromaticAberration
        breathingEffect
        interactive
        style={styles.streakGlass}
      >
        <TouchableOpacity 
          style={styles.streakContent} 
          activeOpacity={0.85}
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          }}
        >
          <View style={styles.streakLeading}>
            <Animated.Text 
              style={[
                styles.streakDays,
                { transform: [{ scale: flamePulse }] }
              ]}
            >
              {item.days}
            </Animated.Text>
            <Animated.View style={{ transform: [{ scale: flamePulse }] }}>
              <Ionicons name="flame" size={28} color="#ff4b4b" />
            </Animated.View>
          </View>
          
          <View style={styles.streakInfo}>
            <Text style={styles.streakTitle}>{item.activity}</Text>
            <Text style={styles.streakSubtitle}>Keep it going! • {item.lastUpdate}</Text>
            
            {/* Streak bar */}
            <View style={styles.streakBarBg}>
              <Animated.View 
                style={[
                  styles.streakBarFill,
                  { 
                    width: `${Math.min(item.days / 30 * 100, 100)}%`,
                    backgroundColor: '#ff4b4b',
                  }
                ]} 
              />
            </View>
          </View>
          
          <LiquidGlass
            cornerRadius={14}
            tintOpacity={0.2}
            tintColor="#ff4b4b"
            glowColor="#ff6b35"
            glowIntensity={0.4}
            interactive
            style={styles.streakActionGlass}
          >
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </LiquidGlass>
        </TouchableOpacity>
      </LiquidGlass>
    </Animated.View>
  );

  return (
    <View style={styles.root}>
      <ScreenWrapper>
        <StatusBar barStyle="light-content" />
        
        {/* Cinematic Fire Background */}
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient colors={['#1a0a10', '#0a0508', '#050508']} style={StyleSheet.absoluteFill} />
          
          {/* Fire particles */}
          {fireParticles.map((particle, i) => (
            <Animated.View
              key={`fire-${i}`}
              pointerEvents="none"
              style={[
                styles.fireParticle,
                {
                  left: particle.x.interpolate({ inputRange: [0, 100], outputRange: [0, width] }),
                  top: particle.y,
                  opacity: particle.opacity,
                  transform: [{ scale: particle.scale }],
                  backgroundColor: i % 3 === 0 ? '#ff4b4b' : i % 3 === 1 ? '#ff6b35' : '#ffd700',
                  shadowColor: i % 3 === 0 ? '#ff4b4b' : i % 3 === 1 ? '#ff6b35' : '#ffd700',
                },
              ]}
            />
          ))}
          
          {/* Rotating orb */}
          <Animated.View 
            style={[
              styles.rotatingOrb,
              { transform: [{ rotate: orbRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }
            ]}
          >
            <LinearGradient
              colors={['#ff4b4b', '#ff6b35', '#ffd700']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          
          {/* Prismatic shimmer */}
          <Animated.View 
            style={[
              styles.prismaticShimmer,
              {
                opacity: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.1, 0.2, 0.1] }),
                transform: [{ translateX: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-300, 300] }) }],
              }
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,75,75,0.15)', 'rgba(255,215,0,0.1)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        <FlatList
          data={streaks}
          renderItem={renderStreak}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Animated.View style={[styles.header, { opacity: headerOpacity, transform: [{ scale: headerScale }] }]}>
              <View style={styles.headerRow}>
                <Animated.View style={{ transform: [{ scale: flamePulse }] }}>
                  <LiquidGlass 
                    cornerRadius={22} 
                    tintOpacity={0.2}
                    tintColor="#ff4b4b"
                    glowColor="#ff6b35"
                    glowIntensity={0.5}
                    breathingEffect
                    style={styles.headerIconGlass}
                  >
                    <Ionicons name="flame" size={28} color="#ff4b4b" />
                  </LiquidGlass>
                </Animated.View>
                <View>
                  <Text style={styles.eyebrow}>STREAKS</Text>
                  <Text style={styles.title}>Your Fire</Text>
                </View>
                <LiquidGlass cornerRadius={14} tintOpacity={0.15} tintColor="#ff4b4b" glowColor="#ff6b35" glowIntensity={0.3} style={styles.levelGlass}>
                  <Text style={styles.levelText}>Lvl {level}</Text>
                </LiquidGlass>
              </View>
              
              {/* XP Progress - Holographic */}
              <View style={styles.xpSection}>
                <View style={styles.xpHeader}>
                  <Text style={styles.xpLabel}>Experience</Text>
                  <Text style={styles.xpValue}>{badges?.totalXP || 0} XP</Text>
                </View>
                <LiquidGlass
                  cornerRadius={6}
                  tintOpacity={0.1}
                  style={styles.progressBarContainer}
                >
                  <View style={styles.progressBarBg}>
                    <Animated.View 
                      style={[
                        styles.progressBarFill,
                        { width: `${(xpInfo.current / xpInfo.needed) * 100}%` }
                      ]} 
                    />
                    {/* Glow effect */}
                    <Animated.View 
                      style={[
                        styles.progressBarGlow,
                        { 
                          width: `${(xpInfo.current / xpInfo.needed) * 100}%`,
                          opacity: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.6, 0.3] }),
                        }
                      ]}
                    />
                  </View>
                </LiquidGlass>
              </View>
            </Animated.View>
          }
          ListFooterComponent={
            <Animated.View style={[styles.achievementsWrap, { opacity: headerOpacity }]}>
              <Text style={styles.sectionTitle}>Achievements</Text>
              <View style={styles.badgeGrid}>
                {BADGES.map(badge => {
                  const progress = badges?.earnedBadges[badge.id] || { progress: 0 };
                  const isEarned = !!progress.earnedAt;
                  return (
                    <TouchableOpacity 
                      key={badge.id} 
                      style={styles.badgeItem}
                      onPress={() => {
                        setSelectedBadge(badge);
                        setShowBadgeModal(true);
                        if (Platform.OS !== 'web') {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                      }}
                    >
                      <LiquidGlass 
                        cornerRadius={20} 
                        tintOpacity={isEarned ? 0.18 : 0.05} 
                        tintColor={isEarned ? '#ffd700' : '#000'}
                        glowColor={isEarned ? '#ffd700' : 'transparent'}
                        glowIntensity={isEarned ? 0.5 : 0}
                        borderOpacity={isEarned ? 0.4 : 0.15}
                        chromaticAberration={isEarned}
                        breathingEffect={isEarned}
                        interactive={isEarned}
                        style={styles.badgeGlass}
                      >
                        <Text style={[styles.badgeIcon, !isEarned && { opacity: 0.3 }]}>{badge.icon}</Text>
                        <Text style={[styles.badgeName, !isEarned && { color: 'rgba(255,255,255,0.3)' }]} numberOfLines={1}>{badge.name}</Text>
                        {isEarned && (
                          <Animated.View 
                            style={[
                              styles.earnedDot,
                              { transform: [{ scale: flamePulse }] }
                            ]} 
                          />
                        )}
                      </LiquidGlass>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated.View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <LiquidGlass
                cornerRadius={40}
                tintOpacity={0.1}
                style={styles.emptyIconGlass}
              >
                <MaterialCommunityIcons name="fire-off" size={48} color="rgba(255,255,255,0.3)" />
              </LiquidGlass>
              <Text style={styles.emptyText}>No active streaks</Text>
              <TouchableOpacity 
                style={styles.startBtn} 
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                  router.push('/messaging');
                }}
              >
                <LiquidGlass 
                  cornerRadius={18} 
                  tintOpacity={0.2} 
                  tintColor="#ff4b4b" 
                  glowColor="#ff6b35"
                  glowIntensity={0.4}
                  chromaticAberration
                  interactive
                  style={styles.startGlass}
                >
                  <Ionicons name="chatbubble" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.startBtnText}>Start a conversation</Text>
                </LiquidGlass>
              </TouchableOpacity>
            </View>
          }
        />

        <Modal transparent visible={showBadgeModal} animationType="fade">
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowBadgeModal(false)} />
            {selectedBadge && (
              <LiquidGlass 
                cornerRadius={32} 
                tintOpacity={0.95} 
                tintColor="#1a1418"
                glowColor="#ffd700"
                glowIntensity={0.3}
                borderOpacity={0.35}
                chromaticAberration
                style={styles.modalCard}
              >
                <Animated.Text 
                  style={[
                    styles.modalIcon,
                    { transform: [{ scale: flamePulse }] }
                  ]}
                >
                  {selectedBadge.icon}
                </Animated.Text>
                <Text style={styles.modalTitle}>{selectedBadge.name}</Text>
                <Text style={styles.modalDesc}>{selectedBadge.description}</Text>
                <TouchableOpacity 
                  style={styles.closeBtn} 
                  onPress={() => {
                    setShowBadgeModal(false);
                    if (Platform.OS !== 'web') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                >
                  <LiquidGlass
                    cornerRadius={16}
                    tintOpacity={0.2}
                    interactive
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={styles.closeText}>Close</Text>
                </TouchableOpacity>
              </LiquidGlass>
            )}
          </View>
        </Modal>
      </ScreenWrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050508' },
  
  // Fire particles
  fireParticle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  
  // Rotating orb
  rotatingOrb: {
    position: 'absolute',
    top: -150,
    left: width / 2 - 150,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.15,
  },
  
  // Prismatic shimmer
  prismaticShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 250,
    overflow: 'hidden',
  },
  
  header: { paddingHorizontal: 20, paddingTop: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerIconGlass: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  title: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -0.5, flex: 1 },
  levelGlass: { paddingHorizontal: 14, paddingVertical: 8 },
  levelText: { color: '#ff4b4b', fontWeight: '900', fontSize: 14 },
  xpSection: { marginTop: 20 },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  xpLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  xpValue: { color: '#fff', fontSize: 15, fontWeight: '900' },
  progressBarContainer: { height: 10, borderRadius: 5, overflow: 'hidden' },
  progressBarBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden', margin: 1 },
  progressBarFill: { height: '100%', backgroundColor: '#ff4b4b', borderRadius: 4 },
  progressBarGlow: { position: 'absolute', height: '100%', backgroundColor: '#ff6b35', borderRadius: 4 },
  list: { paddingBottom: 120 },
  streakWrapper: { paddingHorizontal: 16, marginTop: 16 },
  streakGlass: { borderRadius: 24, overflow: 'hidden' },
  streakContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  streakLeading: { alignItems: 'center', minWidth: 60, flexDirection: 'row', gap: 8 },
  streakDays: { fontSize: 30, fontWeight: '900', color: '#fff' },
  streakInfo: { flex: 1, marginLeft: 16 },
  streakTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  streakSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4, fontWeight: '600' },
  streakBarBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  streakActionGlass: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  achievementsWrap: { paddingHorizontal: 20, marginTop: 30 },
  sectionTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 18 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badgeItem: { width: (width - 40 - 24) / 3 },
  badgeGlass: { height: 100, alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 20 },
  badgeIcon: { fontSize: 32, marginBottom: 8 },
  badgeName: { color: '#fff', fontSize: 11, fontWeight: '800', textAlign: 'center' },
  earnedDot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: '#ffd700', shadowColor: '#ffd700', shadowOpacity: 0.6, shadowRadius: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyIconGlass: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  startBtn: { marginTop: 24, height: 52, width: 220 },
  startGlass: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 40 },
  modalCard: { width: '100%', padding: 32, alignItems: 'center', overflow: 'hidden' },
  modalIcon: { fontSize: 72, marginBottom: 20 },
  modalTitle: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  modalDesc: { color: 'rgba(255,255,255,0.6)', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  closeBtn: { width: '100%', height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, overflow: 'hidden' },
  closeText: { color: '#fff', fontWeight: '800', fontSize: 16, zIndex: 1 },
});
