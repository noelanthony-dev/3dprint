import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  adjustAddOnStockNative,
  type DecimalStockAdjustmentCommand,
} from "@/data/db/nativeWorkflows";
import {
  validateAddOnStockAdjustmentInput,
  type AddOnCategory,
  type AddOnInput,
  type AddOnRecord,
  type AddOnStockAdjustmentInput,
  type AddOnStockAdjustmentRecord,
  type AddOnUnit,
} from "@/domain/inventory";

export interface AddOnsRepository {
  adjustStock(addOnId: number, input: AddOnStockAdjustmentInput): Promise<AddOnRecord>;
  create(input: AddOnInput): Promise<AddOnRecord>;
  get(id: number): Promise<AddOnRecord | null>;
  list(): Promise<AddOnRecord[]>;
  listAdjustments(addOnId: number): Promise<AddOnStockAdjustmentRecord[]>;
  update(id: number, input: AddOnInput): Promise<AddOnRecord>;
}

interface AddOnRow {
  readonly category: string;
  readonly created_at: string;
  readonly id: number;
  readonly is_active: number;
  readonly item_name: string;
  readonly low_stock_threshold: number;
  readonly notes: string | null;
  readonly quantity_on_hand: number;
  readonly supplier: string | null;
  readonly unit: string;
  readonly unit_cost: number;
  readonly updated_at: string;
}

interface AddOnStockAdjustmentRow {
  readonly addon_id: number;
  readonly created_at: string;
  readonly id: number;
  readonly notes: string | null;
  readonly quantity_after: number;
  readonly quantity_delta: number;
  readonly reason: string;
}

type DatabaseFactory = () => Promise<SqlDatabase>;
type StockAdjuster = (input: DecimalStockAdjustmentCommand) => Promise<void>;

const ADD_ON_COLUMNS = `
  id,
  item_name,
  category,
  unit,
  quantity_on_hand,
  low_stock_threshold,
  unit_cost,
  supplier,
  notes,
  is_active,
  created_at,
  updated_at
`;

const ADD_ON_ADJUSTMENT_COLUMNS = `
  id,
  addon_id,
  quantity_delta,
  quantity_after,
  reason,
  notes,
  created_at
`;

export function createAddOnsRepository(
  databaseFactory: DatabaseFactory = getDatabase,
  stockAdjuster: StockAdjuster = adjustAddOnStockNative,
): AddOnsRepository {
  async function database(): Promise<SqlDatabase> {
    return databaseFactory();
  }

  return {
    async adjustStock(addOnId, input) {
      const validation = validateAddOnStockAdjustmentInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid add-on adjustment.");
      }

      const current = await this.get(addOnId);

      if (!current) {
        throw new Error(`Add-on ${addOnId} does not exist.`);
      }

      const nextQuantity = roundStockQuantity(current.quantityOnHand + input.quantityDelta);

      if (nextQuantity < 0) {
        throw new Error("Adjustment cannot reduce add-on quantity below zero.");
      }

      await stockAdjuster({
        id: addOnId,
        notes: input.notes.trim(),
        quantityAfter: nextQuantity,
        quantityBefore: current.quantityOnHand,
        quantityDelta: input.quantityDelta,
        reason: input.reason.trim(),
      });

      const updated = await this.get(addOnId);

      if (!updated) {
        throw new Error("Adjusted add-on could not be loaded.");
      }

      return updated;
    },

    async create(input) {
      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `INSERT INTO addons (
          item_name,
          category,
          unit,
          quantity_on_hand,
          low_stock_threshold,
          unit_cost,
          supplier,
          notes,
          is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        values,
      );

      if (result.lastInsertId == null) {
        throw new Error("SQLite did not return the inserted add-on id.");
      }

      const created = await this.get(result.lastInsertId);

      if (!created) {
        throw new Error("Inserted add-on could not be loaded.");
      }

      return created;
    },

    async get(id) {
      const db = await database();
      const rows = await db.select<AddOnRow[]>(
        `SELECT ${ADD_ON_COLUMNS}
         FROM addons
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      return rows[0] ? mapAddOnRow(rows[0]) : null;
    },

    async list() {
      const db = await database();
      const rows = await db.select<AddOnRow[]>(
        `SELECT ${ADD_ON_COLUMNS}
         FROM addons
         ORDER BY
           is_active DESC,
           category COLLATE NOCASE,
           item_name COLLATE NOCASE`,
      );

      return rows.map(mapAddOnRow);
    },

    async listAdjustments(addOnId) {
      const db = await database();
      const rows = await db.select<AddOnStockAdjustmentRow[]>(
        `SELECT ${ADD_ON_ADJUSTMENT_COLUMNS}
         FROM addon_stock_adjustments
         WHERE addon_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 12`,
        [addOnId],
      );

      return rows.map(mapAddOnStockAdjustmentRow);
    },

    async update(id, input) {
      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `UPDATE addons
         SET
          item_name = $1,
          category = $2,
          unit = $3,
          quantity_on_hand = $4,
          low_stock_threshold = $5,
          unit_cost = $6,
          supplier = $7,
          notes = $8,
          is_active = $9,
          updated_at = datetime('now')
         WHERE id = $10`,
        [...values, id],
      );

      if (result.rowsAffected === 0) {
        throw new Error(`Add-on ${id} does not exist.`);
      }

      const updated = await this.get(id);

      if (!updated) {
        throw new Error("Updated add-on could not be loaded.");
      }

      return updated;
    },
  };
}

function toPersistedValues(input: AddOnInput): readonly unknown[] {
  return [
    input.itemName.trim(),
    input.category,
    input.unit,
    input.quantityOnHand,
    input.lowStockThreshold,
    input.unitCost,
    input.supplier.trim(),
    input.notes.trim(),
    input.isActive ? 1 : 0,
  ];
}

function mapAddOnRow(row: AddOnRow): AddOnRecord {
  return {
    category: row.category as AddOnCategory,
    createdAt: row.created_at,
    id: row.id,
    isActive: row.is_active === 1,
    itemName: row.item_name,
    lowStockThreshold: row.low_stock_threshold,
    notes: row.notes ?? "",
    quantityOnHand: row.quantity_on_hand,
    supplier: row.supplier ?? "",
    unit: row.unit as AddOnUnit,
    unitCost: row.unit_cost,
    updatedAt: row.updated_at,
  };
}

function mapAddOnStockAdjustmentRow(row: AddOnStockAdjustmentRow): AddOnStockAdjustmentRecord {
  return {
    addOnId: row.addon_id,
    createdAt: row.created_at,
    id: row.id,
    notes: row.notes ?? "",
    quantityAfter: row.quantity_after,
    quantityDelta: row.quantity_delta,
    reason: row.reason,
  };
}

function roundStockQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const addOnsRepository = createAddOnsRepository();
