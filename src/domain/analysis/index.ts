import { calculatePrintCost, type PrintProfileRecord } from "@/domain/costing";
import type { ExpenseRecord, MembershipRecord } from "@/domain/expenses";
import {
  getAddOnStockSignal,
  getFinishedGoodQuantityStatus,
  getStockSignal,
  type AddOnRecord,
  type AddOnStockAdjustmentRecord,
  type FilamentProfileRecord,
  type FilamentRecord,
  type FilamentStockAdjustmentRecord,
  type FinishedGoodRecord,
  type FinishedGoodStockAdjustmentRecord,
} from "@/domain/inventory";
import { calculatePricing } from "@/domain/pricing";
import type { ProductRecord } from "@/domain/products";
import type {
  ProductionAddOnCorrectionRecord,
  ProductionAddOnDeductionRecord,
  ProductionFilamentDeductionRecord,
  ProductionRunRecord,
} from "@/domain/production";
import {
  buildBusinessPerformanceComparison,
  buildLifetimeReport,
  buildMonthlyReport,
  buildSalesAnalytics,
  type MonthlyReport,
  type SalesAnalytics,
  type SalesAnalyticsPeriod,
} from "@/domain/reports";
import type { SaleRecord, SaleStockMovementRecord } from "@/domain/sales";
import type { AppSettings } from "@/domain/settings";
import type { HueForgeMissingRequirement, ShoppingListItemRecord } from "@/domain/shopping";

export const AI_ANALYSIS_FORMAT = "printops.ai-analysis";
export const AI_ANALYSIS_FORMAT_VERSION = 1;

export interface HueForgeAnalysisExportRecord {
  readonly createdAt: string;
  readonly feasibilityNotes: string;
  readonly feasibilityStatus: string;
  readonly id: number;
  readonly missingWarnings: readonly string[];
  readonly productId: number;
  readonly updatedAt: string;
}

export interface HueForgeRequirementExportRecord {
  readonly brand: string;
  readonly colorDistance: number | null;
  readonly colorName: string;
  readonly createdAt: string;
  readonly hexColor: string;
  readonly id: number;
  readonly layerRange: string;
  readonly matchScore: number;
  readonly matchStatus: string;
  readonly materialType: string;
  readonly productId: number;
  readonly requiredGrams: number;
  readonly role: string;
  readonly stockSignal: string;
  readonly suggestedFilamentId: number | null;
  readonly suggestedFilamentLabel: string;
  readonly tdDelta: number | null;
  readonly transmissionDistance: number;
  readonly warning: string;
}

export interface AnalysisSourceData {
  readonly addOnAdjustments: readonly AddOnStockAdjustmentRecord[];
  readonly addOns: readonly AddOnRecord[];
  readonly expenses: readonly ExpenseRecord[];
  readonly filamentAdjustments: readonly FilamentStockAdjustmentRecord[];
  readonly filamentProfiles: readonly FilamentProfileRecord[];
  readonly filaments: readonly FilamentRecord[];
  readonly finishedGoodAdjustments: readonly FinishedGoodStockAdjustmentRecord[];
  readonly finishedGoods: readonly FinishedGoodRecord[];
  readonly hueForgeAnalyses: readonly HueForgeAnalysisExportRecord[];
  readonly hueForgeMissingRequirements: readonly HueForgeMissingRequirement[];
  readonly hueForgeRequirements: readonly HueForgeRequirementExportRecord[];
  readonly memberships: readonly MembershipRecord[];
  readonly printProfiles: readonly PrintProfileRecord[];
  readonly productionAddOnCorrections: readonly ProductionAddOnCorrectionRecord[];
  readonly productionAddOnDeductions: readonly ProductionAddOnDeductionRecord[];
  readonly productionFilamentDeductions: readonly ProductionFilamentDeductionRecord[];
  readonly productionRuns: readonly ProductionRunRecord[];
  readonly products: readonly ProductRecord[];
  readonly saleStockMovements: readonly SaleStockMovementRecord[];
  readonly sales: readonly SaleRecord[];
  readonly shoppingListItems: readonly ShoppingListItemRecord[];
}

export interface AiAnalysisPackV1 {
  readonly dataDictionary: readonly AnalysisFieldDefinition[];
  readonly derivedData: {
    readonly businessPerformance: ReturnType<typeof buildBusinessPerformanceComparison>;
    readonly costingProfiles: readonly AnalysisCostingProfile[];
    readonly inventorySignals: AnalysisInventorySignals;
    readonly lifetimeReport: MonthlyReport;
    readonly lifetimeSalesAnalytics: SalesAnalytics;
    readonly monthlyReports: Readonly<Record<string, MonthlyReport>>;
    readonly monthlySalesAnalytics: Readonly<Record<string, SalesAnalytics>>;
  };
  readonly format: typeof AI_ANALYSIS_FORMAT;
  readonly formatVersion: typeof AI_ANALYSIS_FORMAT_VERSION;
  readonly limitations: readonly string[];
  readonly metadata: {
    readonly appVersion: string;
    readonly currency: AppSettings["currencySymbol"];
    readonly generatedAt: string;
    readonly privateTextIncluded: true;
    readonly recordCounts: Readonly<Record<keyof AnalysisSourceData, number>>;
  };
  readonly qualityFindings: readonly AnalysisQualityFinding[];
  readonly relationships: readonly AnalysisRelationship[];
  readonly sourceData: AnalysisSourceData & { readonly settings: AppSettings };
}

export interface AnalysisFieldDefinition {
  readonly field: string;
  readonly meaning: string;
}

export interface AnalysisRelationship {
  readonly from: string;
  readonly to: string;
  readonly rule: string;
}

export interface AnalysisQualityFinding {
  readonly code: string;
  readonly count: number;
  readonly message: string;
  readonly severity: "info" | "warning";
}

export interface AnalysisCostingProfile {
  readonly cost: ReturnType<typeof calculatePrintCost>;
  readonly pricing: ReturnType<typeof calculatePricing>;
  readonly productId: number;
  readonly productName: string | null;
  readonly profileId: number;
  readonly profileName: string;
}

export interface AnalysisInventorySignals {
  readonly addOns: readonly { readonly id: number; readonly signal: ReturnType<typeof getAddOnStockSignal> }[];
  readonly filaments: readonly { readonly id: number; readonly signal: ReturnType<typeof getStockSignal> }[];
  readonly finishedGoods: readonly { readonly id: number; readonly signal: ReturnType<typeof getFinishedGoodQuantityStatus> }[];
}

export const ANALYSIS_LIMITATIONS = [
  "Historical product-level gross margin is not exact because sales do not snapshot sale-time unit cost or the print profile used.",
  "Exported costing figures use the current saved costing model and are not guaranteed historical costs.",
  "Simple profit is net revenue minus recorded expenses; it is not formal accounting, tax profit, or cash flow.",
  "Expenses, memberships, and production do not store a sales business/channel, so channel-specific profit cannot be calculated reliably.",
  "Recurring expenses and memberships are recurrence definitions, not a ledger of individual payments.",
  "Production expenses may overlap material purchase expenses because the app does not deduplicate them.",
  "Product, costing, and sales relationships must use stored IDs only. Do not infer a relationship from similar names or product references.",
] as const;

export const ANALYSIS_RELATIONSHIPS: readonly AnalysisRelationship[] = [
  { from: "productionRuns.productId", to: "products.id", rule: "exact foreign key" },
  { from: "productionRuns.printProfileId", to: "printProfiles.id", rule: "exact foreign key" },
  { from: "productionRuns.filamentId", to: "filaments.id", rule: "exact foreign key" },
  { from: "productionRuns.finishedGoodId", to: "finishedGoods.id", rule: "nullable exact foreign key" },
  { from: "sales.finishedGoodId", to: "finishedGoods.id", rule: "exact foreign key" },
  { from: "expenses.productionRunId", to: "productionRuns.id", rule: "nullable exact foreign key" },
  { from: "printProfiles.productId", to: "products.id", rule: "exact foreign key" },
  { from: "hueForgeAnalyses.productId", to: "products.id", rule: "exact foreign key" },
  { from: "hueForgeRequirements.productId", to: "products.id", rule: "exact foreign key" },
  { from: "hueForgeRequirements.suggestedFilamentId", to: "filaments.id", rule: "nullable exact foreign key" },
  { from: "shoppingListItems.productIds", to: "products.id", rule: "array of exact foreign keys" },
];

export const ANALYSIS_DATA_DICTIONARY: readonly AnalysisFieldDefinition[] = [
  { field: "currency amounts", meaning: "Plain numeric fields denominated in the currency named by metadata.currency; no symbols are embedded in the numbers." },
  { field: "sales.grossRevenue", meaning: "Revenue before discounts and channel fees." },
  { field: "sales.discountsFees", meaning: "Discounts and fees deducted from gross revenue." },
  { field: "sales.netRevenue", meaning: "Gross revenue minus discounts and fees." },
  { field: "expenses.recurrence", meaning: "one-time, monthly, or annual recurrence definition; not proof of payment." },
  { field: "productionRuns.goodPieces / failedPieces", meaning: "Actual good and failed output recorded for a production run." },
  { field: "printProfiles", meaning: "Current costing assumptions and target markup, not immutable historical snapshots." },
  { field: "derivedData.lifetimeReport.profitSummary.simpleProfit", meaning: "Net revenue minus all recorded expenses and counted memberships." },
  { field: "dates", meaning: "Stored ISO date or date-time strings. saleDate, expenseDate, and runDate are business dates." },
  { field: "notes and names", meaning: "Private free text is included exactly as stored at the user's request." },
];

export function buildAiAnalysisPack(input: {
  readonly appVersion: string;
  readonly generatedAt: string;
  readonly settings: AppSettings;
  readonly sourceData: AnalysisSourceData;
}): AiAnalysisPackV1 {
  const representedMonths = listRepresentedMonths(input.sourceData);
  const today = input.generatedAt.slice(0, 10);
  const productsById = new Map(input.sourceData.products.map((product) => [product.id, product]));
  const reportSource = {
    expenses: input.sourceData.expenses,
    memberships: input.sourceData.memberships,
    productionRuns: input.sourceData.productionRuns,
    sales: input.sourceData.sales,
  };

  return {
    dataDictionary: ANALYSIS_DATA_DICTIONARY,
    derivedData: {
      businessPerformance: buildBusinessPerformanceComparison({
        period: "all",
        sales: input.sourceData.sales,
        today,
      }),
      costingProfiles: input.sourceData.printProfiles.map((profile) => {
        const cost = calculatePrintCost(profile);
        return {
          cost,
          pricing: calculatePricing({
            costPerUnit: cost.costPerGoodUnit,
            expectedGoodUnits: profile.expectedGoodUnits,
            laborMinutes: profile.laborMinutes,
            markupMultiplier: profile.targetMarkup,
            printHours: cost.totalPrintHours,
          }),
          productId: profile.productId,
          productName: productsById.get(profile.productId)?.designName ?? null,
          profileId: profile.id,
          profileName: profile.profileName,
        };
      }),
      inventorySignals: {
        addOns: input.sourceData.addOns.map((item) => ({ id: item.id, signal: getAddOnStockSignal(item) })),
        filaments: input.sourceData.filaments.map((item) => ({ id: item.id, signal: getStockSignal(item) })),
        finishedGoods: input.sourceData.finishedGoods.map((item) => ({ id: item.id, signal: getFinishedGoodQuantityStatus(item) })),
      },
      lifetimeReport: buildLifetimeReport(reportSource),
      lifetimeSalesAnalytics: buildSalesAnalytics({
        business: "all",
        period: "all",
        sales: input.sourceData.sales,
        today,
      }),
      monthlyReports: Object.fromEntries(
        representedMonths.map((month) => [month, buildMonthlyReport({ ...reportSource, month })]),
      ),
      monthlySalesAnalytics: Object.fromEntries(
        representedMonths.map((month) => [
          month,
          buildSalesAnalytics({ business: "all", period: month as SalesAnalyticsPeriod, sales: input.sourceData.sales, today }),
        ]),
      ),
    },
    format: AI_ANALYSIS_FORMAT,
    formatVersion: AI_ANALYSIS_FORMAT_VERSION,
    limitations: ANALYSIS_LIMITATIONS,
    metadata: {
      appVersion: input.appVersion,
      currency: input.settings.currencySymbol,
      generatedAt: input.generatedAt,
      privateTextIncluded: true,
      recordCounts: countSourceRecords(input.sourceData),
    },
    qualityFindings: buildQualityFindings(input.sourceData),
    relationships: ANALYSIS_RELATIONSHIPS,
    sourceData: {
      ...input.sourceData,
      settings: input.settings,
    },
  };
}

export function listRepresentedMonths(sourceData: AnalysisSourceData): readonly string[] {
  const dates = [
    ...sourceData.sales.map((item) => item.saleDate),
    ...sourceData.expenses.flatMap((item) => [item.expenseDate, item.recurrenceMonth]),
    ...sourceData.memberships.map((item) => item.recurrenceMonth),
    ...sourceData.productionRuns.map((item) => item.runDate),
  ];

  return [...new Set(dates.filter((date) => /^\d{4}-\d{2}/.test(date)).map((date) => date.slice(0, 7)))]
    .sort();
}

function countSourceRecords(sourceData: AnalysisSourceData): Readonly<Record<keyof AnalysisSourceData, number>> {
  return Object.fromEntries(
    Object.entries(sourceData).map(([key, records]) => [key, records.length]),
  ) as unknown as Readonly<Record<keyof AnalysisSourceData, number>>;
}

function buildQualityFindings(sourceData: AnalysisSourceData): readonly AnalysisQualityFinding[] {
  const findings: AnalysisQualityFinding[] = [];
  const productIds = new Set(sourceData.products.map((item) => item.id));
  const profileIds = new Set(sourceData.printProfiles.map((item) => item.id));
  const filamentIds = new Set(sourceData.filaments.map((item) => item.id));
  const finishedGoodIds = new Set(sourceData.finishedGoods.map((item) => item.id));
  const invalidDates = [
    ...sourceData.sales.map((item) => item.saleDate),
    ...sourceData.expenses.map((item) => item.expenseDate),
    ...sourceData.productionRuns.map((item) => item.runDate),
  ].filter((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date)).length;
  const unresolvedProductionLinks = sourceData.productionRuns.filter((run) =>
    !productIds.has(run.productId) ||
    !profileIds.has(run.printProfileId) ||
    !filamentIds.has(run.filamentId) ||
    (run.finishedGoodId !== null && !finishedGoodIds.has(run.finishedGoodId)),
  ).length;
  const unresolvedSaleLinks = sourceData.sales.filter((sale) => !finishedGoodIds.has(sale.finishedGoodId)).length;
  const unresolvedProfileLinks = sourceData.printProfiles.filter((profile) => !productIds.has(profile.productId)).length;

  addFinding(findings, "invalid-business-dates", invalidDates, "Some sale, expense, or production dates are not YYYY-MM-DD.");
  addFinding(findings, "unresolved-production-links", unresolvedProductionLinks, "Some production runs reference missing products, profiles, filaments, or finished goods.");
  addFinding(findings, "unresolved-sale-links", unresolvedSaleLinks, "Some sales reference missing finished-goods records.");
  addFinding(findings, "unresolved-costing-links", unresolvedProfileLinks, "Some costing profiles reference missing products.");

  findings.push({
    code: "sale-cost-snapshot-unavailable",
    count: sourceData.sales.length,
    message: "Sales do not contain an immutable sale-time unit cost or print-profile link.",
    severity: "info",
  });

  return findings;
}

function addFinding(
  findings: AnalysisQualityFinding[],
  code: string,
  count: number,
  message: string,
): void {
  if (count > 0) {
    findings.push({ code, count, message, severity: "warning" });
  }
}
