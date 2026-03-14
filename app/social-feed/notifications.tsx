import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { 
  collection, 
  doc, 
  DocumentData, 
  limit, 
  onSnapshot, 
  orderBy, 
  query, 
  QueryDocumentSnapshot, 
  QuerySnapshot, 
  updateDoc, 
  where 
} from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
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
} from 'react-native';
import { useAccent } from '../../components/app-components/AccentContext';
import ScreenWrapper from '../../components/ScreenWrapper';
import { firestore } from '../../constants/firebase';
import { useUser } from '../../hooks/use-user';
import LiquidGlass from '../../components/app-components/LiquidGlass';

type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'streak' | 'new_release' | 'new_post' | 'new_story' | 'message';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  avatar?: string;
  timeAgo: string;
  actionUrl?: string;
  docPath?: string;
}

const notificationIcons: Record<NotificationType, any> = {
  like: 'heart',
  comment: 'chatbubble',
  follow: 'person-add',
  mention: 'at',
  streak: 'flame',
  new_release: 'film',
  new_post: 'create',
  new_story: 'camera',
  message: 'chatbubble-ellipses',
};

const notificationColors: Record<NotificationType, string> = {
  like: '#FF6B6B',
  comment: '#4ECDC4',
  follow: '#45B7D1',
  mention: '#96CEB4',
  streak: '#FFEAA7',
  new_release: '#DDA0DD',
  new_post: '#98D8C8',
  new_story: '#F7DC6F',
  message: '#85C1E9',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { setAccentColor } = useAccent();
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setAccentColor('#e50914');
  }, [setAccentColor]);

  const formatRelativeTime = useCallback((value?: Date | string) => {
    if (!value) return 'Just now';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return 'Just now';
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
    return `${Math.round(diff / 86400000)}d ago`;
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const notificationsRef = collection(firestore, 'notifications');
    const notificationsQuery = query(
      notificationsRef,
      where('targetUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const mapped: Notification[] = snapshot.docs.map((docSnap: QueryDocumentSnapshot<DocumentData>) => {
          const data = docSnap.data() as Record<string, any>;
          const createdAt = typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate() : new Date();
          const actorName = data.actorName || data.userName || 'MovieFlix User';
          return {
            id: docSnap.id,
            type: (data.type as NotificationType) || 'like',
            title: actorName,
            message: data.message || 'New activity on your feed.',
            timestamp: createdAt.toISOString(),
            read: Boolean(data.read),
            avatar: data.actorAvatar || data.avatar,
            timeAgo: formatRelativeTime(createdAt),
            actionUrl: data.targetRoute || undefined,
            docPath: docSnap.ref.path,
          };
        });
        setNotifications(mapped);
        setLoading(false);
      },
      () => {
        setNotifications([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [formatRelativeTime, user?.uid]);

  const filteredNotifications = notifications.filter(n =>
    filter === 'all' || (filter === 'unread' && !n.read)
  );

  const markAsRead = useCallback(async (notification: Notification) => {
    if (notification.read) return;
    try {
      const ref = notification.docPath ? doc(firestore, notification.docPath) : doc(firestore, 'notifications', notification.id);
      await updateDoc(ref, { read: true });
    } catch (err) {}
  }, []);

  const renderNotification = ({ item }: { item: Notification }) => {
    const accent = notificationColors[item.type];
    
    return (
      <View style={styles.itemWrapper}>
        <LiquidGlass cornerRadius={24} tintOpacity={item.read ? 0.04 : 0.1} glowColor={accent} glowIntensity={item.read ? 0.05 : 0.2} style={styles.itemGlass}>
            <TouchableOpacity style={styles.itemContent} activeOpacity={0.8} onPress={() => {
                markAsRead(item);
                if (item.actionUrl) router.push(item.actionUrl as any);
            }}>
                <View style={styles.avatarWrapper}>
                    {item.avatar ? (
                        <Image source={{ uri: item.avatar }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, { backgroundColor: `${accent}20`, alignItems: 'center', justifyContent: 'center' }]}>
                            <Ionicons name="person" size={24} color={accent} />
                        </View>
                    )}
                    <View style={[styles.typeBadge, { backgroundColor: accent }]}>
                        <Ionicons name={notificationIcons[item.type]} size={12} color="#fff" />
                    </View>
                </View>

                <View style={styles.textContent}>
                    <View style={styles.itemHeader}>
                        <Text style={styles.actorName} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.timeLabel}>{item.timeAgo}</Text>
                    </View>
                    <Text style={styles.messageText} numberOfLines={2}>{item.message}</Text>
                </View>
                
                {!item.read && <View style={[styles.unreadIndicator, { backgroundColor: accent }]} />}
            </TouchableOpacity>
        </LiquidGlass>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenWrapper>
        <StatusBar barStyle="light-content" />
        
        {/* Dynamic Atmosphere */}
        <View style={StyleSheet.absoluteFill}>
            <LinearGradient colors={['#0a0a14', '#050508']} style={StyleSheet.absoluteFill} />
            <View style={[styles.bgOrb, { top: -100, right: -50, backgroundColor: '#5f8afc10' }]} />
            <View style={[styles.bgOrb, { bottom: 100, left: -100, backgroundColor: '#e5091408' }]} />
        </View>

        <FlatList
          data={filteredNotifications}
          renderItem={renderNotification}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(false)} tintColor="#fff" />}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Inbox</Text>
                {notifications.some(n => !n.read) && (
                    <LiquidGlass cornerRadius={12} tintOpacity={0.1} style={styles.badgeGlass}>
                        <Text style={styles.badgeText}>{notifications.filter(n => !n.read).length} NEW</Text>
                    </LiquidGlass>
                )}
              </View>

              <View style={styles.tabRow}>
                {['all', 'unread'].map(t => {
                    const isActive = filter === t;
                    return (
                        <TouchableOpacity key={t} style={styles.tabBtn} onPress={() => setFilter(t as any)}>
                            <LiquidGlass cornerRadius={16} tintOpacity={isActive ? 0.15 : 0.05} tintColor={isActive ? '#fff' : undefined} style={styles.tabGlass}>
                                <Text style={[styles.tabLabel, isActive && { color: '#fff' }]}>{t.toUpperCase()}</Text>
                            </LiquidGlass>
                        </TouchableOpacity>
                    );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={
            loading ? <ActivityIndicator size="large" color="#fff" style={{ marginTop: 100 }} /> : (
                <View style={styles.empty}>
                    <Ionicons name="notifications-off-outline" size={64} color="rgba(255,255,255,0.1)" />
                    <Text style={styles.emptyTitle}>Nothing here</Text>
                    <Text style={styles.emptySub}>Your notification feed is currently silent.</Text>
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
  bgOrb: { position: 'absolute', width: 400, height: 400, borderRadius: 200, filter: 'blur(100px)' as any },
  header: { paddingHorizontal: 24, paddingTop: 20, marginBottom: 20 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  badgeGlass: { paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#ff4b4b', fontWeight: '900', fontSize: 11 },
  tabRow: { flexDirection: 'row', gap: 10, marginTop: 25 },
  tabBtn: { flex: 1, height: 44 },
  tabGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  list: { paddingBottom: 120 },
  itemWrapper: { paddingHorizontal: 16, marginBottom: 12 },
  itemGlass: { padding: 14 },
  itemContent: { flexDirection: 'row', alignItems: 'center' },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#111' },
  typeBadge: { position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center' },
  textContent: { flex: 1, marginLeft: 16 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  actorName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  timeLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '600' },
  messageText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '500', lineHeight: 20 },
  unreadIndicator: { width: 10, height: 10, borderRadius: 5, marginLeft: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 120, opacity: 0.5 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 20 },
  emptySub: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 8, textAlign: 'center' },
});
