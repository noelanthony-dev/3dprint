import { describe, expect, it } from "vitest";

import type {
  FinishedGoodsRepository,
  SaleCreateInput,
  SalesRepository,
} from "@/data/repositories";
import type {
  FinishedGoodRecord,
  FinishedGoodStockAdjustmentInput,
} from "@/domain/inventory";
import type { SaleRecord } from "@/domain/sales";

import { createSalesService } from "./salesService";

const finishedGood: FinishedGoodRecord = {
  createdAt: "2026-07-01T00:00:00.000Z",
  id: 4,
  notes: "",
  productReference: "Articulated Dragon",
  quantityReady: 10,
  quantityReserved: 0,
  saleUnit: "piece",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("sales service", () => {
  it("records sales through the atomic repository path without pre-adjusting stock", async () => {
    let adjustedStock = false;
    let recordedInput: SaleCreateInput | null = null;

    const finishedGoods: FinishedGoodsRepository = {
      adjustStock: async (
        _finishedGoodId: number,
        _input: FinishedGoodStockAdjustmentInput,
      ) => {
        adjustedStock = true;
        throw new Error("adjustStock should not be called before sale insert");
      },
      create: async () => finishedGood,
      get: async () => finishedGood,
      list: async () => [finishedGood],
      listAdjustments: async () => [],
      update: async () => finishedGood,
    };

    const sales: SalesRepository = {
      get: async () => saleRecord,
      list: async () => [saleRecord],
      listStockMovements: async () => [],
      recordSaleWithStockMovement: async (input) => {
        recordedInput = input;
        return {
          ...saleRecord,
          stockQuantityAfter: input.stockQuantityAfter,
          stockQuantityBefore: input.stockQuantityBefore,
        };
      },
      updateDetails: async () => saleRecord,
    };

    const service = createSalesService({ finishedGoods, sales });
    const result = await service.recordSale({
      channel: "Direct",
      discountsFees: 2.5,
      finishedGoodId: finishedGood.id,
      grossRevenue: 45,
      notes: "Cash sale",
      productReference: finishedGood.productReference,
      quantity: 3,
      saleDate: "2026-07-02",
      saleUnit: finishedGood.saleUnit,
    });

    expect(adjustedStock).toBe(false);
    expect(recordedInput).toMatchObject({
      finishedGoodId: 4,
      productReference: "Articulated Dragon",
      quantity: 3,
      saleUnit: "piece",
      stockQuantityAfter: 7,
      stockQuantityBefore: 10,
    });
    expect(result.sale.stockQuantityAfter).toBe(7);
  });
});

const saleRecord: SaleRecord = {
  channel: "Direct",
  createdAt: "2026-07-02T00:00:00.000Z",
  discountsFees: 2.5,
  finishedGoodId: 4,
  grossRevenue: 45,
  id: 1,
  netRevenue: 42.5,
  notes: "Cash sale",
  productReference: "Articulated Dragon",
  quantity: 3,
  saleDate: "2026-07-02",
  saleUnit: "piece",
  stockQuantityAfter: 7,
  stockQuantityBefore: 10,
  updatedAt: "2026-07-02T00:00:00.000Z",
};
