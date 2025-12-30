import type { ConfigContext, ExpoConfig } from '@expo/config';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import * as path from 'path';
import baseMobile from './app.json';
import baseTv from './movieflixtv/app.json';

const variant = (process.env.APP_VARIANT || process.env.EXPO_PUBLIC_APP_VARIANT || '').toLowerCase();
const baseExpoConfig = ((variant === 'tv' ? baseTv : baseMobile) as { expo: ExpoConfig }).expo;

// Prefer an EAS "File" env var (path), fallback to base64, fallback to local file if present.
function resolveGoogleServicesFile(): string | undefined {
  const fileEnvPath = process.env.GOOGLE_SERVICES_JSON;
  if (fileEnvPath && fs.existsSync(fileEnvPath)) {
    return fileEnvPath;
  }

  const base64 = process.env.GOOGLE_SERVICES_JSON_BASE64;
  const targetPath = path.resolve(__dirname, 'google-services.json');

  if (base64) {
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      fs.writeFileSync(targetPath, decoded, 'utf-8');
      return targetPath;
    } catch (e) {
      console.warn('Failed to decode GOOGLE_SERVICES_JSON_BASE64:', e);
    }
  }

  if (fs.existsSync(targetPath)) {
    return targetPath;
  }

  return undefined;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appIdFromEnv = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? '';
  const tokenEndpointFromEnv = process.env.EXPO_PUBLIC_AGORA_TOKEN_ENDPOINT ?? '';

  const googleServicesFile = resolveGoogleServicesFile();

  const androidConfig: ExpoConfig['android'] = {
    ...(config.android ?? {}),
    ...(baseExpoConfig.android ?? {}),
  };

  if (googleServicesFile) {
    androidConfig.googleServicesFile = googleServicesFile;
  } else {
    delete (androidConfig as { googleServicesFile?: string }).googleServicesFile;
    console.warn(
      'google-services.json not found. Set an EAS File env var GOOGLE_SERVICES_JSON (recommended) or GOOGLE_SERVICES_JSON_BASE64 to enable Firebase on Android builds.'
    );
  }

  // We just reuse whatever plugins are defined in app.json.
  // No Agora config plugin here, since it does not exist on npm.
  const mergedPlugins = [
    ...(baseExpoConfig.plugins ?? []),
    // If in future you add a real Agora config plugin, you can push it here.
  ];

  return {
    ...config,
    ...baseExpoConfig,
    android: androidConfig,
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
