import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { RTCView } from 'react-native-webrtc';
import type { User } from 'firebase/auth';
import { onAuthChange } from '../../messaging/controller';
import { useAccent } from '../../components/AccentContext';
import {
  joinLiveStream,
  leaveLiveStream,
  listenToLiveStream,
} from '@/lib/live/liveService';
import type { LiveStream } from '@/lib/live/types';
import {
  initializeViewer,
  createViewerAnswer,
  getViewerStream,
  closeViewer,
} from '@/lib/live/webrtcLiveClient';
import { sendAnswer, sendIceCandidate } from '@/lib/calls/callService';

const LiveRoomScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { accentColor } = useAccent();
  const [user, setUser] = useState<User | null>(null);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [viewerStream, setViewerStream] = useState<any>(null);
  const joinedRef = useRef(false);
  const incrementedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => setUser(authUser));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = listenToLiveStream(String(id), (live) => {
      setStream(live);
    });
    return () => unsubscribe();
  }, [id]);

  const cleanup = useCallback(async () => {
    closeViewer(user?.uid || 'unknown');
    setJoined(false);
    setViewerStream(null);
    joinedRef.current = false;
    if (id && incrementedRef.current) {
      try {
        await leaveLiveStream(String(id));
      } catch (err) {
        console.warn('Failed to decrement viewer count', err);
      } finally {
        incrementedRef.current = false;
      }
    }
  }, [id, user?.uid]);

  useEffect(() => {
    if (!stream || stream.status !== 'live') return;
    if (!user?.uid || !id || joinedRef.current) return;
    joinedRef.current = true;

    const joinAsync = async () => {
      setIsJoining(true);
      try {
        // Join the live stream session (increments viewer count)
        await joinLiveStream(String(id), user.uid);
        incrementedRef.current = true;

        // Initialize WebRTC viewer
        await initializeViewer(user.uid);

        // Listen for broadcaster offers and create answers
        // This will be handled by the stream listener below
        setJoined(true);
      } catch (err) {
        console.error('Failed to join live stream', err);
        setIsJoining(false);
        joinedRef.current = false;
      } finally {
        setIsJoining(false);
      }
    };

    joinAsync();
  }, [id, stream, user?.uid]);

  // Listen for stream updates (offers from broadcaster)
  useEffect(() => {
    if (!stream?.signaling || !user?.uid) return;

    const handleSignaling = async () => {
      const userSignaling = stream.signaling[user.uid];
      if (userSignaling?.offer) {
        try {
          // Create answer for broadcaster's offer
          const answer = await createViewerAnswer(user.uid, userSignaling.offer);
          await sendAnswer(stream.id, user.uid, answer);

          // Get the viewer stream
          const viewerMediaStream = getViewerStream(user.uid);
          if (viewerMediaStream) {
            setViewerStream(viewerMediaStream);
          }
        } catch (err) {
          console.warn('Failed to handle broadcaster offer', err);
        }
      }
    };

    handleSignaling();
  }, [stream?.signaling, user?.uid]);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  const handleClose = useCallback(async () => {
    await cleanup();
    router.back();
  }, [cleanup, router]);

  const ended = stream && stream.status === 'ended';

  return (
    <LinearGradient colors={[accentColor, '#020203']} style={StyleSheet.absoluteFill}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.roomTitle}>{stream?.title ?? 'Live room'}</Text>
            <Text style={styles.roomSubtitle}>
              {stream?.hostName ?? 'Someone live'} ·{' '}
              {Math.max(stream?.viewersCount ?? 0, 0)} watching
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.body}>
          {ended && (
            <View style={styles.centerMessage}>
              <Ionicons name="stop-circle-outline" size={56} color="#fff" />
              <Text style={styles.endTitle}>Live has ended</Text>
              <Text style={styles.endSubtitle}>Thanks for stopping by.</Text>
            </View>
          )}

          {!ended && (
            <>
              {viewerStream ? (
                <RTCView
                  streamURL={viewerStream.toURL()}
                  style={styles.remoteVideo}
                  objectFit="cover"
                />
              ) : (
                <View style={styles.centerMessage}>
                  {isJoining ? (
                    <>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.endSubtitle}>Joining room…</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="radio-outline" size={56} color="#fff" />
                      <Text style={styles.endSubtitle}>Waiting for host…</Text>
                    </>
                  )}
                </View>
              )}

              {/* Full-screen live overlay */}
              {viewerStream && (
                <View style={styles.liveOverlay}>
                  {/* Viewer count badge */}
                  <View style={styles.viewerBadge}>
                    <Ionicons name="eye" size={14} color="#fff" />
                    <Text style={styles.viewerCount}>
                      {Math.max(stream?.viewersCount ?? 0, 0)}
                    </Text>
                  </View>

                  {/* Right side controls */}
                  <View style={styles.rightControls}>
                    {/* Host info */}
                    <View style={styles.hostInfo}>
                      <View style={[styles.hostAvatar, { backgroundColor: accentColor }]}>
                        <Text style={styles.hostInitial}>
                          {(stream?.hostName ?? 'H')[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.hostName}>{stream?.hostName ?? 'Host'}</Text>
                    </View>

                    {/* Like button */}
                    <TouchableOpacity style={styles.controlButton}>
                      <Ionicons name="heart" size={28} color="#fff" />
                      <Text style={styles.controlLabel}>0</Text>
                    </TouchableOpacity>

                    {/* Comment button */}
                    <TouchableOpacity style={styles.controlButton}>
                      <Ionicons name="chatbubble" size={28} color="#fff" />
                      <Text style={styles.controlLabel}>0</Text>
                    </TouchableOpacity>

                    {/* Share button */}
                    <TouchableOpacity style={styles.controlButton}>
                      <Ionicons name="share-social" size={28} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  {/* Comments overlay */}
                  <View style={styles.commentsContainer}>
                    <View style={styles.comment}>
                      <Text style={styles.commentText}>
                        Welcome to the live stream! 🎉
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backLabel: {
    color: '#fff',
    marginLeft: 4,
    fontWeight: '600',
  },
  roomTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  roomSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  body: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
  },
  centerMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  endTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  endSubtitle: {
    color: 'rgba(255,255,255,0.7)',
  },
  liveOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginTop: 20,
    marginLeft: 16,
    gap: 6,
  },
  viewerCount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  rightControls: {
    position: 'absolute',
    right: 16,
    bottom: 100,
    alignItems: 'center',
    gap: 16,
  },
  hostInfo: {
    alignItems: 'center',
    marginBottom: 8,
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ff4b4b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  hostInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hostName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  controlButton: {
    alignItems: 'center',
    gap: 4,
  },
  controlLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  commentsContainer: {
    position: 'absolute',
    left: 16,
    bottom: 100,
    right: 80,
    maxHeight: 200,
  },
  comment: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  commentText: {
    color: '#fff',
    fontSize: 14,
  },
});

export default LiveRoomScreen;
