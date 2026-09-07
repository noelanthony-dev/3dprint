import { describe, expect, it } from "vitest";

import type { ExpenseRecord, MembershipRecord } from "@/domain/expenses";
import type { ProductionRunRecord } from "@/domain/production";
import type { SaleRecord } from "@/domain/sales";

import {
  buildDailyReport,
  buildLifetimeReport,
  buildMonthlyReport,
  buildProductionSummary,
  filterReportSalesByBusiness,
  getNextMonth,
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
  productionRunId: null,
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
  addOnCorrectionCount: 0,
  addOnDeductions: [{
    addOnId: 2,
    id: 1,
    productionRunId: 1,
    quantityDeducted: 6,
    sortOrder: 0,
  }],
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
  lastAddOnCorrectionAt: null,
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

  it("builds a lifetime report from every recorded source row", () => {
    const report = buildLifetimeReport({
      expenses: [expense, { ...expense, amount: 40, expenseDate: "2026-08-01", id: 2 }],
      memberships: [membership],
      productionRuns: [productionRun, { ...productionRun, id: 2, runDate: "2026-08-01" }],
      sales: [sale, { ...sale, id: 2, netRevenue: 105, saleDate: "2026-08-01" }],
    });

    expect(report.month).toBe("lifetime");
    expect(report.salesSummary).toMatchObject({
      netRevenue: 200,
      orderCount: 2,
      unitsSold: 4,
    });
    expect(report.expenseSummary.totalExpenses).toBe(77);
    expect(report.productionSummary.runCount).toBe(2);
  });

  it("builds a factual daily report from exact-date records", () => {
    const report = buildDailyReport({
      date: "2026-07-02",
      expenses: [
        expense,
        { ...expense, amount: 60, expenseDate: "2026-07-03", id: 2 },
        { ...expense, amount: 15, id: 3, recurrence: "monthly" },
      ],
      memberships: [membership],
      productionRuns: [productionRun, { ...productionRun, id: 2, runDate: "2026-07-03" }],
      sales: [sale, { ...sale, id: 2, netRevenue: 500, saleDate: "2026-07-03" }],
    });

    expect(report.month).toBe("2026-07-02");
    expect(report.salesSummary).toMatchObject({ netRevenue: 95, orderCount: 1, unitsSold: 2 });
    expect(report.expenseSummary).toMatchObject({
      expenseTotal: 40,
      membershipTotal: 0,
      recurringMonthlyTotal: 15,
      totalExpenses: 40,
    });
    expect(report.productionSummary.runCount).toBe(1);
    expect(report.profitSummary.simpleProfit).toBe(55);
  });

  it("returns an empty daily report for an invalid or unmatched date", () => {
    const report = buildDailyReport({
      date: "2026-02-29",
      expenses: [expense],
      memberships: [membership],
      productionRuns: [productionRun],
      sales: [sale],
    });

    expect(report.salesSummary.netRevenue).toBe(0);
    expect(report.expenseSummary.totalExpenses).toBe(0);
    expect(report.productionSummary.runCount).toBe(0);
    expect(report.recentTransactions).toEqual([]);
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

  it("filters report sales by business channel", () => {
    const floraSale = { ...sale, channel: "Flora" as const, id: 2 };
    const sales = [sale, floraSale];

    expect(filterReportSalesByBusiness(sales, "Flora")).toEqual([floraSale]);
    expect(filterReportSalesByBusiness(sales, "all")).toBe(sales);
  });

  it("calculates production yield from good and failed pieces", () => {
    const summary = buildProductionSummary([productionRun]);

    expect(summary.attemptedPieces).toBe(10);
    expect(summary.yieldRate).toBe(0.9);
  });

  it("includes linked production expenses in expense totals and profit", () => {
    const productionExpense: ExpenseRecord = {
      ...expense,
      amount: 31,
      category: "Production",
      id: 2,
      productionRunId: productionRun.id,
      vendor: "Dragon",
    };
    const report = buildMonthlyReport({
      expenses: [expense, productionExpense],
      memberships: [],
      month: "2026-07",
      productionRuns: [productionRun],
      sales: [sale],
    });

    expect(report.expenseSummary.totalExpenses).toBe(56);
    expect(report.expenseSummary.categoryBreakdown).toContainEqual({
      label: "Production",
      percent: 55.36,
      value: 31,
    });
    expect(report.profitSummary.simpleProfit).toBe(39);
  });

  it("handles month helpers", () => {
    expect(isDateInMonth("2026-07-31", "2026-07")).toBe(true);
    expect(isDateInMonth("2026-08-01", "2026-07")).toBe(false);
    expect(getPreviousMonth("2026-01")).toBe("2025-12");
    expect(getPreviousMonth("2026-07")).toBe("2026-06");
    expect(getNextMonth("2026-12")).toBe("2027-01");
    expect(getNextMonth("2026-07")).toBe("2026-08");
  });
});
