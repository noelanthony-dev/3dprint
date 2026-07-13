import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { closeDatabase, getDatabase } from "./index";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeNative = vi.mocked(invoke);

describe("database client", () => {
  beforeEach(async () => {
    await closeDatabase();
    invokeNative.mockReset();
  });

  it("reuses one native database facade until it is reset", async () => {
    const firstDatabase = await getDatabase();
    const reusedDatabase = await getDatabase();

    expect(reusedDatabase).toBe(firstDatabase);

    await closeDatabase();
    const secondDatabase = await getDatabase();
    expect(secondDatabase).not.toBe(firstDatabase);
  });

  it("routes reads and single-statement writes to native commands", async () => {
    invokeNative
      .mockResolvedValueOnce({ lastInsertId: 4, rowsAffected: 1 })
      .mockResolvedValueOnce([{ id: 4 }]);
    const database = await getDatabase();

    await expect(database.execute("UPDATE products SET notes = $1 WHERE id = $2", ["Ready", 4]))
      .resolves.toEqual({ lastInsertId: 4, rowsAffected: 1 });
    await expect(database.select("SELECT id FROM products WHERE id = $1", [4]))
      .resolves.toEqual([{ id: 4 }]);

    expect(invokeNative).toHaveBeenNthCalledWith(1, "db_execute", {
      query: "UPDATE products SET notes = $1 WHERE id = $2",
      values: ["Ready", 4],
    });
    expect(invokeNative).toHaveBeenNthCalledWith(2, "db_select", {
      query: "SELECT id FROM products WHERE id = $1",
      values: [4],
    });
  });

  it("treats closing an unopened database as successful", async () => {
    await closeDatabase();
    await expect(closeDatabase()).resolves.toBe(true);
    expect(invokeNative).not.toHaveBeenCalled();
  });
});
