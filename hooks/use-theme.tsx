// hooks/use-theme.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, Theme, ThemeProvider } from '@react-navigation/native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// keys
const THEME_ACCENT_KEY = 'theme_accent';
const THEME_BACKGROUND_KEY = 'theme_background';
const THEME_DARK_KEY = 'theme_dark';

type ThemeContextType = {
  theme: Theme;
  changeTheme: (theme: Theme, persist?: boolean) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: DarkTheme,
  changeTheme: async () => { },
});

export const useThemeContext = () => useContext(ThemeContext);
export const useTheme = () => useThemeContext(); // convenience

const makeTheme = (base: Theme, overrides: Partial<Theme>): Theme => ({
  ...(base as Theme),
  ...overrides,
  colors: {
    ...(base.colors ?? {}),
    ...(overrides.colors ?? {}),
  },
});

export const LightTheme: Theme = makeTheme(DarkTheme, {
  dark: false,
  colors: {
    primary: '#007AFF',
    background: '#F2F2F7',
    card: '#FFFFFF',
    text: '#000000',
    border: '#C6C6C8',
    notification: '#007AFF',
  },
});

function shallowThemeKey(t: Theme) {
  const c = t.colors ?? {};
  // only these three matter for our equality test
  return `${String(t.dark)}|${String((c as any).primary ?? '')}|${String((c as any).background ?? '')}`;
}

export const CustomThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [themeState, setThemeState] = useState<Theme>(DarkTheme);

  const loadTheme = useCallback(async () => {
    try {
      const accentColor = await AsyncStorage.getItem(THEME_ACCENT_KEY);
      const storedBackgroundColor = await AsyncStorage.getItem(THEME_BACKGROUND_KEY);
      const storedIsDark = await AsyncStorage.getItem(THEME_DARK_KEY);

      let newTheme: Theme = DarkTheme;

      if (storedIsDark !== null) {
        const isDark = JSON.parse(storedIsDark);
        const base = isDark ? DarkTheme : LightTheme;
        newTheme = makeTheme(base, {
          colors: {
            ...(base.colors ?? {}),
            primary: accentColor ?? (base.colors?.primary ?? ''),
            background: storedBackgroundColor ?? (base.colors?.background ?? ''),
          },
        });
      } else if (accentColor || storedBackgroundColor) {
        newTheme = makeTheme(DarkTheme, {
          colors: {
            ...(DarkTheme.colors ?? {}),
            primary: accentColor ?? (DarkTheme.colors?.primary ?? ''),
            background: storedBackgroundColor ?? (DarkTheme.colors?.background ?? ''),
          },
        });
      }

      // Only set if different (by our key)
      if (shallowThemeKey(newTheme) !== shallowThemeKey(themeState)) {
        setThemeState(newTheme);
      }
    } catch (error) {
      console.error('Failed to load theme from storage:', error);
      // keep existing themeState
    }
  }, []);

  useEffect(() => {
    loadTheme();
  }, [loadTheme]);

  const changeTheme = useCallback(async (newTheme: Theme, persist: boolean = true) => {
    // avoid unnecessary re-render if only reference changed
    if (shallowThemeKey(newTheme) === shallowThemeKey(themeState)) return;

    setThemeState(newTheme);

    if (!persist) return;

    try {
      const colors = newTheme.colors ?? {};
      const primary = (colors as any).primary ?? null;
      const background = (colors as any).background ?? (newTheme.dark ? DarkTheme.colors.background : LightTheme.colors.background);
      const isDark = Boolean(newTheme.dark);

      if (primary) await AsyncStorage.setItem(THEME_ACCENT_KEY, String(primary));
      if (background) await AsyncStorage.setItem(THEME_BACKGROUND_KEY, String(background));
      await AsyncStorage.setItem(THEME_DARK_KEY, JSON.stringify(isDark));
    } catch (err) {
      console.error('Failed to save theme to storage:', err);
    }
  }, [themeState]);

  // memoize the theme object passed into ThemeProvider so its identity changes only
  // when themeState (meaningful values) actually change
  const memoizedTheme = useMemo(() => themeState, [themeState]);

  const contextValue = useMemo(() => ({ theme: memoizedTheme, changeTheme }), [memoizedTheme, changeTheme]);

  return (
    <ThemeContext.Provider value={contextValue}>
      <ThemeProvider value={memoizedTheme}>{children}</ThemeProvider>
    </ThemeContext.Provider>
  );
};

export default CustomThemeProvider;