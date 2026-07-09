import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
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
  readonly source_note: string | null;
  readonly source_type: string;
  readonly status: string;
  readonly unit: string;
  readonly updated_at: string;
}

type DatabaseFactory = () => Promise<SqlDatabase>;

const SHOPPING_LIST_COLUMNS = `
  id,
  item_name,
  product_id,
  category,
  quantity_needed,
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
      const result = await db.execute(
        `INSERT INTO shopping_list_items (
          item_name,
          product_id,
          category,
          quantity_needed,
          unit,
          priority,
          status,
          source_type,
          source_note,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          input.itemName.trim(),
          input.productId,
          input.category,
          input.quantityNeeded,
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

      return rows[0] ? mapShoppingListItemRow(rows[0]) : null;
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

      return rows.map(mapShoppingListItemRow);
    },

    async update(id, input) {
      const validation = validateShoppingListItemInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid shopping list item.");
      }

      const db = await database();
      const result = await db.execute(
        `UPDATE shopping_list_items
         SET
          item_name = $1,
          product_id = $2,
          category = $3,
          quantity_needed = $4,
          unit = $5,
          priority = $6,
          status = $7,
          source_type = $8,
          source_note = $9,
          notes = $10,
          updated_at = datetime('now')
         WHERE id = $11`,
        [
          input.itemName.trim(),
          input.productId,
          input.category,
          input.quantityNeeded,
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

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_shopping_list_status_priority
    ON shopping_list_items (status, priority, created_at DESC)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_shopping_list_product_status
    ON shopping_list_items (product_id, status, created_at DESC)
  `);
}

function mapShoppingListItemRow(row: ShoppingListItemRow): ShoppingListItemRecord {
  return {
    category: row.category as ShoppingItemCategory,
    createdAt: row.created_at,
    id: row.id,
    itemName: row.item_name,
    notes: row.notes ?? "",
    priority: row.priority as ShoppingItemPriority,
    productId: row.product_id ?? null,
    quantityNeeded: row.quantity_needed,
    sourceNote: row.source_note ?? "",
    sourceType: row.source_type as ShoppingSourceType,
    status: row.status as ShoppingItemStatus,
    unit: row.unit,
    updatedAt: row.updated_at,
  };
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
