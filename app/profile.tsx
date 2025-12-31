// app/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenWrapper from '../components/ScreenWrapper';
import { authPromise, firestore } from '../constants/firebase';
import { getAccentFromPosterPath } from '../constants/theme';
import { useAccent } from './components/AccentContext';
import { useActiveProfile } from '../hooks/use-active-profile';
import { getFavoriteGenre, type FavoriteGenre } from '../lib/favoriteGenreStorage';
import FeedCard from './components/social-feed/FeedCard';
import type { FeedCardItem } from '../types/social-feed';
import { supabase, supabaseConfigured } from '../constants/supabase';
import { followUser, unfollowUser } from '../lib/followGraph';

import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

type UserDoc = {
  displayName?: string;
  photoURL?: string | null;
  favoriteGenres?: string[];
  favoriteColor?: string;
  followers?: string[];
  following?: string[];
  blockedUsers?: string[];
};

const ProfileScreen: React.FC = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { accentColor: globalAccent, setAccentColor } = useAccent();
  const params = useLocalSearchParams();
  const { from, userId: profileUserId, backTo } = params as { from?: string; userId?: string; backTo?: string };
  const cameFromSocial = from === 'social-feed';

  const safeBackTo = typeof backTo === 'string' && backTo.startsWith('/') ? backTo : null;

  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  const [userProfile, setUserProfile] = useState<UserDoc | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followsYou, setFollowsYou] = useState(false);
  const [mutualCount, setMutualCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [reviewsCount, setReviewsCount] = useState(0);
  const activeProfile = useActiveProfile();
  const [favoriteGenre, setFavoriteGenreState] = useState<FavoriteGenre | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const actionSheetTranslate = useRef(new Animated.Value(1)).current;
  const [reviewsSheetVisible, setReviewsSheetVisible] = useState(false);
  const reviewsSheetTranslate = useRef(new Animated.Value(1)).current;
  const [reviewFeed, setReviewFeed] = useState<FeedCardItem[]>([]);
  const [reviewFeedLoading, setReviewFeedLoading] = useState(false);
  const hasLoadedReviewsRef = useRef(false);

  // Determine which user to display: explicit param overrides current user
  const userIdToDisplay = profileUserId || currentUser?.uid;
  const isOwnProfile = !profileUserId || profileUserId === currentUser?.uid;
  const activeProfileName = activeProfile?.name ?? null;
  const activeProfilePhoto = activeProfile?.photoURL ?? null;
  const displayedProfileName = isOwnProfile
    ? activeProfileName ?? userProfile?.displayName ?? 'No-Name'
    : userProfile?.displayName ?? 'No-Name';

  // Auth bootstrap
  useEffect(() => {
    let unsub: (() => void) | null = null;

    authPromise
      .then((auth) => {
        setAuthReady(true);
        setCurrentUser(auth.currentUser ?? null);

        unsub = onAuthStateChanged(auth, (u) => {
          setCurrentUser(u ?? null);
        });
      })
      .catch((err) => {
        console.warn('Auth initialization failed in ProfileScreen:', err);
        setAuthReady(true);
      });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Fetch profile + stats when user changes
  useEffect(() => {
    if (!userIdToDisplay) {
      setUserProfile(null);
      setFollowersCount(0);
      setFollowingCount(0);
      setIsFollowing(false);
      setFollowsYou(false);
      setMutualCount(0);
      setReviewsCount(0);
      return;
    }

    let mounted = true;

    const run = async () => {
      setLoadingProfile(true);
      try {
        // user doc
        const userDocRef = doc(firestore, 'users', userIdToDisplay as string);
        const userDocSnap = await getDoc(userDocRef);

        if (!mounted) return;

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as UserDoc;
          setUserProfile(userData);

          const followersArr = Array.isArray(userData.followers) ? userData.followers : [];
          const followingArr = Array.isArray(userData.following) ? userData.following : [];
          setFollowersCount(followersArr.length);
          setFollowingCount(followingArr.length);

          // whether this profile follows the viewer
          if (!isOwnProfile && currentUser?.uid) {
            setFollowsYou(followingArr.includes(currentUser.uid));
          } else {
            setFollowsYou(false);
          }

          // following state when viewing another profile
          if (!isOwnProfile && currentUser) {
            try {
              const currentUserDocRef = doc(firestore, 'users', currentUser.uid);
              const currentUserDocSnap = await getDoc(currentUserDocRef);
              if (currentUserDocSnap.exists()) {
                const curFollowing = currentUserDocSnap.data()?.following ?? [];
                const curFollowingArr = Array.isArray(curFollowing) ? curFollowing.map(String) : [];
                setIsFollowing(curFollowingArr.includes(String(userIdToDisplay)));

                const followersSet = new Set(followersArr.map(String));
                const mutuals = curFollowingArr.filter((id: string) => followersSet.has(String(id)));
                setMutualCount(mutuals.length);
              } else {
                setIsFollowing(false);
                setMutualCount(0);
              }
            } catch (err) {
              console.error('Error checking following status:', err);
              setIsFollowing(false);
              setMutualCount(0);
            }
          } else {
            setIsFollowing(false);
            setMutualCount(0);
          }
        } else {
          setUserProfile(null);
          setFollowersCount(0);
          setFollowingCount(0);
          setIsFollowing(false);
          setFollowsYou(false);
          setMutualCount(0);
        }

        // ✅ reviews count (Firestore v9 query())
        try {
          const reviewsRef = collection(firestore, 'reviews');
          const q = query(reviewsRef, where('userId', '==', userIdToDisplay as string));
          const snapshot = await getDocs(q);
          if (mounted) setReviewsCount(snapshot.size);
        } catch (err) {
          console.warn('Failed to fetch review stats for profile', err);
          if (mounted) setReviewsCount(0);
        }
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
        if (mounted) {
          setUserProfile(null);
          setFollowersCount(0);
          setFollowingCount(0);
          setIsFollowing(false);
          setFollowsYou(false);
          setMutualCount(0);
          setReviewsCount(0);
        }
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [userIdToDisplay, currentUser, isOwnProfile]);

  const handleFollow = async () => {
    if (followBusy) return;
    if (!authReady || !currentUser) {
      Alert.alert('Please sign in to follow users.');
      return;
    }
    if (!userIdToDisplay || isOwnProfile) return;

    setFollowBusy(true);
    setIsFollowing(true);
    setFollowersCount((c) => c + 1);

    try {
      const { didFollow } = await followUser({
        viewerId: currentUser.uid,
        targetId: String(userIdToDisplay),
        actorName: currentUser.displayName || 'A new user',
        actorAvatar: currentUser.photoURL || null,
        notify: true,
      });
      if (!didFollow) {
        // already followed (or raced) — revert optimistic count bump
        setFollowersCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      console.error('Follow failed:', err);
      setIsFollowing(false);
      setFollowersCount((c) => Math.max(0, c - 1));
      const code = String(err?.message || '');
      if (code.includes('blocked')) {
        Alert.alert('Not allowed', 'You cannot follow this user right now.');
      } else {
        Alert.alert('Error', 'Unable to follow user. Please try again.');
      }
    } finally {
      setFollowBusy(false);
    }
  };

  const handleUnfollow = async () => {
    if (followBusy) return;
    if (!authReady || !currentUser) {
      Alert.alert('Please sign in to unfollow users.');
      return;
    }
    if (!userIdToDisplay || isOwnProfile) return;

    setFollowBusy(true);
    setIsFollowing(false);
    setFollowersCount((c) => Math.max(0, c - 1));

    try {
      const { didUnfollow } = await unfollowUser({ viewerId: currentUser.uid, targetId: String(userIdToDisplay) });
      if (!didUnfollow) {
        // already unfollowed (or raced) — revert optimistic decrement
        setFollowersCount((c) => c + 1);
      }
    } catch (err) {
      console.error('Unfollow failed:', err);
      setIsFollowing(true);
      setFollowersCount((c) => c + 1);
      Alert.alert('Error', 'Unable to unfollow user. Please try again.');
    } finally {
      setFollowBusy(false);
    }
  };

  const handleBack = useCallback(() => {
    if (safeBackTo) {
      router.replace(safeBackTo as any);
      return;
    }

    const canGoBack = (navigation as any)?.canGoBack?.();
    if (canGoBack) {
      router.back();
      return;
    }

    if (cameFromSocial) {
      router.replace('/social-feed');
      return;
    }

    if (from === 'messages') {
      router.replace('/messaging');
      return;
    }

    router.replace('/movies');
  }, [cameFromSocial, from, navigation, router, safeBackTo]);

  const handleSearch = () => router.push('/profile-search');

  const handleLogout = async () => {
    try {
      const auth = await authPromise;
      await auth.signOut();
      await AsyncStorage.removeItem('activeProfile');
      router.replace('/(auth)/login');
    } catch (err) {
      console.error('Sign out failed:', err);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  const closeActionSheet = useCallback(() => {
    Animated.timing(actionSheetTranslate, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setActionSheetVisible(false);
    });
  }, [actionSheetTranslate]);

  const openActionSheet = useCallback(() => {
    setActionSheetVisible(true);
    Animated.timing(actionSheetTranslate, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [actionSheetTranslate]);

  const handleEditProfile = useCallback(() => {
    openActionSheet();
  }, [openActionSheet]);
  const handleSwitchProfile = useCallback(() => {
    router.push('/select-profile');
  }, [router]);
  const handleGoToProfileEdit = useCallback(() => {
    closeActionSheet();
    router.push('/edit-profile');
  }, [closeActionSheet, router]);
  const handleManageProfiles = useCallback(() => {
    closeActionSheet();
    router.push('/select-profile');
  }, [closeActionSheet, router]);
  const handleSettings = () => router.push('/settings');

  const fetchReviewFeed = useCallback(async () => {
    if (!userIdToDisplay) return;
    setReviewFeedLoading(true);
    const normalizeTags = (text?: string) => {
      if (!text) return undefined;
      const matches = text.match(/#[A-Za-z0-9_\-]+/g);
      return matches?.map((tag) => tag.replace('#', '').toLowerCase());
    };

    try {
      let items: FeedCardItem[] = [];

      if (supabaseConfigured) {
        const { data, error } = await supabase
          .from('posts')
          .select('*')
          .eq('userId', userIdToDisplay)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) {
          console.warn('[profile] failed to load Supabase posts', error);
        } else if (data && data.length) {
          items = data.map((row: any, index: number) => {
            const createdAt = row.created_at ? new Date(row.created_at) : new Date();
            const likerIds = Array.isArray(row?.likerIds) ? row.likerIds : [];
            const liked = currentUser?.uid ? likerIds.includes(currentUser.uid) : false;
            const isVideo = row.media_type === 'video';
            const mediaUrl = row.media_url as string | null;

            return {
              id: row.id ?? `supabase-${index}`,
              origin: 'supabase',
              userId: row.userId ?? row.user_id ?? null,
              user: row.userDisplayName || row.userName || row.user || displayedProfileName,
              avatar: row.userAvatar || null,
              date: createdAt.toLocaleDateString(),
              review: row.review || row.content || '',
              movie: row.title || row.movie || undefined,
              image: !isVideo && mediaUrl ? { uri: mediaUrl } : undefined,
              videoUrl: isVideo ? mediaUrl || undefined : undefined,
              genres: Array.isArray(row.genres) ? row.genres : [],
              likes: Number(row.likes ?? likerIds.length ?? 0),
              liked,
              bookmarked: false,
              watched: Number(row.watched ?? row.views ?? 0),
              commentsCount: Number(row.commentsCount ?? row.comments_count ?? 0),
              comments: row.comments || undefined,
              retweet: false,
              likerAvatars: undefined,
              tags: normalizeTags(row.review || row.content || undefined),
            } satisfies FeedCardItem;
          });
        }
      }

      if (items.length === 0) {
        const reviewsRef = collection(firestore, 'reviews');
        const q = query(
          reviewsRef,
          where('userId', '==', userIdToDisplay as string),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
        const snapshot = await getDocs(q);
        items = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          const createdAt = (data?.createdAt as any)?.toDate?.() ?? new Date();
          const likerIds: string[] = Array.isArray(data?.likerIds) ? data.likerIds : [];
          const liked = currentUser?.uid ? likerIds.includes(currentUser.uid) : false;
          const isVideo = data?.type === 'video' || Boolean(data?.videoUrl);

          return {
            id: docSnap.id,
            docId: docSnap.id,
            origin: 'firestore',
            userId: data?.userId ?? data?.ownerId ?? null,
            user: data?.userDisplayName || data?.userName || displayedProfileName,
            avatar: data?.userAvatar || null,
            date: createdAt.toLocaleDateString(),
            review: data?.review || '',
            movie: data?.title || data?.movie || undefined,
            image: !isVideo && data?.mediaUrl ? { uri: data.mediaUrl } : undefined,
            genres: Array.isArray(data?.genres) ? data.genres : [],
            likes: Number(data?.likes ?? 0),
            liked,
            bookmarked: false,
            watched: Number(data?.watched ?? 0),
            commentsCount: Number(data?.commentsCount ?? 0),
            comments: undefined,
            retweet: false,
            likerAvatars: undefined,
            videoUrl: isVideo ? data?.videoUrl || data?.mediaUrl || undefined : undefined,
            tags: normalizeTags(data?.review),
          } satisfies FeedCardItem;
        });
      }

      setReviewFeed(items);
    } catch (err) {
      console.warn('[profile] failed to load review feed', err);
    } finally {
      setReviewFeedLoading(false);
    }
  }, [currentUser?.uid, displayedProfileName, userIdToDisplay]);

  useEffect(() => {
    hasLoadedReviewsRef.current = false;
    setReviewFeed([]);
  }, [userIdToDisplay]);

  const formatViews = useCallback((value: number | undefined) => {
    const safe = Math.max(0, Number(value ?? 0));
    if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
    if (safe >= 1_000) return `${(safe / 1_000).toFixed(1)}K`;
    return String(safe);
  }, []);

  const openReviewsSheet = useCallback(() => {
    setReviewsSheetVisible(true);
    Animated.timing(reviewsSheetTranslate, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
    if (!hasLoadedReviewsRef.current) {
      hasLoadedReviewsRef.current = true;
      void fetchReviewFeed();
    }
  }, [fetchReviewFeed, reviewsSheetTranslate]);

  const closeReviewsSheet = useCallback(() => {
    Animated.timing(reviewsSheetTranslate, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setReviewsSheetVisible(false));
  }, [reviewsSheetTranslate]);

  const handleReviewLike = useCallback((id: FeedCardItem['id']) => {
    setReviewFeed((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              liked: !item.liked,
              likes: Math.max(0, item.likes + (item.liked ? -1 : 1)),
            }
          : item
      )
    );
  }, []);

  const handleReviewBookmark = useCallback((id: FeedCardItem['id']) => {
    setReviewFeed((prev) => prev.map((item) => (item.id === id ? { ...item, bookmarked: !item.bookmarked } : item)));
  }, []);

  const handleReviewWatch = useCallback((id: FeedCardItem['id']) => {
    setReviewFeed((prev) => prev.map((item) => (item.id === id ? { ...item, watched: (item.watched ?? 0) + 1 } : item)));
  }, []);

  const handleReviewComment = useCallback((_: FeedCardItem['id'], __?: string) => {
    Alert.alert('Coming soon', 'Comment on reviews from your profile soon.');
  }, []);

  const handleReviewShare = useCallback((_: FeedCardItem['id']) => {
    Alert.alert('Coming soon', 'Sharing clips from your profile is coming soon.');
  }, []);

  const handleReviewDelete = useCallback(
    async (review: FeedCardItem) => {
      if (!currentUser?.uid) return;
      const ownerId = review.userId ? String(review.userId) : null;
      if (!ownerId || ownerId !== String(currentUser.uid)) return;

      // optimistic
      setReviewFeed((prev) => prev.filter((it) => it.id !== review.id));
      setReviewsCount((c) => Math.max(0, c - 1));

      try {
        if (review.origin === 'supabase') {
          if (!supabaseConfigured) return;
          const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', review.id)
            .or(`userId.eq.${currentUser.uid},user_id.eq.${currentUser.uid}`);
          if (error) throw error;
          return;
        }

        const docId = review.docId ?? (typeof review.id === 'string' ? review.id : null);
        if (!docId) return;

        try {
          const commentsRef = collection(firestore, 'reviews', docId, 'comments');
          const commentsSnap = await getDocs(query(commentsRef, limit(250)));
          await Promise.all(commentsSnap.docs.map((d) => deleteDoc(d.ref)));
        } catch (err) {
          console.warn('[profile] failed to delete review comments', err);
        }

        await deleteDoc(doc(firestore, 'reviews', docId));
      } catch (err) {
        console.warn('[profile] failed to delete review', err);
        // rollback
        setReviewFeed((prev) => {
          const exists = prev.some((it) => it.id === review.id);
          if (exists) return prev;
          return [review, ...prev];
        });
        setReviewsCount((c) => c + 1);
      }
    },
    [currentUser?.uid, setReviewFeed, setReviewsCount],
  );

  const favoriteGenres = userProfile?.favoriteGenres ?? [];
  const accentColor = getAccentFromPosterPath(
    userProfile?.favoriteColor || (favoriteGenres[0] as string | undefined)
  );

  const accent = accentColor || globalAccent || '#e50914';

  useEffect(() => {
    if (accentColor) setAccentColor(accentColor);
  }, [accentColor, setAccentColor]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const stored = await getFavoriteGenre();
        if (alive) setFavoriteGenreState(stored);
      })();
      return () => {
        alive = false;
      };
    }, [activeProfile?.id]),
  );

  const fallbackAvatar =
    'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=1780&ixlib=rb-4.0.3';

  const avatarUri = (isOwnProfile ? activeProfilePhoto : null) || userProfile?.photoURL || fallbackAvatar;

  return (
    <View style={[styles.rootContainer, cameFromSocial && { backgroundColor: '#05060f' }]}>
      <ScreenWrapper>
        <StatusBar style="light" translucent={false} />
        <LinearGradient
          colors={[accent, '#05060f']}
          start={[0, 0]}
          end={[1, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.headerWrap}>
            <LinearGradient
              colors={[`${accent}33`, 'rgba(10,12,24,0.4)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerGlow}
            />
            <View style={styles.headerBar}>
              <TouchableOpacity onPress={handleBack} style={styles.iconBtn}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={styles.titleRow}>
                <View style={[styles.accentDot, { backgroundColor: accent, shadowColor: accent }]} />
                <View>
                  <Text style={styles.headerEyebrow} numberOfLines={1} ellipsizeMode="tail">
                    Your Space
                  </Text>
                  <Text style={styles.headerText} numberOfLines={1} ellipsizeMode="tail">
                    Profile
                  </Text>
                </View>
              </View>
              <View style={styles.headerIcons}>
                {isOwnProfile && (
                  <TouchableOpacity style={styles.iconBtn} onPress={handleSearch}>
                    <Ionicons name="search" size={20} color="#ffffff" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/marketplace')}>
                  <Ionicons name="storefront" size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.inner}>
            <View style={styles.profileHeader}>
              <LinearGradient
                colors={[`${accent}33`, 'rgba(255,255,255,0.05)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerSheen}
              />

              <View style={styles.avatarWrap}>
                <Image source={{ uri: avatarUri }} style={[styles.avatar, { borderColor: accent }]} />
                <View style={styles.statusPill}>
                  <View style={[styles.statusDot, { backgroundColor: '#4ADE80' }]} />
                  <Text style={styles.statusLabel}>Verified fan</Text>
                </View>
              </View>
              <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                {displayedProfileName}
              </Text>
              <Text style={styles.memberSince}>Member since 2023</Text>

              {!isOwnProfile && (followsYou || mutualCount > 0) ? (
                <View style={styles.badgeRow}>
                  {followsYou ? (
                    <View style={[styles.badgePill, { backgroundColor: 'rgba(74,222,128,0.14)' }]}> 
                      <Text style={styles.badgeText}>Follows you</Text>
                    </View>
                  ) : null}
                  {mutualCount > 0 ? (
                    <View style={styles.badgePill}>
                      <Text style={styles.badgeText}>{mutualCount} mutual</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {isOwnProfile ? (
                <View style={styles.selfActionRow}>
                  <TouchableOpacity style={[styles.editProfileButton, { backgroundColor: accent }]} onPress={handleEditProfile}>
                    <Text style={styles.editProfileButtonText}>Edit Profile</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.switchProfileButton} onPress={handleSwitchProfile}>
                    <Text style={styles.switchProfileButtonText}>Switch Profile</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    isFollowing ? styles.unfollowButton : styles.followButton,
                    followBusy && { opacity: 0.6 },
                    !isFollowing && { backgroundColor: accent },
                  ]}
                  onPress={isFollowing ? handleUnfollow : handleFollow}
                  disabled={followBusy}
                >
                  <Text style={styles.followButtonText}>{isFollowing ? 'Following' : 'Follow'}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.statsContainer}>
              <TouchableOpacity
                style={styles.statBox}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: '/followers', params: { userId: String(userIdToDisplay || '') } } as any)
                }
              >
                <Text style={styles.statValue}>{followersCount}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statBox}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: '/following', params: { userId: String(userIdToDisplay || '') } } as any)
                }
              >
                <Text style={styles.statValue}>{followingCount}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.statBox, styles.statBoxInteractive]} activeOpacity={0.85} onPress={openReviewsSheet}>
                <Text style={styles.statValue}>{reviewsCount}</Text>
                <Text style={styles.statLabel}>Reviews</Text>
                <Text style={styles.statHint}>Tap to view</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.glassRow}>
              <View style={styles.glassTile}>
                <Ionicons name="trophy" size={18} color="#fff" />
                <Text style={styles.tileLabel}>Creator Score</Text>
                <Text style={styles.tileValue}>92</Text>
                <Text style={styles.tileSub}>Consistency • Quality</Text>
              </View>
              <View style={styles.glassTile}>
                <Ionicons name="wallet" size={18} color="#fff" />
                <Text style={styles.tileLabel}>Earnings</Text>
                <Text style={styles.tileValue}>$1,240</Text>
                <TouchableOpacity style={styles.pillCta} onPress={() => router.push('/marketplace/sell')}>
                  <Text style={styles.pillCtaText}>Go to marketplace</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.glassCard}>
              {isOwnProfile && (
                <View style={styles.favoriteGenreCard}>
                  <View style={styles.favoriteGenreHeader}>
                    <Text style={styles.sectionTitle}>Favorite genre</Text>
                    <TouchableOpacity
                      style={styles.favoriteGenreAction}
                      onPress={() => router.push('/categories?pickFavorite=1')}
                    >
                      <Ionicons name="sparkles" size={16} color="#fff" />
                      <Text style={styles.favoriteGenreActionText}>
                        {favoriteGenre ? 'Change' : 'Choose'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.favoriteGenreValue} numberOfLines={1}>
                    {favoriteGenre?.name ?? 'Not set'}
                  </Text>
                  <Text style={styles.favoriteGenreHint}>
                    Pick one in Categories to personalize your Movies feed.
                  </Text>
                </View>
              )}

              <Text style={styles.sectionTitle}>Favorite Genres</Text>
              <View style={styles.genresList}>
                {favoriteGenres.map((genre) => (
                  <View key={genre} style={styles.genreTag}>
                    <Text style={styles.genreText}>{genre}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.glassCard, { paddingVertical: 12 }]}>
              <Text style={styles.sectionTitle}>Actions</Text>

              <TouchableOpacity style={styles.actionItem} onPress={handleSettings}>
                <Ionicons name="settings-outline" size={24} color="white" />
                <Text style={styles.actionText}>Settings</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionItem, !userIdToDisplay && { opacity: 0.6 }]}
                onPress={() => {
                  if (!userIdToDisplay) return;
                  router.push({ pathname: '/marketplace/seller/[id]', params: { id: String(userIdToDisplay) } } as any);
                }}
                disabled={!userIdToDisplay}
              >
                <Ionicons name="storefront-outline" size={24} color="white" />
                <Text style={styles.actionText}>{isOwnProfile ? 'My catalog' : 'View catalog'}</Text>
              </TouchableOpacity>

              {isOwnProfile && (
                <>
                  <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/marketplace/orders')}>
                    <Ionicons name="receipt-outline" size={24} color="white" />
                    <Text style={styles.actionText}>My orders</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/marketplace/tickets')}>
                    <Ionicons name="ticket-outline" size={24} color="white" />
                    <Text style={styles.actionText}>My tickets</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/marketplace/scan-ticket')}>
                    <Ionicons name="qr-code-outline" size={24} color="white" />
                    <Text style={styles.actionText}>Scan ticket (seller)</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity style={styles.actionItem}>
                <Ionicons name="help-circle-outline" size={24} color="white" />
                <Text style={styles.actionText}>Help & Support</Text>
              </TouchableOpacity>

              {isOwnProfile && (
                <TouchableOpacity style={styles.actionItem} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={24} color={accent} />
                  <Text style={[styles.actionText, { color: accent }]}>Logout</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>

        {actionSheetVisible && (
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={closeActionSheet}
          />
        )}

        <Animated.View
          pointerEvents={actionSheetVisible ? 'auto' : 'none'}
          style={[
            styles.actionSheet,
            {
              transform: [
                {
                  translateY: actionSheetTranslate.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 400],
                  }),
                },
              ],
              opacity: actionSheetTranslate.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeaderRow}>
            <Image source={{ uri: avatarUri }} style={styles.sheetAvatar} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.sheetTitle}>{displayedProfileName}</Text>
              <Text style={styles.sheetSubtitle}>Customize your MovieFlix vibe</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.sheetAction} onPress={handleGoToProfileEdit}>
            <View style={styles.sheetIconCircle}>
              <Ionicons name="create-outline" size={18} color="#fff" />
            </View>
            <View style={styles.sheetActionCopy}>
              <Text style={styles.sheetActionTitle}>Edit profile details</Text>
              <Text style={styles.sheetActionSubtitle}>Photo, bio & personalization</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.sheetAction} onPress={handleManageProfiles}>
            <View style={[styles.sheetIconCircle, { backgroundColor: 'rgba(255,255,255,0.08)' }] }>
              <Ionicons name="people-outline" size={18} color="#fff" />
            </View>
            <View style={styles.sheetActionCopy}>
              <Text style={styles.sheetActionTitle}>Manage profiles</Text>
              <Text style={styles.sheetActionSubtitle}>Switch, create or lock profiles</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.sheetCancelBtn} onPress={closeActionSheet}>
            <Text style={styles.sheetCancelText}>Close</Text>
          </TouchableOpacity>
        </Animated.View>

        {reviewsSheetVisible && (
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={closeReviewsSheet} />
        )}

        <Animated.View
          pointerEvents={reviewsSheetVisible ? 'auto' : 'none'}
          style={[
            styles.reviewsSheet,
            {
              transform: [
                {
                  translateY: reviewsSheetTranslate.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 500],
                  }),
                },
              ],
              opacity: reviewsSheetTranslate.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.reviewsSheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>Your reviews</Text>
              <Text style={styles.sheetSubtitle}>Scroll through your feed cards with creator-style view counts.</Text>
            </View>
            <TouchableOpacity onPress={fetchReviewFeed} style={styles.refreshBtn} disabled={reviewFeedLoading}>
              <Ionicons name="refresh" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {reviewFeedLoading ? (
            <View style={styles.reviewsEmptyState}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.sheetSubtitle}>Fetching your latest reviews…</Text>
            </View>
          ) : reviewFeed.length === 0 ? (
            <View style={styles.reviewsEmptyState}>
              <Ionicons name="musical-notes-outline" size={28} color="rgba(255,255,255,0.7)" />
              <Text style={styles.sheetSubtitle}>Post a movie review to see it here.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.reviewsList} showsVerticalScrollIndicator={false}>
              {reviewFeed.map((item) => (
                <View key={String(item.id)} style={styles.profileFeedCard}>
                  <View style={styles.viewCounterPill}>
                    <Ionicons name="eye" size={14} color="#0b0f1c" />
                    <Text style={styles.viewCounterText}>{formatViews(item.watched)} views</Text>
                  </View>
                  <FeedCard
                    item={item}
                    onLike={handleReviewLike}
                    onComment={handleReviewComment}
                    onWatch={handleReviewWatch}
                    onShare={handleReviewShare}
                    onBookmark={handleReviewBookmark}
                    onDelete={handleReviewDelete}
                    enableStreaks={false}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </Animated.View>
      </ScreenWrapper>
    </View>
  );
};

export const options = { headerShown: false };

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: '#05060f' },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 80,
  },
  headerWrap: {
    marginHorizontal: 12,
    marginBottom: 18,
    borderRadius: 18,
    overflow: 'hidden',
  },
  headerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
  },
  headerBar: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  accentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  iconBtn: {
    marginLeft: 8,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  innerContainer: { flex: 1 },
  inner: { flex: 1 },
  headerWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  marketplaceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  headerSheen: { ...StyleSheet.absoluteFillObject, opacity: 0.6 },

  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 15,
  },
  avatarWrap: {
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginTop: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  name: { fontSize: 28, fontWeight: 'bold', color: 'white', marginBottom: 5 },
  memberSince: { fontSize: 14, color: '#BBBBBB', marginBottom: 15 },

  selfActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },

  editProfileButton: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 160,
    alignItems: 'center',
  },
  editProfileButtonText: { color: 'white', fontWeight: 'bold' },

  switchProfileButton: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 160,
    alignItems: 'center',
  },
  switchProfileButtonText: { color: 'white', fontWeight: 'bold' },

  followButton: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  unfollowButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  followButtonText: { color: 'white', fontWeight: 'bold' },

  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  statBox: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  statLabel: { fontSize: 12, color: '#BBBBBB', marginTop: 5 },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  badgeText: { color: 'rgba(255,255,255,0.92)', fontWeight: '700', fontSize: 12 },
  statBoxInteractive: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statHint: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    letterSpacing: 0.4,
  },

  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  glassRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
    flexWrap: 'wrap',
    rowGap: 12,
  },
  glassTile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    gap: 6,
  },
  tileLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  tileValue: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
  },
  tileSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  pillCta: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(229,9,20,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.6)',
    alignSelf: 'flex-start',
  },
  pillCtaText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },

  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 15 },

  genresList: { flexDirection: 'row', flexWrap: 'wrap' },
  genreTag: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    marginRight: 10,
    marginBottom: 10,
  },
  genreText: { color: 'white', fontSize: 14 },

  favoriteGenreCard: {
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  favoriteGenreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  favoriteGenreAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  favoriteGenreActionText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  favoriteGenreValue: {
    marginTop: 10,
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  favoriteGenreHint: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    lineHeight: 16,
  },

  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  actionText: { color: 'white', fontSize: 18, marginLeft: 15 },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  actionSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    borderRadius: 20,
    padding: 18,
    backgroundColor: 'rgba(5,6,15,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  sheetHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetAvatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  sheetSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    marginTop: 4,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  sheetIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(229,9,20,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionCopy: {
    flex: 1,
    marginHorizontal: 12,
  },
  sheetActionTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  sheetActionSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginTop: 2,
  },
  sheetCancelBtn: {
    marginTop: 6,
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetCancelText: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  reviewsSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingBottom: 32,
    paddingTop: 10,
    backgroundColor: 'rgba(5,6,15,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxHeight: '90%',
  },
  reviewsSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  reviewsEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  reviewsList: {
    gap: 16,
    paddingBottom: 32,
  },
  profileFeedCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingBottom: 12,
    position: 'relative',
  },
  viewCounterPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1db954',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    shadowColor: '#1db954',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  viewCounterText: {
    color: '#0b0f1c',
    fontWeight: '800',
    fontSize: 12,
  },
});

export default ProfileScreen;
