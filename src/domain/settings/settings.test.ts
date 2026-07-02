import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  validateAppSettings,
} from "./index";

describe("settings domain", () => {
  it("normalizes unknown settings to safe local defaults", () => {
    expect(normalizeAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
    expect(
      normalizeAppSettings({
        currencySymbol: "BTC",
        darkMode: false,
        electricityRatePerKwh: 0.2,
        metricUnits: false,
      }),
    ).toMatchObject({
      currencySymbol: "USD ($)",
      darkMode: false,
      electricityRatePerKwh: 0.2,
      metricUnits: false,
    });
  });

  it("validates cost and HueForge threshold ranges", () => {
    const result = validateAppSettings({
      ...DEFAULT_APP_SETTINGS,
      expectedFailureRatePercent: 150,
      hueForgeAcceptableDeltaE: 0,
      hueForgeMaxTransmissionDistance: 1,
      hueForgeMinTransmissionDistance: 2,
      machineLifeHours: 0,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.expectedFailureRatePercent).toBeDefined();
    expect(result.errors.hueForgeAcceptableDeltaE).toBeDefined();
    expect(result.errors.hueForgeMaxTransmissionDistance).toBeDefined();
    expect(result.errors.machineLifeHours).toBeDefined();
  });

  it("accepts the default settings", () => {
    expect(validateAppSettings(DEFAULT_APP_SETTINGS)).toEqual({
      errors: {},
      valid: true,
    });
  });
});
