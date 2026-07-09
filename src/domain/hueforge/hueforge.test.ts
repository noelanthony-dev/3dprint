import { describe, expect, it } from "vitest";

import type { FilamentRecord } from "@/domain/inventory";

import {
  analyzeHueForgeMatches,
  getHexColorDistance,
  validateHueForgeRequirement,
  type HueForgeRequirementInput,
} from "./index";

const requirement: HueForgeRequirementInput = {
  brand: "Bambu",
  colorName: "Black",
  hexColor: "#111111",
  layerRange: "L0-L12",
  materialType: "PLA",
  requiredGrams: 12,
  role: "Base",
  transmissionDistance: 0.6,
};

const filament: FilamentRecord = makeFilament({
  colorName: "Matte Black",
  hexColor: "#101010",
  id: 1,
  name: "Matte Black",
  transmissionDistance: 0.5,
});

describe("HueForge matching", () => {
  it("calculates simple RGB hex distance", () => {
    expect(getHexColorDistance("#000000", "#000000")).toBe(0);
    expect(getHexColorDistance("#000000", "#ffffff")).toBe(100);
  });

  it("validates author filament requirements before saving", () => {
    expect(validateHueForgeRequirement(requirement).valid).toBe(true);

    const result = validateHueForgeRequirement({
      ...requirement,
      colorName: "",
      hexColor: "not-hex",
      requiredGrams: -1,
      transmissionDistance: null,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.colorName).toBeDefined();
    expect(result.errors.hexColor).toBeDefined();
    expect(result.errors.requiredGrams).toBeDefined();
    expect(result.errors.transmissionDistance).toBeDefined();
  });

  it("finds excellent owned filament matches", () => {
    const analysis = analyzeHueForgeMatches([requirement], [filament]);

    expect(analysis.feasibilityStatus).toBe("ready");
    expect(analysis.matches[0]?.matchedFilament?.id).toBe(1);
    expect(analysis.matches[0]?.status).toBe("excellent");
    expect(analysis.matches[0]?.deltaE).toBeLessThanOrEqual(3);
  });

  it("does not recommend pink for matte white", () => {
    const analysis = analyzeHueForgeMatches(
      [
        {
          ...requirement,
          colorName: "Matte White",
          hexColor: "#ffffff",
          transmissionDistance: 3.8,
        },
      ],
      [
        makeFilament({
          colorName: "Pink",
          hexColor: "#f472a7",
          id: 2,
          name: "Bambu PLA Basic - Pink",
          transmissionDistance: 3.8,
        }),
      ],
    );

    expect(analysis.matches[0]?.status).toBe("missing");
    expect(analysis.matches[0]?.matchedFilament).toBeNull();
    expect(analysis.matches[0]?.closestRejectedFilament?.colorName).toBe("Pink");
    expect(analysis.matches[0]?.warning).toContain("required family is white/off-white");
  });

  it("does not recommend brown for black", () => {
    const analysis = analyzeHueForgeMatches(
      [requirement],
      [
        makeFilament({
          colorName: "Cocoa Brown",
          hexColor: "#705139",
          id: 3,
          name: "Bambu PLA Cocoa Brown",
          transmissionDistance: 0.6,
        }),
      ],
    );

    expect(analysis.matches[0]?.status).toBe("missing");
    expect(analysis.matches[0]?.matchedFilament).toBeNull();
    expect(analysis.matches[0]?.warning).toContain("required family is black");
  });

  it("does not recommend colorful filaments for gray or silver", () => {
    const analysis = analyzeHueForgeMatches(
      [
        {
          ...requirement,
          colorName: "Silver",
          hexColor: "#8d8f91",
          transmissionDistance: 1.2,
        },
      ],
      [
        makeFilament({ colorName: "Blue", hexColor: "#1f4fbf", id: 4, name: "Blue", transmissionDistance: 1.2 }),
        makeFilament({ colorName: "Green", hexColor: "#2e8b57", id: 5, name: "Green", transmissionDistance: 1.2 }),
        makeFilament({ colorName: "Brown", hexColor: "#6b4423", id: 6, name: "Brown", transmissionDistance: 1.2 }),
      ],
    );

    expect(analysis.matches[0]?.status).toBe("missing");
    expect(analysis.matches[0]?.matchedFilament).toBeNull();
    expect(analysis.matches[0]?.warning).toContain("required family is gray/silver");
  });

  it("only matches brown requirements to brown-family candidates", () => {
    const analysis = analyzeHueForgeMatches(
      [
        {
          ...requirement,
          colorName: "Warm Brown",
          hexColor: "#5c3a26",
          transmissionDistance: 1.1,
        },
      ],
      [
        makeFilament({ colorName: "Black", hexColor: "#111111", id: 7, name: "Black", transmissionDistance: 1.1 }),
        makeFilament({ colorName: "Cocoa Brown", hexColor: "#68452f", id: 8, name: "Cocoa Brown", transmissionDistance: 1.1 }),
      ],
    );

    expect(analysis.matches[0]?.matchedFilament?.id).toBe(8);
    expect(analysis.matches[0]?.matchedColorFamily).toBe("brown");
  });

  it("allows close color with far TD as a test-print candidate", () => {
    const analysis = analyzeHueForgeMatches(
      [
        {
          ...requirement,
          colorName: "Matte White",
          hexColor: "#ffffff",
          transmissionDistance: 0.2,
        },
      ],
      [
        makeFilament({
          colorName: "Warm White",
          hexColor: "#fdfbf2",
          id: 9,
          name: "Warm White",
          transmissionDistance: 3,
        }),
      ],
    );

    expect(analysis.feasibilityStatus).toBe("needs-test");
    expect(analysis.matches[0]?.matchedFilament?.id).toBe(9);
    expect(analysis.matches[0]?.status).toBe("test");
    expect(analysis.matches[0]?.warning).toContain("TD variance");
  });

  it("prefers usable milky white over archived perfect white", () => {
    const analysis = analyzeHueForgeMatches(
      [
        {
          ...requirement,
          colorName: "White",
          hexColor: "#ffffff",
          materialType: "PLA",
          requiredGrams: 15.2,
          transmissionDistance: 0.6,
        },
      ],
      [
        makeFilament({
          colorName: "White",
          estimatedGramsLeft: 0,
          hexColor: "#ffffff",
          id: 12,
          materialType: "PLA+",
          name: "eSun PLA+ White",
          spoolStatus: "archived",
          transmissionDistance: 3,
        }),
        makeFilament({
          colorName: "Milky White",
          estimatedGramsLeft: 1000,
          hexColor: "#fffffb",
          id: 13,
          materialType: "PLA+",
          name: "eSun PLA+ Milky White",
          spoolStatus: "sealed",
          transmissionDistance: 5,
        }),
      ],
    );

    expect(analysis.matches[0]?.matchedFilament?.id).toBe(13);
    expect(analysis.matches[0]?.stockSignal).toBe("sealed");
    expect(analysis.matches[0]?.status).toBe("test");
  });

  it("allows silver as a risky gray-family match for meta gray", () => {
    const analysis = analyzeHueForgeMatches(
      [
        {
          ...requirement,
          colorName: "Meta Gray",
          hexColor: "#626164",
          materialType: "PLA+",
          requiredGrams: 4.2,
          transmissionDistance: 2.1,
        },
      ],
      [
        makeFilament({
          colorName: "Basic - Silver",
          estimatedGramsLeft: 300,
          hexColor: "#a6a9aa",
          id: 14,
          materialType: "PLA",
          name: "Bambu PLA Basic - Silver",
          transmissionDistance: 0.5,
        }),
      ],
    );

    expect(analysis.matches[0]?.matchedFilament?.id).toBe(14);
    expect(analysis.matches[0]?.matchedColorFamily).toBe("gray");
    expect(analysis.matches[0]?.status).toBe("test");
    expect(analysis.matches[0]?.deltaE).toBeGreaterThan(10);
  });

  it("allows color matching with missing TD but caps the status at test", () => {
    const analysis = analyzeHueForgeMatches(
      [{ ...requirement, transmissionDistance: null }],
      [filament],
    );

    expect(analysis.feasibilityStatus).toBe("needs-test");
    expect(analysis.matches[0]?.matchedFilament?.id).toBe(1);
    expect(analysis.matches[0]?.status).toBe("test");
    expect(analysis.matches[0]?.warning).toContain("Needs TD Input");
  });

  it("requires valid hex before recommending a match", () => {
    const analysis = analyzeHueForgeMatches(
      [{ ...requirement, hexColor: "not-hex" }],
      [filament],
    );

    expect(analysis.feasibilityStatus).toBe("missing");
    expect(analysis.matches[0]?.matchedFilament).toBeNull();
    expect(analysis.matches[0]?.warning).toContain("Needs Hex Input");
  });

  it("ranks eligible candidates after the color-family gate", () => {
    const analysis = analyzeHueForgeMatches(
      [requirement],
      [
        makeFilament({
          colorName: "Black",
          hexColor: "#101010",
          id: 10,
          name: "Excellent Color Far TD",
          transmissionDistance: 3.5,
        }),
        makeFilament({
          colorName: "Black",
          hexColor: "#202020",
          id: 11,
          name: "Good Color Close TD",
          transmissionDistance: 0.6,
        }),
      ],
    );

    expect(analysis.matches[0]?.matchedFilament?.id).toBe(11);
    expect(analysis.matches[0]?.matchScore).toBeGreaterThan(analysis.matches[0]?.deltaE ?? 0);
  });

  it("warns when stock is not enough for a requirement", () => {
    const analysis = analyzeHueForgeMatches(
      [{ ...requirement, requiredGrams: 900 }],
      [filament],
    );

    expect(analysis.feasibilityStatus).toBe("missing");
    expect(analysis.matches[0]?.status).toBe("missing");
    expect(analysis.missingWarnings[0]).toContain("needs 900g");
  });
});

function makeFilament(overrides: Partial<FilamentRecord>): FilamentRecord {
  return {
    brand: "Sunlu",
    colorName: "Matte Black",
    createdAt: "2026-07-01T00:00:00.000Z",
    estimatedGramsLeft: 840,
    hexColor: "#101010",
    id: 1,
    lowStockThresholdGrams: 200,
    materialType: "PLA",
    name: "Matte Black",
    notes: "",
    purchaseSource: "",
    spoolCost: 18,
    spoolStatus: "open",
    startingGrams: 1000,
    transmissionDistance: 0.5,
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}
