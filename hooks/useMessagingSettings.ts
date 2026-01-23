import { useEffect, useState } from 'react';
import {
  DEFAULT_MESSAGING_SETTINGS,
  loadMessagingSettings,
  saveMessagingSettings,
  subscribeMessagingSettings,
  type MessagingSettings,
} from '@/lib/messagingSettingsStore';

export const useMessagingSettings = () => {
  const [settings, setSettings] = useState<MessagingSettings>(DEFAULT_MESSAGING_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const next = await loadMessagingSettings();
        if (mounted) setSettings(next);
      } catch (err) {
        console.warn('[useMessagingSettings] Failed to load settings', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    const unsub = subscribeMessagingSettings((next) => {
      if (!mounted) return;
      setSettings(next);
    });

    return () => {
      mounted = false;
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, []);

  const updateSettings = async (newSettings: Partial<MessagingSettings>) => {
    try {
      const updated = { ...settings, ...newSettings };
      setSettings(updated);

      await saveMessagingSettings(updated);
    } catch (err) {
      console.warn('[useMessagingSettings] Failed to save settings', err);
    }
  };

  return {
    settings,
    isLoading,
    updateSettings,
  };
};
