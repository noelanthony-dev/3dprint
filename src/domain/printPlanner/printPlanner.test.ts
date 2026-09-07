import { describe, expect, it } from "vitest";

import type { ProductRecord } from "@/domain/products";
import type { SaleRecord } from "@/domain/sales";

import {
  buildPrintPlanCalculation,
  type FreshInventoryCount,
} from "./index";

function product(
  id: number,
  designName: string,
  businesses: readonly string[],
  saleUnit: ProductRecord["saleUnit"] = "piece",
): Pick<ProductRecord, "businesses" | "designName" | "id" | "saleUnit"> {
  return { businesses, designName, id, saleUnit };
}

function sale(
  productReference: string,
  channel: SaleRecord["channel"],
  quantity: number,
  saleDate: string,
  saleUnit: SaleRecord["saleUnit"] = "piece",
): Pick<SaleRecord, "channel" | "productReference" | "quantity" | "saleDate" | "saleUnit"> {
  return { channel, productReference, quantity, saleDate, saleUnit };
}

describe("Print Planner calculation", () => {
  it("uses the inclusive 28-day window and excludes Direct and future sales", () => {
    const result = buildPrintPlanCalculation({
      counts: [{ businessId: "sincerely", productId: 1, quantity: 1 }],
      planDate: "2026-08-19",
      products: [product(1, "Dragon", ["Sincerely, Books"])],
      sales: [
        sale("Dragon", "Sincerely", 2, "2026-07-23"),
        sale("Dragon", "Sincerely", 4, "2026-08-19"),
        sale("Dragon", "Sincerely", 50, "2026-07-22"),
        sale("Dragon", "Sincerely", 50, "2026-08-20"),
        sale("Dragon", "Direct", 50, "2026-08-10"),
      ],
    });

    expect(result.windowStart).toBe("2026-07-23");
    expect(result.items[0]).toMatchObject({
      inventoryCount: 1,
      recommendedQuantity: 2,
      targetQuantity: 3,
      unitsSold: 6,
    });
  });

  it("supports Angkong and gives no recommendation without history", () => {
    const products = [product(2, "Siu Mai", ["Angkong Dimsum"])];
    const noHistory = buildPrintPlanCalculation({
      counts: [{ businessId: "angkong-dimsum", productId: 2, quantity: 0 }],
      planDate: "2026-08-19",
      products,
      sales: [],
    });
    expect(noHistory.items[0]).toMatchObject({
      recommendedQuantity: 0,
      status: "no-history",
      targetQuantity: 0,
    });

    const withHistory = buildPrintPlanCalculation({
      counts: [{ businessId: "angkong-dimsum", productId: 2, quantity: 0 }],
      planDate: "2026-08-19",
      products,
      sales: [sale("Siu Mai", "Angkong", 3, "2026-08-18")],
    });
    expect(withHistory.items[0]).toMatchObject({
      recommendedQuantity: 2,
      status: "print",
      targetQuantity: 2,
    });
  });

  it("aggregates duplicate finished-good sale references under one product", () => {
    const result = buildPrintPlanCalculation({
      counts: [{ businessId: "flora", productId: 3, quantity: 0 }],
      planDate: "2026-08-19",
      products: [product(3, "Great Wave", ["Flora & Faun"])],
      sales: [
        sale("Great Wave", "Flora", 2, "2026-08-01"),
        sale("  great   wave ", "Flora", 3, "2026-08-10"),
      ],
    });
    expect(result.items[0]?.unitsSold).toBe(5);
    expect(result.items[0]?.recommendedQuantity).toBe(3);
  });

  it("excludes ambiguous, unmatched, unit-mismatched, and unstocked history with warnings", () => {
    const products = [
      product(1, "Dragon", ["Sincerely, Books"]),
      product(2, "dragon", ["Sincerely, Books"]),
      product(3, "Bookmark", ["Dear Reader"]),
      product(4, "Magnet", ["Flora & Faun"]),
    ];
    const counts: FreshInventoryCount[] = [
      { businessId: "sincerely", productId: 1, quantity: 0 },
      { businessId: "sincerely", productId: 2, quantity: 0 },
      { businessId: "dear-reader", productId: 3, quantity: 0 },
      { businessId: "flora", productId: 4, quantity: 0 },
    ];
    const result = buildPrintPlanCalculation({
      counts,
      planDate: "2026-08-19",
      products,
      sales: [
        sale("Dragon", "Sincerely", 1, "2026-08-10"),
        sale("Missing", "Flora", 1, "2026-08-10"),
        sale("Bookmark", "Dear Reader", 1, "2026-08-10", "set"),
        sale("Magnet", "Sincerely", 1, "2026-08-10"),
      ],
    });

    expect(result.items.every((item) => item.unitsSold === 0)).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/multiple Product Library items/);
    expect(result.warnings.join(" ")).toMatch(/could not be matched/);
    expect(result.warnings.join(" ")).toMatch(/mismatched sale units/);
    expect(result.warnings.join(" ")).toMatch(/not marked as stocked/);
  });

  it("consolidates shortages and orders them by coverage then shortage", () => {
    const result = buildPrintPlanCalculation({
      counts: [
        { businessId: "sincerely", productId: 1, quantity: 0 },
        { businessId: "flora", productId: 1, quantity: 1 },
        { businessId: "stomping", productId: 2, quantity: 0 },
      ],
      planDate: "2026-08-19",
      products: [
        product(1, "Dragon", ["Sincerely, Books", "Flora & Faun"]),
        product(2, "Clicker", ["Stomping Grounds"]),
      ],
      sales: [
        sale("Dragon", "Sincerely", 6, "2026-08-10"),
        sale("Dragon", "Flora", 4, "2026-08-10"),
        sale("Clicker", "Stomping", 4, "2026-08-10"),
      ],
    });

    expect(result.recommendations.map((item) => item.productName)).toEqual(["Dragon", "Clicker"]);
    expect(result.recommendations[0]).toMatchObject({
      totalRecommendedQuantity: 4,
      totalUnitsSold: 10,
    });
    expect(result.recommendations[0]?.allocations).toEqual([
      { businessId: "sincerely", businessName: "Sincerely", quantity: 3 },
      { businessId: "flora", businessName: "Flora", quantity: 1 },
    ]);
  });

  it("requires exactly one non-negative whole count for every stocked item", () => {
    const input = {
      planDate: "2026-08-19",
      products: [product(1, "Dragon", ["Sincerely, Books"])],
      sales: [],
    };
    expect(() => buildPrintPlanCalculation({ ...input, counts: [] })).toThrow(/Count every/);
    expect(() => buildPrintPlanCalculation({
      ...input,
      counts: [{ businessId: "sincerely", productId: 1, quantity: -1 }],
    })).toThrow(/non-negative whole/);
  });
});
