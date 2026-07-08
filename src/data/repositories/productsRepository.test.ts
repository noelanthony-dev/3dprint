import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { ProductInput } from "@/domain/products";

import { createProductsRepository } from "./productsRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];
  readonly columns: readonly { readonly name: string }[];

  private row = {
    author_name: "Studio_3D",
    category: "Bookmarks",
    commercial_license_status: "commercial-ok",
    created_at: "2026-07-01T00:00:00.000Z",
    design_name: "Red Blossom Bookmark",
    filament_mode: "hueforge",
    hueforge_filaments: JSON.stringify([
      {
        brand: "Jayo",
        colorName: "Black",
        hexColor: "#111111",
        layerRange: "L0-L8",
        materialType: "PLA",
        purchaseSource: "https://example.com/jayo-black",
        requiredGrams: 12,
        role: "Shadow",
        transmissionDistance: 0.3,
      },
    ]),
    id: 1,
    image_reference: "red-blossom-bookmark.png",
    license_billing_interval: "monthly",
    license_cost_amount: 350,
    notes: "",
    sale_unit: "piece",
    source_link: "https://printables.com/model/red-blossom-bookmark",
    updated_at: "2026-07-01T00:00:00.000Z",
  };

  constructor(columns: readonly { readonly name: string }[] = [
    { name: "license_cost_amount" },
    { name: "license_billing_interval" },
    { name: "hueforge_filaments" },
    { name: "filament_mode" },
  ]) {
    this.columns = columns;
  }

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    if (query.includes("INSERT INTO products")) {
      return { lastInsertId: 1, rowsAffected: 1 };
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    if (query.includes("PRAGMA table_info")) {
      return this.columns as T;
    }

    return [this.row] as T;
  }
}

const input: ProductInput = {
  authorName: " Studio_3D ",
  category: "Bookmarks",
  commercialLicenseStatus: "commercial-ok",
  designName: " Red Blossom Bookmark ",
  filamentMode: "hueforge",
  hueForgeFilaments: [
    {
      brand: " Jayo ",
      colorName: " Black ",
      hexColor: "#111111",
      layerRange: " L0-L8 ",
      materialType: "PLA",
      purchaseSource: " https://example.com/jayo-black ",
      requiredGrams: 12,
      role: " Shadow ",
      transmissionDistance: 0.3,
    },
  ],
  imageReference: "red-blossom-bookmark.png",
  licenseBillingInterval: "monthly",
  licenseCostAmount: 350,
  notes: "",
  saleUnit: "piece",
  sourceLink: "https://printables.com/model/red-blossom-bookmark",
};

describe("products repository", () => {
  it("creates the products schema before the first query", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createProductsRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed[0]?.query).toContain("CREATE TABLE IF NOT EXISTS products");
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("CREATE INDEX IF NOT EXISTS idx_products_category_design"),
    )).toBe(true);
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("CREATE INDEX IF NOT EXISTS idx_products_license_status"),
    )).toBe(true);
    expect(fakeDb.selected[0]?.query).toContain("PRAGMA table_info");
    expect(fakeDb.selected.at(-1)?.query).toContain("FROM products");
  });

  it("adds filament mode to existing product tables", async () => {
    const fakeDb = new FakeDatabase([
      { name: "license_cost_amount" },
      { name: "license_billing_interval" },
      { name: "hueforge_filaments" },
    ]);
    const repository = createProductsRepository(async () => fakeDb);

    await repository.list();

    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("ALTER TABLE products ADD COLUMN filament_mode"),
    )).toBe(true);
  });

  it("binds create values instead of interpolating design names", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createProductsRepository(async () => fakeDb);

    await repository.create(input);

    const insert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO products"),
    );

    expect(insert?.query).toContain("VALUES ($1, $2, $3");
    expect(insert?.query).not.toContain("Red Blossom Bookmark");
    expect(insert?.values[0]).toBe("Red Blossom Bookmark");
    expect(insert?.values[2]).toBe("Studio_3D");
    expect(insert?.values[5]).toBe("commercial-ok");
    expect(insert?.values[6]).toBe(350);
    expect(insert?.values[7]).toBe("monthly");
    expect(insert?.values[8]).toBe("hueforge");
    expect(JSON.parse(String(insert?.values[9]))).toEqual([
      {
        brand: "Jayo",
        colorName: "Black",
        hexColor: "#111111",
        layerRange: "L0-L8",
        materialType: "PLA",
        purchaseSource: "https://example.com/jayo-black",
        requiredGrams: 12,
        role: "Shadow",
        transmissionDistance: 0.3,
      },
    ]);
  });

  it("deletes a product by id", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createProductsRepository(async () => fakeDb);

    await repository.delete(7);

    const deleteStatement = fakeDb.executed.find((statement) =>
      statement.query.includes("DELETE FROM products"),
    );

    expect(deleteStatement?.values).toEqual([7]);
  });

  it("preserves basic filament mode and grams-only rows", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createProductsRepository(async () => fakeDb);

    await repository.create({
      ...input,
      filamentMode: "basic",
      hueForgeFilaments: [
        {
          brand: "",
          colorName: "",
          hexColor: "",
          layerRange: "",
          materialType: "Other",
          purchaseSource: "",
          requiredGrams: 8,
          role: "",
          transmissionDistance: null,
        },
      ],
    });

    const insert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO products"),
    );

    expect(insert?.values[8]).toBe("basic");
    expect(JSON.parse(String(insert?.values[9]))).toEqual([
      {
        brand: "",
        colorName: "",
        hexColor: "",
        layerRange: "",
        materialType: "Other",
        purchaseSource: "",
        requiredGrams: 8,
        role: "",
        transmissionDistance: null,
      },
    ]);
  });
});
