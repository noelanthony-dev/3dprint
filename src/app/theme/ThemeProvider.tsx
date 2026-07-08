import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { localSettingsRepository } from "@/data/settings/localSettingsRepository";

import {
  getNextThemeMode,
  getThemeModeFromSettings,
  withThemeMode,
  type ThemeMode,
} from "./themeSettings";

interface ThemeContextValue {
  readonly themeMode: ThemeMode;
  readonly toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    getThemeModeFromSettings(localSettingsRepository.load()),
  );

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  const toggleTheme = useCallback(() => {
    setThemeMode((currentThemeMode) => {
      const nextThemeMode = getNextThemeMode(currentThemeMode);
      const currentSettings = localSettingsRepository.load();

      localSettingsRepository.save(withThemeMode(currentSettings, nextThemeMode));

      return nextThemeMode;
    });
  }, []);

  const value = useMemo(
    () => ({
      themeMode,
      toggleTheme,
    }),
    [themeMode, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }

  return context;
}
