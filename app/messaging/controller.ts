/* app/messaging/messagesController.tsx */
import { updateStreakForContext } from '@/lib/streaks/streakManager'
import type { User } from 'firebase/auth'
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
} from 'firebase/auth'

import { notifyPush } from '@/lib/pushApi'

import {
    DatabaseReference,
    getDatabase,
    off,
    onDisconnect,
    onValue,
    ref,
    serverTimestamp as rtdbServerTimestamp,
    set,
} from 'firebase/database'

import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    DocumentData,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    Query,
    QueryDocumentSnapshot,
    QuerySnapshot,
    serverTimestamp,
    setDoc,
    startAfter,
    where,
    writeBatch,
} from 'firebase/firestore'

import { authPromise, firestore } from '../../constants/firebase'

const rawBroadcastAdmins = (process.env.EXPO_PUBLIC_BROADCAST_ADMINS || '').split(',').map((id) => id.trim()).filter(Boolean)

const bakedBroadcastAdminEmails = ['vivescharris8@gmail.com']
const rawBroadcastAdminEmails = (process.env.EXPO_PUBLIC_BROADCAST_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

export const BROADCAST_ADMIN_IDS: string[] = rawBroadcastAdmins
export const BROADCAST_ADMIN_EMAILS: string[] = Array.from(
  new Set([...bakedBroadcastAdminEmails.map((e) => e.toLowerCase()), ...rawBroadcastAdminEmails]),
)
export const GLOBAL_BROADCAST_CHANNEL_ID = 'movieflix-onboarding-channel'
const GLOBAL_BROADCAST_NAME = 'MovieFlix Onboarding'
const GLOBAL_BROADCAST_DESCRIPTION = 'Platform announcements, onboarding tips, and release updates'
const MAX_GROUP_MEMBERS = 100

// ---- Types ----
export type Conversation = {
  id: string
  lastMessage?: string
  updatedAt?: any
  lastMessageSenderId?: string | null
  lastMessageHasMedia?: boolean
  pinned?: boolean
  muted?: boolean
  status?: 'active' | 'pending' | 'archived'
  members?: string[]

  // NEW (safe): read tracking
  lastReadAtBy?: Record<string, any>

  // Group-specific fields
  isGroup?: boolean
  name?: string
  description?: string
  avatarUrl?: string
  admins?: string[] // user IDs who are admins
  creator?: string // user ID of group creator
  inviteLink?: string
  inviteLinkExpires?: any
  privacy?: 'public' | 'private'
  messageApproval?: boolean
  autoDeleteMessages?: number // hours after which messages auto-delete
  theme?: {
    primaryColor?: string
    backgroundImage?: string
  }
  rules?: string[]
  isBroadcast?: boolean
  channelSlug?: string | null
  audience?: 'everyone' | 'private'
  requestInitiatorId?: string | null
  requestRecipientId?: string | null
  requestAcceptedAt?: any
  requestPreview?: string | null
  requestPreviewAt?: any

  [key: string]: any
}

export type Message = {
  id: string
  text?: string
  createdAt?: any
  from?: string
  replyToMessageId?: string
  replyToText?: string
  replyToSenderId?: string
  replyToSenderName?: string
  deleted?: boolean
  deletedFor?: string[]
  pinnedBy?: string[]
  editedAt?: any
  clientId?: string | null
  status?: 'sending' | 'sent' | 'delivered' | 'read'
  reactions?: { [emoji: string]: string[] } // emoji -> userIds
  forwarded?: boolean
  forwardedFrom?: string
  mediaUrl?: string
  mediaType?: 'image' | 'video' | 'audio' | 'file' | null
  fileName?: string
  fileSize?: number
  [key: string]: any
}

export type Profile = {
  id: string
  displayName: string
  photoURL: string
  status?: string
  isTyping?: boolean
  blockedUsers?: string[]
}

type AuthCallback = (user: User | null) => void
type UnsubscribeFn = () => void

/**
 * Internal helper: wait for auth to be ready and return it.
 */
async function getAuth(): Promise<import('firebase/auth').Auth> {
  return await authPromise
}

/** Helpers */
const chunk = <T,>(arr: T[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  )

// --- Presence / Realtime DB (singletons for this module) ---
const realtimeDb = getDatabase()

let connectedRef: DatabaseReference | null = null
let connectedHandler: ((snap: any) => void) | null = null
let presenceUserRef: DatabaseReference | null = null
let lastPresenceUid: string | null = null

const detachPresenceListeners = () => {
  if (connectedRef && connectedHandler) {
    off(connectedRef, 'value', connectedHandler)
  }
  connectedRef = null
  connectedHandler = null
  presenceUserRef = null
}

export const ensureGlobalBroadcastChannel = async (): Promise<void> => {
  const channelRef = doc(firestore, 'conversations', GLOBAL_BROADCAST_CHANNEL_ID)
  const existing = await getDoc(channelRef)

  if (existing.exists()) {
    const data = existing.data() as Conversation
    if ((!data.admins || data.admins.length === 0) && BROADCAST_ADMIN_IDS.length > 0) {
      await setDoc(channelRef, { admins: BROADCAST_ADMIN_IDS }, { merge: true })
    }
    return
  }

  await setDoc(
    channelRef,
    {
      isBroadcast: true,
      isGroup: true,
      channelSlug: 'onboarding',
      audience: 'everyone',
      name: GLOBAL_BROADCAST_NAME,
      description: GLOBAL_BROADCAST_DESCRIPTION,
      members: [],
      admins: BROADCAST_ADMIN_IDS,
      creator: 'system',
      updatedAt: serverTimestamp(),
      lastMessage:
        'Welcome to MovieFlix! Follow this space for release notes, downtime heads-up, and power tips.',
      lastMessageSenderId: 'system',
      status: 'active',
    },
    { merge: true },
  )
}

// --- Authentication ---
export const signUpWithEmail = async (
  email: string,
  password: string,
): Promise<User | null> => {
  try {
    const auth = await getAuth()
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    console.log('[messagesController] signUpWithEmail success', userCredential.user.uid)
    return userCredential.user as User
  } catch (error: any) {
    console.error('[messagesController] signUpWithEmail error:', error?.message ?? error)
    return null
  }
}

export const signInWithEmail = async (
  email: string,
  password: string,
): Promise<User | null> => {
  try {
    const auth = await getAuth()
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    console.log('[messagesController] signInWithEmail success', userCredential.user.uid)
    return userCredential.user as User
  } catch (error: any) {
    console.error('[messagesController] signInWithEmail error:', error?.message ?? error)
    return null
  }
}

/**
 * Presence + auth subscription:
 * - Fixes offline not updating on sign-out
 * - Uses RTDB serverTimestamp correctly
 * - Avoids .info/connected listener leaks
 * - Returns safe unsubscribe
 */
export const onAuthChange = (callback: AuthCallback): UnsubscribeFn => {
  let unsubAuth: UnsubscribeFn = () => {}
  let lastUid: string | null = null

  void authPromise
    .then((auth) => {
      unsubAuth = onAuthStateChanged(auth, (user) => {
        // If we had a previous user and now user is null => mark previous offline
        if (!user && lastUid) {
          void updateUserStatus(lastUid, 'offline')
          lastUid = null
          lastPresenceUid = null
          detachPresenceListeners()
          callback(null)
          return
        }

        if (!user?.uid) {
          callback(null)
          return
        }

        // Signed in
        lastUid = user.uid
        lastPresenceUid = user.uid

        // Firestore status update (optional but good)
        void updateUserStatus(user.uid, 'online')

        // Setup RTDB presence (clean old listeners)
        detachPresenceListeners()

        presenceUserRef = ref(realtimeDb, `/status/${user.uid}`)
        connectedRef = ref(realtimeDb, '.info/connected')

        const isOfflineForDatabase = {
          state: 'offline',
          last_changed: rtdbServerTimestamp(),
        }
        const isOnlineForDatabase = {
          state: 'online',
          last_changed: rtdbServerTimestamp(),
        }

        connectedHandler = (snapshot: any) => {
          if (snapshot.val() === false) {
            // Not connected: still persist "offline"
            // (onDisconnect will run once connection exists)
            void set(presenceUserRef!, isOfflineForDatabase)
            void updateUserStatus(user.uid, 'offline')
            return
          }

          // When connected: ensure we go offline on disconnect, then mark online
          onDisconnect(presenceUserRef!)
            .set(isOfflineForDatabase)
            .then(() => {
              void set(presenceUserRef!, isOnlineForDatabase)
              void updateUserStatus(user.uid, 'online')
            })
            .catch((e) => {
              console.warn('[messagesController] onDisconnect setup failed', e)
            })
        }

        onValue(connectedRef, connectedHandler)

        callback(user)
      })
    })
    .catch((err) => {
      console.warn('[messagesController] onAuthChange: auth init failed', err)
      callback(null)
    })

  return () => {
    try {
      unsubAuth()
    } catch {}
    detachPresenceListeners()
  }
}

// --- Typing indicator helpers (Realtime DB) ---
export const onUserTyping = (
  conversationId: string,
  userId: string,
  callback: (typing: boolean) => void,
): UnsubscribeFn => {
  const typingRef = ref(realtimeDb, `/typing/${conversationId}/${userId}`)
  const handler = (snap: any) => callback(!!snap.val())

  onValue(typingRef, handler)
  return () => off(typingRef, 'value', handler)
}

export const setTyping = async (
  conversationId: string,
  userId: string,
  typing: boolean,
  sendIndicator: boolean = true,
): Promise<void> => {
  if (!sendIndicator) return
  const typingRef = ref(realtimeDb, `/typing/${conversationId}/${userId}`)
  await set(typingRef, typing)
}

// --- Firestore subscriptions ---
export const onConversationUpdate = (
  conversationId: string,
  callback: (conv: Conversation) => void,
): UnsubscribeFn => {
  const docRef = doc(firestore, 'conversations', conversationId)
  const unsubscribe = onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) callback({ id: snap.id, ...(snap.data() as any) } as Conversation)
      else callback({ id: snap.id } as Conversation)
    },
    (err) => console.error('[messagesController] onConversationUpdate snapshot error:', err),
  )
  return () => unsubscribe()
}

export const onConversationsUpdate = (callback: (conversations: Conversation[]) => void): UnsubscribeFn => {
  let unsub: UnsubscribeFn = () => {}

  void authPromise
    .then((auth) => {
      const uid = auth.currentUser?.uid
      if (!uid) {
        callback([])
        return
      }

      const q = query(
        collection(firestore, 'conversations'),
        where('members', 'array-contains', uid),
        orderBy('updatedAt', 'desc'),
      )

      const snapUnsub = onSnapshot(
        q,
        (querySnapshot) => {
          const conversations: Conversation[] = querySnapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }))

          const sorted = conversations.sort((a, b) => {
            const aPinned = a.pinned ? 1 : 0
            const bPinned = b.pinned ? 1 : 0
            if (aPinned !== bPinned) return bPinned - aPinned

            const aUpdated = (a.updatedAt?.toMillis?.() ?? a.updatedAt?.seconds * 1000) || 0
            const bUpdated = (b.updatedAt?.toMillis?.() ?? b.updatedAt?.seconds * 1000) || 0
            return bUpdated - aUpdated
          })

          callback(sorted)
        },
        (err) => console.error('[messagesController] onConversationsUpdate snapshot error:', err),
      )

      unsub = () => {
        try {
          snapUnsub()
        } catch {}
      }
    })
    .catch((err) => {
      console.warn('[messagesController] onConversationsUpdate: auth init failed', err)
      callback([])
    })

  return () => unsub()
}

/**
 * Messages subscription:
 * - Tightened: only last 50 for perf
 * - Desc order (you can reverse in UI)
 */
export const onMessagesUpdate = (
  conversationId: string,
  callback: (messages: Message[]) => void,
): UnsubscribeFn => {
  const messagesColRef = collection(firestore, 'conversations', conversationId, 'messages')
  const q = query(messagesColRef, orderBy('createdAt', 'desc'), limit(50))

  const unsubscribe = onSnapshot(
    q,
    (querySnapshot) => {
      const messages: Message[] = querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      }))
      callback(messages) // UI can reverse if it wants oldest->newest
    },
    (err) => console.error('[messagesController] onMessagesUpdate snapshot error:', err),
  )

  return () => unsubscribe()
}

export const onUserProfileUpdate = (userId: string, callback: (profile: Profile) => void): UnsubscribeFn => {
  const docRef = doc(firestore, 'users', userId)
  const unsubscribe = onSnapshot(docRef, (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...(snap.data() as any) } as Profile)
  })
  return () => unsubscribe()
}

/**
 * Subscribe to realtime presence for a user (RTDB `/status/{userId}`).
 * Calls back with the raw status object { state, last_changed }.
 */
export const onUserPresence = (
  userId: string,
  callback: (status: { state: 'online' | 'offline'; last_changed: number | null }) => void,
): UnsubscribeFn => {
  try {
    const presenceRef = ref(realtimeDb, `/status/${userId}`)
    const handler = (snap: any) => {
      const val = snap.val()
      if (!val) {
        callback({ state: 'offline', last_changed: null })
        return
      }
      const last = val.last_changed ?? null
      // RTDB serverTimestamp may be a number or an object; normalize to millis if possible
      const lastMillis = last && typeof last === 'object' && typeof last.toMillis === 'function' ? last.toMillis() : (typeof last === 'number' ? last : null)
      callback({ state: val.state === 'online' ? 'online' : 'offline', last_changed: lastMillis })
    }

    onValue(presenceRef, handler)
    return () => off(presenceRef, 'value', handler)
  } catch (err) {
    console.warn('[messagesController] onUserPresence failed', err)
    return () => {}
  }
}

/**
 * sendMessage:
 * - Uses batch to keep message + conversation summary consistent
 */
export const sendMessage = async (
  conversationId: string,
  message: Partial<Message> & { clientId?: string | null },
): Promise<string | null> => {
  const auth = await getAuth()
  if (!auth?.currentUser) return null
  const uid = auth.currentUser.uid
  const email = (auth.currentUser.email || '').trim().toLowerCase()

  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  const conversationSnapshot = await getDoc(conversationDocRef)
  if (!conversationSnapshot.exists()) {
    throw new Error('Conversation not found')
  }

  const conversationData = conversationSnapshot.data() as Conversation
  const isBroadcastChannel = conversationData.isBroadcast
  const isChannelAdmin = Boolean(
    conversationData.admins?.includes(uid) ||
      BROADCAST_ADMIN_IDS.includes(uid) ||
      (email && BROADCAST_ADMIN_EMAILS.includes(email)),
  )
  const isPendingRequest = conversationData.status === 'pending'
  const requestInitiatorId = conversationData.requestInitiatorId || conversationData.creator || uid
  const isRequestSender = requestInitiatorId === uid

  if (isBroadcastChannel && !isChannelAdmin) {
    throw new Error('Only admins can post in this channel')
  }

  if (isPendingRequest && !isRequestSender) {
    throw new Error('This message request has not been accepted yet')
  }

  const messagesColRef = collection(firestore, 'conversations', conversationId, 'messages')

  const payload: Record<string, any> = {
    ...message,
    from: uid,
    createdAt: serverTimestamp(),
  }
  if (message.clientId) payload.clientId = message.clientId

  // Create message doc ref first so batch can write it
  const newMessageRef = doc(messagesColRef) // auto-id
  const batch = writeBatch(firestore)

  batch.set(newMessageRef, payload)

  const previewText = (() => {
    if ((message as any).text) return (message as any).text
    if ((message as any).mediaType === 'image') return 'Photo'
    if ((message as any).mediaType === 'video') return 'Video'
    if ((message as any).mediaType === 'audio') return 'Audio message'
    if ((message as any).mediaUrl) return 'Attachment'
    return ''
  })()

  const conversationUpdate: Record<string, any> = {
    lastMessage: previewText,
    lastMessageSenderId: uid,
    updatedAt: serverTimestamp(),
  }

  if (isPendingRequest && isRequestSender) {
    conversationUpdate.requestPreview = previewText
    conversationUpdate.requestPreviewAt = serverTimestamp()
  }

  batch.set(conversationDocRef, conversationUpdate, { merge: true })

  await batch.commit()

  // Update chat streak
  try {
    const members: string[] = (conversationData.members as string[]) || []
    const partnerId = members.find((m) => m !== uid) ?? null
    void updateStreakForContext({
      kind: 'chat',
      conversationId,
      partnerId: partnerId ?? null,
      partnerName: null,
    })
  } catch (err) {
    console.warn('[messagesController] failed to update chat streak', err)
  }

  void notifyPush({ kind: 'message', conversationId, messageId: newMessageRef.id })

  return newMessageRef.id
}

export const deleteMessageForMe = async (
  conversationId: string,
  messageId: string,
  userId: string,
): Promise<void> => {
  const messageDocRef = doc(firestore, 'conversations', conversationId, 'messages', messageId)
  await setDoc(messageDocRef, { deletedFor: arrayUnion(userId) }, { merge: true })
  await recomputeConversationLastMessage(conversationId, userId)
}

export const deleteMessageForAll = async (conversationId: string, messageId: string): Promise<void> => {
  const messageDocRef = doc(firestore, 'conversations', conversationId, 'messages', messageId)
  await setDoc(messageDocRef, { deleted: true }, { merge: true })
  await recomputeConversationLastMessage(conversationId)
}

export const pinMessage = async (conversationId: string, messageId: string, userId: string): Promise<void> => {
  const messageDocRef = doc(firestore, 'conversations', conversationId, 'messages', messageId)
  await setDoc(messageDocRef, { pinnedBy: arrayUnion(userId) }, { merge: true })
}

export const unpinMessage = async (conversationId: string, messageId: string, userId: string): Promise<void> => {
  const messageDocRef = doc(firestore, 'conversations', conversationId, 'messages', messageId)
  await setDoc(messageDocRef, { pinnedBy: arrayRemove(userId) }, { merge: true })
}

export const editMessage = async (conversationId: string, messageId: string, newText: string): Promise<void> => {
  const messageDocRef = doc(firestore, 'conversations', conversationId, 'messages', messageId)
  await setDoc(messageDocRef, { text: newText, editedAt: serverTimestamp() }, { merge: true })
  await recomputeConversationLastMessage(conversationId)
}

export const setConversationPinned = async (conversationId: string, pinned: boolean): Promise<void> => {
  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  await setDoc(conversationDocRef, { pinned }, { merge: true })
}

export const muteConversation = async (conversationId: string, muted: boolean): Promise<void> => {
  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  await setDoc(conversationDocRef, { muted }, { merge: true })
}

/**
 * markConversationRead:
 * - FIX: no longer destroys lastMessageSenderId
 * - stores lastReadAtBy.{uid} = serverTimestamp()
 * - respects read receipts setting
 */
export const markConversationRead = async (conversationId: string, sendReceipt: boolean = true): Promise<void> => {
  const auth = await getAuth()
  if (!auth?.currentUser) return
  const uid = auth.currentUser.uid

  if (!sendReceipt) return

  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  await setDoc(
    conversationDocRef,
    {
      [`lastReadAtBy.${uid}`]: serverTimestamp(),
    },
    { merge: true },
  )
}

export const deleteConversation = async (conversationId: string): Promise<void> => {
  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  await deleteDoc(conversationDocRef)
}

/**
 * recomputeConversationLastMessage:
 * - FIX: paginate until we find a visible message
 * - avoids false "empty" when last 20 are deleted/hidden
 */
const recomputeConversationLastMessage = async (
  conversationId: string,
  viewerId?: string,
): Promise<void> => {
  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  const messagesColRef = collection(firestore, 'conversations', conversationId, 'messages')

  let cursor: QueryDocumentSnapshot<DocumentData> | null = null
  let found: Message | null = null
  let rounds = 0

  while (!found && rounds < 6) {
    rounds += 1

    // ✅ Explicit type fixes TS7022
const qLatest: Query<DocumentData> = cursor
  ? query(messagesColRef, orderBy('createdAt', 'desc'), startAfter(cursor), limit(50))
  : query(messagesColRef, orderBy('createdAt', 'desc'), limit(50))

const snapshot: QuerySnapshot<DocumentData> = await getDocs(qLatest)

    if (snapshot.empty) break

    const docs: QueryDocumentSnapshot<DocumentData>[] = snapshot.docs
    cursor = docs[docs.length - 1] ?? null

    for (const docSnap of docs) {
      const data = { id: docSnap.id, ...(docSnap.data() as any) } as Message

      if (data.deleted) continue
      if (viewerId && Array.isArray(data.deletedFor) && data.deletedFor.includes(viewerId)) continue

      found = data
      break
    }

    if (docs.length < 50) break
  }

  if (!found) {
    await setDoc(
      conversationDocRef,
      { lastMessage: '', lastMessageSenderId: null, updatedAt: serverTimestamp() },
      { merge: true },
    )
    return
  }

  await setDoc(
    conversationDocRef,
    {
      lastMessage: (found as any).text ?? '',
      lastMessageSenderId: (found as any).from ?? (found as any).sender ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

/**
 * getFollowing:
 * - FIX: chunks '__name__ in' into max 10
 */
export const getFollowing = async (): Promise<Profile[]> => {
  const auth = await getAuth()
  if (!auth?.currentUser) return []

  const userDocRef = doc(firestore, 'users', auth.currentUser.uid)
  const userDoc = await getDoc(userDocRef)
  const followingIds: string[] = userDoc.data()?.following || []

  if (followingIds.length === 0) return []

  const usersRef = collection(firestore, 'users')
  const chunks = chunk(followingIds, 10)
  const results: Profile[] = []

  for (const ids of chunks) {
    const q = query(usersRef, where('__name__', 'in', ids))
    const snap = await getDocs(q)
    results.push(...snap.docs.map((d) => ({ ...(d.data() as any), id: d.id } as Profile)))
  }

  return results
}

export const getSuggestedPeople = async (): Promise<Profile[]> => {
  const auth = await getAuth()
  if (!auth?.currentUser) return []

  const userDocRef = doc(firestore, 'users', auth.currentUser.uid)
  const userDoc = await getDoc(userDocRef)
  const followingIds: string[] = userDoc.data()?.following || []

  const usersRef = collection(firestore, 'users')
  const q = query(usersRef, limit(50))
  const snapshot = await getDocs(q)

  const candidates: (Profile & { followerCount?: number })[] = snapshot.docs
    .map((docSnap) => {
      const data = docSnap.data() as any
      return {
        id: docSnap.id,
        displayName: data.displayName,
        photoURL: data.photoURL,
        status: data.status,
        isTyping: false,
        followerCount: Array.isArray(data.followers)
          ? data.followers.length
          : data.followersCount ?? 0,
      }
    })
    .filter((p) => p.id !== auth.currentUser!.uid && !followingIds.includes(p.id))

  candidates.sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0))
  return candidates.slice(0, 10)
}

export const updateConversationStatus = async (conversationId: string, status: string): Promise<void> => {
  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  await setDoc(conversationDocRef, { status }, { merge: true })
}

export const acceptMessageRequest = async (conversationId: string): Promise<void> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  const snap = await getDoc(conversationDocRef)
  if (!snap.exists()) throw new Error('Conversation not found')

  const data = snap.data() as Conversation
  if (data.status !== 'pending') return

  if (data.requestInitiatorId === auth.currentUser.uid) {
    throw new Error('Only the recipient can accept this request')
  }

  await setDoc(
    conversationDocRef,
    { status: 'active', requestAcceptedAt: serverTimestamp() },
    { merge: true },
  )
}

export const createGroupConversation = async (options: {
  name: string
  memberIds: string[]
  avatarUrl?: string | null
  description?: string
  privacy?: 'public' | 'private'
}): Promise<string> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  const uniqueMembers = Array.from(new Set([auth.currentUser.uid, ...options.memberIds]))

  if (uniqueMembers.length > MAX_GROUP_MEMBERS) {
    throw new Error(`Groups are limited to ${MAX_GROUP_MEMBERS} members`)
  }

  const conversationsRef = collection(firestore, 'conversations')
  const newConversation = await addDoc(conversationsRef, {
    isGroup: true,
    name: options.name || 'Group',
    description: options.description || '',
    avatarUrl: options.avatarUrl || null,
    members: uniqueMembers,
    admins: [auth.currentUser.uid], // creator is first admin
    creator: auth.currentUser.uid,
    privacy: options.privacy || 'private',
    updatedAt: serverTimestamp(),
    lastMessage: '',
    status: 'active',
    lastMessageSenderId: null,
  })

  return newConversation.id
}

export const findOrCreateConversation = async (otherUser: Profile): Promise<string> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  const conversationsRef = collection(firestore, 'conversations')
  const indexKey = [auth.currentUser.uid, otherUser.id].sort().join(':')

  const q = query(conversationsRef, where('indexKey', '==', indexKey), limit(1))
  const querySnapshot = await getDocs(q)
  if (!querySnapshot.empty) {
    const existingRef = querySnapshot.docs[0].ref
    const existingData = querySnapshot.docs[0].data() as Conversation
    if (
      existingData.status === 'pending' &&
      !existingData.requestInitiatorId &&
      !existingData.requestRecipientId
    ) {
      const inferredInitiator = auth.currentUser.uid
      const inferredRecipient = otherUser.id
      await setDoc(
        existingRef,
        {
          requestInitiatorId: inferredInitiator,
          requestRecipientId: inferredRecipient,
        },
        { merge: true },
      )
    }
    return existingRef.id
  }

  const otherUserDocRef = doc(firestore, 'users', otherUser.id)
  const otherUserDoc = await getDoc(otherUserDocRef)
  const otherUserFollowing = otherUserDoc.data()?.following || []
  const isFollowingBack = otherUserFollowing.includes(auth.currentUser.uid)

  const currentUserDocRef = doc(firestore, 'users', auth.currentUser.uid)
  const currentUserDoc = await getDoc(currentUserDocRef)
  const currentUserFollowing = currentUserDoc.data()?.following || []
  const isFollowing = currentUserFollowing.includes(otherUser.id)

  const initialStatus = isFollowing && isFollowingBack ? 'active' : 'pending'
  const isRequest = initialStatus === 'pending'

  const payload: Record<string, any> = {
    members: [auth.currentUser.uid, otherUser.id],
    indexKey,
    updatedAt: serverTimestamp(),
    lastMessage: '',
    status: initialStatus,
    lastMessageSenderId: null,
  }

  if (isRequest) {
    payload.requestInitiatorId = auth.currentUser.uid
    payload.requestRecipientId = otherUser.id
    payload.requestPreview = ''
    payload.requestPreviewAt = serverTimestamp()
  }

  const newConversation = await addDoc(conversationsRef, payload)

  return newConversation.id
}

export const updateUserStatus = async (userId: string, status: string): Promise<void> => {
  const userDocRef = doc(firestore, 'users', userId)
  await setDoc(
    userDocRef,
    { status, lastSeen: serverTimestamp() },
    { merge: true },
  )
}

export const findUserByUsername = async (username: string): Promise<Profile | null> => {
  const usersRef = collection(firestore, 'users')
  const q = query(usersRef, where('displayName', '==', username), limit(1))
  const querySnapshot = await getDocs(q)
  if (querySnapshot.empty) return null
  const userDoc = querySnapshot.docs[0]
  return { ...(userDoc.data() as any), id: userDoc.id } as Profile
}

export const getProfileById = async (userId: string): Promise<Profile | null> => {
  const userDocRef = doc(firestore, 'users', userId)
  const userDoc = await getDoc(userDocRef)
  if (!userDoc.exists()) return null
  return { id: userDoc.id, ...(userDoc.data() as any) } as Profile
}

// New functions for WhatsApp-like features

export const addMessageReaction = async (
  conversationId: string,
  messageId: string,
  emoji: string,
  userId: string,
): Promise<void> => {
  const messageDocRef = doc(firestore, 'conversations', conversationId, 'messages', messageId)
  await setDoc(messageDocRef, {
    [`reactions.${emoji}`]: arrayUnion(userId)
  }, { merge: true })
}

export const removeMessageReaction = async (
  conversationId: string,
  messageId: string,
  emoji: string,
  userId: string,
): Promise<void> => {
  const messageDocRef = doc(firestore, 'conversations', conversationId, 'messages', messageId)
  await setDoc(messageDocRef, {
    [`reactions.${emoji}`]: arrayRemove(userId)
  }, { merge: true })
}

export const forwardMessage = async (
  fromConversationId: string,
  messageId: string,
  toConversationIds: string[],
  userId: string,
): Promise<void> => {
  const messageDocRef = doc(firestore, 'conversations', fromConversationId, 'messages', messageId)
  const messageSnap = await getDoc(messageDocRef)
  if (!messageSnap.exists()) return

  const originalMessage = { id: messageSnap.id, ...(messageSnap.data() as any) } as Message

  const forwardPayload: Partial<Message> = {
    text: originalMessage.text,
    mediaUrl: originalMessage.mediaUrl,
    mediaType: originalMessage.mediaType,
    fileName: originalMessage.fileName,
    fileSize: originalMessage.fileSize,
    forwarded: true,
    forwardedFrom: originalMessage.from,
    from: userId,
    createdAt: serverTimestamp(),
  }

  for (const toConversationId of toConversationIds) {
    await sendMessage(toConversationId, forwardPayload)
  }
}

export const updateMessageStatus = async (
  conversationId: string,
  messageId: string,
  status: 'sent' | 'delivered' | 'read',
): Promise<void> => {
  const messageDocRef = doc(firestore, 'conversations', conversationId, 'messages', messageId)
  await setDoc(messageDocRef, { status }, { merge: true })
}

export const markMessagesDelivered = async (conversationId: string, userId: string): Promise<void> => {
  const messagesColRef = collection(firestore, 'conversations', conversationId, 'messages')
  const q = query(messagesColRef, where('from', '!=', userId), where('status', 'in', ['sent']))
  const snapshot = await getDocs(q)

  const batch = writeBatch(firestore)
  snapshot.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, { status: 'delivered' })
  })
  await batch.commit()
}

export const markMessagesRead = async (conversationId: string, userId: string): Promise<void> => {
  const messagesColRef = collection(firestore, 'conversations', conversationId, 'messages')
  const q = query(messagesColRef, where('from', '!=', userId), where('status', 'in', ['sent', 'delivered']))
  const snapshot = await getDocs(q)

  const batch = writeBatch(firestore)
  snapshot.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, { status: 'read' })
  })
  await batch.commit()
}

export const getLastSeen = async (userId: string): Promise<Date | null> => {
  const userDocRef = doc(firestore, 'users', userId)
  const userDoc = await getDoc(userDocRef)
  if (!userDoc.exists()) return null

  const data = userDoc.data() as any
  if (data.lastSeen && typeof data.lastSeen.toDate === 'function') {
    return data.lastSeen.toDate()
  }
  return null
}

export const archiveConversation = async (conversationId: string, archived: boolean): Promise<void> => {
  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  await setDoc(conversationDocRef, { archived }, { merge: true })
}

// Group management functions
export const addGroupAdmin = async (conversationId: string, userId: string): Promise<void> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  // Check if current user is admin
  const convSnap = await getDoc(doc(firestore, 'conversations', conversationId))
  if (!convSnap.exists()) throw new Error('Conversation not found')

  const convData = convSnap.data() as Conversation
  if (!convData.admins?.includes(auth.currentUser.uid)) {
    throw new Error('Only admins can manage group admins')
  }

  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  await setDoc(conversationDocRef, { admins: arrayUnion(userId) }, { merge: true })
}

export const removeGroupAdmin = async (conversationId: string, userId: string): Promise<void> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  // Check if current user is admin
  const convSnap = await getDoc(doc(firestore, 'conversations', conversationId))
  if (!convSnap.exists()) throw new Error('Conversation not found')

  const convData = convSnap.data() as Conversation
  if (!convData.admins?.includes(auth.currentUser.uid)) {
    throw new Error('Only admins can manage group admins')
  }

  // Cannot remove the creator
  if (userId === convData.creator) {
    throw new Error('Cannot remove group creator from admins')
  }

  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  await setDoc(conversationDocRef, { admins: arrayRemove(userId) }, { merge: true })
}

export const addGroupMember = async (conversationId: string, userId: string): Promise<void> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  await setDoc(conversationDocRef, { members: arrayUnion(userId) }, { merge: true })
}

export const removeGroupMember = async (conversationId: string, userId: string): Promise<void> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  // Check if current user is admin or the member themselves
  const convSnap = await getDoc(doc(firestore, 'conversations', conversationId))
  if (!convSnap.exists()) throw new Error('Conversation not found')

  const convData = convSnap.data() as Conversation
  const isAdmin = convData.admins?.includes(auth.currentUser.uid)
  const isSelf = auth.currentUser.uid === userId

  if (!isAdmin && !isSelf) {
    throw new Error('Only admins can remove other members')
  }

  // Cannot remove the creator
  if (userId === convData.creator) {
    throw new Error('Cannot remove group creator')
  }

  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  const batch = writeBatch(firestore)

  batch.set(conversationDocRef, { members: arrayRemove(userId) }, { merge: true })

  // If removing an admin, also remove from admins list
  if (convData.admins?.includes(userId)) {
    batch.set(conversationDocRef, { admins: arrayRemove(userId) }, { merge: true })
  }

  await batch.commit()
}

export const updateGroupSettings = async (
  conversationId: string,
  updates: Partial<Pick<Conversation, 'name' | 'description' | 'avatarUrl' | 'privacy' | 'messageApproval' | 'autoDeleteMessages' | 'theme' | 'rules'>>
): Promise<void> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  // Check if current user is admin
  const convSnap = await getDoc(doc(firestore, 'conversations', conversationId))
  if (!convSnap.exists()) throw new Error('Conversation not found')

  const convData = convSnap.data() as Conversation
  if (!convData.admins?.includes(auth.currentUser.uid)) {
    throw new Error('Only admins can update group settings')
  }

  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  await setDoc(conversationDocRef, updates, { merge: true })
}

export const leaveGroup = async (conversationId: string): Promise<void> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  const convSnap = await getDoc(doc(firestore, 'conversations', conversationId))
  if (!convSnap.exists()) throw new Error('Conversation not found')

  const convData = convSnap.data() as Conversation

  // Cannot leave if you're the creator
  if (auth.currentUser.uid === convData.creator) {
    throw new Error('Group creator cannot leave the group')
  }

  await removeGroupMember(conversationId, auth.currentUser.uid)
}

export const blockUser = async (targetUserId: string): Promise<void> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  if (auth.currentUser.uid === targetUserId) throw new Error('You cannot block yourself')

  const userDocRef = doc(firestore, 'users', auth.currentUser.uid)
  await setDoc(userDocRef, { blockedUsers: arrayUnion(targetUserId) }, { merge: true })
}

export const unblockUser = async (targetUserId: string): Promise<void> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  const userDocRef = doc(firestore, 'users', auth.currentUser.uid)
  await setDoc(userDocRef, { blockedUsers: arrayRemove(targetUserId) }, { merge: true })
}

export const reportUser = async (
  targetUserId: string,
  options?: { conversationId?: string | null; reason?: string | null; details?: string | null },
): Promise<string> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')
  if (!targetUserId) throw new Error('Missing target user')
  if (auth.currentUser.uid === targetUserId) throw new Error('You cannot report yourself')

  const reportsRef = collection(firestore, 'reports')
  const docRef = await addDoc(reportsRef, {
    kind: 'user',
    reporterId: auth.currentUser.uid,
    targetUserId,
    conversationId: options?.conversationId ?? null,
    reason: options?.reason ?? 'unspecified',
    details: options?.details ?? null,
    createdAt: serverTimestamp(),
  })

  return docRef.id
}

export const reportConversation = async (
  conversationId: string,
  options?: { reason?: string | null; details?: string | null },
): Promise<string> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')
  if (!conversationId) throw new Error('Missing conversation')

  const reportsRef = collection(firestore, 'reports')
  const docRef = await addDoc(reportsRef, {
    kind: 'conversation',
    reporterId: auth.currentUser.uid,
    conversationId,
    reason: options?.reason ?? 'unspecified',
    details: options?.details ?? null,
    createdAt: serverTimestamp(),
  })

  return docRef.id
}

export const generateGroupInviteLink = async (conversationId: string, expiresInHours: number = 24): Promise<string> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  // Check if current user is admin
  const convSnap = await getDoc(doc(firestore, 'conversations', conversationId))
  if (!convSnap.exists()) throw new Error('Conversation not found')

  const convData = convSnap.data() as Conversation
  if (!convData.admins?.includes(auth.currentUser.uid)) {
    throw new Error('Only admins can generate invite links')
  }

  const inviteCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000)

  const conversationDocRef = doc(firestore, 'conversations', conversationId)
  await setDoc(conversationDocRef, {
    inviteLink: inviteCode,
    inviteLinkExpires: expiresAt
  }, { merge: true })

  return inviteCode
}

export const joinGroupWithInvite = async (inviteCode: string): Promise<string | null> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  const conversationsRef = collection(firestore, 'conversations')
  const q = query(conversationsRef, where('inviteLink', '==', inviteCode))
  const snapshot = await getDocs(q)

  if (snapshot.empty) {
    throw new Error('Invalid invite link')
  }

  const conversationDoc = snapshot.docs[0]
  const convData = conversationDoc.data() as Conversation

  // Check if link is expired
  if (convData.inviteLinkExpires && convData.inviteLinkExpires.toDate() < new Date()) {
    throw new Error('Invite link has expired')
  }

  // Check if already a member
  if (convData.members?.includes(auth.currentUser.uid)) {
    return conversationDoc.id
  }

  // Add user to group
  await addGroupMember(conversationDoc.id, auth.currentUser.uid)

  return conversationDoc.id
}

export const createGroupPoll = async (
  conversationId: string,
  question: string,
  options: string[]
): Promise<string> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  const pollsRef = collection(firestore, 'conversations', conversationId, 'polls')
  const pollData = {
    question,
    options: options.map(option => ({ text: option, votes: [] })),
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    voters: []
  }

  const pollDoc = await addDoc(pollsRef, pollData)
  return pollDoc.id
}

export const voteInPoll = async (
  conversationId: string,
  pollId: string,
  optionIndex: number
): Promise<void> => {
  const auth = await getAuth()
  if (!auth?.currentUser) throw new Error('User not authenticated')

  const pollDocRef = doc(firestore, 'conversations', conversationId, 'polls', pollId)
  const pollSnap = await getDoc(pollDocRef)

  if (!pollSnap.exists()) {
    throw new Error('Poll not found')
  }

  const pollData = pollSnap.data() as any
  const userId = auth.currentUser.uid

  // Remove previous vote if exists
  const updatedOptions = pollData.options.map((option: any, index: number) => {
    if (index === optionIndex) {
      return { ...option, votes: arrayUnion(userId) }
    } else {
      return { ...option, votes: arrayRemove(userId) }
    }
  })

  await setDoc(pollDocRef, {
    options: updatedOptions,
    voters: arrayUnion(userId)
  }, { merge: true })
}

export const sendMentionMessage = async (
  conversationId: string,
  text: string,
  mentionedUserIds: string[]
): Promise<string | null> => {
  const message: Partial<Message> = {
    text,
    mentionedUserIds,
    createdAt: serverTimestamp(),
  }

  return await sendMessage(conversationId, message)
}

export default {}
