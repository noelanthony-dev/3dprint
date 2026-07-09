import { describe, expect, it } from "vitest";

import type { ExpenseRecord, MembershipRecord } from "@/domain/expenses";
import type { ProductionRunRecord } from "@/domain/production";
import type { SaleRecord } from "@/domain/sales";

import {
  buildMonthlyReport,
  buildProductionSummary,
  getPreviousMonth,
  isDateInMonth,
} from "./index";

const sale: SaleRecord = {
  channel: "Direct",
  createdAt: "2026-07-02T00:00:00.000Z",
  discountsFees: 5,
  finishedGoodId: 1,
  grossRevenue: 100,
  id: 1,
  netRevenue: 95,
  notes: "",
  productReference: "Dragon",
  quantity: 2,
  saleDate: "2026-07-02",
  saleUnit: "piece",
  stockQuantityAfter: 8,
  stockQuantityBefore: 10,
  updatedAt: "2026-07-02T00:00:00.000Z",
};

const expense: ExpenseRecord = {
  amount: 25,
  category: "Shipping",
  createdAt: "2026-07-02T00:00:00.000Z",
  expenseDate: "2026-07-02",
  id: 1,
  notes: "",
  recurrence: "one-time",
  recurrenceMonth: "2026-07",
  updatedAt: "2026-07-02T00:00:00.000Z",
  vendor: "USPS",
};

const membership: MembershipRecord = {
  amount: 12,
  commercialUseStatus: "commercial-ok",
  createdAt: "2026-07-02T00:00:00.000Z",
  creatorName: "Hex3D",
  id: 1,
  licenseNotes: "",
  membershipStatus: "active",
  notes: "",
  platform: "Patreon",
  recurrence: "monthly",
  recurrenceMonth: "2026-07",
  updatedAt: "2026-07-02T00:00:00.000Z",
  vendor: "Patreon",
};

const productionRun: ProductionRunRecord = {
  addOnId: 2,
  addOnQuantityDeducted: 6,
  createdAt: "2026-07-02T00:00:00.000Z",
  expectedPieces: 10,
  failedPieces: 1,
  failureReason: "Layer shift",
  filamentGramsDeducted: 500,
  filamentId: 4,
  finishedGoodId: 1,
  goodPieces: 9,
  id: 1,
  notes: "",
  printProfileId: 3,
  productId: 5,
  runDate: "2026-07-02",
  updatedAt: "2026-07-02T00:00:00.000Z",
};

describe("monthly reports", () => {
  it("filters source data to the requested month and calculates summary totals", () => {
    const report = buildMonthlyReport({
      expenses: [
        expense,
        { ...expense, amount: 100, expenseDate: "2026-08-01", id: 2, recurrenceMonth: "2026-08" },
      ],
      memberships: [membership],
      month: "2026-07",
      productionRuns: [productionRun, { ...productionRun, id: 2, runDate: "2026-06-30" }],
      sales: [sale, { ...sale, id: 2, netRevenue: 500, saleDate: "2026-06-30" }],
    });

    expect(report.salesSummary).toMatchObject({
      discountsFees: 5,
      grossRevenue: 100,
      netRevenue: 95,
      orderCount: 1,
      unitsSold: 2,
    });
    expect(report.expenseSummary.totalExpenses).toBe(37);
    expect(report.profitSummary.simpleProfit).toBe(58);
    expect(report.inventoryMovement).toMatchObject({
      addOnQuantityDeducted: 6,
      filamentGramsDeducted: 500,
      finishedGoodsNetChange: 7,
      finishedGoodsProduced: 9,
      finishedGoodsSold: 2,
    });
  });

  it("builds channel, product, and expense breakdowns", () => {
    const report = buildMonthlyReport({
      expenses: [expense],
      memberships: [membership],
      month: "2026-07",
      productionRuns: [productionRun],
      sales: [
        sale,
        { ...sale, channel: "Flora", id: 2, netRevenue: 105, productReference: "Planter" },
      ],
    });

    expect(report.channelBreakdown).toEqual([
      { label: "Flora", percent: 52.5, value: 105 },
      { label: "Direct", percent: 47.5, value: 95 },
    ]);
    expect(report.productBreakdown[0]).toEqual({ label: "Planter", percent: 52.5, value: 105 });
    expect(report.expenseSummary.categoryBreakdown).toContainEqual({
      label: "Shipping",
      percent: 67.57,
      value: 25,
    });
    expect(report.expenseSummary.categoryBreakdown).toContainEqual({
      label: "Membership",
      percent: 32.43,
      value: 12,
    });
  });

  it("calculates production yield from good and failed pieces", () => {
    const summary = buildProductionSummary([productionRun]);

    expect(summary.attemptedPieces).toBe(10);
    expect(summary.yieldRate).toBe(0.9);
  });

  it("handles month helpers", () => {
    expect(isDateInMonth("2026-07-31", "2026-07")).toBe(true);
    expect(isDateInMonth("2026-08-01", "2026-07")).toBe(false);
    expect(getPreviousMonth("2026-01")).toBe("2025-12");
    expect(getPreviousMonth("2026-07")).toBe("2026-06");
  });
});
