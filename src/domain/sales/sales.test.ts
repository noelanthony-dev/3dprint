import { describe, expect, it } from "vitest";

import {
  calculateSaleTotals,
  getSaleStockStatus,
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

  it("does not produce a unit price for zero quantity", () => {
    expect(calculateSaleTotals({ discountsFees: 0, grossRevenue: 10, quantity: 0 }).averageUnitPrice).toBe(0);
  });
});

describe("sales validation", () => {
  it("accepts a valid sale input", () => {
    expect(validateSaleInput(saleInput)).toEqual({
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
      channel: "Flora",
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
    expect(getSaleStockStatus({ quantityReady: 5 }, 3)).toBe("available");
    expect(getSaleStockStatus({ quantityReady: 5 }, 7)).toBe("insufficient");
    expect(getSaleStockStatus({ quantityReady: 0 }, 1)).toBe("out");
  });

  it("blocks sale quantity that exceeds stock", () => {
    expect(
      validateSaleAgainstStock(
        { quantity: 8, saleUnit: "piece" },
        { quantityReady: 5, saleUnit: "piece" },
      ),
    ).toBe("Finished goods stock is too low for this sale quantity.");
  });

  it("blocks sale unit mismatch", () => {
    expect(
      validateSaleAgainstStock(
        { quantity: 1, saleUnit: "set" },
        { quantityReady: 5, saleUnit: "piece" },
      ),
    ).toBe("Sale unit does not match the finished goods stock unit.");
  });
});
