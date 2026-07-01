export const FILAMENT_MATERIALS = [
  "PLA",
  "PLA+",
  "PETG",
  "ABS",
  "ASA",
  "TPU",
  "Other",
] as const;

export const SPOOL_STATUSES = ["open", "sealed", "empty", "archived"] as const;

export type FilamentMaterial = (typeof FILAMENT_MATERIALS)[number];
export type SpoolStatus = (typeof SPOOL_STATUSES)[number];
export type StockSignal = "ready" | "low" | "empty" | "sealed" | "archived";

export interface FilamentRecord {
  readonly id: number;
  readonly brand: string;
  readonly name: string;
  readonly materialType: FilamentMaterial;
  readonly colorName: string;
  readonly hexColor: string;
  readonly transmissionDistance: number | null;
  readonly spoolStatus: SpoolStatus;
  readonly startingGrams: number;
  readonly estimatedGramsLeft: number;
  readonly spoolCost: number;
  readonly purchaseSource: string;
  readonly notes: string;
  readonly lowStockThresholdGrams: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FilamentInput {
  readonly brand: string;
  readonly name: string;
  readonly materialType: FilamentMaterial;
  readonly colorName: string;
  readonly hexColor: string;
  readonly transmissionDistance: number | null;
  readonly spoolStatus: SpoolStatus;
  readonly startingGrams: number;
  readonly estimatedGramsLeft: number;
  readonly spoolCost: number;
  readonly purchaseSource: string;
  readonly notes: string;
  readonly lowStockThresholdGrams: number;
}

export interface FilamentStockAdjustmentInput {
  readonly gramsDelta: number;
  readonly reason: string;
  readonly notes: string;
}

export interface FilamentStockAdjustmentRecord {
  readonly createdAt: string;
  readonly filamentId: number;
  readonly gramsAfter: number;
  readonly gramsDelta: number;
  readonly id: number;
  readonly notes: string;
  readonly reason: string;
}

export interface FilamentValidationResult {
  readonly errors: Partial<Record<keyof FilamentInput, string>>;
  readonly valid: boolean;
}

export interface FilamentStockAdjustmentValidationResult {
  readonly errors: Partial<Record<keyof FilamentStockAdjustmentInput, string>>;
  readonly valid: boolean;
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function normalizeHexColor(value: string): string {
  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

  return prefixed.toLowerCase();
}

export function formatGramsLeft(grams: number): string {
  if (!Number.isFinite(grams)) {
    return "--";
  }

  return `${Math.max(0, Math.round(grams))}g`;
}

export function getStockSignal(filament: Pick<
  FilamentRecord,
  "estimatedGramsLeft" | "lowStockThresholdGrams" | "spoolStatus"
>): StockSignal {
  if (filament.spoolStatus === "archived") {
    return "archived";
  }

  if (filament.spoolStatus === "sealed") {
    return "sealed";
  }

  if (filament.spoolStatus === "empty" || filament.estimatedGramsLeft <= 0) {
    return "empty";
  }

  if (filament.estimatedGramsLeft <= filament.lowStockThresholdGrams) {
    return "low";
  }

  return "ready";
}

export function isLowStock(filament: Pick<
  FilamentRecord,
  "estimatedGramsLeft" | "lowStockThresholdGrams" | "spoolStatus"
>): boolean {
  return getStockSignal(filament) === "low";
}

export function validateFilamentInput(input: FilamentInput): FilamentValidationResult {
  const errors: Partial<Record<keyof FilamentInput, string>> = {};
  const normalizedHex = normalizeHexColor(input.hexColor);

  if (!input.brand.trim()) {
    errors.brand = "Brand is required.";
  }

  if (!input.name.trim()) {
    errors.name = "Spool name is required.";
  }

  if (!input.colorName.trim()) {
    errors.colorName = "Color name is required.";
  }

  if (!HEX_COLOR_PATTERN.test(normalizedHex)) {
    errors.hexColor = "Use a 6-digit hex color, for example #f8f8f2.";
  }

  if (input.transmissionDistance != null && input.transmissionDistance < 0) {
    errors.transmissionDistance = "TD cannot be negative.";
  }

  if (input.startingGrams <= 0) {
    errors.startingGrams = "Starting grams must be greater than 0.";
  }

  if (input.estimatedGramsLeft < 0) {
    errors.estimatedGramsLeft = "Grams left cannot be negative.";
  }

  if (input.estimatedGramsLeft > input.startingGrams) {
    errors.estimatedGramsLeft = "Grams left cannot exceed starting grams.";
  }

  if (input.spoolCost < 0) {
    errors.spoolCost = "Cost cannot be negative.";
  }

  if (input.lowStockThresholdGrams < 0) {
    errors.lowStockThresholdGrams = "Low-stock threshold cannot be negative.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function validateFilamentStockAdjustmentInput(
  input: FilamentStockAdjustmentInput,
): FilamentStockAdjustmentValidationResult {
  const errors: Partial<Record<keyof FilamentStockAdjustmentInput, string>> = {};

  if (!Number.isFinite(input.gramsDelta) || input.gramsDelta === 0) {
    errors.gramsDelta = "Adjustment grams must be a non-zero number.";
  }

  if (!input.reason.trim()) {
    errors.reason = "Adjustment reason is required.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}
