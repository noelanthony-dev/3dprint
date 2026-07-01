import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { FinishedGoodInput, FinishedGoodStockAdjustmentInput } from "@/domain/inventory";

import { createFinishedGoodsRepository } from "./finishedGoodsRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  private row = {
    created_at: "2026-07-01T00:00:00.000Z",
    id: 1,
    notes: "Shelf A",
    product_reference: "Dragon Egg - Small",
    quantity_ready: 8,
    quantity_reserved: 2,
    sale_unit: "piece",
    updated_at: "2026-07-01T00:00:00.000Z",
  };

  private adjustmentRow = {
    created_at: "2026-07-01T00:00:00.000Z",
    finished_good_id: 1,
    id: 1,
    notes: "",
    quantity_after: 10,
    quantity_delta: 2,
    reason: "manual count",
  };

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    if (query.includes("INSERT INTO finished_goods")) {
      return { lastInsertId: 1, rowsAffected: 1 };
    }

    if (query.includes("UPDATE finished_goods") && bindValues.length > 0) {
      this.row = {
        ...this.row,
        quantity_ready: bindValues[0] as number,
      };
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    if (query.includes("FROM finished_good_stock_adjustments")) {
      return [this.adjustmentRow] as T;
    }

    return [this.row] as T;
  }
}

const input: FinishedGoodInput = {
  notes: "Shelf A",
  productReference: " Dragon Egg - Small ",
  quantityReady: 8,
  quantityReserved: 2,
  saleUnit: "piece",
};

const adjustment: FinishedGoodStockAdjustmentInput = {
  notes: "",
  quantityDelta: 2,
  reason: " manual count ",
};

describe("finished goods repository", () => {
  it("creates finished goods and adjustment schema before the first query", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createFinishedGoodsRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed[0]?.query).toContain("CREATE TABLE IF NOT EXISTS finished_goods");
    expect(fakeDb.executed[1]?.query).toContain("CREATE INDEX IF NOT EXISTS idx_finished_goods_product_reference");
    expect(fakeDb.executed[2]?.query).toContain("CREATE TABLE IF NOT EXISTS finished_good_stock_adjustments");
    expect(fakeDb.executed[3]?.query).toContain("CREATE INDEX IF NOT EXISTS idx_finished_good_stock_adjustments_item");
    expect(fakeDb.selected[0]?.query).toContain("FROM finished_goods");
  });

  it("binds create values instead of interpolating product references", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createFinishedGoodsRepository(async () => fakeDb);

    await repository.create(input);

    const insert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO finished_goods"),
    );

    expect(insert?.query).toContain("VALUES ($1, $2, $3");
    expect(insert?.query).not.toContain("Dragon Egg");
    expect(insert?.values[0]).toBe("Dragon Egg - Small");
    expect(insert?.values[3]).toBe(2);
  });

  it("records manual stock adjustments through repository SQL", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createFinishedGoodsRepository(async () => fakeDb);

    const updated = await repository.adjustStock(1, adjustment);

    const update = fakeDb.executed.find((statement) =>
      statement.query.includes("UPDATE finished_goods"),
    );
    const adjustmentInsert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO finished_good_stock_adjustments"),
    );

    expect(fakeDb.executed.some((statement) => statement.query === "BEGIN IMMEDIATE")).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query === "COMMIT")).toBe(true);
    expect(update?.values).toEqual([10, 1]);
    expect(adjustmentInsert?.values).toEqual([1, 2, 10, "manual count", ""]);
    expect(updated.quantityReady).toBe(10);
  });
});
