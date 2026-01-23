import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, runTransaction } from 'firebase/firestore';

import { authPromise, firestore } from '../../constants/firebase';

export type StreakContext =
  | { kind: 'chat'; conversationId: string; partnerId?: string | null; partnerName?: string | null }
  | { kind: 'story'; userId: string; username?: string | null }
  | { kind: 'feed_like'; userId?: string | null }
  | { kind: 'feed_comment'; userId?: string | null }
  | { kind: 'feed_share'; userId?: string | null };

type StoredStreak = {
  count: number;
  lastDate: string;
  partnerId?: string | null;
  partnerName?: string | null;
  type?: string;
};

const utcDayKey = (d: Date = new Date()) => d.toISOString().slice(0, 10);

const dayKeyToUtcStartMs = (dayKey: string): number => {
  const ms = Date.parse(`${dayKey}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : Date.now();
};

const addDaysToDayKey = (dayKey: string, deltaDays: number): string => {
  return utcDayKey(new Date(dayKeyToUtcStartMs(dayKey) + deltaDays * 24 * 60 * 60 * 1000));
};

const endOfDayUtcMs = (dayKey: string): number => {
  const ms = Date.parse(`${dayKey}T23:59:59.999Z`);
  return Number.isFinite(ms) ? ms : Date.now();
};

const updateChatStreakInFirestore = async (conversationId: string): Promise<void> => {
  const auth = await authPromise;
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const conversationRef = doc(firestore, 'conversations', conversationId);
  const today = utcDayKey();
  const yesterday = addDaysToDayKey(today, -1);

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(conversationRef);
    if (!snap.exists()) return;

    const data = snap.data() as any;
    if (data?.isGroup || data?.isBroadcast) return;

    const members = Array.isArray(data?.members) ? (data.members as any[]).map(String) : [];
    if (members.length !== 2 || !members.includes(uid)) return;

    const otherId = members.find((m) => m !== uid);
    if (!otherId) return;

    const lastActiveBy: Record<string, string> = {
      ...(typeof data?.streakLastActiveDayByUid === 'object' && data.streakLastActiveDayByUid
        ? data.streakLastActiveDayByUid
        : {}),
    };
    lastActiveBy[uid] = today;

    const prevCount = Number(data?.streakCount ?? 0) || 0;
    const prevLastDay = typeof data?.streakLastDay === 'string' ? data.streakLastDay : null;
    const prevExpiresAtMs = Number(data?.streakExpiresAtMs ?? 0) || 0;
    const otherActiveToday = lastActiveBy[otherId] === today;

    const updates: Record<string, any> = {
      streakLastActiveDayByUid: lastActiveBy,
    };

    // If the streak already expired, clear it (it can restart when both are active again).
    if (prevCount > 0 && prevExpiresAtMs > 0 && prevExpiresAtMs <= Date.now()) {
      updates.streakCount = 0;
      updates.streakLastDay = '';
      updates.streakExpiresAtMs = 0;
    }

    // Snapchat-style: streak only advances when BOTH people have activity on the same day.
    if (otherActiveToday && prevLastDay !== today) {
      updates.streakCount = prevLastDay === yesterday ? prevCount + 1 : 1;
      updates.streakLastDay = today;
      // Give them until end-of-day tomorrow (UTC) to keep the streak alive.
      updates.streakExpiresAtMs = endOfDayUtcMs(addDaysToDayKey(today, 1));
    }

    tx.set(conversationRef, updates, { merge: true });
  });
};

const buildKey = (ctx: StreakContext): string => {
  switch (ctx.kind) {
    case 'chat':
      return `streak:chat:${ctx.conversationId}`;
    case 'story':
      return `streak:story:${ctx.userId}`;
    case 'feed_like':
      return 'streak:feed:like';
    case 'feed_comment':
      return 'streak:feed:comment';
    case 'feed_share':
      return 'streak:feed:share';
    default:
      return 'streak:generic';
  }
};

export const updateStreakForContext = async (ctx: StreakContext): Promise<void> => {
  const key = buildKey(ctx);
  const today = utcDayKey();
  const yesterday = addDaysToDayKey(today, -1);

  if (ctx.kind === 'chat') {
    try {
      await updateChatStreakInFirestore(ctx.conversationId);
    } catch (err) {
      console.warn('[streaks] Failed to update chat streak in Firestore', err);
    }
  }

  try {
    const raw = await AsyncStorage.getItem(key);
    let stored: StoredStreak | null = null;

    if (raw) {
      try {
        stored = JSON.parse(raw) as StoredStreak;
      } catch {
        stored = null;
      }
    }

    let count = stored?.count ?? 0;
    const lastDate = stored?.lastDate ?? null;

    if (lastDate === today) {
      // already counted today
    } else if (lastDate === yesterday) {
      count += 1;
    } else {
      count = 1;
    }

    const payload: StoredStreak = {
      count,
      lastDate: today,
      type: ctx.kind,
    };

    if (ctx.kind === 'chat') {
      payload.partnerId = ctx.partnerId ?? stored?.partnerId ?? null;
      payload.partnerName = ctx.partnerName ?? stored?.partnerName ?? null;
    } else if (ctx.kind === 'story') {
      payload.partnerId = ctx.userId;
      payload.partnerName = ctx.username ?? stored?.partnerName ?? null;
    }

    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.error('Failed to update streak for context', err);
  }
};

export const getAllStreaks = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const streakKeys = keys.filter((k) => k.startsWith('streak:'));
    if (streakKeys.length === 0) return [];
    const entries = await AsyncStorage.multiGet(streakKeys);
    return entries;
  } catch (err) {
    console.error('Failed to list streaks', err);
    return [];
  }
};

export const getChatStreak = async (
  conversationId: string,
): Promise<{ count: number; lastDate: string } | null> => {
  try {
    // Prefer Firestore-backed streaks.
    try {
      const ref = doc(firestore, 'conversations', conversationId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as any;
        const count = Number(data?.streakCount ?? 0) || 0;
        const lastDate = typeof data?.streakLastDay === 'string' ? data.streakLastDay : null;
        if (count > 0 && lastDate) return { count, lastDate };
      }
    } catch {
      // ignore and fall back to local
    }

    const key = `streak:chat:${conversationId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredStreak;
    return {
      count: data.count ?? 0,
      lastDate: data.lastDate,
    };
  } catch (err) {
    console.error('Failed to read chat streak', err);
    return null;
  }
};
