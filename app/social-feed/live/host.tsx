import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';
import type { User } from 'firebase/auth';

import { onAuthChange } from '../../messaging/controller';
import { useAccent } from '../../components/AccentContext';
import {
  createLiveStreamSession,
  endLiveStream,
  listenToLiveGifts,
  listenToLiveSignaling,
  listenToLiveStream,
  listenToLiveViewers,
  promoteLiveStreamIfNeeded,
  shouldAutoEndLiveForIdle,
  sendLiveIceCandidate,
  sendLiveOffer,
  touchLiveEngagement,
  touchLiveStreamHeartbeat,
} from '@/lib/live/liveService';
import type { LiveStream, LiveStreamGift, LiveStreamSession, LiveStreamViewer } from '@/lib/live/types';
import {
  addIceCandidateToBroadcaster,
  closeBroadcaster,
  createBroadcastOffer,
  handleViewerAnswer,
  initializeBroadcaster,
  setIceCandidateCallback,
} from '@/lib/live/webrtcLiveClient';
import { RTCIceCandidate } from 'react-native-webrtc';

const COUNTDOWN_SECONDS = 3;

export default function LiveHostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accentColor } = useAccent();

  const params = useLocalSearchParams<{ title?: string; coverUrl?: string; cameraFront?: string }>();
  const title = typeof params.title === 'string' && params.title.trim() ? params.title.trim() : 'Live on MovieFlix';
  const coverUrl = typeof params.coverUrl === 'string' && params.coverUrl.trim() ? params.coverUrl.trim() : null;
  const initialCameraFront = params.cameraFront === '0' ? false : true;

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<LiveStreamSession | null>(null);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const streamRef = useRef<LiveStream | null>(null);

  const isHlsMode = Boolean(session?.playbackHlsUrl);

  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  const [broadcasterStream, setBroadcasterStream] = useState<any>(null);
  const [cameraFront, setCameraFront] = useState(initialCameraFront);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [videoFit, setVideoFit] = useState<'cover' | 'contain'>('cover');

  const [overlayVisible, setOverlayVisible] = useState(true);
  const [viewers, setViewers] = useState<LiveStreamViewer[]>([]);
  const [gifts, setGifts] = useState<LiveStreamGift[]>([]);
  const [viewersVisible, setViewersVisible] = useState(false);
  const [giftsVisible, setGiftsVisible] = useState(false);

  const viewerUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const offeredRef = useRef<Set<string>>(new Set());
  const processedAnswerRef = useRef<Set<string>>(new Set());
  const processedViewerIceRef = useRef<Set<string>>(new Set());
  const idleEndInFlightRef = useRef(false);
  const promoteInFlightRef = useRef(false);

  const lastTapRef = useRef(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartAnim = useRef(new Animated.Value(0)).current;
  const [heartPos, setHeartPos] = useState({ x: 140, y: 180 });

  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => setUser(authUser));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  const cleanupSignalingListeners = useCallback(() => {
    for (const unsub of viewerUnsubsRef.current.values()) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    viewerUnsubsRef.current = new Map();
    offeredRef.current = new Set();
    processedAnswerRef.current = new Set();
    processedViewerIceRef.current = new Set();
  }, []);

  const endAndExit = useCallback(
    async (opts?: { silent?: boolean }) => {
      const streamId = session?.streamId;
      const hostId = user?.uid ?? null;
      try {
        if (streamId) await endLiveStream(streamId, hostId);
      } catch (err) {
        if (!opts?.silent) console.warn('Failed to end live stream', err);
      }

      try {
        cleanupSignalingListeners();
      } catch {}
      try {
        closeBroadcaster();
      } catch {}

      setSession(null);
      setStream(null);
      setBroadcasterStream(null);
      setStarted(false);
      setStarting(false);

      router.replace('/social-feed/live');
    },
    [cleanupSignalingListeners, router, session?.streamId, user?.uid],
  );

  const toggleMic = useCallback(() => {
    const next = !micOn;
    setMicOn(next);
    try {
      const audioTracks = broadcasterStream?.getAudioTracks?.() ?? [];
      audioTracks.forEach((t: any) => {
        t.enabled = next;
      });
    } catch {
      // ignore
    }
  }, [broadcasterStream, micOn]);

  const toggleCamera = useCallback(() => {
    const next = !cameraOn;
    setCameraOn(next);
    try {
      const videoTracks = broadcasterStream?.getVideoTracks?.() ?? [];
      videoTracks.forEach((t: any) => {
        t.enabled = next;
      });
    } catch {
      // ignore
    }
  }, [broadcasterStream, cameraOn]);

  const flipCamera = useCallback(() => {
    try {
      const videoTrack = (broadcasterStream?.getVideoTracks?.() ?? [])[0];
      if (videoTrack && typeof (videoTrack as any)._switchCamera === 'function') {
        (videoTrack as any)._switchCamera();
        setCameraFront((v) => !v);
        return;
      }
    } catch {
      // ignore
    }
    Alert.alert('Not supported', 'Camera flip is not available on this device.');
  }, [broadcasterStream]);

  const shareLive = useCallback(async () => {
    const streamId = session?.streamId;
    if (!streamId) return;
    const msg = `Join my live on MovieFlix: /social-feed/live/${streamId}`;
    try {
      await Share.share({ message: msg });
    } catch {
      // ignore
    }
  }, [session?.streamId]);

  const playHeartBurst = useCallback(() => {
    heartAnim.setValue(0);
    Animated.timing(heartAnim, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
    }).start();
  }, [heartAnim]);

  const heartScale = useMemo(
    () =>
      heartAnim.interpolate({
        inputRange: [0, 0.35, 1],
        outputRange: [0.2, 1.2, 1],
      }),
    [heartAnim],
  );

  const heartOpacity = useMemo(
    () =>
      heartAnim.interpolate({
        inputRange: [0, 0.15, 0.8, 1],
        outputRange: [0, 1, 1, 0],
      }),
    [heartAnim],
  );

  const handleSurfaceTap = useCallback(
    (e: any) => {
      if (!started) return;
      const now = Date.now();
      const isDouble = now - lastTapRef.current < 280;

      if (isDouble) {
        if (tapTimeoutRef.current) {
          clearTimeout(tapTimeoutRef.current);
          tapTimeoutRef.current = null;
        }
        lastTapRef.current = 0;

        const { locationX, locationY } = e?.nativeEvent ?? {};
        if (typeof locationX === 'number' && typeof locationY === 'number') {
          setHeartPos({ x: locationX, y: locationY });
        }

        playHeartBurst();
        if (session?.streamId && user?.uid) {
          void touchLiveEngagement(session.streamId, user.uid, 'tap').catch(() => {});
        }
        return;
      }

      lastTapRef.current = now;
      tapTimeoutRef.current = setTimeout(() => {
        setOverlayVisible((v) => !v);
        tapTimeoutRef.current = null;
      }, 280);
    },
    [playHeartBurst, session?.streamId, started, user?.uid],
  );

  const startLive = useCallback(async () => {
    if (!user?.uid) {
      Alert.alert('Please sign in', 'You need an account to go live.');
      router.replace('/(auth)/login');
      return;
    }
    if (starting || started) return;

    setStarting(true);
    let createdStreamId: string | null = null;
    try {
      const sessionPayload = await createLiveStreamSession({
        hostId: user.uid,
        hostName: user.displayName ?? user.email ?? 'Host',
        title,
        coverUrl,
      });
      createdStreamId = sessionPayload.streamId;
      setSession(sessionPayload);

      // Scalable mode: host publishes to Cloudflare (RTMPS) and viewers watch HLS.
      // Note: mobile camera ingest is not implemented here; the host must publish using an RTMPS-capable encoder.
      if (sessionPayload.playbackHlsUrl) {
        setStarted(true);
        Alert.alert(
          'Live created',
          'Your live is ready. Publish to Cloudflare using the RTMPS URL + Stream Key shown on this screen, and viewers will watch via HLS.',
        );
        return;
      }

      const { stream } = await initializeBroadcaster({ isFront: cameraFront });
      setBroadcasterStream(stream);

      setIceCandidateCallback(async ({ viewerId, candidate, from }) => {
        if (from !== 'host') return;
        await sendLiveIceCandidate(sessionPayload.streamId, viewerId, 'host', candidate);
      });

      // Apply initial toggles
      try {
        (stream?.getAudioTracks?.() ?? []).forEach((t: any) => (t.enabled = micOn));
        (stream?.getVideoTracks?.() ?? []).forEach((t: any) => (t.enabled = cameraOn));
      } catch {
        // ignore
      }

      setStarted(true);
    } catch (err: any) {
      console.error('Failed to start live stream:', err);
      if (createdStreamId) {
        void endLiveStream(createdStreamId, user?.uid ?? null).catch(() => {});
      }
      Alert.alert('Unable to go live', err?.message || 'Please check camera permissions and try again.');
      try {
        closeBroadcaster();
      } catch {}
      setSession(null);
      setBroadcasterStream(null);
      setStarted(false);
    } finally {
      setStarting(false);
    }
  }, [cameraFront, cameraOn, coverUrl, micOn, router, started, starting, title, user]);

  // Countdown then start.
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    if (!user?.uid) return;
    if (started || starting) return;

    setCountdown(COUNTDOWN_SECONDS);
    t = setInterval(() => {
      setCountdown((c) => {
        const next = c - 1;
        if (next <= 0) {
          if (t) clearInterval(t);
          t = null;
          if (!cancelled) void startLive();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      cancelled = true;
      if (t) clearInterval(t);
    };
  }, [startLive, started, starting, user?.uid]);

  // Live subscriptions (stream doc + viewers + gifts + fan-out signaling)
  useEffect(() => {
    if (!session?.streamId || !user?.uid || !started) return;

    const streamId = session.streamId;
    const hostId = user.uid;

    let unsubStream: (() => void) | null = null;
    let unsubViewers: (() => void) | null = null;
    let unsubGifts: (() => void) | null = null;
    let heartbeatT: ReturnType<typeof setInterval> | null = null;
    let idleT: ReturnType<typeof setInterval> | null = null;

    unsubStream = listenToLiveStream(streamId, (liveStream) => {
      setStream(liveStream);
      if (liveStream && !promoteInFlightRef.current) {
        promoteInFlightRef.current = true;
        void promoteLiveStreamIfNeeded(liveStream).finally(() => {
          promoteInFlightRef.current = false;
        });
      }
    });

    unsubViewers = listenToLiveViewers(streamId, (next) => {
      setViewers(next);

      if (isHlsMode) return;

      for (const v of next) {
        const viewerId = v.id;
        if (!viewerId || viewerId === hostId) continue;

        if (!viewerUnsubsRef.current.has(viewerId)) {
          const unsubSig = listenToLiveSignaling(streamId, viewerId, (sig) => {
            if (!sig) return;

            if (sig.answer && !processedAnswerRef.current.has(viewerId)) {
              processedAnswerRef.current.add(viewerId);
              void handleViewerAnswer(viewerId, sig.answer).catch(() => {});
            }

            const candidates = Array.isArray((sig as any).viewerIceCandidates)
              ? (sig as any).viewerIceCandidates
              : [];
            for (const c of candidates) {
              const key = `${viewerId}:${c?.candidate ?? ''}:${c?.sdpMid ?? ''}:${c?.sdpMLineIndex ?? ''}`;
              if (processedViewerIceRef.current.has(key)) continue;
              processedViewerIceRef.current.add(key);
              try {
                const ice = new RTCIceCandidate({
                  candidate: c?.candidate ?? '',
                  sdpMid: c?.sdpMid ?? null,
                  sdpMLineIndex: c?.sdpMLineIndex ?? null,
                });
                void addIceCandidateToBroadcaster(viewerId, ice).catch(() => {});
              } catch {
                // ignore
              }
            }
          });

          viewerUnsubsRef.current.set(viewerId, () => {
            try {
              unsubSig();
            } catch {
              // ignore
            }
          });
        }

        if (offeredRef.current.has(viewerId)) continue;
        offeredRef.current.add(viewerId);
        void (async () => {
          try {
            const offer = await createBroadcastOffer(viewerId);
            await sendLiveOffer(streamId, viewerId, offer);
          } catch {
            offeredRef.current.delete(viewerId);
          }
        })();
      }
    });

    unsubGifts = listenToLiveGifts(streamId, (next) => setGifts(next), { limitCount: 30 });

    heartbeatT = setInterval(() => {
      void touchLiveStreamHeartbeat(streamId).catch(() => {});
    }, 20_000);

    idleT = setInterval(() => {
      if (idleEndInFlightRef.current) return;
      if (!shouldAutoEndLiveForIdle(streamRef.current)) return;
      idleEndInFlightRef.current = true;
      void (async () => {
        try {
          await endLiveStream(streamId, hostId);
        } finally {
          idleEndInFlightRef.current = false;
          void endAndExit({ silent: true });
        }
      })();
    }, 30_000);

    return () => {
      try {
        unsubStream?.();
      } catch {}
      try {
        unsubViewers?.();
      } catch {}
      try {
        unsubGifts?.();
      } catch {}
      if (heartbeatT) clearInterval(heartbeatT);
      if (idleT) clearInterval(idleT);
      cleanupSignalingListeners();
    };
  }, [cleanupSignalingListeners, endAndExit, isHlsMode, session?.streamId, started, user?.uid]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);

      const streamId = session?.streamId;
      const hostId = user?.uid ?? null;
      void (async () => {
        try {
          if (streamId) await endLiveStream(streamId, hostId);
        } catch {
          // ignore
        }
        try {
          cleanupSignalingListeners();
        } catch {
          // ignore
        }
        try {
          closeBroadcaster();
        } catch {
          // ignore
        }
      })();
    };
  }, [cleanupSignalingListeners, session?.streamId, user?.uid]);

  const viewerCount = stream?.viewersCount ?? viewers.length;
  const likesCount = Number(stream?.engagementCount ?? 0);
  const giftsCount = Number(stream?.giftsCount ?? gifts.length ?? 0);

  const latestGift = gifts.length ? gifts[gifts.length - 1] : null;

  const renderViewer = ({ item }: { item: LiveStreamViewer }) => (
    <View style={styles.listRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{String(item.username || 'V').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {item.username || item.id}
        </Text>
        <Text style={styles.listSub} numberOfLines={1}>
          watching now
        </Text>
      </View>
    </View>
  );

  const renderGift = ({ item }: { item: LiveStreamGift }) => (
    <View style={styles.listRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{String(item.senderName || 'G').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {item.senderName || 'Someone'}
        </Text>
        <Text style={styles.listSub} numberOfLines={1}>
          sent {item.emoji || '🎁'} {item.label || 'Gift'}
        </Text>
      </View>
    </View>
  );

  return (
    <LinearGradient colors={[accentColor, '#020203']} style={StyleSheet.absoluteFill}>
      <View style={styles.root}>
        <StatusBar hidden />
        <Pressable style={styles.videoWrap} onPress={handleSurfaceTap}>
          {isHlsMode ? (
            <View style={styles.center}>
              <Text style={styles.centerTitle}>Cloudflare Live (HLS)</Text>
              <Text style={styles.centerText}>Publish from OBS (or any RTMPS encoder) using:</Text>
              <Text style={styles.monoLine}>RTMPS: {session?.rtmpsUrl ?? '—'}</Text>
              <Text style={styles.monoLine}>Stream Key: {session?.streamKey ?? '—'}</Text>
              <Text style={[styles.centerText, { marginTop: 10 }]}>Viewers watch:</Text>
              <Text style={styles.monoLine}>{session?.playbackHlsUrl ?? '—'}</Text>
            </View>
          ) : broadcasterStream ? (
            <RTCView streamURL={broadcasterStream.toURL()} style={styles.video} objectFit={videoFit} />
          ) : (
            <View style={styles.center}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.centerText}>{starting ? 'Going live…' : 'Preparing…'}</Text>
            </View>
          )}

          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: heartPos.x - 48,
              top: heartPos.y - 48,
              width: 96,
              height: 96,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: heartOpacity,
              transform: [{ scale: heartScale }],
            }}
          >
            <Ionicons name="heart" size={92} color="#ff2d55" />
          </Animated.View>

          {overlayVisible && (
            <>
              <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={styles.topShade} />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)']}
                style={styles.bottomShade}
              />

              <View style={[styles.topBar, { top: insets.top + 10 }]}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => endAndExit()} activeOpacity={0.85}>
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>

                <View style={styles.pill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.pillText}>LIVE</Text>
                  <View style={styles.pillDivider} />
                  <Ionicons name="eye" size={14} color="#fff" />
                  <Text style={styles.pillText}>{Math.max(0, viewerCount)}</Text>
                </View>

                <TouchableOpacity style={styles.iconBtn} onPress={shareLive} activeOpacity={0.85}>
                  <Ionicons name="share-social" size={18} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={[styles.rightControls, { bottom: insets.bottom + 110 }]}>
                <TouchableOpacity style={styles.controlButton} onPress={() => setViewersVisible(true)} activeOpacity={0.85}>
                  <Ionicons name="people" size={28} color="#fff" />
                  <Text style={styles.controlLabel}>{Math.max(0, viewerCount)}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.controlButton} onPress={() => setGiftsVisible(true)} activeOpacity={0.85}>
                  <Ionicons name="gift" size={28} color="#fff" />
                  <Text style={styles.controlLabel}>{Math.max(0, giftsCount)}</Text>
                </TouchableOpacity>

                {!isHlsMode ? (
                  <>
                    <TouchableOpacity style={styles.controlButton} onPress={toggleMic} activeOpacity={0.85}>
                      <Ionicons name={micOn ? 'mic' : 'mic-off'} size={28} color="#fff" />
                      <Text style={styles.controlLabel}>{micOn ? 'Mic' : 'Muted'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.controlButton} onPress={toggleCamera} activeOpacity={0.85}>
                      <Ionicons name={cameraOn ? 'videocam' : 'videocam-off'} size={28} color="#fff" />
                      <Text style={styles.controlLabel}>{cameraOn ? 'Cam' : 'Off'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.controlButton} onPress={flipCamera} activeOpacity={0.85}>
                      <Ionicons name="camera-reverse" size={28} color="#fff" />
                      <Text style={styles.controlLabel}>{cameraFront ? 'Front' : 'Back'}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}

                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={() => setVideoFit((v) => (v === 'cover' ? 'contain' : 'cover'))}
                  activeOpacity={0.85}
                >
                  <Ionicons name={videoFit === 'cover' ? 'contract' : 'expand'} size={28} color="#fff" />
                  <Text style={styles.controlLabel}>{videoFit === 'cover' ? 'Fit' : 'Fill'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.controlButton} onPress={() => setOverlayVisible(false)} activeOpacity={0.85}>
                  <Ionicons name="eye-off" size={28} color="#fff" />
                  <Text style={styles.controlLabel}>Hide</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.bottomLeftInfo, { bottom: insets.bottom + 22 }]}>
                <Text style={styles.title} numberOfLines={2}>
                  {title}
                </Text>
                <Text style={styles.subText} numberOfLines={1}>
                  {likesCount} likes · {giftsCount} gifts
                </Text>

                {latestGift ? (
                  <View style={styles.toastPill}>
                    <Text style={styles.toastText} numberOfLines={1}>
                      {latestGift.senderName || 'Someone'} sent {latestGift.emoji || '🎁'} {latestGift.label || 'Gift'}
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          )}

          {!started && (
            <View style={styles.countdownOverlay}>
              <Text style={styles.countdownTitle}>Going live</Text>
              <Text style={styles.countdownNumber}>
                {countdown > 0 ? countdown : starting ? '…' : ''}
              </Text>
              <TouchableOpacity style={styles.cancelCountdownBtn} onPress={() => router.replace('/social-feed/go-live')}>
                <Text style={styles.cancelCountdownText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>

        <Modal visible={viewersVisible} transparent animationType="fade" onRequestClose={() => setViewersVisible(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setViewersVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}> 
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{Math.max(0, viewerCount)} watching</Text>
              <TouchableOpacity onPress={() => setViewersVisible(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={viewers.filter((v) => v.id !== user?.uid)}
              keyExtractor={(v) => v.id}
              renderItem={renderViewer}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              contentContainerStyle={{ paddingVertical: 12 }}
            />
          </View>
        </Modal>

        <Modal visible={giftsVisible} transparent animationType="fade" onRequestClose={() => setGiftsVisible(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setGiftsVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}> 
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Gifts</Text>
              <TouchableOpacity onPress={() => setGiftsVisible(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={gifts.slice().reverse()}
              keyExtractor={(g) => g.id}
              renderItem={renderGift}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              contentContainerStyle={{ paddingVertical: 12 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No gifts yet.</Text>}
            />
          </View>
        </Modal>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 0,
  },
  videoWrap: {
    flex: 1,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  centerText: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '700',
  },
  centerTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
  },
  monoLine: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '800',
    fontSize: 12,
    paddingHorizontal: 18,
    textAlign: 'center',
  },
  topShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 130,
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 300,
  },
  topBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e50914',
  },
  pillText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },
  pillDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginHorizontal: 2,
  },
  rightControls: {
    position: 'absolute',
    right: 16,
    bottom: 110,
    alignItems: 'center',
    gap: 16,
  },
  controlButton: {
    alignItems: 'center',
    gap: 4,
  },
  controlLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomLeftInfo: {
    position: 'absolute',
    left: 16,
    right: 92,
    bottom: 22,
    gap: 8,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  subText: {
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '700',
    fontSize: 12,
  },
  toastPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  toastText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  countdownTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '900',
    fontSize: 16,
    marginBottom: 10,
  },
  countdownNumber: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 72,
    letterSpacing: 2,
  },
  cancelCountdownBtn: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  cancelCountdownText: {
    color: '#fff',
    fontWeight: '800',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: '70%',
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(6,6,10,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  avatarInitial: {
    color: '#fff',
    fontWeight: '900',
  },
  listTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  listSub: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    fontWeight: '700',
    fontSize: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    paddingVertical: 20,
    fontWeight: '700',
  },
});
