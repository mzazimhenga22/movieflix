// app/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

import ScreenWrapper from '../components/ScreenWrapper';
import { authPromise, firestore } from '../constants/firebase';
import { getAccentFromPosterPath } from '../constants/theme';
import { useAccent } from './components/AccentContext';
import { useActiveProfile } from '../hooks/use-active-profile';
import { useNavigationGuard } from '../hooks/use-navigation-guard';
import { getFavoriteGenre, type FavoriteGenre } from '../lib/favoriteGenreStorage';
import FeedCard from './components/social-feed/FeedCard';
import type { FeedCardItem } from '../types/social-feed';
import { supabase, supabaseConfigured } from '../constants/supabase';
import { followUser, unfollowUser } from '../lib/followGraph';
import { ensureUserReferralCode } from '../lib/referrals';
import ParticleSystem from './components/effects/ParticleSystem';

import ProfileHeader from './components/profile/ProfileHeader';
import StatsSection from './components/profile/StatsSection';
import SubscriptionCard from './components/profile/SubscriptionCard';
import GlassTiles from './components/profile/GlassTiles';
import ReferralSection from './components/profile/ReferralSection';
import ActionsList from './components/profile/ActionsList';
import AnimatedSection from './components/profile/AnimatedSection';
import ProfileModule from '../modules/ProfileModule';

import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  orderBy,
  limit,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';

type UserDoc = {
  displayName?: string;
  photoURL?: string | null;
  createdAt?: any;
  favoriteGenres?: string[];
  favoriteColor?: string;
  bio?: string;
  status?: string; // legacy
  followers?: string[];
  following?: string[];
  blockedUsers?: string[];
  referralCode?: string;
  referralsCount?: number;
  planTier?: 'free' | 'plus' | 'premium' | string;
  subscription?: {
    tier?: 'free' | 'plus' | 'premium' | string;
    status?: string;
    pending?: boolean;
    temporaryAccess?: boolean;
    receiptCode?: string;
    previousTier?: string;
    updatedAt?: any;
    confirmedAt?: any;
    rejectedAt?: any;
    source?: string;
  };
};

function formatMemberSince(date: Date) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(date);
  } catch {
    return date.toDateString();
  }
}

function toDateMaybe(value: any): Date | null {
  try {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value === 'number') {
      const d = new Date(value);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof value?.toDate === 'function') {
      const d = value.toDate();
      return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
    }
  } catch {
    // ignore
  }
  return null;
}

const ProfileScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { deferNav } = useNavigationGuard({ cooldownMs: 900 });
  const { accentColor: globalAccent, setAccentColor } = useAccent();
  const params = useLocalSearchParams();
  const { from, userId: profileUserId, backTo } = params as { from?: string; userId?: string; backTo?: string };
  const cameFromSocial = from === 'social-feed';

  const safeBackTo = typeof backTo === 'string' && backTo.startsWith('/') ? backTo : null;

  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const paymentsAdminEmail = (process.env.EXPO_PUBLIC_PAYBILL_ADMIN_EMAIL ?? '').trim().toLowerCase();

  const [userProfile, setUserProfile] = useState<UserDoc | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followsYou, setFollowsYou] = useState(false);
  const [mutualCount, setMutualCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [memberSinceLabel, setMemberSinceLabel] = useState<string | null>(null);
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

  const userIdToDisplay = profileUserId || currentUser?.uid;
  const isOwnProfile = !profileUserId || profileUserId === currentUser?.uid;
  const isPaymentsAdmin =
    isOwnProfile &&
    Boolean(paymentsAdminEmail) &&
    String(currentUser?.email ?? '')
      .trim()
      .toLowerCase() === paymentsAdminEmail;
  const activeProfileName = activeProfile?.name ?? null;
  const activeProfilePhoto = activeProfile?.photoURL ?? null;
  const displayedProfileName = isOwnProfile
    ? activeProfileName ?? userProfile?.displayName ?? 'No-Name'
    : userProfile?.displayName ?? 'No-Name';

  const bioText = String(userProfile?.bio ?? userProfile?.status ?? '').trim();

  useEffect(() => {
    let unsub: (() => void) | null = null;
    authPromise
      .then((auth) => {
        setAuthReady(true);
        setCurrentUser(auth.currentUser ?? null);
        unsub = onAuthStateChanged(auth, (u: User | null) => {
          setCurrentUser(u);
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

  useEffect(() => {
    if (!userIdToDisplay) {
      setUserProfile(null);
      setFollowersCount(0);
      setFollowingCount(0);
      setIsFollowing(false);
      setFollowsYou(false);
      setMutualCount(0);
      setReviewsCount(0);
      setMemberSinceLabel(null);
      return;
    }

    let mounted = true;

    const run = async () => {
      setLoadingProfile(true);
      try {
        const userDocRef = doc(firestore, 'users', userIdToDisplay as string);
        const userDocSnap = await getDoc(userDocRef);

        if (!mounted) return;

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as UserDoc;
          setUserProfile(userData);

          const docCreated = toDateMaybe((userData as any)?.createdAt ?? (userData as any)?.createdAtMs ?? null);
          const authCreated =
            isOwnProfile && currentUser?.metadata?.creationTime
              ? toDateMaybe(String(currentUser.metadata.creationTime))
              : null;
          const joined = docCreated ?? authCreated;
          setMemberSinceLabel(joined ? formatMemberSince(joined) : null);

          if (isOwnProfile && !docCreated && joined) {
            void updateDoc(userDocRef, { createdAt: joined.getTime() } as any).catch(() => {});
          }

          if (isOwnProfile && currentUser?.uid && String(userIdToDisplay) === String(currentUser.uid)) {
            const existingCode = String(userData?.referralCode ?? '').trim();
            if (!existingCode) {
              const created = await ensureUserReferralCode(currentUser.uid);
              if (mounted && created) {
                setUserProfile((prev) => ({ ...(prev ?? {}), referralCode: created }));
              }
            }
          }

          const followersArr = Array.isArray(userData.followers) ? userData.followers : [];
          const followingArr = Array.isArray(userData.following) ? userData.following : [];
          setFollowersCount(followersArr.length);
          setFollowingCount(followingArr.length);

          if (!isOwnProfile && currentUser?.uid) {
            setFollowsYou(followingArr.includes(currentUser.uid));
          } else {
            setFollowsYou(false);
          }

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
        setFollowersCount((c) => Math.max(0, c - 1));
      }
    } catch (err: any) {
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
    deferNav(() => {
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
    });
  }, [cameFromSocial, deferNav, from, navigation, router, safeBackTo]);

  const handleSearch = useCallback(() => deferNav(() => router.push('/profile-search')), [deferNav, router]);

  const handleLogout = async () => {
    try {
      const auth = await authPromise;
      await auth.signOut();
      await AsyncStorage.removeItem('activeProfile');
      deferNav(() => router.replace('/(auth)/login'));
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
    deferNav(() => router.push('/select-profile'));
  }, [deferNav, router]);
  const handleGoToProfileEdit = useCallback(() => {
    closeActionSheet();
    deferNav(() => router.push('/edit-profile'));
  }, [closeActionSheet, deferNav, router]);
  const handleManageProfiles = useCallback(() => {
    closeActionSheet();
    deferNav(() => router.push('/select-profile'));
  }, [closeActionSheet, deferNav, router]);
  const handleSettings = useCallback(() => deferNav(() => router.push('/settings')), [deferNav, router]);

  const fetchReviewFeed = useCallback(async () => {
    if (!userIdToDisplay) return;
    setReviewFeedLoading(true);

    try {
      let supabaseJson = "[]";
      let firestoreJson = "[]";

      if (supabaseConfigured) {
        const { data, error } = await supabase
          .from('posts')
          .select('*')
          .eq('userId', userIdToDisplay)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!error && data) {
          supabaseJson = JSON.stringify(data);
        }
      }

      const reviewsRef = collection(firestore, 'reviews');
      const q = query(
        reviewsRef,
        where('userId', '==', userIdToDisplay as string),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      const firestoreDocs = snapshot.docs.map((d: QueryDocumentSnapshot<DocumentData>) => {
        const data = d.data();
        return { ...data, docId: d.id };
      });
      firestoreJson = JSON.stringify(firestoreDocs);

      const resultJson = await ProfileModule.processReviewFeed(
        supabaseJson,
        firestoreJson,
        currentUser?.uid || ''
      );
      
      const items = JSON.parse(resultJson);
      
      const hydrated = items.map((it: any) => ({
        ...it,
        date: it.date ? new Date(it.date).toLocaleDateString() : 
              it.timestamp ? new Date(it.timestamp).toLocaleDateString() : 
              new Date().toLocaleDateString(),
      }));

      setReviewFeed(hydrated);
    } catch (err) {
      console.warn('[profile] failed to load review feed', err);
      setReviewFeed([]);
    } finally {
      setReviewFeedLoading(false);
    }
  }, [currentUser?.uid, userIdToDisplay]);

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
          await Promise.all(commentsSnap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => deleteDoc(d.ref)));
        } catch (err) {
          console.warn('[profile] failed to delete review comments', err);
        }

        await deleteDoc(doc(firestore, 'reviews', docId));
      } catch (err) {
        console.warn('[profile] failed to delete review', err);
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

  const referralCode = isOwnProfile ? String(userProfile?.referralCode ?? '').trim() : '';
  const referralsCount = isOwnProfile ? Math.max(0, Number(userProfile?.referralsCount ?? 0)) : 0;
  const referralUrl = referralCode ? Linking.createURL('/signup', { queryParams: { ref: referralCode } }) : '';

  const subscription = isOwnProfile ? userProfile?.subscription : undefined;
  const planTier = isOwnProfile ? (userProfile?.planTier as any) : undefined;
  const subscriptionStatus = String(subscription?.status ?? '').toLowerCase().trim();
  const subscriptionPending = Boolean(subscription?.pending) || subscriptionStatus.includes('pending');
  const subscriptionTemp = Boolean(subscription?.temporaryAccess);
  const subscriptionReceipt = String(subscription?.receiptCode ?? '').trim();

  const handleShareReferral = useCallback(async () => {
    if (!referralCode) {
      Alert.alert('Please wait', 'Generating your referral code…');
      return;
    }

    const message = `Join MovieFlix with my link to unlock rewards: ${referralUrl}`;
    try {
      await Share.share({ message, url: referralUrl });
    } catch {
      // ignore
    }
  }, [referralCode, referralUrl]);

  // Avatar glow animation
  const avatarGlowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(avatarGlowAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(avatarGlowAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [avatarGlowAnim]);

  const avatarGlowOpacity = avatarGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <View style={[styles.rootContainer, cameFromSocial && { backgroundColor: '#05060f' }]}>
      <ScreenWrapper>
        <StatusBar style="light" translucent={false} />
        
        {/* Animated gradient background */}
        <LinearGradient
          colors={[accent, '#0a0c18', '#05060f']}
          start={[0, 0]}
          end={[1, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        
        {/* Ambient orbs & Particles */}
        <View style={styles.ambientContainer} pointerEvents="none">
          <LinearGradient
            colors={[`${accent}30`, 'transparent']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.ambientOrb1}
          />
          <LinearGradient
            colors={['rgba(100,130,255,0.2)', 'transparent']}
            start={{ x: 0.8, y: 0.2 }}
            end={{ x: 0.2, y: 0.8 }}
            style={styles.ambientOrb2}
          />
          <LinearGradient
            colors={[`${accent}15`, 'transparent']}
            start={{ x: 0.5, y: 0.8 }}
            end={{ x: 0.5, y: 0.2 }}
            style={styles.ambientOrb3}
          />
          
          <ParticleSystem
            particleCount={8}
            colors={[accent, '#ffffff', accent]}
            type="float"
            speed={0.8}
            style={StyleSheet.absoluteFillObject}
          />
        </View>

        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <AnimatedSection delay={0}>
            <View style={styles.headerWrap}>
              <LinearGradient
                colors={[`${accent}40`, 'rgba(10,12,24,0.5)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerGlow}
              />
              <View style={styles.headerBar}>
                <TouchableOpacity onPress={handleBack} style={styles.iconBtn}>
                  <Ionicons name="chevron-back" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={styles.titleRow}>
                  <Animated.View
                    style={[
                      styles.accentDot,
                      {
                        backgroundColor: accent,
                        shadowColor: accent,
                        shadowOpacity: avatarGlowOpacity,
                      },
                    ]}
                  />
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
                  <TouchableOpacity style={styles.iconBtn} onPress={() => deferNav(() => router.push('/marketplace'))}>
                    <Ionicons name="storefront" size={20} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </AnimatedSection>

          <View style={styles.inner}>
            <ProfileHeader
              displayName={displayedProfileName}
              memberSinceLabel={memberSinceLabel}
              bioText={bioText}
              avatarUri={avatarUri}
              accent={accent}
              isOwnProfile={isOwnProfile}
              followsYou={followsYou}
              mutualCount={mutualCount}
              isFollowing={isFollowing}
              followBusy={followBusy}
              onEditProfile={handleEditProfile}
              onSwitchProfile={handleSwitchProfile}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
            />

            <StatsSection
              followersCount={followersCount}
              followingCount={followingCount}
              reviewsCount={reviewsCount}
              accent={accent}
              userIdToDisplay={userIdToDisplay}
              deferNav={deferNav}
              router={router}
              onReviewsPress={openReviewsSheet}
            />

            <SubscriptionCard
              subscriptionStatus={subscriptionStatus}
              subscriptionPending={subscriptionPending}
              subscriptionTemp={subscriptionTemp}
              subscriptionReceipt={subscriptionReceipt}
              planTier={planTier}
              accent={accent}
              deferNav={deferNav}
              router={router}
            />

            <GlassTiles accent={accent} deferNav={deferNav} router={router} />

            {isOwnProfile && (
              <ReferralSection
                accent={accent}
                referralCode={referralCode}
                referralsCount={referralsCount}
                handleShareReferral={handleShareReferral}
              />
            )}

            <ActionsList
              userIdToDisplay={userIdToDisplay}
              isOwnProfile={isOwnProfile}
              isPaymentsAdmin={isPaymentsAdmin}
              accent={accent}
              favoriteGenre={favoriteGenre}
              favoriteGenres={favoriteGenres}
              deferNav={deferNav}
              router={router}
              handleLogout={handleLogout}
              handleSettings={handleSettings}
            />
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
  inner: { flex: 1 },
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

  // Ambient background effects
  ambientContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  ambientOrb1: {
    position: 'absolute',
    top: -50,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  ambientOrb2: {
    position: 'absolute',
    top: 150,
    right: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  ambientOrb3: {
    position: 'absolute',
    bottom: 100,
    left: '20%',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
});

export default ProfileScreen;
