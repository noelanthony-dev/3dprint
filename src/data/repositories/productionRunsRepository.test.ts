import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";

import { createProductionRunsRepository } from "./productionRunsRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });
    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    if (query.includes("FROM production_run_filaments")) {
      return [filamentDeductionRow] as T;
    }

    if (query.includes("FROM production_run_addons")) {
      return [addOnDeductionRow] as T;
    }

    if (query.includes("FROM production_run_addon_allocations")) {
      return [addOnAllocationRow] as T;
    }

    if (query.includes("FROM production_run_addon_correction_items")) {
      return [correctionItemRow] as T;
    }

    if (query.includes("FROM production_run_corrections\n         WHERE")) {
      return [correctionRow] as T;
    }

    return [runRow] as T;
  }
}

const runRow = {
  addon_correction_count: 0,
  addon_id: 3,
  addon_quantity_deducted: 12,
  created_at: "2026-07-02T00:00:00.000Z",
  expected_pieces: 10,
  failed_pieces: 1,
  failure_reason: "Layer shift",
  filament_grams_deducted: 500,
  filament_id: 8,
  finished_good_id: 4,
  good_pieces: 9,
  id: 1,
  last_addon_correction_at: null,
  notes: "Nozzle cleaned after run",
  print_profile_id: 6,
  product_id: 2,
  run_date: "2026-07-02",
  updated_at: "2026-07-02T00:00:00.000Z",
};

const addOnAllocationRow = {
  addon_id: 3,
  id: 2,
  production_run_id: 1,
  quantity_deducted: 12,
  sort_order: 0,
};

const correctionRow = {
  created_at: "2026-07-17 12:00:00",
  id: 7,
  production_run_id: 1,
  reason: "Forgot the clasp",
};

const correctionItemRow = {
  addon_id: 3,
  correction_id: 7,
  quantity_delta: 2,
  run_quantity_after: 14,
  run_quantity_before: 12,
  stock_quantity_after: 86,
  stock_quantity_before: 88,
};

const filamentDeductionRow = {
  created_at: "2026-07-02T00:00:00.000Z",
  filament_id: 8,
  grams_after: 340,
  grams_before: 840,
  grams_deducted: 500,
  id: 1,
  production_run_id: 1,
};

const addOnDeductionRow = {
  addon_id: 3,
  created_at: "2026-07-02T00:00:00.000Z",
  id: 1,
  production_run_id: 1,
  quantity_after: 88,
  quantity_before: 100,
  quantity_deducted: 12,
};

describe("production runs repository", () => {
  it("loads runs and child deductions without frontend DDL or transaction statements", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createProductionRunsRepository(async () => fakeDb);

    const runs = await repository.list();

    expect(runs[0]).toMatchObject({
      addOnDeductions: [expect.objectContaining({ addOnId: 3, quantityDeducted: 12 })],
      id: 1,
      productId: 2,
    });
    expect(fakeDb.executed).toEqual([]);
    expect(fakeDb.selected.some(({ query }) => query.includes("PRAGMA"))).toBe(false);
    expect(fakeDb.selected.some(({ query }) => query.includes("FROM production_runs"))).toBe(true);
  });

  it("maps filament and add-on history rows", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createProductionRunsRepository(async () => fakeDb);

    await expect(repository.listFilamentDeductions(1)).resolves.toEqual([
      expect.objectContaining({ filamentId: 8, gramsAfter: 340, gramsDeducted: 500 }),
    ]);
    await expect(repository.listAddOnDeductions(1)).resolves.toEqual([
      expect.objectContaining({ addOnId: 3, quantityAfter: 88, quantityDeducted: 12 }),
    ]);
    expect(fakeDb.executed).toEqual([]);
  });

  it("loads grouped add-on correction history", async () => {
    const repository = createProductionRunsRepository(async () => new FakeDatabase());

    await expect(repository.listAddOnCorrections(1)).resolves.toEqual([{
      createdAt: "2026-07-17 12:00:00",
      id: 7,
      items: [{
        addOnId: 3,
        quantityDelta: 2,
        runQuantityAfter: 14,
        runQuantityBefore: 12,
        stockQuantityAfter: 86,
        stockQuantityBefore: 88,
      }],
      productionRunId: 1,
      reason: "Forgot the clasp",
    }]);
  });
});
