import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';

import IncomingCallCard from '@/app/messaging/components/IncomingCallCard';
import { onAuthChange, onConversationsUpdate, type Conversation } from '@/app/messaging/controller';
import { declineCall } from '@/lib/calls/callService';
import useIncomingCall from '@/hooks/useIncomingCall';

function tsToMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return null;
}

function shouldNotifyForConversation(conversation: Conversation, uid: string): boolean {
  if (!uid) return false;

  const hasLastMessage = Boolean((conversation as any)?.lastMessage);
  const lastSender = (conversation as any)?.lastMessageSenderId as string | null | undefined;
  const lastSenderIsNotMe = Boolean(lastSender) && lastSender !== uid;
  if (!hasLastMessage || !lastSenderIsNotMe) return false;

  // Keep parity with messaging screen: hide incoming pending requests from unread prompts.
  const status = (conversation as any)?.status as string | undefined;
  const requestInitiatorId = (conversation as any)?.requestInitiatorId as string | null | undefined;
  if (status === 'pending' && requestInitiatorId && requestInitiatorId !== uid) return false;

  return true;
}

function getActiveChatIdFromPath(pathname: string): string | null {
  // expo-router pathname example: /messaging/chat/abc123
  const prefix = '/messaging/chat/';
  if (!pathname?.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const id = rest.split('/')[0];
  return id ? decodeURIComponent(id) : null;
}

type MessageToast = {
  conversationId: string;
  title: string;
  preview: string;
};

export default function GlobalCommsOverlay(): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  const [uid, setUid] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const incomingCall = useIncomingCall(uid);

  const [toast, setToast] = useState<MessageToast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const convoLastNotifiedMsRef = useRef<Map<string, number>>(new Map());
  const convoInitRef = useRef(false);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Global presence + auth listener (so presence works from *all* screens).
  useEffect(() => {
    const unsub = onAuthChange((user) => {
      setUid(user?.uid ?? null);
      setDisplayName((user as any)?.displayName ?? user?.email ?? null);

      // Reset message-notification state when switching users.
      convoLastNotifiedMsRef.current = new Map();
      convoInitRef.current = false;
    });

    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, []);

  // Global message listener (foreground in-app prompt).
  useEffect(() => {
    if (!uid) {
      setToast(null);
      return;
    }

    const unsub = onConversationsUpdate(
      (conversations) => {
        const map = convoLastNotifiedMsRef.current;

        // Seed on first snapshot to avoid a burst on app start.
        if (!convoInitRef.current) {
          for (const c of conversations) {
            const ms = tsToMillis((c as any)?.updatedAt) ?? 0;
            map.set(c.id, ms);
          }
          convoInitRef.current = true;
          return;
        }

        const activeChatId = getActiveChatIdFromPath(pathnameRef.current);

        for (const c of conversations) {
          const updatedAtMs = tsToMillis((c as any)?.updatedAt) ?? 0;
          const prev = map.get(c.id) ?? 0;
          if (updatedAtMs <= prev) continue;
          map.set(c.id, updatedAtMs);

          if (!shouldNotifyForConversation(c, uid)) continue;
          if (activeChatId && activeChatId === c.id) continue;

          const title =
            (c as any)?.conversationName ||
            (c as any)?.name ||
            ((c as any)?.isGroup ? 'New group message' : 'New message');
          const preview = String((c as any)?.lastMessage ?? '').trim() || 'Open to view';

          setToast({ conversationId: c.id, title, preview });
          break;
        }
      },
      { uid },
    );

    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, [uid]);

  // Auto-hide toast.
  useEffect(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    if (!toast) return;

    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 6_000);

    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [toast]);

  const handleAcceptIncomingCall = useCallback(() => {
    if (!incomingCall?.id) return;
    router.push({ pathname: '/calls/[id]', params: { id: incomingCall.id } });
  }, [incomingCall?.id]);

  const handleDeclineIncomingCall = useCallback(async () => {
    if (!incomingCall?.id || !uid) return;
    try {
      await declineCall(incomingCall.id, uid, displayName ?? null);
    } catch (err) {
      console.warn('Failed to decline call', err);
    }
  }, [displayName, incomingCall?.id, uid]);

  const topOffset = useMemo(() => insets.top + 10, [insets.top]);

  const hasOverlay = Boolean(incomingCall || toast);
  if (!hasOverlay) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View pointerEvents="box-none" style={[styles.stack, { top: topOffset }]}>
        {incomingCall ? (
          <IncomingCallCard call={incomingCall} onAccept={handleAcceptIncomingCall} onDecline={handleDeclineIncomingCall} />
        ) : null}

        {toast ? (
          <Pressable
            onPress={() => {
              router.push({ pathname: '/messaging/chat/[id]', params: { id: toast.conversationId } });
              setToast(null);
            }}
            style={({ pressed }) => [styles.toast, pressed && styles.toastPressed]}
            accessibilityRole="button"
          >
            <View style={styles.toastTextCol}>
              <Text style={styles.toastTitle} numberOfLines={1}>
                {toast.title}
              </Text>
              <Text style={styles.toastPreview} numberOfLines={1}>
                {toast.preview}
              </Text>
            </View>
            <Pressable
              onPress={() => setToast(null)}
              accessibilityRole="button"
              hitSlop={10}
              style={styles.toastDismiss}
            >
              <Text style={styles.toastDismissText}>×</Text>
            </Pressable>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 99999,
  },
  toast: {
    marginHorizontal: 12,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(10,12,24,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  toastPressed: {
    opacity: 0.92,
  },
  toastTextCol: {
    flex: 1,
  },
  toastTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  toastPreview: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
  },
  toastDismiss: {
    marginLeft: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  toastDismissText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 22,
    lineHeight: 22,
    marginTop: -2,
  },
});
