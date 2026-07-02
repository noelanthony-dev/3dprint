import { useEffect, useMemo, useState } from "react";

import { Page } from "@/components/layout/Page";
import { Badge, DataTable, MetricPanel, Panel, ProgressBar, ToolbarButton } from "@/components/ui";
import {
  expensesRepository,
  productionRunsRepository,
  salesRepository,
} from "@/data/repositories";
import type { ExpenseRecord, MembershipRecord } from "@/domain/expenses";
import type { ProductionRunRecord } from "@/domain/production";
import {
  buildMonthlyReport,
  getPreviousMonth,
  type MonthlyReport,
  type ReportBreakdownItem,
} from "@/domain/reports";
import type { SaleRecord } from "@/domain/sales";

export function MonthlyReportsPage() {
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [month, setMonth] = useState(currentMonthInputValue());
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

  const report = useMemo(
    () =>
      buildMonthlyReport({
        expenses,
        memberships,
        month,
        productionRuns,
        sales,
      }),
    [expenses, memberships, month, productionRuns, sales],
  );
  const previousReport = useMemo(
    () =>
      buildMonthlyReport({
        expenses,
        memberships,
        month: getPreviousMonth(month),
        productionRuns,
        sales,
      }),
    [expenses, memberships, month, productionRuns, sales],
  );

  return (
    <Page
      actions={
        <>
          <input
            aria-label="Report month"
            className="table-input"
            onChange={(event) => setMonth(event.target.value || currentMonthInputValue())}
            type="month"
            value={month}
          />
          <ToolbarButton onClick={() => void loadReportData()}>Refresh</ToolbarButton>
        </>
      }
      description="Review monthly sales, expenses, production, inventory movement, and simple profit from local records."
      meta={["On-demand calculation", "SQLite source data", "No chart library"]}
      title="Monthly Reports"
    >
      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricPanel
          detail={formatDelta(report.salesSummary.netRevenue, previousReport.salesSummary.netRevenue)}
          label="Net Revenue"
          tone="success"
          value={formatCurrency(report.salesSummary.netRevenue)}
        />
        <MetricPanel
          detail={`${formatCurrency(report.expenseSummary.recurringMonthlyTotal)} recurring`}
          label="Expenses"
          tone={report.expenseSummary.totalExpenses > 0 ? "warning" : "default"}
          value={formatCurrency(report.expenseSummary.totalExpenses)}
        />
        <MetricPanel
          detail={formatDelta(report.profitSummary.simpleProfit, previousReport.profitSummary.simpleProfit)}
          label="Simple Profit"
          tone={report.profitSummary.simpleProfit >= 0 ? "success" : "danger"}
          value={formatCurrency(report.profitSummary.simpleProfit)}
        />
        <MetricPanel
          detail={`${report.salesSummary.orderCount} orders / ${formatQuantity(report.salesSummary.unitsSold)} units`}
          label="Avg Margin"
          value={formatPercent(report.profitSummary.marginPercent)}
        />
      </div>

      <div className="content-grid content-grid--costing">
        <div className="side-stack">
          <Panel title="Profit Summary">
            <div className="key-value-list">
              <span>Gross revenue</span>
              <strong>{formatCurrency(report.profitSummary.grossRevenue)}</strong>
              <span>Discounts and fees</span>
              <strong>{formatCurrency(report.salesSummary.discountsFees)}</strong>
              <span>Net revenue</span>
              <strong>{formatCurrency(report.profitSummary.netRevenue)}</strong>
              <span>Total expenses</span>
              <strong>{formatCurrency(report.profitSummary.expenseTotal)}</strong>
              <span>Simple profit</span>
              <strong>{formatCurrency(report.profitSummary.simpleProfit)}</strong>
              <span>Average order</span>
              <strong>{formatCurrency(report.salesSummary.averageOrderValue)}</strong>
            </div>
          </Panel>

          <Panel title="Recent Report Activity">
            <DataTable
              columns={["Date", "Type", "Reference", "Amount", "Impact"]}
              columnsTemplate="0.7fr 0.55fr minmax(160px, 1.25fr) 0.65fr 0.65fr"
              density="dense"
              footer={
                report.recentTransactions.length === 0
                  ? "No sales, expenses, or production runs in this month."
                  : `Showing ${report.recentTransactions.length} recent entries.`
              }
              rows={report.recentTransactions.map((transaction) => [
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
              emptyLabel="No product sales for this month."
              items={report.productBreakdown}
              valueFormatter={formatCurrency}
            />
          </Panel>

          <Panel title="Revenue by Channel">
            <BreakdownList
              emptyLabel="No channel sales for this month."
              items={report.channelBreakdown}
              valueFormatter={formatCurrency}
            />
          </Panel>

          <Panel title="Expense Breakdown">
            <BreakdownList
              emptyLabel="No expenses for this month."
              items={report.expenseSummary.categoryBreakdown}
              tone="warning"
              valueFormatter={formatCurrency}
            />
          </Panel>
        </div>

        <Panel title="Production and Inventory Movement">
          <ReportMovementGrid report={report} />
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

function currentMonthInputValue(): string {
  const date = new Date();

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatDelta(current: number, previous: number): string {
  const delta = current - previous;

  if (previous === 0 && current === 0) {
    return "flat vs prior month";
  }

  return `${delta >= 0 ? "+" : ""}${formatCurrency(delta)} vs prior`;
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
