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
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { firestore } from '../../../constants/firebase';
import { supabase, supabaseConfigured } from '../../../constants/supabase';
import { useUser } from '../../../hooks/use-user';
import { logInteraction, recommendForFeed } from '../../../lib/algo';
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

  const refreshReviews = useCallback(async () => {
    setLoading(true);
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
        setReviews(ranked as ReviewItem[]);
      } catch (e) {
        setReviews(items);
      }
    } catch (error) {
      console.warn('Failed to load social reviews from Firestore', error);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    refreshReviews();
  }, [refreshReviews]);

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
        await addDoc(collection(firestore, 'notifications'), {
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
      } catch (err) {
        console.warn('Failed to create notification', err);
      }
    },
    [user?.uid, user?.displayName],
  );

  const handleLike = (id: ReviewItem['id']) => {
    const targetReview = reviews.find((item) => item.id === id);
    if (!targetReview || !user?.uid) return;
    const nextLiked = !targetReview.liked;
    const delta = nextLiked ? 1 : -1;

    setReviews((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              liked: nextLiked,
              likes: Math.max(0, item.likes + delta),
              likerIds: nextLiked
                ? [...(item.likerIds || []), user.uid]
                : item.likerIds?.filter((uid) => uid !== user.uid) || [],
            }
          : item
      )
    );

    if (targetReview.origin === 'firestore' && targetReview.docId) {
      const reviewRef = doc(firestore, 'reviews', targetReview.docId);
      updateDoc(reviewRef, {
        likes: increment(delta),
        likerIds: nextLiked ? arrayUnion(user.uid) : arrayRemove(user.uid),
        updatedAt: serverTimestamp(),
      }).catch((err) => console.warn('Failed to persist like', err));

      if (nextLiked) {
        const actorName =
          user?.displayName || user?.email?.split('@')[0] || 'Movie fan';
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
      // log like to local algo events
      try {
        void logInteraction({ type: 'like', actorId: user?.uid ?? null, targetId: id, targetUserId: targetReview.userId ?? null });
      } catch (e) {
        /* ignore */
      }
    }
  };

  const handleBookmark = (id: ReviewItem['id']) => {
    setReviews((prev) =>
      prev.map((item) => (item.id === id ? { ...item, bookmarked: !item.bookmarked } : item))
    );
  };

  const handleComment = (id: ReviewItem['id'], text?: string) => {
    const trimmed = text?.trim();
    if (!trimmed) return;

    const commenter =
      user?.displayName || user?.email?.split('@')[0] || user?.uid || 'You';

    // prepare optimistic local comment
    const localComment = {
      id: Date.now(),
      user: commenter,
      text: trimmed,
      spoiler: false,
    };

    // determine pending doc id before mutating state to avoid closure type issues
    const target = reviews.find((r) => r.id === id);
    const pendingDocId = target && target.origin === 'firestore' && target.docId ? target.docId : null;

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

    // log comment
    try {
      void logInteraction({ type: 'comment', actorId: user?.uid ?? null, targetId: id, targetUserId: target?.userId ?? null, meta: { snippet: (trimmed || '').slice(0, 120) } });
    } catch (e) {
      /* ignore */
    }

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
  };

  const handleWatch = (id: ReviewItem['id']) => {
    setReviews((prev) =>
      prev.map((item) => (item.id === id ? { ...item, watched: item.watched + 1 } : item))
    );
  };

  const handleShare = (id: ReviewItem['id']) => {
    Alert.alert('Share', `Share review ${id}`);
  };

  const deleteReview = useCallback(
    async (id: ReviewItem['id']) => {
      const target = reviews.find((r) => r.id === id);
      if (!target) return;
      if (!user?.uid || !target.userId || String(target.userId) !== String(user.uid)) return;

      // optimistic
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

        // best-effort delete subcollection comments first
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
        // rollback
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
