import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Profile } from '../controller';

interface Props {
  item: Profile;
  onStartChat: (person: Profile) => void;
  onPressProfile?: () => void;
  disabled?: boolean;
  busy?: boolean;
}

const SuggestedPerson = ({ item, onStartChat, onPressProfile, disabled, busy }: Props) => (
  <View style={styles.personItem}>
    <TouchableOpacity
      style={styles.profilePress}
      activeOpacity={0.85}
      onPress={onPressProfile}
      disabled={!onPressProfile}
    >
      <Image source={{ uri: item.photoURL }} style={styles.personAvatar} />
      <View style={styles.personTextCol}>
        <Text style={styles.personName} numberOfLines={1}>
          {item.displayName || 'User'}
        </Text>
        <Text style={styles.personSub} numberOfLines={1}>
          Suggested
        </Text>
      </View>
    </TouchableOpacity>

    <TouchableOpacity
      style={[styles.startChatButton, (disabled || busy) ? styles.startChatButtonDisabled : null]}
      onPress={() => onStartChat(item)}
      disabled={!!disabled || !!busy}
      activeOpacity={0.85}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
      )}
      <Text style={styles.startChatButtonText}>{busy ? 'Opening…' : 'Chat'}</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  personItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  profilePress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  personAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  personTextCol: { flex: 1 },
  personName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  personSub: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    marginTop: 4,
  },
  startChatButton: {
    backgroundColor: '#4D8DFF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  startChatButtonDisabled: {
    opacity: 0.7,
  },
  startChatButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});

export default SuggestedPerson;
