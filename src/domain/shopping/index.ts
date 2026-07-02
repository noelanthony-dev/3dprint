import {
  formatQuantity,
  getAddOnStockSignal,
  type AddOnRecord,
  type AddOnUnit,
  type FilamentMaterial,
} from "@/domain/inventory";
import { createScaffoldModuleStatus } from "@/domain/shared";

export const SHOPPING_ITEM_CATEGORIES = [
  "Filament",
  "Hardware",
  "Packaging",
  "Tooling",
  "License",
  "Other",
] as const;

export const SHOPPING_ITEM_PRIORITIES = ["low", "normal", "high"] as const;
export const SHOPPING_ITEM_STATUSES = ["open", "purchased", "ignored"] as const;
export const SHOPPING_SOURCE_TYPES = ["manual", "low-stock-addon", "missing-hueforge-filament"] as const;

export type ShoppingItemCategory = (typeof SHOPPING_ITEM_CATEGORIES)[number];
export type ShoppingItemPriority = (typeof SHOPPING_ITEM_PRIORITIES)[number];
export type ShoppingItemStatus = (typeof SHOPPING_ITEM_STATUSES)[number];
export type ShoppingSourceType = (typeof SHOPPING_SOURCE_TYPES)[number];

export interface ShoppingListItemInput {
  readonly category: ShoppingItemCategory;
  readonly itemName: string;
  readonly notes: string;
  readonly priority: ShoppingItemPriority;
  readonly quantityNeeded: number;
  readonly sourceNote: string;
  readonly sourceType: ShoppingSourceType;
  readonly status: ShoppingItemStatus;
  readonly unit: string;
}

export interface ShoppingListItemRecord extends ShoppingListItemInput {
  readonly createdAt: string;
  readonly id: number;
  readonly updatedAt: string;
}

export interface ShoppingListItemValidationResult {
  readonly errors: Partial<Record<keyof ShoppingListItemInput, string>>;
  readonly valid: boolean;
}

export interface HueForgeMissingRequirement {
  readonly brand: string;
  readonly colorName: string;
  readonly hexColor: string;
  readonly layerRange: string;
  readonly materialType: FilamentMaterial;
  readonly productId: number;
  readonly requiredGrams: number;
  readonly role: string;
  readonly transmissionDistance: number;
  readonly warning: string;
}

export interface ShoppingSuggestion {
  readonly category: ShoppingItemCategory;
  readonly itemName: string;
  readonly priority: ShoppingItemPriority;
  readonly quantityNeeded: number;
  readonly reason: string;
  readonly sourceNote: string;
  readonly sourceType: Exclude<ShoppingSourceType, "manual">;
  readonly unit: string;
}

export function validateShoppingListItemInput(
  input: ShoppingListItemInput,
): ShoppingListItemValidationResult {
  const errors: Partial<Record<keyof ShoppingListItemInput, string>> = {};

  if (!input.itemName.trim()) {
    errors.itemName = "Item name is required.";
  }

  if (!SHOPPING_ITEM_CATEGORIES.includes(input.category)) {
    errors.category = "Choose a valid category.";
  }

  if (!SHOPPING_ITEM_PRIORITIES.includes(input.priority)) {
    errors.priority = "Choose a valid priority.";
  }

  if (!SHOPPING_ITEM_STATUSES.includes(input.status)) {
    errors.status = "Choose a valid status.";
  }

  if (!SHOPPING_SOURCE_TYPES.includes(input.sourceType)) {
    errors.sourceType = "Choose a valid source.";
  }

  if (!Number.isFinite(input.quantityNeeded) || input.quantityNeeded <= 0) {
    errors.quantityNeeded = "Quantity needed must be greater than zero.";
  }

  if (!input.unit.trim()) {
    errors.unit = "Unit is required.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function buildLowStockAddOnSuggestions(
  addOns: readonly AddOnRecord[],
): readonly ShoppingSuggestion[] {
  return addOns
    .filter((item) => {
      const stockSignal = getAddOnStockSignal(item);

      return stockSignal === "low" || stockSignal === "out";
    })
    .map((item) => {
      const stockSignal = getAddOnStockSignal(item);
      const targetQuantity = item.lowStockThreshold > 0 ? item.lowStockThreshold * 2 : 1;
      const quantityNeeded = Math.max(1, roundShoppingQuantity(targetQuantity - item.quantityOnHand));
      const currentStock = formatQuantity(item.quantityOnHand, item.unit);
      const threshold = formatQuantity(item.lowStockThreshold, item.unit);

      return {
        category: mapAddOnCategory(item.category),
        itemName: item.itemName,
        priority: stockSignal === "out" ? "high" : "normal",
        quantityNeeded,
        reason:
          stockSignal === "out"
            ? `${item.itemName} is out of stock.`
            : `${item.itemName} is at or below the low-stock threshold.`,
        sourceNote: `Current ${currentStock}; threshold ${threshold}.`,
        sourceType: "low-stock-addon",
        unit: item.unit,
      };
    });
}

export function buildMissingHueForgeFilamentSuggestions(
  requirements: readonly HueForgeMissingRequirement[],
): readonly ShoppingSuggestion[] {
  return requirements.map((requirement) => ({
    category: "Filament",
    itemName: `${requirement.brand} ${requirement.colorName} ${requirement.materialType}`.trim(),
    priority: "high",
    quantityNeeded: Math.max(1, roundShoppingQuantity(requirement.requiredGrams)),
    reason: requirement.warning || `Missing ${requirement.materialType} filament for ${requirement.colorName}.`,
    sourceNote: `Product ${requirement.productId}, ${requirement.role}, ${requirement.layerRange || "all layers"}, TD ${requirement.transmissionDistance}.`,
    sourceType: "missing-hueforge-filament",
    unit: "grams",
  }));
}

export function mergeShoppingSuggestions(
  suggestions: readonly ShoppingSuggestion[],
): readonly ShoppingSuggestion[] {
  const merged = new Map<string, ShoppingSuggestion>();

  for (const suggestion of suggestions) {
    const key = `${suggestion.sourceType}:${suggestion.itemName.toLowerCase()}:${suggestion.unit}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, suggestion);
      continue;
    }

    merged.set(key, {
      ...existing,
      priority: existing.priority === "high" || suggestion.priority === "high" ? "high" : existing.priority,
      quantityNeeded: roundShoppingQuantity(existing.quantityNeeded + suggestion.quantityNeeded),
      reason: `${existing.reason} ${suggestion.reason}`,
      sourceNote: `${existing.sourceNote} ${suggestion.sourceNote}`,
    });
  }

  return Array.from(merged.values());
}

export function toManualShoppingItemInput(
  suggestion: ShoppingSuggestion,
): ShoppingListItemInput {
  return {
    category: suggestion.category,
    itemName: suggestion.itemName,
    notes: suggestion.reason,
    priority: suggestion.priority,
    quantityNeeded: suggestion.quantityNeeded,
    sourceNote: suggestion.sourceNote,
    sourceType: suggestion.sourceType,
    status: "open",
    unit: suggestion.unit,
  };
}

export function roundShoppingQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mapAddOnCategory(category: AddOnRecord["category"]): ShoppingItemCategory {
  if (category === "Hardware" || category === "Packaging" || category === "Tooling") {
    return category;
  }

  return "Other";
}

export const shoppingDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "shopping",
  notes: ["Pure manual shopping item validation and generated procurement suggestions."],
});
