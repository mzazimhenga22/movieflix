// Re-export shared utilities from the standalone utils module (no circular dep).
export { GRAIN_PNG_BASE64, base64ToDataUri } from './engineerUtils';

// Re-export the overlay component. engineerOverlay.tsx now imports from engineerUtils.ts
// directly, so there is no longer a cycle between this file and engineerOverlay.tsx.
export { VideoMaskingOverlay } from './engineerOverlay';

