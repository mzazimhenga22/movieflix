import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';

import { supabase, supabaseConfigured } from '../../../../constants/supabase';
import { useMessagingSettings } from '../../../../hooks/useMessagingSettings';
import { useUser } from '../../../../hooks/use-user';
import {
  addMessageReaction,
  deleteMessageForAll,
  deleteMessageForMe,
  editMessage,
  getProfileById,
  markConversationRead,
  onConversationUpdate,
  onMessagesUpdate,
  onUserPresence,
  onUserTyping,
  pinMessage,
  removeMessageReaction,
  setTyping,
  unpinMessage,
  type Conversation,
  type Profile,
  sendMessage,
} from '../../controller';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';

type PendingMedia = { uri: string; type: 'image' | 'video' | 'audio' | 'file' };

type ChatMessage = {
  id?: string;
  text?: string;
  sender?: string;
  createdAt?: any;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'file' | null;
  pinnedBy?: string[];
  reactions?: { [emoji: string]: string[] };
  clientId?: string | null;
  replyToMessageId?: string;
  replyToText?: string;
  replyToSenderId?: string;
  replyToSenderName?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  failed?: boolean;
  [key: string]: any;
};

const normalizeSenderId = (m: any) => String(m?.sender ?? m?.from ?? '').trim();

const toMillis = (createdAt: any) => {
  try {
    if (!createdAt) return 0;
    if (typeof createdAt === 'number') return createdAt;
    if (typeof createdAt?.toMillis === 'function') return createdAt.toMillis();
    if (typeof createdAt?.toDate === 'function') return createdAt.toDate().getTime();
    if (typeof createdAt?.seconds === 'number') return createdAt.seconds * 1000;
  } catch {
    // ignore
  }
  return 0;
};

export default function MiniChatSheet(props: {
  bottomSheetRef: React.RefObject<BottomSheet | null>;
  sellerProfile: Profile | null;
  conversationId: string | null;
  onRequestClose?: () => void;
}) {
  const { bottomSheetRef, sellerProfile, conversationId, onRequestClose } = props;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings } = useMessagingSettings();
  const { user } = useUser();

  const snapPoints = useMemo(() => ['55%', '92%'] as const, []);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [otherUser, setOtherUser] = useState<Profile | null>(sellerProfile);
  const [otherPresence, setOtherPresence] = useState<{ state: 'online' | 'offline'; last_changed: number | null } | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [pendingCaption, setPendingCaption] = useState('');
  const listRef = useRef<any>(null);

  useEffect(() => {
    setOtherUser(sellerProfile);
  }, [sellerProfile]);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      setPendingMessages([]);
      setReplyTo(null);
      setEditingMessage(null);
      setPendingMedia(null);
      setPendingCaption('');
      return;
    }

    const unsubConversation = onConversationUpdate(conversationId, (c) => setConversation(c));
    const unsubMessages = onMessagesUpdate(conversationId, (ms) => {
      const mapped = ms.map(
        (m) =>
          ({
            id: m.id,
            text: m.text,
            sender: normalizeSenderId(m),
            createdAt: m.createdAt,
            mediaUrl: m.mediaUrl,
            mediaType: (m.mediaType ?? null) as any,
            pinnedBy: m.pinnedBy,
            reactions: m.reactions,
            replyToMessageId: m.replyToMessageId,
            replyToText: m.replyToText,
            replyToSenderId: m.replyToSenderId,
            replyToSenderName: m.replyToSenderName,
            clientId: m.clientId ?? null,
          }) as ChatMessage
      );
      setMessages(mapped);
    });

    return () => {
      try {
        unsubConversation();
      } catch {}
      try {
        unsubMessages();
      } catch {}
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    if (!user?.uid) return;
    void markConversationRead(conversationId, settings.readReceipts);
  }, [conversationId, settings.readReceipts, user?.uid, messages.length]);

  useEffect(() => {
    if (settings.hibernate) {
      setOtherPresence(null);
      setIsOtherTyping(false);
      return;
    }
    if (!conversation || !user?.uid) return;
    if (conversation.isGroup) return;
    const members = Array.isArray(conversation.members) ? conversation.members : [];
    const otherId = members.find((m) => m && m !== user.uid) || sellerProfile?.id;
    if (!otherId) return;

    let unsubPresence: (() => void) | null = null;
    let unsubTyping: (() => void) | null = null;

    void getProfileById(otherId)
      .then((p) => {
        if (p) setOtherUser(p);
      })
      .catch(() => {});

    unsubPresence = onUserPresence(otherId, setOtherPresence);
    unsubTyping = onUserTyping(conversation.id, otherId, setIsOtherTyping);

    return () => {
      try {
        unsubPresence?.();
      } catch {}
      try {
        unsubTyping?.();
      } catch {}
    };
  }, [conversation, sellerProfile?.id, settings.hibernate, user?.uid]);

  const visibleMessages = useMemo(() => {
    const combined = [...messages, ...pendingMessages];
    combined.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    return combined;
  }, [messages, pendingMessages]);

  const pendingClientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of pendingMessages) {
      if (m.clientId) ids.add(String(m.clientId));
    }
    return ids;
  }, [pendingMessages]);

  const otherLastReadAtMs = useMemo(() => {
    const otherId = otherUser?.id;
    if (!otherId) return 0;
    return toMillis((conversation as any)?.lastReadAtBy?.[otherId]);
  }, [conversation, otherUser?.id]);

  const uploadChatMedia = useCallback(
    async (uri: string, type: PendingMedia['type']): Promise<{ url: string; mediaType: PendingMedia['type'] } | null> => {
      if (!conversationId) return null;
      if (!user?.uid || !supabaseConfigured) return null;

      try {
        const base64Data = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const binary: string = atob(base64Data);
        const fileBuffer = Uint8Array.from(binary, (c: string) => c.charCodeAt(0)).buffer;

        const rawName = uri.split('/').pop() || `chat-${Date.now()}`;
        const safeName = rawName.replace(/\s+/g, '_');
        const bucket = 'chats';
        const fileName = `${conversationId}/${Date.now()}-${safeName}`;

        const contentType =
          type === 'image'
            ? 'image/jpeg'
            : type === 'video'
              ? 'video/mp4'
              : type === 'audio'
                ? 'audio/m4a'
                : 'application/octet-stream';

        const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, fileBuffer, {
          contentType,
          upsert: true,
        });
        if (uploadError) return null;

        const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(fileName);
        const url = (publicUrl as any)?.publicUrl ?? (publicUrl as any)?.public_url ?? null;
        if (!url) return null;

        return { url, mediaType: type };
      } catch {
        return null;
      }
    },
    [conversationId, user?.uid]
  );

  const handleTypingChange = useCallback(
    (typing: boolean) => {
      if (!conversationId || !user?.uid) return;
      void setTyping(conversationId, user.uid, typing, settings.typingIndicators);
    },
    [conversationId, settings.typingIndicators, user?.uid]
  );

  const handleSendText = useCallback(
    async (text: string) => {
      if (!conversationId || !user?.uid) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      if (editingMessage?.id) {
        void editMessage(conversationId, editingMessage.id, trimmed);
        setEditingMessage(null);
        setReplyTo(null);
        return;
      }

      const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tempId = `temp-${clientId}`;
      const pending: ChatMessage = {
        id: tempId,
        text: trimmed,
        sender: user.uid,
        createdAt: Date.now(),
        clientId,
        status: 'sending',
      };

      if (replyTo?.id) {
        pending.replyToMessageId = replyTo.id;
        pending.replyToText = replyTo.text;
        pending.replyToSenderId = replyTo.sender;
        // Resolve the sender name: if it's the current user, use their name, otherwise use otherUser
        const replySenderName = replyTo.sender === user.uid 
          ? (user.displayName || 'You')
          : (otherUser?.displayName || 'Unknown');
        pending.replyToSenderName = replySenderName;
      }

      setPendingMessages((prev) => [...prev, pending]);
      setReplyTo(null);

      try {
        const replySenderName = replyTo?.sender === user.uid 
          ? (user.displayName || 'You')
          : (otherUser?.displayName || 'Unknown');
        await sendMessage(conversationId, {
          text: trimmed,
          clientId,
          ...(replyTo?.id
            ? {
                replyToMessageId: replyTo.id,
                replyToText: replyTo.text,
                replyToSenderId: replyTo.sender,
                replyToSenderName: replySenderName,
              }
            : null),
        } as any);
        setPendingMessages((prev) => prev.filter((m) => m.clientId !== clientId));
      } catch {
        setPendingMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...m, failed: true } : m)));
      }
    },
    [conversationId, editingMessage?.id, replyTo, user?.uid, user?.displayName, otherUser?.displayName]
  );

  const handlePickMedia = useCallback((uri: string, type: 'image' | 'video') => {
    setPendingMedia({ uri, type });
    setPendingCaption('');
  }, []);

  const handlePickAudio = useCallback((uri: string) => {
    setPendingMedia({ uri, type: 'audio' });
    setPendingCaption('');
  }, []);

  const handleCropPendingImage = useCallback(async () => {
    if (!pendingMedia || pendingMedia.type !== 'image') return;
    try {
      const result = await manipulateAsync(pendingMedia.uri, [{ resize: { width: 900 } }], {
        compress: 0.82,
        format: SaveFormat.JPEG,
      });
      setPendingMedia({ ...pendingMedia, uri: result.uri });
    } catch {
      // ignore
    }
  }, [pendingMedia]);

  const handleSendPendingMedia = useCallback(async () => {
    if (!conversationId || !user?.uid || !pendingMedia) return;

    const uploaded = await uploadChatMedia(pendingMedia.uri, pendingMedia.type);
    if (!uploaded) {
      Alert.alert('Upload failed', 'Unable to upload media right now.');
      return;
    }

    const text =
      pendingCaption.trim() ||
      (pendingMedia.type === 'image'
        ? 'Photo'
        : pendingMedia.type === 'video'
          ? 'Video'
          : pendingMedia.type === 'audio'
            ? 'Audio message'
            : 'Attachment');

    const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempId = `temp-${clientId}`;
    const pending: ChatMessage = {
      id: tempId,
      text,
      sender: user.uid,
      createdAt: Date.now(),
      clientId,
      status: 'sending',
      mediaUrl: uploaded.url,
      mediaType: uploaded.mediaType as any,
    };

    setPendingMessages((prev) => [...prev, pending]);
    setPendingMedia(null);
    setPendingCaption('');

    try {
      await sendMessage(conversationId, {
        text,
        mediaUrl: uploaded.url,
        mediaType: uploaded.mediaType === 'audio' ? 'audio' : (uploaded.mediaType as any),
        clientId,
      } as any);
      setPendingMessages((prev) => prev.filter((m) => m.clientId !== clientId));
    } catch {
      setPendingMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...m, failed: true } : m)));
    }
  }, [conversationId, pendingCaption, pendingMedia, uploadChatMedia, user?.uid]);

  const toggleReaction = useCallback(
    (msg: ChatMessage, emoji: string) => {
      if (!conversationId || !user?.uid || !msg.id) return;
      const users = (msg.reactions || {})[emoji] || [];
      if (users.includes(user.uid)) {
        void removeMessageReaction(conversationId, msg.id, emoji, user.uid);
      } else {
        void addMessageReaction(conversationId, msg.id, emoji, user.uid);
      }
    },
    [conversationId, user?.uid]
  );

  const handleOpenMedia = useCallback(
    (msg: ChatMessage) => {
      if (!conversationId) return;
      if (!msg.mediaUrl || (msg.mediaType !== 'image' && msg.mediaType !== 'video')) return;
      const mediaMessages = visibleMessages
        .filter((m) => m.mediaUrl && (m.mediaType === 'image' || m.mediaType === 'video'))
        .map((m, idx) => ({ id: m.id ?? `media-${idx}`, url: m.mediaUrl, type: m.mediaType }));
      const index = mediaMessages.findIndex((m) => m.id === msg.id);
      if (index < 0) return;

      router.push({
        pathname: '/messaging/chat/media-viewer',
        params: {
          conversationId,
          media: JSON.stringify(mediaMessages),
          index: String(index),
        },
      });
    },
    [conversationId, router, visibleMessages]
  );

  const renderHeaderSubtitle = () => {
    if (isOtherTyping) return 'Typing…';
    if (settings.hibernate) return '—';
    if (otherPresence?.state === 'online') return 'Online';
    return 'Offline';
  };

  const title = otherUser?.displayName || sellerProfile?.displayName || 'MiniChat';

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints as any}
      enablePanDownToClose
      onClose={onRequestClose}
      backdropComponent={(p) => <BottomSheetBackdrop {...p} disappearsOnIndex={-1} appearsOnIndex={0} />}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handleIndicator}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <View style={[styles.container, { paddingBottom: Math.max(10, insets.bottom) }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => bottomSheetRef.current?.close()}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {renderHeaderSubtitle()}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              if (!conversationId) return;
              router.push({ pathname: '/messaging/chat/[id]', params: { id: conversationId } });
            }}
            disabled={!conversationId}
          >
            <Ionicons name="expand-outline" size={20} color={conversationId ? '#fff' : 'rgba(255,255,255,0.35)'} />
          </TouchableOpacity>
        </View>

        {!conversationId ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Start a conversation to chat.</Text>
          </View>
        ) : (
          <>
            <View style={styles.listWrap}>
              <FlashList<ChatMessage>
                ref={(r: any) => {
                  listRef.current = r;
                }}
                data={visibleMessages}
                inverted
                estimatedItemSize={96}
                keyExtractor={(item: ChatMessage, idx: number) => item.id || item.clientId || String(idx)}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }: { item: ChatMessage }) => {
                  const senderId = String((item as any).sender ?? (item as any).from ?? '').trim();
                  const isMe = Boolean(senderId && user?.uid && senderId === user.uid);
                  const avatar = !isMe ? otherUser?.photoURL : undefined;
                  const senderName = !isMe ? otherUser?.displayName : user?.displayName ?? 'You';

                  const createdAtMs = toMillis((item as any).createdAt);
                  const isPendingLocal = Boolean(item.clientId && pendingClientIds.has(String(item.clientId)));
                  const computedStatus = (() => {
                    if (!isMe) return undefined;
                    if ((item as any).failed === true) return 'sending' as const;
                    if (isPendingLocal || String((item as any).id || '').startsWith('temp-')) return 'sending' as const;

                    const canUseReadReceipts = Boolean(settings.readReceipts && otherUser?.id);
                    const didRead = canUseReadReceipts && otherLastReadAtMs > 0 && otherLastReadAtMs >= createdAtMs;
                    if (didRead) return 'read' as const;
                    const delivered = Boolean(otherUser?.id && otherPresence?.state === 'online');
                    return delivered ? ('delivered' as const) : ('sent' as const);
                  })();

                  const statusDecorated = isMe
                    ? ({ ...(item as any), status: computedStatus, __offline: false } as any)
                    : item;

                  return (
                    <MessageBubble
                      item={statusDecorated}
                      isMe={isMe}
                      avatar={avatar}
                      senderName={senderName}
                      onPressMedia={() => handleOpenMedia(item)}
                      onPressReaction={(emoji) => toggleReaction(item, emoji)}
                      onLongPress={(msg) => setSelectedMessage(msg as any)}
                    />
                  );
                }}
              />
            </View>

            <MessageInput
              onSendMessage={handleSendText}
              onTypingChange={handleTypingChange}
              onPickMedia={handlePickMedia}
              onPickAudio={handlePickAudio}
              replyLabel={replyTo?.text || (replyTo?.mediaType ? 'Attachment' : undefined)}
              isEditing={!!editingMessage}
            />
          </>
        )}

        <Modal
          visible={!!selectedMessage}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedMessage(null)}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSelectedMessage(null)}>
            <View style={styles.actionSheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.actionRow}>
                {['👍', '❤️', '😂', '🔥', '😮', '😢'].map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={styles.emojiBtn}
                    onPress={() => {
                      if (selectedMessage) toggleReaction(selectedMessage, e);
                      setSelectedMessage(null);
                    }}
                  >
                    <Text style={styles.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  if (selectedMessage) setReplyTo(selectedMessage);
                  setSelectedMessage(null);
                }}
              >
                <Ionicons name="return-up-back-outline" size={18} color="#fff" />
                <Text style={styles.actionText}>Reply</Text>
              </TouchableOpacity>

              {!!selectedMessage?.text && user?.uid && selectedMessage.sender === user.uid && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => {
                    setEditingMessage(selectedMessage);
                    setSelectedMessage(null);
                  }}
                >
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
              )}

              {selectedMessage?.id && user?.uid && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => {
                    if (!conversationId) return;
                    const pinned = Array.isArray(selectedMessage.pinnedBy) && selectedMessage.pinnedBy.includes(user.uid);
                    if (pinned) void unpinMessage(conversationId, selectedMessage.id!, user.uid);
                    else void pinMessage(conversationId, selectedMessage.id!, user.uid);
                    setSelectedMessage(null);
                  }}
                >
                  <Ionicons name="pin-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>Pin / Unpin</Text>
                </TouchableOpacity>
              )}

              {selectedMessage?.id && user?.uid && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.dangerBtn]}
                  onPress={() => {
                    if (!conversationId) return;
                    void deleteMessageForMe(conversationId, selectedMessage.id!, user.uid);
                    setSelectedMessage(null);
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>Delete for me</Text>
                </TouchableOpacity>
              )}

              {selectedMessage?.id && user?.uid && selectedMessage.sender === user.uid && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.dangerBtn]}
                  onPress={() => {
                    if (!conversationId) return;
                    void deleteMessageForAll(conversationId, selectedMessage.id!);
                    setSelectedMessage(null);
                  }}
                >
                  <Ionicons name="trash-bin-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>Delete for everyone</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => setSelectedMessage(null)}>
                <Text style={styles.cancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <Modal
          visible={!!pendingMedia}
          transparent
          animationType="slide"
          onRequestClose={() => setPendingMedia(null)}
        >
          <View style={styles.mediaModalRoot}>
            <View style={[styles.mediaModalCard, { paddingBottom: Math.max(12, insets.bottom) }]}>
              <View style={styles.mediaHeader}>
                <Text style={styles.mediaTitle}>Send attachment</Text>
                <TouchableOpacity onPress={() => setPendingMedia(null)}>
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.mediaPreviewWrap}>
                {pendingMedia?.type === 'image' ? (
                  <Image source={{ uri: pendingMedia.uri }} style={styles.mediaPreview} />
                ) : pendingMedia?.type === 'video' ? (
                  <Video
                    source={{ uri: pendingMedia.uri }}
                    style={styles.mediaPreview}
                    useNativeControls
                    resizeMode={ResizeMode.COVER}
                  />
                ) : (
                  <View style={styles.filePreview}>
                    <Ionicons name={pendingMedia?.type === 'audio' ? 'mic-outline' : 'document-outline'} size={26} color="#fff" />
                    <Text style={styles.filePreviewText} numberOfLines={1}>
                      {pendingMedia?.uri.split('/').pop() || 'Attachment'}
                    </Text>
                  </View>
                )}
              </View>

              <TextInput
                value={pendingCaption}
                onChangeText={setPendingCaption}
                placeholder="Add a caption (optional)"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={styles.captionInput}
              />

              {pendingMedia?.type === 'image' && (
                <TouchableOpacity style={styles.secondaryAction} onPress={handleCropPendingImage}>
                  <Ionicons name="crop-outline" size={18} color="#fff" />
                  <Text style={styles.secondaryActionText}>Optimize image</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.primaryAction} onPress={handleSendPendingMedia}>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.primaryActionText}>Send</Text>
              </TouchableOpacity>

              {!supabaseConfigured && (
                <Text style={styles.warningText}>
                  Media upload is disabled (Supabase env vars missing).
                </Text>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: '#0b0c12',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  handleIndicator: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  container: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
    paddingBottom: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 2,
  },
  listWrap: {
    flex: 1,
    marginTop: 4,
  },
  listContent: {
    paddingVertical: 6,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(18,20,30,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  emojiText: {
    fontSize: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginTop: 10,
  },
  actionText: {
    color: '#fff',
    fontWeight: '800',
  },
  dangerBtn: {
    backgroundColor: 'rgba(229,9,20,0.14)',
    borderColor: 'rgba(229,9,20,0.4)',
  },
  cancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#fff',
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  mediaModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  mediaModalCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(18,20,30,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 12,
  },
  mediaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  mediaTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  mediaPreviewWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  mediaPreview: {
    width: '100%',
    height: 260,
  },
  filePreview: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  filePreviewText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    paddingHorizontal: 10,
  },
  captionInput: {
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    fontWeight: '700',
  },
  secondaryAction: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  secondaryActionText: {
    color: '#fff',
    fontWeight: '800',
  },
  primaryAction: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#e50914',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '900',
  },
  warningText: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
