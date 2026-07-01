import { describe, expect, it } from "vitest";

import {
  formatGramsLeft,
  getStockSignal,
  isLowStock,
  normalizeHexColor,
  validateFilamentInput,
  type FilamentInput,
} from "./filaments";

const validInput: FilamentInput = {
  brand: "eSUN",
  name: "Cold White",
  materialType: "PLA+",
  colorName: "Cold White",
  hexColor: "#f8f8f2",
  transmissionDistance: 2.1,
  spoolStatus: "open",
  startingGrams: 1000,
  estimatedGramsLeft: 840,
  spoolCost: 21,
  purchaseSource: "Local supplier",
  notes: "",
  lowStockThresholdGrams: 200,
};

describe("filament inventory helpers", () => {
  it("normalizes hex color input", () => {
    expect(normalizeHexColor(" F8F8F2 ")).toBe("#f8f8f2");
    expect(normalizeHexColor("#ABC123")).toBe("#abc123");
  });

  it("formats grams left for display", () => {
    expect(formatGramsLeft(839.6)).toBe("840g");
    expect(formatGramsLeft(-10)).toBe("0g");
    expect(formatGramsLeft(Number.NaN)).toBe("--");
  });

  it("classifies stock status from grams and spool status", () => {
    expect(getStockSignal({ estimatedGramsLeft: 840, lowStockThresholdGrams: 200, spoolStatus: "open" })).toBe("ready");
    expect(getStockSignal({ estimatedGramsLeft: 120, lowStockThresholdGrams: 200, spoolStatus: "open" })).toBe("low");
    expect(getStockSignal({ estimatedGramsLeft: 0, lowStockThresholdGrams: 200, spoolStatus: "open" })).toBe("empty");
    expect(getStockSignal({ estimatedGramsLeft: 1000, lowStockThresholdGrams: 200, spoolStatus: "sealed" })).toBe("sealed");
    expect(isLowStock({ estimatedGramsLeft: 120, lowStockThresholdGrams: 200, spoolStatus: "open" })).toBe(true);
  });

  it("validates required fields and numeric bounds", () => {
    expect(validateFilamentInput(validInput).valid).toBe(true);

    const result = validateFilamentInput({
      ...validInput,
      brand: "",
      hexColor: "not-a-color",
      estimatedGramsLeft: 1100,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.brand).toBeDefined();
    expect(result.errors.hexColor).toBeDefined();
    expect(result.errors.estimatedGramsLeft).toBeDefined();
  });
});
