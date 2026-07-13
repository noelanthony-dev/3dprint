import { describe, expect, it, vi } from "vitest";

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

  setReadyQuantity(quantityReady: number): void {
    this.row = { ...this.row, quantity_ready: quantityReady };
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
  it("queries finished goods without frontend schema writes", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createFinishedGoodsRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed).toEqual([]);
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

  it("records manual stock adjustments through one native transaction", async () => {
    const fakeDb = new FakeDatabase();
    const stockAdjuster = vi.fn(async (command: { readonly quantityAfter: number }) => {
      fakeDb.setReadyQuantity(command.quantityAfter);
    });
    const repository = createFinishedGoodsRepository(async () => fakeDb, stockAdjuster);

    const updated = await repository.adjustStock(1, adjustment);

    expect(stockAdjuster).toHaveBeenCalledWith({
      id: 1,
      notes: "",
      quantityAfter: 10,
      quantityBefore: 8,
      quantityDelta: 2,
      reason: "manual count",
    });
    expect(fakeDb.executed).toEqual([]);
    expect(updated.quantityReady).toBe(10);
  });
});
