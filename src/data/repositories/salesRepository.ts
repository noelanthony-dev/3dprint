import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  calculateSaleTotals,
  validateSaleInput,
  type SaleInput,
  type SaleRecord,
  type SalesChannel,
  type SaleStockMovementRecord,
} from "@/domain/sales";
import type { FinishedGoodSaleUnit } from "@/domain/inventory";

export interface SaleCreateInput extends SaleInput {
  readonly stockQuantityAfter: number;
  readonly stockQuantityBefore: number;
}

export interface SalesRepository {
  create(input: SaleCreateInput): Promise<SaleRecord>;
  get(id: number): Promise<SaleRecord | null>;
  list(): Promise<SaleRecord[]>;
  listStockMovements(saleId: number): Promise<SaleStockMovementRecord[]>;
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
): SalesRepository {
  let schemaReady = false;

  async function database(): Promise<SqlDatabase> {
    const db = await databaseFactory();

    if (!schemaReady) {
      await ensureSalesSchema(db);
      schemaReady = true;
    }

    return db;
  }

  return {
    async create(input) {
      const validation = validateSaleInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid sale.");
      }

      const totals = calculateSaleTotals(input);
      const db = await database();
      let insertedId: number | null = null;

      await db.execute("BEGIN IMMEDIATE");

      try {
        const result = await db.execute(
          `INSERT INTO sales (
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
            stock_quantity_after
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            input.finishedGoodId,
            input.productReference.trim(),
            input.saleDate.trim(),
            input.quantity,
            input.saleUnit,
            input.channel,
            totals.grossRevenue,
            totals.discountsFees,
            totals.netRevenue,
            input.notes.trim(),
            input.stockQuantityBefore,
            input.stockQuantityAfter,
          ],
        );

        if (result.lastInsertId == null) {
          throw new Error("SQLite did not return the inserted sale id.");
        }

        insertedId = result.lastInsertId;

        await db.execute(
          `INSERT INTO sale_stock_movements (
            sale_id,
            finished_good_id,
            quantity_delta,
            quantity_before,
            quantity_after
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            insertedId,
            input.finishedGoodId,
            -input.quantity,
            input.stockQuantityBefore,
            input.stockQuantityAfter,
          ],
        );

        await db.execute("COMMIT");
      } catch (error) {
        await db.execute("ROLLBACK");
        throw error;
      }

      if (insertedId == null) {
        throw new Error("Inserted sale id was not captured.");
      }

      const created = await this.get(insertedId);

      if (!created) {
        throw new Error("Inserted sale could not be loaded.");
      }

      return created;
    },

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
  };
}

async function ensureSalesSchema(db: SqlDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      finished_good_id INTEGER NOT NULL,
      product_reference TEXT NOT NULL,
      sale_date TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      sale_unit TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('Etsy', 'Shopify', 'Local', 'Direct', 'Other')),
      gross_revenue REAL NOT NULL DEFAULT 0 CHECK (gross_revenue >= 0),
      discounts_fees REAL NOT NULL DEFAULT 0 CHECK (discounts_fees >= 0),
      net_revenue REAL NOT NULL DEFAULT 0 CHECK (net_revenue >= 0),
      notes TEXT,
      stock_quantity_before INTEGER NOT NULL CHECK (stock_quantity_before >= 0),
      stock_quantity_after INTEGER NOT NULL CHECK (stock_quantity_after >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE RESTRICT
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sales_date
    ON sales (sale_date DESC, created_at DESC)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sales_channel
    ON sales (channel, sale_date DESC)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sale_stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      finished_good_id INTEGER NOT NULL,
      quantity_delta INTEGER NOT NULL CHECK (quantity_delta < 0),
      quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
      quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE RESTRICT
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sale_stock_movements_sale
    ON sale_stock_movements (sale_id)
  `);
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
