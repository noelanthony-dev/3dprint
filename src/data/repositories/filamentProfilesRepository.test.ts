import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
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
  it("creates the profile schema before the first query", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createFilamentProfilesRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed[0]?.query).toContain("CREATE TABLE IF NOT EXISTS filament_profiles");
    expect(fakeDb.executed[1]?.query).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_filament_profiles_unique_normalized");
    expect(fakeDb.executed[2]?.query).toContain("CREATE INDEX IF NOT EXISTS idx_filament_profiles_lookup");
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
    const repository = createFilamentProfilesRepository(async () => fakeDb);

    await repository.upsertMany([profileInput]);

    const insert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT OR IGNORE INTO filament_profiles"),
    );
    const update = fakeDb.executed.find((statement) =>
      statement.query.includes("UPDATE filament_profiles"),
    );

    expect(insert?.values).toEqual(["Jayo", "PLA", "Black", "#000000", 0.3]);
    expect(update?.values).toEqual(["Jayo", "PLA", "Black", "#000000", 0.3]);
  });

  it("dedupes equivalent inputs before writing", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createFilamentProfilesRepository(async () => fakeDb);

    await repository.upsertMany([
      profileInput,
      {
        ...profileInput,
        brand: "jayo",
        colorName: "black",
        hexColor: "#000000",
      },
    ]);

    const inserts = fakeDb.executed.filter((statement) =>
      statement.query.includes("INSERT OR IGNORE INTO filament_profiles"),
    );

    expect(inserts).toHaveLength(1);
  });
});
