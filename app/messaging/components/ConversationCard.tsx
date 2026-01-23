import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccent } from '../../components/AccentContext';
import { lightenColor, withAlpha } from '@/lib/colorUtils';

interface ConversationCardProps {
  id: string;
  name: string;
  avatar?: string | null;
  lastMessage?: string;
  time?: string;
  unread?: number;
  isPinned?: boolean;
  isOnline?: boolean;
  isTyping?: boolean;
  isGroup?: boolean;
  isMuted?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

export default function ConversationCard({
  name,
  avatar,
  lastMessage,
  time,
  unread = 0,
  isPinned,
  isOnline,
  isTyping,
  isGroup,
  isMuted,
  onPress,
  onLongPress,
}: ConversationCardProps) {
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const typingDot1 = useRef(new Animated.Value(0.3)).current;
  const typingDot2 = useRef(new Animated.Value(0.3)).current;
  const typingDot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (isTyping) {
      const animateDots = () => {
        Animated.sequence([
          Animated.timing(typingDot1, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(typingDot2, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(typingDot3, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.parallel([
            Animated.timing(typingDot1, { toValue: 0.3, duration: 300, useNativeDriver: true }),
            Animated.timing(typingDot2, { toValue: 0.3, duration: 300, useNativeDriver: true }),
            Animated.timing(typingDot3, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          ]),
        ]).start(() => {
          if (isTyping) animateDots();
        });
      };
      animateDots();
    } else {
      typingDot1.setValue(0.3);
      typingDot2.setValue(0.3);
      typingDot3.setValue(0.3);
    }
  }, [isTyping]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.touchable}
      >
        <LinearGradient
          colors={[
            unread > 0 ? withAlpha(accent, 0.08) : 'rgba(255,255,255,0.03)',
            'rgba(0,0,0,0.02)',
          ]}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Left glow for unread */}
          {unread > 0 && (
            <View style={[styles.unreadGlow, { backgroundColor: withAlpha(accent, 0.3) }]} />
          )}

          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <LinearGradient
                colors={[lightenColor(accent, 0.2), accent]}
                style={styles.avatarFallback}
              >
                <Text style={styles.avatarInitials}>{initials}</Text>
              </LinearGradient>
            )}
            
            {/* Online indicator */}
            {isOnline && (
              <View style={styles.onlineIndicator}>
                <View style={styles.onlineDot} />
              </View>
            )}
            
            {/* Group indicator */}
            {isGroup && (
              <View style={styles.groupBadge}>
                <Ionicons name="people" size={10} color="#fff" />
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.content}>
            <View style={styles.topRow}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>
                  {name}
                </Text>
                {isPinned && (
                  <Ionicons name="pin" size={12} color="rgba(255,255,255,0.4)" style={styles.pinIcon} />
                )}
                {isMuted && (
                  <Ionicons name="volume-mute" size={12} color="rgba(255,255,255,0.3)" style={styles.muteIcon} />
                )}
              </View>
              <Text style={[styles.time, unread > 0 && { color: lightenColor(accent, 0.3) }]}>
                {time}
              </Text>
            </View>

            <View style={styles.bottomRow}>
              {isTyping ? (
                <View style={styles.typingIndicator}>
                  <Animated.View style={[styles.typingDot, { opacity: typingDot1, backgroundColor: accent }]} />
                  <Animated.View style={[styles.typingDot, { opacity: typingDot2, backgroundColor: accent }]} />
                  <Animated.View style={[styles.typingDot, { opacity: typingDot3, backgroundColor: accent }]} />
                  <Text style={styles.typingText}>typing...</Text>
                </View>
              ) : (
                <Text style={[styles.message, unread > 0 && styles.messageUnread]} numberOfLines={1}>
                  {lastMessage || 'No messages yet'}
                </Text>
              )}

              {/* Unread badge */}
              {unread > 0 && (
                <View style={[styles.unreadBadge, { backgroundColor: accent }]}>
                  <Text style={styles.unreadText}>
                    {unread > 99 ? '99+' : unread}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Chevron */}
          <Ionicons 
            name="chevron-forward" 
            size={18} 
            color={unread > 0 ? lightenColor(accent, 0.2) : 'rgba(255,255,255,0.3)'} 
          />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 18,
    overflow: 'hidden',
  },
  touchable: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  unreadGlow: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(20,22,30,1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34C759',
  },
  groupBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(100,150,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(20,22,30,1)',
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    flexShrink: 1,
  },
  nameUnread: {
    fontWeight: '700',
    color: '#fff',
  },
  pinIcon: {
    marginLeft: 6,
  },
  muteIcon: {
    marginLeft: 4,
  },
  time: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  message: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    flex: 1,
    marginRight: 8,
  },
  messageUnread: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typingText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 4,
    fontStyle: 'italic',
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
});
