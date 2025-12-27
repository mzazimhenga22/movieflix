import type { ConfigContext, ExpoConfig } from '@expo/config';
import * as fs from 'fs';
import * as path from 'path';
import base from './app.json';

const baseExpoConfig = (base as { expo: ExpoConfig }).expo;

// Decode base64 google-services.json from env and write to file if needed
function getGoogleServicesFile(): string {
  const base64 = process.env.GOOGLE_SERVICES_JSON_BASE64;
  const localFile = './google-services.json';
  
  if (base64) {
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      const targetPath = path.resolve(__dirname, localFile);
      fs.writeFileSync(targetPath, decoded, 'utf-8');
    } catch (e) {
      console.warn('Failed to decode GOOGLE_SERVICES_JSON_BASE64:', e);
    }
  }
  
  return localFile;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appIdFromEnv = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? '';
  const tokenEndpointFromEnv = process.env.EXPO_PUBLIC_AGORA_TOKEN_ENDPOINT ?? '';

  const googleServicesFile = getGoogleServicesFile();

  // We just reuse whatever plugins are defined in app.json.
  // No Agora config plugin here, since it does not exist on npm.
  const mergedPlugins = [
    ...(baseExpoConfig.plugins ?? []),
    // If in future you add a real Agora config plugin, you can push it here.
  ];

  return {
    ...config,
    ...baseExpoConfig,
    android: {
      ...baseExpoConfig.android,
      googleServicesFile,
    },
    plugins: mergedPlugins,
    extra: {
      ...(baseExpoConfig.extra ?? {}),
      ...(config.extra ?? {}),
      agora: {
        appId: appIdFromEnv,
        tokenEndpoint: tokenEndpointFromEnv,
      },
    },
  };
};
