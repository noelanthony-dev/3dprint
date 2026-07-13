import { describe, expect, it } from "vitest";

import type { PrintProfileRecord } from "@/domain/costing";

import { createAddOnFormRow, syncAddOnQuantities, toFormState } from "./CostingPage";

describe("costing add-on form helpers", () => {
  it("creates a new row with the expected good quantity", () => {
    expect(createAddOnFormRow("4")).toMatchObject({
      addOnId: "",
      quantity: "4",
      totalCost: "0",
      unitCost: "0",
    });
  });

  it("syncs untouched quantities while preserving manual overrides", () => {
    const rows = [
      { ...createAddOnFormRow("4"), addOnId: "3" },
      { ...createAddOnFormRow("4"), addOnId: "4", quantity: "2" },
    ];
    expect(syncAddOnQuantities(rows, "4", "6").map((row) => row.quantity)).toEqual(["6", "2"]);
  });

  it("hydrates every saved add-on when editing a profile", () => {
    const profile: PrintProfileRecord = {
      addOns: [
        { addOnId: 3, description: "Mechanical switch", quantity: 1, totalCost: 6, unitCost: 6 },
        { addOnId: 4, description: "Lobster clasp", quantity: 1, totalCost: 6.3, unitCost: 6.3 },
      ],
      createdAt: "2026-07-13",
      electricityRatePerKwh: 15,
      expectedFailedUnits: 0,
      expectedGoodUnits: 1,
      filamentCostPerKg: 750,
      filamentGrams: 13,
      id: 8,
      laborMinutes: 15,
      laborRatePerHour: 25,
      notes: "",
      printerPowerWatts: 100,
      printHours: 0,
      printMinutes: 41,
      productId: 1,
      profileName: "0.4mm Standard",
      saleUnit: "piece",
      supportGrams: 2,
      targetMarkup: 4,
      updatedAt: "2026-07-13",
      wearRatePerHour: 10,
    };

    expect(toFormState(profile).addOns).toHaveLength(2);
    expect(toFormState(profile).addOns[1]).toMatchObject({
      addOnId: "4",
      description: "Lobster clasp",
      quantity: "1",
      unitCost: "6.3",
    });
  });
});
