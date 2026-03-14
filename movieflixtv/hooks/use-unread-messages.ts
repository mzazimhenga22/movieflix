import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import { firestore } from '../constants/firebase';
import { useUser } from './use-user';

type Conversation = {
  id: string;
  lastMessage?: string;
  updatedAt?: any;
  lastMessageSenderId?: string | null;
  status?: 'active' | 'pending' | 'archived' | string;
  requestInitiatorId?: string | null;
  lastReadAtBy?: Record<string, any>;
};

function tsToMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return null;
}

function computeUnreadForConversation(conversation: Conversation, uid: string): number {
  if (!uid) return 0;
  const hasLastMessage = Boolean(conversation.lastMessage);
  const lastSenderIsNotMe = Boolean(conversation.lastMessageSenderId) && conversation.lastMessageSenderId !== uid;
  if (!hasLastMessage || !lastSenderIsNotMe) return 0;

  if (conversation.status === 'pending' && conversation.requestInitiatorId && conversation.requestInitiatorId !== uid) {
    return 0;
  }

  const lastReadMs = tsToMillis(conversation.lastReadAtBy?.[uid]);
  const updatedAtMs = tsToMillis(conversation.updatedAt);
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

    const q = query(
      collection(firestore, 'conversations'),
      where('members', 'array-contains', uid),
      orderBy('updatedAt', 'desc'),
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const next: Conversation[] = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setConversations(next);
      },
      () => {
        setConversations([]);
      },
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
