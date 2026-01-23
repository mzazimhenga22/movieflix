import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getFlixySettings, setFlixySettings, type FlixySettings } from '../../lib/flixySettings';

interface FlixySettingsContextType {
    settings: FlixySettings;
    isLoaded: boolean;
    updateSettings: (updates: Partial<FlixySettings>) => Promise<void>;
    refreshSettings: () => Promise<void>;
}

const defaultSettings: FlixySettings = {
    assistantEnabled: true,
    voiceEnabled: true,
    autoShowTips: true,
};

const FlixySettingsContext = createContext<FlixySettingsContextType>({
    settings: defaultSettings,
    isLoaded: false,
    updateSettings: async () => { },
    refreshSettings: async () => { },
});

export const useFlixySettings = () => useContext(FlixySettingsContext);

interface FlixySettingsProviderProps {
    children: React.ReactNode;
}

/**
 * FlixySettingsProvider - Provides Flixy settings to all components
 * Wrap your app with this to enable settings-aware Flixy behavior
 */
export function FlixySettingsProvider({ children }: FlixySettingsProviderProps) {
    const [settings, setSettingsState] = useState<FlixySettings>(defaultSettings);
    const [isLoaded, setIsLoaded] = useState(false);

    const refreshSettings = useCallback(async () => {
        try {
            const loaded = await getFlixySettings();
            setSettingsState(loaded);
        } catch (error) {
            console.warn('[FlixySettingsProvider] Failed to load settings:', error);
        } finally {
            setIsLoaded(true);
        }
    }, []);

    const updateSettings = useCallback(async (updates: Partial<FlixySettings>) => {
        try {
            const newSettings = { ...settings, ...updates };
            setSettingsState(newSettings);
            await setFlixySettings(updates);
        } catch (error) {
            console.warn('[FlixySettingsProvider] Failed to update settings:', error);
        }
    }, [settings]);

    // Load settings on mount
    useEffect(() => {
        void refreshSettings();
    }, [refreshSettings]);

    return (
        <FlixySettingsContext.Provider
            value={{
                settings,
                isLoaded,
                updateSettings,
                refreshSettings,
            }}
        >
            {children}
        </FlixySettingsContext.Provider>
    );
}

export default FlixySettingsProvider;
