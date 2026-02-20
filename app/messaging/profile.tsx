import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import ScreenWrapper from '../../components/ScreenWrapper';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const ACCENT = '#E50914';

const ProfileScreen = () => {
  const router = useRouter();

  const handleBack = () => {
    router.back();
  };

  const user = {
    name: 'Current User',
    displayName: 'MovieFan2024',
    bio: 'Cinema enthusiast and film critic. Always up for a good movie discussion!',
    avatar:
      'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=1780&ixlib=rb-4.0.3',
    memberSince: '2023',
    favoriteGenres: ['Sci-Fi', 'Action', 'Comedy'],
    status: 'Watching movies and loving it!',
    isOnline: true,
    followersCount: 1247,
    followingCount: 89,
    moviesWatched: 342,
    reviewsWritten: 67,
    favoriteMovies: ['Inception', 'The Dark Knight', 'Interstellar'],
    socialLinks: {
      handle: '@moviefan2024',
      twitter: '@cinema_lover'
    }
  };

  const handleEditProfile = () => {
    router.push('/edit-profile');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" translucent={false} />
      <LinearGradient
        colors={['#2b0000', '#120206', '#06060a']}
        start={[0, 0]}
        end={[1, 1]}
        style={styles.gradient}
      >
        <BlurView intensity={20} tint="dark" style={styles.backgroundGlass} />

        <ScreenWrapper>
          <ScrollView contentContainerStyle={styles.container}>
            {/* Back button */}
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Profile header (glassy card) */}
            <BlurView intensity={60} tint="dark" style={styles.profileCard}>
              <View style={styles.avatarWrap}>
                <Image source={{ uri: user.avatar }} style={styles.avatar} />
                {/* Online status indicator */}
                <View style={[styles.onlineIndicator, user.isOnline ? styles.online : styles.offline]} />
                {/* subtle ring */}
                <View style={styles.avatarRing} />
              </View>

              <Text style={styles.displayName}>{user.displayName}</Text>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.status}>{user.status}</Text>
              <Text style={styles.bio}>{user.bio}</Text>
              <Text style={styles.memberSince}>
                Member since {user.memberSince}
              </Text>

              <TouchableOpacity
                style={styles.editProfileButton}
                onPress={handleEditProfile}
              >
                <Text style={styles.editProfileButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            </BlurView>

            {/* Social stats card */}
            <BlurView intensity={48} tint="dark" style={styles.socialStatsCard}>
              <View style={styles.socialStatsContainer}>
                <TouchableOpacity style={styles.socialStatBox}>
                  <Text style={styles.socialStatValue}>{user.followersCount.toLocaleString()}</Text>
                  <Text style={styles.socialStatLabel}>Followers</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialStatBox}>
                  <Text style={styles.socialStatValue}>{user.followingCount.toLocaleString()}</Text>
                  <Text style={styles.socialStatLabel}>Following</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialStatBox}>
                  <Text style={styles.socialStatValue}>{user.moviesWatched}</Text>
                  <Text style={styles.socialStatLabel}>Movies</Text>
                </TouchableOpacity>
              </View>
            </BlurView>

            {/* Activity stats card */}
            <BlurView intensity={46} tint="dark" style={styles.activityCard}>
              <Text style={styles.sectionTitle}>Activity</Text>
              <View style={styles.activityStats}>
                <View style={styles.activityRow}>
                  <Ionicons name="film-outline" size={20} color="#fff" />
                  <Text style={styles.activityText}>{user.moviesWatched} movies watched</Text>
                </View>
                <View style={styles.activityRow}>
                  <Ionicons name="star-outline" size={20} color="#fff" />
                  <Text style={styles.activityText}>{user.reviewsWritten} reviews written</Text>
                </View>
                <View style={styles.activityRow}>
                  <Ionicons name="heart-outline" size={20} color="#fff" />
                  <Text style={styles.activityText}>{user.favoriteMovies.length} favorite movies</Text>
                </View>
              </View>
            </BlurView>

            {/* Favorite movies */}
            <BlurView intensity={44} tint="dark" style={styles.favoritesCard}>
              <Text style={styles.sectionTitle}>Favorite Movies</Text>
              <View style={styles.favoritesList}>
                {user.favoriteMovies.map((movie, index) => (
                  <View key={movie} style={styles.favoriteItem}>
                    <View style={styles.favoriteNumber}>
                      <Text style={styles.favoriteNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.favoriteText}>{movie}</Text>
                  </View>
                ))}
              </View>
            </BlurView>

            {/* Favorite genres (glassy) */}
            <BlurView intensity={42} tint="dark" style={styles.genresCard}>
              <Text style={styles.sectionTitle}>Favorite Genres</Text>
              <View style={styles.genresList}>
                {user.favoriteGenres.map((genre) => (
                  <View key={genre} style={styles.genreTag}>
                    <Text style={styles.genreText}>{genre}</Text>
                  </View>
                ))}
              </View>
            </BlurView>

            {/* Social links */}
            <BlurView intensity={40} tint="dark" style={styles.socialCard}>
              <Text style={styles.sectionTitle}>Connect</Text>
              <View style={styles.socialLinks}>
                <TouchableOpacity style={styles.socialLink}>
                  <Ionicons name="at-outline" size={20} color="#fff" />
                  <Text style={styles.socialLinkText}>{user.socialLinks.handle}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialLink}>
                  <Ionicons name="logo-twitter" size={20} color="#fff" />
                  <Text style={styles.socialLinkText}>{user.socialLinks.twitter}</Text>
                </TouchableOpacity>
              </View>
            </BlurView>

            {/* padding bottom to avoid overlap with nav */}
            <View style={{ height: 80 }} />
          </ScrollView>
        </ScreenWrapper>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  backgroundGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 26,
    paddingBottom: 40,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 28,
    left: 18,
    zIndex: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  /* Profile header card */
  profileCard: {
    marginTop: 6,
    marginBottom: 22,
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  avatarRing: {
    position: 'absolute',
    left: -6,
    top: -6,
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: 'rgba(229,9,20,0.14)',
    shadowColor: ACCENT,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  onlineIndicator: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#05060f',
  },
  online: {
    backgroundColor: '#22c55e',
  },
  offline: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: ACCENT,
    marginBottom: 4,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  status: {
    fontSize: 14,
    color: '#4ade80',
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  bio: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
    paddingHorizontal: 10,
  },
  memberSince: {
    fontSize: 13,
    color: '#CFCFCF',
    marginBottom: 12,
  },
  editProfileButton: {
    backgroundColor: ACCENT,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: ACCENT,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  editProfileButtonText: {
    color: '#fff',
    fontWeight: '800',
  },

  /* Stats card */
  statsCard: {
    marginBottom: 18,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.015)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#CFCFCF',
    marginTop: 6,
  },

  /* Genres card */
  genresCard: {
    marginBottom: 12,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  genresList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  genreTag: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  genreText: {
    color: '#FFFFFF',
    fontSize: 14,
  },

  /* Social stats */
  socialStatsCard: {
    marginBottom: 18,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.015)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  socialStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  socialStatBox: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  socialStatValue: {
    fontSize: 18,
    fontWeight: '800',
    color: ACCENT,
  },
  socialStatLabel: {
    fontSize: 12,
    color: '#CFCFCF',
    marginTop: 4,
  },

  /* Activity card */
  activityCard: {
    marginBottom: 18,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  activityStats: {
    gap: 12,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activityText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  /* Favorites card */
  favoritesCard: {
    marginBottom: 18,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  favoritesList: {
    gap: 10,
  },
  favoriteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  favoriteNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  favoriteText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },

  /* Social card */
  socialCard: {
    marginBottom: 12,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  socialLinks: {
    gap: 12,
  },
  socialLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  socialLinkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ProfileScreen;
