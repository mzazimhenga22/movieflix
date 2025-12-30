import { deleteDoc, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '@/constants/firebase';

export type WatchPartyPlayback = {
  isPlaying: boolean;
  positionMillis: number;
  updatedAt?: any;
  updatedBy?: string | null;
};

export type WatchParty = {
  code: string;
  hostId: string;
  videoUrl: string;
  videoHeaders?: Record<string, string> | null;
  streamType?: string | null;
  playback?: WatchPartyPlayback | null;
  title?: string | null;
  mediaType?: string | null;
  createdAt?: any;
  expiresAt: number; // epoch millis
  maxParticipants: number;
  participantsCount: number;
  isOpen: boolean;
};

const WATCHPARTY_TTL_MINUTES = 60; // 1 hour
const FREE_MAX_PARTICIPANTS = 4;

const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const createWatchParty = async (
  hostId: string,
  videoUrl: string,
  title?: string | null,
  mediaType?: string | null,
  videoHeaders?: Record<string, string> | null,
  streamType?: string | null,
) => {
  const code = generateCode();
  const now = Date.now();
  const expiresAt = now + WATCHPARTY_TTL_MINUTES * 60 * 1000;

  const ref = doc(firestore, 'watchParties', code);

  const payload: WatchParty = {
    code,
    hostId,
    videoUrl,
    videoHeaders: videoHeaders ?? null,
    streamType: streamType ?? null,
    playback: {
      isPlaying: false,
      positionMillis: 0,
      updatedBy: hostId,
    },
    title: title ?? null,
    mediaType: mediaType ?? null,
    expiresAt,
    maxParticipants: FREE_MAX_PARTICIPANTS,
    participantsCount: 0,
    isOpen: false,
  };

  await setDoc(ref, {
    ...payload,
    createdAt: serverTimestamp(),
    playback: {
      isPlaying: false,
      positionMillis: 0,
      updatedBy: hostId,
      updatedAt: serverTimestamp(),
    },
  });

  return payload;
};

export const getWatchParty = async (code: string): Promise<WatchParty | null> => {
  const ref = doc(firestore, 'watchParties', code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as any;
  const party: WatchParty = {
    code,
    hostId: data.hostId,
    videoUrl: data.videoUrl,
    videoHeaders: (data.videoHeaders as Record<string, string> | null) ?? null,
    streamType: (data.streamType as string | null) ?? null,
    playback: (data.playback as WatchPartyPlayback | null) ?? null,
    title: data.title ?? null,
    mediaType: data.mediaType ?? null,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    maxParticipants: data.maxParticipants ?? FREE_MAX_PARTICIPANTS,
    participantsCount: data.participantsCount ?? 0,
    isOpen: data.isOpen ?? false,
  };

  const now = Date.now();
  if (!party.expiresAt || party.expiresAt < now) {
    // soft-clean expired party
    try {
      await deleteDoc(ref);
    } catch {
      // ignore
    }
    return null;
  }

  return party;
};

export type JoinStatus = 'ok' | 'not_found' | 'expired' | 'closed' | 'full';

export type JoinResult = {
  party: WatchParty | null;
  status: JoinStatus;
};

export const tryJoinWatchParty = async (code: string): Promise<JoinResult> => {
  const ref = doc(firestore, 'watchParties', code);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { party: null, status: 'not_found' };
  }

  const data = snap.data() as any;
  const currentCount = data.participantsCount ?? 0;
  const max = data.maxParticipants ?? FREE_MAX_PARTICIPANTS;

  const now = Date.now();
  const expiresAt = data.expiresAt as number | undefined;
  if (!expiresAt || expiresAt < now) {
    try {
      await deleteDoc(ref);
    } catch {
      // ignore
    }
    return { party: null, status: 'expired' };
  }

  const isOpen = data.isOpen ?? false;

  if (!isOpen || currentCount >= max) {
    const party: WatchParty = {
      code,
      hostId: data.hostId,
      videoUrl: data.videoUrl,
      videoHeaders: (data.videoHeaders as Record<string, string> | null) ?? null,
      streamType: (data.streamType as string | null) ?? null,
      playback: (data.playback as WatchPartyPlayback | null) ?? null,
      title: data.title ?? null,
      mediaType: data.mediaType ?? null,
      createdAt: data.createdAt,
      expiresAt,
      maxParticipants: max,
      participantsCount: currentCount,
      isOpen,
    };

    return {
      party,
      status: !isOpen ? 'closed' : 'full',
    };
  }

  await updateDoc(ref, {
    participantsCount: increment(1),
  });

  const updatedSnap = await getDoc(ref);
  const updated = updatedSnap.data() as any;

  const party: WatchParty = {
    code,
    hostId: updated.hostId,
    videoUrl: updated.videoUrl,
    videoHeaders: (updated.videoHeaders as Record<string, string> | null) ?? null,
    streamType: (updated.streamType as string | null) ?? null,
    playback: (updated.playback as WatchPartyPlayback | null) ?? null,
    title: updated.title ?? null,
    mediaType: updated.mediaType ?? null,
    createdAt: updated.createdAt,
    expiresAt: updated.expiresAt,
    maxParticipants: updated.maxParticipants ?? max,
    participantsCount: updated.participantsCount ?? currentCount + 1,
    isOpen: updated.isOpen ?? true,
  };

  return { party, status: 'ok' };
};

export const setWatchPartyOpen = async (code: string, open: boolean) => {
  const ref = doc(firestore, 'watchParties', code);
  await updateDoc(ref, { isOpen: open });
};
