import { describe, expect, it } from "vitest";

import {
  PRODUCT_CATEGORIES,
  getLicensePaymentDisplay,
  getLicenseWarningDisplay,
  getFilamentProfileInputsFromProductInput,
  getFilamentProfileInputsFromProductFilaments,
  isLicenseBillingInterval,
  isProductSaleUnit,
  validateProductInput,
  type ProductInput,
} from "./index";

const validInput: ProductInput = {
  authorName: "Studio_3D",
  businesses: ["Sincerely, Books"],
  canPrintWithInventory: true,
  category: "Bookmarks",
  commercialLicenseStatus: "commercial-ok",
  designName: "Red Blossom Bookmark",
  estimatedPrintHours: 1.5,
  filamentMode: "hueforge",
  hueForgeFilaments: [
    {
      alternativeFilamentIds: [2, 4],
      brand: "Jayo",
      colorName: "Black",
      hexColor: "#111111",
      layerRange: "L0-L8",
      materialType: "PLA",
      purchaseSource: "https://example.com/jayo-black",
      requiredGrams: 12,
      role: "Shadow",
      transmissionDistance: 0.3,
    },
  ],
  imageReference: "red-blossom-bookmark.png",
  licenseBillingInterval: "monthly",
  licenseCostAmount: 350,
  notes: "",
  saleUnit: "piece",
  sourceLink: "https://printables.com/model/red-blossom-bookmark",
};

describe("product design helpers", () => {
  it("includes the supported product categories", () => {
    expect(PRODUCT_CATEGORIES).toEqual([
      "Bookmarks",
      "Magnets",
      "Figure/Miniatures",
      "Clickers",
      "Others",
    ]);
  });

  it("validates supported product sale units", () => {
    expect(isProductSaleUnit("piece")).toBe(true);
    expect(isProductSaleUnit("bundle")).toBe(true);
    expect(isProductSaleUnit("crate")).toBe(false);
    expect(isLicenseBillingInterval("quarterly")).toBe(true);
    expect(isLicenseBillingInterval("weekly")).toBe(false);
  });

  it("builds license warning display copy", () => {
    expect(getLicenseWarningDisplay("commercial-ok").shouldWarn).toBe(false);

    const permissionWarning = getLicenseWarningDisplay("permission-needed");
    expect(permissionWarning.shouldWarn).toBe(true);
    expect(permissionWarning.tone).toBe("warning");

    const personalUseWarning = getLicenseWarningDisplay("personal-use");
    expect(personalUseWarning.shouldWarn).toBe(true);
    expect(personalUseWarning.tone).toBe("danger");
  });

  it("formats recurring license payments with a monthly equivalent", () => {
    expect(getLicensePaymentDisplay(0, "none").label).toBe("No recurring license fee");

    const quarterly = getLicensePaymentDisplay(900, "quarterly");

    expect(quarterly.label).toBe("₱900.00 / quarter (₱300.00 monthly equivalent)");
    expect(quarterly.monthlyEquivalent).toBe(300);
  });

  it("validates required product fields", () => {
    expect(validateProductInput(validInput).valid).toBe(true);

    const result = validateProductInput({
      ...validInput,
      authorName: "",
      designName: "",
      sourceLink: "not-a-url",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.authorName).toBeDefined();
    expect(result.errors.designName).toBeDefined();
    expect(result.errors.sourceLink).toBeDefined();
  });

  it("accepts optional non-negative decimal print hours", () => {
    expect(validateProductInput({ ...validInput, estimatedPrintHours: null }).valid).toBe(true);
    expect(validateProductInput({ ...validInput, estimatedPrintHours: 0 }).valid).toBe(true);
    expect(validateProductInput({ ...validInput, estimatedPrintHours: 1.75 }).valid).toBe(true);
  });

  it("rejects invalid print hours", () => {
    const negative = validateProductInput({ ...validInput, estimatedPrintHours: -0.25 });
    const malformed = validateProductInput({ ...validInput, estimatedPrintHours: Number.NaN });

    expect(negative.valid).toBe(false);
    expect(negative.errors.estimatedPrintHours).toBeDefined();
    expect(malformed.valid).toBe(false);
    expect(malformed.errors.estimatedPrintHours).toBeDefined();
  });

  it("requires a billing interval when license cost is paid", () => {
    const result = validateProductInput({
      ...validInput,
      licenseBillingInterval: "none",
      licenseCostAmount: 250,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.licenseBillingInterval).toBeDefined();
  });

  it("validates HueForge filament specs when they are saved with a product", () => {
    expect(validateProductInput(validInput).valid).toBe(true);

    const result = validateProductInput({
      ...validInput,
      hueForgeFilaments: [
        {
          ...validInput.hueForgeFilaments[0]!,
          colorName: "",
          transmissionDistance: -1,
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.hueForgeFilaments).toBeDefined();
  });

  it("validates numeric filament alternative inventory ids", () => {
    const validResult = validateProductInput({
      ...validInput,
      hueForgeFilaments: [
        {
          ...validInput.hueForgeFilaments[0]!,
          alternativeFilamentIds: [1, 3],
        },
      ],
    });

    expect(validResult.valid).toBe(true);

    const invalidResult = validateProductInput({
      ...validInput,
      hueForgeFilaments: [
        {
          ...validInput.hueForgeFilaments[0]!,
          alternativeFilamentIds: [0, 2.5],
        },
      ],
    });

    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.hueForgeFilaments).toBeDefined();
  });

  it("validates only grams for basic filament mode", () => {
    const result = validateProductInput({
      ...validInput,
      filamentMode: "basic",
      hueForgeFilaments: [
        {
          alternativeFilamentIds: [],
          brand: "",
          colorName: "",
          hexColor: "",
          layerRange: "",
          materialType: "Other",
          purchaseSource: "",
          requiredGrams: 7,
          role: "",
          transmissionDistance: null,
        },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it("rejects invalid grams for basic filament mode", () => {
    const result = validateProductInput({
      ...validInput,
      filamentMode: "basic",
      hueForgeFilaments: [
        {
          alternativeFilamentIds: [],
          brand: "",
          colorName: "",
          hexColor: "",
          layerRange: "",
          materialType: "Other",
          purchaseSource: "",
          requiredGrams: -1,
          role: "",
          transmissionDistance: null,
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.hueForgeFilaments).toBeDefined();
  });

  it("extracts reusable filament profiles without product-specific grams", () => {
    const profiles = getFilamentProfileInputsFromProductFilaments([
      {
        ...validInput.hueForgeFilaments[0]!,
        brand: " Jayo ",
        colorName: " Black ",
        hexColor: "111111",
        requiredGrams: 42,
      },
    ]);

    expect(profiles).toEqual([
      {
        brand: "Jayo",
        colorName: "Black",
        hexColor: "#111111",
        materialType: "PLA",
        transmissionDistance: 0.3,
      },
    ]);
    expect(profiles[0]).not.toHaveProperty("requiredGrams");
  });

  it("does not extract reusable filament profiles for basic products", () => {
    const profiles = getFilamentProfileInputsFromProductInput({
      ...validInput,
      filamentMode: "basic",
    });

    expect(profiles).toEqual([]);
  });

  it("skips incomplete filament profile rows", () => {
    const profiles = getFilamentProfileInputsFromProductFilaments([
      {
        ...validInput.hueForgeFilaments[0]!,
        brand: "",
      },
      {
        ...validInput.hueForgeFilaments[0]!,
        hexColor: "not-a-hex",
      },
    ]);

    expect(profiles).toEqual([]);
  });
});
