import { describe, expect, it } from "vitest";

import { calculatePricing, roundPercent } from "./index";

describe("pricing helpers", () => {
  it("calculates suggested price, margin, and profit per hour", () => {
    const result = calculatePricing({
      costPerUnit: 2.15,
      expectedGoodUnits: 10,
      laborMinutes: 15,
      markupMultiplier: 3,
      printHours: 14.5,
    });

    expect(result.suggestedSellPrice).toBe(6.45);
    expect(result.profitPerUnit).toBe(4.3);
    expect(result.profitPerBatch).toBe(43);
    expect(result.marginPercent).toBe(66.7);
    expect(result.profitPerHour).toBe(2.92);
  });

  it("handles zero price and zero work hours", () => {
    const result = calculatePricing({
      costPerUnit: 0,
      expectedGoodUnits: 10,
      laborMinutes: 0,
      markupMultiplier: 3,
      printHours: 0,
    });

    expect(result.marginPercent).toBe(0);
    expect(result.profitPerHour).toBe(0);
  });

  it("rounds percentages to one decimal place", () => {
    expect(roundPercent(66.666)).toBe(66.7);
    expect(roundPercent(Number.NaN)).toBe(0);
  });
});
