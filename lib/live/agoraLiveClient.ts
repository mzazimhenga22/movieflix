// Agora-based live streaming has been removed.
// This file remains as a stub to prevent build/typecheck issues if legacy code still imports it.

export type LiveEngineRole = 'broadcaster' | 'audience';

export const getLiveEngine = async (_role: LiveEngineRole = 'audience'): Promise<never> => {
  throw new Error('Agora live engine is not supported in this app build.');
};

export const destroyLiveEngine = async (): Promise<void> => {
  // no-op
};
