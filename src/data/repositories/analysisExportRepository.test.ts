import { describe, expect, it, vi } from "vitest";

import type { AddOnRecord, FilamentRecord, FinishedGoodRecord } from "@/domain/inventory";
import type { ProductionRunRecord } from "@/domain/production";
import type { SaleRecord } from "@/domain/sales";
import { DEFAULT_APP_SETTINGS } from "@/domain/settings";

import {
  createAnalysisExportRepository,
  type AnalysisExportDependencies,
} from "./analysisExportRepository";

describe("analysis export repository", () => {
  it("loads complete top-level and child source data without writes", async () => {
    const dependencies = createDependencies();
    const repository = createAnalysisExportRepository(dependencies);

    const snapshot = await repository.loadSnapshot();

    expect(snapshot.settings).toEqual(DEFAULT_APP_SETTINGS);
    expect(snapshot.sourceData).toMatchObject({
      addOns: [{ id: 1 }],
      filaments: [{ id: 2 }],
      finishedGoods: [{ id: 3 }],
      productionRuns: [{ id: 4 }],
      sales: [{ id: 5 }],
    });
    expect(snapshot.sourceData.addOnAdjustments).toEqual([{ addOnId: 1, id: 11 }]);
    expect(snapshot.sourceData.filamentAdjustments).toEqual([{ filamentId: 2, id: 12 }]);
    expect(snapshot.sourceData.finishedGoodAdjustments).toEqual([{ finishedGoodId: 3, id: 13 }]);
    expect(snapshot.sourceData.productionAddOnCorrections).toEqual([{ id: 14, productionRunId: 4 }]);
    expect(snapshot.sourceData.productionAddOnDeductions).toEqual([{ id: 15, productionRunId: 4 }]);
    expect(snapshot.sourceData.productionFilamentDeductions).toEqual([{ id: 16, productionRunId: 4 }]);
    expect(snapshot.sourceData.saleStockMovements).toEqual([{ id: 17, saleId: 5 }]);
  });

  it("does not issue child reads when the parent tables are empty", async () => {
    const dependencies = createDependencies({ includeRecords: false });
    const repository = createAnalysisExportRepository(dependencies);

    const snapshot = await repository.loadSnapshot();

    expect(snapshot.sourceData.sales).toEqual([]);
    expect(dependencies.sales.listStockMovements).not.toHaveBeenCalled();
    expect(dependencies.productionRuns.listAddOnCorrections).not.toHaveBeenCalled();
    expect(dependencies.addOns.listAdjustments).not.toHaveBeenCalled();
  });

  it("propagates read failures and does not return a partial pack", async () => {
    const dependencies = createDependencies();
    dependencies.sales.list = vi.fn(async () => {
      throw new Error("Sales read failed.");
    });
    const repository = createAnalysisExportRepository(dependencies);

    await expect(repository.loadSnapshot()).rejects.toThrow("Sales read failed.");
  });
});

function createDependencies(
  { includeRecords = true }: { readonly includeRecords?: boolean } = {},
): AnalysisExportDependencies {
  const addOns = includeRecords ? [{ id: 1 } as AddOnRecord] : [];
  const filaments = includeRecords ? [{ id: 2 } as FilamentRecord] : [];
  const finishedGoods = includeRecords ? [{ id: 3 } as FinishedGoodRecord] : [];
  const productionRuns = includeRecords ? [{ id: 4 } as ProductionRunRecord] : [];
  const sales = includeRecords ? [{ id: 5 } as SaleRecord] : [];

  return {
    addOns: {
      list: vi.fn(async () => addOns),
      listAdjustments: vi.fn(async (id) => [{ addOnId: id, id: 11 } as never]),
    },
    expenses: {
      listExpenses: vi.fn(async () => []),
      listMemberships: vi.fn(async () => []),
    },
    filamentProfiles: { list: vi.fn(async () => []) },
    filaments: {
      list: vi.fn(async () => filaments),
      listAdjustments: vi.fn(async (id) => [{ filamentId: id, id: 12 } as never]),
    },
    finishedGoods: {
      list: vi.fn(async () => finishedGoods),
      listAdjustments: vi.fn(async (id) => [{ finishedGoodId: id, id: 13 } as never]),
    },
    hueForge: { listMissingRequirements: vi.fn(async () => []) },
    loadHueForgeData: vi.fn(async () => ({ analyses: [], requirements: [] })),
    loadSettings: vi.fn(() => DEFAULT_APP_SETTINGS),
    printProfiles: { list: vi.fn(async () => []) },
    productionRuns: {
      list: vi.fn(async () => productionRuns),
      listAddOnCorrections: vi.fn(async (id) => [{ id: 14, productionRunId: id } as never]),
      listAddOnDeductions: vi.fn(async (id) => [{ id: 15, productionRunId: id } as never]),
      listFilamentDeductions: vi.fn(async (id) => [{ id: 16, productionRunId: id } as never]),
    },
    products: { list: vi.fn(async () => []) },
    sales: {
      list: vi.fn(async () => sales),
      listStockMovements: vi.fn(async (id) => [{ id: 17, saleId: id } as never]),
    },
    shoppingList: { list: vi.fn(async () => []) },
  };
}
