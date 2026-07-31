import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  validateAppSettings,
} from "./index";

describe("settings domain", () => {
  it("uses the configured costing defaults", () => {
    expect(DEFAULT_APP_SETTINGS).toMatchObject({
      electricityRatePerKwh: 15,
      expectedFailureRatePercent: 5,
      laborRateHourly: 35,
      machineLifeHours: 5_000,
      printerPowerWatts: 120,
      productCategories: [
        "Bookmarks",
        "Magnets",
        "Figure/Miniatures",
        "Clickers",
        "Others",
      ],
      wearRatePerHour: 8.5,
    });
  });

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
      currencySymbol: "PHP (₱)",
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
      printerPowerWatts: -1,
      wearRatePerHour: -1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.expectedFailureRatePercent).toBeDefined();
    expect(result.errors.hueForgeAcceptableDeltaE).toBeDefined();
    expect(result.errors.hueForgeMaxTransmissionDistance).toBeDefined();
    expect(result.errors.machineLifeHours).toBeDefined();
    expect(result.errors.printerPowerWatts).toBeDefined();
    expect(result.errors.wearRatePerHour).toBeDefined();
  });

  it("accepts the default settings", () => {
    expect(validateAppSettings(DEFAULT_APP_SETTINGS)).toEqual({
      errors: {},
      valid: true,
    });
  });

  it("normalizes saved custom product categories", () => {
    expect(
      normalizeAppSettings({
        ...DEFAULT_APP_SETTINGS,
        productCategories: [" Keychains ", "keychains", "Desk Organizers"],
      }).productCategories,
    ).toEqual(["Keychains", "Desk Organizers"]);
  });
});
