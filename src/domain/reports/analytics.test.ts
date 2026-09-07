import { describe, expect, it } from "vitest";

import type { SaleRecord } from "@/domain/sales";

import {
  buildBusinessPerformanceComparison,
  buildSalesAnalytics,
  buildSalesTrend,
  getBusinessRevenueBarPercent,
  listSalesAnalyticsMonths,
} from "./analytics";

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

describe("sales analytics", () => {
  it("lists recorded months newest first and ignores invalid dates", () => {
    expect(listSalesAnalyticsMonths([
      sale,
      { ...sale, id: 2, saleDate: "2026-06-30" },
      { ...sale, id: 3, saleDate: "2026-07-20" },
      { ...sale, id: 4, saleDate: "not-a-date" },
    ])).toEqual(["2026-07", "2026-06"]);
  });

  it("aggregates net revenue by day and fills missing all-time dates", () => {
    const analytics = buildSalesAnalytics({
      business: "all",
      period: "all",
      sales: [
        sale,
        { ...sale, id: 2, netRevenue: 25.5 },
        { ...sale, id: 3, netRevenue: 40, saleDate: "2026-07-04" },
      ],
      today: "2026-07-25",
    });

    expect(analytics.dailySalesTrend).toEqual([
      { date: "2026-07-02", netRevenue: 120.5 },
      { date: "2026-07-03", netRevenue: 0 },
      { date: "2026-07-04", netRevenue: 40 },
    ]);
    expect(analytics.totalNetRevenue).toBe(160.5);
  });

  it("keeps a full selected-month axis while filtering a business", () => {
    const analytics = buildSalesAnalytics({
      business: "Stomping",
      period: "2026-07",
      sales: [
        sale,
        { ...sale, channel: "Stomping", id: 2, netRevenue: 60, saleDate: "2026-07-04" },
        { ...sale, channel: "Stomping", id: 3, netRevenue: 100, saleDate: "2026-06-30" },
      ],
      today: "2026-07-06",
    });

    expect(analytics.dailySalesTrend).toHaveLength(6);
    expect(analytics.dailySalesTrend[3]).toEqual({
      date: "2026-07-04",
      netRevenue: 60,
    });
    expect(analytics.matchingSaleCount).toBe(1);
  });

  it("ranks every product by units, then revenue, then name", () => {
    const analytics = buildSalesAnalytics({
      business: "all",
      period: "all",
      sales: [
        sale,
        { ...sale, id: 2, netRevenue: 30, productReference: "Planter", quantity: 4 },
        { ...sale, id: 3, netRevenue: 45, productReference: "Bookmark", quantity: 4 },
        { ...sale, id: 4, netRevenue: 15, productReference: "Dragon", quantity: 2 },
        { ...sale, id: 5, netRevenue: 45, productReference: "Angel", quantity: 4 },
      ],
      today: "2026-07-25",
    });

    expect(analytics.productPerformance).toEqual([
      { netRevenue: 110, productReference: "Dragon", unitsSold: 4 },
      { netRevenue: 45, productReference: "Angel", unitsSold: 4 },
      { netRevenue: 45, productReference: "Bookmark", unitsSold: 4 },
      { netRevenue: 30, productReference: "Planter", unitsSold: 4 },
    ]);
    expect(analytics.totalUnitsSold).toBe(16);
  });

  it("returns empty analytics when there are no valid sales", () => {
    expect(buildSalesAnalytics({
      business: "all",
      period: "all",
      sales: [{ ...sale, saleDate: "invalid" }],
      today: "2026-07-25",
    })).toEqual({
      dailySalesTrend: [],
      matchingSaleCount: 0,
      productPerformance: [],
      totalNetRevenue: 0,
      totalUnitsSold: 0,
    });
  });

  it("builds a seven-day trend ending today without changing the page period", () => {
    const trend = buildSalesTrend({
      business: "Direct",
      period: "all",
      sales: [
        { ...sale, id: 2, netRevenue: 10, saleDate: "2026-08-21" },
        { ...sale, id: 3, netRevenue: 20, saleDate: "2026-08-22" },
        { ...sale, id: 4, netRevenue: 30, saleDate: "2026-08-28" },
        { ...sale, channel: "Flora", id: 5, netRevenue: 500, saleDate: "2026-08-28" },
      ],
      today: "2026-08-28",
      view: "week",
    });

    expect(trend.dailySalesTrend).toHaveLength(7);
    expect(trend.dailySalesTrend[0]).toEqual({
      date: "2026-08-22",
      netRevenue: 20,
    });
    expect(trend.dailySalesTrend[6]).toEqual({
      date: "2026-08-28",
      netRevenue: 30,
    });
    expect(trend.matchingSaleCount).toBe(2);
    expect(trend.totalNetRevenue).toBe(50);
  });

  it("builds a fourteen-day trend with zero-filled dates", () => {
    const trend = buildSalesTrend({
      business: "all",
      period: "all",
      sales: [{ ...sale, id: 2, netRevenue: 45, saleDate: "2026-08-15" }],
      today: "2026-08-28",
      view: "14-days",
    });

    expect(trend.dailySalesTrend).toHaveLength(14);
    expect(trend.dailySalesTrend[0]).toEqual({
      date: "2026-08-15",
      netRevenue: 45,
    });
    expect(trend.dailySalesTrend[13]).toEqual({
      date: "2026-08-28",
      netRevenue: 0,
    });
  });

  it("builds a current-month trend only through today", () => {
    const trend = buildSalesTrend({
      business: "all",
      period: "all",
      sales: [
        { ...sale, id: 2, netRevenue: 25, saleDate: "2026-08-01" },
        { ...sale, id: 3, netRevenue: 35, saleDate: "2026-08-28" },
        { ...sale, id: 4, netRevenue: 100, saleDate: "2026-07-31" },
      ],
      today: "2026-08-28",
      view: "month",
    });

    expect(trend.dailySalesTrend).toHaveLength(28);
    expect(trend.dailySalesTrend[0]?.date).toBe("2026-08-01");
    expect(trend.dailySalesTrend[27]?.date).toBe("2026-08-28");
    expect(trend.totalNetRevenue).toBe(60);
  });

  it("anchors short trends to the end of a selected historical month", () => {
    const trend = buildSalesTrend({
      business: "all",
      period: "2026-06",
      sales: [
        { ...sale, id: 2, netRevenue: 40, saleDate: "2026-06-24" },
        { ...sale, id: 3, netRevenue: 60, saleDate: "2026-07-01" },
      ],
      today: "2026-08-28",
      view: "week",
    });

    expect(trend.dailySalesTrend).toHaveLength(7);
    expect(trend.dailySalesTrend[0]?.date).toBe("2026-06-24");
    expect(trend.dailySalesTrend[6]?.date).toBe("2026-06-30");
    expect(trend.totalNetRevenue).toBe(40);
  });

  it("does not let a short trend spill outside a selected month", () => {
    const trend = buildSalesTrend({
      business: "all",
      period: "2026-08",
      sales: [{ ...sale, id: 2, netRevenue: 30, saleDate: "2026-08-01" }],
      today: "2026-08-03",
      view: "week",
    });

    expect(trend.dailySalesTrend).toEqual([
      { date: "2026-08-01", netRevenue: 30 },
      { date: "2026-08-02", netRevenue: 0 },
      { date: "2026-08-03", netRevenue: 0 },
    ]);
  });

  it("compares every business for all sales without a prior-period change", () => {
    const comparison = buildBusinessPerformanceComparison({
      period: "all",
      sales: [
        sale,
        { ...sale, channel: "Stomping", id: 2, netRevenue: 200, quantity: 1 },
        { ...sale, channel: "Flora", id: 3, netRevenue: 95, quantity: 3 },
      ],
      today: "2026-07-25",
    });

    expect(comparison.map((item) => item.channel)).toEqual([
      "Stomping",
      "Flora",
      "Direct",
      "Sincerely",
      "Dear Reader",
      "Angkong",
    ]);
    expect(comparison.find((item) => item.channel === "Direct")).toMatchObject({
      averageSaleValue: 95,
      netRevenue: 95,
      netRevenueChangePercent: null,
      previousNetRevenue: null,
      saleCount: 1,
      unitsSold: 2,
    });
    expect(comparison.find((item) => item.channel === "Sincerely")).toMatchObject({
      averageSaleValue: 0,
      netRevenue: 0,
      saleCount: 0,
      unitsSold: 0,
    });
  });

  it("compares a completed month with the complete previous month", () => {
    const comparison = buildBusinessPerformanceComparison({
      period: "2026-08",
      sales: [
        { ...sale, id: 2, netRevenue: 100, saleDate: "2026-07-10" },
        { ...sale, channel: "Flora", id: 3, netRevenue: 50, saleDate: "2026-07-12" },
        { ...sale, channel: "Dear Reader", id: 7, netRevenue: 40, saleDate: "2026-07-14" },
        { ...sale, id: 4, netRevenue: 90, quantity: 1, saleDate: "2026-08-05" },
        { ...sale, id: 5, netRevenue: 60, quantity: 3, saleDate: "2026-08-20" },
        { ...sale, channel: "Stomping", id: 6, netRevenue: 80, saleDate: "2026-08-08" },
        { ...sale, channel: "Dear Reader", id: 8, netRevenue: 40, saleDate: "2026-08-15" },
      ],
      today: "2026-09-02",
    });
    const direct = comparison.find((item) => item.channel === "Direct");
    const stomping = comparison.find((item) => item.channel === "Stomping");
    const flora = comparison.find((item) => item.channel === "Flora");

    expect(direct).toMatchObject({
      averageSaleValue: 75,
      netRevenue: 150,
      netRevenueChangePercent: 50,
      previousNetRevenue: 100,
      saleCount: 2,
      unitsSold: 4,
    });
    expect(stomping).toMatchObject({
      netRevenue: 80,
      netRevenueChangePercent: null,
      previousNetRevenue: 0,
    });
    expect(flora).toMatchObject({
      netRevenue: 0,
      netRevenueChangePercent: -100,
      previousNetRevenue: 50,
    });
    expect(
      comparison.find((item) => item.channel === "Dear Reader"),
    ).toMatchObject({
      netRevenue: 40,
      netRevenueChangePercent: 0,
      previousNetRevenue: 40,
    });
  });

  it("compares the current month only through the matching prior-month day", () => {
    const comparison = buildBusinessPerformanceComparison({
      period: "2026-03",
      sales: [
        { ...sale, id: 2, netRevenue: 100, saleDate: "2026-02-10" },
        { ...sale, id: 3, netRevenue: 900, saleDate: "2026-02-20" },
        { ...sale, id: 4, netRevenue: 120, saleDate: "2026-03-10" },
        { ...sale, id: 5, netRevenue: 900, saleDate: "2026-03-20" },
      ],
      today: "2026-03-15",
    });

    expect(comparison.find((item) => item.channel === "Direct")).toMatchObject({
      netRevenue: 120,
      netRevenueChangePercent: 20,
      previousNetRevenue: 100,
      saleCount: 1,
    });
  });

  it("caps a prior-month comparison at the shorter month's last day", () => {
    const comparison = buildBusinessPerformanceComparison({
      period: "2026-03",
      sales: [
        { ...sale, id: 2, netRevenue: 50, saleDate: "2026-02-28" },
        { ...sale, id: 3, netRevenue: 100, saleDate: "2026-03-31" },
      ],
      today: "2026-03-31",
    });

    expect(comparison.find((item) => item.channel === "Direct")).toMatchObject({
      netRevenueChangePercent: 100,
      previousNetRevenue: 50,
    });
  });

  it("returns an empty comparison when the selected period has no sales", () => {
    expect(buildBusinessPerformanceComparison({
      period: "2026-08",
      sales: [sale],
      today: "2026-08-20",
    })).toEqual([]);
  });

  it("scales business revenue bars against the leading value", () => {
    expect(getBusinessRevenueBarPercent(50, 200)).toBe(25);
    expect(getBusinessRevenueBarPercent(250, 200)).toBe(100);
    expect(getBusinessRevenueBarPercent(-10, 200)).toBe(0);
    expect(getBusinessRevenueBarPercent(10, 0)).toBe(0);
  });
});
