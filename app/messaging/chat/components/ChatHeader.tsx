import LiquidGlass from '@/components/app-components/LiquidGlass';
import { useAccent } from '@/components/app-components/AccentContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useRef, useEffect } from 'react';
import { Animated, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Conversation, Profile } from '../../controller';

interface ChatHeaderProps {
  recipient: Profile | null;
  conversation?: Conversation | null;
  isTyping?: boolean;
  streakCount?: number;
  lastSeen?: Date | null;
  onEditGroup?: () => void;
  onStartVoiceCall?: () => void;
  onStartVideoCall?: () => void;
  onSearch?: () => void;
  callDisabled?: boolean;
}

const ChatHeader = ({
  recipient,
  conversation,
  isTyping,
  streakCount,
  lastSeen,
  onEditGroup,
  onStartVoiceCall,
  onStartVideoCall,
  onSearch,
  callDisabled,
}: ChatHeaderProps) => {
  const router = useRouter();
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const typingDotAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    // Holographic shimmer
    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 2500, useNativeDriver: true })
    ).start();
    
    // Typing dots animation
    if (isTyping) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(typingDotAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(typingDotAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isTyping]);

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const handleProfilePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (conversation?.isGroup) {
      if (conversation.id) {
        router.push(`/messaging/group-details?conversationId=${conversation.id}`);
      }
      return;
    }
    if (recipient?.id) {
      router.push(`/profile?userId=${recipient.id}&from=social-feed`);
    }
  };

  const avatarInitials = (recipient?.displayName || 'U')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.headerWrap}>
      <LiquidGlass
        glowColor={accent}
        tintOpacity={0.85}
        cornerRadius={22}
        glowIntensity={0.3}
        borderOpacity={0.35}
        chromaticAberration
        breathingEffect
        style={styles.headerGradient}
      >
        {/* Holographic shimmer overlay */}
        <Animated.View 
          style={[
            styles.hologramShimmer,
            {
              opacity: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.1, 0.2, 0.1] }),
              transform: [{ translateX: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-100, 100] }) }],
            }
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.1)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Back">
            <LiquidGlass
              cornerRadius={14}
              tintOpacity={0.2}
              interactive
              style={styles.backButtonGlass}
            >
              <Ionicons name="chevron-back" size={22} color="white" />
            </LiquidGlass>
          </TouchableOpacity>

          {conversation?.isGroup ? (
            <TouchableOpacity onPress={handleProfilePress}>
              <LiquidGlass 
                cornerRadius={14}
                tintOpacity={0.2}
                tintColor={accent}
                glowColor={accent}
                glowIntensity={0.3}
                style={styles.groupAvatar}
              >
                <Text style={styles.groupAvatarText}>
                  {(conversation.name || 'G')
                    .split(' ')
                    .map((p: string) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </Text>
              </LiquidGlass>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleProfilePress}>
              {recipient?.photoURL ? (
                <Image source={{ uri: recipient.photoURL }} style={styles.avatar} />
              ) : (
                <LinearGradient
                  colors={[accent, '#ff6b35']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarFallback}
                >
                  <Text style={styles.avatarFallbackText}>{avatarInitials}</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.titleWrap}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {conversation?.isGroup ? conversation.name || 'Group' : recipient?.displayName}
            </Text>
            <Text numberOfLines={1} style={styles.headerSubtitle}>
              {conversation?.isGroup
                ? `${conversation.members?.length || 0} members`
                : isTyping
                  ? 'Typing…'
                  : typeof streakCount === 'number' && streakCount > 0
                    ? `🔥 ${streakCount} day streak`
                    : recipient?.status === 'online'
                      ? 'Online'
                      : lastSeen
                        ? `Last seen ${formatLastSeen(lastSeen)}`
                        : 'Offline'}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {onSearch && (
              <TouchableOpacity
                style={styles.actionBtn}
                accessibilityLabel="Search messages"
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  onSearch();
                }}
              >
                <LiquidGlass
                  tintOpacity={0.3}
                  cornerRadius={12}
                  borderOpacity={0.3}
                  interactive
                  style={styles.actionGlass}
                >
                  <Ionicons name="search" size={18} color="white" />
                </LiquidGlass>
              </TouchableOpacity>
            )}
            {conversation?.isGroup && (
              <TouchableOpacity
                style={styles.actionBtn}
                accessibilityLabel="Group options"
                onPress={() => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  onEditGroup?.();
                }}
              >
                <LiquidGlass
                  tintOpacity={0.3}
                  cornerRadius={12}
                  borderOpacity={0.3}
                  interactive
                  style={styles.actionGlass}
                >
                  <Ionicons name="settings-outline" size={18} color="white" />
                </LiquidGlass>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, callDisabled && styles.actionBtnDisabled]}
              accessibilityLabel="Call"
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onStartVoiceCall?.();
              }}
              disabled={callDisabled}
            >
              <LiquidGlass
                tintOpacity={callDisabled ? 0.15 : 0.3}
                tintColor="#22c55e"
                cornerRadius={12}
                borderOpacity={callDisabled ? 0.15 : 0.35}
                glowColor="#22c55e"
                glowIntensity={callDisabled ? 0 : 0.3}
                interactive={!callDisabled}
                style={styles.actionGlass}
              >
                <Ionicons name="call" size={18} color={callDisabled ? 'rgba(255,255,255,0.4)' : '#22c55e'} />
              </LiquidGlass>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, callDisabled && styles.actionBtnDisabled]}
              accessibilityLabel="Video call"
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onStartVideoCall?.();
              }}
              disabled={callDisabled}
            >
              <LiquidGlass
                tintOpacity={callDisabled ? 0.15 : 0.3}
                tintColor="#22c55e"
                cornerRadius={12}
                borderOpacity={callDisabled ? 0.15 : 0.35}
                glowColor="#22c55e"
                glowIntensity={callDisabled ? 0 : 0.3}
                interactive={!callDisabled}
                style={styles.actionGlass}
              >
                <Ionicons name="videocam" size={20} color={callDisabled ? 'rgba(255,255,255,0.4)' : '#22c55e'} />
              </LiquidGlass>
            </TouchableOpacity>
          </View>
        </View>
      </LiquidGlass>
    </View>
  );
};

const styles = StyleSheet.create({
  headerWrap: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: Platform.OS === 'ios' ? 6 : 4,
  },
  headerGradient: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  hologramShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  backButton: {
    marginRight: 8,
  },
  backButtonGlass: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    marginRight: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 14,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  groupAvatar: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  groupAvatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  actionBtn: {
    marginLeft: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionGlass: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

export default ChatHeader;
