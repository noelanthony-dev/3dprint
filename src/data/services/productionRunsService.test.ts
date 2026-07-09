import { describe, expect, it } from "vitest";

import type {
  AddOnsRepository,
  FilamentRepository,
  FinishedGoodsRepository,
  PrintProfilesRepository,
  ProductionRunCreateInput,
  ProductsRepository,
} from "@/data/repositories";
import type { PrintProfileRecord } from "@/domain/costing";
import type { AddOnRecord, FilamentRecord, FinishedGoodRecord } from "@/domain/inventory";
import type { ProductRecord } from "@/domain/products";
import type { ProductionRunRecord } from "@/domain/production";

import { createProductionRunsService } from "./productionRunsService";

describe("production runs service", () => {
  it("deducts each selected filament requirement separately", async () => {
    const adjustedFilaments: Array<{ filamentId: number; gramsDelta: number }> = [];
    const createdRuns: ProductionRunCreateInput[] = [];
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
      filaments,
      finishedGoods,
      printProfiles,
      productionRuns: {
        create: async (input) => {
          createdRuns.push(input);
          return productionRun;
        },
        get: async () => productionRun,
        list: async () => [],
        listAddOnDeductions: async () => [],
        listFilamentDeductions: async () => [],
      },
      products,
    });

    await service.logProductionRun({
      addOnId: null,
      addOnQuantity: 0,
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

    expect(adjustedFilaments).toEqual([
      { filamentId: blackFilament.id, gramsDelta: -9 },
      { filamentId: whiteFilament.id, gramsDelta: -3 },
      { filamentId: redFilament.id, gramsDelta: -1 },
    ]);
    const savedRun = createdRuns[0];

    expect(savedRun?.filamentGramsDeducted).toBe(13);
    expect(savedRun?.filamentDeductions).toEqual([
      { filamentId: blackFilament.id, gramsBefore: 100, gramsAfter: 91, gramsDeducted: 9 },
      { filamentId: whiteFilament.id, gramsBefore: 100, gramsAfter: 97, gramsDeducted: 3 },
      { filamentId: redFilament.id, gramsBefore: 100, gramsAfter: 99, gramsDeducted: 1 },
    ]);
  });
});

const product: ProductRecord = {
  authorName: "Studio",
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
  addOnCost: 0,
  addOnDescription: "",
  addOnId: null,
  addOnQuantity: 0,
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
  addOnId: null,
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
