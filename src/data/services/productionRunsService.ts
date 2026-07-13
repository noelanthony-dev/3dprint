import {
  addOnsRepository,
  filamentRepository,
  finishedGoodsRepository,
  printProfilesRepository,
  productionRunsRepository,
  productsRepository,
  type AddOnsRepository,
  type FilamentRepository,
  type FinishedGoodsRepository,
  type PrintProfilesRepository,
  type ProductionRunsRepository,
  type ProductsRepository,
} from "@/data/repositories";
import {
  calculateProductionDeductionPlan,
  validateProductionRunInput,
  type ProductionDeductionPlan,
  type ProductionRunInput,
  type ProductionRunRecord,
} from "@/domain/production";
import { isFinishedGoodSaleUnit, type FilamentRecord } from "@/domain/inventory";
import { invoke } from "@tauri-apps/api/core";

export interface LoggedProductionRun {
  readonly deductionPlan: ProductionDeductionPlan;
  readonly run: ProductionRunRecord;
}

export interface ProductionRunsService {
  logProductionRun(input: ProductionRunInput): Promise<LoggedProductionRun>;
}

interface ProductionRunsServiceDependencies {
  readonly addOns: AddOnsRepository;
  readonly filaments: FilamentRepository;
  readonly finishedGoods: FinishedGoodsRepository;
  readonly printProfiles: PrintProfilesRepository;
  readonly productionRuns: ProductionRunsRepository;
  readonly products: ProductsRepository;
  readonly atomicRecorder: AtomicProductionRecorder;
}

interface PreparedFilamentDeduction {
  readonly filamentId: number;
  readonly gramsAfter: number;
  readonly gramsBefore: number;
  readonly gramsDeducted: number;
  readonly notes: string;
}

interface PreparedAddOnDeduction {
  readonly addOnId: number;
  readonly quantityAfter: number;
  readonly quantityBefore: number;
  readonly quantityDeducted: number;
}

interface PreparedFinishedGoodOutput {
  readonly finishedGoodId: number | null;
  readonly productReference: string;
  readonly quantityAfter: number;
  readonly quantityBefore: number;
  readonly saleUnit: string;
}

interface AtomicProductionInput {
  readonly addOnDeductions: readonly PreparedAddOnDeduction[];
  readonly addOnId: number | null;
  readonly addOnQuantityDeducted: number;
  readonly expectedPieces: number;
  readonly failedPieces: number;
  readonly failureReason: string;
  readonly filamentDeductions: readonly PreparedFilamentDeduction[];
  readonly filamentGramsDeducted: number;
  readonly filamentId: number;
  readonly finishedGoodOutput: PreparedFinishedGoodOutput | null;
  readonly goodPieces: number;
  readonly notes: string;
  readonly printProfileId: number;
  readonly productId: number;
  readonly runDate: string;
}

type AtomicProductionRecorder = (input: AtomicProductionInput) => Promise<number>;

const defaultDependencies: ProductionRunsServiceDependencies = {
  addOns: addOnsRepository,
  filaments: filamentRepository,
  finishedGoods: finishedGoodsRepository,
  printProfiles: printProfilesRepository,
  productionRuns: productionRunsRepository,
  products: productsRepository,
  atomicRecorder: recordProductionRunNative,
};

export function createProductionRunsService(
  dependencies: ProductionRunsServiceDependencies = defaultDependencies,
): ProductionRunsService {
  return {
    async logProductionRun(input) {
      const validation = validateProductionRunInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid production run.");
      }

      const [product, profile] = await Promise.all([
        dependencies.products.get(input.productId),
        dependencies.printProfiles.get(input.printProfileId),
      ]);

      if (!product) {
        throw new Error(`Product ${input.productId} does not exist.`);
      }

      if (!profile) {
        throw new Error(`Print profile ${input.printProfileId} does not exist.`);
      }

      if (profile.productId !== product.id) {
        throw new Error("Selected print profile does not belong to the selected product.");
      }

      const deductionPlan = calculateProductionDeductionPlan(profile, input);
      const filamentDeductions = await prepareFilamentDeductions(
        dependencies,
        deductionPlan,
        input,
      );
      const addOnDeductions = await prepareAddOnDeductions(dependencies, deductionPlan);
      const finishedGoodOutput = await prepareFinishedGoodOutput(
        dependencies,
        input,
        product.designName,
        product.saleUnit,
      );
      const runId = await dependencies.atomicRecorder({
        addOnDeductions,
        addOnId: addOnDeductions[0]?.addOnId ?? null,
        addOnQuantityDeducted: totalAddOnQuantity(deductionPlan),
        expectedPieces: input.expectedPieces,
        failedPieces: input.failedPieces,
        failureReason: input.failureReason,
        filamentDeductions,
        filamentGramsDeducted: deductionPlan.filamentGramsToDeduct,
        filamentId: input.filamentId,
        finishedGoodOutput,
        goodPieces: input.goodPieces,
        notes: input.notes,
        printProfileId: input.printProfileId,
        productId: input.productId,
        runDate: input.runDate,
      });
      const run = await dependencies.productionRuns.get(runId);

      if (!run) {
        throw new Error("Inserted production run could not be loaded.");
      }

      return { deductionPlan, run };
    },
  };
}

async function prepareFilamentDeductions(
  dependencies: ProductionRunsServiceDependencies,
  deductionPlan: ProductionDeductionPlan,
  input: ProductionRunInput,
): Promise<PreparedFilamentDeduction[]> {
  const positiveDeductions = deductionPlan.filamentDeductions.filter(
    (deduction) => deduction.gramsToDeduct > 0,
  );
  const uniqueFilamentIds = [...new Set(positiveDeductions.map((deduction) => deduction.filamentId))];
  const filaments = new Map<number, FilamentRecord>();

  await Promise.all(
    uniqueFilamentIds.map(async (filamentId) => {
      const filament = await dependencies.filaments.get(filamentId);

      if (!filament) {
        throw new Error(`Filament ${filamentId} does not exist.`);
      }

      filaments.set(filamentId, filament);
    }),
  );

  const totalByFilament = new Map<number, number>();

  positiveDeductions.forEach((deduction) => {
    totalByFilament.set(
      deduction.filamentId,
      (totalByFilament.get(deduction.filamentId) ?? 0) + deduction.gramsToDeduct,
    );
  });

  totalByFilament.forEach((gramsToDeduct, filamentId) => {
    const filament = filaments.get(filamentId);

    if (!filament || gramsToDeduct > filament.estimatedGramsLeft) {
      throw new Error("Selected filament does not have enough estimated grams for this run.");
    }
  });

  if (positiveDeductions.length === 0) {
    const fallback = await dependencies.filaments.get(input.filamentId);

    if (!fallback) {
      throw new Error(`Filament ${input.filamentId} does not exist.`);
    }

    return [{
      filamentId: input.filamentId,
      gramsAfter: fallback.estimatedGramsLeft,
      gramsBefore: fallback.estimatedGramsLeft,
      gramsDeducted: 0,
      notes: productionAdjustmentNote(input),
    }];
  }

  const remaining = new Map(
    [...filaments.entries()].map(([id, filament]) => [id, filament.estimatedGramsLeft] as const),
  );

  return positiveDeductions.map((deduction) => {
    const gramsBefore = remaining.get(deduction.filamentId) ?? 0;
    const gramsAfter = Math.max(0, gramsBefore - deduction.gramsToDeduct);
    remaining.set(deduction.filamentId, gramsAfter);

    return {
      filamentId: deduction.filamentId,
      gramsAfter,
      gramsBefore,
      gramsDeducted: deduction.gramsToDeduct,
      notes: `${productionAdjustmentNote(input)} ${deduction.requirementLabel}`.trim(),
    };
  });
}

async function prepareAddOnDeductions(
  dependencies: ProductionRunsServiceDependencies,
  deductionPlan: ProductionDeductionPlan,
): Promise<PreparedAddOnDeduction[]> {
  const positiveDeductions = deductionPlan.addOnDeductions.filter(
    (deduction) => deduction.quantityToDeduct > 0,
  );

  return Promise.all(positiveDeductions.map(async (deduction) => {
    const addOn = await dependencies.addOns.get(deduction.addOnId);
    if (!addOn) throw new Error(`Add-on ${deduction.addOnId} does not exist.`);
    if (deduction.quantityToDeduct > addOn.quantityOnHand) {
      throw new Error(`${addOn.itemName} does not have enough quantity for this run.`);
    }
    return {
      addOnId: deduction.addOnId,
      quantityAfter: addOn.quantityOnHand - deduction.quantityToDeduct,
      quantityBefore: addOn.quantityOnHand,
      quantityDeducted: deduction.quantityToDeduct,
    };
  }));
}

function totalAddOnQuantity(plan: ProductionDeductionPlan): number {
  return plan.addOnDeductions.reduce((sum, deduction) => sum + deduction.quantityToDeduct, 0);
}

async function prepareFinishedGoodOutput(
  dependencies: ProductionRunsServiceDependencies,
  input: ProductionRunInput,
  productReference: string,
  saleUnit: string,
): Promise<PreparedFinishedGoodOutput | null> {
  if (input.goodPieces <= 0) {
    return null;
  }

  if (!isFinishedGoodSaleUnit(saleUnit)) {
    throw new Error("Product sale unit cannot be tracked in finished goods.");
  }

  const existing = (await dependencies.finishedGoods.list()).find(
    (item) => item.productReference === productReference && item.saleUnit === saleUnit,
  );
  const quantityBefore = existing?.quantityReady ?? 0;

  return {
    finishedGoodId: existing?.id ?? null,
    productReference,
    quantityAfter: quantityBefore + input.goodPieces,
    quantityBefore,
    saleUnit,
  };
}

async function recordProductionRunNative(input: AtomicProductionInput): Promise<number> {
  const result = await invoke<{ readonly runId: number }>("record_production_run", { input });
  return result.runId;
}

function productionAdjustmentNote(input: ProductionRunInput): string {
  const failureText = input.failedPieces > 0 ? `, ${input.failedPieces} failed` : "";

  return `Run ${input.runDate}: ${input.goodPieces} good${failureText}. ${input.notes}`.trim();
}

export const productionRunsService = createProductionRunsService();
