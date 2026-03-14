import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import ScreenWrapper from '../../../../components/ScreenWrapper';
import { API_BASE_URL, API_KEY, IMAGE_BASE_URL } from '../../../../constants/api';
import { firestore } from '../../../../constants/firebase';
import { useUser } from '../../../../hooks/use-user';
import {
  NOTIFICATION_BADGE_STORAGE_PREFIX,
  NOTIFICATION_READ_STATE_PREFIX,
} from '../../../../constants/notifications';
import LiquidGlass from '../../LiquidGlass';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAccent } from '../../AccentContext';

type KnownNotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'streak' | 'new_release' | 'new_post' | 'new_story';
type NotificationType = KnownNotificationType | (string & {});
type NotificationScope = 'social' | 'system' | 'content';
type NotificationFilter = 'all' | 'drops' | 'social';

interface Notification {
  id: string;
  type: NotificationType;
  scope: NotificationScope;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  thumbnail?: string;
  metadata?: {
    releaseDate?: string;
    releaseTimestamp?: number;
    voteAverage?: number;
    mediaId?: number;
    mediaType?: 'movie' | 'tv';
    docPath?: string;
    actorId?: string;
    targetId?: string;
    targetType?: string;
    targetRoute?: string;
  };
}

const notificationTypeMeta: Record<KnownNotificationType, { label: string; accent: string; icon: any }> = {
  like: { label: 'Social', accent: '#ffb347', icon: 'heart' },
  comment: { label: 'Social', accent: '#ffb347', icon: 'chatbubble' },
  follow: { label: 'Social', accent: '#5f8afc', icon: 'person-add' },
  mention: { label: 'Social', accent: '#a689ff', icon: 'at' },
  streak: { label: 'Streak', accent: '#ff6ec7', icon: 'flame' },
  new_release: { label: 'Premiere', accent: '#5dd39e', icon: 'film' },
  new_post: { label: 'Social', accent: '#ffb347', icon: 'paper-plane' },
  new_story: { label: 'Social', accent: '#ffb347', icon: 'camera' },
};

const KNOWN_NOTIFICATION_TYPES: KnownNotificationType[] = [
  'like', 'comment', 'follow', 'mention', 'streak', 'new_release', 'new_post', 'new_story',
];

const isKnownNotificationType = (value: NotificationType): value is KnownNotificationType =>
  KNOWN_NOTIFICATION_TYPES.includes(value as KnownNotificationType);

const FILTER_TABS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drops', label: 'Movies' },
  { key: 'social', label: 'Social' },
];

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  
  const [releaseNotifications, setReleaseNotifications] = useState<Notification[]>([]);
  const [socialNotifications, setSocialNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const [readState, setReadState] = useState<Record<string, number>>({});
  
  const scrollY = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const headerScale = useRef(new Animated.Value(0.9)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  
  // Aurora particles for notifications
  const auroraParticles = useRef(
    Array.from({ length: 6 }, (_, i) => ({
      x: new Animated.Value(Math.random() * 400),
      y: new Animated.Value(50 + Math.random() * 100),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.5 + Math.random() * 0.5),
    }))
  ).current;

  const readStateKey = useMemo(() => `${NOTIFICATION_READ_STATE_PREFIX}${user?.uid ?? 'guest'}`, [user?.uid]);

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.spring(headerScale, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.timing(headerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    
    // Holographic shimmer
    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 2500, useNativeDriver: true })
    ).start();
    
    // Aurora particles
    auroraParticles.forEach((particle, i) => {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(particle.opacity, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
            Animated.timing(particle.opacity, { toValue: 0.2, duration: 2000, useNativeDriver: true }),
          ]),
          Animated.timing(particle.y, { toValue: -50, duration: 5000 + i * 1000, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadReadState = async () => {
      try {
        const stored = await AsyncStorage.getItem(readStateKey);
        if (isMounted) setReadState(stored ? JSON.parse(stored) : {});
      } catch (err) {}
    };
    loadReadState();
    return () => { isMounted = false; };
  }, [readStateKey]);

  const fetchNewDrops = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/movie/upcoming?api_key=${API_KEY}&region=US`);
      const data = await res.json();
      const mapped: Notification[] = (data.results || []).slice(0, 10).map((m: any) => ({
        id: `tmdb-${m.id}`,
        type: 'new_release',
        scope: 'content',
        title: m.title,
        message: m.overview ? (m.overview.slice(0, 80) + '...') : 'Coming soon to theaters.',
        timestamp: m.release_date,
        read: false,
        thumbnail: m.poster_path ? `${IMAGE_BASE_URL}${m.poster_path}` : undefined,
        metadata: { mediaId: m.id, mediaType: 'movie' }
      }));
      setReleaseNotifications(mapped);
    } catch (e) {}
  }, []);

  const fetchSocial = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(collection(firestore, 'notifications'), where('targetUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(30));
      const snap = await getDocs(q);
      const mapped: Notification[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type || 'like',
          scope: 'social',
          title: data.actorName || 'MovieFlix User',
          message: data.message || 'Interacted with your profile.',
          timestamp: 'Just now',
          read: Boolean(data.read),
          thumbnail: data.actorAvatar,
          metadata: { ...data }
        };
      });
      setSocialNotifications(mapped);
    } catch (e) {}
  }, [user]);

  useEffect(() => {
    Promise.all([fetchNewDrops(), fetchSocial()]).then(() => setLoading(false));
  }, [fetchNewDrops, fetchSocial]);

  const handleRefresh = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRefreshing(true);
    await Promise.all([fetchNewDrops(), fetchSocial()]);
    setRefreshing(false);
  };

  const filteredData = useMemo(() => {
    const combined = [...releaseNotifications, ...socialNotifications].map(n => ({
        ...n,
        read: n.read || Boolean(readState[n.id])
    }));
    if (activeFilter === 'drops') return combined.filter(n => n.scope === 'content');
    if (activeFilter === 'social') return combined.filter(n => n.scope === 'social');
    return combined;
  }, [releaseNotifications, socialNotifications, activeFilter, readState]);

  const renderNotification = ({ item, index }: { item: Notification; index: number }) => {
    const typeKey = isKnownNotificationType(item.type) ? item.type : 'like';
    const meta = notificationTypeMeta[typeKey];

    return (
      <Animated.View 
        style={[
          styles.itemWrapper,
          {
            opacity: headerOpacity,
            transform: [{
              translateY: headerOpacity.interpolate({ inputRange: [0, 1], outputRange: [20, 0] })
            }]
          }
        ]}
      >
        <LiquidGlass 
          cornerRadius={24} 
          tintOpacity={item.read ? 0.05 : 0.12} 
          tintColor={item.read ? '#000' : meta.accent}
          glowColor={item.read ? 'transparent' : meta.accent}
          glowIntensity={item.read ? 0 : 0.3}
          borderOpacity={item.read ? 0.15 : 0.35}
          chromaticAberration={!item.read}
          breathingEffect={!item.read}
          interactive={!item.read}
          style={styles.itemGlass}
        >
          <TouchableOpacity 
            style={styles.itemContent} 
            activeOpacity={0.85}
            onPress={() => {
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
            }}
          >
            <View style={styles.thumbWrapper}>
              {item.thumbnail ? (
                <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
              ) : (
                <View style={[styles.iconCircle, { backgroundColor: `${meta.accent}25` }]}>
                  <Ionicons name={meta.icon as any} size={26} color={meta.accent} />
                </View>
              )}
              {!item.read && (
                <Animated.View 
                  style={[
                    styles.unreadDot, 
                    { 
                      backgroundColor: meta.accent,
                      shadowColor: meta.accent,
                      transform: [{ scale: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.2, 1] }) }],
                    }
                  ]} 
                />
              )}
            </View>
            
            <View style={styles.itemText}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.itemTime}>{item.timestamp}</Text>
              </View>
              <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
              
              {/* Type badge */}
              <View style={[styles.typeBadge, { backgroundColor: `${meta.accent}20` }]}>
                <Ionicons name={meta.icon as any} size={10} color={meta.accent} />
                <Text style={[styles.typeBadgeText, { color: meta.accent }]}>{meta.label}</Text>
              </View>
            </View>
            
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        </LiquidGlass>
      </Animated.View>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenWrapper>
        <StatusBar barStyle="light-content" />
        
        {/* Cinematic Background */}
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={[accent + '15', '#0a0612', '#050508', '#030308']}
            locations={[0, 0.2, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
          
          {/* Aurora particles */}
          {auroraParticles.map((particle, i) => (
            <Animated.View
              key={`aurora-${i}`}
              pointerEvents="none"
              style={[
                styles.auroraParticle,
                {
                  left: particle.x,
                  top: particle.y,
                  opacity: particle.opacity,
                  transform: [{ scale: particle.scale }],
                  backgroundColor: i % 2 === 0 ? accent : '#7dd8ff',
                  shadowColor: i % 2 === 0 ? accent : '#7dd8ff',
                },
              ]}
            />
          ))}
          
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
              colors={['transparent', 'rgba(229,9,20,0.1)', 'rgba(125,216,255,0.1)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        <FlatList
          data={filteredData}
          renderItem={renderNotification}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />}
          ListHeaderComponent={
            <Animated.View style={[styles.header, { opacity: headerOpacity, transform: [{ scale: headerScale }] }]}>
              <View style={styles.headerRow}>
                <LiquidGlass 
                  cornerRadius={18} 
                  tintOpacity={0.15}
                  tintColor={accent}
                  glowColor={accent}
                  glowIntensity={0.3}
                  style={styles.headerIconGlass}
                >
                  <Ionicons name="notifications" size={22} color={accent} />
                </LiquidGlass>
                <View>
                  <Text style={styles.eyebrow}>INBOX</Text>
                  <Text style={styles.title}>Notifications</Text>
                </View>
              </View>
              
              <View style={styles.filterRow}>
                {FILTER_TABS.map(tab => {
                  const isActive = activeFilter === tab.key;
                  return (
                    <TouchableOpacity 
                      key={tab.key} 
                      onPress={() => {
                        setActiveFilter(tab.key);
                        if (Platform.OS !== 'web') {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                      }} 
                      style={styles.tabBtn}
                    >
                      <LiquidGlass 
                        cornerRadius={18} 
                        tintOpacity={isActive ? 0.2 : 0.05} 
                        tintColor={isActive ? accent : '#000'}
                        glowColor={isActive ? accent : 'transparent'}
                        glowIntensity={isActive ? 0.4 : 0}
                        borderOpacity={isActive ? 0.35 : 0.15}
                        chromaticAberration={isActive}
                        interactive={isActive}
                        style={styles.tabGlass}
                      >
                        <Text style={[styles.tabText, isActive && styles.activeTabText]}>{tab.label}</Text>
                      </LiquidGlass>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated.View>
          }
          ListEmptyComponent={
            loading ? <ActivityIndicator size="large" color={accent} style={{ marginTop: 100 }} /> : (
              <View style={styles.empty}>
                <LiquidGlass
                  cornerRadius={40}
                  tintOpacity={0.1}
                  style={styles.emptyIconGlass}
                >
                  <Ionicons name="notifications-off-outline" size={48} color="rgba(255,255,255,0.3)" />
                </LiquidGlass>
                <Text style={styles.emptyText}>All caught up!</Text>
                <Text style={styles.emptySubtext}>No new notifications</Text>
              </View>
            )
          }
        />
      </ScreenWrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050508' },
  
  // Aurora particles
  auroraParticle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  
  // Prismatic shimmer
  prismaticShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    overflow: 'hidden',
  },
  
  header: { paddingHorizontal: 20, paddingTop: 20, marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  headerIconGlass: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  title: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  filterRow: { flexDirection: 'row', gap: 8 },
  tabBtn: { height: 44, flex: 1 },
  tabGlass: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  tabText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '700' },
  activeTabText: { color: '#fff', fontWeight: '800' },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  itemWrapper: { marginBottom: 10 },
  itemGlass: { borderRadius: 24, overflow: 'hidden' },
  itemContent: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  thumbWrapper: { position: 'relative' },
  thumbnail: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#111' },
  iconCircle: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#050508', shadowOpacity: 0.8, shadowRadius: 4 },
  itemText: { flex: 1, marginLeft: 14, marginRight: 8 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  itemTitle: { color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 },
  itemTime: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', marginLeft: 8 },
  itemMessage: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 18, fontWeight: '500' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 6, gap: 4 },
  typeBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyIconGlass: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 20, fontWeight: '800' },
  emptySubtext: { color: 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: '600', marginTop: 4 },
});
