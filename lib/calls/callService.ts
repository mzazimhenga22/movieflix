import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  deleteField,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '@/constants/firebase';
import { notifyPush } from '@/lib/pushApi';

import type { CallSession, CallStatus, CreateCallOptions } from './types';

const callsCollection = collection(firestore, 'calls');
const ACTIVE_STATUSES: CallStatus[] = ['initiated', 'ringing', 'active'];

const PRESENCE_FRESHNESS_MS = 45_000;
const OFFLINE_RING_TIMEOUT_MS = 60_000;

type CallMessageStatus = 'started' | 'ended' | 'missed' | 'declined';

const userRef = (userId: string) => doc(firestore, 'users', userId);
const callRefForId = (callId: string) => doc(firestore, 'calls', callId);
const callMessageRef = (conversationId: string, messageId: string) =>
  doc(firestore, 'conversations', conversationId, 'messages', messageId);

const conversationRef = (conversationId: string) => doc(firestore, 'conversations', conversationId);

const setUserActiveCall = async (userId: string, callId: string | null): Promise<void> => {
  const payload: Record<string, any> = {
    activeCallUpdatedAt: serverTimestamp(),
  };
  if (callId) payload.activeCallId = callId;
  else payload.activeCallId = deleteField();

  await setDoc(userRef(userId), payload, { merge: true });
};

const isUserBusy = async (userId: string): Promise<boolean> => {
  try {
    const snap = await getDoc(userRef(userId));
    if (!snap.exists()) return false;
    const data = snap.data() as any;
    const activeCallId = typeof data?.activeCallId === 'string' ? data.activeCallId.trim() : '';
    if (!activeCallId) return false;

    const callSnap = await getDoc(callRefForId(activeCallId));
    const status = (callSnap.exists() ? (callSnap.data() as any)?.status : null) as CallStatus | null;
    const isActive = Boolean(status && ACTIVE_STATUSES.includes(status));
    if (isActive) return true;

    // stale pointer: clear it.
    await setDoc(userRef(userId), { activeCallId: deleteField() }, { merge: true });
    return false;
  } catch {
    return false;
  }
};

const upsertCallEventMessage = async (params: {
  conversationId: string;
  callId: string;
  from: string | null;
  callType: 'voice' | 'video';
  callStatus: CallMessageStatus;
  durationSeconds?: number | null;
}): Promise<void> => {
  const messageId = `call-${params.callId}-${params.callStatus}`;

  const text = (() => {
    const mode = params.callType === 'video' ? 'video' : 'voice';
    switch (params.callStatus) {
      case 'started':
        return `Started ${mode} call`;
      case 'missed':
        return `Missed ${mode} call`;
      case 'declined':
        return `Declined ${mode} call`;
      case 'ended':
      default:
        return 'Call ended';
    }
  })();

  const payload: Record<string, any> = {
    id: messageId,
    from: params.from ?? null,
    createdAt: serverTimestamp(),
    text,
    callId: params.callId,
    callType: params.callType,
    callStatus: params.callStatus,
  };

  if (typeof params.durationSeconds === 'number' && Number.isFinite(params.durationSeconds)) {
    payload.callDuration = Math.max(0, Math.round(params.durationSeconds));
  }

  await setDoc(callMessageRef(params.conversationId, messageId), payload, { merge: true });

  // Keep conversation list in sync.
  await setDoc(
    conversationRef(params.conversationId),
    {
      lastMessage: text,
      lastMessageSenderId: params.from ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const reconcileExpiredCallIfNeeded = async (callId: string): Promise<void> => {
  const callRef = callRefForId(callId);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(callRef);
    if (!snap.exists()) return;
    const data = snap.data() as any;
    const status = (data?.status ?? null) as CallStatus | null;
    if (!status || status === 'active' || status === 'ended' || status === 'declined' || status === 'missed') return;
    if (data?.isGroup) return;

    const timeoutMillis =
      data?.ringTimeoutAt && typeof data.ringTimeoutAt?.toMillis === 'function' ? data.ringTimeoutAt.toMillis() : null;
    if (typeof timeoutMillis !== 'number') return;
    if (Date.now() <= timeoutMillis) return;

    tx.set(
      callRef,
      {
        status: 'missed',
        endedBy: null,
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
};

const getUserOnlineState = async (userId: string): Promise<'online' | 'offline'> => {
  try {
    const userRef = doc(firestore, 'users', userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return 'offline';
    const data = snap.data() as any;
    const presence = data?.presence ?? {};
    const rawState = (presence.state ?? data.status ?? 'offline') as string;
    const ts = presence.lastActiveAt ?? presence.lastSeen ?? data.lastSeen ?? null;
    const lastMillis =
      ts && typeof ts?.toMillis === 'function'
        ? ts.toMillis()
        : ts && typeof ts?.toDate === 'function'
          ? ts.toDate().getTime()
          : typeof ts === 'number'
            ? ts
            : null;

    const fresh = typeof lastMillis === 'number' ? Date.now() - lastMillis <= PRESENCE_FRESHNESS_MS : false;
    return rawState === 'online' && fresh ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
};

export type CreateCallResult = {
  callId: string;
  channelName: string;
};

const normalizeCallSnapshot = (
  snapshot: DocumentSnapshot<DocumentData>,
): CallSession | null => {
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Record<string, any>;
  return {
    ...(data as CallSession),
    id: snapshot.id,
  };
};

export const getAgoraUid = (userId: string): number => {
  let hash = 7;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) % 2147483647;
  }
  const normalized = Math.abs(hash);
  // ensure we never return 0 because Agora reserves it for the SDK
  return (normalized % 2147480000) + 1;
};

export const listenToCall = (
  callId: string,
  callback: (call: CallSession | null) => void,
): Unsubscribe => {
  const callRef = doc(firestore, 'calls', callId);
  return onSnapshot(callRef, (snap) => {
    const call = normalizeCallSnapshot(snap);
    callback(call);
    if (call?.id) {
      const timeoutMillis =
        (call as any)?.ringTimeoutAt && typeof (call as any).ringTimeoutAt?.toMillis === 'function'
          ? (call as any).ringTimeoutAt.toMillis()
          : null;
      if (typeof timeoutMillis === 'number' && Date.now() > timeoutMillis && call.status !== 'active') {
        void reconcileExpiredCallIfNeeded(call.id).catch(() => {});
      }
    }
  });
};

export const listenToActiveCallsForUser = (
  userId: string,
  callback: (calls: CallSession[]) => void,
): Unsubscribe => {
  const q = query(
    callsCollection,
    where('members', 'array-contains', userId),
    where('status', 'in', ACTIVE_STATUSES),
  );

  return onSnapshot(q, (snapshot) => {
    const calls = snapshot.docs
      .map((docSnap) => normalizeCallSnapshot(docSnap as any))
      .filter((call): call is CallSession => Boolean(call));

    // Keep the query clean by reconciling expired rings quickly.
    for (const c of calls) {
      const timeoutMillis =
        (c as any)?.ringTimeoutAt && typeof (c as any).ringTimeoutAt?.toMillis === 'function'
          ? (c as any).ringTimeoutAt.toMillis()
          : null;
      if (typeof timeoutMillis === 'number' && Date.now() > timeoutMillis && c.status !== 'active') {
        void reconcileExpiredCallIfNeeded(c.id).catch(() => {});
      }
    }

    calls.sort((a, b) => {
      const aTime = a.updatedAt?.seconds ?? a.createdAt?.seconds ?? 0;
      const bTime = b.updatedAt?.seconds ?? b.createdAt?.seconds ?? 0;
      return bTime - aTime;
    });
    callback(calls);
  });
};

export const createCallSession = async (
  options: CreateCallOptions,
): Promise<CreateCallResult> => {
  const channelName = `${options.conversationId}-${Date.now()}`;
  const members = Array.from(new Set(options.members));

  // Pro guard: prevent 1:1 calls when either side is already on another active call.
  if (!options.isGroup) {
    const other = members.filter((id) => id !== options.initiatorId);
    if (other.length === 1) {
      const [calleeId] = other;
      const [meBusy, themBusy] = await Promise.all([isUserBusy(options.initiatorId), isUserBusy(calleeId)]);
      if (meBusy) throw new Error('You are already in a call');
      if (themBusy) throw new Error('User is busy');
    }
  }

  const otherMembers = members.filter((id) => id !== options.initiatorId);
  const presenceStates = await Promise.all(otherMembers.map((id) => getUserOnlineState(id)));
  const anyOnline = presenceStates.some((s) => s === 'online');
  const initialStatus: CallStatus = anyOnline ? 'ringing' : 'initiated';
  const ringTimeoutAt =
    !anyOnline && !options.isGroup
      ? Timestamp.fromMillis(Date.now() + OFFLINE_RING_TIMEOUT_MS)
      : undefined;

  const participants: Record<string, any> = {
    [options.initiatorId]: {
      id: options.initiatorId,
      displayName: options.initiatorName ?? null,
      state: 'joined',
      mutedAudio: false,
      mutedVideo: options.type === 'voice',
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    },
  };

  for (const memberId of members) {
    if (!memberId || memberId === options.initiatorId) continue;
    participants[memberId] = {
      id: memberId,
      displayName: null,
      state: 'invited',
      mutedAudio: true,
      mutedVideo: true,
    };
  }

  const docRef = await addDoc(callsCollection, {
    conversationId: options.conversationId,
    conversationName: options.conversationName ?? null,
    members,
    isGroup: !!options.isGroup,
    channelName,
    type: options.type,
    initiatorId: options.initiatorId,
    initiatorName: options.initiatorName ?? null,
    status: initialStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(ringTimeoutAt ? { ringTimeoutAt } : {}),
    signaling: {}, // WebRTC signaling data
    participants,
  });

  // Mark initiator as busy immediately (best-effort).
  void setUserActiveCall(options.initiatorId, docRef.id).catch(() => {});

  // Add a call event message into the chat timeline (idempotent).
  void upsertCallEventMessage({
    conversationId: options.conversationId,
    callId: docRef.id,
    from: options.initiatorId,
    callType: options.type,
    callStatus: 'started',
    durationSeconds: null,
  }).catch(() => {});

  // Fire-and-forget push (handled server-side with auth + Firestore validation).
  void notifyPush({ kind: 'call', callId: docRef.id });

  return {
    callId: docRef.id,
    channelName,
  };
};

export const joinCallAsParticipant = async (
  callId: string,
  userId: string,
  displayName?: string | null,
): Promise<{ channelName: string }> => {
  const callRef = callRefForId(callId);

  const result = await runTransaction(firestore, async (tx) => {
    const snapshot = await tx.get(callRef);
    if (!snapshot.exists()) {
      throw new Error('Call session not found');
    }

    const data = snapshot.data() as CallSession;
    const status = data.status;

    if (status === 'ended' || status === 'declined' || status === 'missed') {
      throw new Error('Call has ended');
    }

    const timeoutMillis =
      (data as any)?.ringTimeoutAt && typeof (data as any).ringTimeoutAt?.toMillis === 'function'
        ? (data as any).ringTimeoutAt.toMillis()
        : null;
    if (typeof timeoutMillis === 'number' && Date.now() > timeoutMillis && status !== 'active') {
      throw new Error('Call has ended');
    }

    if (data.isGroup && data.acceptedBy && userId !== data.initiatorId && userId !== data.acceptedBy) {
      throw new Error('Call already answered');
    }

    const shouldActivate = userId !== data.initiatorId;
    const updates: Record<string, any> = {
      updatedAt: serverTimestamp(),
      [`participants.${userId}`]: {
        id: userId,
        displayName: displayName ?? null,
        state: 'joined',
        mutedAudio: false,
        mutedVideo: data.type === 'voice',
        joinedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      },
    };

    if (shouldActivate) {
      updates.status = 'active';
      updates.ringTimeoutAt = deleteField();
      if (!data.activeAt) updates.activeAt = serverTimestamp();
      if (data.isGroup && !data.acceptedBy) updates.acceptedBy = userId;
    }

    tx.set(callRef, updates, { merge: true });
    return { channelName: data.channelName };
  });

  // Mark participant as busy (best-effort).
  void setUserActiveCall(userId, callId).catch(() => {});

  // Ensure the chat timeline is seeded for clients that miss the initiator's write.
  try {
    const callSnap = await getDoc(callRef);
    if (callSnap.exists()) {
      const data = callSnap.data() as any;
      const conversationId = String(data?.conversationId ?? '');
      const callType = (data?.type ?? 'voice') as 'voice' | 'video';
      if (conversationId) {
        void upsertCallEventMessage({
          conversationId,
          callId,
          from: data?.initiatorId ?? null,
          callType,
          callStatus: 'started',
          durationSeconds: null,
        }).catch(() => {});
      }
    }
  } catch {
    // ignore
  }

  return result;
};

export const heartbeatCallParticipant = async (
  callId: string,
  userId: string,
  extras?: { connectionState?: string | null; iceState?: string | null },
): Promise<void> => {
  const callRef = callRefForId(callId);
  const payload: Record<string, any> = {
    updatedAt: serverTimestamp(),
    [`participants.${userId}.lastSeenAt`]: serverTimestamp(),
  };
  if (extras?.connectionState) payload[`participants.${userId}.connectionState`] = extras.connectionState;
  if (extras?.iceState) payload[`participants.${userId}.iceState`] = extras.iceState;
  await updateDoc(callRef, payload);
};

export const setCallStatus = async (
  callId: string,
  status: CallStatus,
): Promise<void> => {
  const callRef = doc(firestore, 'calls', callId);
  await updateDoc(callRef, {
    status,
    updatedAt: serverTimestamp(),
  });
};

export const markCallRinging = async (callId: string): Promise<void> => {
  const callRef = doc(firestore, 'calls', callId);
  await updateDoc(callRef, {
    status: 'ringing',
    ringTimeoutAt: deleteField(),
    updatedAt: serverTimestamp(),
  });
};

export const updateParticipantMuteState = async (
  callId: string,
  userId: string,
  updates: { mutedAudio?: boolean; mutedVideo?: boolean },
): Promise<void> => {
  const callRef = doc(firestore, 'calls', callId);
  const payload: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };
  if (typeof updates.mutedAudio === 'boolean') {
    payload[`participants.${userId}.mutedAudio`] = updates.mutedAudio;
  }
  if (typeof updates.mutedVideo === 'boolean') {
    payload[`participants.${userId}.mutedVideo`] = updates.mutedVideo;
  }
  await updateDoc(callRef, payload);
};

export const markParticipantLeft = async (
  callId: string,
  userId: string,
): Promise<void> => {
  const callRef = doc(firestore, 'calls', callId);

  // Best-effort: clear busy flag.
  void setUserActiveCall(userId, null).catch(() => {});

  // First update the participant state
  await updateDoc(callRef, {
    [`participants.${userId}.state`]: 'left',
    [`participants.${userId}.leftAt`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Check if all participants have left or declined, and end the call if so
  const callSnap = await getDoc(callRef);
  if (callSnap.exists()) {
    const callData = callSnap.data() as CallSession;
    const participants = callData.participants || {};

    const allLeftOrDeclined = Object.values(participants).every(
      (participant) => participant.state === 'left' || participant.state === 'declined'
    );

    if (allLeftOrDeclined && !['ended', 'missed', 'declined'].includes(callData.status)) {
      await updateDoc(callRef, {
        status: 'ended',
        endedAt: serverTimestamp(),
        endedBy: userId,
        updatedAt: serverTimestamp(),
      });
    }
  }
};

export const declineCall = async (
  callId: string,
  userId: string,
  displayName?: string | null,
): Promise<void> => {
  const callRef = doc(firestore, 'calls', callId);

  // Best-effort: clear busy flag.
  void setUserActiveCall(userId, null).catch(() => {});

  // First update the participant state
  await setDoc(
    callRef,
    {
      updatedAt: serverTimestamp(),
      participants: {
        [userId]: {
          id: userId,
          displayName: displayName ?? null,
          state: 'declined',
          leftAt: serverTimestamp(),
        },
      },
    },
    { merge: true },
  );

  // Check if all participants have left or declined, and end the call if so
  const callSnap = await getDoc(callRef);
  if (callSnap.exists()) {
    const callData = callSnap.data() as CallSession;
    const participants = callData.participants || {};

    const allLeftOrDeclined = Object.values(participants).every(
      (participant) => participant.state === 'left' || participant.state === 'declined'
    );

    if (allLeftOrDeclined && !['ended', 'missed', 'declined'].includes(callData.status)) {
      await updateDoc(callRef, {
        status: 'ended',
        endedAt: serverTimestamp(),
        endedBy: userId,
        updatedAt: serverTimestamp(),
      });
    }
  }
};

export const endCall = async (
  callId: string,
  endedBy: string | null,
  reason: CallStatus = 'ended',
): Promise<void> => {
  const callRef = doc(firestore, 'calls', callId);

  await setDoc(
    callRef,
    {
      status: reason,
      endedBy: endedBy ?? null,
      endedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (endedBy) {
    void setUserActiveCall(endedBy, null).catch(() => {});
  }

  // Best-effort: add a call event message to the chat timeline.
  try {
    const snap = await getDoc(callRef);
    if (!snap.exists()) return;
    const data = snap.data() as any;
    const conversationId = String(data?.conversationId ?? '');
    const callType = (data?.type ?? 'voice') as 'voice' | 'video';
    if (!conversationId) return;

    const activeAtMs = data?.activeAt && typeof data.activeAt?.toMillis === 'function' ? data.activeAt.toMillis() : null;
    const durationSeconds = typeof activeAtMs === 'number' ? (Date.now() - activeAtMs) / 1000 : null;

    const callStatus: CallMessageStatus =
      reason === 'missed' ? 'missed' : reason === 'declined' ? 'declined' : 'ended';

    await upsertCallEventMessage({
      conversationId,
      callId,
      from: endedBy,
      callType,
      callStatus,
      durationSeconds,
    });
  } catch {
    // ignore
  }
};

// WebRTC Signaling functions
export const sendOffer = async (
  callId: string,
  userId: string,
  offer: RTCSessionDescription,
): Promise<void> => {
  const callRef = doc(firestore, 'calls', callId);
  await updateDoc(callRef, {
    [`signaling.${userId}.offer`]: offer,
    updatedAt: serverTimestamp(),
  });
};

export const sendAnswer = async (
  callId: string,
  userId: string,
  answer: RTCSessionDescription,
): Promise<void> => {
  const callRef = doc(firestore, 'calls', callId);
  await updateDoc(callRef, {
    [`signaling.${userId}.answer`]: answer,
    updatedAt: serverTimestamp(),
  });
};

export const sendIceCandidate = async (
  callId: string,
  userId: string,
  candidate: RTCIceCandidate,
): Promise<void> => {
  const callRef = doc(firestore, 'calls', callId);
  const candidateData = {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
  };
  await updateDoc(callRef, {
    [`signaling.${userId}.iceCandidates`]: arrayUnion(candidateData),
    updatedAt: serverTimestamp(),
  });
};

// Call history functions
export const listenToCallHistory = (
  userId: string,
  callback: (calls: CallSession[]) => void,
): Unsubscribe => {
  const q = query(
    callsCollection,
    where('members', 'array-contains', userId),
    orderBy('createdAt', 'desc'),
    limit(50), // Limit to recent calls
  );
  return onSnapshot(q, (snapshot) => {
    const calls = snapshot.docs
      .map((docSnap) => normalizeCallSnapshot(docSnap as DocumentSnapshot<DocumentData>))
      .filter((call): call is CallSession => Boolean(call));
    callback(calls);
  });
};
