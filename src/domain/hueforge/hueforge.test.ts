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

const filament: FilamentRecord = {
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
};

describe("HueForge matching", () => {
  it("calculates simple RGB hex distance", () => {
    expect(getHexColorDistance("#000000", "#000000")).toBe(0);
    expect(getHexColorDistance("#000000", "#ffffff")).toBe(100);
  });

  it("validates author filament requirements", () => {
    expect(validateHueForgeRequirement(requirement).valid).toBe(true);

    const result = validateHueForgeRequirement({
      ...requirement,
      colorName: "",
      hexColor: "not-hex",
      requiredGrams: -1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.colorName).toBeDefined();
    expect(result.errors.hexColor).toBeDefined();
    expect(result.errors.requiredGrams).toBeDefined();
  });

  it("finds excellent owned filament matches", () => {
    const analysis = analyzeHueForgeMatches([requirement], [filament]);

    expect(analysis.feasibilityStatus).toBe("ready");
    expect(analysis.matches[0]?.matchedFilament?.id).toBe(1);
    expect(analysis.matches[0]?.status).toBe("excellent");
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

  it("flags large TD variance as a test-print candidate", () => {
    const analysis = analyzeHueForgeMatches(
      [{ ...requirement, transmissionDistance: 2.1 }],
      [filament],
    );

    expect(analysis.feasibilityStatus).toBe("needs-test");
    expect(analysis.matches[0]?.status).toBe("test");
    expect(analysis.missingWarnings[0]).toContain("TD variance");
  });
});
