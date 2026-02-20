import type { ConfigContext, ExpoConfig } from '@expo/config';
import { AndroidConfig, ConfigPlugin, withAndroidManifest } from '@expo/config-plugins';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import * as path from 'path';
import baseMobile from './app.json';

const withAndroidPiP: ConfigPlugin = (config) =>
  withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    mainActivity.$['android:supportsPictureInPicture'] = 'true';
    mainActivity.$['android:resizeableActivity'] = 'true';
    // mainActivity.$['android:autoEnterEnabled'] = 'true';
    return config;
  });

const variant = (process.env.APP_VARIANT || process.env.EXPO_PUBLIC_APP_VARIANT || '').toLowerCase();

function resolveBaseExpoConfig(): ExpoConfig {
  if (variant === 'tv') {
    try {
      // Optional: TV is a standalone app and may be excluded from EAS uploads.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const baseTv = require('./movieflixtv/app.json') as { expo: ExpoConfig };
      return baseTv.expo;
    } catch (e) {
      console.warn('APP_VARIANT=tv but movieflixtv/app.json is unavailable; falling back to mobile config.', e);
    }
  }

  return (baseMobile as { expo: ExpoConfig }).expo;
}

const baseExpoConfig = resolveBaseExpoConfig();

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
  // We just reuse whatever plugins are defined in app.json, filtering out the string reference
  // to the local plugin since we will apply the inline function manually.
  const mergedPlugins = (baseExpoConfig.plugins ?? []).filter((p) => p !== './plugins/withAndroidPiP');

  const finalConfig: ExpoConfig = {
    ...config,
    ...baseExpoConfig,
    android: androidConfig,
    plugins: mergedPlugins,
    extra: {
      ...(baseExpoConfig.extra ?? {}),
      ...(config.extra ?? {}),
    },
  };

  // Apply the inline plugin function directly
  return withAndroidPiP(finalConfig);
};
