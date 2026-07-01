export const ADD_ON_CATEGORIES = [
  "Hardware",
  "Packaging",
  "Embellishment",
  "Tooling",
  "Other",
] as const;

export const ADD_ON_UNITS = ["pcs", "packs", "sets", "meters", "grams", "rolls", "items"] as const;

export type AddOnCategory = (typeof ADD_ON_CATEGORIES)[number];
export type AddOnUnit = (typeof ADD_ON_UNITS)[number];
export type AddOnStockSignal = "ok" | "low" | "out" | "inactive";

export interface AddOnRecord {
  readonly id: number;
  readonly itemName: string;
  readonly category: AddOnCategory;
  readonly unit: AddOnUnit;
  readonly quantityOnHand: number;
  readonly lowStockThreshold: number;
  readonly unitCost: number;
  readonly supplier: string;
  readonly notes: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AddOnInput {
  readonly itemName: string;
  readonly category: AddOnCategory;
  readonly unit: AddOnUnit;
  readonly quantityOnHand: number;
  readonly lowStockThreshold: number;
  readonly unitCost: number;
  readonly supplier: string;
  readonly notes: string;
  readonly isActive: boolean;
}

export interface AddOnStockAdjustmentInput {
  readonly quantityDelta: number;
  readonly reason: string;
  readonly notes: string;
}

export interface AddOnStockAdjustmentRecord {
  readonly addOnId: number;
  readonly createdAt: string;
  readonly id: number;
  readonly notes: string;
  readonly quantityAfter: number;
  readonly quantityDelta: number;
  readonly reason: string;
}

export interface AddOnValidationResult {
  readonly errors: Partial<Record<keyof AddOnInput, string>>;
  readonly valid: boolean;
}

export interface AddOnStockAdjustmentValidationResult {
  readonly errors: Partial<Record<keyof AddOnStockAdjustmentInput, string>>;
  readonly valid: boolean;
}

export function formatQuantity(quantity: number, unit: string): string {
  if (!Number.isFinite(quantity)) {
    return "--";
  }

  const boundedQuantity = Math.max(0, quantity);
  const displayQuantity = Number.isInteger(boundedQuantity)
    ? String(boundedQuantity)
    : boundedQuantity.toFixed(2).replace(/\.?0+$/, "");
  const trimmedUnit = unit.trim();

  return trimmedUnit ? `${displayQuantity} ${trimmedUnit}` : displayQuantity;
}

export function getAddOnStockSignal(
  item: Pick<AddOnRecord, "isActive" | "lowStockThreshold" | "quantityOnHand">,
): AddOnStockSignal {
  if (!item.isActive) {
    return "inactive";
  }

  if (item.quantityOnHand <= 0) {
    return "out";
  }

  if (item.lowStockThreshold > 0 && item.quantityOnHand <= item.lowStockThreshold) {
    return "low";
  }

  return "ok";
}

export function isAddOnLowStock(
  item: Pick<AddOnRecord, "isActive" | "lowStockThreshold" | "quantityOnHand">,
): boolean {
  const signal = getAddOnStockSignal(item);

  return signal === "low" || signal === "out";
}

export function validateAddOnInput(input: AddOnInput): AddOnValidationResult {
  const errors: Partial<Record<keyof AddOnInput, string>> = {};

  if (!input.itemName.trim()) {
    errors.itemName = "Item name is required.";
  }

  if (!ADD_ON_CATEGORIES.includes(input.category)) {
    errors.category = "Choose a valid category.";
  }

  if (!ADD_ON_UNITS.includes(input.unit)) {
    errors.unit = "Choose a valid unit.";
  }

  if (!Number.isFinite(input.quantityOnHand) || input.quantityOnHand < 0) {
    errors.quantityOnHand = "Quantity on hand must be zero or greater.";
  }

  if (!Number.isFinite(input.lowStockThreshold) || input.lowStockThreshold < 0) {
    errors.lowStockThreshold = "Low-stock threshold must be zero or greater.";
  }

  if (!Number.isFinite(input.unitCost) || input.unitCost < 0) {
    errors.unitCost = "Unit cost must be zero or greater.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function validateAddOnStockAdjustmentInput(
  input: AddOnStockAdjustmentInput,
): AddOnStockAdjustmentValidationResult {
  const errors: Partial<Record<keyof AddOnStockAdjustmentInput, string>> = {};

  if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
    errors.quantityDelta = "Adjustment quantity must be a non-zero number.";
  }

  if (!input.reason.trim()) {
    errors.reason = "Adjustment reason is required.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}
