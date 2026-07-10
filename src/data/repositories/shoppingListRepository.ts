import { getDatabase, type SqlDatabase } from "@/data/db/client";
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
): ShoppingListRepository {
  let schemaReady = false;

  async function database(): Promise<SqlDatabase> {
    const db = await databaseFactory();

    if (!schemaReady) {
      await ensureShoppingListSchema(db);
      schemaReady = true;
    }

    return db;
  }

  return {
    async create(input) {
      const validation = validateShoppingListItemInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid shopping list item.");
      }

      const db = await database();
      const productIds = normalizeShoppingProductIds(input.productIds, input.productId);
      const primaryProductId = productIds[0] ?? null;
      const result = await db.execute(
        `INSERT INTO shopping_list_items (
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
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          input.itemName.trim(),
          primaryProductId,
          input.category,
          input.quantityNeeded,
          input.requiredTransmissionDistance,
          input.shopeeListingName.trim(),
          input.unit.trim(),
          input.priority,
          input.status,
          input.sourceType,
          input.sourceNote.trim(),
          input.notes.trim(),
        ],
      );

      if (result.lastInsertId == null) {
        throw new Error("SQLite did not return the inserted shopping item id.");
      }

      await replaceProductLinks(db, result.lastInsertId, productIds);

      const created = await this.get(result.lastInsertId);

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

      const db = await database();
      const productIds = normalizeShoppingProductIds(input.productIds, input.productId);
      const primaryProductId = productIds[0] ?? null;
      const result = await db.execute(
        `UPDATE shopping_list_items
         SET
          item_name = $1,
          product_id = $2,
          category = $3,
          quantity_needed = $4,
          required_transmission_distance = $5,
          shopee_listing_name = $6,
          unit = $7,
          priority = $8,
          status = $9,
          source_type = $10,
          source_note = $11,
          notes = $12,
          updated_at = datetime('now')
         WHERE id = $13`,
        [
          input.itemName.trim(),
          primaryProductId,
          input.category,
          input.quantityNeeded,
          input.requiredTransmissionDistance,
          input.shopeeListingName.trim(),
          input.unit.trim(),
          input.priority,
          input.status,
          input.sourceType,
          input.sourceNote.trim(),
          input.notes.trim(),
          id,
        ],
      );

      if (result.rowsAffected === 0) {
        throw new Error(`Shopping list item ${id} does not exist.`);
      }

      await replaceProductLinks(db, id, productIds);

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

async function ensureShoppingListSchema(db: SqlDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT NOT NULL,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      category TEXT NOT NULL CHECK (
        category IN ('Filament', 'Hardware', 'Packaging', 'Tooling', 'License', 'Other')
      ),
      quantity_needed REAL NOT NULL CHECK (quantity_needed > 0),
      required_transmission_distance REAL CHECK (
        required_transmission_distance IS NULL OR required_transmission_distance >= 0
      ),
      shopee_listing_name TEXT,
      unit TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high')),
      status TEXT NOT NULL CHECK (status IN ('open', 'purchased', 'ignored')),
      source_type TEXT NOT NULL CHECK (
        source_type IN ('manual', 'low-stock-addon', 'missing-hueforge-filament')
      ),
      source_note TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await addColumnIfMissing(db, "shopping_list_items", "product_id", "INTEGER");
  await addColumnIfMissing(db, "shopping_list_items", "required_transmission_distance", "REAL");
  await addColumnIfMissing(db, "shopping_list_items", "shopee_listing_name", "TEXT");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS shopping_list_item_products (
      shopping_item_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (shopping_item_id, product_id),
      FOREIGN KEY (shopping_item_id) REFERENCES shopping_list_items(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    INSERT OR IGNORE INTO shopping_list_item_products (shopping_item_id, product_id)
    SELECT id, product_id
    FROM shopping_list_items
    WHERE product_id IS NOT NULL
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_shopping_list_status_priority
    ON shopping_list_items (status, priority, created_at DESC)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_shopping_list_product_status
    ON shopping_list_items (product_id, status, created_at DESC)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_shopping_list_item_products_product
    ON shopping_list_item_products (product_id, shopping_item_id)
  `);
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

async function replaceProductLinks(
  db: SqlDatabase,
  shoppingItemId: number,
  productIds: readonly number[],
): Promise<void> {
  await db.execute(
    "DELETE FROM shopping_list_item_products WHERE shopping_item_id = $1",
    [shoppingItemId],
  );

  for (const productId of productIds) {
    await db.execute(
      `INSERT OR IGNORE INTO shopping_list_item_products (shopping_item_id, product_id)
       VALUES ($1, $2)`,
      [shoppingItemId, productId],
    );
  }
}

async function addColumnIfMissing(
  db: SqlDatabase,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  const columns = await db.select<Array<{ readonly name: string }>>(`PRAGMA table_info(${tableName})`);

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export const shoppingListRepository = createShoppingListRepository();
