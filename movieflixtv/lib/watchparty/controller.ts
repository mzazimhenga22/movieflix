import { collection, deleteDoc, doc, getDoc, increment, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '@/constants/firebase';

export type WatchPartyPlayback = {
  isPlaying: boolean;
  positionMillis: number;
  updatedAt?: any;
  updatedBy?: string | null;
};

export type WatchPartyEpisode = {
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  seasonTmdbId?: string | null;
  episodeTmdbId?: string | null;
  seasonTitle?: string | null;
  episodeTitle?: string | null;
  updatedAt?: any;
};

export type WatchParty = {
  code: string;
  hostId: string;
  videoUrl: string;
  videoHeaders?: Record<string, string> | null;
  streamType?: string | null;
  playback?: WatchPartyPlayback | null;
  episode?: WatchPartyEpisode | null;
  title?: string | null;
  mediaType?: string | null;
  createdAt?: any;
  expiresAt: number; // epoch millis
  maxParticipants: number;
  participantsCount: number;
  isOpen: boolean;
};

export type WatchPartyParticipant = {
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  joinedAt?: any;
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

  return { party, status: 'ok' };
};

export type TrackParticipantStatus = 'ok' | 'not_found' | 'expired' | 'closed' | 'full';
export type TrackParticipantResult = { party: WatchParty | null; status: TrackParticipantStatus };

export async function joinWatchPartyAsParticipant(args: {
  code: string;
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<TrackParticipantResult> {
  const code = args.code.trim();
  const userId = args.userId.trim();
  if (!code || !userId) return { party: null, status: 'not_found' };

  const partyRef = doc(firestore, 'watchParties', code);
  const participantRef = doc(collection(firestore, 'watchParties', code, 'participants'), userId);

  return runTransaction(firestore, async (tx) => {
    const snap = await tx.get(partyRef);
    if (!snap.exists()) return { party: null, status: 'not_found' as const };

    const data = snap.data() as any;
    const now = Date.now();
    const expiresAt = data.expiresAt as number | undefined;
    if (!expiresAt || expiresAt < now) {
      tx.delete(partyRef);
      return { party: null, status: 'expired' as const };
    }

    const hostId = String(data.hostId ?? '').trim();
    const isOpen = Boolean(data.isOpen);
    const max = (data.maxParticipants ?? FREE_MAX_PARTICIPANTS) as number;
    const currentCount = (data.participantsCount ?? 0) as number;

    // Allow host to join even before "open" (they'll open the room when playback starts).
    const isHost = Boolean(hostId && hostId === userId);
    if (!isOpen && !isHost) {
      return {
        party: {
          code,
          hostId,
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
        },
        status: 'closed' as const,
      };
    }

    const existingParticipant = await tx.get(participantRef);
    if (!existingParticipant.exists()) {
      if (currentCount >= max) {
        return {
          party: {
            code,
            hostId,
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
          },
          status: 'full' as const,
        };
      }

      tx.set(
        participantRef,
        {
          userId,
          displayName: args.displayName ?? null,
          avatarUrl: args.avatarUrl ?? null,
          joinedAt: serverTimestamp(),
        },
        { merge: true },
      );
      tx.update(partyRef, { participantsCount: increment(1) });
    }

    const updatedCount = existingParticipant.exists() ? currentCount : currentCount + 1;
    const party: WatchParty = {
      code,
      hostId,
      videoUrl: data.videoUrl,
      videoHeaders: (data.videoHeaders as Record<string, string> | null) ?? null,
      streamType: (data.streamType as string | null) ?? null,
      playback: (data.playback as WatchPartyPlayback | null) ?? null,
      title: data.title ?? null,
      mediaType: data.mediaType ?? null,
      createdAt: data.createdAt,
      expiresAt,
      maxParticipants: max,
      participantsCount: updatedCount,
      isOpen,
    };

    return { party, status: 'ok' as const };
  });
}

export async function leaveWatchPartyAsParticipant(args: { code: string; userId: string }) {
  const code = args.code.trim();
  const userId = args.userId.trim();
  if (!code || !userId) return;

  const partyRef = doc(firestore, 'watchParties', code);
  const participantRef = doc(collection(firestore, 'watchParties', code, 'participants'), userId);

  await runTransaction(firestore, async (tx) => {
    const partySnap = await tx.get(partyRef);
    if (!partySnap.exists()) return;

    const participantSnap = await tx.get(participantRef);
    if (!participantSnap.exists()) return;

    tx.delete(participantRef);
    tx.update(partyRef, { participantsCount: increment(-1) });
  });
}

export const setWatchPartyOpen = async (code: string, open: boolean) => {
  const ref = doc(firestore, 'watchParties', code);
  await updateDoc(ref, { isOpen: open });
};

export const updateWatchPartyEpisode = async (
  code: string,
  episode: Omit<WatchPartyEpisode, 'updatedAt'>,
) => {
  const ref = doc(firestore, 'watchParties', code);
  await updateDoc(ref, {
    episode: {
      ...episode,
      updatedAt: serverTimestamp(),
    },
    playback: {
      isPlaying: false,
      positionMillis: 0,
      updatedAt: serverTimestamp(),
    },
  });
};

export const updateWatchPartyPlayback = async (
  code: string,
  playback: { isPlaying: boolean; positionMillis: number },
  userId: string,
) => {
  const ref = doc(firestore, 'watchParties', code);
  await updateDoc(ref, {
    playback: {
      isPlaying: playback.isPlaying,
      positionMillis: Math.max(0, Math.floor(playback.positionMillis)),
      updatedBy: userId,
      updatedAt: serverTimestamp(),
    },
  });
};