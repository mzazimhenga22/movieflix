import { darkenColor, lightenColor } from '@/lib/colorUtils';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from '../../../components/AccentContext';
import ChatMoviePicker, { MovieData } from './ChatMoviePicker';
import ChatMusicPicker, { MusicData } from './ChatMusicPicker';
import SafeEmojiPicker, { preloadEmojiData } from './SafeEmojiPicker';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  onTypingChange?: (typing: boolean) => void;
  disabled?: boolean;
  onPickMedia?: (uri: string, type: 'image' | 'video') => void;
  onPickAudio?: (uri: string) => void;
  onPickMusic?: (music: MusicData) => void;
  onPickMovie?: (movie: MovieData) => void;
  replyLabel?: string;
  isEditing?: boolean;
  disabledPlaceholder?: string;
  onCloseContext?: () => void;
}

const MessageInput = ({
  onSendMessage,
  onTypingChange,
  disabled,
  onPickMedia,
  onPickAudio,
  onPickMusic,
  onPickMovie,
  replyLabel,
  isEditing,
  disabledPlaceholder,
  onCloseContext,
}: MessageInputProps) => {
  const insets = useSafeAreaInsets();
  const { accentColor } = useAccent();
  const accent = accentColor || '#e50914';

  const [message, setMessage] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [clipboardImage, setClipboardImage] = useState<string | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showMoviePicker, setShowMoviePicker] = useState(false);
  const typingTimerRef = React.useRef<number | null>(null);
  const isTypingRef = React.useRef(false);
  const recordingTimerRef = React.useRef<number | null>(null);
  const waveAnimations = useRef(Array.from({ length: 7 }, () => new Animated.Value(1))).current;
  const isRecordingRef = useRef(false);
  const isRecordingPausedRef = useRef(false);
  const waveLoopActiveRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const focusAnim = useRef(new Animated.Value(0)).current;

  const hasText = message.trim().length > 0;

  const checkClipboard = useCallback(async () => {
    if (disabled) return;
    try {
      const hasImage = await Clipboard.hasImageAsync();
      if (hasImage) {
        const content = await Clipboard.getImageAsync({ format: 'png' });
        if (content?.data) {
          setClipboardImage(content.data);
        }
      } else {
        setClipboardImage(null);
      }
    } catch {
      // ignore
    }
  }, [disabled]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void preloadEmojiData();
    });
    return () => (task as any)?.cancel?.();
  }, []);

  useEffect(() => {
    if (isFocused) {
      void checkClipboard();
    }
  }, [isFocused, checkClipboard]);

  // Focus the input when tapping anywhere on the container
  const handleContainerPress = useCallback(() => {
    if (disabled) return;
    inputRef.current?.focus();
  }, [disabled]);

  const animateFocus = (focused: boolean) => {
    Animated.spring(focusAnim, {
      toValue: focused ? 1 : 0,
      speed: 20,
      bounciness: 8,
      useNativeDriver: false,
    }).start();
  };

  const startDurationTimer = () => {
    if (recordingTimerRef.current) return;
    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000) as unknown as number;
  };

  const stopDurationTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current as unknown as number);
      recordingTimerRef.current = null;
    }
  };

  const handleSend = () => {
    if (disabled) return;
    if (recordedUri && onPickAudio) {
      onPickAudio(recordedUri);
      setRecordedUri(null);
      setRecordingDuration(0);
      setIsRecording(false);
      setIsRecordingPaused(false);
      stopWaveAnimations();
    }
    const text = message.trim();
    if (!text) return;
    onSendMessage(text);
    setMessage('');
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    isTypingRef.current = false;
    onTypingChange?.(false);
    Keyboard.dismiss();
  };

  const handlePasteImage = () => {
    if (clipboardImage && onPickMedia) {
      onPickMedia(clipboardImage, 'image');
      setClipboardImage(null);
    }
  };

  const handleChange = (text: string) => {
    setMessage(text);
    const hasTextNow = !!text.trim();

    if (hasTextNow && !isTypingRef.current) {
      isTypingRef.current = true;
      onTypingChange?.(true);
    }

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = (setTimeout(() => {
      isTypingRef.current = false;
      typingTimerRef.current = null;
      onTypingChange?.(false);
    }, 1200) as unknown) as number;
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow microphone access to record voice messages.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      isRecordingRef.current = true;
      isRecordingPausedRef.current = false;
      setIsRecording(true);
      setRecordingDuration(0);
      setRecordedUri(null);
      setIsRecordingPaused(false);
      startWaveAnimations();
      startDurationTimer();
      Vibration.vibrate(50);

    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Recording failed', 'Unable to start voice recording.');
    }
  };

  const pauseRecording = async () => {
    if (!recording || isRecordingPaused) return;
    try {
      await recording.pauseAsync();
      isRecordingPausedRef.current = true;
      setIsRecordingPaused(true);
      stopDurationTimer();
      stopWaveAnimations();
    } catch (err) {
      console.error('Failed to pause recording', err);
    }
  };

  const resumeRecording = async () => {
    if (!recording || !isRecordingPaused) return;
    try {
      await recording.startAsync();
      isRecordingPausedRef.current = false;
      setIsRecordingPaused(false);
      startDurationTimer();
      startWaveAnimations();
    } catch (err) {
      console.error('Failed to resume recording', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (uri && recordingDuration >= 1) {
        setRecordedUri(uri);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    } finally {
      setRecording(null);
      isRecordingRef.current = false;
      isRecordingPausedRef.current = false;
      setIsRecording(false);
      setIsRecordingPaused(false);
      stopWaveAnimations();
      stopDurationTimer();

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    }
  };

  const startWaveAnimations = () => {
    if (waveLoopActiveRef.current) return;
    waveLoopActiveRef.current = true;

    const animateWave = (index: number) => {
      Animated.sequence([
        Animated.timing(waveAnimations[index], {
          toValue: 1.5 + Math.random() * 0.8,
          duration: 250 + Math.random() * 150,
          useNativeDriver: true,
        }),
        Animated.timing(waveAnimations[index], {
          toValue: 1,
          duration: 250 + Math.random() * 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (isRecordingRef.current && !isRecordingPausedRef.current) {
          animateWave(index);
        }
      });
    };

    waveAnimations.forEach((_, index) => {
      setTimeout(() => animateWave(index), index * 80);
    });
  };

  const stopWaveAnimations = () => {
    waveLoopActiveRef.current = false;
    waveAnimations.forEach((anim) => {
      anim.setValue(1);
    });
  };

  const handleMic = () => {
    if (disabled) return;
    if (isRecording) {
      void stopRecording();
    } else {
      void startRecording();
    }
  };

  const handleRightPress = () => {
    if (hasText || recordedUri) {
      handleSend();
    } else {
      handleMic();
    }
  };

  const handleEmojiPress = () => {
    if (disabled) return;
    void preloadEmojiData({ immediate: true });
    inputRef.current?.blur();
    if (showEmojis) {
      setShowEmojis(false);
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    setShowEmojis(true);
    setShowAttachSheet(false);
    Keyboard.dismiss();
  };

  const appendEmoji = (emoji: string) => {
    handleChange(`${message}${emoji}`);
    setShowEmojis(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const pickMedia = async () => {
    if (disabled) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow media access to attach photos or videos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.9,
        ...(Platform.OS === 'ios'
          ? { videoExportPreset: ImagePicker.VideoExportPreset.HEVC_1920x1080 }
          : {}),
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const type = asset.type === 'video' ? 'video' : 'image';
        if (onPickMedia) {
          onPickMedia(asset.uri, type);
        }
      }
    } catch (e) {
      console.warn('pickMedia error', e);
    }
  };

  const pickAudio = async () => {
    if (disabled) return;
    // Open music picker instead
    setShowMusicPicker(true);
    setShowAttachSheet(false);
  };

  const handlePlus = () => {
    if (disabled) return;
    inputRef.current?.blur();
    setShowAttachSheet((prev) => !prev);
    if (!showAttachSheet) {
      setShowEmojis(false);
    }
    Keyboard.dismiss();
  };

  React.useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current as unknown as number);
        typingTimerRef.current = null;
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      stopWaveAnimations();
    };
  }, []);

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.1)', accent],
  });

  const attachmentOptions = [
    { icon: 'image-outline', label: 'Photo', color: '#34C759', onPress: pickMedia },
    { icon: 'videocam-outline', label: 'Video', color: '#FF6B6B', onPress: pickMedia },
    { icon: 'musical-notes', label: 'Music', color: '#5AC8FA', onPress: () => { setShowMusicPicker(true); setShowAttachSheet(false); } },
    { icon: 'film', label: 'Movie', color: '#FF9500', onPress: () => { setShowMoviePicker(true); setShowAttachSheet(false); } },
    { icon: 'document-outline', label: 'File', color: '#AF52DE', onPress: pickMedia },
    { icon: 'person-outline', label: 'Contact', color: '#007AFF', onPress: () => Alert.alert('Coming soon') },
  ];

  return (
    <View style={styles.outer}>
      {/* Reply/Edit bar */}
      {(replyLabel || isEditing) && (
        <View style={styles.contextBar}>
          <LinearGradient
            colors={['rgba(60,65,80,0.95)', 'rgba(45,50,65,0.95)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.contextBarGradient}
          >
            <View style={[styles.contextStripe, { backgroundColor: accent }]} />
            <View style={styles.contextContent}>
              <Ionicons
                name={isEditing ? 'create-outline' : 'arrow-undo'}
                size={16}
                color={accent}
              />
              <Text style={styles.contextLabel} numberOfLines={1}>
                {isEditing ? 'Editing message' : `Replying to: ${replyLabel}`}
              </Text>
            </View>
            <TouchableOpacity style={styles.contextClose} onPress={onCloseContext}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </LinearGradient>
        </View>
      )}

      {/* Clipboard Image Preview */}
      {clipboardImage && (
        <View style={styles.clipboardPreview}>
          <View style={styles.clipboardContent}>
            <Image
              source={{ uri: clipboardImage }}
              style={styles.clipboardThumb}
              resizeMode="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.clipboardTitle}>Image in clipboard</Text>
              <Text style={styles.clipboardSubtitle}>Tap to attach</Text>
            </View>
            <TouchableOpacity
              style={[styles.clipboardSendBtn, { backgroundColor: accent }]}
              onPress={handlePasteImage}
            >
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.clipboardClose}
              onPress={() => setClipboardImage(null)}
            >
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Main input container */}
      <TouchableWithoutFeedback onPress={handleContainerPress}>
        <Animated.View style={[styles.container, disabled && styles.disabledContainer, { borderColor }]}>
          <LinearGradient
            colors={['rgba(35,40,55,0.98)', 'rgba(28,32,45,0.98)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.containerGradient}
          >
            {/* Cloud decorations */}
            <View style={styles.cloudBump1} />
            <View style={styles.cloudBump2} />

            <View style={styles.inputRow}>
              <View style={styles.leftActions}>
                {/* Emoji button */}
                <Pressable
                  style={[styles.roundButton, showEmojis && styles.roundButtonActive]}
                  disabled={disabled}
                  onPress={handleEmojiPress}
                  android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: true, radius: 20 }}
                >
                  <Ionicons
                    name={showEmojis ? 'happy' : 'happy-outline'}
                    size={22}
                    color={showEmojis ? '#fff' : disabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)'}
                  />
                </Pressable>

                {/* Attachment button */}
                <Pressable
                  style={[styles.roundButton, showAttachSheet && styles.roundButtonActive]}
                  disabled={disabled}
                  onPress={handlePlus}
                  android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: true, radius: 20 }}
                >
                  <Ionicons
                    name="add"
                    size={22}
                    color={showAttachSheet ? '#fff' : disabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)'}
                  />
                </Pressable>
              </View>

              <View style={styles.leftDivider} />
              <View style={styles.inputWrapper}>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  placeholder={disabled ? disabledPlaceholder || 'Accept request to chat' : 'Type a message...'}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={message}
                  onChangeText={handleChange}
                  onFocus={() => {
                    setIsFocused(true);
                    animateFocus(true);
                    setShowEmojis(false);
                    setShowAttachSheet(false);
                  }}
                  onBlur={() => {
                    setIsFocused(false);
                    animateFocus(false);
                  }}
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  blurOnSubmit={false}
                  editable={!disabled}
                />
              </View>

              {/* Send/Mic button */}
              <Pressable
                style={[styles.sendButton, disabled && styles.disabledSendButton]}
                onPress={handleRightPress}
                disabled={disabled}
                android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 22 }}
              >
                <LinearGradient
                  colors={hasText || recordedUri
                    ? [lightenColor(accent, 0.1), accent, darkenColor(accent, 0.15)]
                    : ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.08)']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sendButtonGradient}
                >
                  <Ionicons
                    name={hasText || recordedUri ? 'send' : 'mic'}
                    size={20}
                    color="#fff"
                    style={hasText || recordedUri ? { marginLeft: 2 } : undefined}
                  />
                </LinearGradient>
              </Pressable>
            </View>
          </LinearGradient>
        </Animated.View>
      </TouchableWithoutFeedback>

      {/* Emoji picker modal */}
      {showEmojis && !disabled && (
        <Modal
          visible={showEmojis}
          transparent
          animationType="fade"
          onRequestClose={() => setShowEmojis(false)}
        >
          <View style={styles.emojiModalRoot}>
            <Pressable style={styles.emojiModalBackdrop} onPress={() => setShowEmojis(false)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.emojiModalAvoid}>
              <View style={[styles.emojiModalSheet, { paddingBottom: Math.max(12, insets.bottom) }]}>
                <View style={styles.emojiModalHandle} />
                <SafeEmojiPicker onEmojiSelected={appendEmoji} columns={9} showSearchBar />
                <View style={styles.emojiModalActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowEmojis(false);
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    style={styles.emojiModalActionBtn}
                  >
                    <Ionicons name="create-outline" size={18} color="#fff" />
                    <Text style={styles.emojiModalActionText}>Type message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowEmojis(false)}
                    style={[styles.emojiModalActionBtn, styles.emojiModalCloseBtn]}
                  >
                    <Ionicons name="close" size={18} color="#fff" />
                    <Text style={styles.emojiModalActionText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      )}

      {/* Attachment sheet */}
      {showAttachSheet && !disabled && (
        <View style={styles.attachSheet}>
          <LinearGradient
            colors={['rgba(45,50,65,0.98)', 'rgba(35,40,55,0.98)']}
            style={styles.attachSheetGradient}
          >
            <View style={styles.attachHandle} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.attachScrollContent}
            >
              <View style={styles.attachGrid}>
                {attachmentOptions.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.attachItem}
                    onPress={option.onPress}
                    activeOpacity={0.7}
                  >
                    <LinearGradient
                      colors={[lightenColor(option.color, 0.1), option.color]}
                      style={styles.attachIconCircle}
                    >
                      <Ionicons name={option.icon as any} size={24} color="#fff" />
                    </LinearGradient>
                    <Text style={styles.attachLabel}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </LinearGradient>
        </View>
      )}

      {/* Recording overlay */}
      {(isRecording || recordedUri) && (
        <View style={styles.recordingOverlay}>
          <LinearGradient
            colors={['rgba(20,22,30,0.98)', 'rgba(15,17,25,0.98)']}
            style={styles.recordingContainer}
          >
            {/* Waveform */}
            <View style={styles.waveContainer}>
              {waveAnimations.map((anim, index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.waveBar,
                    {
                      transform: [{ scaleY: anim }],
                      backgroundColor: recordedUri ? accent : '#ff4b4b',
                    },
                  ]}
                />
              ))}
            </View>

            {/* Recording info */}
            <View style={styles.recordingInfo}>
              <View style={[styles.recordingDot, { backgroundColor: recordedUri ? accent : '#ff4b4b' }]} />
              <Text style={styles.recordingText}>
                {recordedUri ? 'Ready to send' : isRecordingPaused ? 'Paused' : 'Recording'}
              </Text>
              <Text style={styles.recordingTime}>
                {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.recordingActionsRow}>
              {!recordedUri ? (
                <>
                  <TouchableOpacity
                    style={styles.recordingActionBtn}
                    onPress={isRecordingPaused ? resumeRecording : pauseRecording}
                  >
                    <Ionicons name={isRecordingPaused ? 'play' : 'pause'} size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.recordingActionBtn, styles.stopBtn]}
                    onPress={stopRecording}
                  >
                    <Ionicons name="stop" size={20} color="#fff" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.recordingActionBtn, styles.deleteBtn]}
                    onPress={() => {
                      setRecordedUri(null);
                      setRecordingDuration(0);
                      setIsRecording(false);
                      setIsRecordingPaused(false);
                      stopWaveAnimations();
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.recordingActionBtn, styles.sendRecordingBtn]}
                    onPress={() => {
                      if (recordedUri) {
                        onPickAudio?.(recordedUri);
                        setRecordedUri(null);
                        setRecordingDuration(0);
                        setIsRecording(false);
                        setIsRecordingPaused(false);
                        stopWaveAnimations();
                      }
                    }}
                  >
                    <LinearGradient
                      colors={[lightenColor(accent, 0.1), accent]}
                      style={styles.sendRecordingGradient}
                    >
                      <Ionicons name="send" size={18} color="#fff" style={{ marginLeft: 2 }} />
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </LinearGradient>
        </View>
      )}

      {/* Music Picker */}
      <ChatMusicPicker
        visible={showMusicPicker}
        onClose={() => setShowMusicPicker(false)}
        onSelect={(music: MusicData) => {
          onPickMusic?.(music);
          setShowMusicPicker(false);
        }}
      />

      {/* Movie Picker */}
      <ChatMoviePicker
        visible={showMoviePicker}
        onClose={() => setShowMoviePicker(false)}
        onSelect={(movie: MovieData) => {
          onPickMovie?.(movie);
          setShowMoviePicker(false);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: 12,
    marginBottom: 8,
    marginTop: 6,
  },
  contextBar: {
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  contextBarGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 12,
    paddingLeft: 16,
  },
  contextStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  contextContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contextLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  contextClose: {
    padding: 4,
  },
  container: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  containerGradient: {
    position: 'relative',
  },
  cloudBump1: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(40,45,60,0.98)',
    top: -6,
    left: '25%',
  },
  cloudBump2: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(38,43,58,0.98)',
    top: -4,
    right: '30%',
  },
  disabledContainer: {
    opacity: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 56,
    gap: 10,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  leftDivider: {
    width: 10,
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  roundButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  inputWrapper: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginHorizontal: 6,
  },
  input: {
    color: '#fff',
    fontSize: 16,
    maxHeight: 120,
    minHeight: 24,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontWeight: '400',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  sendButtonGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledSendButton: {
    opacity: 0.4,
  },
  emojiModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  emojiModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  emojiModalAvoid: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  emojiModalSheet: {
    marginHorizontal: 12,
    marginBottom: 10,
    height: 400,
    maxHeight: '72%',
    backgroundColor: 'rgba(35,40,55,0.98)',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emojiModalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 12,
    marginBottom: 8,
  },
  emojiModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  emojiModalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  emojiModalCloseBtn: {
    backgroundColor: 'rgba(255,75,75,0.15)',
  },
  emojiModalActionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  attachSheet: {
    marginTop: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  attachSheetGradient: {
    paddingTop: 8,
    paddingBottom: 16,
    maxHeight: 260,
  },
  attachHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 12,
  },
  attachScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  attachGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
    columnGap: 12,
  },
  attachItem: {
    alignItems: 'center',
    width: '30%',
    minWidth: 88,
  },
  attachIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  attachLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  // Removed clipboard preview styles
  recordingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 28,
    overflow: 'hidden',
  },
  recordingContainer: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,75,75,0.3)',
    borderRadius: 28,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    marginBottom: 12,
    gap: 4,
  },
  waveBar: {
    width: 4,
    height: 30,
    borderRadius: 2,
  },
  recordingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
  },
  recordingTime: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  recordingActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recordingActionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopBtn: {
    backgroundColor: 'rgba(255,75,75,0.25)',
  },
  deleteBtn: {
    backgroundColor: 'rgba(255,75,75,0.2)',
  },
  sendRecordingBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    padding: 0,
    backgroundColor: 'transparent',
  },
  sendRecordingGradient: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clipboardPreview: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1f222e',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  clipboardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 12,
  },
  clipboardThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  clipboardTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  clipboardSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  clipboardSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipboardClose: {
    padding: 6,
  },
});

export default MessageInput;
