import React, { useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  GestureResponderEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Conversation, Profile } from '../controller';
import { User } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import type { CallType } from '@/lib/calls/types';
import { useAccent } from '../../components/AccentContext';
import { darkenColor, withAlpha } from '@/lib/colorUtils';

interface MessageItemProps {
  item: Conversation;
  onPress: (conversation: Conversation) => void;
  currentUser: User | null;
  otherProfile?: Profile | null;
  pressDisabled?: boolean;
  onLongPress?: (item: Conversation, rect: { x: number; y: number; width: number; height: number }) => void;
  onStartCall?: (conversation: Conversation, type: CallType) => void;
  callDisabled?: boolean;
  isVerified?: boolean;
  isTyping?: boolean;
}

const MessageItem = ({
  item,
  onPress,
  currentUser,
  otherProfile,
  pressDisabled,
  onLongPress,
  onStartCall,
  callDisabled,
  isVerified = false,
  isTyping = false,
}: MessageItemProps) => {
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const accentDark = darkenColor(accent, 0.42);

  const rowRef = useRef<View | null>(null);
  const time = item.updatedAt?.toDate ? item.updatedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const isPendingRequest = item.status === 'pending';

  const rawStreakCount = Number((item as any)?.streakCount ?? 0) || 0;
  const streakExpiresAtMs = Number((item as any)?.streakExpiresAtMs ?? 0) || 0;
  const streakCount =
    rawStreakCount > 0 && streakExpiresAtMs > 0 && streakExpiresAtMs <= Date.now() ? 0 : rawStreakCount;
  const isStreakDanger =
    streakCount > 0 &&
    streakExpiresAtMs > 0 &&
    streakExpiresAtMs - Date.now() <= 6 * 60 * 60 * 1000;

  const toMillisValue = useCallback((value: any): number => {
    try {
      if (!value) return 0;
      if (typeof value === 'number') return value;
      if (typeof value?.toMillis === 'function') return value.toMillis();
      if (typeof value?.toDate === 'function') return value.toDate().getTime();
      if (typeof value?.seconds === 'number') return value.seconds * 1000;
    } catch {
      // ignore
    }
    return 0;
  }, []);

  const otherMemberId = useMemo(() => {
    if (item.isGroup) return null;
    if (!currentUser?.uid) return null;
    const members: string[] = Array.isArray(item.members) ? (item.members as any) : [];
    return members.find((memberId) => memberId && memberId !== currentUser.uid) ?? null;
  }, [item.isGroup, item.members, currentUser?.uid]);

  const resolvedOther = useMemo<Profile | null>(() => {
    if (item.isGroup) return null;
    if (otherProfile) return otherProfile;
    const fallback = (item as any)?.otherProfile as Profile | undefined;
    return fallback ?? null;
  }, [item, item.isGroup, otherProfile]);

  const resolvedName = useMemo(() => {
    if (item.isGroup) return item.name || (item as any)?.title || 'Group';
    return (
      resolvedOther?.displayName ||
      (item as any)?.displayName ||
      (item as any)?.title ||
      (otherMemberId ? `@${otherMemberId.slice(0, 6)}…` : 'Chat')
    );
  }, [item, otherMemberId, resolvedOther?.displayName]);

  const resolvedAvatar = useMemo(() => {
    if (item.isGroup) return '';
    return resolvedOther?.photoURL || (item as any)?.photoURL || '';
  }, [item, resolvedOther?.photoURL]);

  const resolvedStatus = useMemo(() => {
    if (item.isGroup) return null;
    return resolvedOther?.status || null;
  }, [item.isGroup, resolvedOther?.status]);

  const lastMessageTick = useMemo(() => {
    if (item.isGroup) return null;
    if (!currentUser?.uid) return null;
    if (!item.lastMessageSenderId || item.lastMessageSenderId !== currentUser.uid) return null;
    if (!otherMemberId) return null;

    const messageAt = toMillisValue((item as any).updatedAt);
    const otherReadAt = toMillisValue((item as any)?.lastReadAtBy?.[otherMemberId]);
    const isRead = otherReadAt > 0 && messageAt > 0 && otherReadAt >= messageAt;
    const isDelivered = !isRead && resolvedStatus === 'online';

    if (isRead) {
      return { name: 'checkmark-done' as const, color: '#4FC3F7' };
    }
    if (isDelivered) {
      return { name: 'checkmark-done' as const, color: 'rgba(255,255,255,0.65)' };
    }
    return { name: 'checkmark' as const, color: 'rgba(255,255,255,0.65)' };
  }, [currentUser?.uid, item, otherMemberId, resolvedStatus, toMillisValue]);

  const lastPreview = useMemo(() => {
    if (isTyping) {
      return { text: 'Typing…', icon: { name: 'ellipsis-horizontal', color: '#4CD964' as const }, typing: true };
    }

    const text = isPendingRequest
      ? item.requestPreview || 'Request sent — waiting for approval'
      : item.lastMessage || '';

    const lowered = text.toLowerCase();
    const hasMedia = (item as any)?.lastMessageHasMedia === true;
    const icon: { name: keyof typeof Ionicons.glyphMap; color?: string } | null = (() => {
      if (hasMedia) return { name: 'image-outline' };
      if (lowered.includes('video')) return { name: 'videocam-outline' };
      if (lowered.includes('voice') || lowered.includes('audio')) return { name: 'mic-outline' };
      if (lowered.includes('photo') || lowered.includes('picture')) return { name: 'image-outline' };
      return null;
    })();

    return { text, icon, typing: false };
  }, [isPendingRequest, item.requestPreview, item.lastMessage, item, isTyping]);

  const avatarInitials = String(resolvedName || 'U')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLongPress = () => {
    if (!onLongPress || !rowRef.current) return;
    rowRef.current.measureInWindow((x, y, width, height) => {
      onLongPress(item, { x, y, width, height });
    });
  };

  const handleCallPress = useCallback(
    (event: GestureResponderEvent, type: CallType) => {
      event.stopPropagation();
      if (callDisabled || !onStartCall) return;
      onStartCall(item, type);
    },
    [callDisabled, onStartCall, item],
  );

  return (
    <TouchableOpacity
      ref={rowRef}
      style={styles.messageItem}
      onPress={() => onPress(item)}
      onLongPress={handleLongPress}
      activeOpacity={0.9}
      disabled={!!pressDisabled}
    >
      <View style={styles.cardOuter}>
        <LinearGradient
          colors={[withAlpha(accent, 0.16), withAlpha(accentDark, 0.08), 'rgba(0,0,0,0.72)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.11)', 'rgba(255,255,255,0)']}
          start={{ x: 0.12, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.cardHighlight}
        />

        <BlurView intensity={50} tint="dark" style={styles.card}>
        {item.isGroup ? (
          <View style={styles.groupAvatar}>
            <Text style={styles.groupAvatarText}>
              {(item.name || 'G')
                .split(' ')
                .map((p: string) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </Text>
          </View>
        ) : resolvedAvatar ? (
          <Image source={{ uri: resolvedAvatar }} style={styles.messageAvatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>{avatarInitials}</Text>
          </View>
        )}
        <View style={styles.messageContent}>
          <View style={styles.row}>
            <View style={styles.nameRow}>
              {!item.isGroup && (
                <View style={[styles.statusDot, resolvedStatus === 'online' && styles.statusDotOnline]} />
              )}
              <Text numberOfLines={1} style={[styles.userName, item.unread > 0 && styles.userNameUnread]}>
                {resolvedName}
              </Text>
              {isVerified && (
                <View style={styles.verifiedChip}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
              {isPendingRequest && (
                <View style={styles.requestPill}>
                  <Text style={styles.requestPillText}>Pending</Text>
                </View>
              )}
              {item.pinned && (
                <Ionicons
                  name="pin"
                  size={14}
                  color="rgba(255,255,255,0.85)"
                  style={styles.pinIcon}
                />
              )}
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.time}>{time}</Text>
              {streakCount > 0 ? (
                <View style={[styles.streakPill, isStreakDanger && styles.streakPillDanger]}>
                  <Ionicons name="flame" size={12} color="#fff" style={styles.streakIcon} />
                  <Text style={styles.streakText}>{streakCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.lastMessageRow}>
              {lastMessageTick ? (
                <Ionicons
                  name={lastMessageTick.name}
                  size={14}
                  color={lastMessageTick.color}
                  style={styles.lastMessageTick}
                />
              ) : null}
              {lastPreview.icon ? (
                <Ionicons
                  name={lastPreview.icon.name}
                  size={13}
                  color={lastPreview.icon.color || 'rgba(255,255,255,0.7)'}
                  style={styles.lastMessageIcon}
                />
              ) : null}
              <Text
                numberOfLines={1}
                style={[styles.lastMessage, isPendingRequest && styles.pendingText, lastPreview.typing && styles.typingText]}
              >
                {lastPreview.text}
              </Text>
            </View>
            {item.unread ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {!isPendingRequest && (
          <View style={styles.trailingActions}>
            <TouchableOpacity
              style={[styles.callAction, callDisabled && styles.callActionDisabled]}
              accessibilityLabel="Start voice call"
              onPress={(event) => handleCallPress(event, 'voice')}
              disabled={callDisabled}
            >
              <Ionicons name="call" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.callAction, callDisabled && styles.callActionDisabled]}
              accessibilityLabel="Start video call"
              onPress={(event) => handleCallPress(event, 'video')}
              disabled={callDisabled}
            >
              <Ionicons name="videocam" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        </BlurView>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  messageItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cardOuter: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  cardHighlight: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: 'hidden',
    shadowColor: '#050915',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  messageAvatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 14,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.4,
  },
  groupAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    marginRight: 12,
    backgroundColor: 'rgba(229,9,20,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  groupAvatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  messageContent: {
    flex: 1,
  },
  trailingActions: {
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callAction: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  callActionDisabled: {
    opacity: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    maxWidth: '78%',
  },
  userNameUnread: {
    fontWeight: '800',
  },
  lastMessage: {
    color: '#bdbdbd',
    marginTop: 6,
    flex: 1,
    minWidth: 0,
  },
  lastMessageRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessageIcon: {
    marginTop: 6,
    marginRight: 3,
  },
  lastMessageTick: {
    marginTop: 6,
    marginRight: 4,
  },
  typingText: {
    color: '#4CD964',
    fontWeight: '700',
  },
  time: {
    color: '#bdbdbd',
    fontSize: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,75,75,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  streakPillDanger: {
    backgroundColor: 'rgba(255,75,75,0.52)',
  },
  streakIcon: {
    marginRight: 4,
  },
  streakText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  unreadBadge: {
    backgroundColor: '#e50914',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  unreadText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '78%',
  },
  pinIcon: {
    marginLeft: 6,
  },
  requestPill: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  requestPillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  pendingText: {
    color: 'rgba(255,255,255,0.85)',
    fontStyle: 'italic',
  },
  verifiedChip: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#0d6efd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  statusDotOnline: {
    backgroundColor: '#4CD964',
  },
});

export default MessageItem;
