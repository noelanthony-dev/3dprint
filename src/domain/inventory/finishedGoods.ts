export const FINISHED_GOOD_SALE_UNITS = ["piece", "pair", "set", "bundle", "pack"] as const;

export type FinishedGoodSaleUnit = (typeof FINISHED_GOOD_SALE_UNITS)[number];
export type FinishedGoodQuantityStatus = "ready" | "low" | "reserved" | "out";

export interface FinishedGoodRecord {
  readonly id: number;
  readonly productReference: string;
  readonly saleUnit: FinishedGoodSaleUnit;
  readonly quantityReady: number;
  readonly quantityReserved: number;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FinishedGoodInput {
  readonly productReference: string;
  readonly saleUnit: FinishedGoodSaleUnit;
  readonly quantityReady: number;
  readonly quantityReserved: number;
  readonly notes: string;
}

export interface FinishedGoodStockAdjustmentInput {
  readonly quantityDelta: number;
  readonly reason: string;
  readonly notes: string;
}

export interface FinishedGoodStockAdjustmentRecord {
  readonly id: number;
  readonly finishedGoodId: number;
  readonly quantityDelta: number;
  readonly quantityAfter: number;
  readonly reason: string;
  readonly notes: string;
  readonly createdAt: string;
}

export interface FinishedGoodValidationResult {
  readonly errors: Partial<Record<keyof FinishedGoodInput, string>>;
  readonly valid: boolean;
}

export interface FinishedGoodStockAdjustmentValidationResult {
  readonly errors: Partial<Record<keyof FinishedGoodStockAdjustmentInput, string>>;
  readonly valid: boolean;
}

export function isFinishedGoodSaleUnit(value: string): value is FinishedGoodSaleUnit {
  return FINISHED_GOOD_SALE_UNITS.includes(value as FinishedGoodSaleUnit);
}

export function getAvailableFinishedGoodsQuantity(
  item: Pick<FinishedGoodRecord, "quantityReady" | "quantityReserved">,
): number {
  if (!Number.isFinite(item.quantityReady) || !Number.isFinite(item.quantityReserved)) {
    return 0;
  }

  return Math.max(0, item.quantityReady - item.quantityReserved);
}

export function getFinishedGoodQuantityStatus(
  item: Pick<FinishedGoodRecord, "quantityReady" | "quantityReserved">,
): FinishedGoodQuantityStatus {
  const available = getAvailableFinishedGoodsQuantity(item);

  if (item.quantityReady <= 0) {
    return "out";
  }

  if (available <= 0) {
    return "reserved";
  }

  if (available <= 2) {
    return "low";
  }

  return "ready";
}

export function formatFinishedGoodsQuantity(
  quantity: number,
  saleUnit: FinishedGoodSaleUnit | string,
): string {
  if (!Number.isFinite(quantity)) {
    return "--";
  }

  const boundedQuantity = Math.max(0, quantity);
  const displayQuantity = Number.isInteger(boundedQuantity)
    ? String(boundedQuantity)
    : boundedQuantity.toFixed(2).replace(/\.?0+$/, "");
  const normalizedUnit = saleUnit.trim();
  const displayUnit = boundedQuantity === 1 ? normalizedUnit : pluralizeSaleUnit(normalizedUnit);

  return normalizedUnit ? `${displayQuantity} ${displayUnit}` : displayQuantity;
}

export function formatFinishedGoodsQuantityDelta(
  quantityDelta: number,
  saleUnit: FinishedGoodSaleUnit | string,
): string {
  if (!Number.isFinite(quantityDelta)) {
    return "--";
  }

  const sign = quantityDelta > 0 ? "+" : "";
  const absoluteUnit = saleUnit.trim();
  const displayUnit = Math.abs(quantityDelta) === 1 ? absoluteUnit : pluralizeSaleUnit(absoluteUnit);

  return absoluteUnit ? `${sign}${quantityDelta} ${displayUnit}` : `${sign}${quantityDelta}`;
}

export function validateFinishedGoodInput(
  input: FinishedGoodInput,
): FinishedGoodValidationResult {
  const errors: Partial<Record<keyof FinishedGoodInput, string>> = {};

  if (!input.productReference.trim()) {
    errors.productReference = "Product or design reference is required.";
  }

  if (!isFinishedGoodSaleUnit(input.saleUnit)) {
    errors.saleUnit = "Choose a valid sale unit.";
  }

  if (!Number.isFinite(input.quantityReady) || input.quantityReady < 0) {
    errors.quantityReady = "Ready quantity must be zero or greater.";
  }

  if (!Number.isFinite(input.quantityReserved) || input.quantityReserved < 0) {
    errors.quantityReserved = "Reserved quantity must be zero or greater.";
  }

  if (
    Number.isFinite(input.quantityReady) &&
    Number.isFinite(input.quantityReserved) &&
    input.quantityReserved > input.quantityReady
  ) {
    errors.quantityReserved = "Reserved quantity cannot exceed ready quantity.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function validateFinishedGoodStockAdjustmentInput(
  input: FinishedGoodStockAdjustmentInput,
): FinishedGoodStockAdjustmentValidationResult {
  const errors: Partial<Record<keyof FinishedGoodStockAdjustmentInput, string>> = {};

  if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
    errors.quantityDelta = "Adjustment quantity must be a non-zero number.";
  }

  if (!Number.isInteger(input.quantityDelta)) {
    errors.quantityDelta = "Finished goods adjustments must use whole units.";
  }

  if (!input.reason.trim()) {
    errors.reason = "Adjustment reason is required.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

function pluralizeSaleUnit(unit: string): string {
  if (!unit) {
    return unit;
  }

  if (unit === "piece") {
    return "pieces";
  }

  if (unit === "pair") {
    return "pairs";
  }

  return `${unit}s`;
}
