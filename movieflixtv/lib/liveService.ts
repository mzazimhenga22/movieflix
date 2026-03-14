import {
    collection,
    doc,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
    type DocumentData,
    type DocumentSnapshot,
    type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '../constants/firebase';
import type { LiveStream, LiveStreamComment } from './liveTypes';

const liveStreamsCollection = collection(firestore, 'liveStreams');
const commentsCollection = (streamId: string) => collection(firestore, 'liveStreams', streamId, 'comments');

const normalizeStream = (
    snapshot: DocumentSnapshot<DocumentData>,
): LiveStream | null => {
    if (!snapshot.exists()) return null;
    const data = snapshot.data() as LiveStream;
    return { ...data, id: snapshot.id };
};

/**
 * Listen to all active live streams
 */
export const listenToLiveStreams = (
    callback: (streams: LiveStream[]) => void,
): Unsubscribe => {
    const q = query(
        liveStreamsCollection,
        where('status', '==', 'live'),
        orderBy('createdAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
        const streams = snap.docs
            .map((docSnap) => normalizeStream(docSnap as DocumentSnapshot<DocumentData>))
            .filter((stream): stream is LiveStream => Boolean(stream));
        callback(streams);
    });
};

/**
 * Listen to a single live stream
 */
export const listenToLiveStream = (
    streamId: string,
    callback: (stream: LiveStream | null) => void,
): Unsubscribe => {
    const streamRef = doc(firestore, 'liveStreams', streamId);
    return onSnapshot(streamRef, (snap) => callback(normalizeStream(snap)));
};

/**
 * Listen to comments on a live stream (read-only for TV)
 */
export const listenToLiveComments = (
    streamId: string,
    callback: (comments: LiveStreamComment[]) => void,
    options: { limitCount?: number } = {},
): Unsubscribe => {
    const limitCount = Math.max(1, Math.min(options.limitCount ?? 30, 100));
    const q = query(commentsCollection(streamId), orderBy('createdAt', 'desc'), limit(limitCount));
    return onSnapshot(q, (snap) => {
        const out: LiveStreamComment[] = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) } as LiveStreamComment))
            .reverse();
        callback(out);
    });
};
