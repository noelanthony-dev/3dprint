import { describe, expect, it, vi } from "vitest";
import { exportSalesCsv } from "./index";

describe("native sales CSV export", () => {
  it("writes the exact captured CSV after choosing a destination", async () => {
    const saveFile = vi.fn(async () => "/tmp/sales.csv");
    const writeFile = vi.fn(async () => undefined);
    expect(await exportSalesCsv("filtered-sales.csv", "captured CSV", { saveFile, writeFile }))
      .toEqual({ canceled: false });
    expect(saveFile).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "filtered-sales.csv" }));
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith("/tmp/sales.csv", "captured CSV");
  });

  it("does not write when the dialog is canceled", async () => {
    const writeFile = vi.fn(async () => undefined);
    expect(await exportSalesCsv("sales.csv", "CSV", { saveFile: async () => null, writeFile }))
      .toEqual({ canceled: true });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("propagates failures rather than reporting success", async () => {
    await expect(exportSalesCsv("sales.csv", "CSV", {
      saveFile: async () => "/tmp/sales.csv",
      writeFile: async () => { throw new Error("Disk full"); },
    })).rejects.toThrow("Disk full");
  });
});
