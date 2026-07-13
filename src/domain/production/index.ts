import type { PrintProfileRecord } from "@/domain/costing";
import { createScaffoldModuleStatus } from "@/domain/shared";

export interface ProductionFilamentSelectionInput {
  readonly filamentId: number;
  readonly requirementLabel: string;
  readonly requiredGrams: number;
}

export interface ProductionRunInput {
  readonly addOns: readonly ProductionAddOnSelectionInput[];
  readonly expectedPieces: number;
  readonly failedPieces: number;
  readonly failureReason: string;
  readonly filamentId: number;
  readonly filamentSelections: readonly ProductionFilamentSelectionInput[];
  readonly goodPieces: number;
  readonly notes: string;
  readonly printProfileId: number;
  readonly productId: number;
  readonly runDate: string;
}

export interface ProductionAddOnSelectionInput {
  readonly addOnId: number;
  readonly quantity: number;
}

export interface ProductionRunRecord {
  readonly addOnDeductions: readonly ProductionAddOnDeductionRecord[];
  readonly addOnQuantityDeducted: number;
  readonly createdAt: string;
  readonly expectedPieces: number;
  readonly failedPieces: number;
  readonly failureReason: string;
  readonly filamentGramsDeducted: number;
  readonly filamentId: number;
  readonly finishedGoodId: number | null;
  readonly goodPieces: number;
  readonly id: number;
  readonly notes: string;
  readonly printProfileId: number;
  readonly productId: number;
  readonly runDate: string;
  readonly updatedAt: string;
}

export interface ProductionFilamentDeductionRecord {
  readonly createdAt: string;
  readonly filamentId: number;
  readonly gramsAfter: number;
  readonly gramsBefore: number;
  readonly gramsDeducted: number;
  readonly id: number;
  readonly productionRunId: number;
}

export interface ProductionAddOnDeductionRecord {
  readonly addOnId: number;
  readonly createdAt: string;
  readonly id: number;
  readonly productionRunId: number;
  readonly quantityAfter: number;
  readonly quantityBefore: number;
  readonly quantityDeducted: number;
}

export interface ProductionRunValidationResult {
  readonly errors: Partial<Record<keyof ProductionRunInput, string>>;
  readonly valid: boolean;
}

export interface ProductionDeductionPlan {
  readonly addOnDeductions: readonly ProductionAddOnDeductionPlan[];
  readonly attemptedPieces: number;
  readonly expectedPieces: number;
  readonly failedPieces: number;
  readonly filamentDeductions: readonly ProductionFilamentDeductionPlan[];
  readonly failureRate: number;
  readonly filamentGramsToDeduct: number;
  readonly finishedGoodsQuantityToAdd: number;
  readonly goodPieces: number;
  readonly profileAttemptedPieces: number;
  readonly scaleFactor: number;
  readonly warnings: readonly string[];
}

export interface ProductionAddOnDeductionPlan {
  readonly addOnId: number;
  readonly quantityToDeduct: number;
}

export interface ProductionFilamentDeductionPlan {
  readonly filamentId: number;
  readonly gramsToDeduct: number;
  readonly requiredGrams: number;
  readonly requirementLabel: string;
}

export function validateProductionRunInput(
  input: ProductionRunInput,
): ProductionRunValidationResult {
  const errors: Partial<Record<keyof ProductionRunInput, string>> = {};

  validatePositiveInteger(input.productId, errors, "productId", "Choose a product.");
  validatePositiveInteger(
    input.printProfileId,
    errors,
    "printProfileId",
    "Choose a print profile.",
  );
  validatePositiveInteger(input.filamentId, errors, "filamentId", "Choose a filament spool.");

  input.filamentSelections.forEach((selection, index) => {
    if (!Number.isInteger(selection.filamentId) || selection.filamentId <= 0) {
      errors.filamentId = `Choose inventory stock for filament requirement ${index + 1}.`;
      return;
    }

    if (!Number.isFinite(selection.requiredGrams) || selection.requiredGrams < 0) {
      errors.filamentId = `Filament requirement ${index + 1} grams cannot be negative.`;
    }
  });

  const addOnIds = new Set<number>();
  input.addOns.forEach((addOn, index) => {
    if (!Number.isInteger(addOn.addOnId) || addOn.addOnId <= 0) {
      errors.addOns = `Choose a valid item for add-on ${index + 1}.`;
      return;
    }
    if (addOnIds.has(addOn.addOnId)) {
      errors.addOns = "Each add-on item can only be selected once.";
      return;
    }
    addOnIds.add(addOn.addOnId);
    if (!Number.isFinite(addOn.quantity) || addOn.quantity < 0) {
      errors.addOns = `Add-on ${index + 1} quantity cannot be negative.`;
    }
  });

  validatePositiveInteger(
    input.expectedPieces,
    errors,
    "expectedPieces",
    "Expected pieces must be at least 1.",
  );
  validateNonNegativeInteger(
    input.goodPieces,
    errors,
    "goodPieces",
    "Good pieces cannot be negative.",
  );
  validateNonNegativeInteger(
    input.failedPieces,
    errors,
    "failedPieces",
    "Failed pieces cannot be negative.",
  );

  if (input.goodPieces + input.failedPieces <= 0) {
    errors.goodPieces = "Log at least one good or failed piece.";
  }

  if (!input.runDate.trim()) {
    errors.runDate = "Run date is required.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function calculateProductionDeductionPlan(
  profile: Pick<
    PrintProfileRecord,
    "expectedFailedUnits" | "expectedGoodUnits" | "filamentGrams" | "supportGrams"
  >,
  input: Pick<
    ProductionRunInput,
    | "addOns"
    | "expectedPieces"
    | "failedPieces"
    | "filamentId"
    | "filamentSelections"
    | "failureReason"
    | "goodPieces"
  >,
): ProductionDeductionPlan {
  const attemptedPieces = Math.max(0, input.goodPieces + input.failedPieces);
  const profileAttemptedPieces = Math.max(1, profile.expectedGoodUnits + profile.expectedFailedUnits);
  const scaleFactor = attemptedPieces > 0 ? attemptedPieces / profileAttemptedPieces : 0;
  const totalProfileFilamentGrams = Math.max(0, profile.filamentGrams + profile.supportGrams);
  const filamentDeductions =
    input.filamentSelections.length > 0
      ? input.filamentSelections.map((selection) => ({
          filamentId: selection.filamentId,
          gramsToDeduct: roundProductionQuantity(Math.max(0, selection.requiredGrams) * attemptedPieces),
          requiredGrams: roundProductionQuantity(Math.max(0, selection.requiredGrams)),
          requirementLabel: selection.requirementLabel.trim() || "Filament",
        }))
      : [
          {
            filamentId: input.filamentId,
            gramsToDeduct: roundProductionQuantity(totalProfileFilamentGrams * scaleFactor),
            requiredGrams: roundProductionQuantity(totalProfileFilamentGrams),
            requirementLabel: "Filament",
          },
        ];
  const filamentGramsToDeduct = roundProductionQuantity(
    filamentDeductions.reduce((sum, deduction) => sum + deduction.gramsToDeduct, 0),
  );
  const warnings: string[] = [];

  if (attemptedPieces > input.expectedPieces) {
    warnings.push("Actual pieces exceed the expected run quantity.");
  }

  if (input.failedPieces > 0 && !input.failureReason.trim()) {
    warnings.push("Failures were logged without a failure reason.");
  }

  return {
    addOnDeductions: input.addOns.map((addOn) => ({
      addOnId: addOn.addOnId,
      quantityToDeduct: roundProductionQuantity(Math.max(0, addOn.quantity)),
    })),
    attemptedPieces,
    expectedPieces: input.expectedPieces,
    failedPieces: input.failedPieces,
    filamentDeductions,
    failureRate: attemptedPieces > 0 ? input.failedPieces / attemptedPieces : 0,
    filamentGramsToDeduct,
    finishedGoodsQuantityToAdd: Math.max(0, input.goodPieces),
    goodPieces: input.goodPieces,
    profileAttemptedPieces,
    scaleFactor,
    warnings,
  };
}

export function roundProductionQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validatePositiveInteger<K extends keyof ProductionRunInput>(
  value: number,
  errors: Partial<Record<keyof ProductionRunInput, string>>,
  key: K,
  message: string,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    errors[key] = message;
  }
}

function validateNonNegativeInteger<K extends keyof ProductionRunInput>(
  value: number,
  errors: Partial<Record<keyof ProductionRunInput, string>>,
  key: K,
  message: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    errors[key] = message;
  }
}

export const productionDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "production",
  notes: ["Pure production run validation and inventory deduction estimates."],
});
