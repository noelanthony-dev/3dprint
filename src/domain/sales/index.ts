import {
  isFinishedGoodSaleUnit,
  type FinishedGoodRecord,
  type FinishedGoodSaleUnit,
} from "@/domain/inventory";
import { createScaffoldModuleStatus } from "@/domain/shared";

export const SALES_CHANNELS = ["Direct", "Sincerely", "Dear Reader", "Flora"] as const;

export type SalesChannel = (typeof SALES_CHANNELS)[number];
export type SaleStockStatus = "available" | "insufficient" | "out";

export interface SaleInput {
  readonly channel: SalesChannel;
  readonly discountsFees: number;
  readonly finishedGoodId: number;
  readonly grossRevenue: number;
  readonly notes: string;
  readonly productReference: string;
  readonly quantity: number;
  readonly saleDate: string;
  readonly saleUnit: FinishedGoodSaleUnit;
}

export interface SaleRecord {
  readonly channel: SalesChannel;
  readonly createdAt: string;
  readonly discountsFees: number;
  readonly finishedGoodId: number;
  readonly grossRevenue: number;
  readonly id: number;
  readonly netRevenue: number;
  readonly notes: string;
  readonly productReference: string;
  readonly quantity: number;
  readonly saleDate: string;
  readonly saleUnit: FinishedGoodSaleUnit;
  readonly stockQuantityAfter: number;
  readonly stockQuantityBefore: number;
  readonly updatedAt: string;
}

export interface SaleStockMovementRecord {
  readonly createdAt: string;
  readonly finishedGoodId: number;
  readonly id: number;
  readonly quantityAfter: number;
  readonly quantityBefore: number;
  readonly quantityDelta: number;
  readonly saleId: number;
}

export interface SaleTotals {
  readonly averageUnitPrice: number;
  readonly discountsFees: number;
  readonly grossRevenue: number;
  readonly netRevenue: number;
}

export interface SaleValidationResult {
  readonly errors: Partial<Record<keyof SaleInput, string>>;
  readonly valid: boolean;
}

export function isSalesChannel(value: string): value is SalesChannel {
  return SALES_CHANNELS.includes(value as SalesChannel);
}

export function calculateSaleTotals(
  input: Pick<SaleInput, "discountsFees" | "grossRevenue" | "quantity">,
): SaleTotals {
  const grossRevenue = roundMoney(Math.max(0, input.grossRevenue));
  const discountsFees = roundMoney(Math.max(0, input.discountsFees));
  const netRevenue = roundMoney(grossRevenue - discountsFees);

  return {
    averageUnitPrice: input.quantity > 0 ? roundMoney(netRevenue / input.quantity) : 0,
    discountsFees,
    grossRevenue,
    netRevenue,
  };
}

export function getSaleStockStatus(
  stock: Pick<FinishedGoodRecord, "quantityReady">,
  quantity: number,
): SaleStockStatus {
  if (stock.quantityReady <= 0) {
    return "out";
  }

  if (quantity > stock.quantityReady) {
    return "insufficient";
  }

  return "available";
}

export function validateSaleInput(input: SaleInput): SaleValidationResult {
  const errors: Partial<Record<keyof SaleInput, string>> = {};

  if (!Number.isInteger(input.finishedGoodId) || input.finishedGoodId <= 0) {
    errors.finishedGoodId = "Choose a finished good item.";
  }

  if (!input.productReference.trim()) {
    errors.productReference = "Product reference is required.";
  }

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    errors.quantity = "Sale quantity must be at least 1.";
  }

  if (!isFinishedGoodSaleUnit(input.saleUnit)) {
    errors.saleUnit = "Choose a valid sale unit.";
  }

  if (!isSalesChannel(input.channel)) {
    errors.channel = "Choose a valid sales channel.";
  }

  if (!input.saleDate.trim()) {
    errors.saleDate = "Sale date is required.";
  }

  if (!Number.isFinite(input.grossRevenue) || input.grossRevenue < 0) {
    errors.grossRevenue = "Gross revenue cannot be negative.";
  }

  if (!Number.isFinite(input.discountsFees) || input.discountsFees < 0) {
    errors.discountsFees = "Discounts and fees cannot be negative.";
  }

  if (
    Number.isFinite(input.grossRevenue) &&
    Number.isFinite(input.discountsFees) &&
    input.discountsFees > input.grossRevenue
  ) {
    errors.discountsFees = "Discounts and fees cannot exceed gross revenue.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function validateSaleAgainstStock(
  input: Pick<SaleInput, "quantity" | "saleUnit">,
  stock: Pick<FinishedGoodRecord, "quantityReady" | "saleUnit">,
): string | null {
  if (stock.saleUnit !== input.saleUnit) {
    return "Sale unit does not match the finished goods stock unit.";
  }

  const stockStatus = getSaleStockStatus(stock, input.quantity);

  if (stockStatus === "out") {
    return "Finished goods stock is out for this item.";
  }

  if (stockStatus === "insufficient") {
    return "Finished goods stock is too low for this sale quantity.";
  }

  return null;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const salesDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "sales",
  notes: ["Pure sales validation, revenue totals, and finished-goods stock checks."],
});
