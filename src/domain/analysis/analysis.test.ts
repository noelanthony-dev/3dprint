import { describe, expect, it } from "vitest";

import type { PrintProfileRecord } from "@/domain/costing";
import type { ExpenseRecord } from "@/domain/expenses";
import type { FinishedGoodRecord } from "@/domain/inventory";
import type { ProductRecord } from "@/domain/products";
import type { SaleRecord } from "@/domain/sales";
import { DEFAULT_APP_SETTINGS } from "@/domain/settings";

import {
  AI_ANALYSIS_FORMAT,
  ANALYSIS_LIMITATIONS,
  buildAiAnalysisPack,
  type AnalysisSourceData,
} from "./index";

describe("AI analysis pack", () => {
  it("builds a stable, self-describing empty v1 pack", () => {
    const pack = buildAiAnalysisPack({
      appVersion: "0.1.0",
      generatedAt: "2026-08-07T04:00:00.000Z",
      settings: DEFAULT_APP_SETTINGS,
      sourceData: emptySourceData(),
    });

    expect(pack.format).toBe(AI_ANALYSIS_FORMAT);
    expect(pack.formatVersion).toBe(1);
    expect(pack.metadata).toMatchObject({
      appVersion: "0.1.0",
      currency: "PHP (₱)",
      privateTextIncluded: true,
    });
    expect(Object.values(pack.metadata.recordCounts).every((count) => count === 0)).toBe(true);
    expect(pack.dataDictionary.some((item) => item.field === "sales.netRevenue")).toBe(true);
    expect(pack.relationships).toContainEqual(expect.objectContaining({
      from: "sales.finishedGoodId",
      to: "finishedGoods.id",
    }));
    expect(pack.limitations).toEqual(ANALYSIS_LIMITATIONS);
    expect(pack.derivedData.lifetimeReport.profitSummary.simpleProfit).toBe(0);
  });

  it("preserves private text and uses the existing report, analytics, costing, and pricing rules", () => {
    const sourceData = emptySourceData({
      expenses: [expense],
      finishedGoods: [finishedGood],
      printProfiles: [profile],
      products: [product],
      sales: [sale],
    });
    const pack = buildAiAnalysisPack({
      appVersion: "0.1.0",
      generatedAt: "2026-08-07T04:00:00.000Z",
      settings: DEFAULT_APP_SETTINGS,
      sourceData,
    });

    expect(pack.sourceData.products[0]).toMatchObject({
      notes: "Private design note",
      sourceLink: "https://example.com/private-design",
    });
    expect(pack.sourceData.expenses[0]).toMatchObject({
      notes: "Private vendor note",
      vendor: "Private Supplier",
    });
    expect(pack.derivedData.lifetimeReport.profitSummary).toMatchObject({
      netRevenue: 90,
      simpleProfit: 70,
    });
    expect(pack.derivedData.monthlyReports["2026-08"]!.salesSummary.netRevenue).toBe(90);
    expect(pack.derivedData.monthlySalesAnalytics["2026-08"]!.totalNetRevenue).toBe(90);
    expect(pack.derivedData.costingProfiles[0]).toMatchObject({
      productName: "Private Design",
      profileId: 3,
      cost: { addOnCost: 10, batchCost: 10, costPerGoodUnit: 5 },
      pricing: { suggestedSellPrice: 10 },
    });
    expect(pack.metadata.recordCounts.sales).toBe(1);
    expect(pack.qualityFindings).toContainEqual(expect.objectContaining({
      code: "sale-cost-snapshot-unavailable",
      count: 1,
    }));
  });

  it("reports unresolved stored foreign keys without guessing name-based links", () => {
    const pack = buildAiAnalysisPack({
      appVersion: "0.1.0",
      generatedAt: "2026-08-07T04:00:00.000Z",
      settings: DEFAULT_APP_SETTINGS,
      sourceData: emptySourceData({ sales: [{ ...sale, finishedGoodId: 999 }] }),
    });

    expect(pack.qualityFindings).toContainEqual({
      code: "unresolved-sale-links",
      count: 1,
      message: "Some sales reference missing finished-goods records.",
      severity: "warning",
    });
  });
});

function emptySourceData(overrides: Partial<AnalysisSourceData> = {}): AnalysisSourceData {
  return {
    addOnAdjustments: [],
    addOns: [],
    expenses: [],
    filamentAdjustments: [],
    filamentProfiles: [],
    filaments: [],
    finishedGoodAdjustments: [],
    finishedGoods: [],
    hueForgeAnalyses: [],
    hueForgeMissingRequirements: [],
    hueForgeRequirements: [],
    memberships: [],
    printProfiles: [],
    productionAddOnCorrections: [],
    productionAddOnDeductions: [],
    productionFilamentDeductions: [],
    productionRuns: [],
    products: [],
    saleStockMovements: [],
    sales: [],
    shoppingListItems: [],
    ...overrides,
  };
}

const product: ProductRecord = {
  authorName: "Private Creator",
  businesses: ["Sincerely, Books"],
  canPrintWithInventory: true,
  category: "Bookmarks",
  commercialLicenseStatus: "commercial-ok",
  createdAt: "2026-08-01T00:00:00Z",
  designName: "Private Design",
  estimatedPrintHours: 1,
  filamentMode: "basic",
  hueForgeFilaments: [],
  id: 1,
  imageReference: "/private/design.png",
  licenseBillingInterval: "none",
  licenseCostAmount: 0,
  notes: "Private design note",
  saleUnit: "piece",
  sourceLink: "https://example.com/private-design",
  updatedAt: "2026-08-01T00:00:00Z",
};

const profile: PrintProfileRecord = {
  addOns: [{ addOnId: null, description: "Packaging", quantity: 2, totalCost: 10, unitCost: 5 }],
  createdAt: "2026-08-01T00:00:00Z",
  electricityRatePerKwh: 0,
  expectedFailedUnits: 0,
  expectedGoodUnits: 2,
  filamentCostPerKg: 0,
  filamentGrams: 0,
  id: 3,
  laborMinutes: 0,
  laborRatePerHour: 0,
  notes: "Private costing note",
  printerPowerWatts: 0,
  printHours: 0,
  printMinutes: 0,
  productId: 1,
  profileName: "Standard",
  saleUnit: "piece",
  supportGrams: 0,
  targetMarkup: 2,
  updatedAt: "2026-08-01T00:00:00Z",
  wearRatePerHour: 0,
};

const finishedGood: FinishedGoodRecord = {
  createdAt: "2026-08-01T00:00:00Z",
  id: 5,
  notes: "",
  productReference: "Private Design",
  quantityReady: 5,
  quantityReserved: 0,
  saleUnit: "piece",
  updatedAt: "2026-08-01T00:00:00Z",
};

const sale: SaleRecord = {
  channel: "Direct",
  createdAt: "2026-08-01T00:00:00Z",
  discountsFees: 10,
  finishedGoodId: 5,
  grossRevenue: 100,
  id: 7,
  netRevenue: 90,
  notes: "Private buyer note",
  productReference: "Private Design",
  quantity: 2,
  saleDate: "2026-08-01",
  saleUnit: "piece",
  stockQuantityAfter: 3,
  stockQuantityBefore: 5,
  updatedAt: "2026-08-01T00:00:00Z",
};

const expense: ExpenseRecord = {
  amount: 20,
  category: "Other",
  createdAt: "2026-08-01T00:00:00Z",
  expenseDate: "2026-08-01",
  id: 9,
  notes: "Private vendor note",
  productionRunId: null,
  recurrence: "one-time",
  recurrenceMonth: "2026-08",
  updatedAt: "2026-08-01T00:00:00Z",
  vendor: "Private Supplier",
};
