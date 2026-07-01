import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  normalizeHexColor,
  type FilamentInput,
  type FilamentMaterial,
  type FilamentRecord,
  type FilamentStockAdjustmentInput,
  type FilamentStockAdjustmentRecord,
  type SpoolStatus,
  validateFilamentStockAdjustmentInput,
} from "@/domain/inventory";

export interface FilamentRepository {
  adjustStock(filamentId: number, input: FilamentStockAdjustmentInput): Promise<FilamentRecord>;
  create(input: FilamentInput): Promise<FilamentRecord>;
  get(id: number): Promise<FilamentRecord | null>;
  list(): Promise<FilamentRecord[]>;
  listAdjustments(filamentId: number): Promise<FilamentStockAdjustmentRecord[]>;
  update(id: number, input: FilamentInput): Promise<FilamentRecord>;
}

interface FilamentRow {
  readonly brand: string;
  readonly color_name: string;
  readonly created_at: string;
  readonly estimated_grams_left: number;
  readonly hex_color: string;
  readonly id: number;
  readonly low_stock_threshold_grams: number;
  readonly material_type: string;
  readonly name: string;
  readonly notes: string | null;
  readonly purchase_source: string | null;
  readonly spool_cost: number;
  readonly spool_status: string;
  readonly starting_grams: number;
  readonly transmission_distance: number | null;
  readonly updated_at: string;
}

interface FilamentStockAdjustmentRow {
  readonly created_at: string;
  readonly filament_id: number;
  readonly grams_after: number;
  readonly grams_delta: number;
  readonly id: number;
  readonly notes: string | null;
  readonly reason: string;
}

type DatabaseFactory = () => Promise<SqlDatabase>;

const FILAMENT_COLUMNS = `
  id,
  brand,
  name,
  material_type,
  color_name,
  hex_color,
  transmission_distance,
  spool_status,
  starting_grams,
  estimated_grams_left,
  spool_cost,
  purchase_source,
  notes,
  low_stock_threshold_grams,
  created_at,
  updated_at
`;

const FILAMENT_ADJUSTMENT_COLUMNS = `
  id,
  filament_id,
  grams_delta,
  grams_after,
  reason,
  notes,
  created_at
`;

export function createFilamentRepository(
  databaseFactory: DatabaseFactory = getDatabase,
): FilamentRepository {
  let schemaReady = false;

  async function database(): Promise<SqlDatabase> {
    const db = await databaseFactory();

    if (!schemaReady) {
      await ensureFilamentSchema(db);
      schemaReady = true;
    }

    return db;
  }

  return {
    async adjustStock(filamentId, input) {
      const validation = validateFilamentStockAdjustmentInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid filament adjustment.");
      }

      const db = await database();
      const current = await this.get(filamentId);

      if (!current) {
        throw new Error(`Filament ${filamentId} does not exist.`);
      }

      const nextGrams = roundStockQuantity(current.estimatedGramsLeft + input.gramsDelta);

      if (nextGrams < 0) {
        throw new Error("Adjustment cannot reduce filament below zero grams.");
      }

      if (nextGrams > current.startingGrams) {
        throw new Error("Adjustment cannot increase filament above starting grams.");
      }

      await db.execute("BEGIN IMMEDIATE");

      try {
        await db.execute(
          `UPDATE filaments
           SET
            estimated_grams_left = $1,
            updated_at = datetime('now')
           WHERE id = $2`,
          [nextGrams, filamentId],
        );

        await db.execute(
          `INSERT INTO filament_stock_adjustments (
            filament_id,
            grams_delta,
            grams_after,
            reason,
            notes
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            filamentId,
            input.gramsDelta,
            nextGrams,
            input.reason.trim(),
            input.notes.trim(),
          ],
        );

        await db.execute("COMMIT");
      } catch (error) {
        await db.execute("ROLLBACK");
        throw error;
      }

      const updated = await this.get(filamentId);

      if (!updated) {
        throw new Error("Adjusted filament could not be loaded.");
      }

      return updated;
    },

    async create(input) {
      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `INSERT INTO filaments (
          brand,
          name,
          material_type,
          color_name,
          hex_color,
          transmission_distance,
          spool_status,
          starting_grams,
          estimated_grams_left,
          spool_cost,
          purchase_source,
          notes,
          low_stock_threshold_grams
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        values,
      );

      if (result.lastInsertId == null) {
        throw new Error("SQLite did not return the inserted filament id.");
      }

      const created = await this.get(result.lastInsertId);

      if (!created) {
        throw new Error("Inserted filament could not be loaded.");
      }

      return created;
    },

    async get(id) {
      const db = await database();
      const rows = await db.select<FilamentRow[]>(
        `SELECT ${FILAMENT_COLUMNS}
         FROM filaments
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      return rows[0] ? mapFilamentRow(rows[0]) : null;
    },

    async list() {
      const db = await database();
      const rows = await db.select<FilamentRow[]>(
        `SELECT ${FILAMENT_COLUMNS}
         FROM filaments
         ORDER BY
           CASE spool_status
             WHEN 'open' THEN 0
             WHEN 'sealed' THEN 1
             WHEN 'empty' THEN 2
             ELSE 3
           END,
           brand COLLATE NOCASE,
           name COLLATE NOCASE`,
      );

      return rows.map(mapFilamentRow);
    },

    async listAdjustments(filamentId) {
      const db = await database();
      const rows = await db.select<FilamentStockAdjustmentRow[]>(
        `SELECT ${FILAMENT_ADJUSTMENT_COLUMNS}
         FROM filament_stock_adjustments
         WHERE filament_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 12`,
        [filamentId],
      );

      return rows.map(mapFilamentStockAdjustmentRow);
    },

    async update(id, input) {
      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `UPDATE filaments
         SET
          brand = $1,
          name = $2,
          material_type = $3,
          color_name = $4,
          hex_color = $5,
          transmission_distance = $6,
          spool_status = $7,
          starting_grams = $8,
          estimated_grams_left = $9,
          spool_cost = $10,
          purchase_source = $11,
          notes = $12,
          low_stock_threshold_grams = $13,
          updated_at = datetime('now')
         WHERE id = $14`,
        [...values, id],
      );

      if (result.rowsAffected === 0) {
        throw new Error(`Filament ${id} does not exist.`);
      }

      const updated = await this.get(id);

      if (!updated) {
        throw new Error("Updated filament could not be loaded.");
      }

      return updated;
    },
  };
}

async function ensureFilamentSchema(db: SqlDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS filaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      name TEXT NOT NULL,
      material_type TEXT NOT NULL,
      color_name TEXT NOT NULL,
      hex_color TEXT NOT NULL,
      transmission_distance REAL,
      spool_status TEXT NOT NULL CHECK (spool_status IN ('open', 'sealed', 'empty', 'archived')),
      starting_grams REAL NOT NULL CHECK (starting_grams > 0),
      estimated_grams_left REAL NOT NULL CHECK (estimated_grams_left >= 0),
      spool_cost REAL NOT NULL DEFAULT 0 CHECK (spool_cost >= 0),
      purchase_source TEXT,
      notes TEXT,
      low_stock_threshold_grams REAL NOT NULL DEFAULT 200 CHECK (low_stock_threshold_grams >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_filaments_status_brand
    ON filaments (spool_status, brand, name)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS filament_stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filament_id INTEGER NOT NULL,
      grams_delta REAL NOT NULL CHECK (grams_delta != 0),
      grams_after REAL NOT NULL CHECK (grams_after >= 0),
      reason TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_filament_stock_adjustments_item
    ON filament_stock_adjustments (filament_id, created_at DESC)
  `);
}

function toPersistedValues(input: FilamentInput): readonly unknown[] {
  return [
    input.brand.trim(),
    input.name.trim(),
    input.materialType,
    input.colorName.trim(),
    normalizeHexColor(input.hexColor),
    input.transmissionDistance,
    input.spoolStatus,
    input.startingGrams,
    input.estimatedGramsLeft,
    input.spoolCost,
    input.purchaseSource.trim(),
    input.notes.trim(),
    input.lowStockThresholdGrams,
  ];
}

function mapFilamentRow(row: FilamentRow): FilamentRecord {
  return {
    id: row.id,
    brand: row.brand,
    name: row.name,
    materialType: row.material_type as FilamentMaterial,
    colorName: row.color_name,
    hexColor: row.hex_color,
    transmissionDistance: row.transmission_distance,
    spoolStatus: row.spool_status as SpoolStatus,
    startingGrams: row.starting_grams,
    estimatedGramsLeft: row.estimated_grams_left,
    spoolCost: row.spool_cost,
    purchaseSource: row.purchase_source ?? "",
    notes: row.notes ?? "",
    lowStockThresholdGrams: row.low_stock_threshold_grams,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFilamentStockAdjustmentRow(
  row: FilamentStockAdjustmentRow,
): FilamentStockAdjustmentRecord {
  return {
    createdAt: row.created_at,
    filamentId: row.filament_id,
    gramsAfter: row.grams_after,
    gramsDelta: row.grams_delta,
    id: row.id,
    notes: row.notes ?? "",
    reason: row.reason,
  };
}

function roundStockQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const filamentRepository = createFilamentRepository();
