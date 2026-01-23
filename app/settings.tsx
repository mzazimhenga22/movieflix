// app/settings.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import ScreenWrapper from '@/components/ScreenWrapper';
import { getFlixySettings, setFlixySettings, type FlixySettings } from '@/lib/flixySettings';
import { getProfileScopedKey, getStoredActiveProfile } from '@/lib/profileStorage';
import { Ionicons } from '@expo/vector-icons';

type MovieSettings = {
  proxyStreams: boolean;
  preferEnglishAudio: boolean;
  autoEnableCaptions: boolean;
  autoLowerQualityOnBuffer: boolean;
  autoSwitchSourceOnBuffer: boolean;
};

type SocialSettings = {
  autoPlayReels: boolean;
  autoPlayFeedVideos: boolean;
  hideSpoilers: boolean;
};

const DEFAULT_MOVIE_SETTINGS: MovieSettings = {
  proxyStreams: false,
  preferEnglishAudio: true,
  autoEnableCaptions: true,
  autoLowerQualityOnBuffer: true,
  autoSwitchSourceOnBuffer: false,
};

const DEFAULT_SOCIAL_SETTINGS: SocialSettings = {
  autoPlayReels: true,
  autoPlayFeedVideos: true,
  hideSpoilers: true,
};

async function readBool(baseKey: string, fallback: boolean): Promise<boolean> {
  try {
    const key = await getProfileScopedKey(baseKey);
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'boolean' ? parsed : fallback;
    } catch {
      return raw === 'true' ? true : raw === 'false' ? false : fallback;
    }
  } catch {
    return fallback;
  }
}

async function writeBool(baseKey: string, value: boolean): Promise<void> {
  const key = await getProfileScopedKey(baseKey);
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

const SettingsScreen: React.FC = () => {
  const router = useRouter();
  const [profileName, setProfileName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [movieSettings, setMovieSettings] = useState<MovieSettings>(DEFAULT_MOVIE_SETTINGS);
  const [socialSettings, setSocialSettings] = useState<SocialSettings>(DEFAULT_SOCIAL_SETTINGS);
  const [flixySettings, setFlixySettingsState] = useState<FlixySettings>({
    assistantEnabled: true,
    voiceEnabled: true,
    autoShowTips: true,
  });
  const [open, setOpen] = useState<{ movies: boolean; social: boolean; flixy: boolean }>({ movies: true, social: false, flixy: false });

  const movieRows = useMemo(
    () => [
      {
        key: 'preferEnglishAudio' as const,
        title: 'Prefer English audio',
        subtitle: 'When multiple audio tracks exist, choose English first.',
      },
      {
        key: 'autoEnableCaptions' as const,
        title: 'Auto-enable captions',
        subtitle: 'Automatically turn on captions (prefers English when available).',
      },
      {
        key: 'autoLowerQualityOnBuffer' as const,
        title: 'Reduce quality when buffering',
        subtitle: 'If the stream offers multiple variants, drop to a lower one when buffering.',
      },
      {
        key: 'autoSwitchSourceOnBuffer' as const,
        title: 'Switch source when buffering',
        subtitle: 'If buffering persists, try a different provider automatically.',
      },
      {
        key: 'proxyStreams' as const,
        title: 'Proxy streams (advanced)',
        subtitle: 'Can help with CORS/hotlinking but may break streams if proxy is blocked.',
      },
    ],
    [],
  );

  const socialRows = useMemo(
    () => [
      {
        key: 'autoPlayReels' as const,
        title: 'Auto-play reels',
        subtitle: 'Automatically play videos in Reels screens.',
      },
      {
        key: 'autoPlayFeedVideos' as const,
        title: 'Auto-play feed videos',
        subtitle: 'Automatically play videos while scrolling the Social Feed timeline.',
      },
      {
        key: 'hideSpoilers' as const,
        title: 'Hide spoilers',
        subtitle: 'Show a “tap to reveal” spoiler pill for spoiler comments.',
      },
    ],
    [],
  );

  const flixyRows = useMemo(
    () => [
      {
        key: 'assistantEnabled' as const,
        title: 'Show Flixy assistant',
        subtitle: 'Display Flixy helper on screens with tips and suggestions.',
        icon: 'sparkles',
      },
      {
        key: 'voiceEnabled' as const,
        title: 'Voice activation',
        subtitle: 'Enable "Hey Flixy" voice commands.',
        icon: 'mic',
      },
      {
        key: 'autoShowTips' as const,
        title: 'Auto-show tips',
        subtitle: 'Flixy automatically shows tips as you navigate.',
        icon: 'bulb',
      },
    ],
    [],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await getStoredActiveProfile();
      setProfileName((profile?.name || '').trim());

      const nextMovie: MovieSettings = {
        proxyStreams: await readBool('movieSettings:proxyStreams', DEFAULT_MOVIE_SETTINGS.proxyStreams),
        preferEnglishAudio: await readBool(
          'movieSettings:preferEnglishAudio',
          DEFAULT_MOVIE_SETTINGS.preferEnglishAudio,
        ),
        autoEnableCaptions: await readBool(
          'movieSettings:autoEnableCaptions',
          DEFAULT_MOVIE_SETTINGS.autoEnableCaptions,
        ),
        autoLowerQualityOnBuffer: await readBool(
          'movieSettings:autoLowerQualityOnBuffer',
          DEFAULT_MOVIE_SETTINGS.autoLowerQualityOnBuffer,
        ),
        autoSwitchSourceOnBuffer: await readBool(
          'movieSettings:autoSwitchSourceOnBuffer',
          DEFAULT_MOVIE_SETTINGS.autoSwitchSourceOnBuffer,
        ),
      };

      const nextSocial: SocialSettings = {
        autoPlayReels: await readBool('socialSettings:autoPlayReels', DEFAULT_SOCIAL_SETTINGS.autoPlayReels),
        autoPlayFeedVideos: await readBool(
          'socialSettings:autoPlayFeedVideos',
          DEFAULT_SOCIAL_SETTINGS.autoPlayFeedVideos,
        ),
        hideSpoilers: await readBool('socialSettings:hideSpoilers', DEFAULT_SOCIAL_SETTINGS.hideSpoilers),
      };

      setMovieSettings(nextMovie);
      setSocialSettings(nextSocial);

      // Load Flixy settings
      const flixy = await getFlixySettings();
      setFlixySettingsState(flixy);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const setMovieOne = useCallback(async <K extends keyof MovieSettings>(key: K, value: MovieSettings[K]) => {
    setMovieSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await writeBool(`movieSettings:${String(key)}`, Boolean(value));
    } catch (err) {
      console.warn('Failed to persist setting', key, err);
    }
  }, []);

  const setSocialOne = useCallback(async <K extends keyof SocialSettings>(key: K, value: SocialSettings[K]) => {
    setSocialSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await writeBool(`socialSettings:${String(key)}`, Boolean(value));
    } catch (err) {
      console.warn('Failed to persist setting', key, err);
    }
  }, []);

  const resetMovieDefaults = useCallback(async () => {
    try {
      await Promise.all([
        writeBool('movieSettings:proxyStreams', DEFAULT_MOVIE_SETTINGS.proxyStreams),
        writeBool('movieSettings:preferEnglishAudio', DEFAULT_MOVIE_SETTINGS.preferEnglishAudio),
        writeBool('movieSettings:autoEnableCaptions', DEFAULT_MOVIE_SETTINGS.autoEnableCaptions),
        writeBool('movieSettings:autoLowerQualityOnBuffer', DEFAULT_MOVIE_SETTINGS.autoLowerQualityOnBuffer),
        writeBool('movieSettings:autoSwitchSourceOnBuffer', DEFAULT_MOVIE_SETTINGS.autoSwitchSourceOnBuffer),
      ]);
      setMovieSettings(DEFAULT_MOVIE_SETTINGS);
    } catch (err) {
      console.warn('Failed to reset settings', err);
      Alert.alert('Error', 'Failed to reset settings.');
    }
  }, []);

  const resetSocialDefaults = useCallback(async () => {
    try {
      await Promise.all([
        writeBool('socialSettings:autoPlayReels', DEFAULT_SOCIAL_SETTINGS.autoPlayReels),
        writeBool('socialSettings:autoPlayFeedVideos', DEFAULT_SOCIAL_SETTINGS.autoPlayFeedVideos),
        writeBool('socialSettings:hideSpoilers', DEFAULT_SOCIAL_SETTINGS.hideSpoilers),
      ]);
      setSocialSettings(DEFAULT_SOCIAL_SETTINGS);
    } catch (err) {
      console.warn('Failed to reset social settings', err);
      Alert.alert('Error', 'Failed to reset social settings.');
    }
  }, []);

  const setFlixyOne = useCallback(async <K extends keyof FlixySettings>(key: K, value: FlixySettings[K]) => {
    setFlixySettingsState((prev) => ({ ...prev, [key]: value }));
    try {
      await setFlixySettings({ [key]: value });
    } catch (err) {
      console.warn('Failed to persist Flixy setting', key, err);
    }
  }, []);

  const resetFlixyDefaults = useCallback(async () => {
    try {
      await setFlixySettings({
        assistantEnabled: true,
        voiceEnabled: true,
        autoShowTips: true,
      });
      setFlixySettingsState({
        assistantEnabled: true,
        voiceEnabled: true,
        autoShowTips: true,
      });
    } catch (err) {
      console.warn('Failed to reset Flixy settings', err);
      Alert.alert('Error', 'Failed to reset Flixy settings.');
    }
  }, []);

  const SectionCard = useCallback(
    ({
      title,
      subtitle,
      isOpen,
      onToggle,
      onReset,
      children,
    }: {
      title: string;
      subtitle?: string;
      isOpen: boolean;
      onToggle: () => void;
      onReset: () => void;
      children: React.ReactNode;
    }) => {
      return (
        <View style={styles.sectionCard}>
          <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.9}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sectionTitle}>{title}</Text>
              {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable
              style={styles.sectionReset}
              onPress={(e) => {
                e.stopPropagation?.();
                Alert.alert('Reset settings', `Reset ${title.toLowerCase()} settings to defaults?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Reset', style: 'destructive', onPress: onReset },
                ]);
              }}
            >
              <Ionicons name="refresh" size={16} color="#fff" />
            </Pressable>
            <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          {isOpen ? <View style={styles.sectionBody}>{children}</View> : null}
        </View>
      );
    },
    [],
  );

  return (
    <ScreenWrapper>
      <LinearGradient colors={['#0f0a1f', '#150a13', '#05060f']} start={[0, 0]} end={[1, 1]} style={styles.gradient} />

      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {profileName ? `Profile: ${profileName}` : 'Profile: Default'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={styles.loadingText}>Loading…</Text>
        ) : (
          <>
            <SectionCard
              title="Movies"
              subtitle="Playback preferences"
              isOpen={open.movies}
              onToggle={() => setOpen((prev) => ({ ...prev, movies: !prev.movies }))}
              onReset={() => void resetMovieDefaults()}
            >
              {movieRows.map((row) => {
                const value = Boolean(movieSettings[row.key]);
                return (
                  <View key={row.key} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{row.title}</Text>
                      <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
                    </View>
                    <Switch
                      value={value}
                      onValueChange={(next) => void setMovieOne(row.key, next as any)}
                      trackColor={{ false: 'rgba(255,255,255,0.2)', true: 'rgba(229,9,20,0.55)' }}
                      thumbColor={value ? '#e50914' : '#ffffff'}
                    />
                  </View>
                );
              })}
            </SectionCard>

            <SectionCard
              title="Social"
              subtitle="Feed & reels preferences"
              isOpen={open.social}
              onToggle={() => setOpen((prev) => ({ ...prev, social: !prev.social }))}
              onReset={() => void resetSocialDefaults()}
            >
              {socialRows.map((row) => {
                const value = Boolean(socialSettings[row.key]);
                return (
                  <View key={row.key} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{row.title}</Text>
                      <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
                    </View>
                    <Switch
                      value={value}
                      onValueChange={(next) => void setSocialOne(row.key, next as any)}
                      trackColor={{ false: 'rgba(255,255,255,0.2)', true: 'rgba(229,9,20,0.55)' }}
                      thumbColor={value ? '#e50914' : '#ffffff'}
                    />
                  </View>
                );
              })}
            </SectionCard>

            {/* Flixy Assistant Settings */}
            <SectionCard
              title="Flixy Assistant"
              subtitle="Your movie companion settings"
              isOpen={open.flixy}
              onToggle={() => setOpen((prev) => ({ ...prev, flixy: !prev.flixy }))}
              onReset={() => void resetFlixyDefaults()}
            >
              {flixyRows.map((row) => {
                const value = Boolean(flixySettings[row.key]);
                return (
                  <View key={row.key} style={styles.row}>
                    <View style={styles.rowText}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name={row.icon as any} size={16} color="#e50914" />
                        <Text style={styles.rowTitle}>{row.title}</Text>
                      </View>
                      <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
                    </View>
                    <Switch
                      value={value}
                      onValueChange={(next) => void setFlixyOne(row.key, next as any)}
                      trackColor={{ false: 'rgba(255,255,255,0.2)', true: 'rgba(229,9,20,0.55)' }}
                      thumbColor={value ? '#e50914' : '#ffffff'}
                    />
                  </View>
                );
              })}
              <View style={styles.flixyNote}>
                <Ionicons name="information-circle" size={16} color="rgba(255,255,255,0.5)" />
                <Text style={styles.flixyNoteText}>
                  Note: The app walkthrough is always shown for first-time users regardless of this setting.
                </Text>
              </View>
            </SectionCard>
          </>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  gradient: { ...StyleSheet.absoluteFillObject },
  headerRow: {
    marginTop: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  content: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 26, gap: 10 },
  loadingText: { color: 'rgba(255,255,255,0.7)', paddingTop: 16 },
  sectionCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  sectionHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  sectionSubtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  sectionReset: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sectionBody: { padding: 12, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowSubtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 4 },
  flixyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    marginTop: 4,
  },
  flixyNoteText: {
    flex: 1,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 18,
  },
});

export default SettingsScreen;
