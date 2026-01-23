// Agora support has been removed from the app.
// These exports remain only to avoid breaking legacy imports.

export const AGORA_APP_ID = '';
export const AGORA_TOKEN_ENDPOINT = '';
export const AGORA_APP_CERTIFICATE = '';
export const AGORA_TOKEN_DURATION_SECONDS = 3600;

export const assertAgoraConfigured = (): never => {
  throw new Error('Agora is not supported in this app build.');
};
