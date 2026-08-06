import { describe, expect, it } from "vitest";

import { formatAnalysisExportError } from "./MonthlyReportsPage";

describe("reports AI analysis export", () => {
  it("preserves useful filesystem errors", () => {
    expect(formatAnalysisExportError(new Error("Disk is full."))).toBe("Disk is full.");
  });

  it("explains that native export is unavailable in browser preview", () => {
    expect(formatAnalysisExportError(new Error("Cannot invoke db_select outside Tauri."))).toContain(
      "Tauri desktop app",
    );
  });
});
