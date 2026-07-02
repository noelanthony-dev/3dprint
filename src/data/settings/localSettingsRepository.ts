import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  type AppSettings,
} from "@/domain/settings";

const SETTINGS_STORAGE_KEY = "printops.studio.settings.v1";

export interface LocalSettingsRepository {
  load(): AppSettings;
  reset(): AppSettings;
  save(settings: AppSettings): AppSettings;
}

export const localSettingsRepository: LocalSettingsRepository = {
  load() {
    const storage = getStorage();

    if (!storage) {
      return DEFAULT_APP_SETTINGS;
    }

    const rawSettings = storage.getItem(SETTINGS_STORAGE_KEY);

    if (!rawSettings) {
      return DEFAULT_APP_SETTINGS;
    }

    try {
      return normalizeAppSettings(JSON.parse(rawSettings));
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  },
  reset() {
    const storage = getStorage();

    storage?.removeItem(SETTINGS_STORAGE_KEY);

    return DEFAULT_APP_SETTINGS;
  },
  save(settings) {
    const normalizedSettings = normalizeAppSettings(settings);
    const storage = getStorage();

    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSettings));

    return normalizedSettings;
  },
};

function getStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
