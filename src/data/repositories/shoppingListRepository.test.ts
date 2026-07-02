import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { ShoppingListItemInput } from "@/domain/shopping";

import { createShoppingListRepository } from "./shoppingListRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  private row = {
    category: "Hardware",
    created_at: "2026-07-02T00:00:00.000Z",
    id: 1,
    item_name: "6x2mm magnets",
    notes: "Restock before weekend market",
    priority: "high",
    quantity_needed: 150,
    source_note: "Manual entry",
    source_type: "manual",
    status: "open",
    unit: "pcs",
    updated_at: "2026-07-02T00:00:00.000Z",
  };

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    if (query.includes("INSERT INTO shopping_list_items")) {
      return { lastInsertId: 1, rowsAffected: 1 };
    }

    if (query.includes("UPDATE shopping_list_items") && bindValues.length > 0) {
      this.row = {
        ...this.row,
        status: bindValues[0] as string,
      };
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    return [this.row] as T;
  }
}

const input: ShoppingListItemInput = {
  category: "Hardware",
  itemName: " 6x2mm magnets ",
  notes: " Restock before weekend market ",
  priority: "high",
  quantityNeeded: 150,
  sourceNote: " Manual entry ",
  sourceType: "manual",
  status: "open",
  unit: "pcs",
};

describe("shopping list repository", () => {
  it("creates shopping list schema before the first query", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createShoppingListRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed[0]?.query).toContain("CREATE TABLE IF NOT EXISTS shopping_list_items");
    expect(fakeDb.executed[1]?.query).toContain("CREATE INDEX IF NOT EXISTS idx_shopping_list_status_priority");
    expect(fakeDb.selected[0]?.query).toContain("FROM shopping_list_items");
  });

  it("binds create values instead of interpolating item text", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createShoppingListRepository(async () => fakeDb);

    await repository.create(input);

    const insert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO shopping_list_items"),
    );

    expect(insert?.query).toContain("VALUES ($1, $2, $3");
    expect(insert?.query).not.toContain("6x2mm magnets");
    expect(insert?.values[0]).toBe("6x2mm magnets");
    expect(insert?.values[7]).toBe("Manual entry");
  });

  it("updates shopping item status through repository SQL", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createShoppingListRepository(async () => fakeDb);

    const updated = await repository.updateStatus(1, "purchased");

    const update = fakeDb.executed.find((statement) =>
      statement.query.includes("UPDATE shopping_list_items"),
    );

    expect(update?.values).toEqual(["purchased", 1]);
    expect(updated.status).toBe("purchased");
  });
});
