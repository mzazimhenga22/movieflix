import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Image, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp, updateDoc, where, increment } from 'firebase/firestore';
import { firestore } from '../../constants/firebase';
import { useUser } from '../../hooks/use-user';
import { findOrCreateConversation, findUserByUsername } from '../messaging/controller';

type FeedPost = {
  id: string;
  userId: string;
  image?: string | null;
  caption: string;
  likes: number;
  commentsCount: number;
  liked: boolean;
  likerIds?: string[];
};

type FeedAuthor = {
  id: string;
  displayName?: string;
  username?: string;
  avatar?: string | null;
};

type PostReactions = {
  emoji: string | null;
};

const EMOJIS = ["??", "??", "??", "??", "??"];

const FeedScreen = () => {
  const { username } = useLocalSearchParams();
  const router = useRouter();
  const { user: viewer } = useUser();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [author, setAuthor] = useState<FeedAuthor | null>(null);
  const [reactions, setReactions] = useState<Record<string, PostReactions>>({});

  const likeInFlightRef = useRef<Set<string>>(new Set());

  const userId = typeof username === 'string' ? username : Array.isArray(username) ? username[0] : undefined;

  useEffect(() => {
    const loadAuthorAndPosts = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        // load profile for header + avatar
        try {
          const userDocRef = doc(firestore, 'users', userId);
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            const data = snap.data() as any;
            setAuthor({
              id: userId,
              displayName: data.displayName || data.name || undefined,
              username: data.username || data.handle || undefined,
              avatar: data.photoURL || data.avatar || null,
            });
          } else {
            setAuthor({
              id: userId,
            });
          }
        } catch (e) {
          console.warn('Failed to load feed author profile', e);
        }

        const reviewsRef = collection(firestore, 'reviews');
        const q = query(
          reviewsRef,
          where('userId', '==', userId),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);

        const uid = viewer?.uid ? String(viewer.uid) : null;
        const items: FeedPost[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          const likerIds = Array.isArray(data?.likerIds) ? data.likerIds.map(String) : [];
          const liked = uid ? likerIds.includes(uid) : false;
          return {
            id: docSnap.id,
            userId,
            image: data.type === 'video' ? null : data.mediaUrl || null,
            caption: data.review || data.title || '',
            likes: typeof data.likes === 'number' ? data.likes : likerIds.length,
            likerIds,
            commentsCount: data.commentsCount ?? 0,
            liked,
          };
        });

        setPosts(items);
      } catch (err) {
        console.warn('Failed to load feed posts', err);
        setPosts([]);
      } finally {
        setLoading(false);
      }
    };

    loadAuthorAndPosts();
  }, [userId, viewer?.uid]);

    const handleSelectEmoji = (postId: string, emoji: string) => {
    setReactions(prev => {
      const current = prev[postId] ?? { liked: false, emoji: null };
      const isSameEmoji = current.emoji === emoji;
      return {
        ...prev,
        [postId]: { ...current, emoji: isSameEmoji ? null : emoji },
      };
    });
  };

  const handleMessagePress = async (postUsername: string) => {
    const user = await findUserByUsername(postUsername);
    if (user) {
      const conversationId = await findOrCreateConversation(user);
      router.push(`/messaging/chat/${conversationId}`);
    }
  };

  const handleToggleLike = async (postId: string) => {
    const uid = viewer?.uid ? String(viewer.uid) : null;
    if (!uid) return;

    if (likeInFlightRef.current.has(postId)) return;
    likeInFlightRef.current.add(postId);

    const current = posts.find((p) => p.id === postId);
    if (!current) {
      likeInFlightRef.current.delete(postId);
      return;
    }

    const prevLiked = Boolean(current.liked);
    const prevLikes = Number(current.likes ?? 0) || 0;
    const prevLikerIds = Array.isArray(current.likerIds) ? current.likerIds : [];

    const nextLiked = !prevLiked;
    const delta = nextLiked ? 1 : -1;

    // optimistic
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;
        const baseLikerIds = Array.isArray(post.likerIds) ? post.likerIds : [];
        const nextLikerIds = nextLiked
          ? Array.from(new Set([...baseLikerIds, uid]))
          : baseLikerIds.filter((x) => x !== uid);
        return {
          ...post,
          liked: nextLiked,
          likes: Math.max(0, (Number(post.likes ?? 0) || 0) + delta),
          likerIds: nextLikerIds,
        };
      })
    );

    try {
      const reviewRef = doc(firestore, 'reviews', postId);
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
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...result } : p)));
      }
    } catch (err) {
      console.warn('Failed to update like count', err);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, liked: prevLiked, likes: prevLikes, likerIds: prevLikerIds } : p))
      );
    } finally {
      likeInFlightRef.current.delete(postId);
    }
  };

  const handleAddComment = async (postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              commentsCount: post.commentsCount + 1,
            }
          : post
      )
    );

    try {
      const reviewRef = doc(firestore, 'reviews', postId);
      await updateDoc(reviewRef, {
        commentsCount: increment(1),
      });
    } catch (err) {
      console.warn('Failed to update comments count', err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {author?.displayName || author?.username || userId || 'Feed'}
          {"'s Feed"}
        </Text>
      </View>
      {loading ? (
        <View style={styles.loaderWrapper}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      ) : (
      <FlatList
        data={posts}
        renderItem={({ item }) => {
          const postReactions = reactions[item.id] ?? { liked: false, emoji: null };

          return (
            <View style={styles.postContainer}>
              <View style={styles.postHeader}>
                {author?.avatar ? (
                  <Image source={{ uri: author.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarFallbackText}>
                      {(author?.displayName || author?.username || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.userInfo}>
                  <Text style={styles.username}>
                    {author?.displayName || author?.username || 'User'}
                  </Text>
                  {postReactions.emoji && (
                    <Text style={styles.subTitle}>reacted {postReactions.emoji}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.messageButton}
                  onPress={() => handleMessagePress(author?.username || author?.displayName || 'user')}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.postImage} />
              ) : null}
              <Text style={styles.caption}>{item.caption}</Text>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleToggleLike(item.id)}
                >
                  <Ionicons
                    name={item.liked ? 'heart' : 'heart-outline'}
                    size={22}
                    color={item.liked ? '#FF4B6E' : '#FFFFFF'}
                  />
                  <Text style={styles.actionText}>
                    {item.likes > 0 ? `${item.likes} like${item.likes === 1 ? '' : 's'}` : 'Like'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleAddComment(item.id)}
                >
                  <Ionicons name="chatbubble-outline" size={22} color="#FFFFFF" />
                  <Text style={styles.actionText}>
                    {item.commentsCount > 0
                      ? `${item.commentsCount} comment${item.commentsCount === 1 ? '' : 's'}`
                      : 'Comment'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="paper-plane-outline" size={22} color="#FFFFFF" />
                  <Text style={styles.actionText}>Share</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.emojiRow}>
                {EMOJIS.map(emoji => {
                  const isActive = postReactions.emoji === emoji;
                  return (
                    <TouchableOpacity
                      key={emoji}
                      style={[styles.emojiButton, isActive && styles.emojiButtonActive]}
                      onPress={() => handleSelectEmoji(item.id, emoji)}
                    >
                      <Text style={[styles.emojiText, isActive && styles.emojiTextActive]}>
                        {emoji}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        }}
        keyExtractor={item => item.id}
      />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    marginRight: 15,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  postContainer: {
    marginBottom: 20,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  userInfo: {
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  avatarFallback: {
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  username: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  subTitle: {
    color: '#8E8E8E',
    fontSize: 12,
  },
  messageButton: {
    padding: 5,
  },
  postImage: {
    width: '100%',
    height: 400,
  },
  caption: {
    color: '#B3B3B3',
    padding: 10,
  },
  loaderWrapper: {
    paddingVertical: 24,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    color: '#E0E0E0',
    fontSize: 13,
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 8,
  },
  emojiButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#262626',
  },
  emojiButtonActive: {
    backgroundColor: '#FF4B6E20',
    borderWidth: 1,
    borderColor: '#FF4B6E',
  },
  emojiText: {
    fontSize: 16,
  },
  emojiTextActive: {
    fontSize: 18,
  },
});

export default FeedScreen;


