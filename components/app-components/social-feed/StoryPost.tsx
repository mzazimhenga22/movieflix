import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
} from 'react-native';

export default function StoryPost() {
  const [composerVisible, setComposerVisible] = useState(false);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);

  // subtle appear animation for the composer
  const anim = React.useRef(new Animated.Value(0)).current;
  const openComposer = () => {
    setComposerVisible(true);
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };
  const closeComposer = () => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setComposerVisible(false);
      setCaption('');
    });
  };

  const handleSend = async () => {
    if (!caption.trim()) return; // don't send empty captions
    setSending(true);
    try {
      // TODO: replace with real upload/post logic
      console.log('Posting caption:', caption);
      // simulate request
      await new Promise((res) => setTimeout(res, 700));
      // reset UI
      setCaption('');
      closeComposer();
    } catch (err) {
      console.warn('Failed to post', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <View style={styles.left}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarShadow}>
              <View style={styles.avatar} />
            </View>
            <TouchableOpacity style={styles.plusBtn} accessibilityLabel="Add story">
              <Ionicons name="add" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          <View>
            <Text style={styles.storyTitle}>Your story</Text>
            <Text style={styles.storySub}>Share quick thoughts or behind-the-scenes</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.postButton}
          onPress={openComposer}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Post movie review"
        >
          <Ionicons name="pencil" size={18} color="#fff" />
          <Text style={styles.postText}>Post Movie Review</Text>
        </TouchableOpacity>
      </View>

      {/* Composer */}
      {composerVisible && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={80}
        >
          <Animated.View
            style={[
              styles.composer,
              {
                opacity: anim,
                transform: [
                  {
                    translateY: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                  {
                    scale: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.995, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <TextInput
              style={styles.input}
              placeholder="Write a quick review or caption…"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={caption}
              onChangeText={setCaption}
              multiline
              numberOfLines={3}
              maxLength={280}
              editable={!sending}
              returnKeyType="done"
            />

            <View style={styles.composerFooter}>
              <Text style={styles.charCount}>{caption.length}/280</Text>

              <View style={styles.actionGroup}>
                <TouchableOpacity onPress={closeComposer} style={styles.cancelBtn} accessibilityRole="button">
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSend}
                  style={[styles.sendBtn, sending ? styles.sendBtnDisabled : undefined]}
                  disabled={sending || !caption.trim()}
                  accessibilityRole="button"
                >
                  <Text style={styles.sendText}>{sending ? 'Posting…' : 'Send'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 12,
    marginTop: 6,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarWrap: { marginRight: 14, position: 'relative' },
  avatarShadow: {
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 3,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2f2f2f',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  plusBtn: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    backgroundColor: '#ff3d3d',
    borderRadius: 14,
    padding: 6,
    borderWidth: 2,
    borderColor: '#1f1f1f',
    shadowColor: '#ff3d3d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  storyTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  storySub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },

  postButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff4b4b',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginLeft: 10,
    minWidth: 150,
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#ff4b4b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  postText: { color: '#fff', fontWeight: '800', marginLeft: 8 },

  // Composer styles
  composer: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  input: {
    minHeight: 64,
    maxHeight: 160,
    color: '#fff',
    fontSize: 15,
    textAlignVertical: 'top',
    padding: 8,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  charCount: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  cancelText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  sendBtn: {
    backgroundColor: '#ff3d3d',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
