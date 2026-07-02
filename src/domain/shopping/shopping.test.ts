import { describe, expect, it } from "vitest";

import type { AddOnRecord } from "@/domain/inventory";

import {
  buildLowStockAddOnSuggestions,
  buildMissingHueForgeFilamentSuggestions,
  mergeShoppingSuggestions,
  toManualShoppingItemInput,
  validateShoppingListItemInput,
  type HueForgeMissingRequirement,
  type ShoppingListItemInput,
} from "./index";

const addOn: AddOnRecord = {
  category: "Hardware",
  createdAt: "2026-07-02T00:00:00.000Z",
  id: 1,
  isActive: true,
  itemName: "6x2mm magnets",
  lowStockThreshold: 100,
  notes: "",
  quantityOnHand: 25,
  supplier: "Local supplier",
  unit: "pcs",
  unitCost: 0.04,
  updatedAt: "2026-07-02T00:00:00.000Z",
};

const missingRequirement: HueForgeMissingRequirement = {
  brand: "Bambu",
  colorName: "Jade White",
  hexColor: "#f7f7ee",
  layerRange: "L0-L12",
  materialType: "PLA",
  productId: 7,
  requiredGrams: 35,
  role: "Base",
  transmissionDistance: 2.1,
  warning: "No usable PLA match for Jade White.",
};

const manualItem: ShoppingListItemInput = {
  category: "Hardware",
  itemName: "6x2mm magnets",
  notes: "",
  priority: "normal",
  quantityNeeded: 175,
  sourceNote: "Current 25 pcs; threshold 100 pcs.",
  sourceType: "manual",
  status: "open",
  unit: "pcs",
};

describe("shopping list validation", () => {
  it("accepts valid manual items", () => {
    expect(validateShoppingListItemInput(manualItem)).toEqual({
      errors: {},
      valid: true,
    });
  });

  it("requires item name, positive quantity, and unit", () => {
    const validation = validateShoppingListItemInput({
      ...manualItem,
      itemName: "",
      quantityNeeded: 0,
      unit: "",
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.itemName).toBe("Item name is required.");
    expect(validation.errors.quantityNeeded).toBe("Quantity needed must be greater than zero.");
    expect(validation.errors.unit).toBe("Unit is required.");
  });
});

describe("generated shopping suggestions", () => {
  it("suggests low-stock add-ons with an explainable replenishment quantity", () => {
    const suggestions = buildLowStockAddOnSuggestions([addOn]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      category: "Hardware",
      itemName: "6x2mm magnets",
      priority: "normal",
      quantityNeeded: 175,
      sourceType: "low-stock-addon",
      unit: "pcs",
    });
    expect(suggestions[0]?.sourceNote).toContain("Current 25 pcs");
  });

  it("suggests missing HueForge filaments without deducting inventory", () => {
    const suggestions = buildMissingHueForgeFilamentSuggestions([missingRequirement]);

    expect(suggestions).toEqual([
      {
        category: "Filament",
        itemName: "Bambu Jade White PLA",
        priority: "high",
        quantityNeeded: 35,
        reason: "No usable PLA match for Jade White.",
        sourceNote: "Product 7, Base, L0-L12, TD 2.1.",
        sourceType: "missing-hueforge-filament",
        unit: "grams",
      },
    ]);
  });

  it("merges duplicate generated suggestions by item and unit", () => {
    const [suggestion] = buildMissingHueForgeFilamentSuggestions([missingRequirement]);

    expect(suggestion).toBeDefined();

    if (!suggestion) {
      return;
    }

    const merged = mergeShoppingSuggestions([suggestion, suggestion]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.quantityNeeded).toBe(70);
    expect(merged[0]?.priority).toBe("high");
  });

  it("turns a suggestion into an open shopping list item input", () => {
    const [suggestion] = buildLowStockAddOnSuggestions([addOn]);

    expect(suggestion).toBeDefined();

    if (!suggestion) {
      return;
    }

    expect(toManualShoppingItemInput(suggestion)).toMatchObject({
      itemName: "6x2mm magnets",
      sourceType: "low-stock-addon",
      status: "open",
    });
  });
});
