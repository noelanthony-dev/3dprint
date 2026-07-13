import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  saveHueForgeAnalysisNative,
  type HueForgeRequirementCommand,
  type SaveHueForgeAnalysisCommand,
} from "@/data/db/nativeWorkflows";
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
type AnalysisSaver = (input: SaveHueForgeAnalysisCommand) => Promise<void>;

export function createHueForgeRepository(
  databaseFactory: DatabaseFactory = getDatabase,
  analysisSaver: AnalysisSaver = saveHueForgeAnalysisNative,
): HueForgeRepository {
  async function database(): Promise<SqlDatabase> {
    return databaseFactory();
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
      await analysisSaver({
        feasibilityNotes: input.feasibilityNotes,
        feasibilityStatus: input.feasibilityStatus,
        missingWarnings: input.missingWarnings,
        productId: input.productId,
        requirements: input.matches.map(toNativeRequirement),
      });
    },
  };
}

function toNativeRequirement(match: HueForgeRequirementMatch): HueForgeRequirementCommand {
  const requirement: HueForgeRequirementInput = match.requirement;
  const filament = match.matchedFilament;

  return {
    brand: requirement.brand.trim(),
    colorDistance: match.colorDistance ?? null,
    colorName: requirement.colorName.trim(),
    hexColor: requirement.hexColor.trim().toLowerCase(),
    layerRange: requirement.layerRange.trim(),
    matchScore: match.matchScore,
    matchStatus: match.status,
    materialType: requirement.materialType,
    requiredGrams: requirement.requiredGrams,
    role: requirement.role.trim(),
    stockSignal: match.stockSignal,
    suggestedFilamentId: filament?.id ?? null,
    suggestedFilamentLabel: filament ? `${filament.brand} ${filament.name}` : "",
    tdDelta: match.tdDelta ?? null,
    transmissionDistance: requirement.transmissionDistance,
    warning: match.warning,
  };
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
