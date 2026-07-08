import { describe, expect, it } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@/domain/settings";

import { getNextThemeMode, getThemeModeFromSettings, withThemeMode } from "./themeSettings";

describe("theme settings helpers", () => {
  it("reads theme mode from local app settings", () => {
    expect(getThemeModeFromSettings({ ...DEFAULT_APP_SETTINGS, darkMode: true })).toBe("dark");
    expect(getThemeModeFromSettings({ ...DEFAULT_APP_SETTINGS, darkMode: false })).toBe("light");
  });

  it("toggles between dark and light", () => {
    expect(getNextThemeMode("dark")).toBe("light");
    expect(getNextThemeMode("light")).toBe("dark");
  });

  it("updates only the theme preference", () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      darkMode: true,
      laborRateHourly: 175,
      metricUnits: false,
    };

    expect(withThemeMode(settings, "light")).toEqual({
      ...settings,
      darkMode: false,
    });
  });
});
