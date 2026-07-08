import { createScaffoldModuleStatus } from "@/domain/shared";
import { isProductSaleUnit, type ProductSaleUnit } from "@/domain/products";

export interface PrintProfileRecord {
  readonly id: number;
  readonly productId: number;
  readonly profileName: string;
  readonly saleUnit: ProductSaleUnit;
  readonly filamentGrams: number;
  readonly supportGrams: number;
  readonly filamentCostPerKg: number;
  readonly addOnId: number | null;
  readonly addOnDescription: string;
  readonly addOnQuantity: number;
  readonly addOnCost: number;
  readonly printHours: number;
  readonly printMinutes: number;
  readonly electricityRatePerKwh: number;
  readonly printerPowerWatts: number;
  readonly wearRatePerHour: number;
  readonly laborMinutes: number;
  readonly laborRatePerHour: number;
  readonly expectedGoodUnits: number;
  readonly expectedFailedUnits: number;
  readonly targetMarkup: number;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PrintProfileInput {
  readonly productId: number;
  readonly profileName: string;
  readonly saleUnit: ProductSaleUnit;
  readonly filamentGrams: number;
  readonly supportGrams: number;
  readonly filamentCostPerKg: number;
  readonly addOnId: number | null;
  readonly addOnDescription: string;
  readonly addOnQuantity: number;
  readonly addOnCost: number;
  readonly printHours: number;
  readonly printMinutes: number;
  readonly electricityRatePerKwh: number;
  readonly printerPowerWatts: number;
  readonly wearRatePerHour: number;
  readonly laborMinutes: number;
  readonly laborRatePerHour: number;
  readonly expectedGoodUnits: number;
  readonly expectedFailedUnits: number;
  readonly targetMarkup: number;
  readonly notes: string;
}

export interface PrintProfileValidationResult {
  readonly errors: Partial<Record<keyof PrintProfileInput, string>>;
  readonly valid: boolean;
}

export interface PrintCostBreakdown {
  readonly addOnCost: number;
  readonly batchCost: number;
  readonly costPerAttemptedUnit: number;
  readonly costPerGoodUnit: number;
  readonly electricityCost: number;
  readonly failureRate: number;
  readonly filamentCost: number;
  readonly laborCost: number;
  readonly totalPrintHours: number;
  readonly totalUnitsAttempted: number;
  readonly wearCost: number;
}

export function calculatePrintCost(input: PrintProfileInput): PrintCostBreakdown {
  const totalPrintHours = input.printHours + input.printMinutes / 60;
  const totalFilamentGrams = input.filamentGrams + input.supportGrams;
  const filamentCost = (totalFilamentGrams / 1000) * input.filamentCostPerKg;
  const electricityCost =
    totalPrintHours * (input.printerPowerWatts / 1000) * input.electricityRatePerKwh;
  const wearCost = totalPrintHours * input.wearRatePerHour;
  const laborCost = (input.laborMinutes / 60) * input.laborRatePerHour;
  const batchCost = filamentCost + input.addOnCost + electricityCost + wearCost + laborCost;
  const totalUnitsAttempted = input.expectedGoodUnits + input.expectedFailedUnits;

  return {
    addOnCost: roundCurrency(input.addOnCost),
    batchCost: roundCurrency(batchCost),
    costPerAttemptedUnit:
      totalUnitsAttempted > 0 ? roundCurrency(batchCost / totalUnitsAttempted) : 0,
    costPerGoodUnit:
      input.expectedGoodUnits > 0 ? roundCurrency(batchCost / input.expectedGoodUnits) : 0,
    electricityCost: roundCurrency(electricityCost),
    failureRate: totalUnitsAttempted > 0 ? input.expectedFailedUnits / totalUnitsAttempted : 0,
    filamentCost: roundCurrency(filamentCost),
    laborCost: roundCurrency(laborCost),
    totalPrintHours,
    totalUnitsAttempted,
    wearCost: roundCurrency(wearCost),
  };
}

export function validatePrintProfileInput(
  input: PrintProfileInput,
): PrintProfileValidationResult {
  const errors: Partial<Record<keyof PrintProfileInput, string>> = {};

  if (!Number.isInteger(input.productId) || input.productId <= 0) {
    errors.productId = "Choose a product or design.";
  }

  if (!input.profileName.trim()) {
    errors.profileName = "Profile name is required.";
  }

  if (!isProductSaleUnit(input.saleUnit)) {
    errors.saleUnit = "Choose a valid sale unit.";
  }

  validateNonNegative(input, errors, "filamentGrams", "Filament grams cannot be negative.");
  validateNonNegative(input, errors, "supportGrams", "Purge/support grams cannot be negative.");
  validateNonNegative(input, errors, "filamentCostPerKg", "Filament cost cannot be negative.");
  validateNonNegative(input, errors, "addOnQuantity", "Add-on quantity cannot be negative.");
  validateNonNegative(input, errors, "addOnCost", "Add-on cost cannot be negative.");
  validateNonNegative(input, errors, "printHours", "Print hours cannot be negative.");
  validateNonNegative(input, errors, "printMinutes", "Print minutes cannot be negative.");
  validateNonNegative(input, errors, "electricityRatePerKwh", "Electricity rate cannot be negative.");
  validateNonNegative(input, errors, "printerPowerWatts", "Printer power cannot be negative.");
  validateNonNegative(input, errors, "wearRatePerHour", "Wear rate cannot be negative.");
  validateNonNegative(input, errors, "laborMinutes", "Labor minutes cannot be negative.");
  validateNonNegative(input, errors, "laborRatePerHour", "Labor rate cannot be negative.");
  validateNonNegative(input, errors, "expectedFailedUnits", "Expected fails cannot be negative.");

  if (!Number.isFinite(input.expectedGoodUnits) || input.expectedGoodUnits <= 0) {
    errors.expectedGoodUnits = "Expected good quantity must be greater than zero.";
  }

  if (!Number.isFinite(input.targetMarkup) || input.targetMarkup < 1) {
    errors.targetMarkup = "Target markup must be 1x or greater.";
  }

  if (input.addOnId != null && (!Number.isInteger(input.addOnId) || input.addOnId <= 0)) {
    errors.addOnId = "Choose a valid add-on item.";
  }

  if (input.addOnQuantity > 0 && input.addOnId == null) {
    errors.addOnId = "Choose an add-on item before adding add-on quantity.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

function validateNonNegative<K extends keyof PrintProfileInput>(
  input: PrintProfileInput,
  errors: Partial<Record<keyof PrintProfileInput, string>>,
  key: K,
  message: string,
): void {
  const value = input[key];

  if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
    errors[key] = message;
  }
}

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const costingDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "costing",
  notes: ["Pure print profile and batch cost calculations."],
});
