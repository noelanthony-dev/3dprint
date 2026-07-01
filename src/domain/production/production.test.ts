import { describe, expect, it } from "vitest";

import {
  calculateProductionDeductionPlan,
  validateProductionRunInput,
  type ProductionRunInput,
} from "./index";

const baseRun: ProductionRunInput = {
  addOnId: null,
  addOnQuantity: 0,
  expectedPieces: 10,
  failedPieces: 1,
  failureReason: "Layer shift",
  filamentId: 9,
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

  it("requires a selected add-on when add-on quantity is deducted", () => {
    const validation = validateProductionRunInput({
      ...baseRun,
      addOnQuantity: 6,
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.addOnId).toBe("Choose an add-on item before deducting add-on quantity.");
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
});
