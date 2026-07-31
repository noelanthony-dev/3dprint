import { describe, expect, it } from "vitest";

import type { PrintProfileRecord } from "@/domain/costing";

import {
  createAddOnFormRow,
  formatRepositoryError,
  nextSavedProfileSort,
  sortSavedProfiles,
  syncAddOnQuantities,
  toFormState,
} from "./CostingPage";

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

describe("costing repository errors", () => {
  it("shows the native Tauri error instead of claiming the desktop app is unavailable", () => {
    expect(formatRepositoryError("The PrintOps database is being used by another process.")).toBe(
      "The PrintOps database is being used by another process.",
    );
  });

  it("supports serialized error-shaped values from the native bridge", () => {
    expect(formatRepositoryError({ message: "Native query failed." })).toBe(
      "Native query failed.",
    );
  });

  it("keeps the browser-preview guidance for missing invoke support", () => {
    expect(formatRepositoryError(new Error("Cannot invoke db_select outside Tauri."))).toContain(
      "browser preview",
    );
  });
});

describe("saved profile sorting", () => {
  const profiles = [
    createProfile({ id: 1, totalCost: 30, targetMarkup: 2 }),
    createProfile({ id: 2, totalCost: 10, targetMarkup: 4 }),
    createProfile({ id: 3, totalCost: 20, targetMarkup: 2.5 }),
  ];

  it("cycles each sortable header from descending to ascending to none", () => {
    const descending = nextSavedProfileSort(null, "unit-cost");
    const ascending = nextSavedProfileSort(descending, "unit-cost");

    expect(descending).toEqual({ column: "unit-cost", direction: "descending" });
    expect(ascending).toEqual({ column: "unit-cost", direction: "ascending" });
    expect(nextSavedProfileSort(ascending, "unit-cost")).toBeNull();
  });

  it("starts descending when switching to the other sortable header", () => {
    expect(
      nextSavedProfileSort(
        { column: "unit-cost", direction: "ascending" },
        "gross-margin",
      ),
    ).toEqual({ column: "gross-margin", direction: "descending" });
  });

  it("sorts unit cost in both directions and restores repository order", () => {
    expect(
      sortSavedProfiles(profiles, {
        column: "unit-cost",
        direction: "descending",
      }).map((profile) => profile.id),
    ).toEqual([1, 3, 2]);
    expect(
      sortSavedProfiles(profiles, {
        column: "unit-cost",
        direction: "ascending",
      }).map((profile) => profile.id),
    ).toEqual([2, 3, 1]);
    expect(sortSavedProfiles(profiles, null).map((profile) => profile.id)).toEqual([1, 2, 3]);
  });

  it("sorts gross margin in both directions", () => {
    expect(
      sortSavedProfiles(profiles, {
        column: "gross-margin",
        direction: "descending",
      }).map((profile) => profile.id),
    ).toEqual([2, 3, 1]);
    expect(
      sortSavedProfiles(profiles, {
        column: "gross-margin",
        direction: "ascending",
      }).map((profile) => profile.id),
    ).toEqual([1, 3, 2]);
  });
});

function createProfile({
  id,
  targetMarkup,
  totalCost,
}: {
  readonly id: number;
  readonly targetMarkup: number;
  readonly totalCost: number;
}): PrintProfileRecord {
  return {
    addOns: [
      {
        addOnId: id,
        description: `Add-on ${id}`,
        quantity: 1,
        totalCost,
        unitCost: totalCost,
      },
    ],
    createdAt: "2026-07-30",
    electricityRatePerKwh: 0,
    expectedFailedUnits: 0,
    expectedGoodUnits: 1,
    filamentCostPerKg: 0,
    filamentGrams: 0,
    id,
    laborMinutes: 0,
    laborRatePerHour: 0,
    notes: "",
    printerPowerWatts: 0,
    printHours: 0,
    printMinutes: 0,
    productId: id,
    profileName: `Profile ${id}`,
    saleUnit: "piece",
    supportGrams: 0,
    targetMarkup,
    updatedAt: "2026-07-30",
    wearRatePerHour: 0,
  };
}
