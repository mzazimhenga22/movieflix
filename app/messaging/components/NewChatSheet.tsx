import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
} from 'react-native';
import { Profile } from '../controller';
import { Ionicons } from '@expo/vector-icons';
import { useAccent } from '../../components/AccentContext';

interface NewChatSheetProps {
  isVisible: boolean;
  onClose: () => void;
  following: Profile[];
  onStartChat: (person: Profile) => void;
  onCreateGroup?: (name: string, members: Profile[]) => void;
}

const NewChatSheet = ({ isVisible, onClose, following, onStartChat, onCreateGroup }: NewChatSheetProps) => {
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { accentColor } = useAccent();

  useEffect(() => {
    if (!isVisible) {
      setIsGroupMode(false);
      setGroupName('');
      setSelectedIds(new Set());
    }
  }, [isVisible]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateGroup = () => {
    if (!onCreateGroup) return;
    const members = following.filter((p) => selectedIds.has(p.id));
    if (members.length === 0) return;
    onCreateGroup(groupName.trim() || 'New group', members);
    setGroupName('');
    setSelectedIds(new Set());
    setIsGroupMode(false);
    onClose();
  };

  const renderInitials = useMemo(
    () =>
      (name: string) =>
        name
          .split(' ')
          .filter(Boolean)
          .map((p) => p[0])
          .join('')
          .slice(0, 2)
          .toUpperCase(),
    [],
  );

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.sheetContainer, { borderColor: accentColor || '#e50914' }]}> 
          <View style={styles.header}>
            <Text style={styles.title}>{isGroupMode ? 'New Group' : 'New Message'}</Text>
            <View style={styles.headerActions}>
              {onCreateGroup && !isGroupMode && (
                <TouchableOpacity onPress={() => setIsGroupMode(true)} style={styles.groupToggle}>
                  <Ionicons name="people-outline" size={22} color="#fff" />
                </TouchableOpacity>
              )}
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close-circle" size={28} color={accentColor || '#e50914'} />
              </TouchableOpacity>
            </View>
          </View>

          {isGroupMode && (
            <View style={styles.groupHeader}>
              <Text style={styles.subtitle}>Group name</Text>
              <View style={styles.groupNameBox}>
                <TextInput
                  style={styles.groupNameInput}
                  placeholder="Give your group a name"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={groupName}
                  onChangeText={setGroupName}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.createGroupBtn,
                  selectedIds.size === 0 && styles.createGroupBtnDisabled,
                  selectedIds.size > 0 && { backgroundColor: accentColor || '#4D8DFF' }
                ]}
                onPress={handleCreateGroup}
                disabled={selectedIds.size === 0}
              >
                <Text style={styles.createGroupText}>
                  Create group ({selectedIds.size})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!isGroupMode && <Text style={styles.subtitle}>Following</Text>}
          <FlatList
            data={following}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const selected = selectedIds.has(item.id);
              const initials = renderInitials(item.displayName || 'U');
              return (
                <TouchableOpacity
                  style={[
                    styles.userItem,
                    selected && [
                      styles.userItemSelected,
                      { backgroundColor: accentColor ? `${accentColor}33` : 'rgba(77,141,255,0.18)' }
                    ]
                  ]}
                  onPress={() =>
                    isGroupMode
                      ? toggleSelect(item.id)
                      : onStartChat(item)
                  }
                >
                  {item.photoURL ? (
                    <Image source={{ uri: item.photoURL }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarFallbackText}>{initials}</Text>
                    </View>
                  )}
                  <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">{item.displayName}</Text>
                  {isGroupMode && selected && (
                    <Ionicons name="checkmark-circle" size={20} color={accentColor || '#4CD964'} />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{`You aren't following anyone yet.`}</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    height: '60%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3C',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupToggle: {
    marginRight: 8,
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  groupHeader: {
    marginTop: 16,
    marginBottom: 8,
    gap: 8,
  },
  groupNameBox: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  groupNameText: {
    color: '#fff',
    fontSize: 14,
  },
  groupNameInput: {
    color: '#fff',
    fontSize: 14,
  },
  createGroupBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#4D8DFF',
  },
  createGroupBtnDisabled: {
    backgroundColor: '#3A3A3C',
  },
  createGroupText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  userItemSelected: {
    backgroundColor: 'rgba(77,141,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 6,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  avatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.4,
  },
  userName: {
    fontSize: 16,
    color: '#fff',
    flex: 1,
    minWidth: 0,
  },
  emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 50,
  },
  emptyText: {
      color: '#8E8E93',
      fontSize: 16,
  }
});

export default NewChatSheet;
