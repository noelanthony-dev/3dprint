import type { SaleRecord, SalesChannel, SalesPeriodMode } from "@/domain/sales";

export interface SalesCsvScope {
  readonly periodMode: SalesPeriodMode;
  readonly month: string;
  readonly date: string;
  readonly channel: "All" | SalesChannel;
}

export function buildSalesCsv(sales: readonly SaleRecord[]): string {
  const headers = [
    "Sale ID", "Sale Date", "Product", "Channel", "Quantity", "Sale Unit",
    "Gross Revenue (PHP)", "Discounts / Fees (PHP)", "Net Revenue (PHP)",
    "Stock Before", "Stock After", "Notes",
  ];
  const rows = sales.map((sale) => [
    String(sale.id), csvText(sale.saleDate), csvText(sale.productReference),
    csvText(sale.channel), String(sale.quantity), csvText(sale.saleUnit),
    sale.grossRevenue.toFixed(2), sale.discountsFees.toFixed(2), sale.netRevenue.toFixed(2),
    String(sale.stockQuantityBefore), String(sale.stockQuantityAfter), csvText(sale.notes),
  ].join(","));

  return `\uFEFF${[headers.map(csvText).join(","), ...rows].join("\r\n")}\r\n`;
}

export function getSalesCsvFilename(scope: SalesCsvScope): string {
  const period = scope.periodMode === "lifetime"
    ? "lifetime"
    : scope.periodMode === "monthly" ? scope.month : scope.date;
  const channel = scope.channel === "All" ? "all-channels" : scope.channel;
  return `printops-sales-${period}-${channel}.csv`.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
}

function csvText(value: string): string {
  // Quoting alone does not prevent spreadsheet applications from evaluating formulas.
  const safeValue = /^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value)
    ? `'${value}`
    : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}
