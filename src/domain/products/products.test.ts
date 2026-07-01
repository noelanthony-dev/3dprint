import { describe, expect, it } from "vitest";

import {
  getLicenseWarningDisplay,
  isProductSaleUnit,
  validateProductInput,
  type ProductInput,
} from "./index";

const validInput: ProductInput = {
  authorName: "Studio_3D",
  category: "Accessory",
  commercialLicenseStatus: "commercial-ok",
  designName: "Red Blossom Bookmark",
  imageReference: "red-blossom-bookmark.png",
  licenseNotes: "Commercial license purchased.",
  notes: "",
  saleUnit: "piece",
  sourceLink: "https://printables.com/model/red-blossom-bookmark",
};

describe("product design helpers", () => {
  it("validates supported product sale units", () => {
    expect(isProductSaleUnit("piece")).toBe(true);
    expect(isProductSaleUnit("bundle")).toBe(true);
    expect(isProductSaleUnit("crate")).toBe(false);
  });

  it("builds license warning display copy", () => {
    expect(getLicenseWarningDisplay("commercial-ok", "").shouldWarn).toBe(false);

    const permissionWarning = getLicenseWarningDisplay("permission-needed", "");
    expect(permissionWarning.shouldWarn).toBe(true);
    expect(permissionWarning.tone).toBe("warning");

    const personalUseWarning = getLicenseWarningDisplay("personal-use", "");
    expect(personalUseWarning.shouldWarn).toBe(true);
    expect(personalUseWarning.tone).toBe("danger");
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
});
