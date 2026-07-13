import { invoke } from "@tauri-apps/api/core";

import { getDatabase, type SqlDatabase } from "@/data/db/client";
import { updateSaleDetailsNative } from "@/data/db/nativeWorkflows";
import {
  calculateSaleTotals,
  validateSaleDetailsInput,
  validateSaleInput,
  type SaleDetailsInput,
  type SaleInput,
  type SaleRecord,
  type SaleTotals,
  type SalesChannel,
  type SaleStockMovementRecord,
} from "@/domain/sales";
import type { FinishedGoodSaleUnit } from "@/domain/inventory";

export interface SaleCreateInput extends SaleInput {
  readonly stockQuantityAfter: number;
  readonly stockQuantityBefore: number;
}

export interface SalesRepository {
  get(id: number): Promise<SaleRecord | null>;
  list(): Promise<SaleRecord[]>;
  listStockMovements(saleId: number): Promise<SaleStockMovementRecord[]>;
  recordSaleWithStockMovement(input: SaleCreateInput): Promise<SaleRecord>;
  updateDetails(id: number, input: SaleDetailsInput): Promise<SaleRecord>;
}

interface SaleRow {
  readonly channel: string;
  readonly created_at: string;
  readonly discounts_fees: number;
  readonly finished_good_id: number;
  readonly gross_revenue: number;
  readonly id: number;
  readonly net_revenue: number;
  readonly notes: string | null;
  readonly product_reference: string;
  readonly quantity: number;
  readonly sale_date: string;
  readonly sale_unit: string;
  readonly stock_quantity_after: number;
  readonly stock_quantity_before: number;
  readonly updated_at: string;
}

interface SaleStockMovementRow {
  readonly created_at: string;
  readonly finished_good_id: number;
  readonly id: number;
  readonly quantity_after: number;
  readonly quantity_before: number;
  readonly quantity_delta: number;
  readonly sale_id: number;
}

type DatabaseFactory = () => Promise<SqlDatabase>;
type NativeSaleRecorder = (input: SaleCreateInput, totals: SaleTotals) => Promise<number>;
type NativeSaleUpdater = (
  id: number,
  input: SaleDetailsInput,
  totals: SaleTotals,
) => Promise<void>;

interface NativeRecordSaleResult {
  readonly saleId: number;
}

const SALE_COLUMNS = `
  id,
  finished_good_id,
  product_reference,
  sale_date,
  quantity,
  sale_unit,
  channel,
  gross_revenue,
  discounts_fees,
  net_revenue,
  notes,
  stock_quantity_before,
  stock_quantity_after,
  created_at,
  updated_at
`;

const SALE_STOCK_MOVEMENT_COLUMNS = `
  id,
  sale_id,
  finished_good_id,
  quantity_delta,
  quantity_before,
  quantity_after,
  created_at
`;

export function createSalesRepository(
  databaseFactory: DatabaseFactory = getDatabase,
  nativeSaleRecorder: NativeSaleRecorder = recordSaleWithStockMovementNative,
  nativeSaleUpdater: NativeSaleUpdater = updateSaleDetailsWithNativeCommand,
): SalesRepository {
  async function database(): Promise<SqlDatabase> {
    return databaseFactory();
  }

  return {
    async get(id) {
      const db = await database();
      const rows = await db.select<SaleRow[]>(
        `SELECT ${SALE_COLUMNS}
         FROM sales
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      return rows[0] ? mapSaleRow(rows[0]) : null;
    },

    async list() {
      const db = await database();
      const rows = await db.select<SaleRow[]>(
        `SELECT ${SALE_COLUMNS}
         FROM sales
         ORDER BY sale_date DESC, created_at DESC, id DESC`,
      );

      return rows.map(mapSaleRow);
    },

    async listStockMovements(saleId) {
      const db = await database();
      const rows = await db.select<SaleStockMovementRow[]>(
        `SELECT ${SALE_STOCK_MOVEMENT_COLUMNS}
         FROM sale_stock_movements
         WHERE sale_id = $1
         ORDER BY id ASC`,
        [saleId],
      );

      return rows.map(mapSaleStockMovementRow);
    },

    async recordSaleWithStockMovement(input) {
      const validation = validateSaleInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid sale.");
      }

      if (input.stockQuantityAfter !== input.stockQuantityBefore - input.quantity) {
        throw new Error("Sale stock movement does not match the sale quantity.");
      }

      if (input.stockQuantityAfter < 0) {
        throw new Error("Sale cannot reduce ready quantity below zero.");
      }

      const totals = calculateSaleTotals(input);
      await database();
      const insertedId = await nativeSaleRecorder(input, totals);

      const created = await this.get(insertedId);

      if (!created) {
        throw new Error("Inserted sale could not be loaded.");
      }

      return created;
    },

    async updateDetails(id, input) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error("Sale id is invalid.");
      }

      const validation = validateSaleDetailsInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid sale details.");
      }

      const totals = calculateSaleTotals({
        discountsFees: input.discountsFees,
        grossRevenue: input.grossRevenue,
        quantity: 1,
      });
      await database();
      await nativeSaleUpdater(id, input, totals);

      const updated = await this.get(id);

      if (!updated) {
        throw new Error(`Sale ${id} does not exist.`);
      }

      return updated;
    },
  };
}

async function recordSaleWithStockMovementNative(
  input: SaleCreateInput,
  totals: SaleTotals,
): Promise<number> {
  const result = await invoke<NativeRecordSaleResult>("record_sale_with_stock_movement", {
    input: {
      channel: input.channel,
      discountsFees: totals.discountsFees,
      finishedGoodId: input.finishedGoodId,
      grossRevenue: totals.grossRevenue,
      netRevenue: totals.netRevenue,
      notes: input.notes,
      productReference: input.productReference,
      quantity: input.quantity,
      saleDate: input.saleDate,
      saleUnit: input.saleUnit,
      stockQuantityAfter: input.stockQuantityAfter,
      stockQuantityBefore: input.stockQuantityBefore,
    },
  });

  return result.saleId;
}

async function updateSaleDetailsWithNativeCommand(
  id: number,
  input: SaleDetailsInput,
  totals: SaleTotals,
): Promise<void> {
  await updateSaleDetailsNative({
    channel: input.channel,
    discountsFees: totals.discountsFees,
    grossRevenue: totals.grossRevenue,
    netRevenue: totals.netRevenue,
    notes: input.notes.trim(),
    saleDate: input.saleDate.trim(),
    saleId: id,
  });
}

function mapSaleRow(row: SaleRow): SaleRecord {
  return {
    channel: row.channel as SalesChannel,
    createdAt: row.created_at,
    discountsFees: row.discounts_fees,
    finishedGoodId: row.finished_good_id,
    grossRevenue: row.gross_revenue,
    id: row.id,
    netRevenue: row.net_revenue,
    notes: row.notes ?? "",
    productReference: row.product_reference,
    quantity: row.quantity,
    saleDate: row.sale_date,
    saleUnit: row.sale_unit as FinishedGoodSaleUnit,
    stockQuantityAfter: row.stock_quantity_after,
    stockQuantityBefore: row.stock_quantity_before,
    updatedAt: row.updated_at,
  };
}

function mapSaleStockMovementRow(row: SaleStockMovementRow): SaleStockMovementRecord {
  return {
    createdAt: row.created_at,
    finishedGoodId: row.finished_good_id,
    id: row.id,
    quantityAfter: row.quantity_after,
    quantityBefore: row.quantity_before,
    quantityDelta: row.quantity_delta,
    saleId: row.sale_id,
  };
}

export const salesRepository = createSalesRepository();
