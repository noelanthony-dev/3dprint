import { createScaffoldModuleStatus } from "@/domain/shared";

export const PRODUCT_CATEGORIES = [
  "Accessory",
  "Decor",
  "Utility",
  "Toy",
  "HueForge",
  "Other",
] as const;

export const PRODUCT_SALE_UNITS = ["piece", "pair", "set", "bundle", "pack"] as const;

export const COMMERCIAL_LICENSE_STATUSES = [
  "commercial-ok",
  "permission-needed",
  "personal-use",
  "unknown",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export type ProductSaleUnit = (typeof PRODUCT_SALE_UNITS)[number];
export type CommercialLicenseStatus = (typeof COMMERCIAL_LICENSE_STATUSES)[number];
export type LicenseWarningTone = "success" | "warning" | "danger";

export interface ProductRecord {
  readonly id: number;
  readonly designName: string;
  readonly sourceLink: string;
  readonly authorName: string;
  readonly category: ProductCategory;
  readonly saleUnit: ProductSaleUnit;
  readonly commercialLicenseStatus: CommercialLicenseStatus;
  readonly licenseNotes: string;
  readonly notes: string;
  readonly imageReference: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProductInput {
  readonly designName: string;
  readonly sourceLink: string;
  readonly authorName: string;
  readonly category: ProductCategory;
  readonly saleUnit: ProductSaleUnit;
  readonly commercialLicenseStatus: CommercialLicenseStatus;
  readonly licenseNotes: string;
  readonly notes: string;
  readonly imageReference: string;
}

export interface ProductValidationResult {
  readonly errors: Partial<Record<keyof ProductInput, string>>;
  readonly valid: boolean;
}

export interface LicenseWarningDisplay {
  readonly label: string;
  readonly message: string;
  readonly shouldWarn: boolean;
  readonly tone: LicenseWarningTone;
}

const URL_PATTERN = /^https?:\/\/\S+\.\S+/i;

export function isProductSaleUnit(value: string): value is ProductSaleUnit {
  return PRODUCT_SALE_UNITS.includes(value as ProductSaleUnit);
}

export function getLicenseWarningDisplay(
  status: CommercialLicenseStatus,
  licenseNotes: string,
): LicenseWarningDisplay {
  const notes = licenseNotes.trim();

  if (status === "commercial-ok") {
    return {
      label: "License OK",
      message: notes || "Commercial use is marked as allowed for this design.",
      shouldWarn: false,
      tone: "success",
    };
  }

  if (status === "permission-needed") {
    return {
      label: "Permission Needed",
      message:
        notes ||
        "Confirm commercial permission from the author before selling products from this design.",
      shouldWarn: true,
      tone: "warning",
    };
  }

  if (status === "personal-use") {
    return {
      label: "Personal Use",
      message:
        notes ||
        "This design is marked personal-use only. Do not sell without a separate commercial license.",
      shouldWarn: true,
      tone: "danger",
    };
  }

  return {
    label: "License Unknown",
    message: notes || "Commercial license status has not been verified yet.",
    shouldWarn: true,
    tone: "warning",
  };
}

export function validateProductInput(input: ProductInput): ProductValidationResult {
  const errors: Partial<Record<keyof ProductInput, string>> = {};

  if (!input.designName.trim()) {
    errors.designName = "Design name is required.";
  }

  if (!input.sourceLink.trim()) {
    errors.sourceLink = "Source link is required.";
  } else if (!URL_PATTERN.test(input.sourceLink.trim())) {
    errors.sourceLink = "Use a full http or https source link.";
  }

  if (!input.authorName.trim()) {
    errors.authorName = "Author or designer is required.";
  }

  if (!PRODUCT_CATEGORIES.includes(input.category)) {
    errors.category = "Choose a valid product category.";
  }

  if (!isProductSaleUnit(input.saleUnit)) {
    errors.saleUnit = "Choose a valid sale unit.";
  }

  if (!COMMERCIAL_LICENSE_STATUSES.includes(input.commercialLicenseStatus)) {
    errors.commercialLicenseStatus = "Choose a valid commercial license status.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export const productsDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "products",
  notes: ["Design library validation and license-warning rules."],
});
