import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  saveShoppingItemNative,
  type SaveShoppingItemCommand,
} from "@/data/db/nativeWorkflows";
import {
  normalizeShoppingProductIds,
  validateShoppingListItemInput,
  type ShoppingItemCategory,
  type ShoppingItemPriority,
  type ShoppingItemStatus,
  type ShoppingListItemInput,
  type ShoppingListItemRecord,
  type ShoppingSourceType,
} from "@/domain/shopping";

export interface ShoppingListRepository {
  create(input: ShoppingListItemInput): Promise<ShoppingListItemRecord>;
  get(id: number): Promise<ShoppingListItemRecord | null>;
  list(): Promise<ShoppingListItemRecord[]>;
  update(id: number, input: ShoppingListItemInput): Promise<ShoppingListItemRecord>;
  updateStatus(id: number, status: ShoppingItemStatus): Promise<ShoppingListItemRecord>;
}

interface ShoppingListItemRow {
  readonly category: string;
  readonly created_at: string;
  readonly id: number;
  readonly item_name: string;
  readonly notes: string | null;
  readonly priority: string;
  readonly product_id: number | null;
  readonly quantity_needed: number;
  readonly required_transmission_distance: number | null;
  readonly shopee_listing_name: string | null;
  readonly source_note: string | null;
  readonly source_type: string;
  readonly status: string;
  readonly unit: string;
  readonly updated_at: string;
}

interface ShoppingListItemProductRow {
  readonly product_id: number;
  readonly shopping_item_id: number;
}

type DatabaseFactory = () => Promise<SqlDatabase>;
type ShoppingItemSaver = (input: SaveShoppingItemCommand) => Promise<number>;

const SHOPPING_LIST_COLUMNS = `
  id,
  item_name,
  product_id,
  category,
  quantity_needed,
  required_transmission_distance,
  shopee_listing_name,
  unit,
  priority,
  status,
  source_type,
  source_note,
  notes,
  created_at,
  updated_at
`;

export function createShoppingListRepository(
  databaseFactory: DatabaseFactory = getDatabase,
  shoppingItemSaver: ShoppingItemSaver = saveShoppingItemNative,
): ShoppingListRepository {
  async function database(): Promise<SqlDatabase> {
    return databaseFactory();
  }

  return {
    async create(input) {
      const validation = validateShoppingListItemInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid shopping list item.");
      }

      const productIds = normalizeShoppingProductIds(input.productIds, input.productId);
      await database();
      const insertedId = await shoppingItemSaver(toNativeShoppingItem(null, input, productIds));
      const created = await this.get(insertedId);

      if (!created) {
        throw new Error("Inserted shopping item could not be loaded.");
      }

      return created;
    },

    async get(id) {
      const db = await database();
      const rows = await db.select<ShoppingListItemRow[]>(
        `SELECT ${SHOPPING_LIST_COLUMNS}
         FROM shopping_list_items
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      if (!rows[0]) {
        return null;
      }

      const productIds = await listProductLinks(db, [rows[0].id]);

      return mapShoppingListItemRow(rows[0], productIds.get(rows[0].id));
    },

    async list() {
      const db = await database();
      const rows = await db.select<ShoppingListItemRow[]>(
        `SELECT ${SHOPPING_LIST_COLUMNS}
         FROM shopping_list_items
         ORDER BY
          CASE status
            WHEN 'open' THEN 0
            WHEN 'purchased' THEN 1
            ELSE 2
          END,
          CASE priority
            WHEN 'high' THEN 0
            WHEN 'normal' THEN 1
            ELSE 2
          END,
          created_at DESC,
          id DESC`,
      );

      const productLinks = await listProductLinks(db, rows.map((row) => row.id));

      return rows.map((row) => mapShoppingListItemRow(row, productLinks.get(row.id)));
    },

    async update(id, input) {
      const validation = validateShoppingListItemInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid shopping list item.");
      }

      const productIds = normalizeShoppingProductIds(input.productIds, input.productId);
      await database();
      await shoppingItemSaver(toNativeShoppingItem(id, input, productIds));

      const updated = await this.get(id);

      if (!updated) {
        throw new Error("Updated shopping item could not be loaded.");
      }

      return updated;
    },

    async updateStatus(id, status) {
      const db = await database();
      const result = await db.execute(
        `UPDATE shopping_list_items
         SET
          status = $1,
          updated_at = datetime('now')
         WHERE id = $2`,
        [status, id],
      );

      if (result.rowsAffected === 0) {
        throw new Error(`Shopping list item ${id} does not exist.`);
      }

      const updated = await this.get(id);

      if (!updated) {
        throw new Error("Updated shopping item could not be loaded.");
      }

      return updated;
    },
  };
}

function toNativeShoppingItem(
  id: number | null,
  input: ShoppingListItemInput,
  productIds: readonly number[],
): SaveShoppingItemCommand {
  return {
    category: input.category,
    id,
    itemName: input.itemName.trim(),
    notes: input.notes.trim(),
    priority: input.priority,
    productIds,
    quantityNeeded: input.quantityNeeded,
    requiredTransmissionDistance: input.requiredTransmissionDistance,
    shopeeListingName: input.shopeeListingName.trim(),
    sourceNote: input.sourceNote.trim(),
    sourceType: input.sourceType,
    status: input.status,
    unit: input.unit.trim(),
  };
}

function mapShoppingListItemRow(
  row: ShoppingListItemRow,
  linkedProductIds: readonly number[] = [],
): ShoppingListItemRecord {
  const productIds = normalizeShoppingProductIds(linkedProductIds, row.product_id ?? null);

  return {
    category: row.category as ShoppingItemCategory,
    createdAt: row.created_at,
    id: row.id,
    itemName: row.item_name,
    notes: row.notes ?? "",
    priority: row.priority as ShoppingItemPriority,
    productId: productIds[0] ?? null,
    productIds,
    quantityNeeded: row.quantity_needed,
    requiredTransmissionDistance: row.required_transmission_distance ?? null,
    shopeeListingName: row.shopee_listing_name ?? "",
    sourceNote: row.source_note ?? "",
    sourceType: row.source_type as ShoppingSourceType,
    status: row.status as ShoppingItemStatus,
    unit: row.unit,
    updatedAt: row.updated_at,
  };
}

async function listProductLinks(
  db: SqlDatabase,
  shoppingItemIds: readonly number[],
): Promise<Map<number, readonly number[]>> {
  const uniqueIds = [...new Set(shoppingItemIds.filter((id) => Number.isInteger(id) && id > 0))];
  const productLinks = new Map<number, number[]>();

  if (uniqueIds.length === 0) {
    return productLinks;
  }

  const placeholders = uniqueIds.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await db.select<ShoppingListItemProductRow[]>(
    `SELECT shopping_item_id, product_id
     FROM shopping_list_item_products
     WHERE shopping_item_id IN (${placeholders})
     ORDER BY shopping_item_id, created_at, product_id`,
    uniqueIds,
  );

  for (const row of rows) {
    const current = productLinks.get(row.shopping_item_id) ?? [];
    current.push(row.product_id);
    productLinks.set(row.shopping_item_id, current);
  }

  return productLinks;
}

export const shoppingListRepository = createShoppingListRepository();
