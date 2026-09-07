import { describe, expect, it } from "vitest";

import { getProductBusinessUsage, getProductCategoryUsage } from "./categoryUsage";

describe("product category configuration", () => {
  it("counts category usage without case sensitivity", () => {
    expect(
      getProductCategoryUsage(
        ["Bookmarks", "Keychains"],
        [{ category: "bookmarks" }, { category: "Bookmarks" }],
      ),
    ).toEqual([
      { category: "Bookmarks", productCount: 2 },
      { category: "Keychains", productCount: 0 },
    ]);
  });

  it("counts business usage across multi-business products without case sensitivity", () => {
    expect(
      getProductBusinessUsage(
        ["Sincerely, Books", "Dear Reader", "Stomping Grounds"],
        [
          { businesses: ["sincerely, books", "Dear Reader"] },
          { businesses: ["Dear Reader"] },
        ],
      ),
    ).toEqual([
      { business: "Sincerely, Books", productCount: 1 },
      { business: "Dear Reader", productCount: 2 },
      { business: "Stomping Grounds", productCount: 0 },
    ]);
  });
});
