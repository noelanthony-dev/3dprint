import { useEffect, useMemo, useState } from "react";

import { Page } from "@/components/layout/Page";
import {
  Badge,
  DataTable,
  MetricPanel,
  Panel,
  ProgressBar,
  SegmentedFilter,
  ToolbarButton,
} from "@/components/ui";
import {
  expensesRepository,
  productionRunsRepository,
  salesRepository,
} from "@/data/repositories";
import type { ExpenseRecord, MembershipRecord } from "@/domain/expenses";
import type { ProductionRunRecord } from "@/domain/production";
import {
  buildDailyReport,
  buildLifetimeReport,
  buildMonthlyReport,
  filterReportSalesByBusiness,
  type MonthlyReport,
  type ReportBusiness,
  type ReportBreakdownItem,
} from "@/domain/reports";
import { SALES_CHANNELS, type SaleRecord } from "@/domain/sales";
import {
  formatDateLabel,
  formatMonthLabel,
  getLocalDateToken,
  getLocalMonthToken,
  getNextDate,
  getNextMonth,
  getPreviousDate,
  getPreviousMonth,
} from "@/domain/shared";
import { exportAiAnalysisPack } from "@/infrastructure/analysis";

interface AnalysisExportStatus {
  readonly message: string;
  readonly tone: "neutral" | "success" | "warning";
}

type ReportPeriodMode = "lifetime" | "monthly" | "daily";

export function MonthlyReportsPage() {
  const [analysisExportStatus, setAnalysisExportStatus] = useState<AnalysisExportStatus | null>(null);
  const [business, setBusiness] = useState<ReportBusiness>("all");
  const [date, setDate] = useState(getLocalDateToken());
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [month, setMonth] = useState(getLocalMonthToken());
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>("monthly");
  const [productionRuns, setProductionRuns] = useState<ProductionRunRecord[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);

  async function loadReportData(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const [
        loadedSales,
        loadedExpenses,
        loadedMemberships,
        loadedProductionRuns,
      ] = await Promise.all([
        salesRepository.list(),
        expensesRepository.listExpenses(),
        expensesRepository.listMemberships(),
        productionRunsRepository.list(),
      ]);

      setSales(loadedSales);
      setExpenses(loadedExpenses);
      setMemberships(loadedMemberships);
      setProductionRuns(loadedProductionRuns);
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadReportData();
  }, []);

  async function exportAnalysis(): Promise<void> {
    setIsExporting(true);
    setAnalysisExportStatus(null);

    try {
      const result = await exportAiAnalysisPack();
      setAnalysisExportStatus({
        message: result.message,
        tone: result.canceled ? "neutral" : "success",
      });
    } catch (exportError) {
      setAnalysisExportStatus({
        message: formatAnalysisExportError(exportError),
        tone: "warning",
      });
    } finally {
      setIsExporting(false);
    }
  }

  const businessSales = useMemo(
    () => filterReportSalesByBusiness(sales, business),
    [business, sales],
  );
  const overallReport = useMemo(
    () => {
      const source = {
        expenses,
        memberships,
        productionRuns,
        sales,
      };

      if (periodMode === "lifetime") {
        return buildLifetimeReport(source);
      }

      return periodMode === "monthly"
        ? buildMonthlyReport({ ...source, month })
        : buildDailyReport({ ...source, date });
    },
    [date, expenses, memberships, month, periodMode, productionRuns, sales],
  );
  const previousOverallReport = useMemo(
    () => {
      if (periodMode === "lifetime") {
        return null;
      }

      const source = { expenses, memberships, productionRuns, sales };
      return periodMode === "monthly"
        ? buildMonthlyReport({ ...source, month: getPreviousMonth(month) })
        : buildDailyReport({ ...source, date: getPreviousDate(date) });
    },
    [date, expenses, memberships, month, periodMode, productionRuns, sales],
  );
  const salesReport = useMemo(
    () => {
      const source = {
        expenses: [],
        memberships: [],
        productionRuns: [],
        sales: businessSales,
      };

      if (periodMode === "lifetime") {
        return buildLifetimeReport(source);
      }

      return periodMode === "monthly"
        ? buildMonthlyReport({ ...source, month })
        : buildDailyReport({ ...source, date });
    },
    [businessSales, date, month, periodMode],
  );
  const previousSalesReport = useMemo(
    () => {
      if (periodMode === "lifetime") {
        return null;
      }

      const source = {
        expenses: [],
        memberships: [],
        productionRuns: [],
        sales: businessSales,
      };
      return periodMode === "monthly"
        ? buildMonthlyReport({ ...source, month: getPreviousMonth(month) })
        : buildDailyReport({ ...source, date: getPreviousDate(date) });
    },
    [businessSales, date, month, periodMode],
  );
  const periodPhrase = periodMode === "lifetime"
    ? "in the lifetime report"
    : periodMode === "monthly"
      ? `in ${formatMonthLabel(month)}`
      : `on ${formatDateLabel(date)}`;
  const priorPeriodLabel = periodMode === "daily" ? "prior day" : "prior month";

  return (
    <Page
      actions={
        <>
          <ToolbarButton
            disabled={isLoading}
            isLoading={isExporting}
            loadingLabel="Exporting"
            onClick={() => void exportAnalysis()}
            tone="primary"
          >
            Export AI Analysis Pack
          </ToolbarButton>
          <ToolbarButton
            disabled={isLoading || isExporting}
            onClick={() => void loadReportData()}
          >
            Refresh
          </ToolbarButton>
        </>
      }
      description="Review lifetime, monthly, or daily sales, expenses, production, inventory movement, and simple profit from local records."
      meta={["On-demand calculation", "SQLite source data", "Local JSON export"]}
      title="Reports"
    >
      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}

      {analysisExportStatus ? (
        <div className={analysisExportStatus.tone === "warning" ? "callout callout--warning" : "callout"}>
          <Badge tone={analysisExportStatus.tone}>
            {analysisExportStatus.tone === "success" ? "Exported" : analysisExportStatus.tone === "warning" ? "Export" : "Canceled"}
          </Badge>
          <p>{analysisExportStatus.message}</p>
        </div>
      ) : null}

      <div className="analytics-filter-bar">
        <span>Business</span>
        <SegmentedFilter
          label="Report business"
          onChange={(value) => setBusiness(value as ReportBusiness)}
          options={[
            { active: business === "all", label: "All", value: "all" },
            ...SALES_CHANNELS.map((channel) => ({
              active: business === channel,
              label: channel,
              value: channel,
            })),
          ]}
        />
      </div>

      {business !== "all" ? (
        <div className="callout">
          <Badge tone="success">{business}</Badge>
          <p>
            Revenue, orders, units, average order, and revenue breakdowns are filtered to this business.
            Expenses, profit, activity, and production remain all-business because those records do not store a business yet.
          </p>
        </div>
      ) : null}

      <div className="report-period-bar">
        <div className="report-period-mode">
          <span>Report range</span>
          <SegmentedFilter
            label="Report range"
            onChange={(value) => setPeriodMode(value as ReportPeriodMode)}
            options={[
              { active: periodMode === "lifetime", label: "Lifetime", value: "lifetime" },
              { active: periodMode === "monthly", label: "Monthly", value: "monthly" },
              { active: periodMode === "daily", label: "Daily", value: "daily" },
            ]}
          />
        </div>
        {periodMode === "monthly" ? (
          <div className="report-month-controls">
            <ToolbarButton onClick={() => setMonth(getPreviousMonth(month))}>
              ← Previous
            </ToolbarButton>
            <label className="report-month-input">
              <span>Selected month</span>
              <strong>{formatMonthLabel(month)}</strong>
              <input
                aria-label="Report month"
                className="table-input"
                onChange={(event) => setMonth(event.target.value || getLocalMonthToken())}
                type="month"
                value={month}
              />
            </label>
            <ToolbarButton onClick={() => setMonth(getNextMonth(month))}>
              Next →
            </ToolbarButton>
            <ToolbarButton
              disabled={month === getLocalMonthToken()}
              onClick={() => setMonth(getLocalMonthToken())}
              tone="ghost"
            >
              Current Month
            </ToolbarButton>
          </div>
        ) : periodMode === "daily" ? (
          <div className="report-date-controls">
            <ToolbarButton onClick={() => setDate(getPreviousDate(date))}>
              ← Previous Day
            </ToolbarButton>
            <label className="report-date-input">
              <span>Selected date</span>
              <strong>{formatDateLabel(date)}</strong>
              <input
                aria-label="Report date"
                className="table-input"
                onChange={(event) => setDate(event.target.value || getLocalDateToken())}
                type="date"
                value={date}
              />
            </label>
            <ToolbarButton onClick={() => setDate(getNextDate(date))}>
              Next Day →
            </ToolbarButton>
            <ToolbarButton
              disabled={date === getLocalDateToken()}
              onClick={() => setDate(getLocalDateToken())}
              tone="ghost"
            >
              Today
            </ToolbarButton>
          </div>
        ) : (
          <div className="report-lifetime-note">
            <Badge tone="success">All recorded data</Badge>
            <span>Recurring definitions are counted once.</span>
          </div>
        )}
      </div>

      <div className="metric-grid">
        <MetricPanel
          detail={previousSalesReport
            ? formatDelta(
              salesReport.salesSummary.netRevenue,
              previousSalesReport.salesSummary.netRevenue,
              priorPeriodLabel,
            )
            : "all recorded sales"}
          label="Net Revenue"
          tone="success"
          value={formatCurrency(salesReport.salesSummary.netRevenue)}
        />
        <MetricPanel
          detail={business === "all"
            ? periodMode === "daily"
              ? "explicitly dated costs"
              : `${formatCurrency(overallReport.expenseSummary.recurringMonthlyTotal)} recurring`
            : "all-business shared costs"}
          label={business === "all" ? "Expenses" : "Shared Expenses"}
          tone={overallReport.expenseSummary.totalExpenses > 0 ? "warning" : "default"}
          value={formatCurrency(overallReport.expenseSummary.totalExpenses)}
        />
        <MetricPanel
          detail={previousOverallReport
            ? formatDelta(
              overallReport.profitSummary.simpleProfit,
              previousOverallReport.profitSummary.simpleProfit,
              priorPeriodLabel,
            )
            : business === "all" ? "all recorded data" : "all businesses"}
          label={business === "all" ? "Simple Profit" : "Overall Simple Profit"}
          tone={overallReport.profitSummary.simpleProfit >= 0 ? "success" : "danger"}
          value={formatCurrency(overallReport.profitSummary.simpleProfit)}
        />
        <MetricPanel
          detail={`${salesReport.salesSummary.orderCount} orders / ${formatQuantity(salesReport.salesSummary.unitsSold)} units`}
          label={business === "all" ? "Avg Margin" : "Average Order"}
          value={business === "all"
            ? formatPercent(overallReport.profitSummary.marginPercent)
            : formatCurrency(salesReport.salesSummary.averageOrderValue)}
        />
      </div>

      <div className="content-grid content-grid--costing">
        <div className="side-stack">
          <Panel title={business === "all" ? "Profit Summary" : "All-Business Profit Summary"}>
            <div className="key-value-list">
              <span>Gross revenue</span>
              <strong>{formatCurrency(overallReport.profitSummary.grossRevenue)}</strong>
              <span>Discounts and fees</span>
              <strong>{formatCurrency(overallReport.salesSummary.discountsFees)}</strong>
              <span>Net revenue</span>
              <strong>{formatCurrency(overallReport.profitSummary.netRevenue)}</strong>
              <span>Total expenses</span>
              <strong>{formatCurrency(overallReport.profitSummary.expenseTotal)}</strong>
              <span>Simple profit</span>
              <strong>{formatCurrency(overallReport.profitSummary.simpleProfit)}</strong>
              <span>Average order</span>
              <strong>{formatCurrency(overallReport.salesSummary.averageOrderValue)}</strong>
            </div>
          </Panel>

          <Panel title="Recent Report Activity">
            <DataTable
              columns={["Date", "Type", "Reference", "Amount", "Impact"]}
              columnsTemplate="0.7fr 0.55fr minmax(160px, 1.25fr) 0.65fr 0.65fr"
              density="dense"
              footer={
                overallReport.recentTransactions.length === 0
                  ? `No sales, expenses, or production runs ${periodPhrase}.`
                  : `Showing ${overallReport.recentTransactions.length} recent entries.`
              }
              rows={overallReport.recentTransactions.map((transaction) => [
                transaction.date,
                <Badge tone={getTransactionTone(transaction.type)}>{transaction.type}</Badge>,
                transaction.label,
                transaction.type === "production"
                  ? `${formatQuantity(transaction.amount)} g`
                  : formatCurrency(transaction.amount),
                transaction.type === "production"
                  ? `${formatQuantity(transaction.netAmount)} good`
                  : formatCurrency(transaction.netAmount),
              ])}
            />
          </Panel>
        </div>

        <div className="side-stack">
          <Panel title="Revenue by Product">
            <BreakdownList
              emptyLabel={`No product sales ${periodPhrase}.`}
              items={salesReport.productBreakdown}
              valueFormatter={formatCurrency}
            />
          </Panel>

          <Panel title="Revenue by Channel">
            <BreakdownList
              emptyLabel={`No channel sales ${periodPhrase}.`}
              items={salesReport.channelBreakdown}
              valueFormatter={formatCurrency}
            />
          </Panel>

          <Panel title="Expense Breakdown">
            <BreakdownList
              emptyLabel={`No expenses ${periodPhrase}.`}
              items={overallReport.expenseSummary.categoryBreakdown}
              tone="warning"
              valueFormatter={formatCurrency}
            />
          </Panel>
        </div>

        <Panel title="Production and Inventory Movement">
          <ReportMovementGrid report={overallReport} />
        </Panel>
      </div>

      {isLoading ? (
        <div className="callout">
          <Badge>Loading</Badge>
          <p>Refreshing report source data.</p>
        </div>
      ) : null}
    </Page>
  );
}

function BreakdownList({
  emptyLabel,
  items,
  tone = "success",
  valueFormatter,
}: {
  readonly emptyLabel: string;
  readonly items: readonly ReportBreakdownItem[];
  readonly tone?: "success" | "warning" | "danger";
  readonly valueFormatter: (value: number) => string;
}) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="side-stack">
      {items.map((item) => (
        <div className="numeric-readout" key={item.label}>
          <span>
            {item.label} · {formatPercent(item.percent)}
          </span>
          <strong>{valueFormatter(item.value)}</strong>
          <ProgressBar label={item.label} tone={tone} value={item.percent} />
        </div>
      ))}
    </div>
  );
}

function ReportMovementGrid({ report }: { readonly report: MonthlyReport }) {
  return (
    <div className="key-value-list">
      <span>Production runs</span>
      <strong>{report.productionSummary.runCount}</strong>
      <span>Good pieces</span>
      <strong>{formatQuantity(report.productionSummary.goodPieces)}</strong>
      <span>Failed pieces</span>
      <strong>{formatQuantity(report.productionSummary.failedPieces)}</strong>
      <span>Yield rate</span>
      <strong>{formatPercent(report.productionSummary.yieldRate * 100)}</strong>
      <span>Filament deducted</span>
      <strong>{formatQuantity(report.inventoryMovement.filamentGramsDeducted)} g</strong>
      <span>Add-ons deducted</span>
      <strong>{formatQuantity(report.inventoryMovement.addOnQuantityDeducted)}</strong>
      <span>Finished goods produced</span>
      <strong>{formatQuantity(report.inventoryMovement.finishedGoodsProduced)}</strong>
      <span>Finished goods sold</span>
      <strong>{formatQuantity(report.inventoryMovement.finishedGoodsSold)}</strong>
      <span>Net stock movement</span>
      <strong>{formatSignedQuantity(report.inventoryMovement.finishedGoodsNetChange)}</strong>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatDelta(current: number, previous: number, priorPeriodLabel: string): string {
  const delta = current - previous;

  if (previous === 0 && current === 0) {
    return `flat vs ${priorPeriodLabel}`;
  }

  return `${delta >= 0 ? "+" : ""}${formatCurrency(delta)} vs ${priorPeriodLabel}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatSignedQuantity(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatQuantity(value)}`;
}

function getTransactionTone(type: "sale" | "expense" | "production"): "neutral" | "success" | "warning" {
  if (type === "sale") {
    return "success";
  }

  if (type === "expense") {
    return "warning";
  }

  return "neutral";
}

function formatRepositoryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("invoke")) {
    return "Native SQLite storage is not available in this environment. Run the app through Tauri to load reports from local data.";
  }

  return message;
}

export function formatAnalysisExportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("invoke")) {
    return "AI Analysis Pack export requires the Tauri desktop app and local SQLite data.";
  }

  return message || "AI Analysis Pack could not be exported.";
}
