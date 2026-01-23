import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useMessagingSettings } from '@/hooks/useMessagingSettings';

const MessagingSettingsScreen: React.FC = () => {
  const router = useRouter();
  const { settings, updateSettings } = useMessagingSettings();

  return (
    <ScreenWrapper>
      <LinearGradient
        colors={['#e50914', '#150a13', '#05060f']}
        start={[0, 0]}
        end={[1, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.headerWrap}>
        <LinearGradient
          colors={['rgba(229,9,20,0.28)', 'rgba(10,12,24,0.96)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerInner}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.eyebrow}>Messaging</Text>
              <Text style={styles.headerTitle}>Chat Settings</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <SettingRow
            icon="notifications-outline"
            title="Message notifications"
            description="Show alerts for new chats"
            value={settings.notificationsEnabled}
            onChange={(value) => updateSettings({ notificationsEnabled: value })}
          />
          <SettingRow
            icon="chatbox-ellipses-outline"
            title="Show message preview"
            description="Display a snippet on lock screen"
            value={settings.showPreviews}
            onChange={(value) => updateSettings({ showPreviews: value })}
          />
        </View>

        <Text style={styles.sectionLabel}>Privacy</Text>
        <View style={styles.card}>
          <SettingRow
            icon="moon-outline"
            title="Hibernate (appear offline)"
            description="Stay offline and hide online/last seen. While enabled you can't view others' online/last seen."
            value={settings.hibernate}
            onChange={(value) => updateSettings({ hibernate: value })}
          />
          <SettingRow
            icon="checkmark-done-outline"
            title="Read receipts"
            description="Let others see when you read"
            value={settings.readReceipts}
            onChange={(value) => updateSettings({ readReceipts: value })}
          />
          <SettingRow
            icon="pulse-outline"
            title="Typing indicators"
            description="Show when you're typing"
            value={settings.typingIndicators}
            onChange={(value) => updateSettings({ typingIndicators: value })}
          />
        </View>

        <Text style={styles.sectionLabel}>Media</Text>
        <View style={styles.card}>
          <SettingRow
            icon="wifi-outline"
            title="Auto-download on Wi‑Fi"
            description="Download photos & videos on Wi‑Fi"
            value={settings.mediaAutoDownloadWifi}
            onChange={(value) => updateSettings({ mediaAutoDownloadWifi: value })}
          />
          <SettingRow
            icon="cellular-outline"
            title="Auto-download on cellular"
            description="Use mobile data for media"
            value={settings.mediaAutoDownloadCellular}
            onChange={(value) => updateSettings({ mediaAutoDownloadCellular: value })}
          />
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
};

type SettingRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

const SettingRow = ({ icon, title, description, value, onChange }: SettingRowProps) => {
  return (
    <View style={styles.row}>
      <View style={styles.rowIconWrap}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle}>{title}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: 'rgba(255,255,255,0.25)', true: 'rgba(229,9,20,0.7)' }}
        thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 52 : 24,
    paddingBottom: 10,
  },
  headerGradient: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: 'rgba(5,6,15,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backButton: {
    padding: 6,
    marginRight: 10,
  },
  headerTitleWrap: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 8,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    backgroundColor: 'rgba(5,6,15,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  rowDescription: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
  },
});

export default MessagingSettingsScreen;
