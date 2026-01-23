import * as Haptics from 'expo-haptics';
import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    doc,
    deleteDoc,
    getDocs,
    increment,
    limit,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { firestore } from '../../../constants/firebase';
import { supabase, supabaseConfigured } from '../../../constants/supabase';
import { useUser } from '../../../hooks/use-user';
import { logInteraction, recommendForFeed } from '../../../lib/algo';
import { getPersistedCache, setPersistedCache } from '@/lib/persistedCache';
import { notifyPush } from '../../../lib/pushApi';
import type { FeedCardItem, Comment as FeedComment } from '../../../types/social-feed';

export type ReviewItem = FeedCardItem & {
  docId?: string;
  origin?: 'firestore' | 'supabase';
  likerIds?: string[];
};

export function useSocialReactions() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  const cacheKey = `__movieflix_social_feed_v1:${user?.uid ? String(user.uid) : 'anon'}`;
  const hydratedFromCacheRef = useRef(false);
  const likeInFlightRef = useRef<Set<ReviewItem['id']>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await getPersistedCache<ReviewItem[]>(cacheKey, { maxAgeMs: 8 * 60 * 1000 });
      if (cancelled) return;
      if (cached?.value?.length) {
        hydratedFromCacheRef.current = true;
        setReviews(cached.value);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const refreshReviews = useCallback(async () => {
    if (!hydratedFromCacheRef.current) setLoading(true);
    const extractTags = (text?: string): string[] => {
      if (!text) return [];
      const matches = Array.from(
        new Set((text.match(/#[A-Za-z0-9_\-]+/g) || []).map((t) => t.toLowerCase())),
      );
      return matches.map((m) => m.replace(/^#/, ''));
    };
    try {
      let items: ReviewItem[] = [];

      if (supabaseConfigured) {
        const { data: posts, error } = await supabase
          .from('posts')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('Failed to load posts from Supabase', error);
        } else if (posts && posts.length > 0) {
          items = posts.map((row: any, index: number) => {
            const createdAt = row.created_at ? new Date(row.created_at) : new Date();
            const isVideo = row.media_type === 'video';
            const mediaUrl = row.media_url as string | null;
            const likerIds = row.likerIds || [];
            const liked = user?.uid ? likerIds.includes(user.uid) : false;

            return {
              id: row.id ?? index + 1,
              docId: undefined,
              origin: 'supabase',
              userId: row.userId ?? row.user_id ?? null,
              user: row.userDisplayName || row.userName || row.user || 'watcher',
              avatar: row.userAvatar || undefined,
              date: createdAt.toLocaleDateString(),
              review: row.review || row.content || '',
              tags: extractTags(row.review || row.content || ''),
              movie: row.title || row.movie || undefined,
              image: !isVideo && mediaUrl ? { uri: mediaUrl } : undefined,
              genres: row.genres || [],
              likes: row.likes ?? 0,
              likerIds,
              commentsCount: row.commentsCount ?? row.comments_count ?? 0,
              comments: row.comments || undefined,
              watched: row.watched ?? 0,
              retweet: false,
              liked,
              bookmarked: false,
              videoUrl: isVideo ? mediaUrl || undefined : undefined,
            };
          });
        }
      }

      if (items.length === 0) {
        const reviewsRef = collection(firestore, 'reviews');
        const q = query(reviewsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          setReviews([]);
          setLoading(false);
          return;
        }

        items = await Promise.all(
          snapshot.docs.map(async (docSnap) => {
            const data = docSnap.data() as any;
            const createdAt = (data.createdAt as any)?.toDate
              ? (data.createdAt as any).toDate()
              : new Date();

            let comments: FeedComment[] | undefined = undefined;
            try {
              const commentsRef = collection(firestore, 'reviews', docSnap.id, 'comments');
              const commentsQuery = query(commentsRef, orderBy('createdAt', 'desc'), limit(20));
              const commentsSnap = await getDocs(commentsQuery);
              if (!commentsSnap.empty) {
                comments = commentsSnap.docs.map((commentDoc) => {
                  const commentData = commentDoc.data() as any;
                  return {
                    id: commentDoc.id,
                    user:
                      commentData.userDisplayName ||
                      commentData.userName ||
                      commentData.user ||
                      'Movie fan',
                    text: commentData.text || '',
                    spoiler: Boolean(commentData.spoiler),
                  };
                });
              }
            } catch (err) {
              console.warn('Failed to load comments for review', docSnap.id, err);
            }
            
            const likerIds = data.likerIds || [];
            const liked = user?.uid ? likerIds.includes(user.uid) : false;

            return {
              id: docSnap.id,
              docId: docSnap.id,
              origin: 'firestore' as const,
              userId: data.userId ?? data.ownerId ?? null,
              user: data.userDisplayName || data.userName || 'watcher',
              avatar: data.userAvatar || undefined,
              date: createdAt.toLocaleDateString(),
              review: data.review || '',
              tags: extractTags(data.review || ''),
              movie: data.title || data.movie || undefined,
              image:
                data.type === 'video'
                  ? undefined
                  : data.mediaUrl
                  ? { uri: data.mediaUrl }
                  : undefined,
              genres: data.genres || [],
              likes: data.likes ?? 0,
              likerIds,
              commentsCount: data.commentsCount ?? (comments ? comments.length : 0),
              comments,
              watched: data.watched ?? 0,
              retweet: false,
              liked,
              bookmarked: false,
              videoUrl: data.videoUrl || (data.type === 'video' ? data.mediaUrl : undefined),
            };
          }),
        );
      }

      try {
        const ranked = await recommendForFeed(items, { userId: user?.uid ?? null, friends: [] });
        const finalItems = ranked as ReviewItem[];
        setReviews(finalItems);
        void setPersistedCache(cacheKey, finalItems);
      } catch (e) {
        setReviews(items);
        void setPersistedCache(cacheKey, items);
      }
    } catch (error) {
      console.warn('Failed to load social reviews from Firestore', error);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, user?.uid]);

  useEffect(() => {
    refreshReviews();
  }, [refreshReviews]);

  const triggerHaptic = useCallback((type: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(type);
    }
  }, []);

  const createNotification = useCallback(
    async ({
      targetUid,
      type,
      actorName,
      actorAvatar,
      targetId,
      docPath,
      message,
    }: {
      targetUid?: string | null;
      type: 'like' | 'comment';
      actorName: string;
      actorAvatar?: string | null;
      targetId?: string | number;
      docPath?: string;
      message: string;
    }) => {
      if (!targetUid || !user?.uid || targetUid === user.uid) return;
      try {
        const ref = await addDoc(collection(firestore, 'notifications'), {
          type,
          scope: 'social',
          channel: 'community',
          actorId: user.uid,
          actorName,
          actorAvatar: actorAvatar ?? null,
          targetUid,
          targetType: 'feed',
          targetId: targetId ?? null,
          docPath: docPath ?? null,
          message,
          read: false,
          createdAt: serverTimestamp(),
        });

        void notifyPush({ kind: 'notification', notificationId: ref.id });
      } catch (err) {
        console.warn('Failed to create notification', err);
      }
    },
    [user?.uid, user?.displayName],
  );

  const handleLike = useCallback(
    async (id: ReviewItem['id']) => {
      const uid = user?.uid ? String(user.uid) : null;
      const targetReview = reviews.find((item) => item.id === id);
      if (!targetReview || !uid) return;

      if (likeInFlightRef.current.has(id)) return;
      likeInFlightRef.current.add(id);

      const prevLiked = Boolean(targetReview.liked);
      const prevLikes = Number(targetReview.likes ?? 0) || 0;
      const prevLikerIds = Array.isArray(targetReview.likerIds) ? targetReview.likerIds : [];

      const nextLiked = !prevLiked;
      const delta = nextLiked ? 1 : -1;

      triggerHaptic(nextLiked ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);

      // optimistic
      setReviews((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const baseLikerIds = Array.isArray(item.likerIds) ? item.likerIds : [];
          const nextLikerIds = nextLiked
            ? Array.from(new Set([...baseLikerIds, uid]))
            : baseLikerIds.filter((x) => x !== uid);
          return {
            ...item,
            liked: nextLiked,
            likes: Math.max(0, (Number(item.likes ?? 0) || 0) + delta),
            likerIds: nextLikerIds,
          };
        }),
      );

      try {
        if (targetReview.origin === 'firestore' && targetReview.docId) {
          const reviewRef = doc(firestore, 'reviews', targetReview.docId);
          const result = await runTransaction(firestore, async (tx) => {
            const snap = await tx.get(reviewRef);
            if (!snap.exists()) return null;
            const data = snap.data() as any;
            const likerIds = Array.isArray(data?.likerIds) ? data.likerIds.map(String) : [];
            const currentlyLiked = likerIds.includes(uid);

            if (currentlyLiked === nextLiked) {
              const likesRaw = Number(data?.likes);
              const safeLikes = Number.isFinite(likesRaw) ? likesRaw : likerIds.length;
              return { liked: currentlyLiked, likes: Math.max(0, safeLikes), likerIds };
            }

            const nextLikerIds = nextLiked
              ? Array.from(new Set([...likerIds, uid]))
              : likerIds.filter((x) => x !== uid);
            const likesRaw = Number(data?.likes);
            const baseLikes = Number.isFinite(likesRaw) ? likesRaw : likerIds.length;
            const nextLikes = Math.max(0, baseLikes + (nextLiked ? 1 : -1));

            tx.update(reviewRef, {
              likes: nextLikes,
              likerIds: nextLikerIds,
              updatedAt: serverTimestamp(),
            });

            return { liked: nextLiked, likes: nextLikes, likerIds: nextLikerIds };
          });

          if (result) {
            setReviews((prev) => prev.map((item) => (item.id === id ? { ...item, ...result } : item)));

            if (!prevLiked && result.liked) {
              const actorName = user?.displayName || user?.email?.split('@')[0] || 'Movie fan';
              createNotification({
                targetUid: targetReview.userId,
                type: 'like',
                actorName,
                actorAvatar: (user as any)?.photoURL ?? null,
                targetId: targetReview.docId,
                docPath: `reviews/${targetReview.docId}`,
                message: `${actorName} liked your feed${targetReview.movie ? ` about "${targetReview.movie}"` : ''}.`,
              });
            }

            try {
              void logInteraction({
                type: 'like',
                actorId: uid,
                targetId: id,
                targetType: 'feed_post',
                targetUserId: targetReview.userId ?? null,
                meta: {
                  movie: targetReview.movie,
                  genres: targetReview.genres,
                  hasMedia: !!(targetReview.image || targetReview.videoUrl)
                }
              });
            } catch {
              /* ignore */
            }
          }
        }
      } catch (err) {
        console.warn('Failed to persist like', err);
        setReviews((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, liked: prevLiked, likes: prevLikes, likerIds: prevLikerIds }
              : item,
          ),
        );
      } finally {
        likeInFlightRef.current.delete(id);
      }
    },
    [createNotification, reviews, user, triggerHaptic],
  );

  const handleBookmark = useCallback((id: ReviewItem['id']) => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
    setReviews((prev) =>
      prev.map((item) => (item.id === id ? { ...item, bookmarked: !item.bookmarked } : item))
    );
    
    const target = reviews.find(r => r.id === id);
    if (target && user?.uid) {
      void logInteraction({
        type: 'share', 
        actorId: user.uid,
        targetId: id,
        targetType: 'feed_post',
        meta: { movie: target.movie }
      });
    }
  }, [reviews, user?.uid, triggerHaptic]);

  const handleComment = useCallback((id: ReviewItem['id'], text?: string) => {
    const trimmed = text?.trim();
    if (!trimmed) return;

    const commenter =
      user?.displayName || user?.email?.split('@')[0] || user?.uid || 'You';

    const localComment = {
      id: Date.now(),
      user: commenter,
      text: trimmed,
      spoiler: false,
    };

    const target = reviews.find((r) => r.id === id);
    const pendingDocId = target && target.origin === 'firestore' && target.docId ? target.docId : null;

    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);

    setReviews((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          commentsCount: item.commentsCount + 1,
          comments: [localComment, ...(item.comments || [])],
        };
      })
    );

    try {
      void logInteraction({ 
        type: 'comment', 
        actorId: user?.uid ?? null, 
        targetId: id, 
        targetType: 'feed_post',
        targetUserId: target?.userId ?? null, 
        meta: { 
          snippet: (trimmed || '').slice(0, 120),
          movie: target?.movie,
          genres: target?.genres
        } 
      });
    } catch (e) { /* ignore */ }

    if (pendingDocId) {
      const reviewRef = doc(firestore, 'reviews', pendingDocId);
      const commentsRef = collection(reviewRef, 'comments');
      const payload = {
        userId: user?.uid ?? 'anonymous',
        userDisplayName: commenter,
        text: trimmed,
        spoiler: false,
        createdAt: serverTimestamp(),
      };

      const commentPromise = addDoc(commentsRef, payload).then((commentDoc) => {
        createNotification({
          targetUid: target?.userId,
          type: 'comment',
          actorName: commenter,
          actorAvatar: (user as any)?.photoURL ?? null,
          targetId: pendingDocId,
          docPath: commentDoc.path,
          message: `${commenter} commented on your feed${trimmed ? `: "${trimmed.slice(0, 60)}${trimmed.length > 60 ? '…' : ''}"` : ''}`,
        });
      });

      Promise.all([
        updateDoc(reviewRef, {
          commentsCount: increment(1),
          updatedAt: serverTimestamp(),
        }),
        commentPromise,
      ]).catch((err) => console.warn('Failed to persist comment', err));
    }
  }, [reviews, user, triggerHaptic, createNotification]);

  const handleWatch = useCallback((id: ReviewItem['id']) => {
    setReviews((prev) =>
      prev.map((item) => (item.id === id ? { ...item, watched: item.watched + 1 } : item))
    );
    const target = reviews.find(r => r.id === id);
    if (target && user?.uid) {
      void logInteraction({
        type: 'view',
        actorId: user.uid,
        targetId: id,
        targetType: 'feed_post',
        meta: { movie: target.movie, genres: target.genres }
      });
    }
  }, [reviews, user?.uid]);

  const handleShare = (id: ReviewItem['id']) => {
    Alert.alert('Share', `Share review ${id}`);
  };

  const deleteReview = useCallback(
    async (id: ReviewItem['id']) => {
      const target = reviews.find((r) => r.id === id);
      if (!target) return;
      if (!user?.uid || !target.userId || String(target.userId) !== String(user.uid)) return;

      setReviews((prev) => prev.filter((r) => r.id !== id));

      try {
        if (target.origin === 'supabase') {
          if (!supabaseConfigured) return;
          const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', target.id)
            .or(`userId.eq.${user.uid},user_id.eq.${user.uid}`);
          if (error) throw error;
          return;
        }

        const docId = target.docId ?? (typeof target.id === 'string' ? target.id : null);
        if (!docId) return;

        try {
          const commentsRef = collection(firestore, 'reviews', docId, 'comments');
          const commentsSnap = await getDocs(query(commentsRef, limit(250)));
          await Promise.all(commentsSnap.docs.map((d) => deleteDoc(d.ref)));
        } catch (err) {
          console.warn('Failed to delete review comments', err);
        }

        await deleteDoc(doc(firestore, 'reviews', docId));
      } catch (err) {
        console.warn('Failed to delete review', err);
        setReviews((prev) => {
          const exists = prev.some((r) => r.id === id);
          if (exists) return prev;
          return [target, ...prev];
        });
      }
    },
    [reviews, user?.uid],
  );

  const shuffleReviews = useCallback(() => {
    setReviews((prev) => {
      const a = [...prev];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
      }
      return a;
    });
  }, []);

  return {
    reviews,
    loading,
    refreshReviews,
    shuffleReviews,
    handleLike,
    handleBookmark,
    handleComment,
    handleWatch,
    handleShare,
    deleteReview,
  } as const;
}

export default useSocialReactions;