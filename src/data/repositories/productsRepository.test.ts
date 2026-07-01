import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { ProductInput } from "@/domain/products";

import { createProductsRepository } from "./productsRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  private row = {
    author_name: "Studio_3D",
    category: "Accessory",
    commercial_license_status: "commercial-ok",
    created_at: "2026-07-01T00:00:00.000Z",
    design_name: "Red Blossom Bookmark",
    id: 1,
    image_reference: "red-blossom-bookmark.png",
    license_notes: "Commercial license purchased.",
    notes: "",
    sale_unit: "piece",
    source_link: "https://printables.com/model/red-blossom-bookmark",
    updated_at: "2026-07-01T00:00:00.000Z",
  };

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    if (query.includes("INSERT INTO products")) {
      return { lastInsertId: 1, rowsAffected: 1 };
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    return [this.row] as T;
  }
}

const input: ProductInput = {
  authorName: " Studio_3D ",
  category: "Accessory",
  commercialLicenseStatus: "commercial-ok",
  designName: " Red Blossom Bookmark ",
  imageReference: "red-blossom-bookmark.png",
  licenseNotes: "Commercial license purchased.",
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
    expect(fakeDb.executed[1]?.query).toContain("CREATE INDEX IF NOT EXISTS idx_products_category_design");
    expect(fakeDb.executed[2]?.query).toContain("CREATE INDEX IF NOT EXISTS idx_products_license_status");
    expect(fakeDb.selected[0]?.query).toContain("FROM products");
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
  });
});
