import Database from "@tauri-apps/plugin-sql";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { closeDatabase, getDatabase, type SqlDatabase } from "./index";

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(),
  },
}));

const loadDatabase = vi.mocked(Database.load);

describe("database client", () => {
  beforeEach(async () => {
    await closeDatabase();
    loadDatabase.mockReset();
  });

  it("reuses the database promise until the pool is closed", async () => {
    const firstClose = vi.fn().mockResolvedValue(true);
    const secondClose = vi.fn().mockResolvedValue(true);
    const firstDatabase = createFakeDatabase(firstClose);
    const secondDatabase = createFakeDatabase(secondClose);

    loadDatabase
      .mockResolvedValueOnce(firstDatabase as Awaited<ReturnType<typeof Database.load>>)
      .mockResolvedValueOnce(secondDatabase as Awaited<ReturnType<typeof Database.load>>);

    await expect(getDatabase()).resolves.toBe(firstDatabase);
    await expect(getDatabase()).resolves.toBe(firstDatabase);
    expect(loadDatabase).toHaveBeenCalledTimes(1);

    await expect(closeDatabase()).resolves.toBe(true);
    expect(firstClose).toHaveBeenCalledTimes(1);

    await expect(getDatabase()).resolves.toBe(secondDatabase);
    expect(loadDatabase).toHaveBeenCalledTimes(2);
  });

  it("treats closing an unopened database as successful", async () => {
    await expect(closeDatabase()).resolves.toBe(true);
    expect(loadDatabase).not.toHaveBeenCalled();
  });
});

function createFakeDatabase(close: () => Promise<boolean>): SqlDatabase {
  return {
    close,
    execute: vi.fn(),
    select: vi.fn(),
  };
}
