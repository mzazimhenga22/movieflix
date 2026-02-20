import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';

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

// For live streaming: broadcaster maintains 1 peer connection per viewer (P2P fan-out).
let broadcasterStream: any = null;
let broadcasterPeerConnections: Record<string, RTCPeerConnection> = {};

// For viewers: each viewer has its own peer connection.
let viewerPeerConnections: Record<string, RTCPeerConnection> = {};
let viewerStreams: Record<string, any> = {};

// Callback functions to be set by the live screens
let onIceCandidateCallback: ((args: { viewerId: string; candidate: RTCIceCandidate; from: 'host' | 'viewer' }) => void) | null = null;

export const setIceCandidateCallback = (callback: (args: { viewerId: string; candidate: RTCIceCandidate; from: 'host' | 'viewer' }) => void) => {
  onIceCandidateCallback = callback;
};

export const initializeBroadcaster = async (opts?: { isFront?: boolean }) => {
  try {
    const isFront = typeof opts?.isFront === 'boolean' ? opts.isFront : true;
    const facingMode = isFront ? 'user' : 'environment';

    const constraints = {
      audio: true,
      video: {
        width: { ideal: 720 },
        height: { ideal: 1280 },
        frameRate: { ideal: 30 },
        facingMode,
      },
    };

    console.log('Requesting user media with constraints:', constraints);
    const stream = await mediaDevices.getUserMedia(constraints);
    console.log('User media obtained, tracks:', stream.getTracks().length);

    broadcasterStream = stream;

    console.log('Broadcaster initialized successfully');
    return { peerConnection: null as any, stream };
  } catch (error) {
    console.error('Failed to initialize broadcaster:', error);
    // Cleanup on error
    Object.values(broadcasterPeerConnections).forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    broadcasterPeerConnections = {};
    if (broadcasterStream) {
      broadcasterStream.getTracks().forEach((track: any) => track.stop());
      broadcasterStream = null;
    }
    throw error;
  }
};

const ensureBroadcasterPeerConnection = async (viewerId: string): Promise<RTCPeerConnection> => {
  if (!broadcasterStream) throw new Error('Broadcaster not initialized');

  const existing = broadcasterPeerConnections[viewerId];
  if (existing && (existing as any).connectionState !== 'closed') return existing;

  const pc = new RTCPeerConnection(configuration);
  broadcasterPeerConnections[viewerId] = pc;

  (pc as any).onicecandidate = (event: any) => {
    if (event?.candidate && onIceCandidateCallback) {
      onIceCandidateCallback({ viewerId, candidate: event.candidate, from: 'host' });
    }
  };

  // Add tracks (fan-out)
  broadcasterStream.getTracks().forEach((track: any) => {
    pc.addTrack(track, broadcasterStream);
  });

  return pc;
};

export const createBroadcastOffer = async (viewerId: string) => {
  const pc = await ensureBroadcasterPeerConnection(viewerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
};

export const initializeViewer = async (viewerId: string) => {
  const peerConnection = new RTCPeerConnection(configuration);
  viewerPeerConnections[viewerId] = peerConnection;

  (peerConnection as any).onicecandidate = (event: any) => {
    if (event?.candidate && onIceCandidateCallback) {
      onIceCandidateCallback({ viewerId, candidate: event.candidate, from: 'viewer' });
    }
  };

  // RN-webrtc may use either ontrack or onaddstream.
  (peerConnection as any).ontrack = (event: any) => {
    const stream = event?.streams?.[0];
    if (stream) viewerStreams[viewerId] = stream;
  };
  (peerConnection as any).onaddstream = (event: any) => {
    if (event?.stream) viewerStreams[viewerId] = event.stream;
  };

  return peerConnection;
};

export const createViewerAnswer = async (viewerId: string, offer: RTCSessionDescription) => {
  const peerConnection = viewerPeerConnections[viewerId];
  if (!peerConnection) throw new Error('Viewer not initialized');

  await peerConnection.setRemoteDescription(offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  return answer;
};

export const handleViewerAnswer = async (viewerId: string, answer: RTCSessionDescription) => {
  const pc = broadcasterPeerConnections[viewerId];
  if (!pc || (pc as any).connectionState === 'closed') throw new Error('Broadcaster not initialized');
  await pc.setRemoteDescription(answer);
};

export const addIceCandidateToBroadcaster = async (viewerId: string, candidate: RTCIceCandidate) => {
  const pc = broadcasterPeerConnections[viewerId];
  if (!pc || (pc as any).connectionState === 'closed') throw new Error('Broadcaster not initialized');
  await pc.addIceCandidate(candidate);
};

export const addIceCandidateToViewer = async (viewerId: string, candidate: RTCIceCandidate) => {
  const peerConnection = viewerPeerConnections[viewerId];
  if (!peerConnection) throw new Error('Viewer not initialized');

  await peerConnection.addIceCandidate(candidate);
};

export const getBroadcasterStream = () => broadcasterStream;
export const getViewerStream = (viewerId: string) => viewerStreams[viewerId];

export const closeBroadcaster = () => {
  Object.values(broadcasterPeerConnections).forEach((pc) => {
    try {
      pc.close();
    } catch {}
  });
  broadcasterPeerConnections = {};
  if (broadcasterStream) {
    broadcasterStream.getTracks().forEach((track: any) => track.stop());
    broadcasterStream = null;
  }
};

export const closeViewer = (viewerId: string) => {
  const peerConnection = viewerPeerConnections[viewerId];
  if (peerConnection) {
    peerConnection.close();
    delete viewerPeerConnections[viewerId];
  }
  delete viewerStreams[viewerId];
};

export const closeAllConnections = () => {
  closeBroadcaster();
  Object.keys(viewerPeerConnections).forEach(closeViewer);
};
