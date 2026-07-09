import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  validateProductionRunInput,
  type ProductionAddOnDeductionRecord,
  type ProductionFilamentDeductionRecord,
  type ProductionRunInput,
  type ProductionRunRecord,
} from "@/domain/production";

export interface ProductionRunCreateInput extends ProductionRunInput {
  readonly addOnDeduction: ProductionAddOnDeductionInput | null;
  readonly addOnQuantityDeducted: number;
  readonly filamentDeductions: readonly ProductionFilamentDeductionInput[];
  readonly filamentGramsDeducted: number;
  readonly finishedGoodId: number | null;
}

export interface ProductionFilamentDeductionInput {
  readonly filamentId: number;
  readonly gramsAfter: number;
  readonly gramsBefore: number;
  readonly gramsDeducted: number;
}

export interface ProductionAddOnDeductionInput {
  readonly addOnId: number;
  readonly quantityAfter: number;
  readonly quantityBefore: number;
  readonly quantityDeducted: number;
}

export interface ProductionRunsRepository {
  create(input: ProductionRunCreateInput): Promise<ProductionRunRecord>;
  get(id: number): Promise<ProductionRunRecord | null>;
  list(): Promise<ProductionRunRecord[]>;
  listAddOnDeductions(productionRunId: number): Promise<ProductionAddOnDeductionRecord[]>;
  listFilamentDeductions(productionRunId: number): Promise<ProductionFilamentDeductionRecord[]>;
}

interface ProductionRunRow {
  readonly addon_id: number | null;
  readonly addon_quantity_deducted: number;
  readonly created_at: string;
  readonly expected_pieces: number;
  readonly failed_pieces: number;
  readonly failure_reason: string | null;
  readonly filament_grams_deducted: number;
  readonly filament_id: number;
  readonly finished_good_id: number | null;
  readonly good_pieces: number;
  readonly id: number;
  readonly notes: string | null;
  readonly print_profile_id: number;
  readonly product_id: number;
  readonly run_date: string;
  readonly updated_at: string;
}

interface ProductionFilamentDeductionRow {
  readonly created_at: string;
  readonly filament_id: number;
  readonly grams_after: number;
  readonly grams_before: number;
  readonly grams_deducted: number;
  readonly id: number;
  readonly production_run_id: number;
}

interface ProductionAddOnDeductionRow {
  readonly addon_id: number;
  readonly created_at: string;
  readonly id: number;
  readonly production_run_id: number;
  readonly quantity_after: number;
  readonly quantity_before: number;
  readonly quantity_deducted: number;
}

type DatabaseFactory = () => Promise<SqlDatabase>;

const PRODUCTION_RUN_COLUMNS = `
  id,
  product_id,
  print_profile_id,
  filament_id,
  addon_id,
  run_date,
  expected_pieces,
  good_pieces,
  failed_pieces,
  failure_reason,
  notes,
  filament_grams_deducted,
  addon_quantity_deducted,
  finished_good_id,
  created_at,
  updated_at
`;

const PRODUCTION_FILAMENT_DEDUCTION_COLUMNS = `
  id,
  production_run_id,
  filament_id,
  grams_deducted,
  grams_before,
  grams_after,
  created_at
`;

const PRODUCTION_ADDON_DEDUCTION_COLUMNS = `
  id,
  production_run_id,
  addon_id,
  quantity_deducted,
  quantity_before,
  quantity_after,
  created_at
`;

export function createProductionRunsRepository(
  databaseFactory: DatabaseFactory = getDatabase,
): ProductionRunsRepository {
  let schemaReady = false;

  async function database(): Promise<SqlDatabase> {
    const db = await databaseFactory();

    if (!schemaReady) {
      await ensureProductionRunsSchema(db);
      schemaReady = true;
    }

    return db;
  }

  return {
    async create(input) {
      const validation = validateProductionRunInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid production run.");
      }

      const db = await database();
      let insertedId: number | null = null;

      await db.execute("BEGIN IMMEDIATE");

      try {
        const result = await db.execute(
          `INSERT INTO production_runs (
            product_id,
            print_profile_id,
            filament_id,
            addon_id,
            run_date,
            expected_pieces,
            good_pieces,
            failed_pieces,
            failure_reason,
            notes,
            filament_grams_deducted,
            addon_quantity_deducted,
            finished_good_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            input.productId,
            input.printProfileId,
            input.filamentId,
            input.addOnId,
            input.runDate.trim(),
            input.expectedPieces,
            input.goodPieces,
            input.failedPieces,
            input.failureReason.trim(),
            input.notes.trim(),
            input.filamentGramsDeducted,
            input.addOnQuantityDeducted,
            input.finishedGoodId,
          ],
        );

        if (result.lastInsertId == null) {
          throw new Error("SQLite did not return the inserted production run id.");
        }

        insertedId = result.lastInsertId;

        for (const filamentDeduction of input.filamentDeductions) {
          await db.execute(
            `INSERT INTO production_run_filaments (
              production_run_id,
              filament_id,
              grams_deducted,
              grams_before,
              grams_after
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
              insertedId,
              filamentDeduction.filamentId,
              filamentDeduction.gramsDeducted,
              filamentDeduction.gramsBefore,
              filamentDeduction.gramsAfter,
            ],
          );
        }

        if (input.addOnDeduction) {
          await db.execute(
            `INSERT INTO production_run_addons (
              production_run_id,
              addon_id,
              quantity_deducted,
              quantity_before,
              quantity_after
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
              insertedId,
              input.addOnDeduction.addOnId,
              input.addOnDeduction.quantityDeducted,
              input.addOnDeduction.quantityBefore,
              input.addOnDeduction.quantityAfter,
            ],
          );
        }

        await db.execute("COMMIT");
      } catch (error) {
        await rollbackIfActive(db);
        throw error;
      }

      if (insertedId == null) {
        throw new Error("Inserted production run id was not captured.");
      }

      const created = await this.get(insertedId);

      if (!created) {
        throw new Error("Inserted production run could not be loaded.");
      }

      return created;
    },

    async get(id) {
      const db = await database();
      const rows = await db.select<ProductionRunRow[]>(
        `SELECT ${PRODUCTION_RUN_COLUMNS}
         FROM production_runs
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      return rows[0] ? mapProductionRunRow(rows[0]) : null;
    },

    async list() {
      const db = await database();
      const rows = await db.select<ProductionRunRow[]>(
        `SELECT ${PRODUCTION_RUN_COLUMNS}
         FROM production_runs
         ORDER BY run_date DESC, created_at DESC, id DESC`,
      );

      return rows.map(mapProductionRunRow);
    },

    async listAddOnDeductions(productionRunId) {
      const db = await database();
      const rows = await db.select<ProductionAddOnDeductionRow[]>(
        `SELECT ${PRODUCTION_ADDON_DEDUCTION_COLUMNS}
         FROM production_run_addons
         WHERE production_run_id = $1
         ORDER BY id ASC`,
        [productionRunId],
      );

      return rows.map(mapProductionAddOnDeductionRow);
    },

    async listFilamentDeductions(productionRunId) {
      const db = await database();
      const rows = await db.select<ProductionFilamentDeductionRow[]>(
        `SELECT ${PRODUCTION_FILAMENT_DEDUCTION_COLUMNS}
         FROM production_run_filaments
         WHERE production_run_id = $1
         ORDER BY id ASC`,
        [productionRunId],
      );

      return rows.map(mapProductionFilamentDeductionRow);
    },
  };
}

async function ensureProductionRunsSchema(db: SqlDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS production_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      print_profile_id INTEGER NOT NULL,
      filament_id INTEGER NOT NULL,
      addon_id INTEGER,
      run_date TEXT NOT NULL,
      expected_pieces INTEGER NOT NULL CHECK (expected_pieces > 0),
      good_pieces INTEGER NOT NULL CHECK (good_pieces >= 0),
      failed_pieces INTEGER NOT NULL CHECK (failed_pieces >= 0),
      failure_reason TEXT,
      notes TEXT,
      filament_grams_deducted REAL NOT NULL DEFAULT 0 CHECK (filament_grams_deducted >= 0),
      addon_quantity_deducted REAL NOT NULL DEFAULT 0 CHECK (addon_quantity_deducted >= 0),
      finished_good_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (good_pieces + failed_pieces > 0),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
      FOREIGN KEY (print_profile_id) REFERENCES print_profiles(id) ON DELETE RESTRICT,
      FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE RESTRICT,
      FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE RESTRICT,
      FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE SET NULL
    )
  `);

  await addColumnIfMissing(db, "production_runs", "addon_id", "INTEGER");
  await addColumnIfMissing(db, "production_runs", "failure_reason", "TEXT");
  await addColumnIfMissing(db, "production_runs", "notes", "TEXT");
  await addColumnIfMissing(
    db,
    "production_runs",
    "filament_grams_deducted",
    "REAL NOT NULL DEFAULT 0 CHECK (filament_grams_deducted >= 0)",
  );
  await addColumnIfMissing(
    db,
    "production_runs",
    "addon_quantity_deducted",
    "REAL NOT NULL DEFAULT 0 CHECK (addon_quantity_deducted >= 0)",
  );
  await addColumnIfMissing(db, "production_runs", "finished_good_id", "INTEGER");
  await addColumnIfMissing(
    db,
    "production_runs",
    "created_at",
    "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'",
  );
  await addColumnIfMissing(
    db,
    "production_runs",
    "updated_at",
    "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'",
  );

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_production_runs_date
    ON production_runs (run_date DESC, created_at DESC)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_production_runs_product
    ON production_runs (product_id, print_profile_id)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS production_run_filaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      production_run_id INTEGER NOT NULL,
      filament_id INTEGER NOT NULL,
      grams_deducted REAL NOT NULL CHECK (grams_deducted >= 0),
      grams_before REAL NOT NULL CHECK (grams_before >= 0),
      grams_after REAL NOT NULL CHECK (grams_after >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE RESTRICT
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_production_run_filaments_run
    ON production_run_filaments (production_run_id)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS production_run_addons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      production_run_id INTEGER NOT NULL,
      addon_id INTEGER NOT NULL,
      quantity_deducted REAL NOT NULL CHECK (quantity_deducted >= 0),
      quantity_before REAL NOT NULL CHECK (quantity_before >= 0),
      quantity_after REAL NOT NULL CHECK (quantity_after >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE RESTRICT
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_production_run_addons_run
    ON production_run_addons (production_run_id)
  `);
}

async function addColumnIfMissing(
  db: SqlDatabase,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  const columns = await db.select<Array<{ readonly name: string }>>(`PRAGMA table_info(${tableName})`);

  if (!columns.some((column) => column.name === columnName)) {
    await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function rollbackIfActive(db: SqlDatabase): Promise<void> {
  try {
    await db.execute("ROLLBACK");
  } catch (rollbackError) {
    const message = String(rollbackError);

    if (!message.includes("no transaction is active")) {
      throw rollbackError;
    }
  }
}

function mapProductionRunRow(row: ProductionRunRow): ProductionRunRecord {
  return {
    addOnId: row.addon_id,
    addOnQuantityDeducted: row.addon_quantity_deducted,
    createdAt: row.created_at,
    expectedPieces: row.expected_pieces,
    failedPieces: row.failed_pieces,
    failureReason: row.failure_reason ?? "",
    filamentGramsDeducted: row.filament_grams_deducted,
    filamentId: row.filament_id,
    finishedGoodId: row.finished_good_id,
    goodPieces: row.good_pieces,
    id: row.id,
    notes: row.notes ?? "",
    printProfileId: row.print_profile_id,
    productId: row.product_id,
    runDate: row.run_date,
    updatedAt: row.updated_at,
  };
}

function mapProductionFilamentDeductionRow(
  row: ProductionFilamentDeductionRow,
): ProductionFilamentDeductionRecord {
  return {
    createdAt: row.created_at,
    filamentId: row.filament_id,
    gramsAfter: row.grams_after,
    gramsBefore: row.grams_before,
    gramsDeducted: row.grams_deducted,
    id: row.id,
    productionRunId: row.production_run_id,
  };
}

function mapProductionAddOnDeductionRow(
  row: ProductionAddOnDeductionRow,
): ProductionAddOnDeductionRecord {
  return {
    addOnId: row.addon_id,
    createdAt: row.created_at,
    id: row.id,
    productionRunId: row.production_run_id,
    quantityAfter: row.quantity_after,
    quantityBefore: row.quantity_before,
    quantityDeducted: row.quantity_deducted,
  };
}

export const productionRunsRepository = createProductionRunsRepository();
