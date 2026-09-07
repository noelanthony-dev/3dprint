import {
  isFinishedGoodSaleUnit,
  type FinishedGoodRecord,
  type FinishedGoodSaleUnit,
} from "@/domain/inventory";
import { createScaffoldModuleStatus, isIsoDate, isMonthToken } from "@/domain/shared";

export const SALES_CHANNELS = [
  "Direct",
  "Sincerely",
  "Dear Reader",
  "Flora",
  "Angkong",
  "Stomping",
] as const;

export type SalesChannel = (typeof SALES_CHANNELS)[number];
export type SalesPeriodMode = "lifetime" | "monthly" | "daily";
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

export interface SaleDetailsInput {
  readonly channel: SalesChannel;
  readonly discountsFees: number;
  readonly grossRevenue: number;
  readonly notes: string;
  readonly saleDate: string;
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

export interface SalesChannelSummary {
  readonly channel: SalesChannel;
  readonly netRevenue: number;
  readonly orderCount: number;
  readonly unitsSold: number;
}

export interface SalesProductUnitSummary {
  readonly productReference: string;
  readonly saleUnit: FinishedGoodSaleUnit;
  readonly unitsSold: number;
}

export interface SaleValidationResult {
  readonly errors: Partial<Record<keyof SaleInput, string>>;
  readonly valid: boolean;
}

export interface SaleDetailsValidationResult {
  readonly errors: Partial<Record<keyof SaleDetailsInput, string>>;
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

export function getSalesChannelSummaries(
  sales: readonly Pick<SaleRecord, "channel" | "netRevenue" | "quantity">[],
): readonly SalesChannelSummary[] {
  return SALES_CHANNELS.map((channel) => {
    const channelSales = sales.filter((sale) => sale.channel === channel);

    return {
      channel,
      netRevenue: roundMoney(
        channelSales.reduce((total, sale) => total + sale.netRevenue, 0),
      ),
      orderCount: channelSales.length,
      unitsSold: channelSales.reduce((total, sale) => total + sale.quantity, 0),
    };
  });
}

export function getSalesProductUnitSummaries(
  sales: readonly Pick<SaleRecord, "productReference" | "quantity" | "saleUnit">[],
): readonly SalesProductUnitSummary[] {
  const summaries = new Map<string, Map<FinishedGoodSaleUnit, number>>();

  for (const sale of sales) {
    const productSummaries = summaries.get(sale.productReference) ?? new Map();
    productSummaries.set(sale.saleUnit, (productSummaries.get(sale.saleUnit) ?? 0) + sale.quantity);
    summaries.set(sale.productReference, productSummaries);
  }

  return Array.from(summaries.entries())
    .flatMap(([productReference, productSummaries]) =>
      Array.from(productSummaries.entries()).map(([saleUnit, unitsSold]) => ({
        productReference,
        saleUnit,
        unitsSold,
      })),
    )
    .sort((first, second) =>
      second.unitsSold - first.unitsSold ||
      first.productReference.localeCompare(second.productReference) ||
      first.saleUnit.localeCompare(second.saleUnit),
    );
}

export function filterSalesByPeriod<T extends Pick<SaleRecord, "saleDate">>(
  sales: readonly T[],
  periodMode: SalesPeriodMode,
  month: string,
  date = "",
): readonly T[] {
  if (periodMode === "lifetime") {
    return sales;
  }

  if (periodMode === "daily") {
    return isIsoDate(date)
      ? sales.filter((sale) => sale.saleDate === date)
      : [];
  }

  return isMonthToken(month)
    ? sales.filter((sale) => sale.saleDate.startsWith(`${month}-`))
    : [];
}

export function getSaleStockStatus(
  stock: Pick<FinishedGoodRecord, "quantityReady" | "quantityReserved">,
  quantity: number,
): SaleStockStatus {
  const availableQuantity = Math.max(0, stock.quantityReady - stock.quantityReserved);

  if (availableQuantity <= 0) {
    return "out";
  }

  if (quantity > availableQuantity) {
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

export function validateSaleDetailsInput(
  input: SaleDetailsInput,
): SaleDetailsValidationResult {
  const errors: Partial<Record<keyof SaleDetailsInput, string>> = {};

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
  stock: Pick<FinishedGoodRecord, "quantityReady" | "quantityReserved" | "saleUnit">,
): string | null {
  if (stock.saleUnit !== input.saleUnit) {
    return "Sale unit does not match the finished goods stock unit.";
  }

  return null;
}

export function getSaleStockReconciliationQuantity(
  input: Pick<SaleInput, "quantity">,
  stock: Pick<FinishedGoodRecord, "quantityReady" | "quantityReserved">,
): number {
  const availableQuantity = Math.max(0, stock.quantityReady - stock.quantityReserved);
  return Math.max(0, input.quantity - availableQuantity);
}

export function getSaleStockWarning(
  input: Pick<SaleInput, "quantity">,
  stock: Pick<FinishedGoodRecord, "quantityReady" | "quantityReserved">,
): string | null {
  const reconciliationQuantity = getSaleStockReconciliationQuantity(input, stock);

  if (reconciliationQuantity === 0) {
    return null;
  }

  return `${reconciliationQuantity} missing finished-good ${reconciliationQuantity === 1 ? "unit" : "units"} will be added automatically before recording this sale.`;
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
  notes: ["Pure sales validation, period filtering, revenue totals, and finished-goods stock checks."],
});
