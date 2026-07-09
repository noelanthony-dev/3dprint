import { converter, differenceCiede2000 } from "culori";

import { createScaffoldModuleStatus } from "@/domain/shared";
import {
  getStockSignal,
  normalizeHexColor,
  type FilamentMaterial,
  type FilamentRecord,
} from "@/domain/inventory";

export type HueForgeMatchStatus = "excellent" | "good" | "test" | "missing";
export type HueForgeFeasibilityStatus = "ready" | "needs-test" | "missing";
export type HueForgeColorFamily =
  | "white"
  | "black"
  | "gray"
  | "brown"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "teal"
  | "purple"
  | "pink"
  | "neutral"
  | "unknown";

export interface HueForgeRequirementInput {
  readonly role: string;
  readonly brand: string;
  readonly materialType: FilamentMaterial;
  readonly colorName: string;
  readonly hexColor: string;
  readonly transmissionDistance: number | null;
  readonly requiredGrams: number;
  readonly layerRange: string;
}

export interface HueForgeRequirementValidationResult {
  readonly errors: Partial<Record<keyof HueForgeRequirementInput, string>>;
  readonly valid: boolean;
}

export interface HueForgeRequirementMatch {
  readonly closestRejectedFilament: FilamentRecord | null;
  readonly colorDistance: number | null;
  readonly deltaE: number | null;
  readonly matchedColorFamily: HueForgeColorFamily | null;
  readonly matchedFilament: FilamentRecord | null;
  readonly matchScore: number;
  readonly rejectionReason: string;
  readonly requiredColorFamily: HueForgeColorFamily;
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

interface ColorAnalysis {
  readonly family: HueForgeColorFamily;
  readonly hue: number | null;
  readonly isNeutral: boolean;
  readonly isVeryDarkNeutral: boolean;
  readonly isVeryLightNeutral: boolean;
  readonly lightness: number | null;
  readonly saturation: number | null;
  readonly validHex: boolean;
}

interface CandidateEvaluation {
  readonly colorFamily: HueForgeColorFamily;
  readonly deltaE: number | null;
  readonly filament: FilamentRecord;
  readonly hasEnoughStock: boolean;
  readonly matchScore: number;
  readonly rejectionReason: string;
  readonly stockSignal: ReturnType<typeof getStockSignal>;
  readonly tdDelta: number | null;
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_RGB_DISTANCE = Math.sqrt(255 ** 2 * 3);
const toHsl = converter("hsl");
const getCiede2000Difference = differenceCiede2000();

const CHROMATIC_FAMILIES: readonly HueForgeColorFamily[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "teal",
  "purple",
  "pink",
];

const ADJACENT_FAMILIES: Partial<Record<HueForgeColorFamily, readonly HueForgeColorFamily[]>> = {
  blue: ["teal", "purple"],
  green: ["yellow", "teal"],
  orange: ["red", "yellow"],
  pink: ["red", "purple"],
  purple: ["blue", "pink"],
  red: ["orange", "pink"],
  teal: ["green", "blue"],
  yellow: ["orange", "green"],
};

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

  if (
    requirement.transmissionDistance == null ||
    !Number.isFinite(requirement.transmissionDistance) ||
    requirement.transmissionDistance < 0
  ) {
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
  const requiredAnalysis = analyzeColor(requirement.colorName, requirement.hexColor);

  if (!requiredAnalysis.validHex) {
    return buildMissingMatch({
      closestRejected: null,
      colorDistance: null,
      rejectionReason: `Needs Hex Input for ${requirement.colorName || "this color"} before matching owned filament.`,
      requirement,
      requiredColorFamily: requiredAnalysis.family,
    });
  }

  const evaluations = filaments
    .map((filament) => evaluateCandidate(requirement, requiredAnalysis, filament))
    .filter((evaluation) => evaluation.deltaE != null);
  const eligible = evaluations
    .filter((evaluation) => evaluation.rejectionReason.length === 0)
    .sort((first, second) => second.matchScore - first.matchScore);
  const usableEligible = eligible.filter(isUsableStockMatch);
  const best = usableEligible[0] ?? eligible[0];

  if (!best) {
    const closestRejected = getClosestRejected(evaluations);

    return buildMissingMatch({
      closestRejected,
      colorDistance: closestRejected?.deltaE ?? null,
      rejectionReason: buildNoEligibleReason(requirement, requiredAnalysis, closestRejected),
      requirement,
      requiredColorFamily: requiredAnalysis.family,
    });
  }

  const status = getMatchStatus(best, requirement, requiredAnalysis);
  const warning = buildMatchWarning(requirement, best, requiredAnalysis, status);

  return {
    closestRejectedFilament: null,
    colorDistance: best.deltaE,
    deltaE: best.deltaE,
    matchedColorFamily: best.colorFamily,
    matchedFilament: best.filament,
    matchScore: status === "missing" ? 0 : best.matchScore,
    rejectionReason: "",
    requirement,
    requiredColorFamily: requiredAnalysis.family,
    status,
    stockSignal: best.stockSignal,
    tdDelta: best.tdDelta,
    warning,
  };
}

function evaluateCandidate(
  requirement: HueForgeRequirementInput,
  requiredAnalysis: ColorAnalysis,
  filament: FilamentRecord,
): CandidateEvaluation {
  const candidateAnalysis = analyzeColor(filament.colorName || filament.name, filament.hexColor);
  const deltaE = getDeltaEColorDistance(requirement.hexColor, filament.hexColor);
  const tdDelta =
    requirement.transmissionDistance == null || filament.transmissionDistance == null
      ? null
      : Math.abs(filament.transmissionDistance - requirement.transmissionDistance);
  const stockSignal = getStockSignal(filament);
  const hasEnoughStock = filament.estimatedGramsLeft >= requirement.requiredGrams;
  const rejectionReason =
    deltaE == null
      ? `Owned filament ${filament.name} needs a valid hex color.`
      : getColorGateRejection(requiredAnalysis, candidateAnalysis, deltaE);

  return {
    colorFamily: candidateAnalysis.family,
    deltaE,
    filament,
    hasEnoughStock,
    matchScore:
      rejectionReason || deltaE == null
        ? 0
        : getWeightedMatchScore(requirement, filament, deltaE, tdDelta, stockSignal, hasEnoughStock),
    rejectionReason,
    stockSignal,
    tdDelta,
  };
}

function buildMissingMatch({
  closestRejected,
  colorDistance,
  rejectionReason,
  requirement,
  requiredColorFamily,
}: {
  readonly closestRejected: CandidateEvaluation | null;
  readonly colorDistance: number | null;
  readonly rejectionReason: string;
  readonly requirement: HueForgeRequirementInput;
  readonly requiredColorFamily: HueForgeColorFamily;
}): HueForgeRequirementMatch {
  return {
    closestRejectedFilament: closestRejected?.filament ?? null,
    colorDistance,
    deltaE: colorDistance,
    matchedColorFamily: null,
    matchedFilament: null,
    matchScore: 0,
    rejectionReason,
    requirement,
    requiredColorFamily,
    status: "missing",
    stockSignal: "missing",
    tdDelta: null,
    warning: rejectionReason,
  };
}

function getColorGateRejection(
  required: ColorAnalysis,
  candidate: ColorAnalysis,
  deltaE: number,
): string {
  if (!candidate.validHex) {
    return "Owned filament needs a valid hex color.";
  }

  if (required.family === "unknown") {
    return deltaE <= 6 ? "" : `Delta E ${formatDeltaE(deltaE)} is above the strict unknown-family limit of 6.0.`;
  }

  if (required.family === "white") {
    if (candidate.family === "white" || (candidate.family === "gray" && candidate.isVeryLightNeutral)) {
      const limit = getDeltaELimit(required.family, candidate.family);

      return deltaE <= limit ? "" : `Delta E ${formatDeltaE(deltaE)} is above ${limit.toFixed(1)}.`;
    }

    return `Wrong color family: required ${formatColorFamily(required.family)}, candidate ${formatColorFamily(candidate.family)}.`;
  }

  if (required.family === "black") {
    if (
      candidate.family !== "brown" &&
      (candidate.family === "black" ||
        ((candidate.family === "gray" || candidate.family === "neutral") && candidate.isVeryDarkNeutral))
    ) {
      const limit = getDeltaELimit(required.family, candidate.family);

      return deltaE <= limit ? "" : `Delta E ${formatDeltaE(deltaE)} is above ${limit.toFixed(1)}.`;
    }

    return `Wrong color family: required ${formatColorFamily(required.family)}, candidate ${formatColorFamily(candidate.family)}.`;
  }

  if (required.family === "gray") {
    if (candidate.family === "gray" || candidate.family === "neutral") {
      const limit = getDeltaELimit(required.family, candidate.family);

      return deltaE <= limit ? "" : `Delta E ${formatDeltaE(deltaE)} is above ${limit.toFixed(1)}.`;
    }

    return `Wrong color family: required ${formatColorFamily(required.family)}, candidate ${formatColorFamily(candidate.family)}.`;
  }

  if (required.family === "brown") {
    if (candidate.family === "brown") {
      return deltaE <= 10 ? "" : `Delta E ${formatDeltaE(deltaE)} is above 10.0.`;
    }

    return `Wrong color family: required ${formatColorFamily(required.family)}, candidate ${formatColorFamily(candidate.family)}.`;
  }

  if (required.family === "neutral") {
    if (["neutral", "gray", "white", "black"].includes(candidate.family)) {
      return deltaE <= 6 ? "" : `Delta E ${formatDeltaE(deltaE)} is above the neutral-family limit of 6.0.`;
    }

    return `Wrong color family: required ${formatColorFamily(required.family)}, candidate ${formatColorFamily(candidate.family)}.`;
  }

  if (candidate.family === required.family) {
    return deltaE <= 10 ? "" : `Delta E ${formatDeltaE(deltaE)} is above 10.0.`;
  }

  if (isAdjacentColorFamily(required.family, candidate.family) && deltaE <= 6) {
    return "";
  }

  return `Wrong color family: required ${formatColorFamily(required.family)}, candidate ${formatColorFamily(candidate.family)}.`;
}

function getWeightedMatchScore(
  requirement: HueForgeRequirementInput,
  filament: FilamentRecord,
  deltaE: number,
  tdDelta: number | null,
  stockSignal: ReturnType<typeof getStockSignal>,
  hasEnoughStock: boolean,
): number {
  const colorScore = getColorScore(deltaE);
  const tdScore = getTdScore(tdDelta);
  const materialScore = filament.materialType === requirement.materialType ? 100 : 0;
  const stockScore = getStockScore(stockSignal, hasEnoughStock);

  return Math.round(colorScore * 0.5 + tdScore * 0.35 + materialScore * 0.1 + stockScore * 0.05);
}

function getColorScore(deltaE: number): number {
  if (deltaE <= 3) {
    return 100 - deltaE * 4;
  }

  if (deltaE <= 6) {
    return 88 - (deltaE - 3) * 6;
  }

  return Math.max(0, 70 - (deltaE - 6) * 10);
}

function getTdScore(tdDelta: number | null): number {
  if (tdDelta == null) {
    return 45;
  }

  if (tdDelta <= 0.5) {
    return 100;
  }

  if (tdDelta <= 1) {
    return 80;
  }

  if (tdDelta <= 1.5) {
    return 55;
  }

  return Math.max(0, 55 - (tdDelta - 1.5) * 35);
}

function getStockScore(stockSignal: ReturnType<typeof getStockSignal>, hasEnoughStock: boolean): number {
  if (!hasEnoughStock || stockSignal === "empty" || stockSignal === "archived") {
    return 0;
  }

  if (stockSignal === "low") {
    return 60;
  }

  if (stockSignal === "sealed") {
    return 85;
  }

  return 100;
}

function getMatchStatus(
  evaluation: CandidateEvaluation,
  requirement: HueForgeRequirementInput,
  requiredAnalysis: ColorAnalysis,
): HueForgeMatchStatus {
  if (
    evaluation.stockSignal === "empty" ||
    evaluation.stockSignal === "archived" ||
    !evaluation.hasEnoughStock ||
    evaluation.deltaE == null ||
    evaluation.deltaE > getDeltaELimit(requiredAnalysis.family, evaluation.colorFamily)
  ) {
    return "missing";
  }

  if (
    requirement.transmissionDistance == null ||
    evaluation.tdDelta == null ||
    requiredAnalysis.family === "unknown" ||
    evaluation.filament.materialType !== requirement.materialType
  ) {
    return "test";
  }

  if (evaluation.deltaE <= 3 && evaluation.tdDelta <= 0.5) {
    return "excellent";
  }

  if (evaluation.deltaE <= 6 && evaluation.tdDelta <= 1) {
    return "good";
  }

  return "test";
}

function isUsableStockMatch(evaluation: CandidateEvaluation): boolean {
  return (
    evaluation.hasEnoughStock &&
    evaluation.stockSignal !== "empty" &&
    evaluation.stockSignal !== "archived"
  );
}

function getDeltaELimit(
  requiredFamily: HueForgeColorFamily,
  candidateFamily: HueForgeColorFamily,
): number {
  if (requiredFamily === "gray" && (candidateFamily === "gray" || candidateFamily === "neutral")) {
    return 30;
  }

  if (
    requiredFamily === "white" &&
    (candidateFamily === "white" || candidateFamily === "gray" || candidateFamily === "neutral")
  ) {
    return 16;
  }

  if (
    requiredFamily === "black" &&
    (candidateFamily === "black" || candidateFamily === "gray" || candidateFamily === "neutral")
  ) {
    return 16;
  }

  return 10;
}

function buildMatchWarning(
  requirement: HueForgeRequirementInput,
  evaluation: CandidateEvaluation,
  requiredAnalysis: ColorAnalysis,
  status: HueForgeMatchStatus,
): string {
  if (!evaluation.hasEnoughStock || evaluation.stockSignal === "empty" || evaluation.stockSignal === "archived") {
    return `${requirement.colorName} needs ${requirement.requiredGrams}g; ${evaluation.filament.name} has ${Math.round(evaluation.filament.estimatedGramsLeft)}g available.`;
  }

  if (requirement.transmissionDistance == null) {
    return `Needs TD Input for ${requirement.colorName}; color match only.`;
  }

  if (evaluation.filament.transmissionDistance == null) {
    return `${evaluation.filament.name} needs TD Input; color match only.`;
  }

  if (requiredAnalysis.family === "unknown") {
    return `${requirement.colorName} color family is unknown; using strict Delta E.`;
  }

  if (evaluation.tdDelta != null && evaluation.tdDelta > 1.5) {
    return `${requirement.colorName} TD variance is ${evaluation.tdDelta.toFixed(1)}; test before production.`;
  }

  if (evaluation.filament.materialType !== requirement.materialType) {
    return `${requirement.colorName} matched a different material type (${evaluation.filament.materialType}).`;
  }

  if (status === "test" && evaluation.deltaE != null && evaluation.deltaE > 6) {
    return `${requirement.colorName} Delta E is ${formatDeltaE(evaluation.deltaE)}; test before production.`;
  }

  return "";
}

function buildNoEligibleReason(
  requirement: HueForgeRequirementInput,
  requiredAnalysis: ColorAnalysis,
  closestRejected: CandidateEvaluation | null,
): string {
  if (!closestRejected) {
    return `Missing Close Color. No owned filament inventory is available for ${requirement.colorName}.`;
  }

  if (closestRejected.rejectionReason.startsWith("Wrong color family")) {
    return `Missing Close Color. Closest owned color was ${closestRejected.filament.colorName} (${formatColorFamily(closestRejected.colorFamily)}), but required family is ${formatColorFamily(requiredAnalysis.family)}.`;
  }

  return `Missing Close Color. Closest owned color was ${closestRejected.filament.colorName}; ${closestRejected.rejectionReason}`;
}

function getClosestRejected(
  evaluations: readonly CandidateEvaluation[],
): CandidateEvaluation | null {
  return evaluations
    .filter((evaluation) => evaluation.deltaE != null)
    .sort((first, second) => (first.deltaE ?? Number.POSITIVE_INFINITY) - (second.deltaE ?? Number.POSITIVE_INFINITY))[0] ?? null;
}

function analyzeColor(colorName: string, hexColor: string): ColorAnalysis {
  const normalizedHex = normalizeHexColor(hexColor);
  const validHex = HEX_COLOR_PATTERN.test(normalizedHex);
  const hsl = validHex ? toHsl(normalizedHex) : undefined;
  const hue = hsl?.h == null ? null : normalizeHue(hsl.h);
  const saturation = hsl?.s ?? null;
  const lightness = hsl?.l ?? null;
  const familyFromName = classifyColorName(colorName);
  const fallbackFamily = validHex
    ? classifyColorFromHsl(hue, saturation, lightness)
    : familyFromName ?? "unknown";
  const family = familyFromName ?? fallbackFamily;
  const isNeutral = saturation == null ? false : saturation <= 0.16;
  const isVeryDarkNeutral =
    saturation != null && lightness != null && saturation <= 0.24 && lightness <= 0.16;
  const isVeryLightNeutral =
    saturation != null && lightness != null && saturation <= 0.18 && lightness >= 0.88;

  return {
    family,
    hue,
    isNeutral,
    isVeryDarkNeutral,
    isVeryLightNeutral,
    lightness,
    saturation,
    validHex,
  };
}

function classifyColorName(colorName: string): HueForgeColorFamily | null {
  const normalized = ` ${colorName.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;

  if (/\b(white|ivory|cream|bone|pearl|snow|porcelain)\b/.test(normalized) || normalized.includes(" off white ")) {
    return "white";
  }

  if (/\b(brown|cocoa|chocolate|coffee|mocha|walnut|wood|tan|beige|sand|caramel|khaki)\b/.test(normalized)) {
    return "brown";
  }

  if (/\b(black|ebony|noir|coal)\b/.test(normalized)) {
    return "black";
  }

  if (/\b(gray|grey|silver|ash|graphite|charcoal|slate|steel)\b/.test(normalized)) {
    return "gray";
  }

  if (/\b(pink|rose|magenta|fuchsia|salmon)\b/.test(normalized)) {
    return "pink";
  }

  if (/\b(purple|violet|lavender|lilac|plum)\b/.test(normalized)) {
    return "purple";
  }

  if (/\b(teal|cyan|aqua|turquoise)\b/.test(normalized)) {
    return "teal";
  }

  if (/\b(blue|navy|azure|cobalt|sapphire)\b/.test(normalized)) {
    return "blue";
  }

  if (/\b(green|lime|olive|jade|emerald)\b/.test(normalized)) {
    return "green";
  }

  if (/\b(yellow|gold|lemon)\b/.test(normalized)) {
    return "yellow";
  }

  if (/\b(orange|amber|coral)\b/.test(normalized)) {
    return "orange";
  }

  if (/\b(red|scarlet|crimson|burgundy|maroon)\b/.test(normalized)) {
    return "red";
  }

  return null;
}

function classifyColorFromHsl(
  hue: number | null,
  saturation: number | null,
  lightness: number | null,
): HueForgeColorFamily {
  if (saturation == null || lightness == null) {
    return "unknown";
  }

  if (saturation <= 0.16) {
    if (lightness >= 0.82) {
      return "white";
    }

    if (lightness <= 0.16) {
      return "black";
    }

    return "gray";
  }

  if (hue == null) {
    return "neutral";
  }

  if (lightness < 0.55 && hue >= 15 && hue < 55) {
    return "brown";
  }

  if (hue < 15 || hue >= 345) {
    return "red";
  }

  if (hue < 45) {
    return "orange";
  }

  if (hue < 70) {
    return "yellow";
  }

  if (hue < 165) {
    return "green";
  }

  if (hue < 200) {
    return "teal";
  }

  if (hue < 255) {
    return "blue";
  }

  if (hue < 300) {
    return "purple";
  }

  return "pink";
}

function getDeltaEColorDistance(firstHex: string, secondHex: string): number | null {
  const first = normalizeHexColor(firstHex);
  const second = normalizeHexColor(secondHex);

  if (!HEX_COLOR_PATTERN.test(first) || !HEX_COLOR_PATTERN.test(second)) {
    return null;
  }

  return roundToOne(getCiede2000Difference(first, second));
}

function isAdjacentColorFamily(
  requiredFamily: HueForgeColorFamily,
  candidateFamily: HueForgeColorFamily,
): boolean {
  return ADJACENT_FAMILIES[requiredFamily]?.includes(candidateFamily) ?? false;
}

export function formatHueForgeColorFamily(family: HueForgeColorFamily): string {
  if (family === "white") {
    return "white/off-white";
  }

  if (family === "gray") {
    return "gray/silver";
  }

  if (family === "teal") {
    return "teal/cyan";
  }

  return family;
}

const formatColorFamily = formatHueForgeColorFamily;

function formatDeltaE(deltaE: number): string {
  return deltaE.toFixed(1);
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildFeasibilityNotes(
  status: HueForgeFeasibilityStatus,
  averageScore: number,
  warnings: readonly string[],
): string {
  if (status === "ready") {
    return `Feasibility: ready. Average match score ${averageScore}. No color, stock, or TD blockers detected.`;
  }

  if (status === "needs-test") {
    return `Feasibility: needs test print. Average match score ${averageScore}. ${warnings[0] ?? "Review Delta E, TD, or material variance before committing."}`;
  }

  return `Feasibility: missing filament. ${warnings[0] ?? "At least one requirement has no close owned color match."}`;
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
    "HueForge matching uses color-family gating before TD, material, stock, and CIEDE2000 Delta E scoring.",
    "Wrong color families are rejected before ranking so close TD cannot override a bad shade.",
  ],
});
