import { describe, expect, it } from "vitest";

import {
  calculateProductionDeductionPlan,
  validateProductionRunInput,
  type ProductionRunInput,
} from "./index";

const baseRun: ProductionRunInput = {
  addOns: [],
  expectedPieces: 10,
  failedPieces: 1,
  failureReason: "Layer shift",
  filamentId: 9,
  filamentSelections: [],
  goodPieces: 9,
  notes: "",
  printProfileId: 4,
  productId: 2,
  runDate: "2026-07-02",
};

const profile = {
  expectedFailedUnits: 1,
  expectedGoodUnits: 9,
  filamentGrams: 450,
  supportGrams: 50,
};

describe("production run validation", () => {
  it("accepts a valid run with failed pieces and an optional reason", () => {
    expect(validateProductionRunInput(baseRun)).toEqual({
      errors: {},
      valid: true,
    });
  });

  it("rejects invalid and duplicate add-on selections", () => {
    const validation = validateProductionRunInput({
      ...baseRun,
      addOns: [{ addOnId: 0, quantity: 6 }],
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.addOns).toBe("Choose a valid item for add-on 1.");
  });

  it("requires at least one attempted piece", () => {
    const validation = validateProductionRunInput({
      ...baseRun,
      failedPieces: 0,
      goodPieces: 0,
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.goodPieces).toBe("Log at least one good or failed piece.");
  });
});

describe("production deduction plan", () => {
  it("deducts material for good and failed pieces while adding only good pieces to stock", () => {
    const plan = calculateProductionDeductionPlan(profile, baseRun);

    expect(plan.attemptedPieces).toBe(10);
    expect(plan.filamentGramsToDeduct).toBe(500);
    expect(plan.filamentDeductions).toEqual([
      {
        filamentId: 9,
        gramsToDeduct: 500,
        requiredGrams: 500,
        requirementLabel: "Filament",
      },
    ]);
    expect(plan.finishedGoodsQuantityToAdd).toBe(9);
    expect(plan.failureRate).toBe(0.1);
  });

  it("scales profile estimates when the actual run quantity changes", () => {
    const plan = calculateProductionDeductionPlan(profile, {
      ...baseRun,
      expectedPieces: 5,
      failedPieces: 1,
      goodPieces: 4,
    });

    expect(plan.scaleFactor).toBe(0.5);
    expect(plan.filamentGramsToDeduct).toBe(250);
    expect(plan.finishedGoodsQuantityToAdd).toBe(4);
  });

  it("warns when failed pieces have no reason but keeps the run loggable", () => {
    const plan = calculateProductionDeductionPlan(profile, {
      ...baseRun,
      failureReason: "",
    });

    expect(plan.warnings).toContain("Failures were logged without a failure reason.");
  });

  it("plans every configured add-on deduction", () => {
    const plan = calculateProductionDeductionPlan(profile, {
      ...baseRun,
      addOns: [{ addOnId: 3, quantity: 9 }, { addOnId: 4, quantity: 9 }],
    });
    expect(plan.addOnDeductions).toEqual([
      { addOnId: 3, quantityToDeduct: 9 },
      { addOnId: 4, quantityToDeduct: 9 },
    ]);
  });

  it("deducts each selected filament requirement independently", () => {
    const plan = calculateProductionDeductionPlan(
      {
        expectedFailedUnits: 0,
        expectedGoodUnits: 2,
        filamentGrams: 26,
        supportGrams: 0,
      },
      {
        ...baseRun,
        expectedPieces: 1,
        failedPieces: 0,
        filamentSelections: [
          { filamentId: 2, requiredGrams: 9, requirementLabel: "Black PLA" },
          { filamentId: 3, requiredGrams: 3, requirementLabel: "White PLA" },
          { filamentId: 4, requiredGrams: 1, requirementLabel: "Red PLA" },
        ],
        goodPieces: 1,
      },
    );

    expect(plan.filamentGramsToDeduct).toBe(13);
    expect(plan.filamentDeductions).toEqual([
      { filamentId: 2, gramsToDeduct: 9, requiredGrams: 9, requirementLabel: "Black PLA" },
      { filamentId: 3, gramsToDeduct: 3, requiredGrams: 3, requirementLabel: "White PLA" },
      { filamentId: 4, gramsToDeduct: 1, requiredGrams: 1, requirementLabel: "Red PLA" },
    ]);
  });
});
