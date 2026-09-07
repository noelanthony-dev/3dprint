import { describe, expect, it } from "vitest";
import { filterSalesByPeriod, SALES_CHANNELS, type SaleRecord } from "@/domain/sales";
import { buildSalesCsv, getSalesCsvFilename } from "./salesCsv";

const sale: SaleRecord = {
  id: 1, finishedGoodId: 2, productReference: "Great Wave", saleDate: "2026-09-04",
  channel: "Sincerely", quantity: 2, saleUnit: "piece", grossRevenue: 300,
  discountsFees: 10, netRevenue: 290, stockQuantityBefore: 4, stockQuantityAfter: 2,
  notes: "", createdAt: "2026-09-05", updatedAt: "2026-09-05",
};

describe("sales CSV", () => {
  it("writes spreadsheet-friendly UTF-8 CSV with numeric PHP values", () => {
    const csv = buildSalesCsv([sale]);
    expect(csv.startsWith("\uFEFF\"Sale ID\"")).toBe(true);
    expect(csv).toContain('1,"2026-09-04","Great Wave","Sincerely",2,"piece",300.00,10.00,290.00,4,2,""\r\n');
    expect(csv).toContain('"Gross Revenue (PHP)"');
    expect(buildSalesCsv([]).split("\r\n")).toHaveLength(2);
  });

  it("escapes commas, quotes, newlines, and preserves Unicode", () => {
    const csv = buildSalesCsv([{ ...sale, productReference: 'Wave, "Framed"', notes: "₱ paid\nThank you" }]);
    expect(csv).toContain('"Wave, ""Framed"""');
    expect(csv).toContain('"₱ paid\nThank you"');
  });

  it.each(["=SUM(A1:A2)", "+cmd", "-cmd", "@cmd", "  =1+1", "\tformula"])(
    "neutralizes formula-like text: %s",
    (value) => {
      expect(buildSalesCsv([{ ...sale, notes: value }])).toContain(`"'${value}"`);
    },
  );

  it.each(SALES_CHANNELS)("exports only the selected date and %s channel", (channel) => {
    const sales = [
      { ...sale, channel },
      { ...sale, id: 2, channel, saleDate: "2026-09-03" },
      { ...sale, id: 3, channel: channel === "Flora" ? "Direct" as const : "Flora" as const },
    ];
    const filtered = filterSalesByPeriod(sales, "daily", "2026-09", "2026-09-04")
      .filter((row) => row.channel === channel);
    expect(buildSalesCsv(filtered).split("\r\n")).toHaveLength(3);
    expect(buildSalesCsv(filtered)).not.toContain("2026-09-03");
  });

  it("exports all matching transactions, not a top-ten preview", () => {
    const sales = Array.from({ length: 15 }, (_, id) => ({ ...sale, id }));
    expect(buildSalesCsv(filterSalesByPeriod(sales, "lifetime", "", "")).split("\r\n")).toHaveLength(17);
    expect(buildSalesCsv(filterSalesByPeriod(sales, "monthly", "2026-08")).split("\r\n")).toHaveLength(2);
  });

  it("includes selected period and channel in filenames", () => {
    const scope = { periodMode: "daily" as const, date: "2026-09-04", month: "2026-09", channel: "Dear Reader" as const };
    expect(getSalesCsvFilename(scope)).toBe("printops-sales-2026-09-04-dear-reader.csv");
    expect(getSalesCsvFilename({ ...scope, periodMode: "monthly" })).toBe("printops-sales-2026-09-dear-reader.csv");
    expect(getSalesCsvFilename({ ...scope, periodMode: "lifetime", channel: "All" })).toBe("printops-sales-lifetime-all-channels.csv");
  });
});
