import {
  finishedGoodsRepository,
  salesRepository,
  type FinishedGoodsRepository,
  type SalesRepository,
} from "@/data/repositories";
import {
  calculateSaleTotals,
  validateSaleAgainstStock,
  validateSaleInput,
  type SaleInput,
  type SaleRecord,
  type SaleTotals,
} from "@/domain/sales";

export interface RecordedSale {
  readonly sale: SaleRecord;
  readonly totals: SaleTotals;
}

export interface SalesService {
  recordSale(input: SaleInput): Promise<RecordedSale>;
}

interface SalesServiceDependencies {
  readonly finishedGoods: FinishedGoodsRepository;
  readonly sales: SalesRepository;
}

const defaultDependencies: SalesServiceDependencies = {
  finishedGoods: finishedGoodsRepository,
  sales: salesRepository,
};

export function createSalesService(
  dependencies: SalesServiceDependencies = defaultDependencies,
): SalesService {
  return {
    async recordSale(input) {
      const validation = validateSaleInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid sale.");
      }

      const finishedGood = await dependencies.finishedGoods.get(input.finishedGoodId);

      if (!finishedGood) {
        throw new Error(`Finished good ${input.finishedGoodId} does not exist.`);
      }

      const stockError = validateSaleAgainstStock(input, finishedGood);

      if (stockError) {
        throw new Error(stockError);
      }

      const stockQuantityBefore = finishedGood.quantityReady;
      const updatedStock = await dependencies.finishedGoods.adjustStock(finishedGood.id, {
        notes: saleAdjustmentNote(input),
        quantityDelta: -input.quantity,
        reason: "sale",
      });
      const totals = calculateSaleTotals(input);
      const sale = await dependencies.sales.create({
        ...input,
        productReference: finishedGood.productReference,
        saleUnit: finishedGood.saleUnit,
        stockQuantityAfter: updatedStock.quantityReady,
        stockQuantityBefore,
      });

      return {
        sale,
        totals,
      };
    },
  };
}

function saleAdjustmentNote(input: SaleInput): string {
  return `Sale ${input.saleDate}: ${input.quantity} ${input.saleUnit} via ${input.channel}. ${input.notes}`.trim();
}

export const salesService = createSalesService();
