import { useAccent } from '@/components/app-components/AccentContext';
import LiquidGlass from '@/components/app-components/LiquidGlass';
import { lightenColor, darkenColor, withAlpha } from '@/lib/colorUtils';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
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
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatMoviePicker, { MovieData } from './ChatMoviePicker';
import ChatMusicPicker, { MusicData } from './ChatMusicPicker';
import SafeEmojiPicker, { preloadEmojiData } from './SafeEmojiPicker';

const { width } = Dimensions.get('window');

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
  
  const inputRef = useRef<TextInput>(null);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const waveAnimations = useRef(Array.from({ length: 12 }, () => new Animated.Value(1))).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const hasText = message.trim().length > 0;

  useEffect(() => {
    let waveInterval: NodeJS.Timeout | null = null;
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      waveInterval = setInterval(() => {
        waveAnimations.forEach(anim => {
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 0.5 + Math.random() * 2.5,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start();
        });
      }, 300);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveInterval) clearInterval(waveInterval);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveInterval) clearInterval(waveInterval);
    };
  }, [isRecording, waveAnimations]);

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission denied', 'We need microphone access to record audio.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
      setRecordingDuration(0);
      Vibration.vibrate(50);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedUri(uri);
      setRecording(null);
      if (uri && onPickAudio) {
        onPickAudio(uri);
        resetRecording();
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      setRecording(null);
      resetRecording();
    } catch (err) {
      console.error('Failed to cancel recording', err);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSend = () => {
    if (disabled) return;
    
    if (!hasText && !recordedUri) {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
      return;
    }

    if (recordedUri && onPickAudio) {
      onPickAudio(recordedUri);
      resetRecording();
    }
    const text = message.trim();
    if (!text) return;
    onSendMessage(text);
    setMessage('');
    onTypingChange?.(false);
    Keyboard.dismiss();
  };

  const resetRecording = () => {
    setRecordedUri(null);
    setRecordingDuration(0);
    setIsRecording(false);
    setIsRecordingPaused(false);
  };

  const pickImage = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const type = asset.type === 'video' ? 'video' : 'image';
      onPickMedia?.(asset.uri, type);
    }
    setShowAttachSheet(false);
  };

  const pickCamera = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const type = asset.type === 'video' ? 'video' : 'image';
      onPickMedia?.(asset.uri, type);
    }
    setShowAttachSheet(false);
  };

  const attachmentOptions = [
    { icon: 'camera', label: 'Camera', color: '#34C759', onPress: pickCamera },
    { icon: 'image-outline', label: 'Gallery', color: '#FF6B6B', onPress: pickImage },
    { icon: 'musical-notes', label: 'Music', color: '#5AC8FA', onPress: () => { setShowMusicPicker(true); setShowAttachSheet(false); } },
    { icon: 'film', label: 'Movie', color: '#FF9500', onPress: () => { setShowMoviePicker(true); setShowAttachSheet(false); } },
    { icon: 'location-outline', label: 'Place', color: '#007AFF', onPress: () => {} },
    { icon: 'document-text-outline', label: 'File', color: '#AF52DE', onPress: () => {} },
  ];

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
    setMessage(prev => `${prev}${emoji}`);
    setShowEmojis(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <View style={styles.outer}>
      {/* Immersive Reply Bar */}
      {(replyLabel || isEditing) && (
        <View style={styles.contextBar}>
            <LiquidGlass cornerRadius={20} tintOpacity={0.1} glowColor={accent} glowIntensity={0.2} style={styles.contextGlass}>
                <View style={[styles.contextStripe, { backgroundColor: accent }]} />
                <Ionicons name={isEditing ? 'create' : 'arrow-undo'} size={18} color={accent} style={{ marginLeft: 12 }} />
                <View style={styles.contextText}>
                    <Text style={styles.contextTitle}>{isEditing ? 'Editing' : 'Replying'}</Text>
                    <Text style={styles.contextSub} numberOfLines={1}>{replyLabel || 'Current message'}</Text>
                </View>
                <TouchableOpacity onPress={onCloseContext} style={styles.contextClose}>
                    <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
            </LiquidGlass>
        </View>
      )}

      {/* Main Input Dock */}
      <View style={styles.inputDock}>
        <LiquidGlass 
            cornerRadius={32} 
            tintOpacity={0.12} 
            tintColor="#000" 
            glowColor={isFocused ? accent : undefined}
            glowIntensity={isFocused ? 0.15 : 0}
            style={StyleSheet.absoluteFill} 
        />
        
        <View style={styles.inputRow}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setShowAttachSheet(!showAttachSheet)}>
                <LiquidGlass cornerRadius={20} tintOpacity={showAttachSheet ? 0.2 : 0.05} tintColor={showAttachSheet ? accent : '#fff'} style={styles.iconGlass}>
                    <Ionicons name={showAttachSheet ? "close" : "add"} size={24} color="#fff" />
                </LiquidGlass>
            </TouchableOpacity>

            <View style={styles.inputWrapper}>
                {isRecording ? (
                  <View style={styles.recordingRow}>
                    <TouchableOpacity onPress={cancelRecording} style={styles.cancelBtn}>
                      <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                    </TouchableOpacity>
                    <View style={styles.waveContainer}>
                      {waveAnimations.map((anim, i) => (
                        <Animated.View
                          key={i}
                          style={[
                            styles.waveBar,
                            {
                              backgroundColor: accent,
                              transform: [{ scaleY: anim }],
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={styles.recordingTimer}>{formatDuration(recordingDuration)}</Text>
                  </View>
                ) : (
                  <TextInput
                      ref={inputRef}
                      style={styles.input}
                      placeholder={disabled ? disabledPlaceholder : 'Message...'}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={message}
                      onChangeText={setMessage}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      multiline
                  />
                )}
            </View>

            {!isRecording && (
              <TouchableOpacity style={styles.iconBtn} onPress={handleEmojiPress}>
                  <Ionicons name="happy-outline" size={24} color={isFocused || showEmojis ? "#fff" : "rgba(255,255,255,0.4)"} />
              </TouchableOpacity>
            )}

            <TouchableOpacity 
                style={styles.sendBtn} 
                onPress={handleSend}
                disabled={disabled}
            >
                <LiquidGlass 
                    cornerRadius={22} 
                    tintOpacity={hasText || recordedUri || isRecording ? 0.9 : 0.1} 
                    tintColor={accent} 
                    glowColor={accent}
                    glowIntensity={hasText || recordedUri || isRecording ? 0.5 : 0}
                    style={styles.sendGlass}
                >
                    <Ionicons 
                        name={hasText || recordedUri ? "send" : isRecording ? "stop" : "mic"} 
                        size={20} 
                        color="#fff" 
                    />
                </LiquidGlass>
            </TouchableOpacity>
        </View>
      </View>

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

      {/* Attachment Grid (Living Glass) */}
      {showAttachSheet && (
          <View style={styles.attachSheet}>
              <LiquidGlass cornerRadius={28} tintOpacity={0.1} style={styles.attachGlass}>
                  <View style={styles.attachHandle} />
                  <View style={styles.attachGrid}>
                      {attachmentOptions.map((opt, i) => (
                          <TouchableOpacity key={i} style={styles.attachItem} onPress={opt.onPress}>
                              <View style={[styles.attachIcon, { backgroundColor: `${opt.color}20` }]}>
                                  <Ionicons name={opt.icon as any} size={24} color={opt.color} />
                              </View>
                              <Text style={styles.attachLabel}>{opt.label}</Text>
                          </TouchableOpacity>
                      ))}
                  </View>
              </LiquidGlass>
          </View>
      )}

      {/* Resource Pickers */}
      <ChatMusicPicker visible={showMusicPicker} onClose={() => setShowMusicPicker(false)} onSelect={(m) => { onPickMusic?.(m); setShowMusicPicker(false); }} />
      <ChatMoviePicker visible={showMoviePicker} onClose={() => setShowMoviePicker(false)} onSelect={(m) => { onPickMovie?.(m); setShowMoviePicker(false); }} />
    </View>
  );
};

const styles = StyleSheet.create({
  outer: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 5 },
  contextBar: { marginBottom: 10, height: 56 },
  contextGlass: { flex: 1, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  contextStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  contextText: { flex: 1, marginLeft: 12 },
  contextTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  contextSub: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 2 },
  contextClose: { padding: 15 },
  
  inputDock: { minHeight: 64, borderRadius: 32, padding: 6, justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 48, height: 48 },
  iconGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  inputWrapper: { flex: 1, paddingHorizontal: 4 },
  input: { color: '#fff', fontSize: 16, fontWeight: '500', maxHeight: 120, minHeight: 24, paddingVertical: 8 },
  sendBtn: { width: 52, height: 52 },
  sendGlass: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  attachSheet: { marginTop: 12 },
  attachGlass: { padding: 20, paddingBottom: 30 },
  attachHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', alignSelf: 'center', marginBottom: 20 },
  attachGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15, justifyContent: 'space-between' },
  attachItem: { width: (width - 100) / 3, alignItems: 'center', gap: 10 },
  attachIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  attachLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },

  recordingRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  cancelBtn: { padding: 8 },
  waveContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 24 },
  waveBar: { width: 2, height: 12, borderRadius: 1 },
  recordingTimer: { color: '#fff', fontSize: 14, fontWeight: '600', minWidth: 40 },

  emojiModalRoot: { flex: 1 },
  emojiModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  emojiModalAvoid: { flex: 1, justifyContent: 'flex-end' },
  emojiModalSheet: { backgroundColor: '#121212', borderTopLeftRadius: 32, borderTopRightRadius: 32, height: Dimensions.get('window').height * 0.55, overflow: 'hidden' },
  emojiModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  emojiModalActions: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  emojiModalActionBtn: { flex: 1, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emojiModalActionText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  emojiModalCloseBtn: { backgroundColor: 'rgba(255,0,0,0.15)' },
});

export default MessageInput;
