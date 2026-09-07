import { describe, expect, it, vi } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { PrintPlanSaveInput } from "@/domain/printPlanner";

import { createPrintPlansRepository } from "./printPlansRepository";

class FakeDatabase implements SqlDatabase {
  async execute(): Promise<QueryResult> {
    return { rowsAffected: 0 };
  }

  async select<T>(query: string): Promise<T> {
    if (query.includes("FROM print_plan_items")) {
      return [{
        business_id: "sincerely",
        business_name: "Sincerely",
        days_of_stock: 7,
        id: 8,
        inventory_count: 1,
        plan_id: 3,
        product_id: 1,
        product_name: "Dragon",
        recommended_quantity: 1,
        sale_unit: "piece",
        status: "print",
        target_quantity: 2,
        units_sold: 4,
      }] as T;
    }

    return [{
      algorithm_version: 1,
      created_at: "2026-08-19 10:00:00",
      history_days: 28,
      id: 3,
      plan_date: "2026-08-19",
      target_days: 14,
      warnings: JSON.stringify(["Example warning"]),
      window_end: "2026-08-19",
      window_start: "2026-07-23",
    }] as T;
  }
}

const input: PrintPlanSaveInput = {
  algorithmVersion: 1,
  historyDays: 28,
  items: [{
    businessId: "sincerely",
    businessName: "Sincerely",
    daysOfStock: 7,
    inventoryCount: 1,
    productId: 1,
    productName: "Dragon",
    recommendedQuantity: 1,
    saleUnit: "piece",
    status: "print",
    targetQuantity: 2,
    unitsSold: 4,
  }],
  planDate: "2026-08-19",
  recommendations: [],
  targetDays: 14,
  warnings: ["Example warning"],
  windowEnd: "2026-08-19",
  windowStart: "2026-07-23",
};

describe("print plans repository", () => {
  it("loads immutable plan and item snapshots", async () => {
    const repository = createPrintPlansRepository(async () => new FakeDatabase());

    const plans = await repository.list();

    expect(plans).toEqual([expect.objectContaining({
      id: 3,
      planDate: "2026-08-19",
      warnings: ["Example warning"],
      items: [expect.objectContaining({
        businessId: "sincerely",
        productId: 1,
        productName: "Dragon",
        recommendedQuantity: 1,
      })],
    })]);
  });

  it("uses the atomic native saver and reloads the saved plan", async () => {
    const save = vi.fn(async () => 3);
    const repository = createPrintPlansRepository(async () => new FakeDatabase(), save);

    const result = await repository.save(input);

    expect(save).toHaveBeenCalledWith(input);
    expect(result.id).toBe(3);
    expect(result.items).toHaveLength(1);
  });
});
