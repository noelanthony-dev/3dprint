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
import { isFinishedGoodSaleUnit } from "@/domain/inventory";

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

      const [product, profile, filament] = await Promise.all([
        dependencies.products.get(input.productId),
        dependencies.printProfiles.get(input.printProfileId),
        dependencies.filaments.get(input.filamentId),
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

      if (!filament) {
        throw new Error(`Filament ${input.filamentId} does not exist.`);
      }

      const deductionPlan = calculateProductionDeductionPlan(profile, input);
      const filamentBefore = filament.estimatedGramsLeft;

      if (deductionPlan.filamentGramsToDeduct > filamentBefore) {
        throw new Error("Selected filament does not have enough estimated grams for this run.");
      }

      const updatedFilament =
        deductionPlan.filamentGramsToDeduct > 0
          ? await dependencies.filaments.adjustStock(input.filamentId, {
              gramsDelta: -deductionPlan.filamentGramsToDeduct,
              notes: productionAdjustmentNote(input),
              reason: "production run deduction",
            })
          : filament;

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
        filamentDeduction: {
          filamentId: input.filamentId,
          gramsAfter: updatedFilament.estimatedGramsLeft,
          gramsBefore: filamentBefore,
          gramsDeducted: deductionPlan.filamentGramsToDeduct,
        },
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
