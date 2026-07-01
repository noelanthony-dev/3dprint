import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { HueForgeRequirementMatch } from "@/domain/hueforge";

import { createHueForgeRepository } from "./hueForgeRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    return [] as T;
  }
}

const match: HueForgeRequirementMatch = {
  colorDistance: 1,
  matchedFilament: {
    brand: "Sunlu",
    colorName: "Matte Black",
    createdAt: "2026-07-01T00:00:00.000Z",
    estimatedGramsLeft: 840,
    hexColor: "#101010",
    id: 7,
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
  },
  matchScore: 96,
  requirement: {
    brand: "Bambu",
    colorName: "Black",
    hexColor: "#111111",
    layerRange: "L0-L12",
    materialType: "PLA",
    requiredGrams: 12,
    role: "Base",
    transmissionDistance: 0.6,
  },
  status: "excellent",
  stockSignal: "ready",
  tdDelta: 0.1,
  warning: "",
};

describe("HueForge repository", () => {
  it("creates HueForge tables before saving analysis", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createHueForgeRepository(async () => fakeDb);

    await repository.saveAnalysis({
      feasibilityNotes: "Ready.",
      feasibilityStatus: "ready",
      matches: [match],
      missingWarnings: [],
      productId: 3,
    });

    expect(fakeDb.executed[0]?.query).toContain("CREATE TABLE IF NOT EXISTS hueforge_design_analyses");
    expect(fakeDb.executed[1]?.query).toContain("CREATE TABLE IF NOT EXISTS author_filament_requirements");
    expect(fakeDb.executed[2]?.query).toContain("CREATE INDEX IF NOT EXISTS idx_author_filament_requirements_product");
  });

  it("stores analysis and requirement matches with bind values", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createHueForgeRepository(async () => fakeDb);

    await repository.saveAnalysis({
      feasibilityNotes: "Ready.",
      feasibilityStatus: "ready",
      matches: [match],
      missingWarnings: [],
      productId: 3,
    });

    const analysisInsert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO hueforge_design_analyses"),
    );
    const requirementInsert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO author_filament_requirements"),
    );

    expect(fakeDb.executed.some((statement) => statement.query === "BEGIN IMMEDIATE")).toBe(true);
    expect(fakeDb.executed.some((statement) => statement.query === "COMMIT")).toBe(true);
    expect(analysisInsert?.values).toEqual([3, "ready", "Ready.", ""]);
    expect(requirementInsert?.query).not.toContain("Bambu");
    expect(requirementInsert?.values[0]).toBe(3);
    expect(requirementInsert?.values[10]).toBe("Sunlu Matte Black");
    expect(requirementInsert?.values[12]).toBe("excellent");
  });
});
