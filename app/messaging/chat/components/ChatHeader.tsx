import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
      <LinearGradient
        colors={['rgba(229,9,20,0.22)', 'rgba(10,12,24,0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color="white" />
          </TouchableOpacity>

          {conversation?.isGroup ? (
            <TouchableOpacity onPress={handleProfilePress}>
              <View style={styles.groupAvatar}>
                <Text style={styles.groupAvatarText}>
                  {(conversation.name || 'G')
                    .split(' ')
                    .map((p: string) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleProfilePress}>
              {recipient?.photoURL ? (
                <Image source={{ uri: recipient.photoURL }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{avatarInitials}</Text>
                </View>
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
                style={styles.actionButton}
                accessibilityLabel="Search messages"
                onPress={onSearch}
              >
                <Ionicons name="search" size={18} color="white" />
              </TouchableOpacity>
            )}
            {conversation?.isGroup && (
              <TouchableOpacity
                style={styles.actionButton}
                accessibilityLabel="Group options"
                onPress={onEditGroup}
              >
                <Ionicons name="settings-outline" size={18} color="white" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionButton, callDisabled && styles.actionButtonDisabled]}
              accessibilityLabel="Call"
              onPress={onStartVoiceCall}
              disabled={callDisabled}
            >
              <Ionicons name="call" size={18} color="white" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, callDisabled && styles.actionButtonDisabled]}
              accessibilityLabel="Video call"
              onPress={onStartVideoCall}
              disabled={callDisabled}
            >
              <Ionicons name="videocam" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
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
    borderRadius: 18,
    padding: 1,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 17,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  backButton: {
    marginRight: 10,
    padding: 6,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  groupAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    marginRight: 10,
    backgroundColor: 'rgba(229,9,20,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
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
  actionButton: {
    marginLeft: 12,
    padding: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.4,
  },
});

export default ChatHeader;
