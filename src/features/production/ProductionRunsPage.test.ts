import { describe, expect, it } from "vitest";

import type { FilamentRecord } from "@/domain/inventory";
import type { ProductHueForgeFilament, ProductRecord } from "@/domain/products";

import {
  calculateProductionAddOnCorrectionPreview,
  chooseRecommendedFilamentSelections,
  getSuggestedInventoryFilamentsForRequirement,
} from "./ProductionRunsPage";

describe("production add-on correction preview", () => {
  const run = {
    addOnDeductions: [{
      addOnId: 1,
      id: 9,
      productionRunId: 5,
      quantityDeducted: 2,
      sortOrder: 0,
    }],
  };

  it("shows only net deductions and returns against current stock", () => {
    expect(calculateProductionAddOnCorrectionPreview(
      run,
      [{ addOnId: "1", quantity: "3" }, { addOnId: "2", quantity: "1" }],
      [{ id: 1, quantityOnHand: 8 }, { id: 2, quantityOnHand: 5 }],
    )).toEqual([
      { addOnId: 1, quantityDelta: 1, runQuantityAfter: 3, runQuantityBefore: 2, stockQuantityAfter: 7 },
      { addOnId: 2, quantityDelta: 1, runQuantityAfter: 1, runQuantityBefore: 0, stockQuantityAfter: 4 },
    ]);

    expect(calculateProductionAddOnCorrectionPreview(
      run,
      [],
      [{ id: 1, quantityOnHand: 8 }],
    )).toEqual([
      { addOnId: 1, quantityDelta: -2, runQuantityAfter: 0, runQuantityBefore: 2, stockQuantityAfter: 10 },
    ]);
  });
});

const requirement: ProductHueForgeFilament = {
  alternativeFilamentIds: [3, 2],
  brand: "Jayo",
  colorName: "Mint Green",
  hexColor: "#98ff98",
  layerRange: "",
  materialType: "PLA+",
  purchaseSource: "",
  requiredGrams: 10,
  role: "",
  transmissionDistance: null,
};

describe("production filament recommendations", () => {
  it("ranks exact matches before saved alternatives and keeps alternatives in saved order", () => {
    const filaments = [
      makeFilament(4, { brand: "Bambu", colorName: "Blue", materialType: "PLA+" }),
      makeFilament(2, { brand: "eSun", colorName: "Black", materialType: "PLA+" }),
      makeFilament(1, {
        brand: "Jayo",
        colorName: "Mint Green",
        hexColor: "#98ff98",
        materialType: "PLA+",
        spoolStatus: "sealed",
      }),
      makeFilament(5, { brand: "Polymaker", colorName: "White", materialType: "PLA" }),
      makeFilament(3, { brand: "Polymaker", colorName: "Arctic Teal", materialType: "PLA" }),
    ];

    expect(
      getSuggestedInventoryFilamentsForRequirement(requirement, filaments, 10).map(
        (filament) => filament.id,
      ),
    ).toEqual([1, 3, 2, 4, 5]);
  });

  it("skips missing, archived, empty, and understocked saved alternatives", () => {
    const alternativesRequired: ProductHueForgeFilament = {
      ...requirement,
      alternativeFilamentIds: [99, 2, 3, 4, 5],
    };
    const filaments = [
      makeFilament(2, { spoolStatus: "archived" }),
      makeFilament(3, { spoolStatus: "empty" }),
      makeFilament(4, { estimatedGramsLeft: 9 }),
      makeFilament(5, { brand: "Polymaker", colorName: "Arctic Teal", materialType: "PLA" }),
      makeFilament(6, { brand: "Bambu", colorName: "Blue", materialType: "PLA+" }),
    ];

    expect(
      getSuggestedInventoryFilamentsForRequirement(alternativesRequired, filaments, 10).map(
        (filament) => filament.id,
      ),
    ).toEqual([5, 6]);
  });

  it("auto-selects the first eligible saved alternative when no exact match exists", () => {
    const product = makeProduct(requirement);
    const filaments = [
      makeFilament(2, { brand: "eSun", colorName: "Black", materialType: "PLA+" }),
      makeFilament(3, { brand: "Polymaker", colorName: "Arctic Teal", materialType: "PLA" }),
    ];

    expect(chooseRecommendedFilamentSelections(product, filaments, 1)).toEqual({ "0": "3" });
  });

  it("falls back to matching material and then other usable stock", () => {
    const withoutAlternatives = { ...requirement, alternativeFilamentIds: [] };
    const material = makeFilament(6, {
      brand: "Bambu",
      colorName: "Blue",
      materialType: "PLA+",
    });
    const other = makeFilament(7, {
      brand: "Polymaker",
      colorName: "White",
      materialType: "PLA",
    });

    expect(
      getSuggestedInventoryFilamentsForRequirement(
        withoutAlternatives,
        [other, material],
        10,
      ).map((filament) => filament.id),
    ).toEqual([6, 7]);
  });
});

function makeFilament(
  id: number,
  overrides: Partial<FilamentRecord> = {},
): FilamentRecord {
  return {
    brand: "Generic",
    colorName: "Gray",
    createdAt: "2026-07-17T00:00:00.000Z",
    estimatedGramsLeft: 100,
    hexColor: "#808080",
    id,
    lowStockThresholdGrams: 50,
    materialType: "PLA",
    name: `Spool ${id}`,
    notes: "",
    purchaseSource: "",
    spoolCost: 1000,
    spoolStatus: "open",
    startingGrams: 1000,
    transmissionDistance: null,
    updatedAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

function makeProduct(filament: ProductHueForgeFilament): ProductRecord {
  return {
    authorName: "Studio",
    businesses: [],
    canPrintWithInventory: true,
    category: "Bookmarks",
    commercialLicenseStatus: "commercial-ok",
    createdAt: "2026-07-17T00:00:00.000Z",
    designName: "Alternative Selection Test",
    estimatedPrintHours: 1,
    filamentMode: "hueforge",
    hueForgeFilaments: [filament],
    id: 1,
    imageReference: "",
    licenseBillingInterval: "none",
    licenseCostAmount: 0,
    notes: "",
    saleUnit: "piece",
    sourceLink: "https://example.com/model",
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}
