import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  View,
  TextInput,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
} from 'react-native';
import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { firestore } from '../constants/firebase';
import ScreenWrapper from '../components/ScreenWrapper';
import { useUser } from '../hooks/use-user';
import { followUser, unfollowUser } from '../lib/followGraph';
import { useAccent } from './components/AccentContext';

const ProfileSearchScreen = () => {
  const router = useRouter();
  const { user } = useUser();
  const viewerId = user?.uid ? String(user.uid) : '';
  const { accentColor } = useAccent();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!viewerId) {
      setFollowingSet(new Set());
      setBlockedSet(new Set());
      return;
    }

    return onSnapshot(
      doc(firestore, 'users', viewerId),
      (snap) => {
        const data = snap.exists() ? (snap.data() as any) : {};
        const following = Array.isArray(data?.following) ? data.following.map(String) : [];
        const blocked = Array.isArray(data?.blockedUsers) ? data.blockedUsers.map(String) : [];
        setFollowingSet(new Set(following));
        setBlockedSet(new Set(blocked));
      },
      () => {
        setFollowingSet(new Set());
        setBlockedSet(new Set());
      },
    );
  }, [viewerId]);

  const handleSearch = async () => {
    if (searchQuery.trim() === '') {
      setUsers([]);
      return;
    }

    const usersRef = collection(firestore, 'users');
    const q = query(usersRef, where('displayName', '>=', searchQuery), where('displayName', '<=', searchQuery + '\uf8ff'));

    const querySnapshot = await getDocs(q);
    const usersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setUsers(usersData);
  };

  const handleProfilePress = (userId: string) => {
    router.push({ pathname: '/profile', params: { userId, backTo: '/profile-search' } } as any);
  };

  const toggleFollow = async (targetId: string) => {
    if (!targetId) return;
    if (!viewerId) {
      router.push('/(auth)/login');
      return;
    }
    if (targetId === viewerId) return;
    if (blockedSet.has(targetId)) return;

    setBusyId(targetId);
    try {
      const isFollowing = followingSet.has(targetId);
      if (isFollowing) {
        await unfollowUser({ viewerId, targetId });
        setFollowingSet((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      } else {
        await followUser({
          viewerId,
          targetId,
          actorName: user?.displayName || 'A new user',
          actorAvatar: (user as any)?.photoURL || null,
          notify: true,
        });
        setFollowingSet((prev) => new Set(prev).add(targetId));
      }
    } catch (err) {
      console.warn('[profile-search] follow toggle failed', err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={[`${(accentColor || '#e50914')}44`, '#150a13', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for users..."
            placeholderTextColor="#6E6E6E"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
          />
        </View>
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => handleProfilePress(item.id)} style={styles.userItem} activeOpacity={0.85}>
              <Image source={{ uri: item.photoURL || 'https://via.placeholder.com/50' }} style={styles.userAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">{item.displayName}</Text>
                {viewerId && item.id === viewerId ? (
                  <Text style={styles.userMeta}>You</Text>
                ) : blockedSet.has(item.id) ? (
                  <Text style={styles.userMeta}>Blocked</Text>
                ) : followingSet.has(item.id) ? (
                  <Text style={styles.userMeta}>Following</Text>
                ) : (
                  <Text style={styles.userMeta}>Suggested</Text>
                )}
              </View>

              {viewerId && item.id !== viewerId ? (
                <TouchableOpacity
                  style={[
                    styles.followBtn,
                    followingSet.has(item.id) && styles.followingBtn,
                    blockedSet.has(item.id) && styles.followBtnDisabled,
                    busyId === item.id && { opacity: 0.6 },
                    !followingSet.has(item.id) && !blockedSet.has(item.id) && { backgroundColor: accentColor || '#e50914' },
                  ]}
                  onPress={(e) => {
                    // prevent triggering the row navigation
                    // @ts-ignore
                    e?.stopPropagation?.();
                    void toggleFollow(item.id);
                  }}
                  disabled={busyId === item.id || blockedSet.has(item.id)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.followBtnText}>
                    {followingSet.has(item.id) ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  backButton: {
    marginRight: 15,
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    paddingHorizontal: 15,
    color: '#FFFFFF',
    fontSize: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(26,26,26,0.8)',
    marginHorizontal: 10,
    marginTop: 10,
    borderRadius: 10
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  userMeta: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    marginTop: 2,
  },
  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#e50914',
    marginLeft: 10,
  },
  followingBtn: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  followBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  followBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },
});

export default ProfileSearchScreen;
