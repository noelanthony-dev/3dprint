import { describe, expect, it, vi } from "vitest";

import type { AnalysisExportSnapshot } from "@/data/repositories";
import type { AnalysisSourceData } from "@/domain/analysis";
import { DEFAULT_APP_SETTINGS } from "@/domain/settings";

import {
  exportAiAnalysisPack,
  timestampForFileName,
  type AnalysisExportDependencies,
} from "./index";

describe("AI analysis export infrastructure", () => {
  it("returns cancellation without loading or writing data", async () => {
    const dependencies = createDependencies({ saveFile: vi.fn(async () => null) });

    const result = await exportAiAnalysisPack(dependencies);

    expect(result).toMatchObject({ canceled: true, filePath: null, recordCount: 0 });
    expect(dependencies.loadSnapshot).not.toHaveBeenCalled();
    expect(dependencies.writeFile).not.toHaveBeenCalled();
  });

  it("writes one readable, versioned JSON file", async () => {
    const dependencies = createDependencies();

    const result = await exportAiAnalysisPack(dependencies);
    const saveOptions = vi.mocked(dependencies.saveFile).mock.calls[0]![0];
    const [filePath, contents] = vi.mocked(dependencies.writeFile).mock.calls[0]!;
    const parsed = JSON.parse(contents);

    expect(saveOptions.defaultPath).toBe("printops-ai-analysis-2026-08-07T04-00-00Z.json");
    expect(filePath).toBe("/tmp/analysis.json");
    expect(contents.endsWith("\n")).toBe(true);
    expect(parsed).toMatchObject({
      format: "printops.ai-analysis",
      formatVersion: 1,
      metadata: { generatedAt: "2026-08-07T04:00:00.000Z" },
    });
    expect(result).toMatchObject({
      canceled: false,
      filePath: "/tmp/analysis.json",
    });
  });

  it("propagates write failures instead of reporting success", async () => {
    const dependencies = createDependencies({
      writeFile: vi.fn(async () => {
        throw new Error("Disk full.");
      }),
    });

    await expect(exportAiAnalysisPack(dependencies)).rejects.toThrow("Disk full.");
  });

  it("creates filesystem-safe timestamps", () => {
    expect(timestampForFileName("2026-08-07T04:05:06.789Z")).toBe("2026-08-07T04-05-06Z");
  });
});

function createDependencies(
  overrides: Partial<AnalysisExportDependencies> = {},
): AnalysisExportDependencies {
  return {
    loadSnapshot: vi.fn(async (): Promise<AnalysisExportSnapshot> => ({
      settings: DEFAULT_APP_SETTINGS,
      sourceData: emptySourceData(),
    })),
    now: () => new Date("2026-08-07T04:00:00.000Z"),
    saveFile: vi.fn(async () => "/tmp/analysis.json"),
    writeFile: vi.fn(async () => undefined),
    ...overrides,
  };
}

function emptySourceData(): AnalysisSourceData {
  return {
    addOnAdjustments: [],
    addOns: [],
    expenses: [],
    filamentAdjustments: [],
    filamentProfiles: [],
    filaments: [],
    finishedGoodAdjustments: [],
    finishedGoods: [],
    hueForgeAnalyses: [],
    hueForgeMissingRequirements: [],
    hueForgeRequirements: [],
    memberships: [],
    printProfiles: [],
    productionAddOnCorrections: [],
    productionAddOnDeductions: [],
    productionFilamentDeductions: [],
    productionRuns: [],
    products: [],
    saleStockMovements: [],
    sales: [],
    shoppingListItems: [],
  };
}
