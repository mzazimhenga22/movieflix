import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedSection from './AnimatedSection';
import LiquidGlass from '../LiquidGlass';

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
    <AnimatedSection delay={100}>
      <LiquidGlass
        glowColor={accent}
        tintColor="#0a0c18"
        tintOpacity={0.65}
        cornerRadius={24}
        glowIntensity={0.6}
        borderWidth={1.5}
        style={styles.profileHeader}
        animated={true}
      >
        <LinearGradient
          colors={[`${accent}15`, 'rgba(255,255,255,0.03)', 'rgba(10,12,24,0.3)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerSheen}
        />

        {/* Avatar with liquid glass effect */}
        <View style={styles.avatarWrap}>
          <LiquidGlass
            glowColor={accent}
            tintColor="#000000"
            tintOpacity={0.3}
            cornerRadius={65}
            glowIntensity={0.8}
            borderWidth={2}
            style={styles.avatarGlowRing}
            animated={true}
          >
            <Animated.View
              style={[
                styles.avatarGlowRingInner,
                {
                  borderColor: accent,
                  shadowColor: accent,
                  opacity: avatarGlowOpacity,
                },
              ]}
            />
          </LiquidGlass>
          <LiquidGlass
            glowColor={accent}
            tintColor="#1a1a2e"
            tintOpacity={0.4}
            cornerRadius={59}
            glowIntensity={0.5}
            borderWidth={3}
            style={styles.avatarBorder}
            animated={false}
          >
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          </LiquidGlass>
          <LiquidGlass
            glowColor="#4ADE80"
            tintColor="#0a1f15"
            tintOpacity={0.5}
            cornerRadius={14}
            glowIntensity={0.4}
            borderWidth={1}
            style={styles.statusPill}
            animated={false}
          >
            <View style={[styles.statusDot, { backgroundColor: '#4ADE80' }]} />
            <Text style={styles.statusLabel}>Verified fan</Text>
          </LiquidGlass>
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
            <LiquidGlass
              glowColor="#4ADE80"
              tintColor="#0a1f15"
              tintOpacity={0.4}
              cornerRadius={14}
              glowIntensity={0.3}
              borderWidth={1}
              style={styles.badgePill}
              animated={false}
            >
              <Ionicons name="checkmark-circle" size={12} color="#4ADE80" />
              <Text style={styles.badgeText}>Follows you</Text>
            </LiquidGlass>
          ) : null}
          {mutualCount > 0 ? (
            <LiquidGlass
              glowColor={accent}
              tintColor="#1a1a2e"
              tintOpacity={0.4}
              cornerRadius={14}
              glowIntensity={0.3}
              borderWidth={1}
              style={styles.badgePill}
              animated={false}
            >
              <Ionicons name="people" size={12} color={accent} />
              <Text style={styles.badgeText}>{mutualCount} mutual</Text>
            </LiquidGlass>
          ) : null}
        </View>
      ) : null}

      {isOwnProfile ? (
        <View style={styles.selfActionRow}>
          <TouchableOpacity onPress={onEditProfile} activeOpacity={0.85}>
            <LiquidGlass
              glowColor={accent}
              tintColor={accent}
              tintOpacity={0.85}
              cornerRadius={16}
              glowIntensity={0.7}
              borderWidth={1.5}
              style={styles.editProfileButton}
              animated={true}
            >
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.editProfileButtonText}>Edit Profile</Text>
            </LiquidGlass>
          </TouchableOpacity>
          <TouchableOpacity onPress={onSwitchProfile} activeOpacity={0.85}>
            <LiquidGlass
              glowColor="#ffffff"
              tintColor="#1a1a2e"
              tintOpacity={0.5}
              cornerRadius={16}
              glowIntensity={0.4}
              borderWidth={1.5}
              style={styles.switchProfileButton}
              animated={false}
            >
              <Ionicons name="swap-horizontal" size={16} color="#fff" />
              <Text style={styles.switchProfileButtonText}>Switch</Text>
            </LiquidGlass>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={isFollowing ? onUnfollow : onFollow}
          disabled={followBusy}
          activeOpacity={0.85}
        >
          <LiquidGlass
            glowColor={isFollowing ? '#ffffff' : accent}
            tintColor={isFollowing ? '#2a2a3e' : accent}
            tintOpacity={isFollowing ? 0.4 : 0.85}
            cornerRadius={22}
            glowIntensity={isFollowing ? 0.3 : 0.7}
            borderWidth={1.5}
            style={[
              styles.followButton,
              followBusy && { opacity: 0.6 },
            ]}
            animated={!isFollowing}
          >
            <Ionicons
              name={isFollowing ? 'checkmark' : 'person-add'}
              size={16}
              color="#fff"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.followButtonText}>{isFollowing ? 'Following' : 'Follow'}</Text>
          </LiquidGlass>
        </TouchableOpacity>
      )}
      </LiquidGlass>
    </AnimatedSection>
  );
});

const styles = StyleSheet.create({
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    borderRadius: 24,
    overflow: 'hidden',
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
    overflow: 'hidden',
  },
  avatarGlowRingInner: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderRadius: 65,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
  },
  avatarBorder: {
    width: 118,
    height: 118,
    borderRadius: 59,
    overflow: 'hidden',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 12,
    overflow: 'hidden',
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
    overflow: 'hidden',
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
    overflow: 'hidden',
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
    flexGrow: 0,
    minWidth: 160,
    overflow: 'hidden',
  },
  switchProfileButtonText: { color: 'white', fontWeight: 'bold' },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 22,
    overflow: 'hidden',
  },
  followButtonText: { color: 'white', fontWeight: '800', fontSize: 14 },
});

export default ProfileHeader;
