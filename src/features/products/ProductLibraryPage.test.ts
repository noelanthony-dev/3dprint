import { describe, expect, it } from "vitest";

import type { ProductRecord } from "@/domain/products";

import {
  filterProductsForCatalog,
  getProductAuthorFilterOptions,
  getProductNavigationState,
  sortProducts,
} from "./ProductLibraryPage";

const products: readonly ProductRecord[] = [
  makeProduct({
    authorName: "Mirkosa",
    canPrintWithInventory: true,
    category: "Magnets",
    designName: "Mecha Chameleon Character Magnets",
    id: 1,
  }),
  makeProduct({
    authorName: "C3D",
    canPrintWithInventory: false,
    category: "Bookmarks",
    commercialLicenseStatus: "permission-needed",
    designName: "Blade & Blossom - Bookmarks Set",
    id: 2,
  }),
  makeProduct({
    authorName: "AMS",
    canPrintWithInventory: true,
    category: "Bookmarks",
    designName: "Azure Tides - Bookmark",
    hueForgeFilaments: [
      {
        alternativeFilamentIds: [8],
        brand: "Jayo",
        colorName: "Sky Blue",
        hexColor: "#87ceeb",
        layerRange: "",
        materialType: "PLA+",
        purchaseSource: "",
        requiredGrams: 12,
        role: "",
        transmissionDistance: 4.4,
      },
    ],
    id: 3,
    imageReference: "azure.jpg",
  }),
  makeProduct({
    authorName: "ams",
    canPrintWithInventory: true,
    category: "Bookmarks",
    designName: "Bookmark 10",
    id: 4,
  }),
  makeProduct({
    authorName: "AMS",
    canPrintWithInventory: true,
    category: "Bookmarks",
    designName: "Bookmark 2",
    id: 5,
  }),
];

describe("product catalog helpers", () => {
  it("filters catalog rows by category, author, existing-color readiness, and filament search text", () => {
    const filtered = filterProductsForCatalog(products, {
      authorFilter: "AMS",
      categoryFilter: "Bookmarks",
      colorsFilter: "ready",
      filter: "all",
      search: "sky blue",
      sortKey: "default",
    });

    expect(filtered.map((product) => product.designName)).toEqual([
      "Azure Tides - Bookmark",
    ]);
  });

  it("filters for products that need existing colors and license review", () => {
    const filtered = filterProductsForCatalog(products, {
      authorFilter: "all",
      categoryFilter: "Bookmarks",
      colorsFilter: "needs",
      filter: "warning",
      search: "needs colors",
      sortKey: "default",
    });

    expect(filtered.map((product) => product.designName)).toEqual([
      "Blade & Blossom - Bookmarks Set",
    ]);
  });

  it("sorts designs and authors with case-insensitive natural ordering", () => {
    expect(sortProducts(products, "design").map((product) => product.designName)).toEqual([
      "Azure Tides - Bookmark",
      "Blade & Blossom - Bookmarks Set",
      "Bookmark 2",
      "Bookmark 10",
      "Mecha Chameleon Character Magnets",
    ]);

    expect(sortProducts(products, "author").map((product) => product.designName)).toEqual([
      "Azure Tides - Bookmark",
      "Bookmark 2",
      "Bookmark 10",
      "Blade & Blossom - Bookmarks Set",
      "Mecha Chameleon Character Magnets",
    ]);
  });

  it("returns unique sorted author filter options", () => {
    expect(getProductAuthorFilterOptions(products)).toEqual([
      "AMS",
      "ams",
      "C3D",
      "Mirkosa",
    ]);
  });

  it("navigates previous and next in the visible catalog order with wraparound", () => {
    const visible = [products[2]!, products[4]!, products[0]!];
    const navigation = getProductNavigationState(visible[0]!.id, visible, products);

    expect(navigation?.currentIndex).toBe(0);
    expect(navigation?.count).toBe(3);
    expect(navigation?.previousProduct.id).toBe(1);
    expect(navigation?.nextProduct.id).toBe(5);
  });

  it("falls back to full product order when the current product is hidden by filters", () => {
    const visible = [products[2]!, products[4]!];
    const navigation = getProductNavigationState(products[0]!.id, visible, products);

    expect(navigation?.count).toBe(products.length);
    expect(navigation?.previousProduct.id).toBe(5);
    expect(navigation?.nextProduct.id).toBe(2);
  });
});

function makeProduct(overrides: Partial<ProductRecord>): ProductRecord {
  return {
    authorName: "Studio",
    businesses: [],
    canPrintWithInventory: false,
    category: "Bookmarks",
    commercialLicenseStatus: "commercial-ok",
    createdAt: "2026-07-10T00:00:00.000Z",
    designName: "Product",
    estimatedPrintHours: null,
    filamentMode: "hueforge",
    hueForgeFilaments: [],
    id: 1,
    imageReference: "",
    licenseBillingInterval: "none",
    licenseCostAmount: 0,
    notes: "",
    saleUnit: "piece",
    sourceLink: "https://example.com/product",
    updatedAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}
