import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  normalizeFilamentProfileInput,
  validateFilamentProfileInput,
  type FilamentMaterial,
  type FilamentProfileInput,
  type FilamentProfileRecord,
} from "@/domain/inventory";

export interface FilamentProfilesRepository {
  list(): Promise<FilamentProfileRecord[]>;
  upsertMany(inputs: readonly FilamentProfileInput[]): Promise<void>;
}

interface FilamentProfileRow {
  readonly brand: string;
  readonly color_name: string;
  readonly created_at: string;
  readonly hex_color: string;
  readonly id: number;
  readonly material_type: string;
  readonly transmission_distance: number | null;
  readonly updated_at: string;
}

type DatabaseFactory = () => Promise<SqlDatabase>;

const FILAMENT_PROFILE_COLUMNS = `
  id,
  brand,
  material_type,
  color_name,
  hex_color,
  transmission_distance,
  created_at,
  updated_at
`;

export function createFilamentProfilesRepository(
  databaseFactory: DatabaseFactory = getDatabase,
): FilamentProfilesRepository {
  let schemaReady = false;

  async function database(): Promise<SqlDatabase> {
    const db = await databaseFactory();

    if (!schemaReady) {
      await ensureFilamentProfilesSchema(db);
      schemaReady = true;
    }

    return db;
  }

  return {
    async list() {
      const db = await database();
      const rows = await db.select<FilamentProfileRow[]>(
        `SELECT ${FILAMENT_PROFILE_COLUMNS}
         FROM filament_profiles
         ORDER BY
           brand COLLATE NOCASE,
           material_type COLLATE NOCASE,
           color_name COLLATE NOCASE`,
      );

      return rows.map(mapFilamentProfileRow);
    },

    async upsertMany(inputs) {
      const db = await database();
      const uniqueInputs = dedupeProfileInputs(inputs);

      for (const input of uniqueInputs) {
        const validation = validateFilamentProfileInput(input);

        if (!validation.valid) {
          throw new Error(Object.values(validation.errors)[0] ?? "Invalid filament profile.");
        }

        const values = toPersistedValues(input);

        await db.execute(
          `INSERT OR IGNORE INTO filament_profiles (
            brand,
            material_type,
            color_name,
            hex_color,
            transmission_distance
          ) VALUES ($1, $2, $3, $4, $5)`,
          values,
        );

        await db.execute(
          `UPDATE filament_profiles
           SET
            brand = $1,
            material_type = $2,
            color_name = $3,
            hex_color = $4,
            transmission_distance = $5,
            updated_at = datetime('now')
           WHERE
            lower(brand) = lower($1)
            AND material_type = $2
            AND lower(color_name) = lower($3)
            AND hex_color = $4
            AND COALESCE(transmission_distance, -1) = COALESCE($5, -1)`,
          values,
        );
      }
    },
  };
}

async function ensureFilamentProfilesSchema(db: SqlDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS filament_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      material_type TEXT NOT NULL,
      color_name TEXT NOT NULL,
      hex_color TEXT NOT NULL,
      transmission_distance REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_filament_profiles_unique_normalized
    ON filament_profiles (
      lower(brand),
      material_type,
      lower(color_name),
      hex_color,
      COALESCE(transmission_distance, -1)
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_filament_profiles_lookup
    ON filament_profiles (brand, material_type, color_name)
  `);
}

function dedupeProfileInputs(
  inputs: readonly FilamentProfileInput[],
): readonly FilamentProfileInput[] {
  const profilesByKey = new Map<string, FilamentProfileInput>();

  for (const input of inputs) {
    const normalized = normalizeFilamentProfileInput(input);
    profilesByKey.set(getProfileKey(normalized), normalized);
  }

  return [...profilesByKey.values()];
}

function getProfileKey(input: FilamentProfileInput): string {
  return [
    input.brand.toLowerCase(),
    input.materialType,
    input.colorName.toLowerCase(),
    input.hexColor.toLowerCase(),
    input.transmissionDistance == null ? "" : String(input.transmissionDistance),
  ].join("|");
}

function toPersistedValues(input: FilamentProfileInput): readonly unknown[] {
  const normalized = normalizeFilamentProfileInput(input);

  return [
    normalized.brand,
    normalized.materialType,
    normalized.colorName,
    normalized.hexColor,
    normalized.transmissionDistance,
  ];
}

function mapFilamentProfileRow(row: FilamentProfileRow): FilamentProfileRecord {
  return {
    brand: row.brand,
    colorName: row.color_name,
    createdAt: row.created_at,
    hexColor: row.hex_color,
    id: row.id,
    materialType: row.material_type as FilamentMaterial,
    transmissionDistance: row.transmission_distance,
    updatedAt: row.updated_at,
  };
}

export const filamentProfilesRepository = createFilamentProfilesRepository();
