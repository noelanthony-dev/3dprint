import { createScaffoldModuleStatus } from "@/domain/shared";

export const CURRENCY_OPTIONS = ["USD ($)", "PHP (PHP)", "EUR (EUR)", "GBP (GBP)"] as const;

export interface AppSettings {
  readonly currencySymbol: (typeof CURRENCY_OPTIONS)[number];
  readonly darkMode: boolean;
  readonly electricityRatePerKwh: number;
  readonly expectedFailureRatePercent: number;
  readonly hueForgeAcceptableDeltaE: number;
  readonly hueForgeMaxTransmissionDistance: number;
  readonly hueForgeMinTransmissionDistance: number;
  readonly laborRateHourly: number;
  readonly machineLifeHours: number;
  readonly metricUnits: boolean;
}

export interface SettingsValidationResult {
  readonly errors: Partial<Record<keyof AppSettings, string>>;
  readonly valid: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  currencySymbol: "USD ($)",
  darkMode: true,
  electricityRatePerKwh: 0.12,
  expectedFailureRatePercent: 5,
  hueForgeAcceptableDeltaE: 2.5,
  hueForgeMaxTransmissionDistance: 15,
  hueForgeMinTransmissionDistance: 1.5,
  laborRateHourly: 25,
  machineLifeHours: 5_000,
  metricUnits: true,
};

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!isObjectRecord(value)) {
    return DEFAULT_APP_SETTINGS;
  }

  return {
    currencySymbol: isCurrencyOption(value.currencySymbol)
      ? value.currencySymbol
      : DEFAULT_APP_SETTINGS.currencySymbol,
    darkMode: typeof value.darkMode === "boolean"
      ? value.darkMode
      : DEFAULT_APP_SETTINGS.darkMode,
    electricityRatePerKwh: normalizeNumber(
      value.electricityRatePerKwh,
      DEFAULT_APP_SETTINGS.electricityRatePerKwh,
    ),
    expectedFailureRatePercent: normalizeNumber(
      value.expectedFailureRatePercent,
      DEFAULT_APP_SETTINGS.expectedFailureRatePercent,
    ),
    hueForgeAcceptableDeltaE: normalizeNumber(
      value.hueForgeAcceptableDeltaE,
      DEFAULT_APP_SETTINGS.hueForgeAcceptableDeltaE,
    ),
    hueForgeMaxTransmissionDistance: normalizeNumber(
      value.hueForgeMaxTransmissionDistance,
      DEFAULT_APP_SETTINGS.hueForgeMaxTransmissionDistance,
    ),
    hueForgeMinTransmissionDistance: normalizeNumber(
      value.hueForgeMinTransmissionDistance,
      DEFAULT_APP_SETTINGS.hueForgeMinTransmissionDistance,
    ),
    laborRateHourly: normalizeNumber(value.laborRateHourly, DEFAULT_APP_SETTINGS.laborRateHourly),
    machineLifeHours: normalizeNumber(value.machineLifeHours, DEFAULT_APP_SETTINGS.machineLifeHours),
    metricUnits: typeof value.metricUnits === "boolean"
      ? value.metricUnits
      : DEFAULT_APP_SETTINGS.metricUnits,
  };
}

export function validateAppSettings(settings: AppSettings): SettingsValidationResult {
  const errors: Partial<Record<keyof AppSettings, string>> = {};

  if (!isCurrencyOption(settings.currencySymbol)) {
    errors.currencySymbol = "Choose a supported currency display.";
  }

  if (settings.laborRateHourly < 0) {
    errors.laborRateHourly = "Labor rate cannot be negative.";
  }

  if (settings.electricityRatePerKwh < 0) {
    errors.electricityRatePerKwh = "Electricity rate cannot be negative.";
  }

  if (settings.machineLifeHours <= 0) {
    errors.machineLifeHours = "Machine life must be greater than zero.";
  }

  if (settings.expectedFailureRatePercent < 0 || settings.expectedFailureRatePercent > 100) {
    errors.expectedFailureRatePercent = "Expected failure rate must be between 0 and 100.";
  }

  if (settings.hueForgeMinTransmissionDistance < 0) {
    errors.hueForgeMinTransmissionDistance = "Minimum TD cannot be negative.";
  }

  if (settings.hueForgeMaxTransmissionDistance <= settings.hueForgeMinTransmissionDistance) {
    errors.hueForgeMaxTransmissionDistance = "Maximum TD must be greater than minimum TD.";
  }

  if (settings.hueForgeAcceptableDeltaE <= 0) {
    errors.hueForgeAcceptableDeltaE = "Acceptable Delta E must be greater than zero.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function getSettingsSummary(settings: AppSettings): readonly string[] {
  return [
    `${settings.currencySymbol}`,
    settings.metricUnits ? "Metric units" : "Custom units",
    settings.darkMode ? "Dark industrial theme" : "Light theme preference",
  ];
}

function isCurrencyOption(value: unknown): value is AppSettings["currencySymbol"] {
  return CURRENCY_OPTIONS.includes(value as AppSettings["currencySymbol"]);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export const settingsDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "settings",
  notes: ["Local app settings defaults, normalization, and validation."],
});
