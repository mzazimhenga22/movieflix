import {
  MediaStream,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import type { CallType } from './types';

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const DEFAULT_ICE_SERVERS: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const readEnvString = (key: string): string => {
  try {
    const v = (typeof process !== 'undefined' && (process.env as any)?.[key]) || '';
    return String(v ?? '').trim();
  } catch {
    return '';
  }
};

const safeParseIceServers = (raw: string): IceServer[] | null => {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return null;
    const servers: IceServer[] = [];
    for (const s of parsed) {
      if (!s || typeof s !== 'object') continue;
      const urls = (s as any).urls;
      if (typeof urls !== 'string' && !Array.isArray(urls)) continue;
      const out: IceServer = { urls };
      if (typeof (s as any).username === 'string') out.username = (s as any).username;
      if (typeof (s as any).credential === 'string') out.credential = (s as any).credential;
      servers.push(out);
    }
    return servers.length ? servers : null;
  } catch {
    return null;
  }
};

const getIceServers = (): IceServer[] => {
  // Optional override for production: include TURN servers to support symmetric NAT / carrier-grade NAT.
  // Expected value example:
  // EXPO_PUBLIC_WEBRTC_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]'
  const env = readEnvString('EXPO_PUBLIC_WEBRTC_ICE_SERVERS');
  const parsed = safeParseIceServers(env);
  return parsed ?? DEFAULT_ICE_SERVERS;
};

const configuration = {
  iceServers: getIceServers() as any,
  iceCandidatePoolSize: 4,
};

let peerConnection: RTCPeerConnection | null = null;
let localStream: any = null;
let remoteStream: any = null;
let remoteDescriptionSet = false;
let iceCandidateBuffer: RTCIceCandidate[] = [];

export const initializeWebRTC = async (callType: CallType) => {
  peerConnection = new RTCPeerConnection(configuration);
  remoteDescriptionSet = false;
  iceCandidateBuffer = [];

  const isFront = true;
  const devices = (await mediaDevices.enumerateDevices()) as any[];

  const desiredFacing = isFront ? 'front' : 'environment';
  const facingMode = isFront ? 'user' : 'environment';
  const preferredVideoDevice = devices.find((device: any) => {
    if (device?.kind !== 'videoinput') return false;
    const deviceFacing = (device?.facing ?? device?.facingMode ?? '').toLowerCase();
    if (deviceFacing === desiredFacing) return true;
    const label = String(device?.label ?? '').toLowerCase();
    if (isFront && label.includes('front')) return true;
    if (!isFront && (label.includes('back') || label.includes('rear'))) return true;
    return false;
  });
  const preferredSourceId: string | undefined =
    preferredVideoDevice?.deviceId ?? preferredVideoDevice?.id ?? undefined;

  const constraints: any = {
    audio: true,
    video:
      callType === 'video'
        ? {
            // Prefer conservative defaults for low-end devices / poor networks.
            width: { ideal: 480, max: 640 },
            height: { ideal: 270, max: 360 },
            frameRate: { ideal: 15, max: 20 },
            facingMode,
            optional: preferredSourceId ? [{ sourceId: preferredSourceId }] : [],
          }
        : false,
  };

  let newStream: any;
  try {
    newStream = await mediaDevices.getUserMedia(constraints);
  } catch (err) {
    if (callType !== 'video') throw err;
    // Fallback: some devices reject "mandatory" constraints.
    newStream = await mediaDevices.getUserMedia({ audio: true, video: { facingMode } } as any);
  }
  localStream = newStream;

  newStream.getTracks().forEach((track: any) => {
    peerConnection?.addTrack(track, newStream);
  });

  // Apply sender constraints (bitrate/fps caps) to avoid saturating weak networks.
  try {
    const pc: any = peerConnection;
    const senders = typeof pc?.getSenders === 'function' ? pc.getSenders() : [];
    const videoSender = Array.isArray(senders) ? senders.find((s: any) => s?.track?.kind === 'video') : null;
    if (callType === 'video' && videoSender && typeof videoSender.getParameters === 'function') {
      const params = videoSender.getParameters();
      if (!params.encodings || !Array.isArray(params.encodings) || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0] = {
        ...params.encodings[0],
        maxBitrate: 250_000,
        maxFramerate: 15,
      };
      if (typeof videoSender.setParameters === 'function') {
        await videoSender.setParameters(params);
      }
    }
  } catch {
    // ignore
  }

  // Set up event handlers
  (peerConnection as any).onicecandidate = (event: any) => {
    if (event.candidate && onIceCandidateCallback) {
      onIceCandidateCallback(event.candidate);
    }
  };

  // react-native-webrtc >= 106 prefers `ontrack` when using `addTrack`.
  // Keep `onaddstream` as a fallback for older behavior.
  (peerConnection as any).ontrack = (event: any) => {
    const stream: MediaStream | undefined = event?.streams?.[0];

    if (stream) {
      remoteStream = stream;
      onRemoteStreamCallback?.(stream);
      return;
    }

    // Some platforms may not populate `event.streams` for audio-only;
    // build a MediaStream from tracks.
    const track = event?.track;
    if (!track) return;
    if (!remoteStream) remoteStream = new MediaStream();
    try {
      (remoteStream as any).addTrack(track);
      onRemoteStreamCallback?.(remoteStream);
    } catch {
      // ignore
    }
  };

  (peerConnection as any).onaddstream = (event: any) => {
    const stream = event?.stream;
    if (!stream) return;
    remoteStream = stream;
    onRemoteStreamCallback?.(stream);
  };

  return { peerConnection, localStream };
};

// Callback functions to be set by the call screen
let onIceCandidateCallback: ((candidate: any) => void) | null = null;
let onRemoteStreamCallback: ((stream: any) => void) | null = null;

export const setIceCandidateCallback = (callback: (candidate: any) => void) => {
  onIceCandidateCallback = callback;
};

export const setRemoteStreamCallback = (callback: (stream: any) => void) => {
  onRemoteStreamCallback = callback;
};

export const createOffer = async () => {
  if (!peerConnection) throw new Error('Peer connection not initialized');

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  return offer;
};

export const createOfferWithOptions = async (options: any) => {
  if (!peerConnection) throw new Error('Peer connection not initialized');
  const offer = await (peerConnection as any).createOffer(options);
  await peerConnection.setLocalDescription(offer);
  return offer;
};

export const createAnswer = async () => {
  if (!peerConnection) throw new Error('Peer connection not initialized');

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  return answer;
};

export const setRemoteDescription = async (description: RTCSessionDescription) => {
  if (!peerConnection) throw new Error('Peer connection not initialized');

  await peerConnection.setRemoteDescription(description);
  remoteDescriptionSet = true;

  // Process buffered ICE candidates
  while (iceCandidateBuffer.length > 0) {
    const candidate = iceCandidateBuffer.shift();
    if (candidate) {
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch (err) {
        console.warn('Failed to add buffered ICE candidate', err);
      }
    }
  }
};

export const addIceCandidate = async (candidate: RTCIceCandidate) => {
  if (!peerConnection) throw new Error('Peer connection not initialized');

  if (!remoteDescriptionSet) {
    // Buffer the candidate until remote description is set
    iceCandidateBuffer.push(candidate);
    return;
  }

  await peerConnection.addIceCandidate(candidate);
};

export const getPeerConnection = () => peerConnection;
export const getLocalStream = () => localStream;
export const getRemoteStream = () => remoteStream;

export const closeConnection = () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((track: any) => track.stop());
    localStream = null;
  }
  remoteStream = null;
  remoteDescriptionSet = false;
  iceCandidateBuffer = [];
};

export const toggleAudio = () => {
  if (!localStream) return null;
  const audioTrack = localStream.getAudioTracks?.()[0];
  if (!audioTrack) return null;
  audioTrack.enabled = !audioTrack.enabled;
  return { enabled: Boolean(audioTrack.enabled) };
};

export const toggleVideo = () => {
  if (!localStream) return null;
  const videoTrack = localStream.getVideoTracks?.()[0];
  if (!videoTrack) return null;
  videoTrack.enabled = !videoTrack.enabled;
  return { enabled: Boolean(videoTrack.enabled) };
};

export const switchCamera = async () => {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      const newConstraints = {
        ...videoTrack.getConstraints(),
        facingMode: videoTrack.getSettings().facingMode === 'user' ? 'environment' : 'user',
      };
      const newStream = await mediaDevices.getUserMedia({
        audio: true,
        video: newConstraints,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const sender = peerConnection?.getSenders().find((s: any) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }
      localStream.removeTrack(videoTrack);
      videoTrack.stop();
      localStream.addTrack(newVideoTrack);
    }
  }
};
