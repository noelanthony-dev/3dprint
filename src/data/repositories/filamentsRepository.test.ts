import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { FilamentInput } from "@/domain/inventory";

import { createFilamentRepository } from "./filamentsRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  private row = {
    brand: "eSUN",
    color_name: "Cold White",
    created_at: "2026-07-01T00:00:00.000Z",
    estimated_grams_left: 840,
    hex_color: "#f8f8f2",
    id: 1,
    low_stock_threshold_grams: 200,
    material_type: "PLA+",
    name: "Cold White",
    notes: "",
    purchase_source: "Local supplier",
    spool_cost: 21,
    spool_status: "open",
    starting_grams: 1000,
    transmission_distance: 2.1,
    updated_at: "2026-07-01T00:00:00.000Z",
  };

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    if (query.includes("INSERT INTO filaments")) {
      return { lastInsertId: 1, rowsAffected: 1 };
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    return [this.row] as T;
  }
}

const input: FilamentInput = {
  brand: " eSUN ",
  name: "Cold White",
  materialType: "PLA+",
  colorName: "Cold White",
  hexColor: "F8F8F2",
  transmissionDistance: 2.1,
  spoolStatus: "open",
  startingGrams: 1000,
  estimatedGramsLeft: 840,
  spoolCost: 21,
  purchaseSource: "Local supplier",
  notes: "",
  lowStockThresholdGrams: 200,
};

describe("filament repository", () => {
  it("creates the filament schema before the first query", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createFilamentRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed[0]?.query).toContain("CREATE TABLE IF NOT EXISTS filaments");
    expect(fakeDb.executed[1]?.query).toContain("CREATE INDEX IF NOT EXISTS idx_filaments_status_brand");
    expect(fakeDb.selected[0]?.query).toContain("FROM filaments");
  });

  it("binds create values instead of interpolating user input", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createFilamentRepository(async () => fakeDb);

    await repository.create(input);

    const insert = fakeDb.executed.find((statement) => statement.query.includes("INSERT INTO filaments"));

    expect(insert?.query).toContain("VALUES ($1, $2, $3");
    expect(insert?.query).not.toContain("eSUN");
    expect(insert?.values[0]).toBe("eSUN");
    expect(insert?.values[4]).toBe("#f8f8f2");
  });
});
