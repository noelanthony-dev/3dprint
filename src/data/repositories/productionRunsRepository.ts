import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  type ProductionAddOnDeductionRecord,
  type ProductionFilamentDeductionRecord,
  type ProductionRunRecord,
} from "@/domain/production";

export interface ProductionRunsRepository {
  get(id: number): Promise<ProductionRunRecord | null>;
  list(): Promise<ProductionRunRecord[]>;
  listAddOnDeductions(productionRunId: number): Promise<ProductionAddOnDeductionRecord[]>;
  listFilamentDeductions(productionRunId: number): Promise<ProductionFilamentDeductionRecord[]>;
}

interface ProductionRunRow {
  readonly addon_id: number | null;
  readonly addon_quantity_deducted: number;
  readonly created_at: string;
  readonly expected_pieces: number;
  readonly failed_pieces: number;
  readonly failure_reason: string | null;
  readonly filament_grams_deducted: number;
  readonly filament_id: number;
  readonly finished_good_id: number | null;
  readonly good_pieces: number;
  readonly id: number;
  readonly notes: string | null;
  readonly print_profile_id: number;
  readonly product_id: number;
  readonly run_date: string;
  readonly updated_at: string;
}

interface ProductionFilamentDeductionRow {
  readonly created_at: string;
  readonly filament_id: number;
  readonly grams_after: number;
  readonly grams_before: number;
  readonly grams_deducted: number;
  readonly id: number;
  readonly production_run_id: number;
}

interface ProductionAddOnDeductionRow {
  readonly addon_id: number;
  readonly created_at: string;
  readonly id: number;
  readonly production_run_id: number;
  readonly quantity_after: number;
  readonly quantity_before: number;
  readonly quantity_deducted: number;
}

type DatabaseFactory = () => Promise<SqlDatabase>;

const PRODUCTION_RUN_COLUMNS = `
  id,
  product_id,
  print_profile_id,
  filament_id,
  addon_id,
  run_date,
  expected_pieces,
  good_pieces,
  failed_pieces,
  failure_reason,
  notes,
  filament_grams_deducted,
  addon_quantity_deducted,
  finished_good_id,
  created_at,
  updated_at
`;

const PRODUCTION_FILAMENT_DEDUCTION_COLUMNS = `
  id,
  production_run_id,
  filament_id,
  grams_deducted,
  grams_before,
  grams_after,
  created_at
`;

const PRODUCTION_ADDON_DEDUCTION_COLUMNS = `
  id,
  production_run_id,
  addon_id,
  quantity_deducted,
  quantity_before,
  quantity_after,
  created_at
`;

export function createProductionRunsRepository(
  databaseFactory: DatabaseFactory = getDatabase,
): ProductionRunsRepository {
  async function database(): Promise<SqlDatabase> {
    return databaseFactory();
  }

  return {
    async get(id) {
      const db = await database();
      const rows = await db.select<ProductionRunRow[]>(
        `SELECT ${PRODUCTION_RUN_COLUMNS}
         FROM production_runs
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      if (!rows[0]) return null;
      const addOnDeductions = await getAddOnDeductionsForRuns(db, [id]);
      return mapProductionRunRow(rows[0], addOnDeductions.get(id) ?? []);
    },

    async list() {
      const db = await database();
      const rows = await db.select<ProductionRunRow[]>(
        `SELECT ${PRODUCTION_RUN_COLUMNS}
         FROM production_runs
         ORDER BY run_date DESC, created_at DESC, id DESC`,
      );

      const addOnDeductions = await getAddOnDeductionsForRuns(db, rows.map((row) => row.id));
      return rows.map((row) => mapProductionRunRow(row, addOnDeductions.get(row.id) ?? []));
    },

    async listAddOnDeductions(productionRunId) {
      const db = await database();
      const rows = await db.select<ProductionAddOnDeductionRow[]>(
        `SELECT ${PRODUCTION_ADDON_DEDUCTION_COLUMNS}
         FROM production_run_addons
         WHERE production_run_id = $1
         ORDER BY id ASC`,
        [productionRunId],
      );

      return rows.map(mapProductionAddOnDeductionRow);
    },

    async listFilamentDeductions(productionRunId) {
      const db = await database();
      const rows = await db.select<ProductionFilamentDeductionRow[]>(
        `SELECT ${PRODUCTION_FILAMENT_DEDUCTION_COLUMNS}
         FROM production_run_filaments
         WHERE production_run_id = $1
         ORDER BY id ASC`,
        [productionRunId],
      );

      return rows.map(mapProductionFilamentDeductionRow);
    },
  };
}

function mapProductionRunRow(
  row: ProductionRunRow,
  addOnDeductions: readonly ProductionAddOnDeductionRecord[],
): ProductionRunRecord {
  return {
    addOnDeductions,
    addOnQuantityDeducted: row.addon_quantity_deducted,
    createdAt: row.created_at,
    expectedPieces: row.expected_pieces,
    failedPieces: row.failed_pieces,
    failureReason: row.failure_reason ?? "",
    filamentGramsDeducted: row.filament_grams_deducted,
    filamentId: row.filament_id,
    finishedGoodId: row.finished_good_id,
    goodPieces: row.good_pieces,
    id: row.id,
    notes: row.notes ?? "",
    printProfileId: row.print_profile_id,
    productId: row.product_id,
    runDate: row.run_date,
    updatedAt: row.updated_at,
  };
}

async function getAddOnDeductionsForRuns(
  db: SqlDatabase,
  runIds: readonly number[],
): Promise<Map<number, ProductionAddOnDeductionRecord[]>> {
  const grouped = new Map<number, ProductionAddOnDeductionRecord[]>();
  if (runIds.length === 0) return grouped;

  const placeholders = runIds.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await db.select<ProductionAddOnDeductionRow[]>(
    `SELECT ${PRODUCTION_ADDON_DEDUCTION_COLUMNS}
     FROM production_run_addons
     WHERE production_run_id IN (${placeholders})
     ORDER BY production_run_id, id`,
    runIds,
  );

  rows.forEach((row) => {
    const current = grouped.get(row.production_run_id) ?? [];
    current.push(mapProductionAddOnDeductionRow(row));
    grouped.set(row.production_run_id, current);
  });
  return grouped;
}

function mapProductionFilamentDeductionRow(
  row: ProductionFilamentDeductionRow,
): ProductionFilamentDeductionRecord {
  return {
    createdAt: row.created_at,
    filamentId: row.filament_id,
    gramsAfter: row.grams_after,
    gramsBefore: row.grams_before,
    gramsDeducted: row.grams_deducted,
    id: row.id,
    productionRunId: row.production_run_id,
  };
}

function mapProductionAddOnDeductionRow(
  row: ProductionAddOnDeductionRow,
): ProductionAddOnDeductionRecord {
  return {
    addOnId: row.addon_id,
    createdAt: row.created_at,
    id: row.id,
    productionRunId: row.production_run_id,
    quantityAfter: row.quantity_after,
    quantityBefore: row.quantity_before,
    quantityDeducted: row.quantity_deducted,
  };
}

export const productionRunsRepository = createProductionRunsRepository();
