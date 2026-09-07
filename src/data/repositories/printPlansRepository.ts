import { getDatabase, type SqlDatabase } from "@/data/db/client";
import { savePrintPlanNative } from "@/data/db/nativeWorkflows";
import {
  PRINT_PLANNER_BUSINESSES,
  type PrintPlan,
  type PrintPlanItem,
  type PrintPlanSaveInput,
  type PrintPlannerBusinessId,
  type PrintPlannerStatus,
} from "@/domain/printPlanner";
import type { ProductSaleUnit } from "@/domain/products";

export interface PrintPlansRepository {
  get(id: number): Promise<PrintPlan | null>;
  list(): Promise<PrintPlan[]>;
  save(input: PrintPlanSaveInput): Promise<PrintPlan>;
}

interface PrintPlanRow {
  readonly algorithm_version: number;
  readonly created_at: string;
  readonly history_days: number;
  readonly id: number;
  readonly plan_date: string;
  readonly target_days: number;
  readonly warnings: string;
  readonly window_end: string;
  readonly window_start: string;
}

interface PrintPlanItemRow {
  readonly business_id: string;
  readonly business_name: string;
  readonly days_of_stock: number | null;
  readonly id: number;
  readonly inventory_count: number;
  readonly plan_id: number;
  readonly product_id: number | null;
  readonly product_name: string;
  readonly recommended_quantity: number;
  readonly sale_unit: string;
  readonly status: string;
  readonly target_quantity: number;
  readonly units_sold: number;
}

type DatabaseFactory = () => Promise<SqlDatabase>;
type NativePrintPlanSaver = (input: PrintPlanSaveInput) => Promise<number>;

const PRINT_PLAN_COLUMNS = `
  id, plan_date, window_start, window_end, history_days, target_days,
  algorithm_version, warnings, created_at
`;

const PRINT_PLAN_ITEM_COLUMNS = `
  id, plan_id, product_id, product_name, sale_unit, business_id, business_name,
  inventory_count, units_sold, target_quantity, recommended_quantity, days_of_stock, status
`;

export function createPrintPlansRepository(
  databaseFactory: DatabaseFactory = getDatabase,
  nativeSaver: NativePrintPlanSaver = savePrintPlanNative,
): PrintPlansRepository {
  async function database(): Promise<SqlDatabase> {
    return databaseFactory();
  }

  return {
    async get(id) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error("Print plan id is invalid.");
      }

      const db = await database();
      const rows = await db.select<PrintPlanRow[]>(
        `SELECT ${PRINT_PLAN_COLUMNS} FROM print_plans WHERE id = $1 LIMIT 1`,
        [id],
      );
      if (!rows[0]) return null;

      const items = await loadItems(db, [id]);
      return mapPrintPlanRow(rows[0], items.get(id) ?? []);
    },

    async list() {
      const db = await database();
      const rows = await db.select<PrintPlanRow[]>(
        `SELECT ${PRINT_PLAN_COLUMNS}
         FROM print_plans
         ORDER BY plan_date DESC, created_at DESC, id DESC`,
      );
      const items = await loadItems(db, rows.map((row) => row.id));
      return rows.map((row) => mapPrintPlanRow(row, items.get(row.id) ?? []));
    },

    async save(input) {
      const id = await nativeSaver(input);
      const saved = await this.get(id);

      if (!saved) {
        throw new Error("Saved print plan could not be loaded.");
      }

      return saved;
    },
  };
}

async function loadItems(
  db: SqlDatabase,
  planIds: readonly number[],
): Promise<Map<number, PrintPlanItem[]>> {
  const grouped = new Map<number, PrintPlanItem[]>();
  if (planIds.length === 0) return grouped;

  const placeholders = planIds.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await db.select<PrintPlanItemRow[]>(
    `SELECT ${PRINT_PLAN_ITEM_COLUMNS}
     FROM print_plan_items
     WHERE plan_id IN (${placeholders})
     ORDER BY plan_id DESC,
       CASE business_id
         WHEN 'sincerely' THEN 1
         WHEN 'flora' THEN 2
         WHEN 'dear-reader' THEN 3
         WHEN 'angkong-dimsum' THEN 4
         WHEN 'stomping' THEN 5
         ELSE 6
       END,
       product_name COLLATE NOCASE, id`,
    planIds,
  );

  for (const row of rows) {
    const items = grouped.get(row.plan_id) ?? [];
    items.push(mapPrintPlanItemRow(row));
    grouped.set(row.plan_id, items);
  }

  return grouped;
}

function mapPrintPlanRow(row: PrintPlanRow, items: readonly PrintPlanItem[]): PrintPlan {
  return {
    algorithmVersion: row.algorithm_version,
    createdAt: row.created_at,
    historyDays: row.history_days,
    id: row.id,
    items,
    planDate: row.plan_date,
    targetDays: row.target_days,
    warnings: parseWarnings(row.warnings),
    windowEnd: row.window_end,
    windowStart: row.window_start,
  };
}

function mapPrintPlanItemRow(row: PrintPlanItemRow): PrintPlanItem {
  if (!isPrintPlannerBusinessId(row.business_id)) {
    throw new Error(`Saved print plan uses an unknown business: ${row.business_id}`);
  }

  return {
    businessId: row.business_id,
    businessName: row.business_name,
    daysOfStock: row.days_of_stock,
    inventoryCount: row.inventory_count,
    productId: row.product_id,
    productName: row.product_name,
    recommendedQuantity: row.recommended_quantity,
    saleUnit: row.sale_unit as ProductSaleUnit,
    status: row.status as PrintPlannerStatus,
    targetQuantity: row.target_quantity,
    unitsSold: row.units_sold,
  };
}

function isPrintPlannerBusinessId(value: string): value is PrintPlannerBusinessId {
  return PRINT_PLANNER_BUSINESSES.some((business) => business.id === value);
}

function parseWarnings(value: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export const printPlansRepository = createPrintPlansRepository();
