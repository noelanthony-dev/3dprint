import {
  SALES_CHANNELS,
  type SaleRecord,
  type SalesChannel,
} from "@/domain/sales";

export type SalesAnalyticsPeriod = "all" | `${number}-${number}`;
export type SalesAnalyticsBusiness = "all" | SalesChannel;
export type SalesTrendView = "week" | "14-days" | "month";

export interface DailySalesPoint {
  readonly date: string;
  readonly netRevenue: number;
}

export interface ProductSalesPerformance {
  readonly netRevenue: number;
  readonly productReference: string;
  readonly unitsSold: number;
}

export interface BusinessPerformance {
  readonly averageSaleValue: number;
  readonly channel: SalesChannel;
  readonly netRevenue: number;
  readonly netRevenueChangePercent: number | null;
  readonly previousNetRevenue: number | null;
  readonly saleCount: number;
  readonly unitsSold: number;
}

export interface BusinessPerformanceComparisonInput {
  readonly period: SalesAnalyticsPeriod;
  readonly sales: readonly SaleRecord[];
  readonly today: string;
}

export interface SalesAnalyticsInput {
  readonly business: SalesAnalyticsBusiness;
  readonly period: SalesAnalyticsPeriod;
  readonly sales: readonly SaleRecord[];
  readonly today: string;
}

export interface SalesAnalytics {
  readonly dailySalesTrend: readonly DailySalesPoint[];
  readonly matchingSaleCount: number;
  readonly productPerformance: readonly ProductSalesPerformance[];
  readonly totalNetRevenue: number;
  readonly totalUnitsSold: number;
}

export interface SalesTrendInput {
  readonly business: SalesAnalyticsBusiness;
  readonly period: SalesAnalyticsPeriod;
  readonly sales: readonly SaleRecord[];
  readonly today: string;
  readonly view: SalesTrendView;
}

export interface SalesTrend {
  readonly dailySalesTrend: readonly DailySalesPoint[];
  readonly matchingSaleCount: number;
  readonly totalNetRevenue: number;
}

export function buildSalesAnalytics(input: SalesAnalyticsInput): SalesAnalytics {
  const datedSales = input.sales.filter((sale) => isIsoDate(sale.saleDate));
  const periodSales = input.period === "all"
    ? datedSales
    : datedSales.filter((sale) => sale.saleDate.startsWith(input.period));
  const matchingSales = input.business === "all"
    ? periodSales
    : periodSales.filter((sale) => sale.channel === input.business);
  const dailyTotals = new Map<string, number>();

  for (const sale of matchingSales) {
    dailyTotals.set(
      sale.saleDate,
      (dailyTotals.get(sale.saleDate) ?? 0) + sale.netRevenue,
    );
  }

  const dateRange = getAnalyticsDateRange(periodSales, input.period, input.today);
  const dailySalesTrend = dateRange
    ? enumerateDates(dateRange.start, dateRange.end).map((date) => ({
        date,
        netRevenue: roundAnalyticsMoney(dailyTotals.get(date) ?? 0),
      }))
    : [];

  return {
    dailySalesTrend,
    matchingSaleCount: matchingSales.length,
    productPerformance: buildProductPerformance(matchingSales),
    totalNetRevenue: roundAnalyticsMoney(
      matchingSales.reduce((total, sale) => total + sale.netRevenue, 0),
    ),
    totalUnitsSold: matchingSales.reduce((total, sale) => total + sale.quantity, 0),
  };
}

export function buildSalesTrend(input: SalesTrendInput): SalesTrend {
  const datedSales = input.sales.filter((sale) => isIsoDate(sale.saleDate));
  const periodSales = input.period === "all"
    ? datedSales
    : datedSales.filter((sale) => sale.saleDate.startsWith(input.period));
  const matchingSales = input.business === "all"
    ? periodSales
    : periodSales.filter((sale) => sale.channel === input.business);
  const dateRange = getSalesTrendDateRange(input.period, input.today, input.view);

  if (!dateRange) {
    return {
      dailySalesTrend: [],
      matchingSaleCount: 0,
      totalNetRevenue: 0,
    };
  }

  const trendSales = matchingSales.filter(
    (sale) => sale.saleDate >= dateRange.start && sale.saleDate <= dateRange.end,
  );
  const dailyTotals = new Map<string, number>();

  for (const sale of trendSales) {
    dailyTotals.set(
      sale.saleDate,
      (dailyTotals.get(sale.saleDate) ?? 0) + sale.netRevenue,
    );
  }

  return {
    dailySalesTrend: enumerateDates(dateRange.start, dateRange.end).map((date) => ({
      date,
      netRevenue: roundAnalyticsMoney(dailyTotals.get(date) ?? 0),
    })),
    matchingSaleCount: trendSales.length,
    totalNetRevenue: roundAnalyticsMoney(
      trendSales.reduce((total, sale) => total + sale.netRevenue, 0),
    ),
  };
}

export function listSalesAnalyticsMonths(
  sales: readonly Pick<SaleRecord, "saleDate">[],
): readonly string[] {
  return Array.from(
    new Set(
      sales
        .map((sale) => sale.saleDate)
        .filter(isIsoDate)
        .map((date) => date.slice(0, 7)),
    ),
  ).sort((first, second) => second.localeCompare(first));
}

export function buildBusinessPerformanceComparison(
  input: BusinessPerformanceComparisonInput,
): readonly BusinessPerformance[] {
  const datedSales = input.sales.filter((sale) => isIsoDate(sale.saleDate));
  const currentSales = filterSalesForComparisonPeriod(
    datedSales,
    input.period,
    input.today,
  );

  if (currentSales.length === 0) {
    return [];
  }

  const previousSales = input.period === "all"
    ? null
    : filterSalesForPreviousComparisonPeriod(
        datedSales,
        input.period,
        input.today,
      );

  return SALES_CHANNELS
    .map((channel) => {
      const channelSales = currentSales.filter((sale) => sale.channel === channel);
      const netRevenue = roundAnalyticsMoney(
        channelSales.reduce((total, sale) => total + sale.netRevenue, 0),
      );
      const previousNetRevenue = previousSales === null
        ? null
        : roundAnalyticsMoney(
            previousSales
              .filter((sale) => sale.channel === channel)
              .reduce((total, sale) => total + sale.netRevenue, 0),
          );

      return {
        averageSaleValue: channelSales.length > 0
          ? roundAnalyticsMoney(netRevenue / channelSales.length)
          : 0,
        channel,
        netRevenue,
        netRevenueChangePercent:
          previousNetRevenue !== null && previousNetRevenue > 0
            ? roundAnalyticsRate(
                ((netRevenue - previousNetRevenue) / previousNetRevenue) * 100,
              )
            : null,
        previousNetRevenue,
        saleCount: channelSales.length,
        unitsSold: channelSales.reduce((total, sale) => total + sale.quantity, 0),
      };
    })
    .sort((first, second) =>
      second.netRevenue - first.netRevenue ||
      second.unitsSold - first.unitsSold ||
      SALES_CHANNELS.indexOf(first.channel) - SALES_CHANNELS.indexOf(second.channel),
    );
}

export function getBusinessRevenueBarPercent(
  value: number,
  leadingValue: number,
): number {
  if (!Number.isFinite(value) || !Number.isFinite(leadingValue) || leadingValue <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, roundAnalyticsRate((value / leadingValue) * 100)));
}

export function roundAnalyticsMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundAnalyticsRate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildProductPerformance(
  sales: readonly SaleRecord[],
): readonly ProductSalesPerformance[] {
  const products = new Map<string, ProductSalesPerformance>();

  for (const sale of sales) {
    const current = products.get(sale.productReference);

    products.set(sale.productReference, {
      netRevenue: roundAnalyticsMoney((current?.netRevenue ?? 0) + sale.netRevenue),
      productReference: sale.productReference,
      unitsSold: (current?.unitsSold ?? 0) + sale.quantity,
    });
  }

  return Array.from(products.values()).sort((first, second) =>
    second.unitsSold - first.unitsSold ||
    second.netRevenue - first.netRevenue ||
    first.productReference.localeCompare(second.productReference),
  );
}

function getAnalyticsDateRange(
  periodSales: readonly SaleRecord[],
  period: SalesAnalyticsPeriod,
  today: string,
): { readonly end: string; readonly start: string } | null {
  if (period === "all") {
    if (periodSales.length === 0) {
      return null;
    }

    const dates = periodSales.map((sale) => sale.saleDate).sort();

    return {
      end: dates[dates.length - 1]!,
      start: dates[0]!,
    };
  }

  if (!isIsoMonth(period)) {
    return null;
  }

  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const periodEnd = `${period}-${String(lastDay).padStart(2, "0")}`;
  const todayMonth = isIsoDate(today) ? today.slice(0, 7) : "";

  return {
    end: todayMonth === period ? today : periodEnd,
    start: `${period}-01`,
  };
}

function getSalesTrendDateRange(
  period: SalesAnalyticsPeriod,
  today: string,
  view: SalesTrendView,
): { readonly end: string; readonly start: string } | null {
  if (!isIsoDate(today) || (period !== "all" && !isIsoMonth(period))) {
    return null;
  }

  const end = period === "all"
    ? today
    : today.slice(0, 7) === period
      ? today
      : getIsoMonthEnd(period);
  const month = period === "all" ? end.slice(0, 7) : period;

  if (view === "month") {
    return {
      end,
      start: `${month}-01`,
    };
  }

  const days = view === "week" ? 7 : 14;
  const calculatedStart = addDays(end, -(days - 1));
  const monthStart = `${month}-01`;

  return {
    end,
    start: calculatedStart < monthStart ? monthStart : calculatedStart,
  };
}

function filterSalesForComparisonPeriod(
  sales: readonly SaleRecord[],
  period: SalesAnalyticsPeriod,
  today: string,
): readonly SaleRecord[] {
  if (period === "all") {
    return sales;
  }

  const periodEnd = getCurrentComparisonPeriodEnd(period, today);

  return sales.filter(
    (sale) =>
      sale.saleDate >= `${period}-01` &&
      sale.saleDate <= periodEnd,
  );
}

function filterSalesForPreviousComparisonPeriod(
  sales: readonly SaleRecord[],
  period: Exclude<SalesAnalyticsPeriod, "all">,
  today: string,
): readonly SaleRecord[] {
  const previousMonth = getPreviousIsoMonth(period);
  const previousMonthEnd = getIsoMonthEnd(previousMonth);
  const isCurrentMonth = isIsoDate(today) && today.slice(0, 7) === period;
  const comparisonEnd = isCurrentMonth
    ? `${previousMonth}-${String(
        Math.min(Number(today.slice(8, 10)), Number(previousMonthEnd.slice(8, 10))),
      ).padStart(2, "0")}`
    : previousMonthEnd;

  return sales.filter(
    (sale) =>
      sale.saleDate >= `${previousMonth}-01` &&
      sale.saleDate <= comparisonEnd,
  );
}

function getCurrentComparisonPeriodEnd(
  period: Exclude<SalesAnalyticsPeriod, "all">,
  today: string,
): string {
  if (isIsoDate(today) && today.slice(0, 7) === period) {
    return today;
  }

  return getIsoMonthEnd(period);
}

function getPreviousIsoMonth(
  period: Exclude<SalesAnalyticsPeriod, "all">,
): `${number}-${number}` {
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (month === 1) {
    return `${year - 1}-12`;
  }

  return `${year}-${String(month - 1).padStart(2, "0")}` as `${number}-${number}`;
}

function getIsoMonthEnd(
  period: Exclude<SalesAnalyticsPeriod, "all">,
): string {
  const [yearText, monthText] = period.split("-");
  const lastDay = new Date(
    Date.UTC(Number(yearText), Number(monthText), 0),
  ).getUTCDate();

  return `${period}-${String(lastDay).padStart(2, "0")}`;
}

function enumerateDates(start: string, end: string): readonly string[] {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);

  if (!startDate || !endDate || startDate.getTime() > endDate.getTime()) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(startDate);

  while (cursor.getTime() <= endDate.getTime()) {
    dates.push(formatIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);

  if (!date) {
    return value;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

function isIsoMonth(value: string): value is `${number}-${number}` {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

function isIsoDate(value: string): boolean {
  const parsed = parseIsoDate(value);
  return parsed !== null && formatIsoDate(parsed) === value;
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const date = new Date(Date.UTC(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
  ));

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDate(value: Date): string {
  return [
    String(value.getUTCFullYear()).padStart(4, "0"),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
