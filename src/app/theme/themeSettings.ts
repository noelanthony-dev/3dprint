import type { AppSettings } from "@/domain/settings";

export type ThemeMode = "dark" | "light";

export function getThemeModeFromSettings(settings: AppSettings): ThemeMode {
  return settings.darkMode ? "dark" : "light";
}

export function getNextThemeMode(themeMode: ThemeMode): ThemeMode {
  return themeMode === "dark" ? "light" : "dark";
}

export function withThemeMode(settings: AppSettings, themeMode: ThemeMode): AppSettings {
  return {
    ...settings,
    darkMode: themeMode === "dark",
  };
}
