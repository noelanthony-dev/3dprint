import { createScaffoldModuleStatus } from "@/domain/shared";
import {
  FILAMENT_MATERIALS,
  normalizeHexColor,
  normalizeFilamentProfileInput,
  type FilamentMaterial,
  type FilamentProfileInput,
} from "@/domain/inventory";

export const PRODUCT_CATEGORIES = [
  "Bookmarks",
  "Magnets",
  "Figure/Miniatures",
  "Clickers",
  "Others",
] as const;

export const PRODUCT_SALE_UNITS = ["piece", "pair", "set", "bundle", "pack"] as const;

export const COMMERCIAL_LICENSE_STATUSES = [
  "commercial-ok",
  "permission-needed",
  "personal-use",
  "unknown",
] as const;

export const LICENSE_BILLING_INTERVALS = [
  "none",
  "monthly",
  "quarterly",
  "yearly",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export type ProductSaleUnit = (typeof PRODUCT_SALE_UNITS)[number];
export type CommercialLicenseStatus = (typeof COMMERCIAL_LICENSE_STATUSES)[number];
export type LicenseBillingInterval = (typeof LICENSE_BILLING_INTERVALS)[number];
export type LicenseWarningTone = "success" | "warning" | "danger";
export type ProductFilamentMode = "hueforge" | "basic";

export interface ProductHueForgeFilament {
  readonly brand: string;
  readonly materialType: FilamentMaterial;
  readonly colorName: string;
  readonly hexColor: string;
  readonly transmissionDistance: number | null;
  readonly role: string;
  readonly requiredGrams: number;
  readonly layerRange: string;
  readonly purchaseSource: string;
}

export interface ProductRecord {
  readonly id: number;
  readonly designName: string;
  readonly sourceLink: string;
  readonly authorName: string;
  readonly category: ProductCategory;
  readonly saleUnit: ProductSaleUnit;
  readonly commercialLicenseStatus: CommercialLicenseStatus;
  readonly licenseCostAmount: number;
  readonly licenseBillingInterval: LicenseBillingInterval;
  readonly filamentMode: ProductFilamentMode;
  readonly hueForgeFilaments: readonly ProductHueForgeFilament[];
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
  readonly licenseCostAmount: number;
  readonly licenseBillingInterval: LicenseBillingInterval;
  readonly filamentMode: ProductFilamentMode;
  readonly hueForgeFilaments: readonly ProductHueForgeFilament[];
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

export interface LicensePaymentDisplay {
  readonly label: string;
  readonly monthlyEquivalent: number;
}

const URL_PATTERN = /^https?:\/\/\S+\.\S+/i;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const PRODUCT_FILAMENT_MODES: readonly ProductFilamentMode[] = ["hueforge", "basic"];

export function isProductSaleUnit(value: string): value is ProductSaleUnit {
  return PRODUCT_SALE_UNITS.includes(value as ProductSaleUnit);
}

export function isLicenseBillingInterval(value: string): value is LicenseBillingInterval {
  return LICENSE_BILLING_INTERVALS.includes(value as LicenseBillingInterval);
}

export function isFilamentMaterial(value: string): value is FilamentMaterial {
  return FILAMENT_MATERIALS.includes(value as FilamentMaterial);
}

export function getLicenseWarningDisplay(status: CommercialLicenseStatus): LicenseWarningDisplay {
  if (status === "commercial-ok") {
    return {
      label: "License OK",
      message: "Commercial use is marked as allowed for this design.",
      shouldWarn: false,
      tone: "success",
    };
  }

  if (status === "permission-needed") {
    return {
      label: "Permission Needed",
      message: "Confirm commercial permission from the author before selling products from this design.",
      shouldWarn: true,
      tone: "warning",
    };
  }

  if (status === "personal-use") {
    return {
      label: "Personal Use",
      message: "This design is marked personal-use only. Do not sell without a separate commercial license.",
      shouldWarn: true,
      tone: "danger",
    };
  }

  return {
    label: "License Unknown",
    message: "Commercial license status has not been verified yet.",
    shouldWarn: true,
    tone: "warning",
  };
}

export function getLicensePaymentDisplay(
  amount: number,
  interval: LicenseBillingInterval,
  currencySymbol = "₱",
): LicensePaymentDisplay {
  if (amount <= 0 || interval === "none") {
    return {
      label: "No recurring license fee",
      monthlyEquivalent: 0,
    };
  }

  const divisorByInterval: Record<Exclude<LicenseBillingInterval, "none">, number> = {
    monthly: 1,
    quarterly: 3,
    yearly: 12,
  };
  const monthlyEquivalent = amount / divisorByInterval[interval];
  const intervalLabel =
    interval === "monthly" ? "month" : interval === "quarterly" ? "quarter" : "year";

  return {
    label: `${currencySymbol}${amount.toFixed(2)} / ${intervalLabel} (${currencySymbol}${monthlyEquivalent.toFixed(2)} monthly equivalent)`,
    monthlyEquivalent,
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

  if (!Number.isFinite(input.licenseCostAmount) || input.licenseCostAmount < 0) {
    errors.licenseCostAmount = "License cost must be zero or more.";
  }

  if (!isLicenseBillingInterval(input.licenseBillingInterval)) {
    errors.licenseBillingInterval = "Choose a valid billing interval.";
  } else if (input.licenseCostAmount > 0 && input.licenseBillingInterval === "none") {
    errors.licenseBillingInterval = "Choose monthly, quarterly, or yearly for a paid license.";
  }

  if (!PRODUCT_FILAMENT_MODES.includes(input.filamentMode)) {
    errors.filamentMode = "Choose a valid filament mode.";
  }

  input.hueForgeFilaments.forEach((filament, index) => {
    const fieldPrefix = `Filament ${index + 1}`;

    if (input.filamentMode === "basic") {
      if (!Number.isFinite(filament.requiredGrams) || filament.requiredGrams < 0) {
        errors.hueForgeFilaments = `${fieldPrefix} required grams must be zero or greater.`;
      }

      return;
    }

    if (!filament.brand.trim()) {
      errors.hueForgeFilaments = `${fieldPrefix} needs a brand or product line.`;
      return;
    }

    if (!isFilamentMaterial(filament.materialType)) {
      errors.hueForgeFilaments = `${fieldPrefix} needs a valid material.`;
      return;
    }

    if (!filament.colorName.trim()) {
      errors.hueForgeFilaments = `${fieldPrefix} needs a color name.`;
      return;
    }

    if (filament.hexColor.trim() && !HEX_COLOR_PATTERN.test(normalizeHexColor(filament.hexColor))) {
      errors.hueForgeFilaments = `${fieldPrefix} needs a 6-digit hex color, for example #f8f8f2.`;
      return;
    }

    if (
      filament.transmissionDistance != null &&
      (!Number.isFinite(filament.transmissionDistance) || filament.transmissionDistance < 0)
    ) {
      errors.hueForgeFilaments = `${fieldPrefix} TD must be zero or greater.`;
      return;
    }

    if (!Number.isFinite(filament.requiredGrams) || filament.requiredGrams < 0) {
      errors.hueForgeFilaments = `${fieldPrefix} required grams must be zero or greater.`;
    }
  });

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function getFilamentProfileInputsFromProductFilaments(
  filaments: readonly ProductHueForgeFilament[],
): readonly FilamentProfileInput[] {
  return filaments.flatMap((filament) => {
    const normalized = normalizeFilamentProfileInput({
      brand: filament.brand,
      colorName: filament.colorName,
      hexColor: filament.hexColor,
      materialType: filament.materialType,
      transmissionDistance: filament.transmissionDistance,
    });

    if (
      !normalized.brand ||
      !normalized.colorName ||
      !isFilamentMaterial(normalized.materialType) ||
      !HEX_COLOR_PATTERN.test(normalized.hexColor) ||
      (normalized.transmissionDistance != null &&
        (!Number.isFinite(normalized.transmissionDistance) || normalized.transmissionDistance < 0))
    ) {
      return [];
    }

    return [normalized];
  });
}

export function getFilamentProfileInputsFromProductInput(
  input: ProductInput,
): readonly FilamentProfileInput[] {
  if (input.filamentMode === "basic") {
    return [];
  }

  return getFilamentProfileInputsFromProductFilaments(input.hueForgeFilaments);
}

export const productsDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "products",
  notes: ["Design library validation, license-warning rules, and recurring license costs."],
});
