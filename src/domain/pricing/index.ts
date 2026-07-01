import { roundCurrency } from "@/domain/costing";
import { createScaffoldModuleStatus } from "@/domain/shared";

export interface PricingInput {
  readonly costPerUnit: number;
  readonly expectedGoodUnits: number;
  readonly markupMultiplier: number;
  readonly printHours: number;
  readonly laborMinutes: number;
}

export interface PricingResult {
  readonly marginPercent: number;
  readonly profitPerBatch: number;
  readonly profitPerHour: number;
  readonly profitPerUnit: number;
  readonly suggestedSellPrice: number;
}

export function calculatePricing(input: PricingInput): PricingResult {
  const suggestedSellPrice = roundCurrency(input.costPerUnit * input.markupMultiplier);
  const profitPerUnit = roundCurrency(suggestedSellPrice - input.costPerUnit);
  const profitPerBatch = roundCurrency(profitPerUnit * Math.max(0, input.expectedGoodUnits));
  const totalWorkHours = input.printHours + input.laborMinutes / 60;

  return {
    marginPercent:
      suggestedSellPrice > 0
        ? roundPercent((profitPerUnit / suggestedSellPrice) * 100)
        : 0,
    profitPerBatch,
    profitPerHour: totalWorkHours > 0 ? roundCurrency(profitPerBatch / totalWorkHours) : 0,
    profitPerUnit,
    suggestedSellPrice,
  };
}

export function roundPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 10) / 10;
}

export const pricingDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "pricing",
  notes: ["Pure markup, margin, and profit guidance rules."],
});
