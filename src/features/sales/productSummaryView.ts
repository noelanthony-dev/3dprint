import type { SalesProductUnitSummary } from "@/domain/sales";

export const PRODUCT_SUMMARY_PREVIEW_LIMIT = 10;

export interface ProductSummaryRankingRow extends SalesProductUnitSummary {
  readonly rank: number;
  readonly relativePercent: number;
}

export function buildProductSummaryRanking(
  summaries: readonly SalesProductUnitSummary[],
  isExpanded: boolean,
): readonly ProductSummaryRankingRow[] {
  const leadingUnitsSold = summaries[0]?.unitsSold ?? 0;
  const visibleSummaries = isExpanded
    ? summaries
    : summaries.slice(0, PRODUCT_SUMMARY_PREVIEW_LIMIT);

  return visibleSummaries.map((summary, index) => ({
    ...summary,
    rank: index + 1,
    relativePercent: getRelativeProductBarPercent(summary.unitsSold, leadingUnitsSold),
  }));
}

export function getRelativeProductBarPercent(
  unitsSold: number,
  leadingUnitsSold: number,
): number {
  if (
    !Number.isFinite(unitsSold) ||
    !Number.isFinite(leadingUnitsSold) ||
    unitsSold <= 0 ||
    leadingUnitsSold <= 0
  ) {
    return 0;
  }

  return Math.round(Math.min(100, (unitsSold / leadingUnitsSold) * 100) * 10) / 10;
}
