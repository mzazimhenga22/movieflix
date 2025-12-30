import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../../../constants/firebase';
import { User } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import type { CallType } from '@/lib/calls/types';
import { useAccent } from '../../components/AccentContext';
import { darkenColor, withAlpha } from '@/lib/colorUtils';

interface MessageItemProps {
  item: Conversation;
  onPress: (id: string) => void;
  currentUser: User | null;
  onLongPress?: (item: Conversation, rect: { x: number; y: number; width: number; height: number }) => void;
  onStartCall?: (conversation: Conversation, type: CallType) => void;
  callDisabled?: boolean;
  isVerified?: boolean;
}

const MessageItem = ({
  item,
  onPress,
  currentUser,
  onLongPress,
  onStartCall,
  callDisabled,
  isVerified = false,
}: MessageItemProps) => {
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const accentDark = darkenColor(accent, 0.42);

  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const rowRef = useRef<View | null>(null);
  const time = item.updatedAt?.toDate ? item.updatedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const isPendingRequest = item.status === 'pending';

  useEffect(() => {
    let isActive = true;

    const fetchOtherUser = async () => {
      if (item.isGroup) {
        setOtherUser(null);
        return;
      }

      if (!item.members || !currentUser) {
        setOtherUser(null);
        return;
      }

      const otherMemberId = item.members.find((memberId: string) => memberId !== currentUser.uid);
      if (!otherMemberId) return;

      try {
        const userDoc = await getDoc(doc(firestore, 'users', otherMemberId));
        if (userDoc.exists()) {
          if (!isActive) return;
          setOtherUser({ ...userDoc.data(), id: userDoc.id } as Profile);
        }
      } catch (error) {
        console.error('Error fetching other user:', error);
      }
    };

    fetchOtherUser();

    return () => {
      isActive = false;
    };
  }, [item.members, currentUser, item.isGroup]);

  const avatarInitials = (otherUser?.displayName || 'U')
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
      onPress={() => onPress(item.id)}
      onLongPress={handleLongPress}
      activeOpacity={0.9}
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
        ) : (
          otherUser?.photoURL ? (
            <Image source={{ uri: otherUser.photoURL }} style={styles.messageAvatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{avatarInitials}</Text>
            </View>
          )
        )}
        <View style={styles.messageContent}>
          <View style={styles.row}>
            <View style={styles.nameRow}>
              {!item.isGroup && (
                <View style={[styles.statusDot, otherUser?.status === 'online' && styles.statusDotOnline]} />
              )}
              <Text numberOfLines={1} style={styles.userName}>
                {item.isGroup ? item.name || 'Group' : otherUser?.displayName || 'Unknown'}
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
            <Text style={styles.time}>{time}</Text>
          </View>
          <View style={styles.row}>
            <Text
              numberOfLines={1}
              style={[styles.lastMessage, isPendingRequest && styles.pendingText]}
            >
              {isPendingRequest
                ? item.requestPreview || 'Request sent — waiting for approval'
                : item.lastMessage}
            </Text>
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
  lastMessage: {
    color: '#bdbdbd',
    marginTop: 6,
    maxWidth: '86%',
  },
  time: {
    color: '#bdbdbd',
    fontSize: 12,
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
