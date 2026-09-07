import type { ProductRecord, ProductSaleUnit } from "@/domain/products";
import type { SaleRecord } from "@/domain/sales";

export const PRINT_PLANNER_HISTORY_DAYS = 28;
export const PRINT_PLANNER_TARGET_DAYS = 14;
export const PRINT_PLANNER_ALGORITHM_VERSION = 1;

export const PRINT_PLANNER_BUSINESSES = [
  {
    id: "sincerely",
    label: "Sincerely",
    productBusinessName: "Sincerely, Books",
    salesChannel: "Sincerely",
  },
  {
    id: "flora",
    label: "Flora",
    productBusinessName: "Flora & Faun",
    salesChannel: "Flora",
  },
  {
    id: "dear-reader",
    label: "Dear Reader",
    productBusinessName: "Dear Reader",
    salesChannel: "Dear Reader",
  },
  {
    id: "angkong-dimsum",
    label: "Angkong Dimsum",
    productBusinessName: "Angkong Dimsum",
    salesChannel: "Angkong",
  },
  {
    id: "stomping",
    label: "Stomping",
    productBusinessName: "Stomping Grounds",
    salesChannel: "Stomping",
  },
] as const;

export type PrintPlannerBusiness = (typeof PRINT_PLANNER_BUSINESSES)[number];
export type PrintPlannerBusinessId = PrintPlannerBusiness["id"];
export type PrintPlannerStatus = "covered" | "no-history" | "print";

export interface FreshInventoryCount {
  readonly businessId: PrintPlannerBusinessId;
  readonly productId: number;
  readonly quantity: number;
}

export interface PrintPlanItem {
  readonly businessId: PrintPlannerBusinessId;
  readonly businessName: string;
  readonly daysOfStock: number | null;
  readonly inventoryCount: number;
  readonly productId: number | null;
  readonly productName: string;
  readonly recommendedQuantity: number;
  readonly saleUnit: ProductSaleUnit;
  readonly status: PrintPlannerStatus;
  readonly targetQuantity: number;
  readonly unitsSold: number;
}

export interface PrintRecommendationAllocation {
  readonly businessId: PrintPlannerBusinessId;
  readonly businessName: string;
  readonly quantity: number;
}

export interface PrintRecommendation {
  readonly allocations: readonly PrintRecommendationAllocation[];
  readonly minimumDaysOfStock: number;
  readonly productId: number;
  readonly productName: string;
  readonly saleUnit: ProductSaleUnit;
  readonly totalRecommendedQuantity: number;
  readonly totalUnitsSold: number;
}

export interface PrintPlanCalculation {
  readonly algorithmVersion: number;
  readonly historyDays: number;
  readonly items: readonly PrintPlanItem[];
  readonly planDate: string;
  readonly recommendations: readonly PrintRecommendation[];
  readonly targetDays: number;
  readonly warnings: readonly string[];
  readonly windowEnd: string;
  readonly windowStart: string;
}

export interface PrintPlan {
  readonly algorithmVersion: number;
  readonly createdAt: string;
  readonly historyDays: number;
  readonly id: number;
  readonly items: readonly PrintPlanItem[];
  readonly planDate: string;
  readonly targetDays: number;
  readonly warnings: readonly string[];
  readonly windowEnd: string;
  readonly windowStart: string;
}

export interface PrintPlanSaveInput extends PrintPlanCalculation {}

export interface PrintPlannerInput {
  readonly counts: readonly FreshInventoryCount[];
  readonly planDate: string;
  readonly products: readonly Pick<
    ProductRecord,
    "businesses" | "designName" | "id" | "saleUnit"
  >[];
  readonly sales: readonly Pick<
    SaleRecord,
    "channel" | "productReference" | "quantity" | "saleDate" | "saleUnit"
  >[];
}

export function getPrintPlannerBusiness(
  businessId: PrintPlannerBusinessId,
): PrintPlannerBusiness {
  const business = PRINT_PLANNER_BUSINESSES.find((candidate) => candidate.id === businessId);

  if (!business) {
    throw new Error(`Unknown print-planner business: ${businessId}`);
  }

  return business;
}

export function getPrintPlannerBusinessForChannel(
  channel: string,
): PrintPlannerBusiness | null {
  return PRINT_PLANNER_BUSINESSES.find((business) => business.salesChannel === channel) ?? null;
}

export function isProductStockedAtBusiness(
  product: Pick<ProductRecord, "businesses">,
  business: PrintPlannerBusiness,
): boolean {
  const expected = normalizeIdentity(business.productBusinessName);
  return product.businesses.some((name) => normalizeIdentity(name) === expected);
}

export function getRequiredFreshInventoryCounts(
  products: PrintPlannerInput["products"],
): readonly { readonly businessId: PrintPlannerBusinessId; readonly productId: number }[] {
  return PRINT_PLANNER_BUSINESSES.flatMap((business) =>
    products
      .filter((product) => isProductStockedAtBusiness(product, business))
      .map((product) => ({ businessId: business.id, productId: product.id })),
  );
}

export function buildPrintPlanCalculation(input: PrintPlannerInput): PrintPlanCalculation {
  if (!isIsoDate(input.planDate)) {
    throw new Error("Plan date must be a valid calendar date.");
  }

  const countByKey = validateAndIndexCounts(input.products, input.counts);
  const windowEnd = input.planDate;
  const windowStart = addDays(input.planDate, -(PRINT_PLANNER_HISTORY_DAYS - 1));
  const warnings = new Set<string>();
  const productsByName = groupProductsByNormalizedName(input.products);
  const unitsByProductBusiness = new Map<string, number>();

  for (const sale of input.sales) {
    if (sale.channel === "Direct") {
      continue;
    }

    const business = getPrintPlannerBusinessForChannel(sale.channel);
    if (!business) {
      warnings.add(`Sales channel “${sale.channel}” is not mapped to Print Planner and was excluded.`);
      continue;
    }

    if (!isIsoDate(sale.saleDate)) {
      warnings.add(`A ${business.label} sale with an invalid date was excluded.`);
      continue;
    }

    if (sale.saleDate < windowStart || sale.saleDate > windowEnd) {
      continue;
    }

    const candidates = productsByName.get(normalizeIdentity(sale.productReference)) ?? [];
    if (candidates.length === 0) {
      warnings.add(`“${sale.productReference}” sales could not be matched to a Product Library item.`);
      continue;
    }

    if (candidates.length > 1) {
      warnings.add(`“${sale.productReference}” matches multiple Product Library items and was excluded.`);
      continue;
    }

    const product = candidates[0]!;
    if (product.saleUnit !== sale.saleUnit) {
      warnings.add(`“${sale.productReference}” has mismatched sale units and was excluded.`);
      continue;
    }

    if (!isProductStockedAtBusiness(product, business)) {
      warnings.add(`“${product.designName}” has ${business.label} sales but is not marked as stocked there.`);
      continue;
    }

    if (!Number.isInteger(sale.quantity) || sale.quantity <= 0) {
      warnings.add(`“${sale.productReference}” has an invalid sale quantity and was excluded.`);
      continue;
    }

    const key = productBusinessKey(product.id, business.id);
    unitsByProductBusiness.set(key, (unitsByProductBusiness.get(key) ?? 0) + sale.quantity);
  }

  const items = PRINT_PLANNER_BUSINESSES.flatMap((business) =>
    input.products
      .filter((product) => isProductStockedAtBusiness(product, business))
      .sort((left, right) => left.designName.localeCompare(right.designName))
      .map((product): PrintPlanItem => {
        const key = productBusinessKey(product.id, business.id);
        const inventoryCount = countByKey.get(key)!;
        const unitsSold = unitsByProductBusiness.get(key) ?? 0;
        const targetQuantity = unitsSold === 0
          ? 0
          : Math.ceil((unitsSold * PRINT_PLANNER_TARGET_DAYS) / PRINT_PLANNER_HISTORY_DAYS);
        const recommendedQuantity = Math.max(0, targetQuantity - inventoryCount);
        const daysOfStock = unitsSold === 0
          ? null
          : inventoryCount / (unitsSold / PRINT_PLANNER_HISTORY_DAYS);

        return {
          businessId: business.id,
          businessName: business.label,
          daysOfStock,
          inventoryCount,
          productId: product.id,
          productName: product.designName,
          recommendedQuantity,
          saleUnit: product.saleUnit,
          status: unitsSold === 0 ? "no-history" : recommendedQuantity > 0 ? "print" : "covered",
          targetQuantity,
          unitsSold,
        };
      }),
  );

  return {
    algorithmVersion: PRINT_PLANNER_ALGORITHM_VERSION,
    historyDays: PRINT_PLANNER_HISTORY_DAYS,
    items,
    planDate: input.planDate,
    recommendations: consolidateRecommendations(items),
    targetDays: PRINT_PLANNER_TARGET_DAYS,
    warnings: Array.from(warnings).sort(),
    windowEnd,
    windowStart,
  };
}

export function consolidateRecommendations(
  items: readonly PrintPlanItem[],
): readonly PrintRecommendation[] {
  const grouped = new Map<number, PrintPlanItem[]>();

  for (const item of items) {
    if (item.productId == null || item.recommendedQuantity <= 0) {
      continue;
    }

    const current = grouped.get(item.productId) ?? [];
    current.push(item);
    grouped.set(item.productId, current);
  }

  return Array.from(grouped.entries())
    .map(([productId, productItems]): PrintRecommendation => {
      const first = productItems[0]!;
      return {
        allocations: productItems
          .filter((item) => item.recommendedQuantity > 0)
          .map((item) => ({
            businessId: item.businessId,
            businessName: item.businessName,
            quantity: item.recommendedQuantity,
          })),
        minimumDaysOfStock: Math.min(
          ...productItems.map((item) => item.daysOfStock ?? Number.POSITIVE_INFINITY),
        ),
        productId,
        productName: first.productName,
        saleUnit: first.saleUnit,
        totalRecommendedQuantity: productItems.reduce(
          (sum, item) => sum + item.recommendedQuantity,
          0,
        ),
        totalUnitsSold: productItems.reduce((sum, item) => sum + item.unitsSold, 0),
      };
    })
    .sort((left, right) =>
      left.minimumDaysOfStock - right.minimumDaysOfStock ||
      right.totalRecommendedQuantity - left.totalRecommendedQuantity ||
      right.totalUnitsSold - left.totalUnitsSold ||
      left.productName.localeCompare(right.productName),
    );
}

export function getPrintPlanRecommendations(plan: PrintPlan): readonly PrintRecommendation[] {
  return consolidateRecommendations(plan.items);
}

function validateAndIndexCounts(
  products: PrintPlannerInput["products"],
  counts: readonly FreshInventoryCount[],
): Map<string, number> {
  const countByKey = new Map<string, number>();
  const requiredKeys = new Set(
    getRequiredFreshInventoryCounts(products).map(({ productId, businessId }) =>
      productBusinessKey(productId, businessId),
    ),
  );

  for (const count of counts) {
    const key = productBusinessKey(count.productId, count.businessId);
    if (!requiredKeys.has(key)) {
      throw new Error("A physical count does not match the current stocked-product setup.");
    }
    if (countByKey.has(key)) {
      throw new Error("Each stocked product must have exactly one physical count per business.");
    }
    if (!Number.isInteger(count.quantity) || count.quantity < 0) {
      throw new Error("Physical counts must be non-negative whole numbers.");
    }
    countByKey.set(key, count.quantity);
  }

  if (requiredKeys.size !== countByKey.size) {
    throw new Error("Count every stocked product before generating the plan.");
  }

  return countByKey;
}

function consolidateWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeIdentity(value: string): string {
  return consolidateWhitespace(value).toLocaleLowerCase();
}

function groupProductsByNormalizedName(
  products: PrintPlannerInput["products"],
): Map<string, PrintPlannerInput["products"][number][]> {
  const grouped = new Map<string, PrintPlannerInput["products"][number][]>();
  for (const product of products) {
    const key = normalizeIdentity(product.designName);
    const current = grouped.get(key) ?? [];
    current.push(product);
    grouped.set(key, current);
  }
  return grouped;
}

function productBusinessKey(productId: number, businessId: PrintPlannerBusinessId): string {
  return `${businessId}:${productId}`;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseIsoDate(value);
  return parsed != null && formatIsoDate(parsed) === value;
}

function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  if (!date) throw new Error("Date could not be parsed.");
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

function parseIsoDate(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  if (year == null || month == null || day == null) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDate(value: Date): string {
  return [
    String(value.getUTCFullYear()).padStart(4, "0"),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
