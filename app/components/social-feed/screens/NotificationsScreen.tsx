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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
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

const notificationTypeMeta: Record<KnownNotificationType, { label: string; accent: string }> = {
  like: { label: 'Social', accent: '#ffb347' },
  comment: { label: 'Social', accent: '#ffb347' },
  follow: { label: 'Social', accent: '#5f8afc' },
  mention: { label: 'Social', accent: '#a689ff' },
  streak: { label: 'Streak', accent: '#ff6ec7' },
  new_release: { label: 'Premiere', accent: '#5dd39e' },
  new_post: { label: 'Social', accent: '#ffb347' },
  new_story: { label: 'Social', accent: '#ffb347' },
};

const KNOWN_NOTIFICATION_TYPES: KnownNotificationType[] = [
  'like',
  'comment',
  'follow',
  'mention',
  'streak',
  'new_release',
  'new_post',
  'new_story',
];

const isKnownNotificationType = (value: NotificationType): value is KnownNotificationType =>
  KNOWN_NOTIFICATION_TYPES.includes(value as KnownNotificationType);

const compareReleaseNotifications = (first: Notification, second: Notification) => {
  const aTime = first.metadata?.releaseTimestamp ?? Number.MAX_SAFE_INTEGER;
  const bTime = second.metadata?.releaseTimestamp ?? Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
};

const FILTER_TABS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drops', label: 'New movies' },
  { key: 'social', label: 'Community' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatReleaseWindow = (releaseDate?: string) => {
  if (!releaseDate) return 'Drops soon';
  const release = new Date(`${releaseDate}T00:00:00Z`);
  if (Number.isNaN(release.getTime())) return 'Drops soon';

  const today = new Date();
  const diffMs = release.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);

  if (diffDays <= 0) return 'Now streaming';
  if (diffDays === 1) return 'Drops tomorrow';
  if (diffDays < 7) return `Drops in ${diffDays} days`;

  const month = MONTHS[release.getUTCMonth()];
  const day = release.getUTCDate();
  return `Drops ${month} ${day}`;
};

const formatReleaseDateText = (releaseDate?: string) => {
  if (!releaseDate) return 'Release date TBA';
  const release = new Date(`${releaseDate}T00:00:00Z`);
  if (Number.isNaN(release.getTime())) return 'Release date TBA';

  const month = MONTHS[release.getUTCMonth()];
  const day = release.getUTCDate();
  const year = release.getUTCFullYear();

  return `${month} ${day}, ${year}`;
};

const summarizeOverview = (overview?: string) => {
  if (!overview) return 'Add it to your watchlist before the crowd.';
  if (overview.length <= 140) return overview;
  return `${overview.slice(0, 137)}...`;
};

const formatRelativeTime = (value?: Date | string | number) => {
  if (!value) return 'Just now';
  const date =
    value instanceof Date ? value : typeof value === 'string' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';

  const diffMs = Date.now() - date.getTime();
  const absDiff = Math.abs(diffMs);

  if (absDiff < 60000) return 'Just now';
  if (absDiff < 3600000) {
    const mins = Math.round(absDiff / 60000);
    return `${mins}m ago`;
  }
  if (absDiff < 86400000) {
    const hours = Math.round(absDiff / 3600000);
    return `${hours}h ago`;
  }
  if (absDiff < 604800000) {
    const days = Math.round(absDiff / 86400000);
    return `${days}d ago`;
  }
  return date.toLocaleDateString();
};

const truncateText = (value?: string, limit = 48) => {
  if (!value) return '';
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

const getSocialMessage = (type: NotificationType, actorName: string, data?: Record<string, any>) => {
  const title = data?.targetTitle || data?.mediaTitle || data?.title || data?.movieTitle;
  const commentSnippet =
    data?.commentSnippet || data?.comment || data?.text || data?.bodySnippet || data?.message;

  switch (type) {
    case 'comment':
      return commentSnippet
        ? `${actorName} commented${title ? ` on "${title}"` : ''}: "${truncateText(commentSnippet)}"`
        : `${actorName} commented${title ? ` on "${title}"` : ''}.`;
    case 'follow':
      return `${actorName} started following you.`;
    case 'new_post':
      return `${actorName} created a new post${title ? `: "${truncateText(title)}"` : '.'}`;
    case 'new_story':
      return `${actorName} added a new story.`;
    case 'mention':
      return `${actorName} mentioned you${title ? ` in "${title}"` : ''}.`;
    case 'streak':
      return data?.streakDays
        ? `${actorName} is on a ${data.streakDays}-day streak with you.`
        : `${actorName} kept their streak alive.`;
    default:
      return `${actorName} liked your ${title ? `"${title}"` : 'activity'}.`;
  }
};

const resolveTargetRoute = (type: NotificationType, data?: Record<string, any>) => {
  if (!data) return undefined;
  const direct = data.targetRoute || data.deepLink || data.route || data.href;
  if (typeof direct === 'string' && direct.length > 0) {
    return direct;
  }

  const normalize = (value?: string) => (typeof value === 'string' ? value.toLowerCase() : '');
  const candidate = normalize(data.targetType || data.channel || (type as string));
  const hasWatchPartyCode = Boolean(data.watchPartyCode || data.partyCode || data.roomCode);
  const chatId = data.threadId || data.chatId || data.conversationId || data.messageThreadId;

  if (
    candidate.includes('watchparty') ||
    candidate.includes('watch_party') ||
    hasWatchPartyCode
  ) {
    return '/watchparty';
  }

  if (
    candidate.includes('message') ||
    candidate.includes('chat') ||
    candidate.includes('dm') ||
    candidate.includes('inbox') ||
    Boolean(chatId)
  ) {
    return chatId ? `/messaging/chat/${chatId}` : '/messaging';
  }

  if (candidate.includes('watchlist')) {
    return '/(tabs)/movies';
  }

  return undefined;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const listRef = useRef<FlatList<Notification>>(null);
  const [releaseNotifications, setReleaseNotifications] = useState<Notification[]>([]);
  const [socialNotifications, setSocialNotifications] = useState<Notification[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [loadingSocial, setLoadingSocial] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const [readState, setReadState] = useState<Record<string, number>>({});
  const readStateKey = useMemo(
    () => `${NOTIFICATION_READ_STATE_PREFIX}${user?.uid ?? 'guest'}`,
    [user?.uid],
  );
  const badgeStateKey = useMemo(
    () => `${NOTIFICATION_BADGE_STORAGE_PREFIX}${user?.uid ?? 'guest'}`,
    [user?.uid],
  );

  useEffect(() => {
    let isMounted = true;
    setReadState({});

    const loadReadState = async () => {
      try {
        const stored = await AsyncStorage.getItem(readStateKey);
        if (!isMounted) return;
        setReadState(stored ? JSON.parse(stored) : {});
      } catch (err) {
        if (!isMounted) return;
        console.warn('Failed to load notification read state', err);
        setReadState({});
      }
    };

    loadReadState();

    return () => {
      isMounted = false;
    };
  }, [readStateKey]);

  const persistReadMap = useCallback(
    async (state: Record<string, number>) => {
      try {
        await AsyncStorage.setItem(readStateKey, JSON.stringify(state));
      } catch (err) {
        console.warn('Failed to persist notification read state', err);
      }
    },
    [readStateKey],
  );

  const fetchNewDrops = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setLoadingReleases(true);
      }
      setError(null);

      try {
        const response = await fetch(
          `${API_BASE_URL}/movie/upcoming?api_key=${API_KEY}&language=en-US&region=US&page=1`,
        );

        if (!response.ok) {
          throw new Error('TMDB responded with an error');
        }

        const data = await response.json();
        const items = Array.isArray(data?.results) ? data.results : [];

        const mapped: Notification[] = items
          .slice(0, 8)
          .map((movie: any, index: number) => {
            const releaseDate = movie?.release_date;
            const mediaTitle = movie?.title ?? movie?.name ?? 'New Movie Drop';
            const rawReleaseDate = releaseDate ? new Date(`${releaseDate}T00:00:00Z`) : null;
            const releaseTimestamp =
              rawReleaseDate && !Number.isNaN(rawReleaseDate.getTime())
                ? rawReleaseDate.getTime()
                : undefined;
            const releaseWindow = formatReleaseWindow(releaseDate);
            const releaseDateText = formatReleaseDateText(releaseDate);
            const rating =
              typeof movie?.vote_average === 'number' && movie.vote_average > 0
                ? `Score ${movie.vote_average.toFixed(1)}/10 - `
                : '';

            return {
              id: `tmdb-${movie?.id ?? index}`,
              type: 'new_release',
              scope: 'content',
              title: mediaTitle,
              message: `${releaseDateText} - ${summarizeOverview(movie?.overview)}`,
              timestamp: `${rating}${releaseWindow}`,
              read: false,
              thumbnail: movie?.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : undefined,
              metadata: {
                releaseDate,
                releaseTimestamp,
                voteAverage: movie?.vote_average,
                mediaId: movie?.id,
                mediaType: 'movie',
              },
            };
          })
          .sort(compareReleaseNotifications);

        setReleaseNotifications(mapped);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch TMDB drops');
      } finally {
        if (!silent) {
          setLoadingReleases(false);
        }
      }
    },
    [],
  );

  const fetchSocialNotifications = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!user) {
        setSocialNotifications([]);
        return;
      }

      if (!silent) {
        setLoadingSocial(true);
      }

      try {
        const notificationsRef = collection(firestore, 'notifications');
        const notificationsQuery = query(
          notificationsRef,
          where('targetUid', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(50),
        );

        const snapshot = await getDocs(notificationsQuery);
        const items: Notification[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data() as Record<string, any>;
          const createdAt =
            typeof data.createdAt?.toDate === 'function'
              ? data.createdAt.toDate()
              : data.createdAt
              ? new Date(data.createdAt)
              : data.created_at
              ? new Date(data.created_at)
              : new Date();
          const actorName =
            data.actor?.displayName || data.actorName || data.actor || data.userName || 'MovieFlix member';
          const actorAvatar = data.actor?.avatar || data.actorAvatar || data.avatar || undefined;
          const rawType = (data.type as NotificationType) ?? 'like';
          const normalizedType: NotificationType =
            rawType && typeof rawType === 'string' ? rawType : 'like';
          const message =
            data.message || data.body || data.content || getSocialMessage(normalizedType, actorName, data);
          const derivedRoute = resolveTargetRoute(normalizedType, data);

          return {
            id: docSnap.id,
            type: normalizedType,
            scope: 'social',
            title: actorName,
            message,
            timestamp: formatRelativeTime(createdAt),
            read: Boolean(data.read),
            thumbnail: actorAvatar,
            metadata: {
              docPath: docSnap.ref.path,
              actorId: data.actorId ?? data.actor_id ?? data.actor?.id,
              targetId: data.targetId ?? data.postId ?? data.feedId ?? data.target_id,
              targetType: data.targetType ?? data.mediaType ?? 'post',
              targetRoute: derivedRoute,
              mediaId: typeof data.mediaId === 'number' ? data.mediaId : undefined,
              mediaType: data.mediaType,
            },
          };
        });

        setSocialNotifications(items);
      } catch (err) {
        console.warn('Failed to load social notifications', err);
        setSocialNotifications([]);
      } finally {
        if (!silent) {
          setLoadingSocial(false);
        }
      }
    },
    [user],
  );

  useEffect(() => {
    fetchNewDrops();
  }, [fetchNewDrops]);

  useEffect(() => {
    fetchSocialNotifications();
  }, [fetchSocialNotifications]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchNewDrops({ silent: true }), fetchSocialNotifications({ silent: true })]);
    setRefreshing(false);
  }, [fetchNewDrops, fetchSocialNotifications]);

  const decoratedRelease = useMemo(
    () =>
      releaseNotifications.map(notification => ({
        ...notification,
        read: notification.read || Boolean(readState[notification.id]),
      })),
    [releaseNotifications, readState],
  );

  const decoratedSocial = useMemo(
    () =>
      socialNotifications.map(notification => ({
        ...notification,
        read: notification.read || Boolean(readState[notification.id]),
      })),
    [socialNotifications, readState],
  );

  const allNotifications = useMemo(
    () => [...decoratedRelease, ...decoratedSocial],
    [decoratedRelease, decoratedSocial],
  );

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'drops') return decoratedRelease;
    if (activeFilter === 'social') {
      return decoratedSocial;
    }
    return allNotifications;
  }, [activeFilter, allNotifications, decoratedRelease, decoratedSocial]);

  const releaseSummary = useMemo(() => {
    if (!decoratedRelease.length) return null;
    const highlight = decoratedRelease.find(notification => !notification.read) ?? decoratedRelease[0];
    return {
      title: highlight.title,
      window: formatReleaseWindow(highlight.metadata?.releaseDate),
      count: decoratedRelease.length,
      artwork: highlight.thumbnail,
    };
  }, [decoratedRelease]);

  const tabUnreadCounts = useMemo<Record<NotificationFilter, number>>(() => {
    const drops = decoratedRelease.filter(notification => !notification.read).length;
    const social = decoratedSocial.filter(notification => !notification.read).length;
    return {
      all: drops + social,
      drops,
      social,
    };
  }, [decoratedRelease, decoratedSocial]);

  useEffect(() => {
    const persistBadge = async () => {
      try {
        await AsyncStorage.setItem(badgeStateKey, JSON.stringify(tabUnreadCounts));
      } catch (err) {
        console.warn('Failed to persist notification badge count', err);
      }
    };

    persistBadge();
  }, [badgeStateKey, tabUnreadCounts]);

  const emptyStateCopy = useMemo(() => {
    if (activeFilter === 'social' && !user) {
      return {
        title: 'Sign in to get notified',
        subtitle: 'Log in to see likes, comments, and follows from your community.',
      };
    }
    if (activeFilter === 'social') {
      return {
        title: 'All caught up socially',
        subtitle: 'New interactions on your posts will appear in this channel.',
      };
    }
    if (activeFilter === 'drops') {
      return {
        title: 'No new drops yet',
        subtitle: 'Pull to refresh for the latest TMDB announcements.',
      };
    }
    return {
      title: 'Nothing to see yet',
      subtitle: 'We will drop updates here as soon as this channel gets activity.',
    };
  }, [activeFilter, user]);

  const markNotificationAsRead = useCallback(
    (notification: Notification) => {
      setReadState(prev => {
        if (prev[notification.id]) return prev;
        const next = { ...prev, [notification.id]: Date.now() };
        persistReadMap(next);
        return next;
      });

      if (notification.scope === 'social') {
        setSocialNotifications(prev =>
          prev.map(item => (item.id === notification.id ? { ...item, read: true } : item)),
        );
        if (notification.metadata?.docPath) {
          updateDoc(doc(firestore, notification.metadata.docPath), { read: true }).catch(err => {
            console.warn('Failed to mark notification as read in Firestore', err);
          });
        }
      } else if (notification.scope === 'content') {
        setReleaseNotifications(prev =>
          prev.map(item => (item.id === notification.id ? { ...item, read: true } : item)),
        );
      }
    },
    [persistReadMap],
  );

  const handleNotificationPress = useCallback(
    (notification: Notification) => {
      markNotificationAsRead(notification);

      if (
        notification.type === 'new_release' &&
        notification.metadata?.mediaId &&
        notification.metadata?.mediaType
      ) {
        router.push({
          pathname: '/details/[id]',
          params: {
            id: notification.metadata.mediaId.toString(),
            mediaType: notification.metadata.mediaType,
          },
        });
        return;
      }

      if (notification.metadata?.targetRoute) {
        router.push(notification.metadata.targetRoute as any);
      }
    },
    [markNotificationAsRead, router],
  );

  const handleArrivalsCardPress = useCallback(() => {
    setActiveFilter('drops');
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, []);

  const handleManualRefresh = useCallback(() => {
    fetchNewDrops();
    fetchSocialNotifications();
  }, [fetchNewDrops, fetchSocialNotifications]);

  const renderNotification = ({ item }: { item: Notification }) => {
    const typeKey: KnownNotificationType = isKnownNotificationType(item.type)
      ? item.type
      : 'like';
    const meta = notificationTypeMeta[typeKey];
    const badgeColor = meta.accent;
    const badgeLabel = meta.label;

    return (
      <TouchableOpacity
        style={[styles.notificationItem, !item.read && styles.unread]}
        onPress={() => handleNotificationPress(item)}
      >
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.fallbackText}>{item.title.charAt(0)}</Text>
          </View>
        )}
        <View style={styles.content}>
          <View style={styles.row}>
            <Text style={styles.notificationTitle}>{item.title}</Text>
            <View style={[styles.typeBadge, { borderColor: badgeColor }]}>
              <Text style={[styles.typeBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
            </View>
          </View>
          <Text style={styles.notificationText}>{item.message}</Text>
          <Text style={styles.timestamp}>{item.timestamp}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const onTabPress = (tab: NotificationFilter) => {
    setActiveFilter(tab);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  };

  const isSyncing = loadingReleases || loadingSocial;

  return (
    <View style={styles.container}>
      <ScreenWrapper>
        <FlatList
          ref={listRef}
          data={filteredNotifications}
          renderItem={renderNotification}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#fff"
              colors={['#ffffff']}
            />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <View style={styles.headerCopy}>
                  <Text style={styles.title}>Notifications</Text>
                  <Text style={styles.subtitle}>
                    Notification channels keep your social buzz and movie drops in one place.
                  </Text>
                </View>
                <View style={styles.headerStatus}>
                  {isSyncing ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.statusText}>Syncing feed</Text>
                    </>
                  ) : (
                    <TouchableOpacity style={styles.refreshButton} onPress={handleManualRefresh}>
                      <Text style={styles.refreshText}>Refresh</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.infoBanner}>
                <Text style={styles.infoHeading}>New movie drop alerts</Text>
                <Text style={styles.infoText}>
                  Pulled directly from our server upcoming titles. Pull down or tap refresh any time you
                  need a new slate.
                </Text>
              </View>

              {error && (
                <TouchableOpacity style={styles.errorBanner} onPress={() => fetchNewDrops()}>
                  <Text style={styles.errorTitle}>Could not reach TMDB</Text>
                  <Text style={styles.errorSubtitle}>{error}</Text>
                </TouchableOpacity>
              )}

              <View style={styles.tabBar}>
                {FILTER_TABS.map(tab => {
                  const isActive = tab.key === activeFilter;
                  const unreadCount = tabUnreadCounts[tab.key];
                  const label = unreadCount > 0 ? `${tab.label} (${unreadCount})` : tab.label;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      style={[styles.tabPill, isActive && styles.tabPillActive]}
                      onPress={() => onTabPress(tab.key)}
                    >
                      <Text style={[styles.tabPillText, isActive && styles.tabPillTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {releaseSummary && (
                <TouchableOpacity style={styles.arrivalsCard} onPress={handleArrivalsCardPress}>
                  <View style={styles.arrivalsCopy}>
                    <Text style={styles.arrivalsEyebrow}>New arrivals</Text>
                    <Text style={styles.arrivalsTitle}>{releaseSummary.title}</Text>
                    <Text style={styles.arrivalsMeta}>{releaseSummary.window}</Text>
                    <Text style={styles.arrivalsCount}>
                      {releaseSummary.count > 1
                        ? `+${releaseSummary.count - 1} more premiering soon`
                        : 'Tap to see the drop list'}
                    </Text>
                  </View>
                  {releaseSummary.artwork && (
                    <Image source={{ uri: releaseSummary.artwork }} style={styles.arrivalsArtwork} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{emptyStateCopy.title}</Text>
              <Text style={styles.emptySubtitle}>{emptyStateCopy.subtitle}</Text>
            </View>
          }
        />
      </ScreenWrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05060f',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    color: '#b6c4ff',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    color: '#9aa9d6',
    fontSize: 12,
    marginLeft: 8,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  refreshText: {
    color: '#8ee0ff',
    fontSize: 12,
    fontWeight: '600',
  },
  infoBanner: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  infoHeading: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  infoText: {
    color: '#9fb1d7',
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
  },
  errorBanner: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,118,118,0.5)',
    backgroundColor: 'rgba(255,118,118,0.14)',
    marginTop: 12,
  },
  errorTitle: {
    color: '#ffd0d0',
    fontWeight: '600',
    fontSize: 13,
  },
  errorSubtitle: {
    color: '#ffb6b6',
    fontSize: 12,
    marginTop: 4,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 999,
    padding: 4,
    marginTop: 12,
  },
  tabPill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tabPillText: {
    color: '#8f9ec7',
    fontSize: 13,
    fontWeight: '600',
  },
  tabPillTextActive: {
    color: '#fff',
  },
  arrivalsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(24,33,68,0.9)',
    borderRadius: 18,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  arrivalsCopy: {
    flex: 1,
    paddingRight: 16,
  },
  arrivalsEyebrow: {
    color: '#8ee0ff',
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  arrivalsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  arrivalsMeta: {
    color: '#9fb1d7',
    fontSize: 13,
    marginTop: 4,
  },
  arrivalsCount: {
    color: '#dbe5ff',
    fontSize: 12,
    marginTop: 8,
  },
  arrivalsArtwork: {
    width: 68,
    height: 96,
    borderRadius: 12,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 18,
    marginBottom: 14,
    backgroundColor: 'rgba(15,18,35,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  unread: {
    borderColor: 'rgba(255,214,0,0.45)',
    backgroundColor: 'rgba(255,214,0,0.08)',
  },
  thumbnail: {
    width: 54,
    height: 54,
    borderRadius: 12,
    marginRight: 14,
  },
  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 12,
    marginRight: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    paddingRight: 12,
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  notificationText: {
    color: '#dbe5ff',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  timestamp: {
    color: '#8f9ec7',
    fontSize: 12,
    marginTop: 8,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: '#9fb1d7',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
});
