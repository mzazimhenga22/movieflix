import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedSection from './AnimatedSection';

interface ProfileHeaderProps {
  displayName: string;
  memberSinceLabel: string | null;
  bioText: string | null;
  avatarUri: string;
  accent: string;
  isOwnProfile: boolean;
  followsYou: boolean;
  mutualCount: number;
  isFollowing: boolean;
  followBusy: boolean;
  onEditProfile: () => void;
  onSwitchProfile: () => void;
  onFollow: () => void;
  onUnfollow: () => void;
}

const ProfileHeader = memo(function ProfileHeader({
  displayName,
  memberSinceLabel,
  bioText,
  avatarUri,
  accent,
  isOwnProfile,
  followsYou,
  mutualCount,
  isFollowing,
  followBusy,
  onEditProfile,
  onSwitchProfile,
  onFollow,
  onUnfollow,
}: ProfileHeaderProps) {
  // Avatar glow animation
  const avatarGlowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(avatarGlowAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(avatarGlowAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    ).start();
  }, [avatarGlowAnim]);

  const avatarGlowOpacity = avatarGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <AnimatedSection delay={100} style={styles.profileHeader}>
      <LinearGradient
        colors={[`${accent}25`, 'rgba(255,255,255,0.03)', 'rgba(10,12,24,0.5)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerSheen}
      />

      {/* Avatar with animated glow ring */}
      <View style={styles.avatarWrap}>
        <Animated.View
          style={[
            styles.avatarGlowRing,
            {
              borderColor: accent,
              shadowColor: accent,
              opacity: avatarGlowOpacity,
            },
          ]}
        />
        <View style={[styles.avatarBorder, { borderColor: accent }]}>
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        </View>
        <View style={[styles.statusPill, { borderColor: `${accent}40` }]}>
          <View style={[styles.statusDot, { backgroundColor: '#4ADE80' }]} />
          <Text style={styles.statusLabel}>Verified fan</Text>
        </View>
      </View>
      
      <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
        {displayName}
      </Text>
      {memberSinceLabel ? (
        <Text style={styles.memberSince}>
          <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.5)" /> Member since {memberSinceLabel}
        </Text>
      ) : null}

      {bioText ? (
        <Text style={styles.bio} numberOfLines={3} ellipsizeMode="tail">
          {bioText}
        </Text>
      ) : null}

      {!isOwnProfile && (followsYou || mutualCount > 0) ? (
        <View style={styles.badgeRow}>
          {followsYou ? (
            <View style={[styles.badgePill, { backgroundColor: 'rgba(74,222,128,0.14)', borderColor: 'rgba(74,222,128,0.3)' }]}>
              <Ionicons name="checkmark-circle" size={12} color="#4ADE80" />
              <Text style={styles.badgeText}>Follows you</Text>
            </View>
          ) : null}
          {mutualCount > 0 ? (
            <View style={[styles.badgePill, { borderColor: `${accent}40` }]}>
              <Ionicons name="people" size={12} color={accent} />
              <Text style={styles.badgeText}>{mutualCount} mutual</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {isOwnProfile ? (
        <View style={styles.selfActionRow}>
          <TouchableOpacity
            style={[styles.editProfileButton, { backgroundColor: accent, shadowColor: accent }]}
            onPress={onEditProfile}
          >
            <Ionicons name="create-outline" size={16} color="#fff" />
            <Text style={styles.editProfileButtonText}>Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.switchProfileButton} onPress={onSwitchProfile}>
            <Ionicons name="swap-horizontal" size={16} color="#fff" />
            <Text style={styles.switchProfileButtonText}>Switch</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            isFollowing ? styles.unfollowButton : styles.followButton,
            followBusy && { opacity: 0.6 },
            !isFollowing && { backgroundColor: accent, shadowColor: accent },
          ]}
          onPress={isFollowing ? onUnfollow : onFollow}
          disabled={followBusy}
        >
          <Ionicons
            name={isFollowing ? 'checkmark' : 'person-add'}
            size={16}
            color="#fff"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.followButtonText}>{isFollowing ? 'Following' : 'Follow'}</Text>
        </TouchableOpacity>
      )}
    </AnimatedSection>
  );
});

const styles = StyleSheet.create({
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(15,18,35,0.7)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  headerSheen: { ...StyleSheet.absoluteFillObject, opacity: 0.8, borderRadius: 24 },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarGlowRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
  },
  avatarBorder: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.25)',
    marginTop: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  statusLabel: {
    color: '#4ADE80',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 28,
    fontWeight: '900',
    color: 'white',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  memberSince: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
    fontWeight: '500',
  },
  bio: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 19,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  badgeText: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 12 },
  selfActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginTop: 8,
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    flexGrow: 1,
    minWidth: 140,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  editProfileButtonText: { color: 'white', fontWeight: '800', fontSize: 14 },
  switchProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexGrow: 0,
    minWidth: 160,
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
  followButtonText: { color: 'white', fontWeight: '800', fontSize: 14 },
});

export default ProfileHeader;
