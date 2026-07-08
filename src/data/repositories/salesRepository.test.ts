import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";

import { createSalesRepository, type SaleCreateInput } from "./salesRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  constructor(private readonly failSaleInsert = false) {}

  private saleRow = {
    channel: "Local",
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

  private movementRow = {
    created_at: "2026-07-02T00:00:00.000Z",
    finished_good_id: 4,
    id: 1,
    quantity_after: 7,
    quantity_before: 10,
    quantity_delta: -3,
    sale_id: 1,
  };

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    if (query.includes("INSERT INTO sales")) {
      if (this.failSaleInsert) {
        throw new Error("insert failed");
      }

      return { lastInsertId: 1, rowsAffected: 1 };
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    if (query.includes("FROM sale_stock_movements")) {
      return [this.movementRow] as T;
    }

    return [this.saleRow] as T;
  }
}

const input: SaleCreateInput = {
  channel: "Local",
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
  it("creates sales and movement schemas before the first query", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createSalesRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed[0]?.query).toContain("CREATE TABLE IF NOT EXISTS sales");
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("CREATE TABLE IF NOT EXISTS sale_stock_movements"),
    )).toBe(true);
    expect(fakeDb.selected[0]?.query).toContain("FROM sales");
  });

  it("binds sale and stock movement values instead of interpolating notes", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createSalesRepository(async () => fakeDb);

    await repository.create(input);

    const saleInsert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO sales"),
    );
    const movementInsert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO sale_stock_movements"),
    );

    expect(fakeDb.executed.some((statement) => statement.query === "BEGIN IMMEDIATE")).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query === "COMMIT")).toBe(true);
    expect(saleInsert?.query).toContain("VALUES ($1, $2, $3");
    expect(saleInsert?.query).not.toContain("Cash sale");
    expect(saleInsert?.values[1]).toBe("Articulated Dragon");
    expect(saleInsert?.values[2]).toBe("2026-07-02");
    expect(saleInsert?.values[8]).toBe(42.5);
    expect(saleInsert?.values[9]).toBe("Cash sale");
    expect(movementInsert?.values).toEqual([1, 4, -3, 10, 7]);
  });

  it("records sales, finished goods adjustments, and sale movements in one transaction", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createSalesRepository(async () => fakeDb);

    await repository.recordSaleWithStockMovement(input);

    const stockUpdateIndex = fakeDb.executed.findIndex((statement) =>
      statement.query.includes("UPDATE finished_goods"),
    );
    const finishedGoodsAdjustmentIndex = fakeDb.executed.findIndex((statement) =>
      statement.query.includes("INSERT INTO finished_good_stock_adjustments"),
    );
    const saleInsertIndex = fakeDb.executed.findIndex((statement) =>
      statement.query.includes("INSERT INTO sales"),
    );
    const saleMovementIndex = fakeDb.executed.findIndex((statement) =>
      statement.query.includes("INSERT INTO sale_stock_movements"),
    );

    expect(fakeDb.executed.some((statement) => statement.query === "BEGIN IMMEDIATE")).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query === "COMMIT")).toBe(true);
    expect(stockUpdateIndex).toBeGreaterThan(-1);
    expect(finishedGoodsAdjustmentIndex).toBeGreaterThan(stockUpdateIndex);
    expect(saleInsertIndex).toBeGreaterThan(finishedGoodsAdjustmentIndex);
    expect(saleMovementIndex).toBeGreaterThan(saleInsertIndex);
    expect(fakeDb.executed[stockUpdateIndex]?.values).toEqual([7, 4, 10]);
    expect(fakeDb.executed[finishedGoodsAdjustmentIndex]?.values).toEqual([
      4,
      -3,
      7,
      "sale",
      "Sale 2026-07-02: 3 piece via Local. Cash sale",
    ]);
  });

  it("rolls back the stock update when sale insertion fails", async () => {
    const fakeDb = new FakeDatabase(true);
    const repository = createSalesRepository(async () => fakeDb);

    await expect(repository.recordSaleWithStockMovement(input)).rejects.toThrow("insert failed");

    const stockUpdateIndex = fakeDb.executed.findIndex((statement) =>
      statement.query.includes("UPDATE finished_goods"),
    );
    const saleInsertIndex = fakeDb.executed.findIndex((statement) =>
      statement.query.includes("INSERT INTO sales"),
    );
    const rollbackIndex = fakeDb.executed.findIndex((statement) => statement.query === "ROLLBACK");

    expect(fakeDb.executed.some((statement) => statement.query === "BEGIN IMMEDIATE")).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query === "COMMIT")).toBe(false);
    expect(stockUpdateIndex).toBeGreaterThan(-1);
    expect(saleInsertIndex).toBeGreaterThan(stockUpdateIndex);
    expect(rollbackIndex).toBeGreaterThan(saleInsertIndex);
  });
});
