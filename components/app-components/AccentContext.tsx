import React, { createContext, useContext, useMemo, useState } from 'react';

type AccentContextValue = {
  accentColor: string;
  setAccentColor: (color: string) => void;
};

const AccentContext = createContext<AccentContextValue | undefined>(undefined);

export const AccentProvider = ({ children }: { children: React.ReactNode }) => {
  const [accentColor, setAccentColor] = useState<string>('#e50914');

  const value = useMemo(
    () => ({
      accentColor,
      setAccentColor,
    }),
    [accentColor]
  );

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
};

export const useAccent = (): AccentContextValue => {
  const ctx = useContext(AccentContext);
  if (!ctx) {
    throw new Error('useAccent must be used within an AccentProvider');
  }
  return ctx;
};

// dummy default export to satisfy expo-router route scanning
export default AccentProvider;
