
import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  Image,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EdgeInsets } from 'react-native-safe-area-context';
import { useUser } from '../../../../hooks/use-user';

interface UserHeaderProps {
  onClose: () => void;
  insets: EdgeInsets;
}

export default function UserHeader({ onClose, insets }: UserHeaderProps) {
  const { user } = useUser();
  const currentUserAvatar = user?.photoURL;
  const currentUsername = user?.displayName || user?.email;

  return (
    <View style={[styles.header, { top: insets.top + (Platform.OS === 'android' ? 12 : 0) }]}>
      <View style={styles.headerLeft}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color="white" />
        </TouchableOpacity>

        <View style={styles.userRow}>
          {currentUserAvatar && <Image source={{ uri: currentUserAvatar }} style={styles.avatar} />}
          <Text style={styles.username}>{currentUsername || 'Anonymous'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 1000,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  userRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  username: { color: 'white', marginLeft: 8, fontWeight: '600' },
});
