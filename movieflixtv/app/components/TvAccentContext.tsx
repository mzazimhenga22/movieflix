import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type TvAccentContextValue = {
  accentColor: string;
  setAccentColor: (color: string) => void;
};

const TvAccentContext = createContext<TvAccentContextValue | null>(null);

export function TvAccentProvider({ children }: { children: ReactNode }) {
  const [accentColor, setAccentColorState] = useState('#e50914');

  const setAccentColor = useCallback((color: string) => {
    const next = typeof color === 'string' && color.trim().length ? color.trim() : '#e50914';
    setAccentColorState(next);
  }, []);

  const value = useMemo(() => ({ accentColor, setAccentColor }), [accentColor, setAccentColor]);

  return <TvAccentContext.Provider value={value}>{children}</TvAccentContext.Provider>;
}

export function useTvAccent() {
  const ctx = useContext(TvAccentContext);
  if (!ctx) throw new Error('useTvAccent must be used within TvAccentProvider');
  return ctx;
}
