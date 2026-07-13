import { describe, expect, it } from "vitest";

import type {
  AddOnsRepository,
  FilamentRepository,
  FinishedGoodsRepository,
  PrintProfilesRepository,
  ProductsRepository,
} from "@/data/repositories";
import type { PrintProfileRecord } from "@/domain/costing";
import type { AddOnRecord, FilamentRecord, FinishedGoodRecord } from "@/domain/inventory";
import type { ProductRecord } from "@/domain/products";
import type { ProductionRunRecord } from "@/domain/production";

import { createProductionRunsService } from "./productionRunsService";

describe("production runs service", () => {
  it("records the complete desktop production run atomically without repository stock writes", async () => {
    const atomicInputs: unknown[] = [];
    let stockWriteCount = 0;
    const service = createProductionRunsService({
      addOns: emptyAddOns,
      atomicRecorder: async (input) => {
        atomicInputs.push(input);
        return productionRun.id;
      },
      filaments: {
        create: async () => blackFilament,
        get: async () => blackFilament,
        list: async () => [blackFilament],
        listAdjustments: async () => [],
        update: async () => blackFilament,
        adjustStock: async () => {
          stockWriteCount += 1;
          return blackFilament;
        },
      },
      finishedGoods,
      printProfiles,
      productionRuns: {
        get: async () => productionRun,
        list: async () => [],
        listAddOnDeductions: async () => [],
        listFilamentDeductions: async () => [],
      },
      products,
    });

    await service.logProductionRun({
      addOns: [],
      expectedPieces: 1,
      failedPieces: 0,
      failureReason: "",
      filamentId: blackFilament.id,
      filamentSelections: [
        { filamentId: blackFilament.id, requiredGrams: 13, requirementLabel: "Black PLA" },
      ],
      goodPieces: 1,
      notes: "",
      printProfileId: profile.id,
      productId: product.id,
      runDate: "2026-07-08",
    });

    expect(stockWriteCount).toBe(0);
    expect(atomicInputs).toEqual([
      expect.objectContaining({
        filamentDeductions: [
          expect.objectContaining({
            filamentId: blackFilament.id,
            gramsAfter: 87,
            gramsBefore: 100,
            gramsDeducted: 13,
          }),
        ],
        filamentGramsDeducted: 13,
        goodPieces: 1,
      }),
    ]);
  });

  it("deducts each selected filament requirement separately", async () => {
    const adjustedFilaments: Array<{ filamentId: number; gramsDelta: number }> = [];
    const atomicInputs: Array<{
      readonly filamentDeductions: readonly {
        readonly filamentId: number;
        readonly gramsAfter: number;
        readonly gramsBefore: number;
        readonly gramsDeducted: number;
      }[];
      readonly filamentGramsDeducted: number;
    }> = [];
    const filamentsById = new Map<number, FilamentRecord>(
      [blackFilament, whiteFilament, redFilament].map((filament) => [filament.id, filament]),
    );

    const filaments: FilamentRepository = {
      adjustStock: async (filamentId, input) => {
        const current = filamentsById.get(filamentId);

        if (!current) {
          throw new Error("missing filament");
        }

        adjustedFilaments.push({ filamentId, gramsDelta: input.gramsDelta });

        const updated = {
          ...current,
          estimatedGramsLeft: current.estimatedGramsLeft + input.gramsDelta,
        };
        filamentsById.set(filamentId, updated);

        return updated;
      },
      create: async () => blackFilament,
      get: async (id) => filamentsById.get(id) ?? null,
      list: async () => [...filamentsById.values()],
      listAdjustments: async () => [],
      update: async () => blackFilament,
    };

    const service = createProductionRunsService({
      addOns: emptyAddOns,
      atomicRecorder: async (atomicInput) => {
        atomicInputs.push(atomicInput);
        return productionRun.id;
      },
      filaments,
      finishedGoods,
      printProfiles,
      productionRuns: {
        get: async () => productionRun,
        list: async () => [],
        listAddOnDeductions: async () => [],
        listFilamentDeductions: async () => [],
      },
      products,
    });

    await service.logProductionRun({
      addOns: [],
      expectedPieces: 1,
      failedPieces: 0,
      failureReason: "",
      filamentId: blackFilament.id,
      filamentSelections: [
        { filamentId: blackFilament.id, requiredGrams: 9, requirementLabel: "Black PLA" },
        { filamentId: whiteFilament.id, requiredGrams: 3, requirementLabel: "White PLA" },
        { filamentId: redFilament.id, requiredGrams: 1, requirementLabel: "Red PLA" },
      ],
      goodPieces: 1,
      notes: "",
      printProfileId: profile.id,
      productId: product.id,
      runDate: "2026-07-08",
    });

    expect(adjustedFilaments).toEqual([]);
    const savedRun = atomicInputs[0];

    expect(savedRun?.filamentGramsDeducted).toBe(13);
    expect(savedRun?.filamentDeductions).toEqual([
      expect.objectContaining({ filamentId: blackFilament.id, gramsBefore: 100, gramsAfter: 91, gramsDeducted: 9 }),
      expect.objectContaining({ filamentId: whiteFilament.id, gramsBefore: 100, gramsAfter: 97, gramsDeducted: 3 }),
      expect.objectContaining({ filamentId: redFilament.id, gramsBefore: 100, gramsAfter: 99, gramsDeducted: 1 }),
    ]);
  });

  it("prepares every add-on for one atomic production transaction", async () => {
    const atomicInputs: Array<{ addOnDeductions?: readonly unknown[]; addOnQuantityDeducted?: number }> = [];
    const switchItem = { ...emptyAddOn, id: 3, itemName: "Mechanical switch", quantityOnHand: 10 };
    const claspItem = { ...emptyAddOn, id: 4, itemName: "Lobster clasp", quantityOnHand: 8 };
    const addOnsById = new Map([switchItem, claspItem].map((item) => [item.id, item]));
    const service = createProductionRunsService({
      addOns: { ...emptyAddOns, get: async (id) => addOnsById.get(id) ?? null },
      atomicRecorder: async (input) => {
        atomicInputs.push(input);
        return productionRun.id;
      },
      filaments: {
        adjustStock: async () => blackFilament,
        create: async () => blackFilament,
        get: async () => blackFilament,
        list: async () => [blackFilament],
        listAdjustments: async () => [],
        update: async () => blackFilament,
      },
      finishedGoods,
      printProfiles,
      productionRuns: {
        get: async () => productionRun,
        list: async () => [],
        listAddOnDeductions: async () => [],
        listFilamentDeductions: async () => [],
      },
      products,
    });

    await service.logProductionRun({
      addOns: [{ addOnId: 3, quantity: 1 }, { addOnId: 4, quantity: 2 }],
      expectedPieces: 1,
      failedPieces: 0,
      failureReason: "",
      filamentId: blackFilament.id,
      filamentSelections: [],
      goodPieces: 1,
      notes: "",
      printProfileId: profile.id,
      productId: product.id,
      runDate: "2026-07-08",
    });

    expect(atomicInputs[0]?.addOnDeductions).toEqual([
      { addOnId: 3, quantityAfter: 9, quantityBefore: 10, quantityDeducted: 1 },
      { addOnId: 4, quantityAfter: 6, quantityBefore: 8, quantityDeducted: 2 },
    ]);
    expect(atomicInputs[0]?.addOnQuantityDeducted).toBe(3);
  });

  it("checks aggregate grams before deducting repeated selections from the same spool", async () => {
    const adjustedFilaments: Array<{ filamentId: number; gramsDelta: number }> = [];
    let atomicCallCount = 0;
    const filamentsById = new Map<number, FilamentRecord>([
      [blackFilament.id, blackFilament],
    ]);

    const filaments: FilamentRepository = {
      adjustStock: async (filamentId, input) => {
        adjustedFilaments.push({ filamentId, gramsDelta: input.gramsDelta });
        return filamentsById.get(filamentId) ?? blackFilament;
      },
      create: async () => blackFilament,
      get: async (id) => filamentsById.get(id) ?? null,
      list: async () => [...filamentsById.values()],
      listAdjustments: async () => [],
      update: async () => blackFilament,
    };

    const service = createProductionRunsService({
      addOns: emptyAddOns,
      atomicRecorder: async () => {
        atomicCallCount += 1;
        return productionRun.id;
      },
      filaments,
      finishedGoods,
      printProfiles,
      productionRuns: {
        get: async () => productionRun,
        list: async () => [],
        listAddOnDeductions: async () => [],
        listFilamentDeductions: async () => [],
      },
      products,
    });

    await expect(
      service.logProductionRun({
        addOns: [],
        expectedPieces: 1,
        failedPieces: 0,
        failureReason: "",
        filamentId: blackFilament.id,
        filamentSelections: [
          { filamentId: blackFilament.id, requiredGrams: 70, requirementLabel: "Black base" },
          { filamentId: blackFilament.id, requiredGrams: 40, requirementLabel: "Black detail" },
        ],
        goodPieces: 1,
        notes: "",
        printProfileId: profile.id,
        productId: product.id,
        runDate: "2026-07-08",
      }),
    ).rejects.toThrow("Selected filament does not have enough estimated grams for this run.");

    expect(adjustedFilaments).toEqual([]);
    expect(atomicCallCount).toBe(0);
  });
});

const product: ProductRecord = {
  authorName: "Studio",
  businesses: [],
  canPrintWithInventory: true,
  category: "Bookmarks",
  commercialLicenseStatus: "commercial-ok",
  createdAt: "2026-07-08T00:00:00.000Z",
  designName: "Tancho Koi",
  filamentMode: "hueforge",
  hueForgeFilaments: [],
  id: 2,
  imageReference: "",
  licenseBillingInterval: "none",
  licenseCostAmount: 0,
  notes: "",
  saleUnit: "piece",
  sourceLink: "https://example.com/model",
  updatedAt: "2026-07-08T00:00:00.000Z",
};

const profile: PrintProfileRecord = {
  addOns: [],
  createdAt: "2026-07-08T00:00:00.000Z",
  electricityRatePerKwh: 0,
  expectedFailedUnits: 0,
  expectedGoodUnits: 1,
  filamentCostPerKg: 1000,
  filamentGrams: 13,
  id: 6,
  laborMinutes: 0,
  laborRatePerHour: 0,
  notes: "",
  printerPowerWatts: 0,
  printHours: 0,
  printMinutes: 0,
  productId: product.id,
  profileName: "0.4mm Standard",
  saleUnit: "piece",
  supportGrams: 0,
  targetMarkup: 3,
  updatedAt: "2026-07-08T00:00:00.000Z",
  wearRatePerHour: 0,
};

const blackFilament = makeFilament(10, "Jayo", "Black");
const whiteFilament = makeFilament(11, "Anycubic", "Bright White");
const redFilament = makeFilament(12, "BambuLab", "Matte Scarlet Red");

function makeFilament(id: number, brand: string, colorName: string): FilamentRecord {
  return {
    brand,
    colorName,
    createdAt: "2026-07-08T00:00:00.000Z",
    estimatedGramsLeft: 100,
    hexColor: "#000000",
    id,
    lowStockThresholdGrams: 25,
    materialType: "PLA",
    name: colorName,
    notes: "",
    purchaseSource: "",
    spoolCost: 1000,
    spoolStatus: "open",
    startingGrams: 1000,
    transmissionDistance: null,
    updatedAt: "2026-07-08T00:00:00.000Z",
  };
}

const productionRun: ProductionRunRecord = {
  addOnDeductions: [],
  addOnQuantityDeducted: 0,
  createdAt: "2026-07-08T00:00:00.000Z",
  expectedPieces: 1,
  failedPieces: 0,
  failureReason: "",
  filamentGramsDeducted: 13,
  filamentId: blackFilament.id,
  finishedGoodId: null,
  goodPieces: 1,
  id: 1,
  notes: "",
  printProfileId: profile.id,
  productId: product.id,
  runDate: "2026-07-08",
  updatedAt: "2026-07-08T00:00:00.000Z",
};

const products: ProductsRepository = {
  create: async () => product,
  delete: async () => undefined,
  get: async () => product,
  list: async () => [product],
  update: async () => product,
};

const printProfiles: PrintProfilesRepository = {
  create: async () => profile,
  get: async () => profile,
  list: async () => [profile],
  update: async () => profile,
};

const finishedGood: FinishedGoodRecord = {
  createdAt: "2026-07-08T00:00:00.000Z",
  id: 4,
  notes: "",
  productReference: product.designName,
  quantityReady: 0,
  quantityReserved: 0,
  saleUnit: "piece",
  updatedAt: "2026-07-08T00:00:00.000Z",
};

const finishedGoods: FinishedGoodsRepository = {
  adjustStock: async () => finishedGood,
  create: async () => finishedGood,
  get: async () => finishedGood,
  list: async () => [],
  listAdjustments: async () => [],
  update: async () => finishedGood,
};

const emptyAddOn: AddOnRecord = {
  category: "Hardware",
  createdAt: "2026-07-08T00:00:00.000Z",
  id: 3,
  isActive: true,
  itemName: "Tassel",
  lowStockThreshold: 0,
  notes: "",
  quantityOnHand: 0,
  supplier: "",
  unit: "pcs",
  unitCost: 0,
  updatedAt: "2026-07-08T00:00:00.000Z",
};

const emptyAddOns: AddOnsRepository = {
  adjustStock: async () => emptyAddOn,
  create: async () => emptyAddOn,
  get: async () => null,
  list: async () => [],
  listAdjustments: async () => [],
  update: async () => emptyAddOn,
};
