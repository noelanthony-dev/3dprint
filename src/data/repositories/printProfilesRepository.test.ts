import { describe, expect, it, vi } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { PrintProfileInput } from "@/domain/costing";

import { createPrintProfilesRepository } from "./printProfilesRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  private row = {
    add_on_cost: 2.5,
    add_on_description: "Magnets and box",
    add_on_id: 4,
    add_on_quantity: 5,
    created_at: "2026-07-01T00:00:00.000Z",
    electricity_rate_per_kwh: 0.15,
    expected_failed_units: 1,
    expected_good_units: 10,
    filament_cost_per_kg: 24.99,
    filament_grams: 450,
    id: 1,
    labor_minutes: 15,
    labor_rate_per_hour: 20,
    notes: "",
    printer_power_watts: 100,
    print_hours: 14,
    print_minutes: 30,
    product_id: 3,
    profile_name: "0.2mm Standard",
    sale_unit: "piece",
    support_grams: 45,
    target_markup: 3,
    updated_at: "2026-07-01T00:00:00.000Z",
    wear_rate_per_hour: 0.1,
  };

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    if (query.includes("INSERT INTO print_profiles")) {
      return { lastInsertId: 1, rowsAffected: 1 };
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    if (query.includes("PRAGMA table_info")) {
      return [
        { name: "add_on_id" },
        { name: "add_on_quantity" },
      ] as T;
    }

    if (query.includes("FROM print_profile_addons")) {
      return [
        { addon_id: 4, description: "Mechanical switch", print_profile_id: 1, quantity: 5, total_cost: 2.5, unit_cost: 0.5 },
      ] as T;
    }

    return [this.row] as T;
  }
}

const input: PrintProfileInput = {
  addOns: [
    { addOnId: 4, description: " Mechanical switch ", quantity: 5, totalCost: 2.5, unitCost: 0.5 },
    { addOnId: 5, description: " Lobster clasp ", quantity: 5, totalCost: 5, unitCost: 1 },
  ],
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
  productId: 3,
  profileName: " 0.2mm Standard ",
  saleUnit: "piece",
  supportGrams: 45,
  targetMarkup: 3,
  wearRatePerHour: 0.1,
};

describe("print profiles repository", () => {
  it("queries print profiles without frontend schema writes", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createPrintProfilesRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed).toEqual([]);
    expect(fakeDb.selected.some((statement) => statement.query.includes("PRAGMA"))).toBe(false);
    expect(fakeDb.selected.some((statement) => statement.query.includes("FROM print_profiles"))).toBe(true);
  });

  it("sends create values through one native transaction payload", async () => {
    const fakeDb = new FakeDatabase();
    const profileSaver = vi.fn(async () => 1);
    const repository = createPrintProfilesRepository(async () => fakeDb, profileSaver);

    await repository.create(input);

    expect(profileSaver).toHaveBeenCalledOnce();
    expect(profileSaver).toHaveBeenCalledWith(expect.objectContaining({
      addOns: [
        { addOnId: 4, description: "Mechanical switch", quantity: 5, totalCost: 2.5, unitCost: 0.5 },
        { addOnId: 5, description: "Lobster clasp", quantity: 5, totalCost: 5, unitCost: 1 },
      ],
      id: null,
      profileName: "0.2mm Standard",
      targetMarkup: 3,
    }));
    expect(fakeDb.executed).toEqual([]);
  });
});
