import AsyncStorage from '@react-native-async-storage/async-storage';

const FLIXY_SETTINGS_KEY = 'flixy:settings';

export interface FlixySettings {
    /** Whether Flixy assistant is enabled (shows floating helper) */
    assistantEnabled: boolean;
    /** Whether voice activation is enabled */
    voiceEnabled: boolean;
    /** Whether Flixy should show tips automatically */
    autoShowTips: boolean;
}

const DEFAULT_SETTINGS: FlixySettings = {
    assistantEnabled: true,
    voiceEnabled: true,
    autoShowTips: true,
};

/**
 * Get current Flixy settings
 */
export async function getFlixySettings(): Promise<FlixySettings> {
    try {
        const raw = await AsyncStorage.getItem(FLIXY_SETTINGS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { ...DEFAULT_SETTINGS, ...parsed };
        }
    } catch (error) {
        console.warn('[FlixySettings] Failed to read settings:', error);
    }
    return DEFAULT_SETTINGS;
}

/**
 * Update Flixy settings
 */
export async function setFlixySettings(settings: Partial<FlixySettings>): Promise<void> {
    try {
        const current = await getFlixySettings();
        const updated = { ...current, ...settings };
        await AsyncStorage.setItem(FLIXY_SETTINGS_KEY, JSON.stringify(updated));
    } catch (error) {
        console.warn('[FlixySettings] Failed to save settings:', error);
    }
}

/**
 * Check if Flixy assistant is enabled
 */
export async function isFlixyEnabled(): Promise<boolean> {
    const settings = await getFlixySettings();
    return settings.assistantEnabled;
}

/**
 * Toggle Flixy assistant on/off
 */
export async function toggleFlixyAssistant(enabled: boolean): Promise<void> {
    await setFlixySettings({ assistantEnabled: enabled });
}

/**
 * Toggle voice activation on/off
 */
export async function toggleFlixyVoice(enabled: boolean): Promise<void> {
    await setFlixySettings({ voiceEnabled: enabled });
}
