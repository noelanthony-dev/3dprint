import { getDatabase, type SqlDatabase } from "@/data/db/client";
import type { AddOnCategory, AddOnInput, AddOnRecord, AddOnUnit } from "@/domain/inventory";

export interface AddOnsRepository {
  create(input: AddOnInput): Promise<AddOnRecord>;
  get(id: number): Promise<AddOnRecord | null>;
  list(): Promise<AddOnRecord[]>;
  update(id: number, input: AddOnInput): Promise<AddOnRecord>;
}

interface AddOnRow {
  readonly category: string;
  readonly created_at: string;
  readonly id: number;
  readonly is_active: number;
  readonly item_name: string;
  readonly low_stock_threshold: number;
  readonly notes: string | null;
  readonly quantity_on_hand: number;
  readonly supplier: string | null;
  readonly unit: string;
  readonly unit_cost: number;
  readonly updated_at: string;
}

type DatabaseFactory = () => Promise<SqlDatabase>;

const ADD_ON_COLUMNS = `
  id,
  item_name,
  category,
  unit,
  quantity_on_hand,
  low_stock_threshold,
  unit_cost,
  supplier,
  notes,
  is_active,
  created_at,
  updated_at
`;

export function createAddOnsRepository(
  databaseFactory: DatabaseFactory = getDatabase,
): AddOnsRepository {
  let schemaReady = false;

  async function database(): Promise<SqlDatabase> {
    const db = await databaseFactory();

    if (!schemaReady) {
      await ensureAddOnsSchema(db);
      schemaReady = true;
    }

    return db;
  }

  return {
    async create(input) {
      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `INSERT INTO addons (
          item_name,
          category,
          unit,
          quantity_on_hand,
          low_stock_threshold,
          unit_cost,
          supplier,
          notes,
          is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        values,
      );

      if (result.lastInsertId == null) {
        throw new Error("SQLite did not return the inserted add-on id.");
      }

      const created = await this.get(result.lastInsertId);

      if (!created) {
        throw new Error("Inserted add-on could not be loaded.");
      }

      return created;
    },

    async get(id) {
      const db = await database();
      const rows = await db.select<AddOnRow[]>(
        `SELECT ${ADD_ON_COLUMNS}
         FROM addons
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      return rows[0] ? mapAddOnRow(rows[0]) : null;
    },

    async list() {
      const db = await database();
      const rows = await db.select<AddOnRow[]>(
        `SELECT ${ADD_ON_COLUMNS}
         FROM addons
         ORDER BY
           is_active DESC,
           category COLLATE NOCASE,
           item_name COLLATE NOCASE`,
      );

      return rows.map(mapAddOnRow);
    },

    async update(id, input) {
      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `UPDATE addons
         SET
          item_name = $1,
          category = $2,
          unit = $3,
          quantity_on_hand = $4,
          low_stock_threshold = $5,
          unit_cost = $6,
          supplier = $7,
          notes = $8,
          is_active = $9,
          updated_at = datetime('now')
         WHERE id = $10`,
        [...values, id],
      );

      if (result.rowsAffected === 0) {
        throw new Error(`Add-on ${id} does not exist.`);
      }

      const updated = await this.get(id);

      if (!updated) {
        throw new Error("Updated add-on could not be loaded.");
      }

      return updated;
    },
  };
}

async function ensureAddOnsSchema(db: SqlDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS addons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity_on_hand REAL NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
      low_stock_threshold REAL NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
      unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
      supplier TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_addons_active_category
    ON addons (is_active, category, item_name)
  `);
}

function toPersistedValues(input: AddOnInput): readonly unknown[] {
  return [
    input.itemName.trim(),
    input.category,
    input.unit,
    input.quantityOnHand,
    input.lowStockThreshold,
    input.unitCost,
    input.supplier.trim(),
    input.notes.trim(),
    input.isActive ? 1 : 0,
  ];
}

function mapAddOnRow(row: AddOnRow): AddOnRecord {
  return {
    category: row.category as AddOnCategory,
    createdAt: row.created_at,
    id: row.id,
    isActive: row.is_active === 1,
    itemName: row.item_name,
    lowStockThreshold: row.low_stock_threshold,
    notes: row.notes ?? "",
    quantityOnHand: row.quantity_on_hand,
    supplier: row.supplier ?? "",
    unit: row.unit as AddOnUnit,
    unitCost: row.unit_cost,
    updatedAt: row.updated_at,
  };
}

export const addOnsRepository = createAddOnsRepository();
