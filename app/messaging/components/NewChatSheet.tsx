import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { getSuggestedPeople, Profile } from '../controller';
import { Ionicons } from '@expo/vector-icons';
import { useAccent } from '../../components/AccentContext';

interface NewChatSheetProps {
  isVisible: boolean;
  onClose: () => void;
  following: Profile[];
  suggestedPeople?: Profile[];
  onStartChat: (person: Profile) => void;
  onCreateGroup?: (name: string, members: Profile[]) => void;
  startingUserId?: string | null;
}

const NewChatSheet = ({
  isVisible,
  onClose,
  following,
  suggestedPeople,
  onStartChat,
  onCreateGroup,
  startingUserId,
}: NewChatSheetProps) => {
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [remoteSuggested, setRemoteSuggested] = useState<Profile[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  const { accentColor } = useAccent();

  const loadingSuggestedRef = useRef(false);

  useEffect(() => {
    if (!isVisible) {
      setIsGroupMode(false);
      setGroupName('');
      setSelectedIds(new Set());
      setQuery('');
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    if (Array.isArray(suggestedPeople) && suggestedPeople.length > 0) return;
    if (loadingSuggestedRef.current) return;

    loadingSuggestedRef.current = true;
    setLoadingSuggested(true);
    void getSuggestedPeople()
      .then((list) => setRemoteSuggested(Array.isArray(list) ? list : []))
      .catch(() => setRemoteSuggested([]))
      .finally(() => {
        loadingSuggestedRef.current = false;
        setLoadingSuggested(false);
      });
  }, [isVisible, suggestedPeople]);

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

  const allSuggested = (Array.isArray(suggestedPeople) && suggestedPeople.length > 0
    ? suggestedPeople
    : remoteSuggested) as Profile[];

  const normalize = useMemo(
    () =>
      (v: string) =>
        String(v || '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim(),
    [],
  );

  const isSubsequence = useMemo(
    () =>
      (needle: string, hay: string) => {
        if (!needle) return true;
        let j = 0;
        for (let i = 0; i < hay.length && j < needle.length; i += 1) {
          if (hay[i] === needle[j]) j += 1;
        }
        return j === needle.length;
      },
    [],
  );

  const dedupeById = useMemo(
    () =>
      (list: Profile[]) => {
        const map = new Map<string, Profile>();
        for (const p of list) {
          if (!p?.id) continue;
          if (!map.has(p.id)) map.set(p.id, p);
        }
        return Array.from(map.values());
      },
    [],
  );

  const q = normalize(query);
  const filteredFollowing = useMemo(() => {
    if (!q) return following;
    const tokens = q.split(' ').filter(Boolean);
    return following.filter((p) => {
      const name = normalize(p?.displayName || '');
      if (!name) return false;
      if (tokens.every((t) => name.includes(t))) return true;
      return isSubsequence(q.replace(/\s+/g, ''), name.replace(/\s+/g, ''));
    });
  }, [following, isSubsequence, normalize, q]);

  const filteredAllPeople = useMemo(() => {
    const base = dedupeById([...(following || []), ...(allSuggested || [])]);
    if (!q) return base;
    const tokens = q.split(' ').filter(Boolean);

    const scored = base
      .map((p) => {
        const name = normalize(p?.displayName || '');
        const compact = name.replace(/\s+/g, '');
        const qCompact = q.replace(/\s+/g, '');

        let score = 0;
        if (!name) score -= 10;
        if (name.startsWith(q)) score += 50;
        if (name.includes(q)) score += 25;
        if (tokens.every((t) => name.includes(t))) score += 18;
        if (isSubsequence(qCompact, compact)) score += 10;
        score -= Math.min(20, Math.floor(name.length / 6));

        return { p, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map(({ p }) => p);

    return scored;
  }, [allSuggested, dedupeById, following, isSubsequence, normalize, q]);

  const renderData = useMemo(() => {
    if (isGroupMode) {
      return filteredFollowing.map((p) => ({ type: 'user' as const, user: p }));
    }

    if (q) {
      return filteredAllPeople.map((p) => ({ type: 'user' as const, user: p }));
    }

    const out: Array<{ type: 'header'; title: string; right?: string } | { type: 'user'; user: Profile } | { type: 'spacer' }> = [];
    out.push({ type: 'header', title: 'Following', right: String((following || []).length) });
    (following || []).slice(0, 40).forEach((p) => out.push({ type: 'user', user: p }));

    if ((allSuggested || []).length > 0 || loadingSuggested) {
      out.push({ type: 'spacer' });
      out.push({ type: 'header', title: 'People you may know', right: loadingSuggested ? 'Loading…' : undefined });
      (allSuggested || []).slice(0, 40).forEach((p) => out.push({ type: 'user', user: p }));
    }

    return out;
  }, [allSuggested, filteredAllPeople, filteredFollowing, following, isGroupMode, loadingSuggested, q]);

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

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color="rgba(255,255,255,0.75)" />
            <TextInput
              style={styles.searchInput}
              placeholder={isGroupMode ? 'Search people to add' : 'Search people'}
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!startingUserId}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} style={styles.searchClear} disabled={!!startingUserId}>
                <Ionicons name="close" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={renderData as any}
            keyExtractor={(item: any, idx: number) => {
              if (item?.type === 'header') return `h-${item.title}-${idx}`;
              if (item?.type === 'spacer') return `s-${idx}`;
              return String(item?.user?.id || idx);
            }}
            renderItem={({ item }) => {
              if (item?.type === 'spacer') return <View style={{ height: 8 }} />;
              if (item?.type === 'header') {
                return (
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{item.title}</Text>
                    {item.right ? <Text style={styles.sectionRight}>{item.right}</Text> : null}
                  </View>
                );
              }

              const user = item.user as Profile;
              const selected = selectedIds.has(user.id);
              const initials = renderInitials(user.displayName || 'U');
              const busy = Boolean(startingUserId && startingUserId === user.id);
              const disabled = Boolean(startingUserId);
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
                      ? toggleSelect(user.id)
                      : onStartChat(user)
                  }
                  disabled={disabled}
                >
                  {user.photoURL ? (
                    <Image source={{ uri: user.photoURL }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarFallbackText}>{initials}</Text>
                    </View>
                  )}

                  <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">
                    {user.displayName}
                  </Text>

                  {isGroupMode ? (
                    selected ? <Ionicons name="checkmark-circle" size={20} color={accentColor || '#4CD964'} /> : null
                  ) : busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.65)" />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {q ? 'No matches. Try a different name.' : `You aren't following anyone yet.`}
                </Text>
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
  searchRow: {
    marginTop: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 0,
  },
  searchClear: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionRight: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '800',
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
    paddingHorizontal: 6,
    borderRadius: 12,
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
