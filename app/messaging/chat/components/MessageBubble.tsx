import { usePStream } from '@/src/pstream/usePStream';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, GestureResponderEvent, Image, Linking, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { darkenColor, lightenColor, withAlpha } from '@/lib/colorUtils';
import { useAccent } from '../../../components/AccentContext';

export interface MessageItem {
  id?: string;
  text?: string;
  sender?: string;
  createdAt?: any;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'file' | 'music' | 'movie' | null;
  failed?: boolean;
  pinnedBy?: string[];
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  reactions?: { [emoji: string]: string[] };
  forwarded?: boolean;
  forwardedFrom?: string;
  replyToMessageId?: string;
  replyToText?: string;
  replyToSenderId?: string;
  replyToSenderName?: string;
  callId?: string | null;
  callType?: 'video' | 'voice' | null;
  callStatus?: 'started' | 'ended' | 'missed' | 'declined' | null;
  callDuration?: number | null;
  // Music sharing
  musicData?: {
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string;
  };
  // Movie sharing
  movieData?: {
    id: number;
    title: string;
    poster: string;
    runtime: number;
    year: string;
    type: 'movie' | 'tv';
  };
}

interface Props {
  item: MessageItem;
  isMe: boolean;
  revealToken?: number;
  groupPosition?: 'single' | 'first' | 'middle' | 'last';
  avatar?: string;
  senderName?: string;
  onLongPress?: (
    item: MessageItem,
    rect: { x: number; y: number; width: number; height: number }
  ) => void;
  onPressMedia?: (item: MessageItem) => void;
  onPressCall?: (item: MessageItem) => void;
  onPressMusic?: (item: MessageItem) => void;
  onPressMovie?: (item: MessageItem) => void;
  onPressReaction?: (emoji: string) => void;
  onRetry?: (item: MessageItem) => void;
}

const extractUrl = (text?: string) => {
  if (!text) return null;
  const match = text.match(/(https?:\/\/[^\s]+)/);
  return match ? match[0] : null;
};

const MessageBubble = ({
  item,
  isMe,
  groupPosition = 'single',
  avatar,
  senderName,
  onLongPress,
  onPressMedia,
  onPressCall,
  onPressMusic,
  onPressMovie,
  onPressReaction,
  onRetry
}: Props) => {
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';

  const url = useMemo(() => extractUrl(item.text), [item.text]);

  const handleLinkPress = () => {
    if (url) Linking.openURL(url).catch(() => { });
  };

  const time = useMemo(() => {
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
  }, [item.createdAt]);

  const bubbleRef = useRef<any>(null);
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number } | null>(null);
  const [audioSound, setAudioSound] = useState<Audio.Sound | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioPosition, setAudioPosition] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [musicLoading, setMusicLoading] = useState(false);
  const { getMusicStream } = usePStream();

  const videoPreviewSize = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    const maxWidth = screenWidth * 0.68;
    const width = Math.max(220, Math.min(maxWidth, 340));
    const height = Math.round((width * 9) / 16);
    return { width, height };
  }, []);

  // Smooth entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, opacityAnim]);

  const showTail = groupPosition === 'single' || groupPosition === 'last';
  const showAvatar = !isMe && showTail;

  // Tail color - matches gradient start
  const tailColor = useMemo(() => {
    return isMe ? darkenColor(accent, 0.1) : '#1f222e';
  }, [isMe, accent]);
  const avatarInitials = (senderName || 'U')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isPinned = Array.isArray(item.pinnedBy) && item.pinnedBy.length > 0;
  const hasImage = !!item.mediaUrl && item.mediaType === 'image';
  const hasVideo = !!item.mediaUrl && item.mediaType === 'video';
  const hasAudio = !!item.mediaUrl && item.mediaType === 'audio';
  const hasMusic = item.mediaType === 'music' && !!item.musicData;
  const hasMovie = item.mediaType === 'movie' && !!item.movieData;
  const isCallMessage = !!(item.callType && item.callStatus);
  const isFailed = item.failed === true;

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
      () => setMediaSize(null),
    );
  }, [hasImage, item.mediaUrl]);

  useEffect(() => {
    return () => {
      if (audioSound) {
        audioSound.unloadAsync().catch(() => { });
      }
    };
  }, [audioSound]);

  const toggleMusic = React.useCallback(async () => {
    if (!item.musicData) return;
    try {
      if (!audioSound) {
        setMusicLoading(true);
        const trackId = item.musicData.videoId;
        let finalUri = '';

        // Cache logic
        const directory = (FileSystem as any).cacheDirectory + 'story-music/';
        await (FileSystem as any).makeDirectoryAsync(directory, { intermediates: true });
        const safeId = trackId.replace(/[^a-zA-Z0-9]/g, '_');
        const fileUri = directory + `${safeId}.m4a`;
        const info = await (FileSystem as any).getInfoAsync(fileUri);

        if (info.exists) {
          finalUri = fileUri;
        } else {
          const result = await getMusicStream(trackId, 'audio', true);
          if (result?.uri) {
            await (FileSystem as any).downloadAsync(result.uri, fileUri);
            finalUri = fileUri;
          } else {
            setMusicLoading(false);
            return;
          }
        }

        const { sound } = await Audio.Sound.createAsync(
          { uri: finalUri },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              setIsPlayingAudio(false);
            }
          }
        );
        setAudioSound(sound);
        setIsPlayingAudio(true);
        setMusicLoading(false);
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
      console.warn('music play failed', err);
      setMusicLoading(false);
    }
  }, [audioSound, item.musicData, getMusicStream]);

  const toggleAudio = React.useCallback(async () => {
    if (!hasAudio || !item.mediaUrl) return;
    try {
      if (!audioSound) {
        const { sound } = await Audio.Sound.createAsync({ uri: item.mediaUrl }, {}, (status) => {
          if (!status.isLoaded) return;
          setAudioDuration(status.durationMillis ?? 0);
          setAudioPosition(status.positionMillis ?? 0);
          if (status.didJustFinish) setIsPlayingAudio(false);
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
  }, [audioSound, hasAudio, item.mediaUrl]);

  const formatMillis = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const handleLongPress = React.useCallback((event: GestureResponderEvent) => {
    if (!onLongPress || !bubbleRef.current) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    bubbleRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
      onLongPress(item, { x, y, width, height });
    });
  }, [onLongPress, item]);

  const handlePress = React.useCallback(() => {
    if (isCallMessage) {
      onPressCall?.(item);
      return;
    }
    if (!onPressMedia || !item.mediaUrl || !item.mediaType) return;
    if (item.mediaType !== 'image' && item.mediaType !== 'video') return;
    onPressMedia(item);
  }, [isCallMessage, item, onPressCall, onPressMedia]);

  const callStatusLabel = (() => {
    switch (item.callStatus) {
      case 'missed': return 'Missed';
      case 'declined': return 'Declined';
      case 'started': return 'Started';
      default: return 'Ended';
    }
  })();
  const callTypeLabel = item.callType === 'video' ? 'Video call' : 'Voice call';
  const callMeta = (() => {
    const parts: string[] = [];
    if (isCallMessage) parts.push(callStatusLabel);
    if (time) parts.push(time);
    if (item.callStatus === 'ended' && typeof item.callDuration === 'number') {
      const seconds = Math.max(0, Math.round(item.callDuration));
      parts.push(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    }
    return parts.join(' · ');
  })();

  const wrapSpacingStyle = useMemo(() => {
    if (groupPosition === 'middle') return { marginTop: 1, marginBottom: 1 };
    if (groupPosition === 'first') return { marginTop: 8, marginBottom: 1 };
    if (groupPosition === 'last') return { marginTop: 1, marginBottom: 8 };
    return { marginTop: 8, marginBottom: 8 };
  }, [groupPosition]);

  const bubbleRadius = useMemo(() => {
    const base = 20;
    const small = 6;
    if (isMe) {
      return {
        borderTopLeftRadius: base,
        borderTopRightRadius: groupPosition === 'first' || groupPosition === 'single' ? base : small,
        borderBottomLeftRadius: base,
        borderBottomRightRadius: groupPosition === 'last' || groupPosition === 'single' ? base : small,
      };
    }
    return {
      borderTopLeftRadius: groupPosition === 'first' || groupPosition === 'single' ? base : small,
      borderTopRightRadius: base,
      borderBottomLeftRadius: groupPosition === 'last' || groupPosition === 'single' ? base : small,
      borderBottomRightRadius: base,
    };
  }, [isMe, groupPosition]);

  // Beautiful gradient colors
  const gradientColors = useMemo((): readonly [string, string, string] => {
    if (isMe) {
      return [
        lightenColor(accent, 0.05),
        accent,
        darkenColor(accent, 0.1),
      ] as const;
    }
    return [
      '#2a2d3d',
      '#232636',
      '#1f222e',
    ] as const;
  }, [isMe, accent]);

  // Subtle inner highlight
  const highlightColor = useMemo(() => {
    return isMe ? withAlpha('#fff', 0.15) : withAlpha('#fff', 0.05);
  }, [isMe]);

  const renderStatusIcon = () => {
    if (!isMe) return null;
    const offline = Boolean((item as any).__offline);
    const failed = item.failed === true;

    if (failed) {
      return <Ionicons name="alert-circle" size={12} color="#ff6b6b" />;
    }
    if (!item.status) return null;

    switch (item.status) {
      case 'sending':
        return <Ionicons name={offline ? "cloud-offline-outline" : "time-outline"} size={12} color="rgba(255,255,255,0.6)" />;
      case 'sent':
        return <Ionicons name="checkmark" size={12} color="rgba(255,255,255,0.7)" />;
      case 'delivered':
        return <Ionicons name="checkmark-done" size={12} color="rgba(255,255,255,0.7)" />;
      case 'read':
        return <Ionicons name="checkmark-done" size={12} color="#60a5fa" />; // lighter blue
      default:
        return null;
    }
  };

  const renderReactions = () => {
    if (!item.reactions) return null;
    const reactionEntries = Object.entries(item.reactions).filter(([, users]) => users.length > 0);
    if (reactionEntries.length === 0) return null;

    return (
      <View style={[styles.reactionsContainer, isMe ? styles.reactionsRight : styles.reactionsLeft]}>
        {reactionEntries.map(([emoji, users]) => (
          <TouchableOpacity
            key={emoji}
            style={styles.reactionBubble}
            onPress={() => onPressReaction?.(emoji)}
            activeOpacity={0.7}
          >
            <Text style={styles.reactionEmoji}>{emoji}</Text>
            {users.length > 1 && <Text style={styles.reactionCount}>{users.length}</Text>}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const BubbleContent = (
    <View style={styles.contentInner}>
      {item.forwarded && (
        <View style={styles.forwardedRow}>
          <Ionicons name="arrow-redo" size={11} color="rgba(255,255,255,0.5)" />
          <Text style={styles.forwardedText}>Forwarded</Text>
        </View>
      )}

      {item.replyToText && (
        <View style={[styles.replyBox, { borderLeftColor: isMe ? withAlpha('#fff', 0.4) : accent }]}>
          <Text style={styles.replySender} numberOfLines={1}>
            {item.replyToSenderName || 'Unknown'}
          </Text>
          <Text style={styles.replyText} numberOfLines={2}>
            {item.replyToText}
          </Text>
        </View>
      )}

      {isPinned && (
        <View style={styles.pinnedRow}>
          <Ionicons name="pin" size={11} color="#fcd34d" />
          <Text style={styles.pinnedText}>Pinned</Text>
        </View>
      )}

      {isCallMessage ? (
        <View style={styles.callRow}>
          <LinearGradient
            colors={[withAlpha(accent, 0.3), withAlpha(accent, 0.15)] as const}
            style={styles.callIcon}
          >
            <Ionicons name={item.callType === 'video' ? 'videocam' : 'call'} size={18} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={styles.callTitle}>{callTypeLabel}</Text>
            <Text style={[styles.callMeta, item.callStatus === 'missed' && { color: '#f87171' }]}>
              {callMeta}
            </Text>
          </View>
        </View>
      ) : (
        <>
          {hasImage && (
            <View style={styles.mediaWrapper}>
              <Image
                source={{ uri: item.mediaUrl }}
                style={[styles.mediaImage, mediaSize && { width: mediaSize.width, height: mediaSize.height }]}
              />
            </View>
          )}

          {hasVideo && (
            <TouchableOpacity
              style={[styles.videoPreview, videoPreviewSize]}
              onPress={() => onPressMedia?.(item)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.5)'] as const}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.playButton}>
                <Ionicons name="play" size={24} color="#fff" />
              </View>
            </TouchableOpacity>
          )}

          {hasAudio && (
            <View style={styles.audioContainer}>
              <TouchableOpacity style={styles.audioPlayBtn} onPress={toggleAudio} activeOpacity={0.7}>
                <Ionicons name={isPlayingAudio ? 'pause' : 'play'} size={16} color="#fff" />
              </TouchableOpacity>
              <View style={styles.audioWaveContainer}>
                {[...Array(12)].map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.audioBar,
                      {
                        height: 4 + Math.sin(i * 0.8) * 8 + Math.random() * 4,
                        backgroundColor: isMe ? 'rgba(255,255,255,0.7)' : withAlpha(accent, 0.8),
                        opacity: audioDuration ? (i / 12 <= audioPosition / audioDuration ? 1 : 0.3) : 0.3,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.audioTime}>{formatMillis(audioPosition || audioDuration)}</Text>
            </View>
          )}

          {hasMusic && item.musicData && (
            <TouchableOpacity
              style={styles.musicContainer}
              onPress={() => onPressMusic?.(item)}
              activeOpacity={0.85}
            >
              <Image source={{ uri: item.musicData.thumbnail }} style={styles.musicThumb} />
              <View style={styles.musicInfo}>
                <Text style={styles.musicTitle} numberOfLines={1}>{item.musicData.title}</Text>
                <Text style={styles.musicArtist} numberOfLines={1}>{item.musicData.artist}</Text>
              </View>
              <TouchableOpacity style={[styles.musicPlayBtn, { backgroundColor: isMe ? 'rgba(0,0,0,0.2)' : withAlpha(accent, 0.3) }]} onPress={toggleMusic}>
                {musicLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name={isPlayingAudio ? "pause" : "play"} size={16} color="#fff" />
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          )}

          {hasMovie && item.movieData && (
            <TouchableOpacity
              style={styles.movieContainer}
              onPress={() => onPressMovie?.(item)}
              activeOpacity={0.85}
            >
              {item.movieData.poster ? (
                <Image source={{ uri: item.movieData.poster }} style={styles.moviePoster} />
              ) : (
                <View style={[styles.moviePoster, styles.moviePosterEmpty]}>
                  <Ionicons name="film" size={28} color="rgba(255,255,255,0.3)" />
                </View>
              )}
              <View style={styles.movieOverlay}>
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.8)']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.movieDetails}>
                  <Text style={styles.movieTitle} numberOfLines={2}>{item.movieData.title}</Text>
                  <View style={styles.movieMeta}>
                    <Text style={styles.movieYear}>{item.movieData.year}</Text>
                    {item.movieData.runtime > 0 && (
                      <View style={styles.runtimeBadge}>
                        <Ionicons name="time-outline" size={12} color="#fff" />
                        <Text style={styles.runtimeText}>
                          {Math.floor(item.movieData.runtime / 60)}h {item.movieData.runtime % 60}m
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.moviePlayBtn}>
                  <Ionicons name="play" size={24} color="#fff" />
                </View>
              </View>
            </TouchableOpacity>
          )}

          {!!url && (
            <TouchableOpacity
              style={[styles.linkPreview, { backgroundColor: isMe ? withAlpha('#000', 0.1) : withAlpha('#fff', 0.05) }]}
              onPress={handleLinkPress}
              activeOpacity={0.8}
            >
              <View style={styles.linkIcon}>
                <Ionicons name="link" size={16} color="rgba(255,255,255,0.6)" />
              </View>
              <View style={styles.linkInfo}>
                <Text style={styles.linkUrl} numberOfLines={1}>{url}</Text>
                <Text style={styles.linkTap}>Tap to open</Text>
              </View>
            </TouchableOpacity>
          )}

          {!!item.text && (
            <Text style={styles.messageText}>{item.text}</Text>
          )}
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.timeText}>{time}</Text>
        {renderStatusIcon()}
      </View>

      {isFailed && isMe && (
        <TouchableOpacity style={styles.retryRow} onPress={() => onRetry?.(item)} activeOpacity={0.7}>
          <Ionicons name="refresh-circle" size={14} color="#fbbf24" />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const Bubble = (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
      <View style={[styles.bubbleOuter, bubbleRadius, isMe ? styles.meShadow : styles.otherShadow]}>
        {/* Main gradient background */}
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, bubbleRadius]}
        />

        {/* Subtle top highlight for glass effect */}
        <View style={[styles.topHighlight, { backgroundColor: highlightColor }, {
          borderTopLeftRadius: bubbleRadius.borderTopLeftRadius,
          borderTopRightRadius: bubbleRadius.borderTopRightRadius,
        }]} />

        {/* Thin border for definition */}
        <View style={[styles.borderOverlay, bubbleRadius, { borderColor: isMe ? withAlpha('#fff', 0.15) : withAlpha('#fff', 0.08) }]} />

        {BubbleContent}
      </View>
    </Animated.View>
  );

  // Avatar gradient colors
  const avatarGradient = useMemo((): readonly [string, string] => {
    const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e'];
    const hash = (senderName || 'U').charCodeAt(0) % colors.length;
    return [colors[hash], colors[(hash + 1) % colors.length]] as const;
  }, [senderName]);

  return (
    <View style={[styles.row, wrapSpacingStyle, isMe ? styles.rowRight : styles.rowLeft]}>
      {!isMe && (
        showAvatar ? (
          avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={avatarGradient} style={styles.avatarFallback}>
              <Text style={styles.avatarText}>{avatarInitials}</Text>
            </LinearGradient>
          )
        ) : (
          <View style={styles.avatarSpacer} />
        )
      )}

      <View style={styles.bubbleWrap}>
        <Pressable
          ref={bubbleRef}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={130}
          style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}
        >
          {Bubble}
        </Pressable>

        {renderReactions()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  avatarSpacer: {
    width: 32,
    marginRight: 8,
  },
  bubbleWrap: {
    maxWidth: '78%',
    position: 'relative',
  },
  bubbleOuter: {
    overflow: 'hidden',
    position: 'relative',
  },
  meShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  otherShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 24,
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
  },
  contentInner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  forwardedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
    opacity: 0.7,
  },
  forwardedText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontStyle: 'italic',
  },
  replyBox: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  replySender: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
  replyText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  pinnedText: {
    fontSize: 11,
    color: '#fcd34d',
    fontWeight: '600',
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  callIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callTitle: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  callMeta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  mediaWrapper: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  mediaImage: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  videoPreview: {
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    paddingVertical: 4,
  },
  audioPlayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioWaveContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 24,
  },
  audioBar: {
    width: 3,
    borderRadius: 2,
  },
  audioTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    minWidth: 32,
    fontWeight: '500',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#fff',
    letterSpacing: 0.1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    marginTop: 6,
  },
  timeText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  retryText: {
    fontSize: 11,
    color: '#fbbf24',
    fontWeight: '600',
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  reactionsLeft: {
    marginLeft: 4,
  },
  reactionsRight: {
    justifyContent: 'flex-end',
    marginRight: 4,
  },
  reactionBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginLeft: 4,
    fontWeight: '500',
  },
  linkPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderRadius: 8,
    padding: 8,
    overflow: 'hidden',
  },
  linkIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  linkInfo: {
    flex: 1,
  },
  linkUrl: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  linkTap: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
  },
  // Music bubble styles
  musicContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
    marginBottom: 8,
    gap: 10,
  },
  musicThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  musicInfo: {
    flex: 1,
    minWidth: 0,
  },
  musicTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  musicArtist: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  musicPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Movie bubble styles
  movieContainer: {
    width: 180,
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  moviePoster: {
    width: '100%',
    height: '100%',
  },
  moviePosterEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  movieOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  movieDetails: {
    padding: 10,
  },
  movieTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  movieMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  movieYear: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  runtimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  runtimeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  moviePlayBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -24,
    marginLeft: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
});

const shallowArrayEqual = (a?: string[], b?: string[]) => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const messageEqual = (a: MessageItem, b: MessageItem) =>
  a.id === b.id &&
  a.text === b.text &&
  a.mediaUrl === b.mediaUrl &&
  a.mediaType === b.mediaType &&
  a.failed === b.failed &&
  a.status === b.status &&
  a.callStatus === b.callStatus &&
  a.callType === b.callType &&
  a.callDuration === b.callDuration &&
  a.forwarded === b.forwarded &&
  a.replyToMessageId === b.replyToMessageId &&
  a.replyToText === b.replyToText &&
  a.replyToSenderId === b.replyToSenderId &&
  a.replyToSenderName === b.replyToSenderName &&
  a.createdAt === b.createdAt &&
  shallowArrayEqual(a.pinnedBy, b.pinnedBy) &&
  a.reactions === b.reactions;

const propsAreEqual = (prev: Props, next: Props) =>
  prev.isMe === next.isMe &&
  prev.groupPosition === next.groupPosition &&
  prev.avatar === next.avatar &&
  prev.senderName === next.senderName &&
  prev.revealToken === next.revealToken &&
  prev.onLongPress === next.onLongPress &&
  prev.onPressMedia === next.onPressMedia &&
  prev.onPressCall === next.onPressCall &&
  prev.onPressReaction === next.onPressReaction &&
  prev.onRetry === next.onRetry &&
  messageEqual(prev.item, next.item);

export default React.memo(MessageBubble, propsAreEqual);