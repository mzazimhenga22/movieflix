import { useEffect, useMemo, useState } from 'react';

import { onConversationsUpdate, type Conversation } from '@/app/messaging/controller';
import { useUser } from './use-user';

function tsToMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return null;
}

function computeUnreadForConversation(conversation: Conversation, uid: string): number {
  if (!uid) return 0;

  const hasLastMessage = Boolean((conversation as any)?.lastMessage);
  const lastSender = (conversation as any)?.lastMessageSenderId as string | null | undefined;
  const lastSenderIsNotMe = Boolean(lastSender) && lastSender !== uid;
  if (!hasLastMessage || !lastSenderIsNotMe) return 0;

  // Keep parity with messaging screen: hide incoming pending requests from unread badge.
  const status = (conversation as any)?.status as string | undefined;
  const requestInitiatorId = (conversation as any)?.requestInitiatorId as string | null | undefined;
  if (status === 'pending' && requestInitiatorId && requestInitiatorId !== uid) return 0;

  const lastRead = (conversation as any)?.lastReadAtBy?.[uid];
  const lastReadMs = tsToMillis(lastRead);
  const updatedAtMs = tsToMillis((conversation as any)?.updatedAt);

  if (!lastReadMs || !updatedAtMs) return 1;
  return lastReadMs >= updatedAtMs - 500 ? 0 : 1;
}

export function useUnreadMessagesBadgeCount(): number {
  const { user } = useUser();
  const uid = user?.uid ?? null;
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    if (!uid) {
      setConversations([]);
      return;
    }

    const unsub = onConversationsUpdate(
      (next) => {
      setConversations(next);
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

  return useMemo(() => {
    if (!uid) return 0;
    let total = 0;
    for (const c of conversations) total += computeUnreadForConversation(c, uid);
    return total;
  }, [conversations, uid]);
}
