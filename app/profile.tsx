// app/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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

import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

type UserDoc = {
  displayName?: string;
  photoURL?: string | null;
  favoriteGenres?: string[];
  favoriteColor?: string;
  followers?: string[];
  following?: string[];
};

const ProfileScreen: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { from, userId: profileUserId } = params as { from?: string; userId?: string };
  const cameFromSocial = from === 'social-feed';

  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  const [userProfile, setUserProfile] = useState<UserDoc | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [reviewsCount, setReviewsCount] = useState(0);
  const [activeProfilePhoto, setActiveProfilePhoto] = useState<string | null>(null);

  // Determine which user to display: explicit param overrides current user
  const userIdToDisplay = profileUserId || currentUser?.uid;
  const isOwnProfile = !profileUserId || profileUserId === currentUser?.uid;

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

  // ✅ Focus-safe async (no returning a Promise)
  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      (async () => {
        try {
          const stored = await AsyncStorage.getItem('activeProfile');
          if (!mounted) return;

          if (stored) {
            const parsed = JSON.parse(stored);
            const photo =
              typeof parsed?.photoURL === 'string' && parsed.photoURL.trim().length > 0
                ? parsed.photoURL
                : null;
            setActiveProfilePhoto(photo);
          } else {
            setActiveProfilePhoto(null);
          }
        } catch (err) {
          console.error('[profile] failed to load active profile avatar', err);
          if (mounted) setActiveProfilePhoto(null);
        }
      })();

      return () => {
        mounted = false;
      };
    }, [])
  );

  // Fetch profile + stats when user changes
  useEffect(() => {
    if (!userIdToDisplay) {
      setUserProfile(null);
      setFollowersCount(0);
      setFollowingCount(0);
      setIsFollowing(false);
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

          // following state when viewing another profile
          if (!isOwnProfile && currentUser) {
            try {
              const currentUserDocRef = doc(firestore, 'users', currentUser.uid);
              const currentUserDocSnap = await getDoc(currentUserDocRef);
              if (currentUserDocSnap.exists()) {
                const curFollowing = currentUserDocSnap.data()?.following ?? [];
                setIsFollowing(Array.isArray(curFollowing) && curFollowing.includes(userIdToDisplay));
              } else {
                setIsFollowing(false);
              }
            } catch (err) {
              console.error('Error checking following status:', err);
              setIsFollowing(false);
            }
          } else {
            setIsFollowing(false);
          }
        } else {
          setUserProfile(null);
          setFollowersCount(0);
          setFollowingCount(0);
          setIsFollowing(false);
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
      const currentUserDocRef = doc(firestore, 'users', currentUser.uid);
      const targetUserDocRef = doc(firestore, 'users', userIdToDisplay as string);

      await updateDoc(currentUserDocRef, { following: arrayUnion(userIdToDisplay) });
      await updateDoc(targetUserDocRef, { followers: arrayUnion(currentUser.uid) });

      await addDoc(collection(firestore, 'notifications'), {
        type: 'follow',
        scope: 'social',
        channel: 'community',
        actorId: currentUser.uid,
        actorName: currentUser.displayName || 'A new user',
        actorAvatar: currentUser.photoURL || null,
        targetUid: userIdToDisplay,
        message: `${currentUser.displayName || 'A new user'} started following you.`,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Follow failed:', err);
      setIsFollowing(false);
      setFollowersCount((c) => Math.max(0, c - 1));
      Alert.alert('Error', 'Unable to follow user. Please try again.');
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
      const currentUserDocRef = doc(firestore, 'users', currentUser.uid);
      const targetUserDocRef = doc(firestore, 'users', userIdToDisplay as string);

      await updateDoc(currentUserDocRef, { following: arrayRemove(userIdToDisplay) });
      await updateDoc(targetUserDocRef, { followers: arrayRemove(currentUser.uid) });
    } catch (err) {
      console.error('Unfollow failed:', err);
      setIsFollowing(true);
      setFollowersCount((c) => c + 1);
      Alert.alert('Error', 'Unable to unfollow user. Please try again.');
    } finally {
      setFollowBusy(false);
    }
  };

  const handleBack = () => {
    if (cameFromSocial) router.replace('/social-feed');
    else router.replace('/movies');
  };

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

  const handleEditProfile = () => router.push('/edit-profile');
  const handleSwitchProfile = () => router.push('/select-profile');
  const handleSettings = () => router.push('/settings');

  const favoriteGenres = userProfile?.favoriteGenres ?? [];
  const accentColor = getAccentFromPosterPath(
    userProfile?.favoriteColor || (favoriteGenres[0] as string | undefined)
  );

  const fallbackAvatar =
    'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=1780&ixlib=rb-4.0.3';

  const avatarUri = (isOwnProfile ? activeProfilePhoto : null) || userProfile?.photoURL || fallbackAvatar;

  return (
    <View style={[styles.rootContainer, cameFromSocial && { backgroundColor: '#05060f' }]}>
      <ScreenWrapper>
        <StatusBar style="light" translucent={false} />
        <LinearGradient
          colors={[accentColor, '#05060f']}
          start={[0, 0]}
          end={[1, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.marketplaceButton} onPress={() => router.push('/marketplace')}>
          <Ionicons name="storefront" size={24} color="white" />
        </TouchableOpacity>

        {isOwnProfile && (
          <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
            <Ionicons name="search" size={24} color="white" />
          </TouchableOpacity>
        )}

        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.inner}>
            <View style={styles.profileHeader}>
              <LinearGradient
                colors={['rgba(229,9,20,0.2)', 'rgba(255,255,255,0.05)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerSheen}
              />

              <Image source={{ uri: avatarUri }} style={styles.avatar} />
              <Text style={styles.name}>{userProfile?.displayName || 'No-Name'}</Text>
              <Text style={styles.memberSince}>Member since 2023</Text>

              {isOwnProfile ? (
                <View style={styles.selfActionRow}>
                  <TouchableOpacity style={styles.editProfileButton} onPress={handleEditProfile}>
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
                  ]}
                  onPress={isFollowing ? handleUnfollow : handleFollow}
                  disabled={followBusy}
                >
                  <Text style={styles.followButtonText}>{isFollowing ? 'Following' : 'Follow'}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.statsContainer}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{followersCount}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{followingCount}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{reviewsCount}</Text>
                <Text style={styles.statLabel}>Reviews</Text>
              </View>
            </View>

            <View style={styles.glassCard}>
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

              <TouchableOpacity style={styles.actionItem}>
                <Ionicons name="help-circle-outline" size={24} color="white" />
                <Text style={styles.actionText}>Help & Support</Text>
              </TouchableOpacity>

              {isOwnProfile && (
                <TouchableOpacity style={styles.actionItem} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={24} color="#e50914" />
                  <Text style={[styles.actionText, { color: '#e50914' }]}>Logout</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
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
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 8,
  },
  marketplaceButton: {
    position: 'absolute',
    top: 50,
    left: 70,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 8,
  },
  searchButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 8,
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
    borderColor: '#e50914',
    marginBottom: 15,
  },
  name: { fontSize: 28, fontWeight: 'bold', color: 'white', marginBottom: 5 },
  memberSince: { fontSize: 14, color: '#BBBBBB', marginBottom: 15 },

  selfActionRow: { flexDirection: 'row', gap: 12 },

  editProfileButton: {
    backgroundColor: '#e50914',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  editProfileButtonText: { color: 'white', fontWeight: 'bold' },

  switchProfileButton: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  switchProfileButtonText: { color: 'white', fontWeight: 'bold' },

  followButton: {
    backgroundColor: '#e50914',
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
  },
  statBox: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  statLabel: { fontSize: 12, color: '#BBBBBB', marginTop: 5 },

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

  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  actionText: { color: 'white', fontSize: 18, marginLeft: 15 },
});

export default ProfileScreen;
