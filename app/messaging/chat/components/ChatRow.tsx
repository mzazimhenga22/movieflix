import React, { memo, useMemo, useRef, useEffect } from 'react';
import { View, Animated, Platform, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccent } from '@/components/app-components/AccentContext';
import LiquidGlass from '@/components/app-components/LiquidGlass';
import { withAlpha } from '@/lib/colorUtils';
import MessageBubble, { MessageItem } from './MessageBubble';

// Helper to parse timestamps
const toMillisValue = (value: any): number => {
  try {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
  } catch { }
  return 0;
};

interface ChatRowProps {
  item: MessageItem;
  index: number;
  user: any;
  otherUser: any;
  participantProfiles: Record<string, any>;
  conversation: any;
  settings: any;
  isConnected: boolean;
  pendingClientIds: Set<string>;
  otherLastReadAtMs: number;
  otherPresenceState: string; // 'online' | 'offline'
  directOtherUserId: string | null;
  
  resolveDisplayName: (uid: string) => string;
  resolveAvatarUri: (uid: string) => string;
  getBubbleGroupPosition: (index: number) => 'single' | 'first' | 'middle' | 'last';
  
  onSwipeReply: (item: MessageItem) => void;
  onLongPress: (item: MessageItem, rect: any, groupPos: any) => void;
  onPressCall: (item: MessageItem) => void;
  onPressMedia: (item: MessageItem) => void;
  onPressMusic: (item: MessageItem) => void;
  onPressMovie: (item: MessageItem) => void;
  onPressReaction: (item: MessageItem, emoji: string) => void;
  onRetry: (item: MessageItem) => void;
  
  revealToken: number;
}

const ChatRow = ({
  item,
  index,
  user,
  otherUser,
  // participantProfiles, // Used in resolve functions passed from parent
  conversation,
  settings,
  isConnected,
  pendingClientIds,
  otherLastReadAtMs,
  otherPresenceState,
  directOtherUserId,
  
  resolveDisplayName,
  resolveAvatarUri,
  getBubbleGroupPosition,
  
  onSwipeReply,
  onLongPress,
  onPressCall,
  onPressMedia,
  onPressMusic,
  onPressMovie,
  onPressReaction,
  onRetry,
  
  revealToken
}: ChatRowProps) => {
  const senderId = String((item as any).sender ?? (item as any).from ?? '').trim();
  const isMe = Boolean(senderId && user?.uid && senderId === user.uid);

  const replySenderId = (item as any).replyToSenderId as string | undefined;
  const existingReplyName = (item as any).replyToSenderName as string | undefined;
  const shouldResolveReplyName =
    !existingReplyName || existingReplyName === 'Someone' || existingReplyName === 'Unknown';
  
  const resolvedReplyName = replySenderId
    ? (shouldResolveReplyName ? resolveDisplayName(replySenderId) : existingReplyName)
    : undefined;
    
  const decoratedItem =
    resolvedReplyName && (item as any).replyToSenderName !== resolvedReplyName
      ? ({ ...item, replyToSenderName: resolvedReplyName } as any)
      : item;

  const createdAtMs = toMillisValue(decoratedItem.createdAt);
  const isPendingLocal = Boolean(
    decoratedItem.clientId &&
    pendingClientIds.has(String(decoratedItem.clientId))
  );

  const computedStatus = (() => {
    if (!isMe) return undefined;
    if (decoratedItem.failed === true) return 'sending' as const;
    if (isPendingLocal || String(decoratedItem.id || '').startsWith('temp-')) {
      return 'sending' as const;
    }

    const canUseReadReceipts = Boolean(
      settings.readReceipts &&
      directOtherUserId &&
      !conversation?.isGroup &&
      !conversation?.isBroadcast,
    );
    const didRead = canUseReadReceipts && otherLastReadAtMs > 0 && otherLastReadAtMs >= createdAtMs;
    if (didRead) return 'read' as const;

    const delivered = Boolean(
      directOtherUserId &&
      !conversation?.isGroup &&
      !conversation?.isBroadcast &&
      otherPresenceState === 'online',
    );
    return delivered ? ('delivered' as const) : ('sent' as const);
  })();

  const senderName = isMe ? user?.displayName || 'You' : resolveDisplayName(senderId);
  const avatarUri = !isMe ? resolveAvatarUri(senderId) || otherUser?.photoURL || '' : '';

  const statusDecorated = isMe
    ? ({
      ...decoratedItem,
      status: computedStatus,
      __offline: !isConnected,
    } as any)
    : decoratedItem;

  const groupPosition = getBubbleGroupPosition(index);
  
  let swipeableRef: any = null;
  
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';

  const renderReplyAction = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const isMeSwipe = isMe;
    
    const scale = dragX.interpolate({
      inputRange: isMeSwipe ? [-80, -40, 0] : [0, 40, 80],
      outputRange: isMeSwipe ? [1, 0.8, 0] : [0, 0.8, 1],
      extrapolate: 'clamp',
    });

    const opacity = dragX.interpolate({
      inputRange: isMeSwipe ? [-80, -40, 0] : [0, 40, 80],
      outputRange: isMeSwipe ? [1, 0.5, 0] : [0, 0.5, 1],
      extrapolate: 'clamp',
    });

    const translateX = dragX.interpolate({
      inputRange: isMeSwipe ? [-80, 0] : [0, 80],
      outputRange: isMeSwipe ? [0, 20] : [-20, 0],
      extrapolate: 'clamp',
    });

    return (
      <View style={[styles.replyActionContainer, { alignItems: isMeSwipe ? 'flex-end' : 'flex-start' }]}>
        <Animated.View style={[styles.replyActionButton, { transform: [{ scale }, { translateX }], opacity }]}>
          <LiquidGlass
            cornerRadius={22}
            tintOpacity={0.2}
            tintColor={accent}
            glowColor={accent}
            glowIntensity={0.4}
            chromaticAberration
            interactive
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name="arrow-undo" size={20} color="#fff" style={{ zIndex: 1 }} />
        </Animated.View>
      </View>
    );
  };

  const onSwipeableWillOpen = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  return (
    <Swipeable
      ref={(ref) => { swipeableRef = ref; }}
      friction={2}
      leftThreshold={60}
      rightThreshold={60}
      renderRightActions={isMe ? renderReplyAction : undefined}
      renderLeftActions={!isMe ? renderReplyAction : undefined}
      onSwipeableWillOpen={onSwipeableWillOpen}
      onSwipeableOpen={() => {
        onSwipeReply(item);
        setTimeout(() => {
          swipeableRef?.close();
        }, 100);
      }}
    >
      <MessageBubble
        item={statusDecorated}
        isMe={isMe}
        revealToken={revealToken}
        groupPosition={groupPosition}
        avatar={avatarUri}
        senderName={senderName}
        onLongPress={(msg, rect) => onLongPress(msg, rect, groupPosition)}
        onPressCall={(msg) => onPressCall(msg)}
        onPressMedia={onPressMedia}
        onPressReaction={(emoji) => onPressReaction(item, emoji)}
        onRetry={onRetry}
        onPressMusic={onPressMusic}
        onPressMovie={onPressMovie}
      />
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  replyActionContainer: {
    width: 80,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  replyActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

export default memo(ChatRow);
