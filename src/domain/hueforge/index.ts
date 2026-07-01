import { createScaffoldModuleStatus } from "@/domain/shared";
import {
  getStockSignal,
  normalizeHexColor,
  type FilamentMaterial,
  type FilamentRecord,
} from "@/domain/inventory";

export type HueForgeMatchStatus = "excellent" | "good" | "test" | "missing";
export type HueForgeFeasibilityStatus = "ready" | "needs-test" | "missing";

export interface HueForgeRequirementInput {
  readonly role: string;
  readonly brand: string;
  readonly materialType: FilamentMaterial;
  readonly colorName: string;
  readonly hexColor: string;
  readonly transmissionDistance: number;
  readonly requiredGrams: number;
  readonly layerRange: string;
}

export interface HueForgeRequirementValidationResult {
  readonly errors: Partial<Record<keyof HueForgeRequirementInput, string>>;
  readonly valid: boolean;
}

export interface HueForgeRequirementMatch {
  readonly colorDistance: number | null;
  readonly matchedFilament: FilamentRecord | null;
  readonly matchScore: number;
  readonly status: HueForgeMatchStatus;
  readonly stockSignal: ReturnType<typeof getStockSignal> | "missing";
  readonly tdDelta: number | null;
  readonly warning: string;
  readonly requirement: HueForgeRequirementInput;
}

export interface HueForgeMatchAnalysis {
  readonly averageScore: number;
  readonly feasibilityNotes: string;
  readonly feasibilityStatus: HueForgeFeasibilityStatus;
  readonly matches: readonly HueForgeRequirementMatch[];
  readonly missingWarnings: readonly string[];
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_RGB_DISTANCE = Math.sqrt(255 ** 2 * 3);

export function validateHueForgeRequirement(
  requirement: HueForgeRequirementInput,
): HueForgeRequirementValidationResult {
  const errors: Partial<Record<keyof HueForgeRequirementInput, string>> = {};
  const normalizedHex = normalizeHexColor(requirement.hexColor);

  if (!requirement.role.trim()) {
    errors.role = "Role is required.";
  }

  if (!requirement.brand.trim()) {
    errors.brand = "Brand or source label is required.";
  }

  if (!requirement.colorName.trim()) {
    errors.colorName = "Color name is required.";
  }

  if (!HEX_COLOR_PATTERN.test(normalizedHex)) {
    errors.hexColor = "Use a 6-digit hex color, for example #ff1493.";
  }

  if (!Number.isFinite(requirement.transmissionDistance) || requirement.transmissionDistance < 0) {
    errors.transmissionDistance = "TD must be zero or greater.";
  }

  if (!Number.isFinite(requirement.requiredGrams) || requirement.requiredGrams < 0) {
    errors.requiredGrams = "Required grams must be zero or greater.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function analyzeHueForgeMatches(
  requirements: readonly HueForgeRequirementInput[],
  filaments: readonly FilamentRecord[],
): HueForgeMatchAnalysis {
  const matches = requirements.map((requirement) => findBestMatch(requirement, filaments));
  const missingWarnings = matches
    .map((match) => match.warning)
    .filter((warning) => warning.length > 0);
  const averageScore =
    matches.length === 0
      ? 0
      : Math.round(matches.reduce((total, match) => total + match.matchScore, 0) / matches.length);

  let feasibilityStatus: HueForgeFeasibilityStatus = "ready";

  if (matches.some((match) => match.status === "missing")) {
    feasibilityStatus = "missing";
  } else if (matches.some((match) => match.status === "test")) {
    feasibilityStatus = "needs-test";
  }

  return {
    averageScore,
    feasibilityNotes: buildFeasibilityNotes(feasibilityStatus, averageScore, missingWarnings),
    feasibilityStatus,
    matches,
    missingWarnings,
  };
}

export function getHexColorDistance(firstHex: string, secondHex: string): number {
  const first = parseHexColor(firstHex);
  const second = parseHexColor(secondHex);

  if (!first || !second) {
    return 100;
  }

  const rawDistance = Math.sqrt(
    (first.red - second.red) ** 2 +
      (first.green - second.green) ** 2 +
      (first.blue - second.blue) ** 2,
  );

  return Math.round((rawDistance / MAX_RGB_DISTANCE) * 100);
}

function findBestMatch(
  requirement: HueForgeRequirementInput,
  filaments: readonly FilamentRecord[],
): HueForgeRequirementMatch {
  const scored = filaments
    .map((filament) => scoreFilamentMatch(requirement, filament))
    .sort((first, second) => second.matchScore - first.matchScore);
  const best = scored[0];

  if (!best || best.matchScore < 45) {
    return {
      colorDistance: null,
      matchedFilament: null,
      matchScore: 0,
      requirement,
      status: "missing",
      stockSignal: "missing",
      tdDelta: null,
      warning: `No usable ${requirement.materialType} match for ${requirement.colorName}.`,
    };
  }

  return best;
}

function scoreFilamentMatch(
  requirement: HueForgeRequirementInput,
  filament: FilamentRecord,
): HueForgeRequirementMatch {
  const colorDistance = getHexColorDistance(requirement.hexColor, filament.hexColor);
  const tdDelta =
    filament.transmissionDistance == null
      ? null
      : Math.abs(filament.transmissionDistance - requirement.transmissionDistance);
  const stockSignal = getStockSignal(filament);
  const hasEnoughStock = filament.estimatedGramsLeft >= requirement.requiredGrams;
  const materialPenalty = filament.materialType === requirement.materialType ? 0 : 28;
  const colorPenalty = Math.min(36, colorDistance * 0.75);
  const tdPenalty = tdDelta == null ? 18 : Math.min(30, tdDelta * 18);
  const stockPenalty =
    stockSignal === "empty" || stockSignal === "archived"
      ? 34
      : stockSignal === "low" || !hasEnoughStock
        ? 18
        : stockSignal === "sealed"
          ? 6
          : 0;
  const matchScore = Math.max(
    0,
    Math.round(100 - materialPenalty - colorPenalty - tdPenalty - stockPenalty),
  );
  const status = getMatchStatus(matchScore, colorDistance, tdDelta, stockSignal, hasEnoughStock);

  return {
    colorDistance,
    matchedFilament: filament,
    matchScore,
    requirement,
    status,
    stockSignal,
    tdDelta,
    warning: buildMatchWarning(requirement, filament, colorDistance, tdDelta, stockSignal, hasEnoughStock),
  };
}

function getMatchStatus(
  score: number,
  colorDistance: number,
  tdDelta: number | null,
  stockSignal: ReturnType<typeof getStockSignal>,
  hasEnoughStock: boolean,
): HueForgeMatchStatus {
  if (stockSignal === "empty" || stockSignal === "archived" || !hasEnoughStock || score < 45) {
    return "missing";
  }

  if (score >= 86 && colorDistance <= 8 && (tdDelta == null || tdDelta <= 0.3)) {
    return "excellent";
  }

  if (score >= 70 && colorDistance <= 22 && (tdDelta == null || tdDelta <= 0.7)) {
    return "good";
  }

  return "test";
}

function buildMatchWarning(
  requirement: HueForgeRequirementInput,
  filament: FilamentRecord,
  colorDistance: number,
  tdDelta: number | null,
  stockSignal: ReturnType<typeof getStockSignal>,
  hasEnoughStock: boolean,
): string {
  if (stockSignal === "empty" || stockSignal === "archived" || !hasEnoughStock) {
    return `${requirement.colorName} needs ${requirement.requiredGrams}g; ${filament.name} has ${Math.round(filament.estimatedGramsLeft)}g available.`;
  }

  if (tdDelta != null && tdDelta > 0.7) {
    return `${requirement.colorName} TD variance is ${tdDelta.toFixed(1)}; test before production.`;
  }

  if (colorDistance > 22) {
    return `${requirement.colorName} color distance is ${colorDistance}; verify the substitute visually.`;
  }

  if (filament.materialType !== requirement.materialType) {
    return `${requirement.colorName} matched a different material type (${filament.materialType}).`;
  }

  return "";
}

function buildFeasibilityNotes(
  status: HueForgeFeasibilityStatus,
  averageScore: number,
  warnings: readonly string[],
): string {
  if (status === "ready") {
    return `Feasibility: ready. Average match score ${averageScore}. No stock or TD blockers detected.`;
  }

  if (status === "needs-test") {
    return `Feasibility: needs test print. Average match score ${averageScore}. ${warnings[0] ?? "Review TD or color variance before committing."}`;
  }

  return `Feasibility: missing filament. ${warnings[0] ?? "At least one requirement has no usable owned filament match."}`;
}

function parseHexColor(value: string): { readonly blue: number; readonly green: number; readonly red: number } | null {
  const normalized = normalizeHexColor(value);

  if (!HEX_COLOR_PATTERN.test(normalized)) {
    return null;
  }

  return {
    blue: Number.parseInt(normalized.slice(5, 7), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    red: Number.parseInt(normalized.slice(1, 3), 16),
  };
}

export const hueforgeDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "hueforge",
  notes: [
    "HueForge matching uses temporary RGB color distance plus TD, material, and stock heuristics.",
    "Perceptual Delta E can replace RGB distance later if Culori is approved.",
  ],
});
