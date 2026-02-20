import { authPromise } from '@/constants/firebase';
import { declineCall, listenToActiveCallsForUser } from '@/lib/calls/callService';
import type { CallSession } from '@/lib/calls/types';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutUp } from 'react-native-reanimated';

import { onConversationsUpdate, sendMessage, type Conversation } from '../messaging/controller';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type ConversationStamp = {
  updatedAtMs: number;
  lastMessage: string | null;
  lastMessageSenderId: string | null;
};

const tsToMillis = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  return 0;
};

const isCallEventMessage = (text?: string | null): boolean => {
  const t = (text ?? '').trim();
  if (!t) return false;
  return (
    t === 'Call ended' ||
    t.startsWith('Started voice call') ||
    t.startsWith('Started video call') ||
    t.startsWith('Missed voice call') ||
    t.startsWith('Missed video call') ||
    t.startsWith('Declined voice call') ||
    t.startsWith('Declined video call')
  );
};

const shouldTreatAsIncomingCall = (call: CallSession, userId: string): boolean => {
  if (!call?.id || !userId) return false;
  if (call.initiatorId === userId) return false;
  if (!call.members?.includes(userId)) return false;
  if (call.status === 'ended' || call.status === 'declined' || call.status === 'missed') return false;

  if ((call as any).isGroup && (call as any).acceptedBy && (call as any).acceptedBy !== userId) {
    return false;
  }

  const timeoutMillis =
    (call as any)?.ringTimeoutAt && typeof (call as any).ringTimeoutAt?.toMillis === 'function'
      ? (call as any).ringTimeoutAt.toMillis()
      : null;
  if (typeof timeoutMillis === 'number' && Date.now() > timeoutMillis && call.status !== 'active') {
    return false;
  }

  const participant = (call as any)?.participants?.[userId];
  if (participant && ['declined', 'left'].includes(participant.state)) {
    return false;
  }

  return true;
};

const notifyCall = async (call: CallSession) => {
  const caller = (call.initiatorName && String(call.initiatorName).trim()) ? String(call.initiatorName) : 'Someone';
  const title = call.type === 'video' ? 'Incoming video call' : 'Incoming voice call';
  const body = `${caller} is calling you`;

  await Notifications.scheduleNotificationAsync({
    identifier: `call:${call.id}`,
    content: {
      title,
      body,
      sound: 'default', // Keep sound for background/killed state
      channelId: 'calls',
      data: { type: 'call', callId: call.id },
      priority: Notifications.AndroidNotificationPriority.MAX,
    } as any,
    trigger: null as any,
  });
};

const notifyMessage = async (conv: Conversation) => {
  const isGroup = !!conv.isGroup;
  const title =
    (isGroup ? conv.name : (conv as any).displayName) ||
    (conv as any).title ||
    conv.name ||
    'New message';

  const body = conv.lastMessageHasMedia
    ? 'Sent an attachment'
    : (conv.lastMessage && String(conv.lastMessage).trim())
      ? String(conv.lastMessage)
      : 'New message';

  await Notifications.scheduleNotificationAsync({
    identifier: `msg:${conv.id}`,
    content: {
      title: String(title),
      body,
      sound: 'default',
      channelId: 'messages',
      data: { type: 'message', conversationId: conv.id },
      priority: Notifications.AndroidNotificationPriority.HIGH,
    } as any,
    trigger: null as any,
  });
};

export default function GlobalRealtimeNotifications() {
  const didSeedConversationsRef = useRef(false);
  const convStampByIdRef = useRef<Map<string, ConversationStamp>>(new Map());
  const notifiedCallIdsRef = useRef<Set<string>>(new Set());
  const [currentUser, setCurrentUser] = useState<any>(null);

  // UI State
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [activeMessage, setActiveMessage] = useState<Conversation | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  // Sound
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let unsubAuth: (() => void) | null = null;
    let unsubCalls: (() => void) | null = null;
    let unsubConversations: (() => void) | null = null;

    const cleanup = () => {
      try { unsubCalls?.(); } catch { }
      try { unsubConversations?.(); } catch { }
      unsubCalls = null;
      unsubConversations = null;
      didSeedConversationsRef.current = false;
      convStampByIdRef.current = new Map();
      notifiedCallIdsRef.current = new Set();
    };

    void authPromise.then((auth) => {
      unsubAuth = onAuthStateChanged(auth, (user) => {
        cleanup();
        setCurrentUser(user);
        if (!user?.uid) return;

        const uid = user.uid;

        // -- CALLS LISTENER --
        unsubCalls = listenToActiveCallsForUser(uid, (calls) => {
          let foundIncoming = false;
          for (const call of calls) {
            if (!shouldTreatAsIncomingCall(call, uid)) continue;

            // If we found a valid incoming call
            if (call.status === 'ringing' || call.status === 'initiated') {
              setIncomingCall(call);
              foundIncoming = true;

              // Play sound/vibrate if new
              if (!notifiedCallIdsRef.current.has(call.id)) {
                notifiedCallIdsRef.current.add(call.id);
                // Trigger system notification for background wake-up
                // In foreground, this might double-notify if not handled, but ensures Max Priority
                void notifyCall(call).catch(() => { });
              }
              break; // Only handle one incoming call at a time
            }
          }
          if (!foundIncoming) {
            setIncomingCall(null);
          }
        });

        // -- MESSAGES LISTENER --
        unsubConversations = onConversationsUpdate((convs) => {
          if (!didSeedConversationsRef.current) {
            didSeedConversationsRef.current = true;
            const seed = new Map<string, ConversationStamp>();
            for (const c of convs) {
              seed.set(c.id, {
                updatedAtMs: tsToMillis(c.updatedAt),
                lastMessage: c.lastMessage ? String(c.lastMessage) : null,
                lastMessageSenderId: c.lastMessageSenderId ? String(c.lastMessageSenderId) : null,
              });
            }
            convStampByIdRef.current = seed;
            return;
          }

          for (const c of convs) {
            if (!c?.id || c.muted || c.status === 'archived') continue;

            const updatedAtMs = tsToMillis(c.updatedAt);
            const lastMessage = c.lastMessage ? String(c.lastMessage) : null;
            const lastMessageSenderId = c.lastMessageSenderId ? String(c.lastMessageSenderId) : null;

            const prev = convStampByIdRef.current.get(c.id);
            const changed = updatedAtMs > (prev?.updatedAtMs ?? 0) || lastMessage !== prev?.lastMessage;

            if (!changed) continue;

            convStampByIdRef.current.set(c.id, { updatedAtMs, lastMessage, lastMessageSenderId });

            if (!lastMessageSenderId || lastMessageSenderId === uid) continue;
            if (isCallEventMessage(lastMessage)) continue;

            // Show Banner UI
            setActiveMessage(c);

            // Also trigger system notification for background/watch scenarios
            void notifyMessage(c).catch(() => { });

            // Auto hide banner after 5s if not replying
            setTimeout(() => {
              setActiveMessage(prev => prev?.id === c.id ? null : prev);
            }, 5000);
          }
        },
          { uid },
        );
      });
    });

    return () => {
      cleanup();
      unsubAuth?.();
    };
  }, []);

  // -- ACTIONS --

  const handleAcceptCall = () => {
    if (!incomingCall) return;
    const callId = incomingCall.id;
    setIncomingCall(null); // Hide overlay
    router.push({ pathname: '/calls/[id]', params: { id: callId } });
  };

  const handleDeclineCall = async () => {
    if (!incomingCall || !currentUser?.uid) return;
    const callId = incomingCall.id;
    setIncomingCall(null);
    await declineCall(callId, currentUser.uid);
  };

  const handleSendReply = async () => {
    if (!activeMessage || !replyText.trim() || !currentUser?.uid) return;
    const cid = activeMessage.id;
    const text = replyText.trim();
    setReplyText('');
    setIsReplying(false);
    setActiveMessage(null);
    await sendMessage(cid, { text });
  };

  const handleMsgPress = () => {
    if (!activeMessage) return;
    router.push({ pathname: '/messaging/chat/[id]', params: { id: activeMessage.id } });
    setActiveMessage(null);
  };

  // -- RENDER --

  if (!incomingCall && !activeMessage) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

      {/* 1. INCOMING CALL OVERLAY (WhatsApp Style) */}
      {incomingCall && (
        <Animated.View exiting={FadeOut} entering={FadeIn} style={[StyleSheet.absoluteFill, styles.callOverlay]}>
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />

          <View style={styles.callContent}>
            <View style={styles.callerInfo}>
              <View style={styles.largeAvatar}>
                <Text style={styles.avatarText}>
                  {incomingCall.initiatorName?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
              <Text style={styles.callerName}>{incomingCall.initiatorName || 'Unknown Caller'}</Text>
              <Text style={styles.callStatus}>Incoming {incomingCall.type} call...</Text>
            </View>

            <View style={styles.callActions}>
              <View style={styles.actionBtnContainer}>
                <TouchableOpacity style={[styles.callBtn, styles.declineBtn]} onPress={handleDeclineCall}>
                  <Ionicons name="call" size={32} color="white" style={{ transform: [{ rotate: '135deg' }] }} />
                </TouchableOpacity>
                <Text style={styles.btnLabel}>Decline</Text>
              </View>

              <View style={styles.actionBtnContainer}>
                <TouchableOpacity style={[styles.callBtn, styles.acceptBtn]} onPress={handleAcceptCall}>
                  <Ionicons name="call" size={32} color="white" />
                </TouchableOpacity>
                <Text style={styles.btnLabel}>Accept</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      )}

      {/* 2. MESSAGE BANNER (Top Toast) */}
      {activeMessage && !incomingCall && (
        <Animated.View entering={SlideInUp} exiting={SlideOutUp} style={styles.msgBannerWrapper}>
          <BlurView intensity={80} tint="dark" style={styles.msgBanner}>
            <TouchableOpacity activeOpacity={0.9} onPress={handleMsgPress} style={styles.msgContent}>
              <View style={styles.msgHeader}>
                <View style={styles.minAvatar}>
                  <Text style={styles.minAvatarText}>
                    {(activeMessage as any).name?.[0] || activeMessage.id[0]}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.msgTitle} numberOfLines={1}>
                    {(activeMessage as any).name || (activeMessage as any).title || 'Message'}
                  </Text>
                  <Text style={styles.msgPreview} numberOfLines={1}>
                    {String(activeMessage.lastMessage)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {isReplying ? (
              <View style={styles.replyContainer}>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Type a reply..."
                  placeholderTextColor="#888"
                  autoFocus
                  value={replyText}
                  onChangeText={setReplyText}
                  onSubmitEditing={handleSendReply}
                />
                <TouchableOpacity onPress={handleSendReply} style={styles.sendBtn}>
                  <Ionicons name="send" size={20} color="#E50914" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.bannerActions}>
                <TouchableOpacity style={styles.bannerBtn} onPress={() => setIsReplying(true)}>
                  <Text style={styles.bannerBtnText}>Reply</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bannerBtn} onPress={() => setActiveMessage(null)}>
                  <Text style={styles.bannerBtnText}>Dimiss</Text>
                </TouchableOpacity>
              </View>
            )}
          </BlurView>
        </Animated.View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  // Call Overlay
  callOverlay: {
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 100,
    alignItems: 'center',
    width: '100%',
  },
  callerInfo: {
    alignItems: 'center',
  },
  largeAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarText: {
    fontSize: 48,
    color: '#fff',
    fontWeight: 'bold',
  },
  callerName: {
    fontSize: 28,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  callStatus: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
  },
  callActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '80%',
  },
  actionBtnContainer: {
    alignItems: 'center',
    gap: 8,
  },
  callBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  acceptBtn: {
    backgroundColor: '#4CD964',
  },
  declineBtn: {
    backgroundColor: '#FF3B30',
  },
  btnLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  // Message Banner
  msgBannerWrapper: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 10,
    right: 10,
    zIndex: 9990,
  },
  msgBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  msgContent: {
    padding: 12,
  },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  minAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E50914',
    justifyContent: 'center',
    alignItems: 'center',
  },
  minAvatarText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  msgTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 2,
  },
  msgPreview: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  bannerActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  bannerBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bannerBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  replyInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: 'white',
    marginRight: 8,
  },
  sendBtn: {
    padding: 8,
  },
});
