import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { ShoppingListItemInput } from "@/domain/shopping";

import { createShoppingListRepository } from "./shoppingListRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  private shoppingListColumns = [
    "id",
    "item_name",
    "category",
    "quantity_needed",
    "unit",
    "priority",
    "status",
    "source_type",
    "source_note",
    "notes",
    "created_at",
    "updated_at",
  ];

  private row = {
    category: "Hardware",
    created_at: "2026-07-02T00:00:00.000Z",
    id: 1,
    item_name: "6x2mm magnets",
    notes: "Restock before weekend market",
    priority: "high",
    product_id: 7 as number | null,
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
      if (query.includes("item_name = $1")) {
        this.row = {
          ...this.row,
          item_name: bindValues[0] as string,
          product_id: bindValues[1] as number | null,
          category: bindValues[2] as string,
          quantity_needed: bindValues[3] as number,
          unit: bindValues[4] as string,
          priority: bindValues[5] as string,
          status: bindValues[6] as string,
          source_type: bindValues[7] as string,
          source_note: bindValues[8] as string,
          notes: bindValues[9] as string,
        };
      } else {
        this.row = {
          ...this.row,
          status: bindValues[0] as string,
        };
      }
    }

    if (query.includes("ALTER TABLE shopping_list_items ADD COLUMN product_id")) {
      this.shoppingListColumns.push("product_id");
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    if (query.includes("PRAGMA table_info(shopping_list_items)")) {
      return this.shoppingListColumns.map((name) => ({ name })) as T;
    }

    return [this.row] as T;
  }
}

const input: ShoppingListItemInput = {
  category: "Hardware",
  itemName: " 6x2mm magnets ",
  notes: " Restock before weekend market ",
  priority: "high",
  productId: 7,
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
    expect(fakeDb.selected.some((statement) => statement.query.includes("PRAGMA table_info(shopping_list_items)"))).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query.includes("ALTER TABLE shopping_list_items ADD COLUMN product_id"))).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query.includes("CREATE INDEX IF NOT EXISTS idx_shopping_list_status_priority"))).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query.includes("CREATE INDEX IF NOT EXISTS idx_shopping_list_product_status"))).toBe(true);
    expect(fakeDb.selected.some((statement) => statement.query.includes("FROM shopping_list_items"))).toBe(true);
  });

  it("binds create values instead of interpolating item text", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createShoppingListRepository(async () => fakeDb);

    await repository.create(input);

    const insert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO shopping_list_items"),
    );

    expect(insert?.query).toContain("product_id");
    expect(insert?.query).toContain("VALUES ($1, $2, $3");
    expect(insert?.query).not.toContain("6x2mm magnets");
    expect(insert?.values[0]).toBe("6x2mm magnets");
    expect(insert?.values[1]).toBe(7);
    expect(insert?.values[8]).toBe("Manual entry");
  });

  it("maps selected product ids from shopping rows", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createShoppingListRepository(async () => fakeDb);

    const item = await repository.get(1);

    expect(item?.productId).toBe(7);
  });

  it("updates shopping item details through bound values", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createShoppingListRepository(async () => fakeDb);

    const updated = await repository.update(1, {
      ...input,
      itemName: " Bambu Lab Hot Pink PLA ",
      productId: 9,
      sourceNote: " For rose bookmark ",
    });

    const update = fakeDb.executed.find((statement) =>
      statement.query.includes("UPDATE shopping_list_items") && statement.query.includes("item_name = $1"),
    );

    expect(update?.query).not.toContain("Bambu Lab Hot Pink PLA");
    expect(update?.values[0]).toBe("Bambu Lab Hot Pink PLA");
    expect(update?.values[1]).toBe(9);
    expect(update?.values[8]).toBe("For rose bookmark");
    expect(update?.values[10]).toBe(1);
    expect(updated.itemName).toBe("Bambu Lab Hot Pink PLA");
    expect(updated.productId).toBe(9);
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
