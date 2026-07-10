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
  private productLinks = new Map<number, number[]>([[1, [7]]]);

  private row = {
    category: "Hardware",
    created_at: "2026-07-02T00:00:00.000Z",
    id: 1,
    item_name: "6x2mm magnets",
    notes: "Restock before weekend market",
    priority: "high",
    product_id: 7 as number | null,
    quantity_needed: 150,
    required_transmission_distance: 2.1 as number | null,
    shopee_listing_name: "Bambu PLA Basic Green 1kg" as string | null,
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

    if (query.includes("DELETE FROM shopping_list_item_products")) {
      this.productLinks.delete(bindValues[0] as number);
      return { rowsAffected: 1 };
    }

    if (query.includes("INSERT OR IGNORE INTO shopping_list_item_products") && query.includes("VALUES")) {
      const shoppingItemId = bindValues[0] as number;
      const productId = bindValues[1] as number;
      const current = this.productLinks.get(shoppingItemId) ?? [];

      if (!current.includes(productId)) {
        this.productLinks.set(shoppingItemId, [...current, productId]);
      }

      return { rowsAffected: 1 };
    }

    if (query.includes("UPDATE shopping_list_items") && bindValues.length > 0) {
      if (query.includes("item_name = $1")) {
        this.row = {
          ...this.row,
          item_name: bindValues[0] as string,
          product_id: bindValues[1] as number | null,
          category: bindValues[2] as string,
          quantity_needed: bindValues[3] as number,
          required_transmission_distance: bindValues[4] as number | null,
          shopee_listing_name: bindValues[5] as string,
          unit: bindValues[6] as string,
          priority: bindValues[7] as string,
          status: bindValues[8] as string,
          source_type: bindValues[9] as string,
          source_note: bindValues[10] as string,
          notes: bindValues[11] as string,
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

    if (query.includes("ALTER TABLE shopping_list_items ADD COLUMN required_transmission_distance")) {
      this.shoppingListColumns.push("required_transmission_distance");
    }

    if (query.includes("ALTER TABLE shopping_list_items ADD COLUMN shopee_listing_name")) {
      this.shoppingListColumns.push("shopee_listing_name");
    }

    if (query.includes("INSERT OR IGNORE INTO shopping_list_item_products") && query.includes("SELECT id, product_id")) {
      this.productLinks.set(1, [7]);
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    if (query.includes("PRAGMA table_info(shopping_list_items)")) {
      return this.shoppingListColumns.map((name) => ({ name })) as T;
    }

    if (query.includes("FROM shopping_list_item_products")) {
      const itemIds = bindValues as readonly number[];
      const rows = itemIds.flatMap((shoppingItemId) =>
        (this.productLinks.get(shoppingItemId) ?? []).map((productId) => ({
          product_id: productId,
          shopping_item_id: shoppingItemId,
        })),
      );

      return rows as T;
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
  productIds: [7],
  quantityNeeded: 150,
  requiredTransmissionDistance: 2.1,
  shopeeListingName: " Bambu PLA Basic Green 1kg ",
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
    expect(fakeDb.executed.some((statement) => statement.query.includes("ALTER TABLE shopping_list_items ADD COLUMN required_transmission_distance"))).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query.includes("ALTER TABLE shopping_list_items ADD COLUMN shopee_listing_name"))).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query.includes("CREATE TABLE IF NOT EXISTS shopping_list_item_products"))).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query.includes("SELECT id, product_id"))).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query.includes("CREATE INDEX IF NOT EXISTS idx_shopping_list_status_priority"))).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query.includes("CREATE INDEX IF NOT EXISTS idx_shopping_list_product_status"))).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query.includes("CREATE INDEX IF NOT EXISTS idx_shopping_list_item_products_product"))).toBe(true);
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
    expect(insert?.values[4]).toBe(2.1);
    expect(insert?.values[5]).toBe("Bambu PLA Basic Green 1kg");
    expect(insert?.values[10]).toBe("Manual entry");
    expect(fakeDb.executed.some((statement) => statement.query.includes("INSERT OR IGNORE INTO shopping_list_item_products") && statement.values[1] === 7)).toBe(true);
  });

  it("maps selected product ids from shopping product links", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createShoppingListRepository(async () => fakeDb);

    const item = await repository.get(1);

    expect(item?.productId).toBe(7);
    expect(item?.productIds).toEqual([7]);
    expect(item?.requiredTransmissionDistance).toBe(2.1);
    expect(item?.shopeeListingName).toBe("Bambu PLA Basic Green 1kg");
  });

  it("updates shopping item details through bound values", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createShoppingListRepository(async () => fakeDb);

    const updated = await repository.update(1, {
      ...input,
      itemName: " Bambu Lab Hot Pink PLA ",
      productId: 9,
      productIds: [9, 10],
      requiredTransmissionDistance: 4.2,
      shopeeListingName: " Jayo Matte White PLA Shopee ",
      sourceNote: " For rose bookmark ",
    });

    const update = fakeDb.executed.find((statement) =>
      statement.query.includes("UPDATE shopping_list_items") && statement.query.includes("item_name = $1"),
    );

    expect(update?.query).not.toContain("Bambu Lab Hot Pink PLA");
    expect(update?.values[0]).toBe("Bambu Lab Hot Pink PLA");
    expect(update?.values[1]).toBe(9);
    expect(update?.values[4]).toBe(4.2);
    expect(update?.values[5]).toBe("Jayo Matte White PLA Shopee");
    expect(update?.values[10]).toBe("For rose bookmark");
    expect(update?.values[12]).toBe(1);
    expect(fakeDb.executed.some((statement) => statement.query.includes("DELETE FROM shopping_list_item_products") && statement.values[0] === 1)).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query.includes("INSERT OR IGNORE INTO shopping_list_item_products") && statement.values[1] === 10)).toBe(true);
    expect(updated.itemName).toBe("Bambu Lab Hot Pink PLA");
    expect(updated.productId).toBe(9);
    expect(updated.productIds).toEqual([9, 10]);
    expect(updated.requiredTransmissionDistance).toBe(4.2);
    expect(updated.shopeeListingName).toBe("Jayo Matte White PLA Shopee");
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
