import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { Page } from "@/components/layout/Page";
import {
  Badge,
  DataTable,
  Panel,
  SegmentedFilter,
  ToolbarButton,
} from "@/components/ui";
import { salesRepository } from "@/data/repositories";
import {
  buildBusinessPerformanceComparison,
  buildSalesAnalytics,
  buildSalesTrend,
  getBusinessRevenueBarPercent,
  listSalesAnalyticsMonths,
  type BusinessPerformance,
  type DailySalesPoint,
  type ProductSalesPerformance,
  type SalesAnalyticsBusiness,
  type SalesAnalyticsPeriod,
  type SalesTrendView,
} from "@/domain/reports";
import {
  SALES_CHANNELS,
  type SaleRecord,
} from "@/domain/sales";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 320;
const CHART_PADDING = {
  bottom: 44,
  left: 74,
  right: 20,
  top: 22,
} as const;

export function SalesAnalyticsPage() {
  const [business, setBusiness] = useState<SalesAnalyticsBusiness>("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<SalesAnalyticsPeriod>("all");
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [trendView, setTrendView] = useState<SalesTrendView>("month");
  const today = useMemo(todayInputValue, []);

  async function loadAnalytics(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const loadedSales = await salesRepository.list();
      const loadedMonths = listSalesAnalyticsMonths(loadedSales);

      setSales(loadedSales);
      setPeriod((current) =>
        current === "all" || loadedMonths.includes(current)
          ? current
          : "all",
      );
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAnalytics();
  }, []);

  const months = useMemo(() => listSalesAnalyticsMonths(sales), [sales]);
  const analytics = useMemo(
    () => buildSalesAnalytics({
      business,
      period,
      sales,
      today,
    }),
    [business, period, sales, today],
  );
  const businessComparison = useMemo(
    () => buildBusinessPerformanceComparison({
      period,
      sales,
      today,
    }),
    [period, sales, today],
  );
  const trend = useMemo(
    () => buildSalesTrend({
      business,
      period,
      sales,
      today,
      view: trendView,
    }),
    [business, period, sales, today, trendView],
  );

  return (
    <Page
      actions={
        <>
          <select
            aria-label="Analytics period"
            className="table-input"
            onChange={(event) =>
              setPeriod(event.target.value as SalesAnalyticsPeriod)
            }
            value={period}
          >
            <option value="all">All Sales</option>
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonthLabel(month)}
              </option>
            ))}
          </select>
          <ToolbarButton onClick={() => void loadAnalytics()}>
            Refresh
          </ToolbarButton>
        </>
      }
      description="Review weekly, 14-day, and monthly net revenue trends alongside product and business performance."
      meta={["On-demand analytics", "SQLite source data", "Net revenue trend"]}
      title="Sales Analytics"
    >
      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="analytics-filter-bar">
        <span>Business</span>
        <SegmentedFilter
          label="Analytics business"
          onChange={(value) =>
            setBusiness(value as SalesAnalyticsBusiness)
          }
          options={[
            {
              active: business === "all",
              label: "All",
              value: "all",
            },
            ...SALES_CHANNELS.map((channel) => ({
              active: business === channel,
              label: channel,
              value: channel,
            })),
          ]}
        />
      </div>

      <div className="analytics-grid">
        <Panel
          actions={
            <Badge tone="success">
              {formatCurrency(trend.totalNetRevenue)}
            </Badge>
          }
          title="Sales Trend"
        >
          <div className="analytics-trend-controls">
            <span>View</span>
            <SegmentedFilter
              label="Sales trend view"
              onChange={(value) => setTrendView(value as SalesTrendView)}
              options={[
                {
                  active: trendView === "week",
                  label: "Weekly",
                  value: "week",
                },
                {
                  active: trendView === "14-days",
                  label: "14 Days",
                  value: "14-days",
                },
                {
                  active: trendView === "month",
                  label: "Monthly",
                  value: "month",
                },
              ]}
            />
          </div>
          {isLoading ? (
            <AnalyticsState label="Loading sales trend..." />
          ) : trend.matchingSaleCount === 0 ? (
            <AnalyticsState label="No sales match the selected trend range and business." />
          ) : (
            <SalesTrendChart
              business={business}
              points={trend.dailySalesTrend}
            />
          )}
        </Panel>

        <Panel
          actions={
            <Badge>
              {analytics.productPerformance.length} products
            </Badge>
          }
          title="Best-Performing Products"
        >
          {isLoading ? (
            <AnalyticsState label="Loading product performance..." />
          ) : (
            <ProductPerformanceTable
              products={analytics.productPerformance}
            />
          )}
        </Panel>
      </div>

      <div className="business-performance-card">
        <Panel
          actions={
            <Badge tone={business === "all" ? "neutral" : "success"}>
              {business === "all" ? "All businesses" : `${business} highlighted`}
            </Badge>
          }
          title="Business Performance Comparison"
        >
          {isLoading ? (
            <AnalyticsState label="Loading business performance..." />
          ) : businessComparison.length === 0 ? (
            <AnalyticsState label="No sales are available to compare for this period." />
          ) : (
            <BusinessPerformanceTable
              business={business}
              performance={businessComparison}
              period={period}
            />
          )}
        </Panel>
      </div>
    </Page>
  );
}

function SalesTrendChart({
  business,
  points,
}: {
  readonly business: SalesAnalyticsBusiness;
  readonly points: readonly DailySalesPoint[];
}) {
  const gradientId = useId().replaceAll(":", "");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const maximum = points.reduce(
    (current, point) => Math.max(current, point.netRevenue),
    0,
  );
  const yMaximum = getNiceMaximum(maximum);
  const coordinates = points.map((point, index) => ({
    point,
    x: points.length === 1
      ? CHART_PADDING.left + plotWidth / 2
      : CHART_PADDING.left + (index / (points.length - 1)) * plotWidth,
    y: CHART_PADDING.top + plotHeight -
      (point.netRevenue / yMaximum) * plotHeight,
  }));
  const linePath = coordinates
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const areaPath = coordinates.length > 0
    ? `${linePath} L ${coordinates[coordinates.length - 1]!.x} ${CHART_PADDING.top + plotHeight} L ${coordinates[0]!.x} ${CHART_PADDING.top + plotHeight} Z`
    : "";
  const xTickIndices = getTickIndices(points.length, 5);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const activeCoordinate = activeIndex == null
    ? null
    : coordinates[activeIndex] ?? null;

  function handlePointerMove(event: PointerEvent<SVGSVGElement>): void {
    if (points.length === 0) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / bounds.width) * CHART_WIDTH;
    const plotRatio = Math.min(
      1,
      Math.max(0, (svgX - CHART_PADDING.left) / plotWidth),
    );
    const index = points.length === 1
      ? 0
      : Math.round(plotRatio * (points.length - 1));

    setActiveIndex(index);
  }

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const current = activeIndex ?? (direction > 0 ? -1 : points.length);

    setActiveIndex(Math.min(points.length - 1, Math.max(0, current + direction)));
  }

  return (
    <div className="sales-trend-chart">
      <div className="sales-trend-chart__summary">
        <span>{business === "all" ? "All businesses" : business}</span>
        <strong>{points.length} daily points</strong>
      </div>
      <div className="sales-trend-chart__viewport">
        <svg
          aria-label={`Daily net revenue trend for ${business === "all" ? "all businesses" : business}. Use left and right arrow keys to inspect dates.`}
          className="sales-trend-chart__svg"
          onBlur={() => setActiveIndex(null)}
          onKeyDown={handleKeyDown}
          onPointerLeave={() => setActiveIndex(null)}
          onPointerMove={handlePointerMove}
          role="img"
          tabIndex={0}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((ratio) => {
            const y = CHART_PADDING.top + plotHeight - ratio * plotHeight;

            return (
              <g key={ratio}>
                <line
                  className="sales-trend-chart__grid"
                  x1={CHART_PADDING.left}
                  x2={CHART_PADDING.left + plotWidth}
                  y1={y}
                  y2={y}
                />
                <text
                  className="sales-trend-chart__axis-label"
                  textAnchor="end"
                  x={CHART_PADDING.left - 12}
                  y={y + 4}
                >
                  {formatCompactCurrency(yMaximum * ratio)}
                </text>
              </g>
            );
          })}

          {xTickIndices.map((index) => {
            const coordinate = coordinates[index]!;

            return (
              <text
                className="sales-trend-chart__axis-label"
                key={coordinate.point.date}
                textAnchor={getTickAnchor(index, points.length)}
                x={coordinate.x}
                y={CHART_HEIGHT - 12}
              >
                {formatChartDate(coordinate.point.date)}
              </text>
            );
          })}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path className="sales-trend-chart__line" d={linePath} />

          {coordinates.length <= 31
            ? coordinates.map((coordinate) => (
                <circle
                  className="sales-trend-chart__marker"
                  cx={coordinate.x}
                  cy={coordinate.y}
                  key={coordinate.point.date}
                  r="2.5"
                />
              ))
            : null}

          {activeCoordinate ? (
            <g aria-hidden="true">
              <line
                className="sales-trend-chart__cursor"
                x1={activeCoordinate.x}
                x2={activeCoordinate.x}
                y1={CHART_PADDING.top}
                y2={CHART_PADDING.top + plotHeight}
              />
              <circle
                className="sales-trend-chart__point"
                cx={activeCoordinate.x}
                cy={activeCoordinate.y}
                r="5"
              />
            </g>
          ) : null}
        </svg>
      </div>
      <div
        aria-live="polite"
        className="sales-trend-chart__detail"
      >
        {activeCoordinate ? (
          <>
            <span>{formatFullDate(activeCoordinate.point.date)}</span>
            <strong>{formatCurrency(activeCoordinate.point.netRevenue)}</strong>
          </>
        ) : (
          <span>Hover the chart or use arrow keys to inspect a day.</span>
        )}
      </div>
    </div>
  );
}

function ProductPerformanceTable({
  products,
}: {
  readonly products: readonly ProductSalesPerformance[];
}) {
  return (
    <div className="analytics-product-list">
      <DataTable
        columns={["Rank", "Product", "Units", "Net Revenue"]}
        columnsTemplate="0.42fr minmax(150px, 1.4fr) 0.58fr 0.82fr"
        density="dense"
        emptyMessage="No products match the selected period and business."
        footer={
          products.length === 0
            ? "No product sales to rank."
            : `Showing all ${products.length} products, ranked by units sold.`
        }
        rows={products.map((product, index) => [
          `#${index + 1}`,
          product.productReference,
          formatQuantity(product.unitsSold),
          <strong className="analytics-product-list__revenue">
            {formatCurrency(product.netRevenue)}
          </strong>,
        ])}
      />
    </div>
  );
}

function BusinessPerformanceTable({
  business,
  performance,
  period,
}: {
  readonly business: SalesAnalyticsBusiness;
  readonly performance: readonly BusinessPerformance[];
  readonly period: SalesAnalyticsPeriod;
}) {
  const leadingRevenue = performance.reduce(
    (maximum, item) => Math.max(maximum, item.netRevenue),
    0,
  );
  const selectedRowIndex = business === "all"
    ? null
    : performance.findIndex((item) => item.channel === business);

  return (
    <div className="business-performance-table">
      <DataTable
        columns={[
          "Rank",
          "Business",
          "Net Revenue",
          "Units Sold",
          "Sales",
          "Average Sale",
          "Net Change",
        ]}
        columnsTemplate="0.42fr minmax(130px, 0.9fr) minmax(180px, 1.35fr) 0.65fr 0.55fr 0.85fr 0.72fr"
        density="dense"
        footer={
          period === "all"
            ? "Lifetime totals across all businesses; change requires a selected month."
            : "Net change compares this period with the matching previous-month period."
        }
        rows={performance.map((item, index) => [
          `#${index + 1}`,
          <strong>{item.channel}</strong>,
          <BusinessRevenueBar
            leadingRevenue={leadingRevenue}
            performance={item}
          />,
          formatQuantity(item.unitsSold),
          String(item.saleCount),
          formatCurrency(item.averageSaleValue),
          <BusinessRevenueChange performance={item} />,
        ])}
        selectedRowIndex={
          selectedRowIndex !== null && selectedRowIndex >= 0
            ? selectedRowIndex
            : null
        }
      />
    </div>
  );
}

function BusinessRevenueBar({
  leadingRevenue,
  performance,
}: {
  readonly leadingRevenue: number;
  readonly performance: BusinessPerformance;
}) {
  const width = getBusinessRevenueBarPercent(
    performance.netRevenue,
    leadingRevenue,
  );
  const style = {
    "--business-revenue-width": `${width}%`,
  } as CSSProperties;

  return (
    <div
      aria-label={`${performance.channel} net revenue ${formatCurrency(performance.netRevenue)}`}
      className="business-revenue-bar"
      style={style}
    >
      <span aria-hidden="true" />
      <strong>{formatCurrency(performance.netRevenue)}</strong>
    </div>
  );
}

function BusinessRevenueChange({
  performance,
}: {
  readonly performance: BusinessPerformance;
}) {
  if (performance.previousNetRevenue === null) {
    return <span className="business-change business-change--empty">--</span>;
  }

  if (performance.previousNetRevenue === 0) {
    return performance.netRevenue > 0 ? (
      <Badge tone="success">New</Badge>
    ) : (
      <span className="business-change business-change--empty">--</span>
    );
  }

  const change = performance.netRevenueChangePercent ?? 0;
  const tone = change > 0
    ? "success"
    : change < 0
      ? "danger"
      : "neutral";

  return (
    <Badge tone={tone}>
      {change > 0 ? "+" : ""}
      {change.toFixed(1)}%
    </Badge>
  );
}

function AnalyticsState({ label }: { readonly label: string }) {
  return <div className="analytics-state">{label}</div>;
}

function getTickIndices(length: number, maximumTicks: number): readonly number[] {
  if (length <= maximumTicks) {
    return Array.from({ length }, (_, index) => index);
  }

  return Array.from(
    new Set(
      Array.from(
        { length: maximumTicks },
        (_, index) => Math.round((index / (maximumTicks - 1)) * (length - 1)),
      ),
    ),
  );
}

function getTickAnchor(index: number, length: number): "start" | "middle" | "end" {
  if (index === 0) {
    return "start";
  }

  if (index === length - 1) {
    return "end";
  }

  return "middle";
}

function getNiceMaximum(value: number): number {
  if (value <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1
    ? 1
    : normalized <= 2
      ? 2
      : normalized <= 5
        ? 5
        : 10;

  return niceNormalized * magnitude;
}

function todayInputValue(): string {
  const date = new Date();

  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatMonthLabel(month: string): string {
  const [yearText, monthText] = month.split("-");
  const value = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));

  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(value);
}

function formatChartDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(toUtcDate(date));
}

function formatFullDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(toUtcDate(date));
}

function toUtcDate(value: string): Date {
  const [yearText, monthText, dayText] = value.split("-");

  return new Date(Date.UTC(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
  ));
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    maximumFractionDigits: 1,
    notation: value >= 1_000 ? "compact" : "standard",
    style: "currency",
  }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatRepositoryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("invoke")) {
    return "Native SQLite storage is not available in this environment. Run the app through Tauri to load analytics from local data.";
  }

  return message;
}
