import { getDatabase, type SqlDatabase } from "@/data/db/client";
import { localSettingsRepository } from "@/data/settings/localSettingsRepository";
import type {
  AnalysisSourceData,
  HueForgeAnalysisExportRecord,
  HueForgeRequirementExportRecord,
} from "@/domain/analysis";
import type { AppSettings } from "@/domain/settings";

import { addOnsRepository, type AddOnsRepository } from "./addOnsRepository";
import { expensesRepository, type ExpensesRepository } from "./expensesRepository";
import { filamentProfilesRepository, type FilamentProfilesRepository } from "./filamentProfilesRepository";
import { filamentRepository, type FilamentRepository } from "./filamentsRepository";
import { finishedGoodsRepository, type FinishedGoodsRepository } from "./finishedGoodsRepository";
import { hueForgeRepository, type HueForgeRepository } from "./hueForgeRepository";
import { printProfilesRepository, type PrintProfilesRepository } from "./printProfilesRepository";
import { productionRunsRepository, type ProductionRunsRepository } from "./productionRunsRepository";
import { productsRepository, type ProductsRepository } from "./productsRepository";
import { salesRepository, type SalesRepository } from "./salesRepository";
import { shoppingListRepository, type ShoppingListRepository } from "./shoppingListRepository";

export interface AnalysisExportSnapshot {
  readonly settings: AppSettings;
  readonly sourceData: AnalysisSourceData;
}

export interface HueForgeExportData {
  readonly analyses: readonly HueForgeAnalysisExportRecord[];
  readonly requirements: readonly HueForgeRequirementExportRecord[];
}

export interface AnalysisExportRepository {
  loadSnapshot(): Promise<AnalysisExportSnapshot>;
}

export interface AnalysisExportDependencies {
  readonly addOns: Pick<AddOnsRepository, "list" | "listAdjustments">;
  readonly expenses: Pick<ExpensesRepository, "listExpenses" | "listMemberships">;
  readonly filamentProfiles: Pick<FilamentProfilesRepository, "list">;
  readonly filaments: Pick<FilamentRepository, "list" | "listAdjustments">;
  readonly finishedGoods: Pick<FinishedGoodsRepository, "list" | "listAdjustments">;
  readonly hueForge: Pick<HueForgeRepository, "listMissingRequirements">;
  readonly loadHueForgeData: () => Promise<HueForgeExportData>;
  readonly loadSettings: () => AppSettings;
  readonly printProfiles: Pick<PrintProfilesRepository, "list">;
  readonly productionRuns: Pick<
    ProductionRunsRepository,
    "list" | "listAddOnCorrections" | "listAddOnDeductions" | "listFilamentDeductions"
  >;
  readonly products: Pick<ProductsRepository, "list">;
  readonly sales: Pick<SalesRepository, "list" | "listStockMovements">;
  readonly shoppingList: Pick<ShoppingListRepository, "list">;
}

const defaultDependencies: AnalysisExportDependencies = {
  addOns: addOnsRepository,
  expenses: expensesRepository,
  filamentProfiles: filamentProfilesRepository,
  filaments: filamentRepository,
  finishedGoods: finishedGoodsRepository,
  hueForge: hueForgeRepository,
  loadHueForgeData: listHueForgeData,
  loadSettings: () => localSettingsRepository.load(),
  printProfiles: printProfilesRepository,
  productionRuns: productionRunsRepository,
  products: productsRepository,
  sales: salesRepository,
  shoppingList: shoppingListRepository,
};

export function createAnalysisExportRepository(
  dependencies: AnalysisExportDependencies = defaultDependencies,
): AnalysisExportRepository {
  return {
    async loadSnapshot() {
      const [
        addOns,
        expenses,
        filamentProfiles,
        filaments,
        finishedGoods,
        hueForgeData,
        hueForgeMissingRequirements,
        memberships,
        printProfiles,
        productionRuns,
        products,
        sales,
        shoppingListItems,
      ] = await Promise.all([
        dependencies.addOns.list(),
        dependencies.expenses.listExpenses(),
        dependencies.filamentProfiles.list(),
        dependencies.filaments.list(),
        dependencies.finishedGoods.list(),
        dependencies.loadHueForgeData(),
        dependencies.hueForge.listMissingRequirements(),
        dependencies.expenses.listMemberships(),
        dependencies.printProfiles.list(),
        dependencies.productionRuns.list(),
        dependencies.products.list(),
        dependencies.sales.list(),
        dependencies.shoppingList.list(),
      ]);

      const [
        addOnAdjustments,
        filamentAdjustments,
        finishedGoodAdjustments,
        productionAddOnCorrections,
        productionAddOnDeductions,
        productionFilamentDeductions,
        saleStockMovements,
      ] = await Promise.all([
        loadChildren(addOns, (item) => dependencies.addOns.listAdjustments(item.id)),
        loadChildren(filaments, (item) => dependencies.filaments.listAdjustments(item.id)),
        loadChildren(finishedGoods, (item) => dependencies.finishedGoods.listAdjustments(item.id)),
        loadChildren(productionRuns, (item) => dependencies.productionRuns.listAddOnCorrections(item.id)),
        loadChildren(productionRuns, (item) => dependencies.productionRuns.listAddOnDeductions(item.id)),
        loadChildren(productionRuns, (item) => dependencies.productionRuns.listFilamentDeductions(item.id)),
        loadChildren(sales, (item) => dependencies.sales.listStockMovements(item.id)),
      ]);

      return {
        settings: dependencies.loadSettings(),
        sourceData: {
          addOnAdjustments,
          addOns,
          expenses,
          filamentAdjustments,
          filamentProfiles,
          filaments,
          finishedGoodAdjustments,
          finishedGoods,
          hueForgeAnalyses: hueForgeData.analyses,
          hueForgeMissingRequirements,
          hueForgeRequirements: hueForgeData.requirements,
          memberships,
          printProfiles,
          productionAddOnCorrections,
          productionAddOnDeductions,
          productionFilamentDeductions,
          productionRuns,
          products,
          saleStockMovements,
          sales,
          shoppingListItems,
        },
      };
    },
  };
}

async function loadChildren<T extends { readonly id: number }, U>(
  parents: readonly T[],
  loader: (parent: T) => Promise<readonly U[]>,
): Promise<U[]> {
  return (await Promise.all(parents.map(loader))).flat();
}

interface HueForgeAnalysisRow {
  readonly created_at: string | null;
  readonly feasibility_notes: string;
  readonly feasibility_status: string;
  readonly id: number;
  readonly missing_warnings: string | null;
  readonly product_id: number;
  readonly updated_at: string | null;
}

interface HueForgeRequirementRow {
  readonly brand: string;
  readonly color_distance: number | null;
  readonly color_name: string;
  readonly created_at: string | null;
  readonly hex_color: string;
  readonly id: number;
  readonly layer_range: string | null;
  readonly match_score: number;
  readonly match_status: string;
  readonly material_type: string;
  readonly product_id: number;
  readonly required_grams: number;
  readonly role: string;
  readonly stock_signal: string;
  readonly suggested_filament_id: number | null;
  readonly suggested_filament_label: string | null;
  readonly td_delta: number | null;
  readonly transmission_distance: number;
  readonly warning: string | null;
}

async function listHueForgeData(): Promise<HueForgeExportData> {
  const db = await getDatabase();
  const [analyses, requirements] = await Promise.all([
    db.select<HueForgeAnalysisRow[]>(
      `SELECT id, product_id, feasibility_status, feasibility_notes, missing_warnings, created_at, updated_at
       FROM hueforge_design_analyses
       ORDER BY product_id, id`,
    ),
    db.select<HueForgeRequirementRow[]>(
      `SELECT id, product_id, role, brand, material_type, color_name, hex_color,
        transmission_distance, required_grams, layer_range, suggested_filament_id,
        suggested_filament_label, match_score, match_status, color_distance, td_delta,
        stock_signal, warning, created_at
       FROM author_filament_requirements
       ORDER BY product_id, id`,
    ),
  ]);
  return {
    analyses: analyses.map((row) => ({
      createdAt: row.created_at ?? "",
      feasibilityNotes: row.feasibility_notes,
      feasibilityStatus: row.feasibility_status,
      id: row.id,
      missingWarnings: parseStringArray(row.missing_warnings),
      productId: row.product_id,
      updatedAt: row.updated_at ?? "",
    })),
    requirements: requirements.map(mapHueForgeRequirement),
  };
}

function mapHueForgeRequirement(row: HueForgeRequirementRow): HueForgeRequirementExportRecord {
  return {
    brand: row.brand,
    colorDistance: row.color_distance,
    colorName: row.color_name,
    createdAt: row.created_at ?? "",
    hexColor: row.hex_color,
    id: row.id,
    layerRange: row.layer_range ?? "",
    matchScore: row.match_score,
    matchStatus: row.match_status,
    materialType: row.material_type,
    productId: row.product_id,
    requiredGrams: row.required_grams,
    role: row.role,
    stockSignal: row.stock_signal,
    suggestedFilamentId: row.suggested_filament_id,
    suggestedFilamentLabel: row.suggested_filament_label ?? "",
    tdDelta: row.td_delta,
    transmissionDistance: row.transmission_distance,
    warning: row.warning ?? "",
  };
}

function parseStringArray(value: string | null): readonly string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export const analysisExportRepository = createAnalysisExportRepository();
