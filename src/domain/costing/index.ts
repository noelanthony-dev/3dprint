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
  readonly addOns: readonly PrintProfileAddOn[];
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
  readonly addOns: readonly PrintProfileAddOn[];
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

export interface PrintProfileAddOn {
  readonly addOnId: number | null;
  readonly description: string;
  readonly quantity: number;
  readonly unitCost: number;
  readonly totalCost: number;
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
  const addOnCost = input.addOns.reduce((sum, addOn) => sum + addOn.totalCost, 0);
  const batchCost = filamentCost + addOnCost + electricityCost + wearCost + laborCost;
  const totalUnitsAttempted = input.expectedGoodUnits + input.expectedFailedUnits;

  return {
    addOnCost: roundCurrency(addOnCost),
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

  const selectedIds = new Set<number>();
  input.addOns.forEach((addOn, index) => {
    if (addOn.addOnId == null) {
      if (!addOn.description.trim()) {
        errors.addOns = `Choose a valid item for add-on ${index + 1}.`;
        return;
      }
    } else {
      if (!Number.isInteger(addOn.addOnId) || addOn.addOnId <= 0) {
        errors.addOns = `Choose a valid item for add-on ${index + 1}.`;
        return;
      }

      if (selectedIds.has(addOn.addOnId)) {
        errors.addOns = "Each add-on item can only be selected once.";
        return;
      }
      selectedIds.add(addOn.addOnId);
    }

    if (!Number.isFinite(addOn.quantity) || addOn.quantity < 0) {
      errors.addOns = `Add-on ${index + 1} quantity cannot be negative.`;
    } else if (!Number.isFinite(addOn.unitCost) || addOn.unitCost < 0) {
      errors.addOns = `Add-on ${index + 1} unit cost cannot be negative.`;
    } else if (!Number.isFinite(addOn.totalCost) || addOn.totalCost < 0) {
      errors.addOns = `Add-on ${index + 1} total cost cannot be negative.`;
    }
  });

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
