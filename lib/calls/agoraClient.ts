// Agora-based calling has been removed.
// This file remains as a stub to prevent build/typecheck issues if legacy code still imports it.

export type CallType = 'voice' | 'video';

export const getAgoraEngine = async (_mode: CallType): Promise<never> => {
  throw new Error('Agora is not supported in this app build.');
};

export const destroyAgoraEngine = async (): Promise<void> => {
  // no-op
};
