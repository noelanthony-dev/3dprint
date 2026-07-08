import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  validatePrintProfileInput,
  type PrintProfileInput,
  type PrintProfileRecord,
} from "@/domain/costing";
import type { ProductSaleUnit } from "@/domain/products";

export interface PrintProfilesRepository {
  create(input: PrintProfileInput): Promise<PrintProfileRecord>;
  get(id: number): Promise<PrintProfileRecord | null>;
  list(): Promise<PrintProfileRecord[]>;
  update(id: number, input: PrintProfileInput): Promise<PrintProfileRecord>;
}

interface PrintProfileRow {
  readonly add_on_cost: number;
  readonly add_on_description: string | null;
  readonly add_on_id: number | null;
  readonly add_on_quantity: number | null;
  readonly created_at: string;
  readonly electricity_rate_per_kwh: number;
  readonly expected_failed_units: number;
  readonly expected_good_units: number;
  readonly filament_cost_per_kg: number;
  readonly filament_grams: number;
  readonly id: number;
  readonly labor_minutes: number;
  readonly labor_rate_per_hour: number;
  readonly notes: string | null;
  readonly printer_power_watts: number;
  readonly print_hours: number;
  readonly print_minutes: number;
  readonly product_id: number;
  readonly profile_name: string;
  readonly sale_unit: string;
  readonly support_grams: number;
  readonly target_markup: number;
  readonly updated_at: string;
  readonly wear_rate_per_hour: number;
}

type DatabaseFactory = () => Promise<SqlDatabase>;

const PRINT_PROFILE_COLUMNS = `
  id,
  product_id,
  profile_name,
  sale_unit,
  filament_grams,
  support_grams,
  filament_cost_per_kg,
  add_on_id,
  add_on_description,
  add_on_quantity,
  add_on_cost,
  print_hours,
  print_minutes,
  electricity_rate_per_kwh,
  printer_power_watts,
  wear_rate_per_hour,
  labor_minutes,
  labor_rate_per_hour,
  expected_good_units,
  expected_failed_units,
  target_markup,
  notes,
  created_at,
  updated_at
`;

export function createPrintProfilesRepository(
  databaseFactory: DatabaseFactory = getDatabase,
): PrintProfilesRepository {
  let schemaReady = false;

  async function database(): Promise<SqlDatabase> {
    const db = await databaseFactory();

    if (!schemaReady) {
      await ensurePrintProfilesSchema(db);
      schemaReady = true;
    }

    return db;
  }

  return {
    async create(input) {
      const validation = validatePrintProfileInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid print profile.");
      }

      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `INSERT INTO print_profiles (
          product_id,
          profile_name,
          sale_unit,
          filament_grams,
          support_grams,
          filament_cost_per_kg,
          add_on_id,
          add_on_description,
          add_on_quantity,
          add_on_cost,
          print_hours,
          print_minutes,
          electricity_rate_per_kwh,
          printer_power_watts,
          wear_rate_per_hour,
          labor_minutes,
          labor_rate_per_hour,
          expected_good_units,
          expected_failed_units,
          target_markup,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
        values,
      );

      if (result.lastInsertId == null) {
        throw new Error("SQLite did not return the inserted print profile id.");
      }

      const created = await this.get(result.lastInsertId);

      if (!created) {
        throw new Error("Inserted print profile could not be loaded.");
      }

      return created;
    },

    async get(id) {
      const db = await database();
      const rows = await db.select<PrintProfileRow[]>(
        `SELECT ${PRINT_PROFILE_COLUMNS}
         FROM print_profiles
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      return rows[0] ? mapPrintProfileRow(rows[0]) : null;
    },

    async list() {
      const db = await database();
      const rows = await db.select<PrintProfileRow[]>(
        `SELECT ${PRINT_PROFILE_COLUMNS}
         FROM print_profiles
         ORDER BY product_id, profile_name COLLATE NOCASE`,
      );

      return rows.map(mapPrintProfileRow);
    },

    async update(id, input) {
      const validation = validatePrintProfileInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid print profile.");
      }

      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `UPDATE print_profiles
         SET
          product_id = $1,
          profile_name = $2,
          sale_unit = $3,
          filament_grams = $4,
          support_grams = $5,
          filament_cost_per_kg = $6,
          add_on_id = $7,
          add_on_description = $8,
          add_on_quantity = $9,
          add_on_cost = $10,
          print_hours = $11,
          print_minutes = $12,
          electricity_rate_per_kwh = $13,
          printer_power_watts = $14,
          wear_rate_per_hour = $15,
          labor_minutes = $16,
          labor_rate_per_hour = $17,
          expected_good_units = $18,
          expected_failed_units = $19,
          target_markup = $20,
          notes = $21,
          updated_at = datetime('now')
         WHERE id = $22`,
        [...values, id],
      );

      if (result.rowsAffected === 0) {
        throw new Error(`Print profile ${id} does not exist.`);
      }

      const updated = await this.get(id);

      if (!updated) {
        throw new Error("Updated print profile could not be loaded.");
      }

      return updated;
    },
  };
}

async function ensurePrintProfilesSchema(db: SqlDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS print_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      profile_name TEXT NOT NULL,
      sale_unit TEXT NOT NULL,
      filament_grams REAL NOT NULL DEFAULT 0 CHECK (filament_grams >= 0),
      support_grams REAL NOT NULL DEFAULT 0 CHECK (support_grams >= 0),
      filament_cost_per_kg REAL NOT NULL DEFAULT 0 CHECK (filament_cost_per_kg >= 0),
      add_on_id INTEGER,
      add_on_description TEXT,
      add_on_quantity REAL NOT NULL DEFAULT 0 CHECK (add_on_quantity >= 0),
      add_on_cost REAL NOT NULL DEFAULT 0 CHECK (add_on_cost >= 0),
      print_hours REAL NOT NULL DEFAULT 0 CHECK (print_hours >= 0),
      print_minutes REAL NOT NULL DEFAULT 0 CHECK (print_minutes >= 0),
      electricity_rate_per_kwh REAL NOT NULL DEFAULT 0 CHECK (electricity_rate_per_kwh >= 0),
      printer_power_watts REAL NOT NULL DEFAULT 0 CHECK (printer_power_watts >= 0),
      wear_rate_per_hour REAL NOT NULL DEFAULT 0 CHECK (wear_rate_per_hour >= 0),
      labor_minutes REAL NOT NULL DEFAULT 0 CHECK (labor_minutes >= 0),
      labor_rate_per_hour REAL NOT NULL DEFAULT 0 CHECK (labor_rate_per_hour >= 0),
      expected_good_units INTEGER NOT NULL DEFAULT 1 CHECK (expected_good_units > 0),
      expected_failed_units INTEGER NOT NULL DEFAULT 0 CHECK (expected_failed_units >= 0),
      target_markup REAL NOT NULL DEFAULT 3 CHECK (target_markup >= 1),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (add_on_id) REFERENCES addons(id) ON DELETE SET NULL
    )
  `);

  await addColumnIfMissing(db, "print_profiles", "add_on_id", "INTEGER");
  await addColumnIfMissing(
    db,
    "print_profiles",
    "add_on_quantity",
    "REAL NOT NULL DEFAULT 0 CHECK (add_on_quantity >= 0)",
  );

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_print_profiles_product
    ON print_profiles (product_id, profile_name)
  `);
}

function toPersistedValues(input: PrintProfileInput): readonly unknown[] {
  return [
    input.productId,
    input.profileName.trim(),
    input.saleUnit,
    input.filamentGrams,
    input.supportGrams,
    input.filamentCostPerKg,
    input.addOnId,
    input.addOnDescription.trim(),
    input.addOnQuantity,
    input.addOnCost,
    input.printHours,
    input.printMinutes,
    input.electricityRatePerKwh,
    input.printerPowerWatts,
    input.wearRatePerHour,
    input.laborMinutes,
    input.laborRatePerHour,
    input.expectedGoodUnits,
    input.expectedFailedUnits,
    input.targetMarkup,
    input.notes.trim(),
  ];
}

function mapPrintProfileRow(row: PrintProfileRow): PrintProfileRecord {
  return {
    addOnCost: row.add_on_cost,
    addOnDescription: row.add_on_description ?? "",
    addOnId: row.add_on_id,
    addOnQuantity: row.add_on_quantity ?? 0,
    createdAt: row.created_at,
    electricityRatePerKwh: row.electricity_rate_per_kwh,
    expectedFailedUnits: row.expected_failed_units,
    expectedGoodUnits: row.expected_good_units,
    filamentCostPerKg: row.filament_cost_per_kg,
    filamentGrams: row.filament_grams,
    id: row.id,
    laborMinutes: row.labor_minutes,
    laborRatePerHour: row.labor_rate_per_hour,
    notes: row.notes ?? "",
    printerPowerWatts: row.printer_power_watts,
    printHours: row.print_hours,
    printMinutes: row.print_minutes,
    productId: row.product_id,
    profileName: row.profile_name,
    saleUnit: row.sale_unit as ProductSaleUnit,
    supportGrams: row.support_grams,
    targetMarkup: row.target_markup,
    updatedAt: row.updated_at,
    wearRatePerHour: row.wear_rate_per_hour,
  };
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

export const printProfilesRepository = createPrintProfilesRepository();
