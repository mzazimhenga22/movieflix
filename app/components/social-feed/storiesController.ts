import {
    Timestamp,
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    query,
    where,
} from 'firebase/firestore';
import { firestore } from '../../../constants/firebase';
import { recommendForStories } from '../../../lib/algo';

const storiesCollection = collection(firestore, 'stories');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let prunePromise: Promise<void> | null = null;
let lastPrune = 0;

const pruneExpiredStories = async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - ONE_DAY_MS);
  try {
    const expiredQuery = query(storiesCollection, where('createdAt', '<', cutoff));
    const snapshots = await getDocs(expiredQuery);
    await Promise.all(
      snapshots.docs.map((docSnap) => deleteDoc(doc(firestore, 'stories', docSnap.id)))
    );
  } catch (err) {
    console.warn('[storiesController] failed to prune expired stories', err);
  } finally {
    prunePromise = null;
    lastPrune = Date.now();
  }
};

const ensurePruneScheduled = () => {
  if (prunePromise) return;
  if (Date.now() - lastPrune < 5 * 60 * 1000) return;
  prunePromise = pruneExpiredStories();
};

export const onStoriesUpdate = (callback: (stories: any[]) => void) => {
  return onStoriesUpdateForViewer(callback, { viewerId: null });
};

export const onStoriesUpdateForViewer = (
  callback: (stories: any[]) => void,
  options: { viewerId: string | null } = { viewerId: null },
) => {
  const cutoff = Timestamp.fromMillis(Date.now() - ONE_DAY_MS);
  const q = query(storiesCollection, where('createdAt', '>=', cutoff));

  let followingSet = new Set<string>();
  let blockedSet = new Set<string>();
  const viewerId = options?.viewerId ? String(options.viewerId) : null;

  const unsubViewer = viewerId
    ? onSnapshot(
        doc(firestore, 'users', viewerId),
        (snap) => {
          const following = (snap.data() as any)?.following;
          followingSet = new Set(Array.isArray(following) ? following.map(String) : []);

          const blockedUsers = (snap.data() as any)?.blockedUsers;
          blockedSet = new Set(Array.isArray(blockedUsers) ? blockedUsers.map(String) : []);
        },
        () => {
          followingSet = new Set();
          blockedSet = new Set();
        },
      )
    : null;

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const rawStories = snapshot.docs
      .map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }))
      .sort((a, b) => {
        const aTime = a?.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bTime = b?.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return aTime - bTime;
      });

    // Privacy: only show stories from people the viewer follows + self.
    // Guard: exclude stories from blocked users.
    const stories = viewerId
      ? rawStories.filter((s: any) => {
          const uid = s?.userId ? String(s.userId) : '';
          if (!uid) return false;
          if (uid === viewerId) return true;
          if (blockedSet.has(uid)) return false;
          return followingSet.has(uid);
        })
      : [];

    (async () => {
      try {
        const ranked = await recommendForStories(stories, { friends: [] });
        callback(ranked);
      } catch (e) {
        callback(stories);
      }
    })();
    ensurePruneScheduled();
  });

  ensurePruneScheduled();
  return () => {
    unsubscribe();
    unsubViewer?.();
  };
};

// dummy default export for expo-router route scanning
export default {};
