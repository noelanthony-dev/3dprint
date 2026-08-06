import { describe, expect, it } from "vitest";

import {
  calculateSaleTotals,
  filterSalesByPeriod,
  getSalesChannelSummaries,
  getSaleStockReconciliationQuantity,
  getSaleStockStatus,
  getSaleStockWarning,
  validateSaleAgainstStock,
  validateSaleDetailsInput,
  validateSaleInput,
  type SaleInput,
} from "./index";

const saleInput: SaleInput = {
  channel: "Direct",
  discountsFees: 2.5,
  finishedGoodId: 4,
  grossRevenue: 45,
  notes: "",
  productReference: "Articulated Dragon",
  quantity: 3,
  saleDate: "2026-07-02",
  saleUnit: "piece",
};

describe("sales totals", () => {
  it("calculates net revenue and average unit price after discounts and fees", () => {
    expect(calculateSaleTotals(saleInput)).toEqual({
      averageUnitPrice: 14.17,
      discountsFees: 2.5,
      grossRevenue: 45,
      netRevenue: 42.5,
    });
  });

  it("filters sales by sale date while preserving the lifetime view", () => {
    const sales = [
      { channel: "Sincerely" as const, saleDate: "2026-07-31" },
      { channel: "Sincerely" as const, saleDate: "2026-08-01" },
      { channel: "Flora" as const, saleDate: "2026-08-15" },
    ];

    expect(filterSalesByPeriod(sales, "lifetime", "2026-08")).toBe(sales);
    expect(filterSalesByPeriod(sales, "monthly", "2026-08")).toEqual([
      sales[1],
      sales[2],
    ]);
    expect(
      filterSalesByPeriod(sales, "monthly", "2026-08")
        .filter((sale) => sale.channel === "Sincerely"),
    ).toEqual([sales[1]]);
    expect(filterSalesByPeriod(sales, "monthly", "2030-01")).toEqual([]);
    expect(filterSalesByPeriod(sales, "monthly", "invalid")).toEqual([]);
  });

  it("does not produce a unit price for zero quantity", () => {
    expect(calculateSaleTotals({ discountsFees: 0, grossRevenue: 10, quantity: 0 }).averageUnitPrice).toBe(0);
  });

  it("summarizes net sales, orders, and units for every configured channel", () => {
    expect(getSalesChannelSummaries([
      { channel: "Sincerely", netRevenue: 120, quantity: 1 },
      { channel: "Sincerely", netRevenue: 275.5, quantity: 3 },
      { channel: "Dear Reader", netRevenue: 80, quantity: 2 },
    ])).toEqual([
      { channel: "Direct", netRevenue: 0, orderCount: 0, unitsSold: 0 },
      { channel: "Sincerely", netRevenue: 395.5, orderCount: 2, unitsSold: 4 },
      { channel: "Dear Reader", netRevenue: 80, orderCount: 1, unitsSold: 2 },
      { channel: "Flora", netRevenue: 0, orderCount: 0, unitsSold: 0 },
      { channel: "Stomping", netRevenue: 0, orderCount: 0, unitsSold: 0 },
    ]);
  });
});

describe("sales validation", () => {
  it("accepts a valid sale input", () => {
    expect(validateSaleInput(saleInput)).toEqual({
      errors: {},
      valid: true,
    });

    expect(validateSaleInput({ ...saleInput, channel: "Stomping" })).toEqual({
      errors: {},
      valid: true,
    });
  });

  it("rejects invalid sale units and channels", () => {
    const validation = validateSaleInput({
      ...saleInput,
      channel: "Marketplace" as SaleInput["channel"],
      saleUnit: "crate" as SaleInput["saleUnit"],
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.channel).toBe("Choose a valid sales channel.");
    expect(validation.errors.saleUnit).toBe("Choose a valid sale unit.");
  });

  it("rejects discounts and fees above gross revenue", () => {
    const validation = validateSaleInput({
      ...saleInput,
      discountsFees: 50,
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.discountsFees).toBe("Discounts and fees cannot exceed gross revenue.");
  });

  it("validates editable sale details without requiring stock fields", () => {
    expect(validateSaleDetailsInput({
      channel: "Stomping",
      discountsFees: 10,
      grossRevenue: 150,
      notes: "Corrected price",
      saleDate: "2026-07-13",
    })).toEqual({ errors: {}, valid: true });

    expect(validateSaleDetailsInput({
      channel: "Flora",
      discountsFees: 160,
      grossRevenue: 150,
      notes: "",
      saleDate: "2026-07-13",
    }).errors.discountsFees).toBe("Discounts and fees cannot exceed gross revenue.");
  });
});

describe("sales stock validation", () => {
  it("reports finished goods availability for sale quantity", () => {
    expect(getSaleStockStatus({ quantityReady: 5, quantityReserved: 1 }, 3)).toBe("available");
    expect(getSaleStockStatus({ quantityReady: 5, quantityReserved: 1 }, 7)).toBe("insufficient");
    expect(getSaleStockStatus({ quantityReady: 1, quantityReserved: 1 }, 1)).toBe("out");
  });

  it("allows insufficient stock and reports the automatic reconciliation", () => {
    expect(
      validateSaleAgainstStock(
        { quantity: 8, saleUnit: "piece" },
        { quantityReady: 5, quantityReserved: 1, saleUnit: "piece" },
      ),
    ).toBeNull();
    expect(
      getSaleStockReconciliationQuantity(
        { quantity: 8 },
        { quantityReady: 5, quantityReserved: 1 },
      ),
    ).toBe(4);
    expect(
      getSaleStockWarning(
        { quantity: 8 },
        { quantityReady: 5, quantityReserved: 1 },
      ),
    ).toContain("4 missing finished-good units");
  });

  it("blocks sale unit mismatch", () => {
    expect(
      validateSaleAgainstStock(
        { quantity: 1, saleUnit: "set" },
        { quantityReady: 5, quantityReserved: 0, saleUnit: "piece" },
      ),
    ).toBe("Sale unit does not match the finished goods stock unit.");
  });
});
