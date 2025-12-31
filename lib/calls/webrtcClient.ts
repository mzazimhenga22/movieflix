import {
  MediaStream,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import type { CallType } from './types';

const configuration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302',
    },
    {
      urls: 'stun:stun1.l.google.com:19302',
    },
  ],
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
  const devices = await mediaDevices.enumerateDevices() as any[];

  const facing = isFront ? 'front' : 'environment';
  const videoSourceId = devices.find((device: any) => device.kind === 'videoinput' && device.facing === facing);
  const facingMode = isFront ? 'user' : 'environment';
  const constraints = {
    audio: true,
    video: callType === 'video' ? {
      mandatory: {
        minWidth: 500,
        minHeight: 300,
        minFrameRate: 30,
      },
      facingMode,
      optional: videoSourceId ? [{ sourceId: videoSourceId }] : [],
    } : false,
  };

  const newStream = await mediaDevices.getUserMedia(constraints);
  localStream = newStream;

  newStream.getTracks().forEach((track: any) => {
    peerConnection?.addTrack(track, newStream);
  });

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
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return audioTrack.enabled;
    }
  }
  return false;
};

export const toggleVideo = () => {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return videoTrack.enabled;
    }
  }
  return false;
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
