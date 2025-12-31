 import {
  endCall,
  joinCallAsParticipant,
  listenToCall,
  markParticipantLeft,
  markCallRinging,
  sendAnswer,
  sendIceCandidate,
  sendOffer,
  updateParticipantMuteState,
} from '@/lib/calls/callService';
import type { CallSession, CallStatus } from '@/lib/calls/types';
import {
  addIceCandidate,
  closeConnection,
  createAnswer,
  createOffer,
  initializeWebRTC,
  setIceCandidateCallback,
  setRemoteDescription,
  setRemoteStreamCallback,
  toggleAudio as webrtcToggleAudio,
  toggleVideo as webrtcToggleVideo
} from '@/lib/calls/webrtcClient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { User } from 'firebase/auth';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RTCIceCandidate, RTCSessionDescription, RTCView } from 'react-native-webrtc';
import { getLastSeen, onAuthChange, onUserPresence } from '../messaging/controller';
import CallControls from './components/CallControls';

const CallScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [call, setCall] = useState<CallSession | null>(null);
  const [isJoining, setJoining] = useState(false);
  const [mutedAudio, setMutedAudio] = useState(false);
  const [mutedVideo, setMutedVideo] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isHangingUp, setIsHangingUp] = useState(false);
  const [isDialing, setIsDialing] = useState(true);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [webrtcReady, setWebrtcReady] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [otherPresence, setOtherPresence] = useState<{ state: 'online' | 'offline'; last_changed: number | null } | null>(null);
  const [otherLastSeen, setOtherLastSeen] = useState<Date | null>(null);

  const peerConnectionRef = useRef<any>(null);
  const hasJoinedRef = useRef(false);
  const offlineTimeoutAtRef = useRef<number | null>(null);
  const processedOffersRef = useRef<Set<string>>(new Set());
  const processedAnswersRef = useRef<Set<string>>(new Set());
  const processedIceRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => {
      setUser(authUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = listenToCall(String(id), async (session) => {
      setCall(session);
    });
    return () => unsubscribe();
  }, [id, user?.uid]);

  const otherUserId = (() => {
    if (!call?.members?.length || !user?.uid) return null;
    if (call.isGroup) return null;
    const others = call.members.filter((m) => m !== user.uid);
    return others.length === 1 ? others[0] : null;
  })();

  useEffect(() => {
    if (!otherUserId) {
      setOtherPresence(null);
      setOtherLastSeen(null);
      return;
    }

    const unsub = onUserPresence(otherUserId, (status) => {
      setOtherPresence(status);
      if (status.state === 'online') {
        setOtherLastSeen(null);
        offlineTimeoutAtRef.current = null;
      } else if (status.last_changed) {
        setOtherLastSeen(new Date(status.last_changed));
      } else {
        void getLastSeen(otherUserId).then(setOtherLastSeen).catch(() => setOtherLastSeen(null));
      }
    });

    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [otherUserId]);

  useEffect(() => {
    // If the callee is online and we haven't started ringing yet, flip the call state to ringing.
    if (!call?.id || !user?.uid) return;
    if (call.isGroup) return;
    if (call.initiatorId !== user.uid) return;
    if (call.status !== 'initiated') return;
    if (otherPresence?.state !== 'online') return;

    void markCallRinging(call.id).catch(() => {});
  }, [call?.id, call?.initiatorId, call?.isGroup, call?.status, otherPresence?.state, user?.uid]);

  useEffect(() => {
    // Handle signaling updates.
    // Signaling is stored under the sender's userId (signaling.<senderId>.*),
    // so each client must read from other participants' buckets.
    if (!call?.signaling || !webrtcReady || !peerConnectionRef.current || !user?.uid) return;

    const myUid = user.uid;
    const isInitiator = call.initiatorId === myUid;
    const signalingEntries = Object.entries(call.signaling as Record<string, any>);

    (async () => {
      for (const [senderId, senderSignaling] of signalingEntries) {
        if (!senderId || senderId === myUid || !senderSignaling) continue;

        // Non-initiators only accept the initiator's offer.
        if (!isInitiator && senderId === call.initiatorId && senderSignaling.offer) {
          const offerKey = `${call.id}:${senderId}:offer`;
          if (!processedOffersRef.current.has(offerKey)) {
            processedOffersRef.current.add(offerKey);
            try {
              const offer = new RTCSessionDescription(senderSignaling.offer);
              await setRemoteDescription(offer);
              const answer = await createAnswer();
              await sendAnswer(call.id, myUid, answer);
            } catch (err) {
              console.warn('Failed to handle offer', err);
            }
          }
        }

        // Initiator accepts answers from any other participant.
        if (isInitiator && senderSignaling.answer) {
          const answerKey = `${call.id}:${senderId}:answer`;
          if (!processedAnswersRef.current.has(answerKey)) {
            processedAnswersRef.current.add(answerKey);
            try {
              const answer = new RTCSessionDescription(senderSignaling.answer);
              await setRemoteDescription(answer);
            } catch (err) {
              console.warn('Failed to handle answer', err);
            }
          }
        }

        // ICE candidates from other participants (dedupe because snapshots replay the full array).
        const candidates = Array.isArray(senderSignaling.iceCandidates)
          ? senderSignaling.iceCandidates
          : [];
        for (const candidate of candidates) {
          const key = `${call.id}:${senderId}:${candidate?.candidate ?? ''}:${candidate?.sdpMid ?? ''}:${candidate?.sdpMLineIndex ?? ''}`;
          if (processedIceRef.current.has(key)) continue;
          processedIceRef.current.add(key);
          try {
            const iceCandidate = new RTCIceCandidate({
              candidate: candidate?.candidate ?? '',
              sdpMid: candidate?.sdpMid ?? null,
              sdpMLineIndex: candidate?.sdpMLineIndex ?? null,
            });
            await addIceCandidate(iceCandidate);
          } catch (err) {
            console.warn('Failed to add ICE candidate', err);
          }
        }
      }
    })();
  }, [call?.id, call?.initiatorId, call?.signaling, user?.uid, webrtcReady]);

  useEffect(() => {
    if (!call) return;
    setMutedVideo(call.type === 'voice');
  }, [call?.type]);

  const cleanupConnection = useCallback(
    async (endForAll = false, reason?: CallStatus) => {
      closeConnection();
      setLocalStream(null);
      setRemoteStream(null);
      setWebrtcReady(false);
      setIsConnected(false);
      peerConnectionRef.current = null;
      if (call?.id && user?.uid) {
        try {
          await markParticipantLeft(call.id, user.uid);
          // For group calls we use first-to-answer semantics (acceptedBy). Once claimed, treat it like a 1:1 call.
          const shouldEnd = endForAll || !call?.isGroup || Boolean(call?.acceptedBy);
          if (shouldEnd) {
            await endCall(call.id, user.uid, reason ?? 'ended');
          }
        } catch (err) {
          console.warn('Failed to update call state', err);
        }
      }
    },
    [call?.id, call?.isGroup, user?.uid],
  );

  const handleHangUp = useCallback(async () => {
    if (isHangingUp) return;
    setIsHangingUp(true);
    const shouldEndForAll = call?.initiatorId === user?.uid;
    try {
      await cleanupConnection(shouldEndForAll);
      router.back();
    } catch (err) {
      console.warn('Hangup failed', err);
    } finally {
      setIsHangingUp(false);
    }
  }, [call?.initiatorId, user?.uid, cleanupConnection, isHangingUp, router]);

  useEffect(() => {
    if (!call?.id || !call?.channelName || !call?.type || !user?.uid) return;
    if (hasJoinedRef.current) return;
    hasJoinedRef.current = true;
    let cancelled = false;

    const joinAsync = async () => {
      setJoining(true);
      try {
        // Join call session
        await joinCallAsParticipant(call.id, user.uid, user.displayName ?? null);

        // Set up WebRTC callbacks
        setIceCandidateCallback((candidate: any) => {
          sendIceCandidate(call.id, user.uid, candidate);
        });

        setRemoteStreamCallback((stream: any) => {
          setRemoteStream(stream);
          setIsConnected(true);
        });

        // Initialize WebRTC
        const { peerConnection, localStream: stream } = await initializeWebRTC(call.type);
        peerConnectionRef.current = peerConnection;
        setLocalStream(stream);
        setWebrtcReady(true);

        // In some cases the media stream callback can lag behind the actual connection.
        // Track peer connection state so the UI can leave the "Waiting" screen once connected.
        try {
          (peerConnection as any).onconnectionstatechange = () => {
            const state = (peerConnection as any).connectionState;
            if (state === 'connected') setIsConnected(true);
          };
          (peerConnection as any).oniceconnectionstatechange = () => {
            const iceState = (peerConnection as any).iceConnectionState;
            if (iceState === 'connected' || iceState === 'completed') setIsConnected(true);
          };
        } catch {
          // ignore
        }

        // Handle signaling based on role
        const isInitiator = call.initiatorId === user.uid;

        if (isInitiator) {
          // Create offer for other participants
          const offer = await createOffer();
          await sendOffer(call.id, user.uid, offer);
        } else {
          // Listen for offers from other participants
          // This will be handled by the call listener
        }

        setError(null);
        setIsDialing(false);
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to join WebRTC call', err);
          const message = err instanceof Error ? err.message : 'Unable to join the call';
          setError(message);
          if (message === 'Call already answered' || message === 'Call has ended') {
            router.back();
          }
        }
      } finally {
        if (!cancelled) setJoining(false);
      }
    };

    joinAsync();

    return () => {
      cancelled = true;
    };
  }, [call?.id, call?.channelName, call?.type, user?.uid]);

  useEffect(() => {
    return () => {
      hasJoinedRef.current = false;
      setWebrtcReady(false);
      cleanupConnection(false);
    };
  }, [cleanupConnection]);

  useEffect(() => {
    if ((call?.status === 'ended' || call?.status === 'declined' || call?.status === 'missed') && !isHangingUp) {
      cleanupConnection(false);
      router.back();
    }
  }, [call?.status, isHangingUp, router, cleanupConnection]);

  useEffect(() => {
    // Offline calls should auto-end after ~1 minute (WhatsApp-like).
    if (!call?.id || !user?.uid) return;
    if (call.isGroup) return;
    if (call.initiatorId !== user.uid) return;
    if (isConnected || call.status === 'active') return;

    // Only enforce the timeout when the callee is offline.
    if (otherPresence?.state !== 'offline') return;

    const fromCall =
      (call as any)?.ringTimeoutAt && typeof (call as any).ringTimeoutAt?.toMillis === 'function'
        ? (call as any).ringTimeoutAt.toMillis()
        : null;

    if (offlineTimeoutAtRef.current == null) {
      offlineTimeoutAtRef.current = Date.now() + 60_000;
    }

    const timeoutMillis = typeof fromCall === 'number' ? fromCall : offlineTimeoutAtRef.current;

    const remaining = timeoutMillis - Date.now();
    if (remaining <= 0) {
      void cleanupConnection(true, 'missed').then(() => router.back());
      return;
    }

    const t = setTimeout(() => {
      void cleanupConnection(true, 'missed').then(() => router.back());
    }, remaining);

    return () => clearTimeout(t);
  }, [call?.id, call?.initiatorId, call?.isGroup, call?.ringTimeoutAt, call?.status, cleanupConnection, isConnected, otherPresence?.state, router, user?.uid]);

  const toggleAudio = useCallback(async () => {
    const next = !mutedAudio;
    const success = webrtcToggleAudio();
    if (success) {
      setMutedAudio(next);
      if (call?.id && user?.uid) {
        await updateParticipantMuteState(call.id, user.uid, { mutedAudio: next });
      }
    }
  }, [mutedAudio, call?.id, user?.uid]);

  const toggleVideo = useCallback(async () => {
    if (call?.type === 'voice') return;
    const next = !mutedVideo;
    const success = webrtcToggleVideo();
    if (success) {
      setMutedVideo(next);
      if (call?.id && user?.uid) {
        await updateParticipantMuteState(call.id, user.uid, { mutedVideo: next });
      }
    }
  }, [mutedVideo, call?.id, call?.type, user?.uid]);

  const toggleSpeaker = useCallback(async () => {
    // For WebRTC, speaker control is handled by the system
    // This is a placeholder for future speaker control implementation
    setSpeakerOn(!speakerOn);
  }, [speakerOn]);

  if (!call) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.loadingText}>Connecting to call…</Text>
      </View>
    );
  }

  const subtitle = (() => {
    if (isConnected || call.status === 'active') return 'Connected';
    if (call.isGroup) return call.status === 'ringing' ? 'Ringing…' : 'Calling group…';
    if (otherPresence?.state === 'online') return 'Ringing…';
    if (otherLastSeen) return `Calling… (last seen ${otherLastSeen.toLocaleString()})`;
    return 'Calling…';
  })();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0d0c12', '#05050a']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleHangUp} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
            <Text style={styles.backLabel}>Leave</Text>
          </TouchableOpacity>
          <View style={styles.callInfo}>
            <Text style={styles.callTitle} numberOfLines={1} ellipsizeMode="tail">
              {call.conversationName ?? 'Call'}
            </Text>
            <Text style={styles.callSubtitle} numberOfLines={1} ellipsizeMode="tail">
              {subtitle}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {call.type === 'video' ? (
            <View style={styles.videoArea}>
              {!remoteStream ? (
                <View style={styles.waitingCard}>
                  <BlurView intensity={60} tint="dark" style={styles.waitingBlur}>
                    <Ionicons name="videocam-outline" size={32} color="#fff" />
                    <Text style={styles.waitingText}>
                      {subtitle}
                    </Text>
                  </BlurView>
                </View>
              ) : (
                <RTCView
                  streamURL={remoteStream.toURL()}
                  style={styles.remoteVideo}
                  objectFit="cover"
                />
              )}
              {localStream && (
                <View style={styles.localPreview}>
                  <RTCView
                    streamURL={localStream.toURL()}
                    style={styles.localVideo}
                    objectFit="cover"
                  />
                  <Text style={styles.previewLabel}>You</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.voiceArea}>
              <Ionicons name="call" size={36} color="#fff" />
              <Text style={styles.voiceTitle}>{call.conversationName ?? 'Voice call'}</Text>
              <Text style={styles.voiceSubtitle}>
                {subtitle}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.controlsWrap}>
          <CallControls
            isAudioMuted={mutedAudio}
            isVideoMuted={mutedVideo}
            speakerOn={speakerOn}
            callType={call.type}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
            onToggleSpeaker={toggleSpeaker}
            onEnd={handleHangUp}
          />
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05050a',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backLabel: {
    color: '#fff',
    marginLeft: 4,
    fontWeight: '600',
  },
  callInfo: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  callTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  callSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    flexShrink: 1,
  },
  controlsWrap: {
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  videoArea: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  remoteGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
  },
  localPreview: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 120,
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  previewLabel: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    color: '#fff',
    fontSize: 12,
  },
  waitingCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingBlur: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 18,
    alignItems: 'center',
  },
  waitingText: {
    marginTop: 8,
    color: '#fff',
  },
  voiceArea: {
    borderRadius: 24,
    paddingVertical: 48,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 10,
  },
  voiceTitle: {
    marginTop: 16,
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  voiceSubtitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.7)',
  },
  errorBanner: {
    alignSelf: 'center',
    backgroundColor: 'rgba(229,9,20,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#fff',
    fontSize: 12,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: '#05050a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#fff',
  },
});

export default CallScreen;
