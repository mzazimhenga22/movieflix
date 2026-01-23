import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  children: React.ReactNode;
};

type UpdatePrompt =
  | {
    kind: 'expo';
    message: string;
  }
  | {
    kind: 'remote';
    message: string;
    actionUrl?: string;
    actionLabel?: string;
    mandatory: boolean;
  };

type RemoteUpdateFeed = {
  latestVersion?: string;
  mandatory?: boolean;
  url?: string;
  androidUrl?: string;
  iosUrl?: string;
  message?: string;
};

type GitHubLatestRelease = {
  tag_name?: string;
  body?: string;
};

const DEFAULT_GITHUB_RELEASES_REPO = 'mzazimhenga22/movieflix';

const APK_LATEST_DOWNLOAD_URL = (() => {
  const explicit = (process.env.EXPO_PUBLIC_APK_DOWNLOAD_URL ?? '').trim();
  if (explicit) return explicit;

  const repo = (process.env.EXPO_PUBLIC_GITHUB_RELEASES_REPO ?? '').trim() || DEFAULT_GITHUB_RELEASES_REPO;
  // Stable URL that always points at the latest release asset with this name.
  return `https://github.com/${repo}/releases/latest/download/movieflix.apk`;
})();

const UPDATE_FEED_URL = (() => {
  const explicit = (process.env.EXPO_PUBLIC_APP_UPDATE_FEED_URL ?? '').trim();
  if (explicit) return explicit;

  return '';
})();

function parseVersionParts(version: string): number[] | null {
  const raw = version.trim().split('-')[0];
  if (!raw) return null;

  // Extract something like 1.0.1 from strings like: v1.0.1, v.1.01, release-1.2.3
  const match = raw.match(/\d+(?:\.\d+)*/);
  const cleaned = (match?.[0] ?? '').trim();
  if (!cleaned) return null;

  const parts = cleaned.split('.');

  // Heuristic for tags like "1.01" (often intended as 1.0.1)
  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && parts[1].length >= 2) {
    const major = Number(parts[0]);
    const minor = Number(parts[1].slice(0, 1));
    const patch = Number(parts[1].slice(1));
    if ([major, minor, patch].some((n) => Number.isNaN(n))) return null;
    return [major, minor, patch];
  }

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return nums;
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  if (!pa || !pb) return a === b ? 0 : a > b ? 1 : -1;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'cache-control': 'no-cache' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function fetchLatestGitHubRelease(repo: string): Promise<GitHubLatestRelease | null> {
  // Note: unauthenticated GitHub API is rate-limited, but per-user usage is usually fine.
  const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetchJsonWithTimeout<GitHubLatestRelease>(apiUrl);
  return res || null;
}

export default function UpdateGate({ children }: Props) {
  const [prompt, setPrompt] = useState<UpdatePrompt | null>(null);
  const [busy, setBusy] = useState(false);

  const updatesEnabled = useMemo(() => {
    if (__DEV__) return false;
    return Updates.isEnabled;
  }, []);

  const checkInBackground = useCallback(async () => {
    // 1. Check for Expo OTA updates (EAS Update)
    if (updatesEnabled) {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          setPrompt({
            kind: 'expo',
            message: 'An update is available. Restart to apply it.',
          });
          return;
        }
      } catch (e) {
        console.warn('[UpdateGate] Expo update check failed:', e);
        // Continue to check for native updates
      }
    }

    // 2. Check for Native/APK updates (GitHub or Feed)
    try {
      const local = (Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? '').trim();
      if (!local) {
        console.warn('[UpdateGate] Local app version missing');
        return;
      }

      // Back-compat: allow a custom JSON feed if explicitly configured.
      if (UPDATE_FEED_URL) {
        const feed = await fetchJsonWithTimeout<RemoteUpdateFeed>(UPDATE_FEED_URL);
        const latest = (feed.latestVersion ?? '').trim();
        const mandatory = feed.mandatory !== false;
        const url = (feed.url ?? feed.androidUrl ?? feed.iosUrl ?? '').trim();

        if (latest && compareVersions(latest, local) > 0) {
          setPrompt({
            kind: 'remote',
            message: feed.message || (mandatory ? 'An update is required to continue.' : 'An update is available.'),
            actionUrl: url || undefined,
            actionLabel: url ? (mandatory ? 'Update now' : 'Update') : undefined,
            mandatory,
          });
          return;
        }
      } else {
        const repo = (process.env.EXPO_PUBLIC_GITHUB_RELEASES_REPO ?? '').trim() || DEFAULT_GITHUB_RELEASES_REPO;
        const release = await fetchLatestGitHubRelease(repo);
        const latest = (release?.tag_name ?? '').trim();
        const body = (release?.body ?? '').toLowerCase();

        // Check for force update flags in release notes or local env
        const envMandatory = String(process.env.EXPO_PUBLIC_APP_UPDATE_MANDATORY ?? '').trim().toLowerCase() === 'true';
        const notesMandatory = body.includes('[mandatory]') || body.includes('[force-update]') || body.includes('force update');
        const mandatory = envMandatory || notesMandatory;

        const message = (process.env.EXPO_PUBLIC_APP_UPDATE_MESSAGE ?? '').trim();

        if (latest && compareVersions(latest, local) > 0) {
          setPrompt({
            kind: 'remote',
            message: message || (mandatory ? 'A critical update is required to continue.' : 'An update is available.'),
            actionUrl: APK_LATEST_DOWNLOAD_URL,
            actionLabel: mandatory ? 'Update now' : 'Update',
            mandatory,
          });
          return;
        }
      }
    } catch (e) {
      // Silent failure: don't block app entry; only show UI when an update is actually available.
      console.warn('[UpdateGate] Version check failed:', e);
    }
  }, [updatesEnabled]);

  useEffect(() => {
    void checkInBackground();
  }, [checkInBackground]);

  const handleApplyExpoUpdate = useCallback(async () => {
    try {
      setBusy(true);
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      setBusy(false);
    }
  }, []);

  const handleOpenRemoteUpdate = useCallback(async () => {
    if (!prompt || prompt.kind !== 'remote' || !prompt.actionUrl) return;
    try {
      await Linking.openURL(prompt.actionUrl);
    } catch {
      // ignore
    }
  }, [prompt]);

  const canDismiss = prompt?.kind === 'remote' ? !prompt.mandatory : true;

  return (
    <View style={styles.root}>
      {children}

      {prompt ? (
        <View style={styles.overlay} pointerEvents="auto">
          <View style={styles.card}>
            <Text style={styles.title}>Update available</Text>
            <Text style={styles.subtitle}>{prompt.message}</Text>

            <View style={styles.buttonRow}>
              {prompt.kind === 'expo' ? (
                <Pressable
                  onPress={() => void handleApplyExpoUpdate()}
                  disabled={busy}
                  style={[styles.button, busy && styles.buttonDisabled]}
                >
                  <Text style={styles.buttonText}>{busy ? 'Applying…' : 'Restart & update'}</Text>
                </Pressable>
              ) : prompt.actionUrl ? (
                <Pressable onPress={() => void handleOpenRemoteUpdate()} style={styles.button}>
                  <Text style={styles.buttonText}>{prompt.actionLabel ?? 'Update'}</Text>
                </Pressable>
              ) : null}

              {canDismiss ? (
                <Pressable onPress={() => setPrompt(null)} style={[styles.button, styles.buttonSecondary]}>
                  <Text style={styles.buttonText}>Not now</Text>
                </Pressable>
              ) : null}
            </View>

            {busy ? <ActivityIndicator color="#ffffff" /> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(14,14,14,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    gap: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#e50914',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
