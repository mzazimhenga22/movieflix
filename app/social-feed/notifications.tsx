import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import ScreenWrapper from '../../components/ScreenWrapper';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccent } from '../components/AccentContext';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { firestore } from '../../constants/firebase';
import { useUser } from '../../hooks/use-user';

// Enhanced notification types
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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    const notificationsRef = collection(firestore, 'notifications');
    const notificationsQuery = query(
      notificationsRef,
      where('targetUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      snapshot => {
        const mapped: Notification[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data() as Record<string, any>;
          const createdAt =
            typeof data.createdAt?.toDate === 'function'
              ? data.createdAt.toDate()
              : data.createdAt
              ? new Date(data.createdAt)
              : new Date();
          const actorName =
            data.actor?.displayName || data.actorName || data.actor || data.userName || 'MovieFlix member';
          const avatar = data.actor?.avatar || data.actorAvatar || data.avatar;
          const actionUrl = data.targetRoute || data.link || data.href || undefined;
          return {
            id: docSnap.id,
            type: (data.type as NotificationType) || 'like',
            title: actorName,
            message: data.message || data.body || data.content || 'New activity on your feed.',
            timestamp: createdAt.toISOString(),
            read: Boolean(data.read),
            avatar,
            timeAgo: formatRelativeTime(createdAt),
            actionUrl,
            docPath: docSnap.ref.path,
          };
        });
        setNotifications(mapped);
        setLoading(false);
      },
      err => {
        console.warn('[notifications] subscription failed', err);
        setError('Unable to load notifications right now.');
        setNotifications([]);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [formatRelativeTime, user?.uid]);

  const filteredNotifications = notifications.filter(n =>
    filter === 'all' || (filter === 'unread' && !n.read)
  );

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const markAsRead = useCallback(async (notification: Notification) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notification.id ? { ...n, read: true } : n)),
    );

    try {
      const ref = notification.docPath
        ? doc(firestore, notification.docPath)
        : doc(firestore, 'notifications', notification.id);
      await updateDoc(ref, { read: true });
    } catch (err) {
      console.warn('[notifications] failed to update read state', err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await Promise.all(
        notifications
          .filter(n => !n.read)
          .map(n => {
            const ref = n.docPath
              ? doc(firestore, n.docPath)
              : doc(firestore, 'notifications', n.id);
            return updateDoc(ref, { read: true });
          }),
      );
    } catch (err) {
      console.warn('[notifications] failed to mark all as read', err);
    }
  }, [notifications]);

  const handleNotificationPress = useCallback(
    (notification: Notification) => {
      void markAsRead(notification);
      if (notification.actionUrl) {
        router.push(notification.actionUrl as any);
      }
    },
    [markAsRead, router],
  );

  const renderNotification = useCallback(
    ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.read && styles.unreadNotification]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={styles.avatarContainer}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={20} color="#666" />
          </View>
        )}
        <View style={[styles.iconBadge, { backgroundColor: notificationColors[item.type] }]}>
          <Ionicons name={notificationIcons[item.type]} size={12} color="#fff" />
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.message} numberOfLines={2}>
          {item.message}
        </Text>
        <Text style={styles.timeAgo}>{item.timeAgo}</Text>
      </View>

      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  ),
    [handleNotificationPress],
  );

  const accentBackground = useMemo(
    () => ['#e50914', '#150a13', '#05060f'] as const,
    [],
  );

  return (
    <ScreenWrapper>
      <LinearGradient colors={accentBackground} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
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

      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.headerEyebrow}>Inbox</Text>
            <Text style={styles.headerTitle}>Notifications</Text>
          </View>
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton}>
            <Ionicons name="checkmark-done" size={16} color="#fff" />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'all' && styles.activeFilterTab]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterTabText, filter === 'all' && styles.activeFilterTabText]}>
              All ({notifications.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'unread' && styles.activeFilterTab]}
            onPress={() => setFilter('unread')}
          >
            <Text style={[styles.filterTabText, filter === 'unread' && styles.activeFilterTabText]}>
              Unread ({unreadCount})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Notifications List */}
        <FlatList
          data={filteredNotifications}
          renderItem={renderNotification}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#fff"
              colors={['#667eea']}
            />
          }
          ListHeaderComponent={
            loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.loadingText}>Syncing notifications…</Text>
              </View>
            ) : error ? (
              <TouchableOpacity style={styles.errorBanner} onPress={handleRefresh}>
                <Text style={styles.errorTitle}>Unable to sync</Text>
                <Text style={styles.errorSubtitle}>{error}</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off" size={64} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyTitle}>
                {user
                  ? filter === 'unread'
                    ? 'No unread notifications'
                    : 'No notifications yet'
                  : 'Sign in to get notified'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {user
                  ? filter === 'unread'
                    ? 'You\'ve read all your notifications!'
                    : 'When you get notifications, they\'ll appear here.'
                  : 'Log in to see likes, follows, and new releases tailored to you.'}
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContainer}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgOrbPrimary: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -60,
    left: -40,
    opacity: 0.5,
  },
  bgOrbSecondary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    bottom: -80,
    right: -40,
    opacity: 0.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  titleBlock: {
    gap: 4,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.6,
    fontSize: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  markAllButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  markAllText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 25,
    padding: 4,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 21,
  },
  activeFilterTab: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  filterTabText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  activeFilterTabText: {
    color: '#fff',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7,9,18,0.78)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  unreadNotification: {
    backgroundColor: 'rgba(255,214,0,0.08)',
    borderColor: 'rgba(255,214,0,0.3)',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 20,
    marginBottom: 4,
  },
  timeAgo: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  loadingState: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
    fontWeight: '600',
  },
  errorBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,118,118,0.5)',
    backgroundColor: 'rgba(255,118,118,0.12)',
    padding: 14,
  },
  errorTitle: {
    color: '#ffd0d0',
    fontWeight: '700',
    fontSize: 14,
  },
  errorSubtitle: {
    color: '#ffb6b6',
    fontSize: 12,
    marginTop: 4,
  },
});
