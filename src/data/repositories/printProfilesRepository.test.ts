import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { PrintProfileInput } from "@/domain/costing";

import { createPrintProfilesRepository } from "./printProfilesRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  private row = {
    add_on_cost: 2.5,
    add_on_description: "Magnets and box",
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

    return [this.row] as T;
  }
}

const input: PrintProfileInput = {
  addOnCost: 2.5,
  addOnDescription: " Magnets and box ",
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
  it("creates print profile schema before the first query", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createPrintProfilesRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed[0]?.query).toContain("CREATE TABLE IF NOT EXISTS print_profiles");
    expect(fakeDb.executed[1]?.query).toContain("CREATE INDEX IF NOT EXISTS idx_print_profiles_product");
    expect(fakeDb.selected[0]?.query).toContain("FROM print_profiles");
  });

  it("binds create values instead of interpolating profile text", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createPrintProfilesRepository(async () => fakeDb);

    await repository.create(input);

    const insert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO print_profiles"),
    );

    expect(insert?.query).toContain("VALUES ($1, $2, $3");
    expect(insert?.query).not.toContain("0.2mm Standard");
    expect(insert?.values[1]).toBe("0.2mm Standard");
    expect(insert?.values[6]).toBe("Magnets and box");
    expect(insert?.values[17]).toBe(3);
  });
});
