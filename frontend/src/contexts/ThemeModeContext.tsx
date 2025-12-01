import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface ThemeModeContextValue {
  mode: 'light' | 'dark';
  toggle: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined);

export const useThemeMode = () => {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
  return ctx;
};

export const ThemeModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('theme_mode') as 'light' | 'dark') || 'light'
  );

  useEffect(() => {
    localStorage.setItem('theme_mode', mode);
    // Apply theme to body for CSS variable overrides
    document.body.setAttribute('data-theme', mode);
    document.body.classList.remove('light-mode', 'dark-mode');
    document.body.classList.add(`${mode}-mode`);
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === 'light' ? 'dark' : 'light')), []);

  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
};
