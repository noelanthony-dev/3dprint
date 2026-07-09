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
}

const defaultDependencies: ProductionRunsServiceDependencies = {
  addOns: addOnsRepository,
  filaments: filamentRepository,
  finishedGoods: finishedGoodsRepository,
  printProfiles: printProfilesRepository,
  productionRuns: productionRunsRepository,
  products: productsRepository,
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
      const filamentDeductions = await applyFilamentDeductions(
        dependencies,
        deductionPlan,
        input,
      );

      let addOnBefore = 0;
      let addOnAfter = 0;

      if (input.addOnId != null && deductionPlan.addOnQuantityToDeduct > 0) {
        const addOn = await dependencies.addOns.get(input.addOnId);

        if (!addOn) {
          throw new Error(`Add-on ${input.addOnId} does not exist.`);
        }

        addOnBefore = addOn.quantityOnHand;

        if (deductionPlan.addOnQuantityToDeduct > addOnBefore) {
          throw new Error("Selected add-on does not have enough quantity for this run.");
        }

        const updatedAddOn = await dependencies.addOns.adjustStock(input.addOnId, {
          notes: productionAdjustmentNote(input),
          quantityDelta: -deductionPlan.addOnQuantityToDeduct,
          reason: "production run deduction",
        });

        addOnAfter = updatedAddOn.quantityOnHand;
      }

      const finishedGoodId = await addGoodPiecesToFinishedGoods(
        dependencies,
        input,
        product.designName,
        product.saleUnit,
      );

      const run = await dependencies.productionRuns.create({
        ...input,
        addOnDeduction:
          input.addOnId != null && deductionPlan.addOnQuantityToDeduct > 0
            ? {
                addOnId: input.addOnId,
                quantityAfter: addOnAfter,
                quantityBefore: addOnBefore,
                quantityDeducted: deductionPlan.addOnQuantityToDeduct,
              }
            : null,
        addOnQuantityDeducted: deductionPlan.addOnQuantityToDeduct,
        filamentDeductions,
        filamentGramsDeducted: deductionPlan.filamentGramsToDeduct,
        finishedGoodId,
      });

      return {
        deductionPlan,
        run,
      };
    },
  };
}

async function applyFilamentDeductions(
  dependencies: ProductionRunsServiceDependencies,
  deductionPlan: ProductionDeductionPlan,
  input: ProductionRunInput,
) {
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

  const runningGramsByFilament = new Map(
    [...filaments.entries()].map(([filamentId, filament]) => [
      filamentId,
      filament.estimatedGramsLeft,
    ] as const),
  );
  const persistedDeductions = [];

  for (const deduction of positiveDeductions) {
    const gramsBefore = runningGramsByFilament.get(deduction.filamentId) ?? 0;
    const updatedFilament = await dependencies.filaments.adjustStock(deduction.filamentId, {
      gramsDelta: -deduction.gramsToDeduct,
      notes: `${productionAdjustmentNote(input)} ${deduction.requirementLabel}`.trim(),
      reason: "production run deduction",
    });

    runningGramsByFilament.set(deduction.filamentId, updatedFilament.estimatedGramsLeft);
    persistedDeductions.push({
      filamentId: deduction.filamentId,
      gramsAfter: updatedFilament.estimatedGramsLeft,
      gramsBefore,
      gramsDeducted: deduction.gramsToDeduct,
    });
  }

  if (persistedDeductions.length > 0) {
    return persistedDeductions;
  }

  const fallbackFilament = await dependencies.filaments.get(input.filamentId);

  if (!fallbackFilament) {
    throw new Error(`Filament ${input.filamentId} does not exist.`);
  }

  return [
    {
      filamentId: input.filamentId,
      gramsAfter: fallbackFilament.estimatedGramsLeft,
      gramsBefore: fallbackFilament.estimatedGramsLeft,
      gramsDeducted: 0,
    },
  ];
}

async function addGoodPiecesToFinishedGoods(
  dependencies: ProductionRunsServiceDependencies,
  input: ProductionRunInput,
  productReference: string,
  saleUnit: string,
): Promise<number | null> {
  if (input.goodPieces <= 0) {
    return null;
  }

  if (!isFinishedGoodSaleUnit(saleUnit)) {
    throw new Error("Product sale unit cannot be tracked in finished goods.");
  }

  const finishedGoods = await dependencies.finishedGoods.list();
  const existing = finishedGoods.find(
    (item) => item.productReference === productReference && item.saleUnit === saleUnit,
  );

  if (existing) {
    await dependencies.finishedGoods.adjustStock(existing.id, {
      notes: productionAdjustmentNote(input),
      quantityDelta: input.goodPieces,
      reason: "production run output",
    });

    return existing.id;
  }

  const created = await dependencies.finishedGoods.create({
    notes: "Created by production run logging.",
    productReference,
    quantityReady: 0,
    quantityReserved: 0,
    saleUnit,
  });

  await dependencies.finishedGoods.adjustStock(created.id, {
    notes: productionAdjustmentNote(input),
    quantityDelta: input.goodPieces,
    reason: "production run output",
  });

  return created.id;
}

function productionAdjustmentNote(input: ProductionRunInput): string {
  const failureText = input.failedPieces > 0 ? `, ${input.failedPieces} failed` : "";

  return `Run ${input.runDate}: ${input.goodPieces} good${failureText}. ${input.notes}`.trim();
}

export const productionRunsService = createProductionRunsService();
