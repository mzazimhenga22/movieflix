import type { Timestamp } from 'firebase/firestore';

export type LiveStreamStatus = 'draft' | 'live' | 'ended';

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
    /** HLS playback URL for TV viewers */
    playbackHlsUrl?: string | null;
    createdAt?: Timestamp;
    endedAt?: Timestamp;
    updatedAt?: Timestamp;
};
