import type { Timestamp } from 'firebase/firestore';

export type CallType = 'voice' | 'video';

export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'active'
  | 'ended'
  | 'declined'
  | 'missed';

export type CallParticipantState = 'invited' | 'joined' | 'left' | 'declined';

export type CallParticipant = {
  id: string;
  displayName?: string | null;
  state: CallParticipantState;
  mutedAudio?: boolean;
  mutedVideo?: boolean;
  joinedAt?: Timestamp;
  /** Client heartbeat to help detect reconnecting participants. */
  lastSeenAt?: Timestamp;
  leftAt?: Timestamp;
};

export type IceCandidateData = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

export type SignalingData = {
  offer?: RTCSessionDescription;
  answer?: RTCSessionDescription;
  iceCandidates?: IceCandidateData[];
};

export type CallSignaling = Record<string, SignalingData>;

export type CallSession = {
  id: string;
  conversationId: string;
  conversationName?: string | null;
  members: string[];
  isGroup: boolean;
  channelName: string;
  type: CallType;
  initiatorId: string;
  initiatorName?: string | null;
  /** For group calls, the first non-initiator to join can "claim" the call (first-to-answer). */
  acceptedBy?: string | null;
  status: CallStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  /** When the call became active (first answered). */
  activeAt?: Timestamp;
  /** Optional: if set, the call should be considered expired after this time unless already active. */
  ringTimeoutAt?: Timestamp;
  endedAt?: Timestamp;
  endedBy?: string | null;
  participants?: Record<string, CallParticipant>;
  signaling?: CallSignaling;
};

export type CreateCallOptions = {
  conversationId: string;
  members: string[];
  type: CallType;
  initiatorId: string;
  isGroup?: boolean;
  conversationName?: string | null;
  initiatorName?: string | null;
};
