 import {
  endCall,
  heartbeatCallParticipant,
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
  createOfferWithOptions,
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RTCIceCandidate, RTCSessionDescription, RTCView } from 'react-native-webrtc';
import { getLastSeen, onAuthChange, onUserPresence } from '../messaging/controller';
import { useMessagingSettings } from '../../hooks/useMessagingSettings';
import CallControls from './components/CallControls';

type VideoFilterId = 'none' | 'sepia' | 'warm' | 'cool' | 'noir' | 'rose';
const VIDEO_FILTERS: Array<{ id: VideoFilterId; label: string; overlayColor: string; overlayOpacity: number }> = [
  { id: 'none', label: 'None', overlayColor: 'transparent', overlayOpacity: 0 },
  { id: 'sepia', label: 'Sepia', overlayColor: '#7a4e21', overlayOpacity: 0.24 },
  { id: 'warm', label: 'Warm', overlayColor: '#ff7a2f', overlayOpacity: 0.14 },
  { id: 'cool', label: 'Cool', overlayColor: '#2f9bff', overlayOpacity: 0.12 },
  { id: 'noir', label: 'Noir', overlayColor: '#000000', overlayOpacity: 0.18 },
  { id: 'rose', label: 'Rose', overlayColor: '#ff4fa0', overlayOpacity: 0.10 },
];

const CALL_GRADIENT_PALETTES: [string, string, string][] = [
  ['#0e0a1c', '#3a1247', '#07040e'],
  ['#07152a', '#0c3d6a', '#060912'],
  ['#0b1b16', '#0b5038', '#070b0a'],
  ['#1c0b0b', '#6a0c0c', '#070404'],
  ['#0c0a0f', '#3b2240', '#05050a'],
];

const VideoFilterOverlay = ({ filterId }: { filterId: VideoFilterId }) => {
  const selected = VIDEO_FILTERS.find((f) => f.id === filterId) ?? VIDEO_FILTERS[0];
  if (selected.id === 'none' || selected.overlayOpacity <= 0) return null;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { backgroundColor: selected.overlayColor, opacity: selected.overlayOpacity }]}
    />
  );
};

const CallScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { settings } = useMessagingSettings();

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
  const [videoFilterId, setVideoFilterId] = useState<VideoFilterId>('none');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [otherPresence, setOtherPresence] = useState<{ state: 'online' | 'offline'; last_changed: number | null } | null>(null);
  const [otherLastSeen, setOtherLastSeen] = useState<Date | null>(null);
  const [connectionState, setConnectionState] = useState<string | null>(null);
  const [iceState, setIceState] = useState<string | null>(null);

  const voiceBgFade = useRef(new Animated.Value(0)).current;
  const voiceBgIndexRef = useRef(0);
  const [voiceBgIndex, setVoiceBgIndex] = useState(0);
  const [voiceBgNextIndex, setVoiceBgNextIndex] = useState(1);

  // Ambient orb animations
  const orbPulse1 = useRef(new Animated.Value(0)).current;
  const orbPulse2 = useRef(new Animated.Value(0)).current;
  const ringPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Orb 1 pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse1, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(orbPulse1, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    // Orb 2 pulse animation (offset)
    Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse2, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(orbPulse2, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    // Ring pulse for dialing state
    Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 0, duration: 1200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [orbPulse1, orbPulse2, ringPulse]);

  const localStreamUrl = useMemo(() => {
    if (!localStream || typeof localStream?.toURL !== 'function') return null;
    try {
      return localStream.toURL();
    } catch {
      return null;
    }
  }, [localStream]);

  const remoteStreamUrl = useMemo(() => {
    if (!remoteStream || typeof remoteStream?.toURL !== 'function') return null;
    try {
      return remoteStream.toURL();
    } catch {
      return null;
    }
  }, [remoteStream]);

  const videoFilterLabel = useMemo(() => {
    return (VIDEO_FILTERS.find((f) => f.id === videoFilterId) ?? VIDEO_FILTERS[0]).label;
  }, [videoFilterId]);

  const peerConnectionRef = useRef<any>(null);
  const hasJoinedRef = useRef(false);
  const offlineTimeoutAtRef = useRef<number | null>(null);
  const processedOffersRef = useRef<Set<string>>(new Set());
  const processedAnswersRef = useRef<Set<string>>(new Set());
  const processedIceRef = useRef<Set<string>>(new Set());
  const iceRestartAttemptedRef = useRef(false);

  const hashString = useCallback((input: string) => {
    let h = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => {
      setUser(authUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (call?.type !== 'voice') return;

    const seed = String(call?.id ?? '0');
    const startIndex = seed
      .split('')
      .reduce((acc, ch) => (acc + ch.charCodeAt(0)) % CALL_GRADIENT_PALETTES.length, 0);
    voiceBgIndexRef.current = startIndex;
    setVoiceBgIndex(startIndex);
    setVoiceBgNextIndex((startIndex + 1) % CALL_GRADIENT_PALETTES.length);
    voiceBgFade.setValue(0);

    let alive = true;
    const interval = setInterval(() => {
      const next = (voiceBgIndexRef.current + 1) % CALL_GRADIENT_PALETTES.length;
      setVoiceBgNextIndex(next);
      voiceBgFade.setValue(0);
      Animated.timing(voiceBgFade, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!alive || !finished) return;
        voiceBgIndexRef.current = next;
        setVoiceBgIndex(next);
      });
    }, 5200);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [call?.id, call?.type, voiceBgFade]);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = listenToCall(String(id), async (session) => {
      setCall(session);
    });
    return () => unsubscribe();
  }, [id, user?.uid]);

  const otherUserId = useMemo(() => {
    if (!call?.members?.length || !user?.uid) return null;
    if (call.isGroup) return null;
    const others = call.members.filter((m) => m !== user.uid);
    return others.length === 1 ? others[0] : null;
  }, [call?.isGroup, call?.members, user?.uid]);

  useEffect(() => {
    if (!otherUserId) {
      setOtherPresence(null);
      setOtherLastSeen(null);
      return;
    }

    const unsub = onUserPresence(otherUserId, (status) => {
      setOtherPresence(status);
      if (settings.hibernate) {
        setOtherLastSeen(null);
        return;
      }
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
  }, [otherUserId, settings.hibernate]);

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
          const sdpHash = hashString(String(senderSignaling.offer?.sdp ?? ''));
          const offerKey = `${call.id}:${senderId}:offer:${sdpHash}`;
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
          const sdpHash = hashString(String(senderSignaling.answer?.sdp ?? ''));
          const answerKey = `${call.id}:${senderId}:answer:${sdpHash}`;
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
  }, [call?.id, call?.initiatorId, call?.signaling, hashString, user?.uid, webrtcReady]);

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
            try {
              setConnectionState(state ?? null);
            } catch {}
            if (state === 'connected') setIsConnected(true);
            if (state === 'failed') {
              // Failed ICE/DTLS handshake is common on weak networks without TURN.
              // Best-effort retry (initiator only) to avoid being stuck forever.
              if (!iceRestartAttemptedRef.current && call.initiatorId === user.uid) {
                iceRestartAttemptedRef.current = true;
                void (async () => {
                  try {
                    const offer = await createOfferWithOptions({ iceRestart: true });
                    await sendOffer(call.id, user.uid, offer);
                  } catch (err) {
                    console.warn('ICE restart offer failed', err);
                  }
                })();
              }
            }
          };
          (peerConnection as any).oniceconnectionstatechange = () => {
            const iceState = (peerConnection as any).iceConnectionState;
            try {
              setIceState(iceState ?? null);
            } catch {}
            if (iceState === 'connected' || iceState === 'completed') setIsConnected(true);
            if (iceState === 'failed') {
              if (!iceRestartAttemptedRef.current && call.initiatorId === user.uid) {
                iceRestartAttemptedRef.current = true;
                void (async () => {
                  try {
                    const offer = await createOfferWithOptions({ iceRestart: true });
                    await sendOffer(call.id, user.uid, offer);
                  } catch (err) {
                    console.warn('ICE restart offer failed', err);
                  }
                })();
              }
            }
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
    // Watchdog: if we're stuck in "connecting/checking" for too long, attempt a single ICE restart.
    if (!call?.id || !user?.uid) return;
    if (!webrtcReady || isConnected) return;
    if (call.type !== 'video') return;
    if (call.initiatorId !== user.uid) return;

    const pc: any = peerConnectionRef.current;
    const state = String(pc?.connectionState ?? '');
    const ice = String(pc?.iceConnectionState ?? '');
    const looksStuck = state === 'connecting' || ice === 'checking' || ice === 'disconnected' || state === '';
    if (!looksStuck) return;

    const t = setTimeout(() => {
      if (iceRestartAttemptedRef.current) return;
      iceRestartAttemptedRef.current = true;
      void (async () => {
        try {
          const offer = await createOfferWithOptions({ iceRestart: true });
          await sendOffer(call.id, user.uid, offer);
        } catch (err) {
          console.warn('ICE restart offer failed', err);
        }
      })();
    }, 18_000);

    return () => clearTimeout(t);
  }, [call?.id, call?.initiatorId, call?.type, isConnected, user?.uid, webrtcReady]);

  useEffect(() => {
    // If the call is still not connected after a grace period, show a helpful error.
    if (!webrtcReady || isConnected) return;
    if (!call?.id) return;

    const t = setTimeout(() => {
      if (isConnected) return;
      setError(
        'Still connecting. This usually happens on weak networks or when a TURN relay is needed. Try switching networks or start a voice call.',
      );
    }, 32_000);

    return () => clearTimeout(t);
  }, [call?.id, isConnected, webrtcReady]);

  useEffect(() => {
    // Pro: participant heartbeat so the other side can detect reconnecting/stale clients.
    if (!call?.id || !user?.uid) return;
    if (call.status !== 'active') return;

    const t = setInterval(() => {
      const pc: any = peerConnectionRef.current;
      const extras = {
        connectionState: typeof pc?.connectionState === 'string' ? pc.connectionState : null,
        iceState: typeof pc?.iceConnectionState === 'string' ? pc.iceConnectionState : null,
      };
      void heartbeatCallParticipant(call.id, user.uid, extras).catch(() => {});
    }, 25_000);

    return () => clearInterval(t);
  }, [call?.id, call?.status, user?.uid]);

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
    const result = webrtcToggleAudio();
    if (!result) return;
    const nextMuted = !result.enabled;
    setMutedAudio(nextMuted);
    if (call?.id && user?.uid) {
      await updateParticipantMuteState(call.id, user.uid, { mutedAudio: nextMuted });
    }
  }, [mutedAudio, call?.id, user?.uid]);

  const toggleVideo = useCallback(async () => {
    if (call?.type === 'voice') return;
    const result = webrtcToggleVideo();
    if (!result) return;
    const nextMuted = !result.enabled;
    setMutedVideo(nextMuted);
    if (call?.id && user?.uid) {
      await updateParticipantMuteState(call.id, user.uid, { mutedVideo: nextMuted });
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
    if (call.status === 'active') {
      if (connectionState === 'disconnected' || connectionState === 'connecting') return 'Reconnecting…';
      if (iceState === 'disconnected' || iceState === 'checking') return 'Reconnecting…';
      return 'Connected';
    }
    if (isConnected) return 'Connected';
    if (call.isGroup) return call.status === 'ringing' ? 'Ringing…' : 'Calling group…';
    if (call.status === 'ringing') return 'Ringing…';
    if (!settings.hibernate && otherLastSeen) return `Calling… (last seen ${otherLastSeen.toLocaleString()})`;
    return 'Calling…';
  })();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={call.type === 'voice' ? CALL_GRADIENT_PALETTES[voiceBgIndex] : ['#0d0c12', '#05050a']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      {call.type === 'voice' ? (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: voiceBgFade }]} pointerEvents="none">
          <LinearGradient
            colors={CALL_GRADIENT_PALETTES[voiceBgNextIndex]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>
      ) : null}

      {/* Animated ambient orbs */}
      <Animated.View
        style={[
          styles.ambientOrb1,
          {
            opacity: orbPulse1.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }),
            transform: [{ scale: orbPulse1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
          },
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={call.type === 'voice' ? ['#ff4b4b50', '#ff4b4b10', 'transparent'] : ['#6482ff40', '#6482ff10', 'transparent']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.ambientOrb2,
          {
            opacity: orbPulse2.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.25] }),
            transform: [{ scale: orbPulse2.interpolate({ inputRange: [0, 1], outputRange: [1.1, 0.95] }) }],
          },
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={call.type === 'voice' ? ['#ffa72650', '#ff704310', 'transparent'] : ['#a855f740', '#a855f710', 'transparent']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      <LinearGradient
        colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.9)']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
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
              {!remoteStreamUrl ? (
                <View style={styles.waitingCard}>
                  <BlurView intensity={60} tint="dark" style={styles.waitingBlur}>
                    <Ionicons name="videocam-outline" size={32} color="#fff" />
                    <Text style={styles.waitingText}>
                      {subtitle}
                    </Text>
                  </BlurView>
                </View>
              ) : (
                <View style={styles.remoteVideo}>
                  <RTCView
                    key={remoteStreamUrl}
                    streamURL={remoteStreamUrl}
                    style={StyleSheet.absoluteFillObject}
                    objectFit="cover"
                    zOrder={0}
                  />
                  <VideoFilterOverlay filterId={videoFilterId} />
                </View>
              )}
              {localStreamUrl && (
                <View style={styles.localPreview}>
                  <RTCView
                    key={localStreamUrl}
                    streamURL={localStreamUrl}
                    style={styles.localVideo}
                    objectFit="cover"
                    mirror
                    zOrder={1}
                  />
                  <VideoFilterOverlay filterId={videoFilterId} />
                  <Text style={styles.previewLabel}>You</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.voiceArea}>
              {/* Pulsing rings for dialing state */}
              {!isConnected && (
                <>
                  <Animated.View
                    style={[
                      styles.voiceRing,
                      styles.voiceRing1,
                      {
                        opacity: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
                        transform: [{ scale: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.voiceRing,
                      styles.voiceRing2,
                      {
                        opacity: ringPulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.3, 0] }),
                        transform: [{ scale: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                      },
                    ]}
                  />
                </>
              )}
              <View style={styles.voiceIconWrap}>
                <LinearGradient
                  colors={['rgba(229,9,20,0.3)', 'rgba(229,9,20,0.1)']}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
                <Ionicons name="call" size={40} color="#fff" />
              </View>
              <Text style={styles.voiceTitle}>{call.conversationName ?? 'Voice call'}</Text>
              <View style={styles.voiceStatusPill}>
                {isConnected && <View style={styles.voiceStatusDot} />}
                <Text style={styles.voiceSubtitle}>{subtitle}</Text>
              </View>
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
            onOpenFilters={call.type === 'video' ? () => setFiltersOpen(true) : undefined}
            filterLabel={videoFilterLabel}
            onEnd={handleHangUp}
          />
        </View>

        <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={() => setFiltersOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setFiltersOpen(false)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Video filters</Text>
              <Text style={styles.modalSubtitle}>Applies locally (does not change what the other person receives).</Text>
              <View style={styles.modalGrid}>
                {VIDEO_FILTERS.map((filter) => {
                  const active = filter.id === videoFilterId;
                  return (
                    <TouchableOpacity
                      key={filter.id}
                      style={[styles.filterPill, active && styles.filterPillActive]}
                      onPress={() => setVideoFilterId(filter.id)}
                      activeOpacity={0.85}
                    >
                      <View
                        style={[
                          styles.filterSwatch,
                          { backgroundColor: filter.overlayColor, opacity: Math.max(0.1, filter.overlayOpacity) },
                        ]}
                      />
                      <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{filter.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity style={styles.modalDone} onPress={() => setFiltersOpen(false)}>
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

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
  ambientOrb1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: '10%',
    left: -60,
    overflow: 'hidden',
  },
  ambientOrb2: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    bottom: '15%',
    right: -40,
    overflow: 'hidden',
  },
  voiceArea: {
    borderRadius: 28,
    paddingVertical: 56,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  voiceRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(229,9,20,0.5)',
  },
  voiceRing1: {
    width: 100,
    height: 100,
  },
  voiceRing2: {
    width: 100,
    height: 100,
  },
  voiceIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.3)',
    overflow: 'hidden',
  },
  voiceTitle: {
    marginTop: 20,
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  voiceSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
  },
  voiceStatusPill: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  voiceStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
    shadowColor: '#4ade80',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 18,
    backgroundColor: 'rgba(18,18,24,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  modalSubtitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  modalGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterPillActive: {
    backgroundColor: 'rgba(229,9,20,0.22)',
    borderColor: 'rgba(229,9,20,0.35)',
  },
  filterSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  filterLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '800',
    fontSize: 13,
  },
  filterLabelActive: {
    color: '#fff',
  },
  modalDone: {
    marginTop: 16,
    alignSelf: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#E50914',
  },
  modalDoneText: {
    color: '#fff',
    fontWeight: '900',
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
