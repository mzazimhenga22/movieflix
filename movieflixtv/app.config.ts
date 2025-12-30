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
  const fileEnvPath = process.env.GOOGLE_SERVICES_JSON;
  if (fileEnvPath && fs.existsSync(fileEnvPath)) {
    if (targetPackageName && !googleServicesContainsPackage(fileEnvPath, targetPackageName)) {
      console.warn(
        `GOOGLE_SERVICES_JSON does not contain a client for package "${targetPackageName}". Skipping ${fileEnvPath}.`
      );
    } else {
      return fileEnvPath;
    }
  }

  const base64 = process.env.GOOGLE_SERVICES_JSON_BASE64;
  const targetPath = path.resolve(__dirname, 'google-services.json');

  if (base64) {
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      fs.writeFileSync(targetPath, decoded, 'utf-8');
      if (targetPackageName && !googleServicesContainsPackage(targetPath, targetPackageName)) {
        fs.unlinkSync(targetPath);
        console.warn(
          `GOOGLE_SERVICES_JSON_BASE64 does not contain a client for package "${targetPackageName}". Ignoring decoded file.`
        );
      } else {
        return targetPath;
      }
    } catch (e) {
      console.warn('Failed to decode GOOGLE_SERVICES_JSON_BASE64:', e);
    }
  }

  if (fs.existsSync(targetPath)) {
    if (targetPackageName && !googleServicesContainsPackage(targetPath, targetPackageName)) {
      console.warn(
        `google-services.json exists at ${targetPath} but does not contain a client for package "${targetPackageName}". Ignoring it.`
      );
    } else {
      return targetPath;
    }
  }

  // Fallback to repo-root google-services.json (useful for local dev)
  const repoRootFallback = path.resolve(__dirname, '..', 'google-services.json');
  if (fs.existsSync(repoRootFallback)) {
    if (targetPackageName && !googleServicesContainsPackage(repoRootFallback, targetPackageName)) {
      console.warn(
        `Repo-root google-services.json does not contain a client for package "${targetPackageName}". Not using it for MovieFlix TV.`
      );
    } else {
      return repoRootFallback;
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
    console.warn(
      'google-services.json not found for MovieFlix TV. Set GOOGLE_SERVICES_JSON (File env var) or GOOGLE_SERVICES_JSON_BASE64 to enable Firebase on Android builds.'
    );
  }

  return {
    ...config,
    ...baseExpoConfig,
    android: androidConfig,
    plugins: [...(baseExpoConfig.plugins ?? [])],
  };
};
