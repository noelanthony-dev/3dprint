import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";

import { createProductionRunsRepository, type ProductionRunCreateInput } from "./productionRunsRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  constructor(private readonly productionRunColumns = currentProductionRunColumns) {}

  private runRow = {
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
    notes: "Nozzle cleaned after run",
    print_profile_id: 6,
    product_id: 2,
    run_date: "2026-07-02",
    updated_at: "2026-07-02T00:00:00.000Z",
  };

  private filamentDeductionRow = {
    created_at: "2026-07-02T00:00:00.000Z",
    filament_id: 8,
    grams_after: 340,
    grams_before: 840,
    grams_deducted: 500,
    id: 1,
    production_run_id: 1,
  };

  private addOnDeductionRow = {
    addon_id: 3,
    created_at: "2026-07-02T00:00:00.000Z",
    id: 1,
    production_run_id: 1,
    quantity_after: 88,
    quantity_before: 100,
    quantity_deducted: 12,
  };

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    if (query.includes("INSERT INTO production_runs")) {
      return { lastInsertId: 1, rowsAffected: 1 };
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    if (query.includes("PRAGMA table_info(production_runs)")) {
      return this.productionRunColumns.map((name) => ({ name })) as T;
    }

    if (query.includes("FROM production_run_filaments")) {
      return [this.filamentDeductionRow] as T;
    }

    if (query.includes("FROM production_run_addons")) {
      return [this.addOnDeductionRow] as T;
    }

    return [this.runRow] as T;
  }
}

const currentProductionRunColumns = [
  "id",
  "product_id",
  "print_profile_id",
  "filament_id",
  "addon_id",
  "run_date",
  "expected_pieces",
  "good_pieces",
  "failed_pieces",
  "failure_reason",
  "notes",
  "filament_grams_deducted",
  "addon_quantity_deducted",
  "finished_good_id",
  "created_at",
  "updated_at",
];

const input: ProductionRunCreateInput = {
  addOnDeduction: {
    addOnId: 3,
    quantityAfter: 88,
    quantityBefore: 100,
    quantityDeducted: 12,
  },
  addOnId: 3,
  addOnQuantity: 12,
  addOnQuantityDeducted: 12,
  expectedPieces: 10,
  failedPieces: 1,
  failureReason: " Layer shift ",
  filamentDeduction: {
    filamentId: 8,
    gramsAfter: 340,
    gramsBefore: 840,
    gramsDeducted: 500,
  },
  filamentGramsDeducted: 500,
  filamentId: 8,
  finishedGoodId: 4,
  goodPieces: 9,
  notes: " Nozzle cleaned after run ",
  printProfileId: 6,
  productId: 2,
  runDate: " 2026-07-02 ",
};

describe("production runs repository", () => {
  it("creates run and deduction schemas before the first query", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createProductionRunsRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed[0]?.query).toContain("CREATE TABLE IF NOT EXISTS production_runs");
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("CREATE TABLE IF NOT EXISTS production_run_filaments"),
    )).toBe(true);
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("CREATE TABLE IF NOT EXISTS production_run_addons"),
    )).toBe(true);
    expect(fakeDb.selected.some((statement) =>
      statement.query.includes("PRAGMA table_info(production_runs)"),
    )).toBe(true);
    expect(fakeDb.selected.some((statement) =>
      statement.query.includes("FROM production_runs"),
    )).toBe(true);
  });

  it("adds columns that are missing from older production run tables", async () => {
    const fakeDb = new FakeDatabase(
      currentProductionRunColumns.filter(
        (column) =>
          ![
            "addon_id",
            "filament_grams_deducted",
            "addon_quantity_deducted",
            "finished_good_id",
          ].includes(column),
      ),
    );
    const repository = createProductionRunsRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("ALTER TABLE production_runs ADD COLUMN addon_id INTEGER"),
    )).toBe(true);
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("ALTER TABLE production_runs ADD COLUMN filament_grams_deducted"),
    )).toBe(true);
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("ALTER TABLE production_runs ADD COLUMN addon_quantity_deducted"),
    )).toBe(true);
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("ALTER TABLE production_runs ADD COLUMN finished_good_id INTEGER"),
    )).toBe(true);
  });

  it("binds production run and deduction values instead of interpolating notes", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createProductionRunsRepository(async () => fakeDb);

    await repository.create(input);

    const runInsert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO production_runs"),
    );
    const filamentInsert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO production_run_filaments"),
    );
    const addOnInsert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO production_run_addons"),
    );

    expect(fakeDb.executed.some((statement) => statement.query === "BEGIN IMMEDIATE")).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query === "COMMIT")).toBe(true);
    expect(runInsert?.query).toContain("VALUES ($1, $2, $3");
    expect(runInsert?.query).not.toContain("Nozzle cleaned");
    expect(runInsert?.values[4]).toBe("2026-07-02");
    expect(runInsert?.values[8]).toBe("Layer shift");
    expect(runInsert?.values[9]).toBe("Nozzle cleaned after run");
    expect(filamentInsert?.values).toEqual([1, 8, 500, 840, 340]);
    expect(addOnInsert?.values).toEqual([1, 3, 12, 100, 88]);
  });
});
