import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, GestureResponderEvent, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';

import { useAccent } from '../../../components/AccentContext';
import { darkenColor, lightenColor, withAlpha } from '@/lib/colorUtils';

interface MessageItem {
  id?: string;
  text?: string;
  sender?: string;
  createdAt?: any;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'file' | null;
  pinnedBy?: string[];
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  reactions?: { [emoji: string]: string[] };
  forwarded?: boolean;
  forwardedFrom?: string;
  replyToMessageId?: string;
  replyToText?: string;
  replyToSenderId?: string;
  replyToSenderName?: string;
  callType?: 'video' | 'voice' | null;
  callStatus?: 'started' | 'ended' | 'missed' | 'declined' | null;
  callDuration?: number | null;
}

interface Props {
  item: MessageItem;
  isMe: boolean;
  groupPosition?: 'single' | 'first' | 'middle' | 'last';
  avatar?: string;
  senderName?: string;
  onLongPress?: (
    item: MessageItem,
    rect: { x: number; y: number; width: number; height: number }
  ) => void;
  onPressMedia?: (item: MessageItem) => void;
  onPressReaction?: (emoji: string) => void;
}

const MessageBubble = ({ item, isMe, groupPosition = 'single', avatar, senderName, onLongPress, onPressMedia, onPressReaction }: Props) => {
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';
  const myGradientColors: readonly [string, string, string] = [
    withAlpha(lightenColor(accent, 0.08), 0.98),
    withAlpha(accent, 0.96),
    withAlpha(darkenColor(accent, 0.28), 0.98),
  ];
  const otherGradientColors: readonly [string, string] = [
    'rgba(255,255,255,0.09)',
    'rgba(255,255,255,0.045)',
  ];
  const replyAccent = isMe ? 'rgba(255,255,255,0.55)' : withAlpha(accent, 0.7);
  const replyGradientColors: readonly [string, string] = isMe
    ? ['rgba(0,0,0,0.22)', 'rgba(0,0,0,0.10)']
    : [
        withAlpha(lightenColor(accent, 0.2), 0.22),
        withAlpha(darkenColor(accent, 0.55), 0.12),
      ];

  const time = (() => {
    const createdAt = item.createdAt;
    try {
      if (!createdAt) return '';
      if (typeof createdAt === 'number') {
        return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      if (typeof createdAt?.toMillis === 'function') {
        return new Date(createdAt.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      if (typeof createdAt?.toDate === 'function') {
        return createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return '';
    } catch {
      return '';
    }
  })();
  const bubbleRef = useRef<View | null>(null);
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number } | null>(null);

  const showTail = groupPosition === 'single' || groupPosition === 'last';
  const showAvatar = !isMe && showTail;
  const avatarInitials = (senderName || 'U')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLongPress = (event: GestureResponderEvent) => {
    if (!onLongPress || !bubbleRef.current) return;
    bubbleRef.current.measureInWindow((x, y, width, height) => {
      onLongPress(item, { x, y, width, height });
    });
  };

  const isPinned = Array.isArray(item.pinnedBy) && item.pinnedBy.length > 0;
  const hasImage = !!item.mediaUrl && item.mediaType === 'image';
  const hasVideo = !!item.mediaUrl && item.mediaType === 'video';
  const hasAudio = !!item.mediaUrl && item.mediaType === 'audio';
  const isCallMessage = !!(item.callType && item.callStatus);
  const [audioSound, setAudioSound] = useState<Audio.Sound | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioPosition, setAudioPosition] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  useEffect(() => {
    if (!hasImage || !item.mediaUrl) {
      setMediaSize(null);
      return;
    }

    Image.getSize(
      item.mediaUrl,
      (width, height) => {
        if (!width || !height) {
          setMediaSize(null);
          return;
        }

        const screenWidth = Dimensions.get('window').width;
        const maxWidth = screenWidth * 0.65;
        const maxHeight = screenWidth * 0.8;

        let displayWidth = maxWidth;
        let displayHeight = (height / width) * displayWidth;

        if (displayHeight > maxHeight) {
          displayHeight = maxHeight;
          displayWidth = (width / height) * displayHeight;
        }

        setMediaSize({ width: displayWidth, height: displayHeight });
      },
      () => {
        setMediaSize(null);
      },
    );
  }, [hasImage, item.mediaUrl]);

  useEffect(() => {
    return () => {
      if (audioSound) {
        audioSound.unloadAsync().catch(() => {});
      }
    };
  }, [audioSound]);

  const toggleAudio = async () => {
    if (!hasAudio || !item.mediaUrl) return;
    try {
      if (!audioSound) {
        const { sound } = await Audio.Sound.createAsync({ uri: item.mediaUrl }, {}, (status) => {
          if (!status.isLoaded) return;
          setAudioDuration(status.durationMillis ?? 0);
          setAudioPosition(status.positionMillis ?? 0);
          if (status.didJustFinish) {
            setIsPlayingAudio(false);
          }
        });
        setAudioSound(sound);
        await sound.playAsync();
        setIsPlayingAudio(true);
        return;
      }

      const status = await audioSound.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await audioSound.pauseAsync();
        setIsPlayingAudio(false);
      } else {
        await audioSound.playAsync();
        setIsPlayingAudio(true);
      }
    } catch (err) {
      console.warn('audio play failed', err);
    }
  };

  const formatMillis = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const handlePress = () => {
    if (!onPressMedia) return;
    if (!item.mediaUrl || !item.mediaType) return;
    if (item.mediaType !== 'image' && item.mediaType !== 'video') return;

    onPressMedia(item);
  };

  const renderStatusIcon = () => {
    if (!isMe || !item.status) return null;
    switch (item.status) {
      case 'sending':
        return <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.6)" />;
      case 'sent':
        return <Ionicons name="checkmark" size={12} color="rgba(255,255,255,0.6)" />;
      case 'delivered':
        return <Ionicons name="checkmark-done" size={12} color="rgba(255,255,255,0.6)" />;
      case 'read':
        return <Ionicons name="checkmark-done" size={12} color="#4CD964" />;
      default:
        return null;
    }
  };

  const renderReactions = () => {
    if (!item.reactions) return null;
    const reactionEntries = Object.entries(item.reactions).filter(([, users]) => users.length > 0);
    if (reactionEntries.length === 0) return null;

    return (
      <View style={styles.reactionsContainer}>
        {reactionEntries.map(([emoji, users]) => (
          <TouchableOpacity
            key={emoji}
            style={styles.reactionBubble}
            onPress={() => onPressReaction?.(emoji)}
          >
            <Text style={styles.reactionEmoji}>{emoji}</Text>
            <Text style={styles.reactionCount}>{users.length}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const bubbleShapeStyle = (() => {
    const ROUND = 16;
    const JOIN = 6;
    const isFirst = groupPosition === 'single' || groupPosition === 'first';
    const isLast = groupPosition === 'single' || groupPosition === 'last';

    if (isMe) {
      return {
        borderTopLeftRadius: ROUND,
        borderBottomLeftRadius: ROUND,
        borderTopRightRadius: isFirst ? ROUND : JOIN,
        borderBottomRightRadius: isLast ? ROUND : JOIN,
      };
    }
    return {
      borderTopRightRadius: ROUND,
      borderBottomRightRadius: ROUND,
      borderTopLeftRadius: isFirst ? ROUND : JOIN,
      borderBottomLeftRadius: isLast ? ROUND : JOIN,
    };
  })();

  const wrapSpacingStyle = (() => {
    if (groupPosition === 'middle') return { marginTop: 1, marginBottom: 1 };
    if (groupPosition === 'first') return { marginTop: 8, marginBottom: 1 };
    if (groupPosition === 'last') return { marginTop: 1, marginBottom: 8 };
    return { marginTop: 8, marginBottom: 8 };
  })();

  return (
    <View ref={bubbleRef} style={[styles.wrap, wrapSpacingStyle, isMe ? styles.rightWrap : styles.leftWrap]}>
      {!isMe && (
        showAvatar ? (
          avatar ? (
            <Image source={{ uri: avatar }} style={styles.leftAvatar} />
          ) : (
            <View style={styles.leftAvatarFallback}>
              <Text style={styles.leftAvatarFallbackText}>{avatarInitials}</Text>
            </View>
          )
        ) : (
          <View style={styles.avatarSpacer} />
        )
      )}
      <View style={styles.bubbleContainer}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handlePress}
          onLongPress={handleLongPress}
        >
          <View style={styles.bubbleWrap}>
            {showTail && (
              <LinearGradient
                colors={isMe ? myGradientColors : otherGradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.bubbleTail,
                  isMe ? styles.bubbleTailRight : styles.bubbleTailLeft,
                  !isMe && styles.bubbleTailOtherBorder,
                ]}
              />
            )}

            <LinearGradient
              colors={isMe ? myGradientColors : otherGradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.bubble,
                isMe ? styles.myBubble : styles.otherBubble,
                bubbleShapeStyle,
              ]}
            >
            {item.forwarded && (
              <View style={styles.forwardedContainer}>
                <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.6)" />
                <Text style={styles.forwardedLabel}>Forwarded</Text>
              </View>
            )}
            {item.replyToText && (
              <LinearGradient
                colors={replyGradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.replyContainer, { borderLeftColor: replyAccent }]}
              >
                <View style={[styles.replyLine, { backgroundColor: replyAccent }]} />
                <Text style={styles.replySender} numberOfLines={1}>
                  {item.replyToSenderName || 'Unknown'}
                </Text>
                <Text style={styles.replyText} numberOfLines={1}>
                  {item.replyToText}
                </Text>
              </LinearGradient>
            )}
            {isPinned && <Text style={styles.pinnedLabel}>📌 Pinned</Text>}
            {isCallMessage ? (
              <View style={styles.callMessageContainer}>
                <View style={[styles.callIconContainer, { backgroundColor: withAlpha(accent, 0.18) }]}>
                  <Ionicons
                    name={item.callType === 'video' ? 'videocam' : 'call'}
                    size={20}
                    color="#fff"
                  />
                </View>
                <View style={styles.callMessageContent}>
                  <Text style={[styles.callMessageText, isMe ? styles.myText : styles.otherText]}>
                    {item.callStatus === 'started' && `Started ${item.callType} call`}
                    {item.callStatus === 'ended' && `Call ended`}
                    {item.callStatus === 'missed' && `Missed ${item.callType} call`}
                    {item.callStatus === 'declined' && `Declined ${item.callType} call`}
                  </Text>
                  {item.callDuration && item.callStatus === 'ended' && (
                    <Text style={styles.callDuration}>
                      Duration: {Math.floor(item.callDuration / 60)}:{String(item.callDuration % 60).padStart(2, '0')}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <>
                {hasImage && (
                  <Image
                    source={{ uri: item.mediaUrl }}
                    style={[
                      styles.mediaImage,
                      mediaSize && { width: mediaSize.width, height: mediaSize.height },
                    ]}
                  />
                )}

                {hasVideo && (
                  <TouchableOpacity style={styles.videoBubble} onPress={() => onPressMedia?.(item)}>
                    <Ionicons name="play" size={18} color="#fff" />
                    <Text style={styles.videoText}>Play video</Text>
                  </TouchableOpacity>
                )}

                {hasAudio && (
                  <TouchableOpacity style={styles.audioBubble} onPress={toggleAudio}>
                    <Ionicons name={isPlayingAudio ? 'pause' : 'play'} size={18} color="#fff" />
                    <View style={styles.audioProgressWrap}>
                      <View
                        style={[
                          styles.audioProgress,
                          {
                            width: `${audioDuration ? Math.min(100, (audioPosition / audioDuration) * 100) : 0}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.audioTime}>{formatMillis(audioPosition || audioDuration)}</Text>
                  </TouchableOpacity>
                )}

                {!!item.text && (
                  <Text style={[styles.text, isMe ? styles.myText : styles.otherText]}>
                    {item.text}
                  </Text>
                )}
              </>
            )}
            <View style={styles.footerRow}>
              <Text style={styles.time}>{time}</Text>
              {renderStatusIcon()}
            </View>
            </LinearGradient>
          </View>
        </TouchableOpacity>
        {renderReactions()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  leftWrap: {
    justifyContent: 'flex-start',
  },
  rightWrap: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  leftAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  leftAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftAvatarFallbackText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  avatarSpacer: {
    width: 42,
    marginRight: 8,
  },
  bubbleContainer: {
    maxWidth: '80%',
  },
  bubbleWrap: {
    position: 'relative',
  },
  bubbleTail: {
    position: 'absolute',
    width: 18,
    height: 14,
    bottom: 6,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 4,
    overflow: 'hidden',
  },
  bubbleTailLeft: {
    left: -9,
    transform: [{ rotate: '-18deg' }],
  },
  bubbleTailRight: {
    right: -9,
    transform: [{ scaleX: -1 }, { rotate: '-18deg' }],
  },
  bubbleTailOtherBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  myBubble: {
    alignSelf: 'flex-end',
    shadowOpacity: 0.16,
    elevation: 4,
  },
  otherBubble: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  mediaImage: {
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  videoBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 8,
  },
  videoText: {
    color: '#fff',
    fontWeight: '700',
  },
  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 8,
  },
  audioProgressWrap: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  audioProgress: {
    height: '100%',
    backgroundColor: '#fff',
  },
  audioTime: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
  },
  myText: {
    color: 'rgba(255,255,255,0.96)',
    fontWeight: '600',
  },
  otherText: {
    color: 'rgba(255,255,255,0.92)',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  time: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginRight: 4,
  },
  pinnedLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  forwardedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  forwardedLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginLeft: 4,
  },
  replyContainer: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginBottom: 8,
    borderRadius: 6,
    paddingVertical: 4,
  },
  replyLine: {
    position: 'absolute',
    left: -3,
    top: 0,
    bottom: 0,
    width: 3,
  },
  replySender: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  replyText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    maxWidth: '80%',
  },
  reactionBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  reactionEmoji: {
    fontSize: 14,
    marginRight: 2,
  },
  reactionCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  callMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  callIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  callMessageContent: {
    flex: 1,
  },
  callMessageText: {
    fontSize: 14,
    fontWeight: '500',
  },
  callDuration: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
});

export default MessageBubble;
