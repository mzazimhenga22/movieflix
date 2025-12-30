import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { firestore } from '../constants/firebase';

export type SocialProfile = {
  id: string;
  displayName?: string | null;
  photoURL?: string | null;
  status?: string | null;
};

const MAX_IN_QUERY = 10;

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v))
    .map((v) => v.trim())
    .filter(Boolean);
};

const chunk = <T,>(arr: T[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

export const getFollowingIds = async (viewerId: string): Promise<string[]> => {
  if (!viewerId) return [];
  const snap = await getDoc(doc(firestore, 'users', viewerId));
  if (!snap.exists()) return [];
  return normalizeIdList((snap.data() as any)?.following);
};

export const getFollowersIds = async (userId: string): Promise<string[]> => {
  if (!userId) return [];
  const snap = await getDoc(doc(firestore, 'users', userId));
  if (!snap.exists()) return [];
  return normalizeIdList((snap.data() as any)?.followers);
};

export const fetchProfilesByIds = async (ids: string[]): Promise<SocialProfile[]> => {
  const unique = Array.from(new Set((ids || []).map(String).filter(Boolean)));
  if (unique.length === 0) return [];

  const usersRef = collection(firestore, 'users');
  const results: SocialProfile[] = [];
  for (const group of chunk(unique, MAX_IN_QUERY)) {
    const q = query(usersRef, where('__name__', 'in', group));
    const snap = await getDocs(q);
    results.push(
      ...snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          displayName: (data?.displayName as string) ?? null,
          photoURL: (data?.photoURL as string) ?? null,
          status: (data?.status as string) ?? null,
        } satisfies SocialProfile;
      }),
    );
  }

  const order = new Map(unique.map((id, idx) => [id, idx] as const));
  return results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
};

export const getFollowingProfiles = async (userId: string): Promise<SocialProfile[]> => {
  const ids = await getFollowingIds(userId);
  return await fetchProfilesByIds(ids);
};

export const getFollowerProfiles = async (userId: string): Promise<SocialProfile[]> => {
  const ids = await getFollowersIds(userId);
  return await fetchProfilesByIds(ids);
};

export const isBlockedBetween = async (viewerId: string, targetId: string): Promise<boolean> => {
  if (!viewerId || !targetId) return false;
  if (viewerId === targetId) return false;

  const [viewerSnap, targetSnap] = await Promise.all([
    getDoc(doc(firestore, 'users', viewerId)),
    getDoc(doc(firestore, 'users', targetId)),
  ]);

  const viewerBlocked = normalizeIdList((viewerSnap.data() as any)?.blockedUsers);
  const targetBlocked = normalizeIdList((targetSnap.data() as any)?.blockedUsers);

  return viewerBlocked.includes(targetId) || targetBlocked.includes(viewerId);
};

export const followUser = async (options: {
  viewerId: string;
  targetId: string;
  actorName?: string | null;
  actorAvatar?: string | null;
  notify?: boolean;
}): Promise<{ didFollow: boolean }> => {
  const viewerId = String(options.viewerId || '');
  const targetId = String(options.targetId || '');
  if (!viewerId || !targetId) throw new Error('Missing user id');
  if (viewerId === targetId) throw new Error('You cannot follow yourself');

  const viewerRef = doc(firestore, 'users', viewerId);
  const targetRef = doc(firestore, 'users', targetId);

  let didFollow = false;
  await runTransaction(firestore, async (tx) => {
    const [viewerSnap, targetSnap] = await Promise.all([tx.get(viewerRef), tx.get(targetRef)]);
    const viewer = viewerSnap.exists() ? (viewerSnap.data() as any) : {};
    const target = targetSnap.exists() ? (targetSnap.data() as any) : {};

    const viewerBlocked = normalizeIdList(viewer?.blockedUsers);
    const targetBlocked = normalizeIdList(target?.blockedUsers);
    if (viewerBlocked.includes(targetId) || targetBlocked.includes(viewerId)) {
      throw new Error('blocked');
    }

    const viewerFollowing = normalizeIdList(viewer?.following);
    if (viewerFollowing.includes(targetId)) return;

    didFollow = true;
    tx.set(viewerRef, { following: arrayUnion(targetId) }, { merge: true });
    tx.set(targetRef, { followers: arrayUnion(viewerId) }, { merge: true });
  });

  if (didFollow && options.notify) {
    await addDoc(collection(firestore, 'notifications'), {
      type: 'follow',
      scope: 'social',
      channel: 'community',
      actorId: viewerId,
      actorName: options.actorName || 'A new user',
      actorAvatar: options.actorAvatar || null,
      targetUid: targetId,
      message: `${options.actorName || 'A new user'} started following you.`,
      read: false,
      createdAt: serverTimestamp(),
    });
  }

  return { didFollow };
};

export const unfollowUser = async (options: {
  viewerId: string;
  targetId: string;
}): Promise<{ didUnfollow: boolean }> => {
  const viewerId = String(options.viewerId || '');
  const targetId = String(options.targetId || '');
  if (!viewerId || !targetId) throw new Error('Missing user id');
  if (viewerId === targetId) throw new Error('You cannot unfollow yourself');

  const viewerRef = doc(firestore, 'users', viewerId);
  const targetRef = doc(firestore, 'users', targetId);

  let didUnfollow = false;
  await runTransaction(firestore, async (tx) => {
    const viewerSnap = await tx.get(viewerRef);
    const viewer = viewerSnap.exists() ? (viewerSnap.data() as any) : {};
    const viewerFollowing = normalizeIdList(viewer?.following);
    if (!viewerFollowing.includes(targetId)) return;

    didUnfollow = true;
    tx.set(viewerRef, { following: arrayRemove(targetId) }, { merge: true });
    tx.set(targetRef, { followers: arrayRemove(viewerId) }, { merge: true });
  });

  return { didUnfollow };
};

export const ensureUserDoc = async (userId: string, data: Record<string, any>) => {
  if (!userId) return;
  await setDoc(doc(firestore, 'users', userId), data, { merge: true });
};
