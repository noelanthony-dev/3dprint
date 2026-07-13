import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  upsertFilamentProfilesNative,
  type FilamentProfileCommand,
} from "@/data/db/nativeWorkflows";
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
type ProfileUpserter = (inputs: readonly FilamentProfileCommand[]) => Promise<void>;

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
  profileUpserter: ProfileUpserter = upsertFilamentProfilesNative,
): FilamentProfilesRepository {
  async function database(): Promise<SqlDatabase> {
    return databaseFactory();
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
      const uniqueInputs = dedupeProfileInputs(inputs);

      for (const input of uniqueInputs) {
        const validation = validateFilamentProfileInput(input);

        if (!validation.valid) {
          throw new Error(Object.values(validation.errors)[0] ?? "Invalid filament profile.");
        }

      }

      await profileUpserter(uniqueInputs.map(toNativeProfile));
    },
  };
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

function toNativeProfile(input: FilamentProfileInput): FilamentProfileCommand {
  const normalized = normalizeFilamentProfileInput(input);

  return {
    brand: normalized.brand,
    colorName: normalized.colorName,
    hexColor: normalized.hexColor,
    materialType: normalized.materialType,
    transmissionDistance: normalized.transmissionDistance,
  };
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
