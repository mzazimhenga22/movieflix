import React from 'react';
import { TouchableOpacity, Image, Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface StoryLike {
  id: string;
  name?: string;
  avatar?: string;
  username?: string;
  photoURL?: string;
  displayAvatar?: string | null;
  timestampLabel?: string | null;
  isSelf?: boolean;
  hasStory?: boolean;
}

interface Props {
  item: StoryLike;
  onPress?: (p: StoryLike) => void;
}

const StoryItem = ({ item, onPress }: Props) => {
  const isSelf = Boolean(item.isSelf);
  const hasStory = Boolean(item.hasStory);
  const displayName = isSelf ? 'My Story' : item.name || item.username || 'Story';
  const avatarUri = item.displayAvatar || item.avatar || item.photoURL;
  const helperText = isSelf
    ? hasStory
      ? 'Tap to view'
      : 'Tap to add'
    : item.timestampLabel || '';

  const handlePress = () => {
    onPress?.(item);
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.85}>
      <LinearGradient
        colors={
          hasStory
            ? ['#f2994a', '#f2c94c']
            : ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.ring, !hasStory && styles.ringMuted]}
      >
        <View style={[styles.avatarWrap, !hasStory && styles.avatarWrapMuted]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.storyAvatar} />
          ) : (
            <View style={[styles.storyAvatar, styles.storyAvatarPlaceholder]} />
          )}
          {isSelf && !hasStory && (
            <View style={styles.plusBadge}>
              <Ionicons name="add" size={14} color="#fff" />
            </View>
          )}
        </View>
      </LinearGradient>
      <Text style={styles.storyName} numberOfLines={1}>
        {displayName}
      </Text>
      {helperText ? (
        <Text style={styles.storyHelper} numberOfLines={1}>
          {helperText}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginRight: 14,
    width: 76,
  },
  ring: {
    padding: 3,
    borderRadius: 999,
    marginBottom: 6,
  },
  ringMuted: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatarWrap: {
    borderRadius: 999,
    padding: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
    position: 'relative',
  },
  avatarWrapMuted: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  storyAvatar: {
    width: 62,
    height: 62,
    borderRadius: 999,
  },
  storyAvatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  plusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#05060f',
  },
  storyName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  storyHelper: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
});

export default StoryItem;
