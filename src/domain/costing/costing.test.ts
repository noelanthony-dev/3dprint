import { describe, expect, it } from "vitest";

import {
  calculatePrintCost,
  validatePrintProfileInput,
  type PrintProfileInput,
} from "./index";

const validInput: PrintProfileInput = {
  addOnCost: 2.5,
  addOnDescription: "Magnets and box",
  electricityRatePerKwh: 0.15,
  expectedFailedUnits: 1,
  expectedGoodUnits: 10,
  filamentCostPerKg: 24.99,
  filamentGrams: 450,
  laborMinutes: 15,
  laborRatePerHour: 20,
  notes: "",
  printerPowerWatts: 100,
  printHours: 14,
  printMinutes: 30,
  productId: 1,
  profileName: "0.2mm Standard",
  saleUnit: "piece",
  supportGrams: 45,
  targetMarkup: 3,
  wearRatePerHour: 0.1,
};

describe("print costing", () => {
  it("calculates batch and per-good-unit cost breakdowns", () => {
    const result = calculatePrintCost(validInput);

    expect(result.filamentCost).toBe(12.37);
    expect(result.electricityCost).toBe(0.22);
    expect(result.wearCost).toBe(1.45);
    expect(result.laborCost).toBe(5);
    expect(result.batchCost).toBe(21.54);
    expect(result.costPerGoodUnit).toBe(2.15);
    expect(result.failureRate).toBeCloseTo(1 / 11);
  });

  it("handles zero attempted units without division errors", () => {
    const result = calculatePrintCost({
      ...validInput,
      expectedFailedUnits: 0,
      expectedGoodUnits: 0,
    });

    expect(result.costPerAttemptedUnit).toBe(0);
    expect(result.costPerGoodUnit).toBe(0);
  });

  it("validates required profile fields and numeric bounds", () => {
    expect(validatePrintProfileInput(validInput).valid).toBe(true);

    const result = validatePrintProfileInput({
      ...validInput,
      expectedGoodUnits: 0,
      filamentGrams: -1,
      productId: 0,
      profileName: "",
      targetMarkup: 0.5,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.expectedGoodUnits).toBeDefined();
    expect(result.errors.filamentGrams).toBeDefined();
    expect(result.errors.productId).toBeDefined();
    expect(result.errors.profileName).toBeDefined();
    expect(result.errors.targetMarkup).toBeDefined();
  });
});
