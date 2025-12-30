import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

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

const UPDATE_FEED_URL = (() => {
  const explicit = (process.env.EXPO_PUBLIC_APP_UPDATE_FEED_URL ?? '').trim();
  if (explicit) return explicit;

  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  if (supabaseUrl) return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/app-update`;

  return '';
})();

function parseVersionParts(version: string): number[] | null {
  const cleaned = version.trim().replace(/^v/i, '').split('-')[0];
  if (!cleaned) return null;
  const nums = cleaned.split('.').map((p) => Number(p));
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

export default function UpdateGate({ children }: Props) {
  const [prompt, setPrompt] = useState<UpdatePrompt | null>(null);
  const [busy, setBusy] = useState(false);

  const updatesEnabled = useMemo(() => {
    if (__DEV__) return false;
    return Updates.isEnabled;
  }, []);

  const checkInBackground = useCallback(async () => {
    try {
      if (updatesEnabled) {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          setPrompt({
            kind: 'expo',
            message: 'An update is available. Restart to apply it.',
          });
          return;
        }
      }

      if (UPDATE_FEED_URL) {
        const feed = await fetchJsonWithTimeout<RemoteUpdateFeed>(UPDATE_FEED_URL);
        const latest = (feed.latestVersion ?? '').trim();
        const local = (Constants.expoConfig?.version ?? '').trim();
        const mandatory = feed.mandatory !== false;
        const url = (feed.url ?? feed.androidUrl ?? feed.iosUrl ?? '').trim();

        if (!local) {
          throw new Error('Local app version missing');
        }

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
      }
    } catch {
      // Silent failure: don't block app entry; only show UI when an update is actually available.
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
