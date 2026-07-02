import { occursInMonth, type ExpenseRecord, type MembershipRecord } from "@/domain/expenses";
import type { ProductionRunRecord } from "@/domain/production";
import type { SaleRecord } from "@/domain/sales";
import { createScaffoldModuleStatus } from "@/domain/shared";

export interface MonthlyReportInput {
  readonly expenses: readonly ExpenseRecord[];
  readonly memberships: readonly MembershipRecord[];
  readonly month: string;
  readonly productionRuns: readonly ProductionRunRecord[];
  readonly sales: readonly SaleRecord[];
}

export interface ReportBreakdownItem {
  readonly label: string;
  readonly percent: number;
  readonly value: number;
}

export interface RecentReportTransaction {
  readonly amount: number;
  readonly date: string;
  readonly id: string;
  readonly label: string;
  readonly netAmount: number;
  readonly type: "sale" | "expense" | "production";
}

export interface MonthlySalesSummary {
  readonly averageOrderValue: number;
  readonly discountsFees: number;
  readonly grossRevenue: number;
  readonly netRevenue: number;
  readonly orderCount: number;
  readonly unitsSold: number;
}

export interface MonthlyExpenseSummary {
  readonly categoryBreakdown: readonly ReportBreakdownItem[];
  readonly expenseTotal: number;
  readonly membershipTotal: number;
  readonly recurringMonthlyTotal: number;
  readonly totalExpenses: number;
}

export interface MonthlyProductionSummary {
  readonly addOnQuantityDeducted: number;
  readonly attemptedPieces: number;
  readonly failedPieces: number;
  readonly filamentGramsDeducted: number;
  readonly goodPieces: number;
  readonly runCount: number;
  readonly yieldRate: number;
}

export interface MonthlyInventoryMovementSummary {
  readonly addOnQuantityDeducted: number;
  readonly filamentGramsDeducted: number;
  readonly finishedGoodsNetChange: number;
  readonly finishedGoodsProduced: number;
  readonly finishedGoodsSold: number;
}

export interface MonthlyProfitSummary {
  readonly expenseTotal: number;
  readonly grossRevenue: number;
  readonly marginPercent: number;
  readonly netRevenue: number;
  readonly simpleProfit: number;
}

export interface MonthlyReport {
  readonly channelBreakdown: readonly ReportBreakdownItem[];
  readonly expenseSummary: MonthlyExpenseSummary;
  readonly inventoryMovement: MonthlyInventoryMovementSummary;
  readonly month: string;
  readonly productionSummary: MonthlyProductionSummary;
  readonly productBreakdown: readonly ReportBreakdownItem[];
  readonly profitSummary: MonthlyProfitSummary;
  readonly recentTransactions: readonly RecentReportTransaction[];
  readonly salesSummary: MonthlySalesSummary;
}

export function buildMonthlyReport(input: MonthlyReportInput): MonthlyReport {
  const sales = input.sales.filter((sale) => isDateInMonth(sale.saleDate, input.month));
  const expenses = input.expenses.filter((expense) =>
    occursInMonth(expense, input.month),
  );
  const memberships = input.memberships.filter((membership) =>
    occursInMonth({ ...membership, expenseDate: `${input.month}-01` }, input.month),
  );
  const productionRuns = input.productionRuns.filter((run) =>
    isDateInMonth(run.runDate, input.month),
  );
  const salesSummary = buildSalesSummary(sales);
  const expenseSummary = buildExpenseSummary(expenses, memberships);
  const productionSummary = buildProductionSummary(productionRuns);
  const inventoryMovement = buildInventoryMovementSummary(sales, productionRuns);
  const profitSummary = buildProfitSummary(salesSummary, expenseSummary);

  return {
    channelBreakdown: buildSalesChannelBreakdown(sales),
    expenseSummary,
    inventoryMovement,
    month: input.month,
    productionSummary,
    productBreakdown: buildProductBreakdown(sales),
    profitSummary,
    recentTransactions: buildRecentTransactions(sales, expenses, productionRuns),
    salesSummary,
  };
}

export function buildSalesSummary(sales: readonly SaleRecord[]): MonthlySalesSummary {
  const grossRevenue = sum(sales, (sale) => sale.grossRevenue);
  const discountsFees = sum(sales, (sale) => sale.discountsFees);
  const netRevenue = sum(sales, (sale) => sale.netRevenue);
  const unitsSold = sum(sales, (sale) => sale.quantity);

  return {
    averageOrderValue: sales.length > 0 ? roundReportMoney(netRevenue / sales.length) : 0,
    discountsFees: roundReportMoney(discountsFees),
    grossRevenue: roundReportMoney(grossRevenue),
    netRevenue: roundReportMoney(netRevenue),
    orderCount: sales.length,
    unitsSold,
  };
}

export function buildExpenseSummary(
  expenses: readonly ExpenseRecord[],
  memberships: readonly MembershipRecord[],
): MonthlyExpenseSummary {
  const expenseTotal = sum(expenses, (expense) => expense.amount);
  const membershipTotal = sum(memberships, (membership) => membership.amount);
  const categoryTotals = new Map<string, number>();

  for (const expense of expenses) {
    categoryTotals.set(
      expense.category,
      (categoryTotals.get(expense.category) ?? 0) + expense.amount,
    );
  }

  if (membershipTotal > 0) {
    categoryTotals.set("Membership", (categoryTotals.get("Membership") ?? 0) + membershipTotal);
  }

  const totalExpenses = roundReportMoney(expenseTotal + membershipTotal);

  return {
    categoryBreakdown: toBreakdown(categoryTotals, totalExpenses),
    expenseTotal: roundReportMoney(expenseTotal),
    membershipTotal: roundReportMoney(membershipTotal),
    recurringMonthlyTotal: roundReportMoney(
      sum(expenses, (expense) => (expense.recurrence === "monthly" ? expense.amount : 0)) +
        sum(memberships, (membership) =>
          membership.recurrence === "monthly" ? membership.amount : 0,
        ),
    ),
    totalExpenses,
  };
}

export function buildProductionSummary(
  runs: readonly ProductionRunRecord[],
): MonthlyProductionSummary {
  const goodPieces = sum(runs, (run) => run.goodPieces);
  const failedPieces = sum(runs, (run) => run.failedPieces);
  const attemptedPieces = goodPieces + failedPieces;

  return {
    addOnQuantityDeducted: roundReportQuantity(sum(runs, (run) => run.addOnQuantityDeducted)),
    attemptedPieces,
    failedPieces,
    filamentGramsDeducted: roundReportQuantity(sum(runs, (run) => run.filamentGramsDeducted)),
    goodPieces,
    runCount: runs.length,
    yieldRate: attemptedPieces > 0 ? goodPieces / attemptedPieces : 0,
  };
}

export function buildInventoryMovementSummary(
  sales: readonly SaleRecord[],
  runs: readonly ProductionRunRecord[],
): MonthlyInventoryMovementSummary {
  const finishedGoodsProduced = sum(runs, (run) => run.goodPieces);
  const finishedGoodsSold = sum(sales, (sale) => sale.quantity);

  return {
    addOnQuantityDeducted: roundReportQuantity(sum(runs, (run) => run.addOnQuantityDeducted)),
    filamentGramsDeducted: roundReportQuantity(sum(runs, (run) => run.filamentGramsDeducted)),
    finishedGoodsNetChange: finishedGoodsProduced - finishedGoodsSold,
    finishedGoodsProduced,
    finishedGoodsSold,
  };
}

export function buildProfitSummary(
  salesSummary: MonthlySalesSummary,
  expenseSummary: MonthlyExpenseSummary,
): MonthlyProfitSummary {
  const simpleProfit = roundReportMoney(salesSummary.netRevenue - expenseSummary.totalExpenses);

  return {
    expenseTotal: expenseSummary.totalExpenses,
    grossRevenue: salesSummary.grossRevenue,
    marginPercent:
      salesSummary.netRevenue > 0
        ? roundReportQuantity((simpleProfit / salesSummary.netRevenue) * 100)
        : 0,
    netRevenue: salesSummary.netRevenue,
    simpleProfit,
  };
}

export function buildSalesChannelBreakdown(
  sales: readonly SaleRecord[],
): readonly ReportBreakdownItem[] {
  const totals = new Map<string, number>();

  for (const sale of sales) {
    totals.set(sale.channel, (totals.get(sale.channel) ?? 0) + sale.netRevenue);
  }

  return toBreakdown(totals, sum(sales, (sale) => sale.netRevenue));
}

export function buildProductBreakdown(sales: readonly SaleRecord[]): readonly ReportBreakdownItem[] {
  const totals = new Map<string, number>();

  for (const sale of sales) {
    totals.set(
      sale.productReference,
      (totals.get(sale.productReference) ?? 0) + sale.netRevenue,
    );
  }

  return toBreakdown(totals, sum(sales, (sale) => sale.netRevenue)).slice(0, 6);
}

export function buildRecentTransactions(
  sales: readonly SaleRecord[],
  expenses: readonly ExpenseRecord[],
  productionRuns: readonly ProductionRunRecord[],
): readonly RecentReportTransaction[] {
  return [
    ...sales.map((sale) => ({
      amount: sale.grossRevenue,
      date: sale.saleDate,
      id: `SALE-${sale.id}`,
      label: sale.productReference,
      netAmount: sale.netRevenue,
      type: "sale" as const,
    })),
    ...expenses.map((expense) => ({
      amount: expense.amount,
      date: expense.expenseDate,
      id: `EXP-${expense.id}`,
      label: `${expense.vendor} / ${expense.category}`,
      netAmount: -expense.amount,
      type: "expense" as const,
    })),
    ...productionRuns.map((run) => ({
      amount: run.filamentGramsDeducted,
      date: run.runDate,
      id: `RUN-${run.id}`,
      label: `${run.goodPieces} good / ${run.failedPieces} failed`,
      netAmount: run.goodPieces,
      type: "production" as const,
    })),
  ]
    .sort((first, second) => second.date.localeCompare(first.date))
    .slice(0, 8);
}

export function getPreviousMonth(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex)) {
    return month;
  }

  if (monthIndex === 1) {
    return `${year - 1}-12`;
  }

  return `${year}-${String(monthIndex - 1).padStart(2, "0")}`;
}

export function isDateInMonth(date: string, month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month) && date.startsWith(month);
}

export function roundReportMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundReportQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toBreakdown(totals: Map<string, number>, denominator: number): readonly ReportBreakdownItem[] {
  return Array.from(totals.entries())
    .map(([label, value]) => ({
      label,
      percent: denominator > 0 ? roundReportQuantity((value / denominator) * 100) : 0,
      value: roundReportMoney(value),
    }))
    .sort((first, second) => second.value - first.value);
}

function sum<T>(items: readonly T[], selector: (item: T) => number): number {
  return items.reduce((total, item) => total + selector(item), 0);
}

export const reportsDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "reports",
  notes: ["Pure monthly sales, expenses, production, inventory movement, and profit summaries."],
});
