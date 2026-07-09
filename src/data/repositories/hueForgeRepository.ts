import { getDatabase, type SqlDatabase } from "@/data/db/client";
import type {
  HueForgeFeasibilityStatus,
  HueForgeRequirementInput,
  HueForgeRequirementMatch,
} from "@/domain/hueforge";
import type { FilamentMaterial } from "@/domain/inventory";
import type { HueForgeMissingRequirement } from "@/domain/shopping";

export interface SaveHueForgeAnalysisInput {
  readonly feasibilityNotes: string;
  readonly feasibilityStatus: HueForgeFeasibilityStatus;
  readonly matches: readonly HueForgeRequirementMatch[];
  readonly missingWarnings: readonly string[];
  readonly productId: number;
}

export interface HueForgeRepository {
  listMissingRequirements(): Promise<HueForgeMissingRequirement[]>;
  saveAnalysis(input: SaveHueForgeAnalysisInput): Promise<void>;
}

interface HueForgeMissingRequirementRow {
  readonly brand: string;
  readonly color_name: string;
  readonly hex_color: string;
  readonly layer_range: string | null;
  readonly material_type: string;
  readonly product_id: number;
  readonly required_grams: number;
  readonly role: string;
  readonly transmission_distance: number;
  readonly warning: string | null;
}

type DatabaseFactory = () => Promise<SqlDatabase>;

export function createHueForgeRepository(
  databaseFactory: DatabaseFactory = getDatabase,
): HueForgeRepository {
  let schemaReady = false;

  async function database(): Promise<SqlDatabase> {
    const db = await databaseFactory();

    if (!schemaReady) {
      await ensureHueForgeSchema(db);
      schemaReady = true;
    }

    return db;
  }

  return {
    async listMissingRequirements() {
      const db = await database();
      const rows = await db.select<HueForgeMissingRequirementRow[]>(
        `SELECT
          product_id,
          role,
          brand,
          material_type,
          color_name,
          hex_color,
          transmission_distance,
          required_grams,
          layer_range,
          warning
         FROM author_filament_requirements
         WHERE match_status = 'missing'
         ORDER BY product_id DESC, role COLLATE NOCASE`,
      );

      return rows.map(mapMissingRequirementRow);
    },

    async saveAnalysis(input) {
      const db = await database();

      await db.execute("BEGIN IMMEDIATE");

      try {
        await db.execute("DELETE FROM author_filament_requirements WHERE product_id = $1", [
          input.productId,
        ]);
        await db.execute("DELETE FROM hueforge_design_analyses WHERE product_id = $1", [
          input.productId,
        ]);

        await db.execute(
          `INSERT INTO hueforge_design_analyses (
            product_id,
            feasibility_status,
            feasibility_notes,
            missing_warnings
          ) VALUES ($1, $2, $3, $4)`,
          [
            input.productId,
            input.feasibilityStatus,
            input.feasibilityNotes,
            input.missingWarnings.join("\n"),
          ],
        );

        for (const match of input.matches) {
          await db.execute(
            `INSERT INTO author_filament_requirements (
              product_id,
              role,
              brand,
              material_type,
              color_name,
              hex_color,
              transmission_distance,
              required_grams,
              layer_range,
              suggested_filament_id,
              suggested_filament_label,
              match_score,
              match_status,
              color_distance,
              td_delta,
              stock_signal,
              warning
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
            toRequirementValues(input.productId, match),
          );
        }

        await db.execute("COMMIT");
      } catch (error) {
        await db.execute("ROLLBACK");
        throw error;
      }
    },
  };
}

async function ensureHueForgeSchema(db: SqlDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS hueforge_design_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL UNIQUE,
      feasibility_status TEXT NOT NULL CHECK (
        feasibility_status IN ('ready', 'needs-test', 'missing')
      ),
      feasibility_notes TEXT NOT NULL,
      missing_warnings TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  await addColumnIfMissing(db, "hueforge_design_analyses", "product_id", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(
    db,
    "hueforge_design_analyses",
    "feasibility_status",
    "TEXT NOT NULL DEFAULT 'missing' CHECK (feasibility_status IN ('ready', 'needs-test', 'missing'))",
  );
  await addColumnIfMissing(db, "hueforge_design_analyses", "feasibility_notes", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, "hueforge_design_analyses", "missing_warnings", "TEXT");
  await addColumnIfMissing(
    db,
    "hueforge_design_analyses",
    "created_at",
    "TEXT",
  );
  await addColumnIfMissing(
    db,
    "hueforge_design_analyses",
    "updated_at",
    "TEXT",
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS author_filament_requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      brand TEXT NOT NULL,
      material_type TEXT NOT NULL,
      color_name TEXT NOT NULL,
      hex_color TEXT NOT NULL,
      transmission_distance REAL NOT NULL,
      required_grams REAL NOT NULL DEFAULT 0 CHECK (required_grams >= 0),
      layer_range TEXT,
      suggested_filament_id INTEGER,
      suggested_filament_label TEXT,
      match_score INTEGER NOT NULL DEFAULT 0,
      match_status TEXT NOT NULL CHECK (
        match_status IN ('excellent', 'good', 'test', 'missing')
      ),
      color_distance REAL,
      td_delta REAL,
      stock_signal TEXT NOT NULL,
      warning TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (suggested_filament_id) REFERENCES filaments(id) ON DELETE SET NULL
    )
  `);

  await addColumnIfMissing(db, "author_filament_requirements", "product_id", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "author_filament_requirements", "role", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, "author_filament_requirements", "brand", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, "author_filament_requirements", "material_type", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, "author_filament_requirements", "color_name", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, "author_filament_requirements", "hex_color", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(
    db,
    "author_filament_requirements",
    "transmission_distance",
    "REAL NOT NULL DEFAULT 0",
  );
  await addColumnIfMissing(
    db,
    "author_filament_requirements",
    "required_grams",
    "REAL NOT NULL DEFAULT 0 CHECK (required_grams >= 0)",
  );
  await addColumnIfMissing(db, "author_filament_requirements", "layer_range", "TEXT");
  await addColumnIfMissing(db, "author_filament_requirements", "suggested_filament_id", "INTEGER");
  await addColumnIfMissing(db, "author_filament_requirements", "suggested_filament_label", "TEXT");
  await addColumnIfMissing(
    db,
    "author_filament_requirements",
    "match_score",
    "INTEGER NOT NULL DEFAULT 0",
  );
  await addColumnIfMissing(
    db,
    "author_filament_requirements",
    "match_status",
    "TEXT NOT NULL DEFAULT 'missing' CHECK (match_status IN ('excellent', 'good', 'test', 'missing'))",
  );
  await addColumnIfMissing(db, "author_filament_requirements", "color_distance", "REAL");
  await addColumnIfMissing(db, "author_filament_requirements", "td_delta", "REAL");
  await addColumnIfMissing(
    db,
    "author_filament_requirements",
    "stock_signal",
    "TEXT NOT NULL DEFAULT 'missing'",
  );
  await addColumnIfMissing(db, "author_filament_requirements", "warning", "TEXT");
  await addColumnIfMissing(
    db,
    "author_filament_requirements",
    "created_at",
    "TEXT",
  );

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_author_filament_requirements_product
    ON author_filament_requirements (product_id, role)
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

function toRequirementValues(
  productId: number,
  match: HueForgeRequirementMatch,
): readonly unknown[] {
  const requirement: HueForgeRequirementInput = match.requirement;
  const filament = match.matchedFilament;

  return [
    productId,
    requirement.role.trim(),
    requirement.brand.trim(),
    requirement.materialType,
    requirement.colorName.trim(),
    requirement.hexColor.trim().toLowerCase(),
    requirement.transmissionDistance,
    requirement.requiredGrams,
    requirement.layerRange.trim(),
    filament?.id ?? null,
    filament ? `${filament.brand} ${filament.name}` : "",
    match.matchScore,
    match.status,
    match.colorDistance,
    match.tdDelta,
    match.stockSignal,
    match.warning,
  ];
}

function mapMissingRequirementRow(row: HueForgeMissingRequirementRow): HueForgeMissingRequirement {
  return {
    brand: row.brand,
    colorName: row.color_name,
    hexColor: row.hex_color,
    layerRange: row.layer_range ?? "",
    materialType: row.material_type as FilamentMaterial,
    productId: row.product_id,
    requiredGrams: row.required_grams,
    role: row.role,
    transmissionDistance: row.transmission_distance,
    warning: row.warning ?? "",
  };
}

export const hueForgeRepository = createHueForgeRepository();
