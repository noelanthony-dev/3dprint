import { describe, expect, it, vi } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";

import { createSalesRepository, type SaleCreateInput } from "./salesRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });
    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });
    return (query.includes("FROM sale_stock_movements") ? [movementRow] : [saleRow]) as T;
  }
}

const saleRow = {
  channel: "Direct",
  created_at: "2026-07-02T00:00:00.000Z",
  discounts_fees: 2.5,
  finished_good_id: 4,
  gross_revenue: 45,
  id: 1,
  net_revenue: 42.5,
  notes: "Cash sale",
  product_reference: "Articulated Dragon",
  quantity: 3,
  sale_date: "2026-07-02",
  sale_unit: "piece",
  stock_quantity_after: 7,
  stock_quantity_before: 10,
  updated_at: "2026-07-02T00:00:00.000Z",
};

const movementRow = {
  created_at: "2026-07-02T00:00:00.000Z",
  finished_good_id: 4,
  id: 1,
  quantity_after: 7,
  quantity_before: 10,
  quantity_delta: -3,
  sale_id: 1,
};

const input: SaleCreateInput = {
  channel: "Direct",
  discountsFees: 2.5,
  finishedGoodId: 4,
  grossRevenue: 45,
  notes: " Cash sale ",
  productReference: " Articulated Dragon ",
  quantity: 3,
  saleDate: " 2026-07-02 ",
  saleUnit: "piece",
  stockQuantityAfter: 7,
  stockQuantityBefore: 10,
};

describe("sales repository", () => {
  it("uses one native transaction command and performs no frontend writes", async () => {
    const fakeDb = new FakeDatabase();
    const nativeSaleRecorder = vi.fn(async () => 1);
    const repository = createSalesRepository(async () => fakeDb, nativeSaleRecorder);

    const sale = await repository.recordSaleWithStockMovement(input);

    expect(sale.id).toBe(1);
    expect(nativeSaleRecorder).toHaveBeenCalledOnce();
    expect(nativeSaleRecorder).toHaveBeenCalledWith(
      input,
      expect.objectContaining({ discountsFees: 2.5, grossRevenue: 45, netRevenue: 42.5 }),
    );
    expect(fakeDb.executed).toEqual([]);
    expect(fakeDb.selected.some(({ query }) => query.includes("WHERE id = $1"))).toBe(true);
  });

  it("surfaces native errors without BEGIN, COMMIT, ROLLBACK, or DDL", async () => {
    const fakeDb = new FakeDatabase();
    const nativeSaleRecorder = vi.fn(async () => {
      throw new Error("native sale failure");
    });
    const repository = createSalesRepository(async () => fakeDb, nativeSaleRecorder);

    await expect(repository.recordSaleWithStockMovement(input)).rejects.toThrow("native sale failure");
    expect(nativeSaleRecorder).toHaveBeenCalledOnce();
    expect(fakeDb.executed).toEqual([]);
  });

  it("maps sale stock movement reads", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createSalesRepository(async () => fakeDb, async () => 1);

    await expect(repository.listStockMovements(1)).resolves.toEqual([
      expect.objectContaining({ finishedGoodId: 4, quantityDelta: -3, saleId: 1 }),
    ]);
    expect(fakeDb.executed).toEqual([]);
  });

  it("updates sale price details through one native command without stock writes", async () => {
    const fakeDb = new FakeDatabase();
    const nativeSaleUpdater = vi.fn(async () => undefined);
    const repository = createSalesRepository(
      async () => fakeDb,
      async () => 1,
      nativeSaleUpdater,
    );
    const details = {
      channel: "Sincerely" as const,
      discountsFees: 10,
      grossRevenue: 150,
      notes: " Corrected price ",
      saleDate: " 2026-07-13 ",
    };

    await repository.updateDetails(1, details);

    expect(nativeSaleUpdater).toHaveBeenCalledOnce();
    expect(nativeSaleUpdater).toHaveBeenCalledWith(
      1,
      details,
      expect.objectContaining({ grossRevenue: 150, discountsFees: 10, netRevenue: 140 }),
    );
    expect(fakeDb.executed).toEqual([]);
  });
});
