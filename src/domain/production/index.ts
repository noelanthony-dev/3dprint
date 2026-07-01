import type { PrintProfileRecord } from "@/domain/costing";
import { createScaffoldModuleStatus } from "@/domain/shared";

export interface ProductionRunInput {
  readonly addOnId: number | null;
  readonly addOnQuantity: number;
  readonly expectedPieces: number;
  readonly failedPieces: number;
  readonly failureReason: string;
  readonly filamentId: number;
  readonly goodPieces: number;
  readonly notes: string;
  readonly printProfileId: number;
  readonly productId: number;
  readonly runDate: string;
}

export interface ProductionRunRecord {
  readonly addOnId: number | null;
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
  readonly addOnQuantityToDeduct: number;
  readonly attemptedPieces: number;
  readonly expectedPieces: number;
  readonly failedPieces: number;
  readonly failureRate: number;
  readonly filamentGramsToDeduct: number;
  readonly finishedGoodsQuantityToAdd: number;
  readonly goodPieces: number;
  readonly profileAttemptedPieces: number;
  readonly scaleFactor: number;
  readonly warnings: readonly string[];
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

  if (input.addOnId != null && (!Number.isInteger(input.addOnId) || input.addOnId <= 0)) {
    errors.addOnId = "Choose a valid add-on item.";
  }

  if (!Number.isFinite(input.addOnQuantity) || input.addOnQuantity < 0) {
    errors.addOnQuantity = "Add-on quantity cannot be negative.";
  }

  if (input.addOnQuantity > 0 && input.addOnId == null) {
    errors.addOnId = "Choose an add-on item before deducting add-on quantity.";
  }

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
    "addOnQuantity" | "expectedPieces" | "failedPieces" | "failureReason" | "goodPieces"
  >,
): ProductionDeductionPlan {
  const attemptedPieces = Math.max(0, input.goodPieces + input.failedPieces);
  const profileAttemptedPieces = Math.max(1, profile.expectedGoodUnits + profile.expectedFailedUnits);
  const scaleFactor = attemptedPieces > 0 ? attemptedPieces / profileAttemptedPieces : 0;
  const totalProfileFilamentGrams = Math.max(0, profile.filamentGrams + profile.supportGrams);
  const filamentGramsToDeduct = roundProductionQuantity(totalProfileFilamentGrams * scaleFactor);
  const warnings: string[] = [];

  if (attemptedPieces > input.expectedPieces) {
    warnings.push("Actual pieces exceed the expected run quantity.");
  }

  if (input.failedPieces > 0 && !input.failureReason.trim()) {
    warnings.push("Failures were logged without a failure reason.");
  }

  return {
    addOnQuantityToDeduct: roundProductionQuantity(Math.max(0, input.addOnQuantity)),
    attemptedPieces,
    expectedPieces: input.expectedPieces,
    failedPieces: input.failedPieces,
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
