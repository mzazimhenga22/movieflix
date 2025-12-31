import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import React, { useRef, useState } from 'react';
import SafeEmojiPicker from './SafeEmojiPicker';
import {
  Alert,
  Animated,
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
  Vibration,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  onTypingChange?: (typing: boolean) => void;
  disabled?: boolean;
  onPickMedia?: (uri: string, type: 'image' | 'video') => void;
  onPickAudio?: (uri: string) => void;
  replyLabel?: string;
  isEditing?: boolean;
  disabledPlaceholder?: string;
}

const MessageInput = ({
  onSendMessage,
  onTypingChange,
  disabled,
  onPickMedia,
  onPickAudio,
  replyLabel,
  isEditing,
  disabledPlaceholder,
}: MessageInputProps) => {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const typingTimerRef = React.useRef<number | null>(null);
  const isTypingRef = React.useRef(false);
  const recordingTimerRef = React.useRef<number | null>(null);
  const waveAnimations = useRef(Array.from({ length: 5 }, () => new Animated.Value(1))).current;
  const isRecordingRef = useRef(false);
  const isRecordingPausedRef = useRef(false);
  const waveLoopActiveRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  const hasText = message.trim().length > 0;

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

    // debounce stop typing after 1200ms of inactivity
    typingTimerRef.current = (setTimeout(() => {
      isTypingRef.current = false;
      typingTimerRef.current = null;
      onTypingChange?.(false);
    }, 1200) as unknown) as number;
  };

  // Audio recording functions
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

      // Start wave animations
      startWaveAnimations();

      // Start duration timer
      startDurationTimer();

      // Haptic feedback
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
          toValue: 1.5 + Math.random() * 0.5,
          duration: 300 + Math.random() * 200,
          useNativeDriver: true,
        }),
        Animated.timing(waveAnimations[index], {
          toValue: 1,
          duration: 300 + Math.random() * 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (isRecordingRef.current && !isRecordingPausedRef.current) {
          animateWave(index);
        }
      });
    };

    waveAnimations.forEach((_, index) => {
      setTimeout(() => animateWave(index), index * 100);
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
        } else {
          console.log('Picked media', asset.uri, type);
        }
      }
    } catch (e) {
      console.warn('pickMedia error', e);
    }
  };

  const pickAudio = async () => {
    if (disabled) return;
    Alert.alert('Coming soon', 'Audio attachments are not available yet in this build.');
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

  return (
    <View style={styles.outer}>
      {replyLabel && (
        <View style={styles.replyBar}>
          <Text style={styles.replyLabel} numberOfLines={1}>
            Replying to: {replyLabel}
          </Text>
        </View>
      )}
      {isEditing && !replyLabel && (
        <View style={styles.replyBar}>
          <Text style={styles.replyLabel}>Editing message</Text>
        </View>
      )}
      <View style={[styles.container, disabled && styles.disabledContainer]}>
        <TouchableOpacity
          style={styles.iconButton}
          accessibilityLabel="Emoji"
          disabled={disabled}
          onPress={handleEmojiPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="happy-outline" size={24} color={disabled ? '#9e9e9e' : '#f5f5f5'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.plusButton}
          accessibilityLabel="Add"
          disabled={disabled}
          onPress={handlePlus}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="add-circle" size={28} color={disabled ? '#9e9e9e' : '#4D8DFF'} />
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={
            disabled ? disabledPlaceholder || 'Accept the request to chat' : 'Message...'
          }
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={message}
          onChangeText={handleChange}
          onFocus={() => {
            setShowEmojis(false);
            setShowAttachSheet(false);
          }}
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          editable={!disabled}
        />

        <TouchableOpacity
          style={[styles.sendButton, disabled && styles.disabledSendButton]}
          onPress={handleRightPress}
          accessibilityLabel={hasText ? 'Send' : recordedUri ? 'Send audio' : 'Voice'}
          disabled={disabled}
        >
          <Ionicons name={hasText || recordedUri ? 'send' : 'mic'} size={20} color="white" />
        </TouchableOpacity>
      </View>

      {showEmojis && !disabled && (
        <Modal
          visible={showEmojis}
          transparent
          animationType="fade"
          onRequestClose={() => setShowEmojis(false)}
        >
          <View style={styles.emojiModalRoot}>
            <Pressable
              style={styles.emojiModalBackdrop}
              onPress={() => setShowEmojis(false)}
            />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.emojiModalAvoid}
            >
              <View
                style={[
                  styles.emojiModalSheet,
                  { paddingBottom: Math.max(12, insets.bottom) },
                ]}
              >
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

      {showAttachSheet && !disabled && (
        <View style={styles.attachSheet}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.attachScrollContent}
          >
            <TouchableOpacity style={styles.attachItem} onPress={pickMedia}>
              <View style={styles.attachIconCircle}>
                <Ionicons name="image-outline" size={22} color="#fff" />
              </View>
              <Text style={styles.attachLabel}>Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachItem} onPress={pickMedia}>
              <View style={styles.attachIconCircle}>
                <Ionicons name="videocam-outline" size={22} color="#fff" />
              </View>
              <Text style={styles.attachLabel}>Videos</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachItem} onPress={pickAudio}>
              <View style={styles.attachIconCircle}>
                <Ionicons name="mic-outline" size={22} color="#fff" />
              </View>
              <Text style={styles.attachLabel}>Audio</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachItem} onPress={pickMedia}>
              <View style={styles.attachIconCircle}>
                <Ionicons name="document-outline" size={22} color="#fff" />
              </View>
              <Text style={styles.attachLabel}>Files</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {(isRecording || recordedUri) && (
        <View style={styles.recordingOverlay}>
          <View style={styles.recordingContainer}>
            <View style={styles.waveContainer}>
              {waveAnimations.map((anim, index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.waveBar,
                    {
                      transform: [{ scaleY: anim }],
                      backgroundColor: recordedUri ? '#4D8DFF' : '#ff4b4b',
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.recordingInfo}>
              <Ionicons name="mic" size={24} color={recordedUri ? '#4D8DFF' : '#ff4b4b'} />
              <Text style={styles.recordingText}>
                {recordedUri ? 'Ready to send' : isRecordingPaused ? 'Paused' : 'Recording...'} {recordingDuration}s
              </Text>
            </View>

            {!recordedUri ? (
              <View style={styles.recordingActionsRow}>
                <TouchableOpacity style={styles.recordingPill} onPress={isRecordingPaused ? resumeRecording : pauseRecording}>
                  <Ionicons name={isRecordingPaused ? 'play' : 'pause'} size={18} color="#fff" />
                  <Text style={styles.recordingPillText}>{isRecordingPaused ? 'Resume' : 'Pause'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.recordingPill, styles.stopPill]} onPress={stopRecording}>
                  <Ionicons name="stop" size={18} color="#fff" />
                  <Text style={styles.recordingPillText}>Stop</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.recordingActionsRow}>
                <TouchableOpacity
                  style={[styles.recordingPill, styles.deletePill]}
                  onPress={() => {
                    setRecordedUri(null);
                    setRecordingDuration(0);
                    setIsRecording(false);
                    setIsRecordingPaused(false);
                    stopWaveAnimations();
                  }}
                >
                  <Ionicons name="trash" size={18} color="#fff" />
                  <Text style={styles.recordingPillText}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.recordingPill, styles.sendPill]}
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
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.recordingPillText}>Send</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    backgroundColor: 'transparent',
    marginHorizontal: 12,
    marginBottom: 8,
    marginTop: 8,
  },
  replyBar: {
    backgroundColor: 'rgba(42, 42, 42, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  replyLabel: {
    color: '#f5f5f5',
    fontSize: 14,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(26, 26, 26, 0.95)',
    borderRadius: 24,
    minHeight: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  disabledContainer: {
    opacity: 0.5,
  },
  iconButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  plusButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#f5f5f5',
    fontSize: 16,
    maxHeight: 120,
    minHeight: 20,
    paddingVertical: 4,
    marginHorizontal: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4D8DFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  disabledSendButton: {
    backgroundColor: '#333',
  },
  emojiKeyboard: {
    backgroundColor: 'rgba(42, 42, 42, 0.95)',
    borderRadius: 16,
    marginTop: 8,
    height: 320,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emojiModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  emojiModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  emojiModalAvoid: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  emojiModalSheet: {
    marginHorizontal: 12,
    marginBottom: 10,
    height: 380,
    maxHeight: '70%',
    backgroundColor: 'rgba(42, 42, 42, 0.98)',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emojiModalHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 10,
    marginBottom: 6,
  },
  emojiModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  emojiModalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  emojiModalCloseBtn: {
    backgroundColor: 'rgba(255,75,75,0.18)',
    borderColor: 'rgba(255,75,75,0.5)',
  },
  emojiModalActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  attachSheet: {
    backgroundColor: 'rgba(42, 42, 42, 0.95)',
    borderRadius: 16,
    marginTop: 8,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  attachScrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  attachItem: {
    alignItems: 'center',
    marginRight: 24,
  },
  attachIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#4D8DFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  attachLabel: {
    color: '#f5f5f5',
    fontSize: 12,
    textAlign: 'center',
  },
  recordingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    alignItems: 'center',
  },
  recordingContainer: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    minWidth: 260,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    marginBottom: 16,
  },
  waveBar: {
    width: 4,
    height: 40,
    marginHorizontal: 2,
    borderRadius: 2,
  },
  recordingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  recordingText: {
    color: '#f5f5f5',
    fontSize: 16,
    marginLeft: 8,
  },
  recordingActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  recordingPillText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  stopPill: {
    backgroundColor: 'rgba(255,75,75,0.18)',
    borderColor: 'rgba(255,75,75,0.5)',
  },
  deletePill: {
    backgroundColor: 'rgba(255,75,75,0.2)',
    borderColor: 'rgba(255,75,75,0.6)',
  },
  sendPill: {
    backgroundColor: '#4D8DFF',
    borderColor: '#4D8DFF',
  },
});

export default MessageInput;
