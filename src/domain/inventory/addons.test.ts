import { describe, expect, it } from "vitest";

import {
  formatQuantity,
  getAddOnStockSignal,
  isAddOnLowStock,
  validateAddOnInput,
  type AddOnInput,
} from "./addons";

const validInput: AddOnInput = {
  category: "Hardware",
  isActive: true,
  itemName: "6x2mm magnets",
  lowStockThreshold: 100,
  notes: "",
  quantityOnHand: 850,
  supplier: "Local supplier",
  unit: "pcs",
  unitCost: 0.04,
};

describe("add-on inventory helpers", () => {
  it("formats quantity for compact inventory displays", () => {
    expect(formatQuantity(850, "pcs")).toBe("850 pcs");
    expect(formatQuantity(12.5, "meters")).toBe("12.5 meters");
    expect(formatQuantity(-10, "pcs")).toBe("0 pcs");
    expect(formatQuantity(Number.NaN, "pcs")).toBe("--");
  });

  it("classifies stock signals from quantity, threshold, and active state", () => {
    expect(getAddOnStockSignal({ isActive: true, lowStockThreshold: 100, quantityOnHand: 850 })).toBe("ok");
    expect(getAddOnStockSignal({ isActive: true, lowStockThreshold: 100, quantityOnHand: 75 })).toBe("low");
    expect(getAddOnStockSignal({ isActive: true, lowStockThreshold: 100, quantityOnHand: 0 })).toBe("out");
    expect(getAddOnStockSignal({ isActive: false, lowStockThreshold: 100, quantityOnHand: 850 })).toBe("inactive");
    expect(isAddOnLowStock({ isActive: true, lowStockThreshold: 100, quantityOnHand: 75 })).toBe(true);
  });

  it("validates required fields and numeric bounds", () => {
    expect(validateAddOnInput(validInput).valid).toBe(true);

    const result = validateAddOnInput({
      ...validInput,
      itemName: "",
      quantityOnHand: -1,
      unitCost: Number.NaN,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.itemName).toBeDefined();
    expect(result.errors.quantityOnHand).toBeDefined();
    expect(result.errors.unitCost).toBeDefined();
  });
});
