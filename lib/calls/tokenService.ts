// Agora token fetching has been removed.

export type TokenResponse = {
  token: string;
  expireAt?: number;
};

export const requestAgoraToken = async (): Promise<never> => {
  throw new Error('Agora is not supported in this app build.');
};
