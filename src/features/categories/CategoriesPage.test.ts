import { describe, expect, it } from "vitest";

import { getProductCategoryUsage } from "./categoryUsage";

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
});
