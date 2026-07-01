import { describe, expect, it } from "vitest";

import {
  formatFinishedGoodsQuantity,
  formatFinishedGoodsQuantityDelta,
  getAvailableFinishedGoodsQuantity,
  getFinishedGoodQuantityStatus,
  isFinishedGoodSaleUnit,
  validateFinishedGoodInput,
  validateFinishedGoodStockAdjustmentInput,
  type FinishedGoodInput,
} from "./finishedGoods";

const validInput: FinishedGoodInput = {
  notes: "",
  productReference: "Dragon Egg - Small",
  quantityReady: 8,
  quantityReserved: 2,
  saleUnit: "piece",
};

describe("finished goods inventory helpers", () => {
  it("validates supported sale units", () => {
    expect(isFinishedGoodSaleUnit("piece")).toBe(true);
    expect(isFinishedGoodSaleUnit("set")).toBe(true);
    expect(isFinishedGoodSaleUnit("crate")).toBe(false);
  });

  it("formats finished goods quantities with sale units", () => {
    expect(formatFinishedGoodsQuantity(1, "piece")).toBe("1 piece");
    expect(formatFinishedGoodsQuantity(4, "piece")).toBe("4 pieces");
    expect(formatFinishedGoodsQuantity(2, "set")).toBe("2 sets");
    expect(formatFinishedGoodsQuantity(Number.NaN, "piece")).toBe("--");
    expect(formatFinishedGoodsQuantityDelta(2, "piece")).toBe("+2 pieces");
    expect(formatFinishedGoodsQuantityDelta(-1, "set")).toBe("-1 set");
  });

  it("classifies home-stock quantity status", () => {
    expect(getAvailableFinishedGoodsQuantity({ quantityReady: 8, quantityReserved: 2 })).toBe(6);
    expect(getFinishedGoodQuantityStatus({ quantityReady: 8, quantityReserved: 2 })).toBe("ready");
    expect(getFinishedGoodQuantityStatus({ quantityReady: 2, quantityReserved: 0 })).toBe("low");
    expect(getFinishedGoodQuantityStatus({ quantityReady: 4, quantityReserved: 4 })).toBe("reserved");
    expect(getFinishedGoodQuantityStatus({ quantityReady: 0, quantityReserved: 0 })).toBe("out");
  });

  it("validates required product reference and quantity bounds", () => {
    expect(validateFinishedGoodInput(validInput).valid).toBe(true);

    const result = validateFinishedGoodInput({
      ...validInput,
      productReference: "",
      quantityReady: 1,
      quantityReserved: 2,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.productReference).toBeDefined();
    expect(result.errors.quantityReserved).toBeDefined();
  });

  it("validates manual stock adjustment input", () => {
    expect(
      validateFinishedGoodStockAdjustmentInput({
        notes: "",
        quantityDelta: 3,
        reason: "manual count",
      }).valid,
    ).toBe(true);

    const result = validateFinishedGoodStockAdjustmentInput({
      notes: "",
      quantityDelta: 0,
      reason: "",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.quantityDelta).toBeDefined();
    expect(result.errors.reason).toBeDefined();
  });
});
