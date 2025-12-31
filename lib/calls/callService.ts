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
    callback(normalizeCallSnapshot(snap));
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
    },
  };

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
  const callRef = doc(firestore, 'calls', callId);
  const snapshot = await getDoc(callRef);
  if (!snapshot.exists()) {
    throw new Error('Call session not found');
  }

  const data = snapshot.data() as CallSession;

  if (data.status === 'ended' || data.status === 'declined' || data.status === 'missed') {
    throw new Error('Call has ended');
  }

  if (
    data.isGroup &&
    data.acceptedBy &&
    userId !== data.initiatorId &&
    userId !== data.acceptedBy
  ) {
    throw new Error('Call already answered');
  }

  const shouldActivate = userId !== data.initiatorId;

  await setDoc(
    callRef,
    {
      ...(shouldActivate
        ? {
            status: 'active',
            ringTimeoutAt: deleteField(),
            ...(data.isGroup && !data.acceptedBy ? { acceptedBy: userId } : {}),
          }
        : {}),
      updatedAt: serverTimestamp(),
      participants: {
        [userId]: {
          id: userId,
          displayName: displayName ?? null,
          state: 'joined',
          mutedAudio: false,
          mutedVideo: data.type === 'voice',
          joinedAt: serverTimestamp(),
        },
      },
    },
    { merge: true },
  );

  return { channelName: data.channelName };
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
