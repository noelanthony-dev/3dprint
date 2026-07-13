import { describe, expect, it, vi } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { SaveShoppingItemCommand } from "@/data/db/nativeWorkflows";
import type { ShoppingListItemInput } from "@/domain/shopping";

import { createShoppingListRepository } from "./shoppingListRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

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

    if (query.includes("INSERT OR IGNORE INTO shopping_list_item_products") && query.includes("SELECT id, product_id")) {
      this.productLinks.set(1, [7]);
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

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

  applySavedItem(input: SaveShoppingItemCommand): void {
    this.row = {
      ...this.row,
      category: input.category,
      item_name: input.itemName,
      notes: input.notes,
      priority: input.priority,
      product_id: input.productIds[0] ?? null,
      quantity_needed: input.quantityNeeded,
      required_transmission_distance: input.requiredTransmissionDistance,
      shopee_listing_name: input.shopeeListingName,
      source_note: input.sourceNote,
      source_type: input.sourceType,
      status: input.status,
      unit: input.unit,
    };
    this.productLinks.set(this.row.id, [...input.productIds]);
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
  it("queries shopping items without frontend schema writes", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createShoppingListRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed).toEqual([]);
    expect(fakeDb.selected.some((statement) => statement.query.includes("PRAGMA"))).toBe(false);
    expect(fakeDb.selected.some((statement) => statement.query.includes("FROM shopping_list_items"))).toBe(true);
  });

  it("sends create values through one native transaction payload", async () => {
    const fakeDb = new FakeDatabase();
    const shoppingItemSaver = vi.fn(async () => 1);
    const repository = createShoppingListRepository(async () => fakeDb, shoppingItemSaver);

    await repository.create(input);

    expect(shoppingItemSaver).toHaveBeenCalledOnce();
    expect(shoppingItemSaver).toHaveBeenCalledWith(expect.objectContaining({
      id: null,
      itemName: "6x2mm magnets",
      productIds: [7],
      requiredTransmissionDistance: 2.1,
      shopeeListingName: "Bambu PLA Basic Green 1kg",
      sourceNote: "Manual entry",
    }));
    expect(fakeDb.executed).toEqual([]);
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

  it("updates shopping item and product links through one native payload", async () => {
    const fakeDb = new FakeDatabase();
    const shoppingItemSaver = vi.fn(async (command: SaveShoppingItemCommand) => {
      fakeDb.applySavedItem(command);
      return 1;
    });
    const repository = createShoppingListRepository(async () => fakeDb, shoppingItemSaver);

    const updated = await repository.update(1, {
      ...input,
      itemName: " Bambu Lab Hot Pink PLA ",
      productId: 9,
      productIds: [9, 10],
      requiredTransmissionDistance: 4.2,
      shopeeListingName: " Jayo Matte White PLA Shopee ",
      sourceNote: " For rose bookmark ",
    });

    expect(shoppingItemSaver).toHaveBeenCalledOnce();
    expect(shoppingItemSaver).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      itemName: "Bambu Lab Hot Pink PLA",
      productIds: [9, 10],
      requiredTransmissionDistance: 4.2,
      shopeeListingName: "Jayo Matte White PLA Shopee",
      sourceNote: "For rose bookmark",
    }));
    expect(fakeDb.executed).toEqual([]);
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
