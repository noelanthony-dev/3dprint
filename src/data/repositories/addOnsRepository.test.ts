import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { AddOnInput } from "@/domain/inventory";

import { createAddOnsRepository } from "./addOnsRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  private row = {
    category: "Hardware",
    created_at: "2026-07-01T00:00:00.000Z",
    id: 1,
    is_active: 1,
    item_name: "6x2mm magnets",
    low_stock_threshold: 100,
    notes: "",
    quantity_on_hand: 850,
    supplier: "Local supplier",
    unit: "pcs",
    unit_cost: 0.04,
    updated_at: "2026-07-01T00:00:00.000Z",
  };

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    if (query.includes("INSERT INTO addons")) {
      return { lastInsertId: 1, rowsAffected: 1 };
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    return [this.row] as T;
  }
}

const input: AddOnInput = {
  category: "Hardware",
  isActive: true,
  itemName: " 6x2mm magnets ",
  lowStockThreshold: 100,
  notes: "",
  quantityOnHand: 850,
  supplier: "Local supplier",
  unit: "pcs",
  unitCost: 0.04,
};

describe("add-ons repository", () => {
  it("queries add-ons without frontend schema writes", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createAddOnsRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed).toEqual([]);
    expect(fakeDb.selected[0]?.query).toContain("FROM addons");
  });

  it("binds create values instead of interpolating user input", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createAddOnsRepository(async () => fakeDb);

    await repository.create(input);

    const insert = fakeDb.executed.find((statement) => statement.query.includes("INSERT INTO addons"));

    expect(insert?.query).toContain("VALUES ($1, $2, $3");
    expect(insert?.query).not.toContain("6x2mm magnets");
    expect(insert?.values[0]).toBe("6x2mm magnets");
    expect(insert?.values[8]).toBe(1);
  });
});
