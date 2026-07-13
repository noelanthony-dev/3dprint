import { describe, expect, it, vi } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { FilamentProfileCommand } from "@/data/db/nativeWorkflows";
import type { FilamentProfileInput } from "@/domain/inventory";

import { createFilamentProfilesRepository } from "./filamentProfilesRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  private readonly rows = [
    {
      brand: "Anycubic",
      color_name: "Pantone Peach Fuzz",
      created_at: "2026-07-01T00:00:00.000Z",
      hex_color: "#f4b9a6",
      id: 2,
      material_type: "PLA",
      transmission_distance: 4.2,
      updated_at: "2026-07-01T00:00:00.000Z",
    },
    {
      brand: "Jayo",
      color_name: "Black",
      created_at: "2026-07-01T00:00:00.000Z",
      hex_color: "#000000",
      id: 1,
      material_type: "PLA",
      transmission_distance: 0.3,
      updated_at: "2026-07-01T00:00:00.000Z",
    },
  ];

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    return this.rows as T;
  }
}

const profileInput: FilamentProfileInput = {
  brand: " Jayo ",
  colorName: " Black ",
  hexColor: "000000",
  materialType: "PLA",
  transmissionDistance: 0.3,
};

describe("filament profiles repository", () => {
  it("queries profiles without frontend schema writes", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createFilamentProfilesRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed).toEqual([]);
    expect(fakeDb.selected[0]?.query).toContain("FROM filament_profiles");
    expect(fakeDb.selected[0]?.query).toContain("ORDER BY");
  });

  it("maps listed profile rows to domain records", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createFilamentProfilesRepository(async () => fakeDb);

    const profiles = await repository.list();

    expect(profiles[0]).toMatchObject({
      brand: "Anycubic",
      colorName: "Pantone Peach Fuzz",
      hexColor: "#f4b9a6",
      materialType: "PLA",
      transmissionDistance: 4.2,
    });
  });

  it("inserts and updates normalized profile values", async () => {
    const fakeDb = new FakeDatabase();
    const upserter = vi.fn(async (_inputs: readonly FilamentProfileCommand[]) => undefined);
    const repository = createFilamentProfilesRepository(async () => fakeDb, upserter);

    await repository.upsertMany([profileInput]);

    expect(upserter).toHaveBeenCalledOnce();
    expect(upserter).toHaveBeenCalledWith([
      { brand: "Jayo", colorName: "Black", hexColor: "#000000", materialType: "PLA", transmissionDistance: 0.3 },
    ]);
    expect(fakeDb.executed).toEqual([]);
  });

  it("dedupes equivalent inputs before writing", async () => {
    const fakeDb = new FakeDatabase();
    const upserter = vi.fn(async (_inputs: readonly FilamentProfileCommand[]) => undefined);
    const repository = createFilamentProfilesRepository(async () => fakeDb, upserter);

    await repository.upsertMany([
      profileInput,
      {
        ...profileInput,
        brand: "jayo",
        colorName: "black",
        hexColor: "#000000",
      },
    ]);

    expect(upserter).toHaveBeenCalledOnce();
    expect(upserter.mock.calls[0]?.[0]).toHaveLength(1);
  });
});
