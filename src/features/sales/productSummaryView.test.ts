import { describe, expect, it } from "vitest";

import type { SalesProductUnitSummary } from "@/domain/sales";

import {
  buildProductSummaryRanking,
  getRelativeProductBarPercent,
  PRODUCT_SUMMARY_PREVIEW_LIMIT,
} from "./productSummaryView";

function buildSummaries(count: number): SalesProductUnitSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    productReference: `Product ${String(index + 1).padStart(2, "0")}`,
    saleUnit: index === 1 ? "set" : "piece",
    unitsSold: count - index,
  }));
}

describe("product summary ranking view", () => {
  it("shows the top ten by default with leader-relative bar widths", () => {
    const ranking = buildProductSummaryRanking(buildSummaries(12), false);

    expect(ranking).toHaveLength(PRODUCT_SUMMARY_PREVIEW_LIMIT);
    expect(ranking[0]).toMatchObject({ rank: 1, relativePercent: 100, unitsSold: 12 });
    expect(ranking[1]).toMatchObject({ rank: 2, relativePercent: 91.7, saleUnit: "set" });
    expect(ranking[9]).toMatchObject({ rank: 10, relativePercent: 25, unitsSold: 3 });
  });

  it("shows every ranked product when expanded", () => {
    const ranking = buildProductSummaryRanking(buildSummaries(12), true);

    expect(ranking).toHaveLength(12);
    expect(ranking[11]).toMatchObject({ rank: 12, relativePercent: 8.3, unitsSold: 1 });
  });

  it("does not truncate a list with fewer than eleven products", () => {
    expect(buildProductSummaryRanking(buildSummaries(4), false)).toHaveLength(4);
    expect(buildProductSummaryRanking([], false)).toEqual([]);
  });

  it("guards invalid values and never exceeds the leader width", () => {
    expect(getRelativeProductBarPercent(5, 0)).toBe(0);
    expect(getRelativeProductBarPercent(Number.NaN, 10)).toBe(0);
    expect(getRelativeProductBarPercent(12, 10)).toBe(100);
  });
});
