import { describe, expect, it, vi } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";

import { createSalesRepository, type SaleCreateInput } from "./salesRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  constructor(
    private readonly failSaleInsert = false,
    private readonly failInactiveRollback = false,
    private readonly salesTableSql: string | null = null,
  ) {}

  private saleRow = {
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

    if (query === "ROLLBACK" && this.failInactiveRollback) {
      throw new Error("error returned from database: (code: 1) cannot rollback - no transaction is active");
    }

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

    if (query.includes("FROM sqlite_master")) {
      return (this.salesTableSql ? [{ sql: this.salesTableSql }] : []) as T;
    }

    if (query.includes("FROM sale_stock_movements")) {
      return [this.movementRow] as T;
    }

    return [this.saleRow] as T;
  }
}

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
  it("creates sales and movement schemas before the first query", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createSalesRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed[0]?.query).toContain("CREATE TABLE IF NOT EXISTS sales");
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("CREATE TABLE IF NOT EXISTS sale_stock_movements"),
    )).toBe(true);
    expect(fakeDb.selected.some((statement) => statement.query.includes("FROM sales"))).toBe(true);
  });

  it("migrates the old sales channel check constraint", async () => {
    const fakeDb = new FakeDatabase(
      false,
      false,
      "CREATE TABLE sales (channel TEXT NOT NULL CHECK (channel IN ('Etsy', 'Shopify', 'Local', 'Direct', 'Other')))",
    );
    const repository = createSalesRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("CREATE TABLE sales_channel_migration"),
    )).toBe(true);
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("ALTER TABLE sales_channel_migration RENAME TO sales"),
    )).toBe(true);
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

  it("records sales with stock movement through the native transaction command", async () => {
    const fakeDb = new FakeDatabase();
    const nativeSaleRecorder = vi.fn(async () => 1);
    const repository = createSalesRepository(async () => fakeDb, nativeSaleRecorder);

    const sale = await repository.recordSaleWithStockMovement(input);

    expect(sale.id).toBe(1);
    expect(nativeSaleRecorder).toHaveBeenCalledWith(
      input,
      expect.objectContaining({
        discountsFees: 2.5,
        grossRevenue: 45,
        netRevenue: 42.5,
      }),
    );
    expect(fakeDb.executed.some((statement) => statement.query === "BEGIN IMMEDIATE")).toBe(false);
    expect(fakeDb.executed.some((statement) => statement.query === "COMMIT")).toBe(false);
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("UPDATE finished_goods"),
    )).toBe(false);
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("INSERT INTO finished_good_stock_adjustments"),
    )).toBe(false);
    expect(fakeDb.selected.some((statement) => statement.query.includes("WHERE id = $1"))).toBe(true);
  });

  it("surfaces native stock movement errors without issuing JS transaction statements", async () => {
    const fakeDb = new FakeDatabase();
    const nativeSaleRecorder = vi.fn(async () => {
      throw new Error("native sale failure");
    });
    const repository = createSalesRepository(async () => fakeDb, nativeSaleRecorder);

    await expect(repository.recordSaleWithStockMovement(input)).rejects.toThrow("native sale failure");

    expect(nativeSaleRecorder).toHaveBeenCalledOnce();
    expect(fakeDb.executed.some((statement) => statement.query === "BEGIN IMMEDIATE")).toBe(false);
    expect(fakeDb.executed.some((statement) => statement.query === "COMMIT")).toBe(false);
    expect(fakeDb.executed.some((statement) => statement.query === "ROLLBACK")).toBe(false);
  });

  it("does not hide the original create error when rollback is already inactive", async () => {
    const fakeDb = new FakeDatabase(true, true);
    const repository = createSalesRepository(async () => fakeDb);

    await expect(repository.create(input)).rejects.toThrow("insert failed");
    expect(fakeDb.executed.some((statement) => statement.query === "ROLLBACK")).toBe(true);
  });
});
