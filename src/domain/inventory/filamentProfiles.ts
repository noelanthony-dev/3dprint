import {
  FILAMENT_MATERIALS,
  normalizeHexColor,
  type FilamentMaterial,
} from "./filaments";

export interface FilamentProfileInput {
  readonly brand: string;
  readonly colorName: string;
  readonly hexColor: string;
  readonly materialType: FilamentMaterial;
  readonly transmissionDistance: number | null;
}

export interface FilamentProfileRecord extends FilamentProfileInput {
  readonly createdAt: string;
  readonly id: number;
  readonly updatedAt: string;
}

export interface FilamentProfileValidationResult {
  readonly errors: Partial<Record<keyof FilamentProfileInput, string>>;
  readonly valid: boolean;
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function validateFilamentProfileInput(
  input: FilamentProfileInput,
): FilamentProfileValidationResult {
  const errors: Partial<Record<keyof FilamentProfileInput, string>> = {};
  const normalizedHex = normalizeHexColor(input.hexColor);

  if (!input.brand.trim()) {
    errors.brand = "Brand is required.";
  }

  if (!input.colorName.trim()) {
    errors.colorName = "Color name is required.";
  }

  if (!FILAMENT_MATERIALS.includes(input.materialType)) {
    errors.materialType = "Choose a valid material.";
  }

  if (!HEX_COLOR_PATTERN.test(normalizedHex)) {
    errors.hexColor = "Use a 6-digit hex color, for example #000000.";
  }

  if (
    input.transmissionDistance != null &&
    (!Number.isFinite(input.transmissionDistance) || input.transmissionDistance < 0)
  ) {
    errors.transmissionDistance = "TD must be zero or greater.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function normalizeFilamentProfileInput(
  input: FilamentProfileInput,
): FilamentProfileInput {
  return {
    brand: input.brand.trim(),
    colorName: input.colorName.trim(),
    hexColor: normalizeHexColor(input.hexColor),
    materialType: input.materialType,
    transmissionDistance: input.transmissionDistance,
  };
}
