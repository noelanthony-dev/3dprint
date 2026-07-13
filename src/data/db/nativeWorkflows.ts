import { invoke } from "@tauri-apps/api/core";

export interface DecimalStockAdjustmentCommand {
  readonly id: number;
  readonly notes: string;
  readonly quantityAfter: number;
  readonly quantityBefore: number;
  readonly quantityDelta: number;
  readonly reason: string;
}

export type FinishedGoodStockAdjustmentCommand = DecimalStockAdjustmentCommand;

export interface FilamentProfileCommand {
  readonly brand: string;
  readonly colorName: string;
  readonly hexColor: string;
  readonly materialType: string;
  readonly transmissionDistance: number | null;
}

export interface HueForgeRequirementCommand {
  readonly brand: string;
  readonly colorDistance: number | null;
  readonly colorName: string;
  readonly hexColor: string;
  readonly layerRange: string;
  readonly matchScore: number;
  readonly matchStatus: string;
  readonly materialType: string;
  readonly requiredGrams: number;
  readonly role: string;
  readonly stockSignal: string;
  readonly suggestedFilamentId: number | null;
  readonly suggestedFilamentLabel: string;
  readonly tdDelta: number | null;
  readonly transmissionDistance: number | null;
  readonly warning: string;
}

export interface SaveHueForgeAnalysisCommand {
  readonly feasibilityNotes: string;
  readonly feasibilityStatus: string;
  readonly missingWarnings: readonly string[];
  readonly productId: number;
  readonly requirements: readonly HueForgeRequirementCommand[];
}

export interface PrintProfileAddOnCommand {
  readonly addOnId: number | null;
  readonly description: string;
  readonly quantity: number;
  readonly totalCost: number;
  readonly unitCost: number;
}

export interface SavePrintProfileCommand {
  readonly addOns: readonly PrintProfileAddOnCommand[];
  readonly electricityRatePerKwh: number;
  readonly expectedFailedUnits: number;
  readonly expectedGoodUnits: number;
  readonly filamentCostPerKg: number;
  readonly filamentGrams: number;
  readonly id: number | null;
  readonly laborMinutes: number;
  readonly laborRatePerHour: number;
  readonly notes: string;
  readonly printerPowerWatts: number;
  readonly printHours: number;
  readonly printMinutes: number;
  readonly productId: number;
  readonly profileName: string;
  readonly saleUnit: string;
  readonly supportGrams: number;
  readonly targetMarkup: number;
  readonly wearRatePerHour: number;
}

export interface SaveShoppingItemCommand {
  readonly category: string;
  readonly id: number | null;
  readonly itemName: string;
  readonly notes: string;
  readonly priority: string;
  readonly productIds: readonly number[];
  readonly quantityNeeded: number;
  readonly requiredTransmissionDistance: number | null;
  readonly shopeeListingName: string;
  readonly sourceNote: string;
  readonly sourceType: string;
  readonly status: string;
  readonly unit: string;
}

export interface UpdateSaleDetailsCommand {
  readonly channel: string;
  readonly discountsFees: number;
  readonly grossRevenue: number;
  readonly netRevenue: number;
  readonly notes: string;
  readonly saleDate: string;
  readonly saleId: number;
}

interface RecordIdOutput {
  readonly id: number;
}

export function adjustFilamentStockNative(input: DecimalStockAdjustmentCommand): Promise<void> {
  return invoke("adjust_filament_stock", { input });
}

export function adjustAddOnStockNative(input: DecimalStockAdjustmentCommand): Promise<void> {
  return invoke("adjust_addon_stock", { input });
}

export function adjustFinishedGoodStockNative(input: FinishedGoodStockAdjustmentCommand): Promise<void> {
  return invoke("adjust_finished_good_stock", { input });
}

export function upsertFilamentProfilesNative(inputs: readonly FilamentProfileCommand[]): Promise<void> {
  return invoke("upsert_filament_profiles", { inputs });
}

export function saveHueForgeAnalysisNative(input: SaveHueForgeAnalysisCommand): Promise<void> {
  return invoke("save_hueforge_analysis", { input });
}

export async function savePrintProfileNative(input: SavePrintProfileCommand): Promise<number> {
  const result = await invoke<RecordIdOutput>("save_print_profile", { input });
  return result.id;
}

export async function saveShoppingItemNative(input: SaveShoppingItemCommand): Promise<number> {
  const result = await invoke<RecordIdOutput>("save_shopping_item", { input });
  return result.id;
}

export function deleteProductNative(id: number): Promise<void> {
  return invoke("delete_product", { id });
}

export function updateSaleDetailsNative(input: UpdateSaleDetailsCommand): Promise<void> {
  return invoke("update_sale_details", { input });
}
