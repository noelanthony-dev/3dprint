import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  adjustFinishedGoodStockNative,
  type FinishedGoodStockAdjustmentCommand,
} from "@/data/db/nativeWorkflows";
import type {
  FinishedGoodInput,
  FinishedGoodRecord,
  FinishedGoodSaleUnit,
  FinishedGoodStockAdjustmentInput,
  FinishedGoodStockAdjustmentRecord,
} from "@/domain/inventory";
import {
  validateFinishedGoodInput,
  validateFinishedGoodStockAdjustmentInput,
} from "@/domain/inventory";

export interface FinishedGoodsRepository {
  adjustStock(
    finishedGoodId: number,
    input: FinishedGoodStockAdjustmentInput,
  ): Promise<FinishedGoodRecord>;
  create(input: FinishedGoodInput): Promise<FinishedGoodRecord>;
  get(id: number): Promise<FinishedGoodRecord | null>;
  list(): Promise<FinishedGoodRecord[]>;
  listAdjustments(finishedGoodId: number): Promise<FinishedGoodStockAdjustmentRecord[]>;
  update(id: number, input: FinishedGoodInput): Promise<FinishedGoodRecord>;
}

interface FinishedGoodRow {
  readonly created_at: string;
  readonly id: number;
  readonly notes: string | null;
  readonly product_reference: string;
  readonly quantity_ready: number;
  readonly quantity_reserved: number;
  readonly sale_unit: string;
  readonly updated_at: string;
}

interface FinishedGoodStockAdjustmentRow {
  readonly created_at: string;
  readonly finished_good_id: number;
  readonly id: number;
  readonly notes: string | null;
  readonly quantity_after: number;
  readonly quantity_delta: number;
  readonly reason: string;
}

type DatabaseFactory = () => Promise<SqlDatabase>;
type StockAdjuster = (input: FinishedGoodStockAdjustmentCommand) => Promise<void>;

const FINISHED_GOOD_COLUMNS = `
  id,
  product_reference,
  sale_unit,
  quantity_ready,
  quantity_reserved,
  notes,
  created_at,
  updated_at
`;

const FINISHED_GOOD_ADJUSTMENT_COLUMNS = `
  id,
  finished_good_id,
  quantity_delta,
  quantity_after,
  reason,
  notes,
  created_at
`;

export function createFinishedGoodsRepository(
  databaseFactory: DatabaseFactory = getDatabase,
  stockAdjuster: StockAdjuster = adjustFinishedGoodStockNative,
): FinishedGoodsRepository {
  async function database(): Promise<SqlDatabase> {
    return databaseFactory();
  }

  return {
    async adjustStock(finishedGoodId, input) {
      const validation = validateFinishedGoodStockAdjustmentInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid stock adjustment.");
      }

      const current = await this.get(finishedGoodId);

      if (!current) {
        throw new Error(`Finished good ${finishedGoodId} does not exist.`);
      }

      const nextQuantity = current.quantityReady + input.quantityDelta;

      if (nextQuantity < 0) {
        throw new Error("Adjustment cannot reduce ready quantity below zero.");
      }

      if (nextQuantity < current.quantityReserved) {
        throw new Error("Adjustment cannot reduce ready quantity below reserved quantity.");
      }

      await stockAdjuster({
        id: finishedGoodId,
        notes: input.notes.trim(),
        quantityAfter: nextQuantity,
        quantityBefore: current.quantityReady,
        quantityDelta: input.quantityDelta,
        reason: input.reason.trim(),
      });

      const updated = await this.get(finishedGoodId);

      if (!updated) {
        throw new Error("Adjusted finished good could not be loaded.");
      }

      return updated;
    },

    async create(input) {
      const validation = validateFinishedGoodInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid finished good.");
      }

      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `INSERT INTO finished_goods (
          product_reference,
          sale_unit,
          quantity_ready,
          quantity_reserved,
          notes
        ) VALUES ($1, $2, $3, $4, $5)`,
        values,
      );

      if (result.lastInsertId == null) {
        throw new Error("SQLite did not return the inserted finished good id.");
      }

      const created = await this.get(result.lastInsertId);

      if (!created) {
        throw new Error("Inserted finished good could not be loaded.");
      }

      return created;
    },

    async get(id) {
      const db = await database();
      const rows = await db.select<FinishedGoodRow[]>(
        `SELECT ${FINISHED_GOOD_COLUMNS}
         FROM finished_goods
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      return rows[0] ? mapFinishedGoodRow(rows[0]) : null;
    },

    async list() {
      const db = await database();
      const rows = await db.select<FinishedGoodRow[]>(
        `SELECT ${FINISHED_GOOD_COLUMNS}
         FROM finished_goods
         ORDER BY
           product_reference COLLATE NOCASE,
           sale_unit COLLATE NOCASE`,
      );

      return rows.map(mapFinishedGoodRow);
    },

    async listAdjustments(finishedGoodId) {
      const db = await database();
      const rows = await db.select<FinishedGoodStockAdjustmentRow[]>(
        `SELECT ${FINISHED_GOOD_ADJUSTMENT_COLUMNS}
         FROM finished_good_stock_adjustments
         WHERE finished_good_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 8`,
        [finishedGoodId],
      );

      return rows.map(mapFinishedGoodStockAdjustmentRow);
    },

    async update(id, input) {
      const validation = validateFinishedGoodInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid finished good.");
      }

      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `UPDATE finished_goods
         SET
          product_reference = $1,
          sale_unit = $2,
          quantity_ready = $3,
          quantity_reserved = $4,
          notes = $5,
          updated_at = datetime('now')
         WHERE id = $6`,
        [...values, id],
      );

      if (result.rowsAffected === 0) {
        throw new Error(`Finished good ${id} does not exist.`);
      }

      const updated = await this.get(id);

      if (!updated) {
        throw new Error("Updated finished good could not be loaded.");
      }

      return updated;
    },
  };
}

function toPersistedValues(input: FinishedGoodInput): readonly unknown[] {
  return [
    input.productReference.trim(),
    input.saleUnit,
    input.quantityReady,
    input.quantityReserved,
    input.notes.trim(),
  ];
}

function mapFinishedGoodRow(row: FinishedGoodRow): FinishedGoodRecord {
  return {
    createdAt: row.created_at,
    id: row.id,
    notes: row.notes ?? "",
    productReference: row.product_reference,
    quantityReady: row.quantity_ready,
    quantityReserved: row.quantity_reserved,
    saleUnit: row.sale_unit as FinishedGoodSaleUnit,
    updatedAt: row.updated_at,
  };
}

function mapFinishedGoodStockAdjustmentRow(
  row: FinishedGoodStockAdjustmentRow,
): FinishedGoodStockAdjustmentRecord {
  return {
    createdAt: row.created_at,
    finishedGoodId: row.finished_good_id,
    id: row.id,
    notes: row.notes ?? "",
    quantityAfter: row.quantity_after,
    quantityDelta: row.quantity_delta,
    reason: row.reason,
  };
}

export const finishedGoodsRepository = createFinishedGoodsRepository();
