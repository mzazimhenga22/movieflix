import type { ConfigContext, ExpoConfig } from '@expo/config';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import * as path from 'path';
import base from './app.json';

const baseExpoConfig = (base as { expo: ExpoConfig }).expo;

function googleServicesContainsPackage(filePath: string, packageName: string): boolean {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(raw) as {
      client?: Array<{
        client_info?: {
          android_client_info?: {
            package_name?: string;
          };
        };
      }>;
    };

    return (
      Array.isArray(json.client) &&
      json.client.some(
        c => c?.client_info?.android_client_info?.package_name === packageName
      )
    );
  } catch {
    return false;
  }
}

function resolveGoogleServicesFile(targetPackageName?: string): string | undefined {
  // For the TV app, only accept TV-scoped env vars so a mobile google-services.json/base64
  // in the same shell (.env.local) doesn't get picked up and spam warnings.
  const fileEnvPath = process.env.GOOGLE_SERVICES_JSON_TV;
  if (fileEnvPath && fs.existsSync(fileEnvPath)) {
    if (targetPackageName && !googleServicesContainsPackage(fileEnvPath, targetPackageName)) {
      console.warn(
        `GOOGLE_SERVICES_JSON_TV does not contain a client for package "${targetPackageName}". Skipping ${fileEnvPath}.`
      );
    } else {
      return fileEnvPath;
    }
  }

  const base64 = process.env.GOOGLE_SERVICES_JSON_BASE64_TV;

  if (base64) {
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      // Write to a separate file so a generic/mobile base64 cannot clobber the local TV file.
      const decodedPath = path.resolve(__dirname, 'google-services.env.json');
      fs.writeFileSync(decodedPath, decoded, 'utf-8');
      if (targetPackageName && !googleServicesContainsPackage(decodedPath, targetPackageName)) {
        console.warn(
          `GOOGLE_SERVICES_JSON_BASE64_TV does not contain a client for package "${targetPackageName}". Ignoring decoded file.`
        );
      } else {
        return decodedPath;
      }
    } catch (e) {
      console.warn('Failed to decode GOOGLE_SERVICES_JSON_BASE64:', e);
    }
  }

  return undefined;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const androidConfig: ExpoConfig['android'] = {
    ...(config.android ?? {}),
    ...(baseExpoConfig.android ?? {}),
  };

  const googleServicesFile = resolveGoogleServicesFile(androidConfig.package);

  if (googleServicesFile) {
    androidConfig.googleServicesFile = googleServicesFile;
  } else {
    delete (androidConfig as { googleServicesFile?: string }).googleServicesFile;
  }

  return {
    ...config,
    ...baseExpoConfig,
    android: androidConfig,
    plugins: [...(baseExpoConfig.plugins ?? [])],
  };
};
