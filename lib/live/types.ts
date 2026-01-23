import type { Timestamp } from 'firebase/firestore';
import type { RTCSessionDescription } from 'react-native-webrtc';

export type LiveStreamStatus = 'draft' | 'live' | 'ended';

export type LiveStreamSignaling = {
  offer?: RTCSessionDescription;
  answer?: RTCSessionDescription;
  hostIceCandidates?: Array<{ candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }>;
  viewerIceCandidates?: Array<{ candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }>;
  updatedAt?: Timestamp;
};

export type LiveStreamViewer = {
  id: string;
  joinedAt?: Timestamp;
  lastSeenAt?: Timestamp;
  username?: string | null;
  userAvatar?: string | null;
};

export type LiveStreamComment = {
  id: string;
  userId: string;
  username?: string | null;
  userAvatar?: string | null;
  text: string;
  createdAt?: Timestamp;
};

export type LiveStreamGift = {
  id: string;
  senderId: string;
  senderName?: string | null;
  senderAvatar?: string | null;
  giftId: string;
  label?: string | null;
  emoji?: string | null;
  coins?: number | null;
  createdAt?: Timestamp;
};

export type LiveStream = {
  id: string;
  title: string;
  channelName: string;
  hostId: string;
  hostName?: string | null;
  coverUrl?: string | null;
  status: LiveStreamStatus;
  viewersCount: number;
  /** HLS playback URL (Cloudflare Stream Live, etc). If set, viewers should use HTTP playback instead of WebRTC P2P. */
  playbackHlsUrl?: string | null;
  /** Provider-specific metadata (stored for debugging / ending stream). */
  cloudflare?: {
    liveInputId?: string | null;
    rtmpsUrl?: string | null;
    streamKey?: string | null;
  } | null;
  createdAt?: Timestamp;
  endedAt?: Timestamp;
  updatedAt?: Timestamp;
  hostHeartbeatAt?: Timestamp;
  /** Updated whenever viewers interact (taps, comments). Used for idle auto-end. */
  lastEngagementAt?: Timestamp;
  /** Lightweight engagement score used for promotion. */
  engagementCount?: number;
  giftsCount?: number;
  coinsCount?: number;
  /** If set, this live is boosted into Reels while it's live. */
  promotedToReels?: boolean;
  /** If set, this live is boosted into Stories while it's live. */
  promotedToStories?: boolean;
  promotedAt?: Timestamp;
  endedBy?: string | null;
};

export type CreateLiveStreamOptions = {
  hostId: string;
  hostName?: string | null;
  title: string;
  coverUrl?: string | null;
};

export type LiveStreamSession = {
  streamId: string;
  channelName: string;
  playbackHlsUrl?: string | null;
  rtmpsUrl?: string | null;
  streamKey?: string | null;
  liveInputId?: string | null;
};
