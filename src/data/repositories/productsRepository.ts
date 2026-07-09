import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  validateProductInput,
  isFilamentMaterial,
  type CommercialLicenseStatus,
  type LicenseBillingInterval,
  type ProductCategory,
  type ProductInput,
  type ProductRecord,
  type ProductSaleUnit,
} from "@/domain/products";

export interface ProductsRepository {
  create(input: ProductInput): Promise<ProductRecord>;
  delete(id: number): Promise<void>;
  get(id: number): Promise<ProductRecord | null>;
  list(): Promise<ProductRecord[]>;
  update(id: number, input: ProductInput): Promise<ProductRecord>;
}

interface ProductRow {
  readonly author_name: string;
  readonly category: string;
  readonly commercial_license_status: string;
  readonly created_at: string;
  readonly design_name: string;
  readonly id: number;
  readonly filament_mode: string | null;
  readonly hueforge_filaments: string | null;
  readonly image_reference: string | null;
  readonly license_billing_interval: string | null;
  readonly license_cost_amount: number | null;
  readonly notes: string | null;
  readonly sale_unit: string;
  readonly source_link: string;
  readonly updated_at: string;
}

type DatabaseFactory = () => Promise<SqlDatabase>;

const PRODUCT_COLUMNS = `
  id,
  design_name,
  source_link,
  author_name,
  category,
  sale_unit,
  commercial_license_status,
  license_cost_amount,
  license_billing_interval,
  filament_mode,
  hueforge_filaments,
  notes,
  image_reference,
  created_at,
  updated_at
`;

export function createProductsRepository(
  databaseFactory: DatabaseFactory = getDatabase,
): ProductsRepository {
  let schemaReady = false;

  async function database(): Promise<SqlDatabase> {
    const db = await databaseFactory();

    if (!schemaReady) {
      await ensureProductsSchema(db);
      schemaReady = true;
    }

    return db;
  }

  return {
    async create(input) {
      const validation = validateProductInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid product.");
      }

      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `INSERT INTO products (
          design_name,
          source_link,
          author_name,
          category,
          sale_unit,
          commercial_license_status,
          license_cost_amount,
          license_billing_interval,
          filament_mode,
          hueforge_filaments,
          notes,
          image_reference
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        values,
      );

      if (result.lastInsertId == null) {
        throw new Error("SQLite did not return the inserted product id.");
      }

      const created = await getProductById(db, result.lastInsertId);

      if (!created) {
        throw new Error("Inserted product could not be loaded.");
      }

      return created;
    },

    async delete(id) {
      const db = await database();
      const result = await db.execute(
        `DELETE FROM products
         WHERE id = $1`,
        [id],
      );

      if (result.rowsAffected === 0) {
        throw new Error(`Product ${id} does not exist.`);
      }
    },

    async get(id) {
      const db = await database();
      return getProductById(db, id);
    },

    async list() {
      const db = await database();
      const rows = await db.select<ProductRow[]>(
        `SELECT ${PRODUCT_COLUMNS}
         FROM products
         ORDER BY
           category COLLATE NOCASE,
           design_name COLLATE NOCASE`,
      );

      return rows.map(mapProductRow);
    },

    async update(id, input) {
      const validation = validateProductInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid product.");
      }

      const db = await database();
      const values = toPersistedValues(input);
      const result = await db.execute(
        `UPDATE products
         SET
          design_name = $1,
          source_link = $2,
          author_name = $3,
          category = $4,
          sale_unit = $5,
          commercial_license_status = $6,
          license_cost_amount = $7,
          license_billing_interval = $8,
          filament_mode = $9,
          hueforge_filaments = $10,
          notes = $11,
          image_reference = $12,
          updated_at = datetime('now')
         WHERE id = $13`,
        [...values, id],
      );

      if (result.rowsAffected === 0) {
        throw new Error(`Product ${id} does not exist.`);
      }

      const updated = await this.get(id);

      if (!updated) {
        throw new Error("Updated product could not be loaded.");
      }

      return updated;
    },
  };
}

async function ensureProductsSchema(db: SqlDatabase): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      design_name TEXT NOT NULL,
      source_link TEXT NOT NULL,
      author_name TEXT NOT NULL,
      category TEXT NOT NULL,
      sale_unit TEXT NOT NULL,
      commercial_license_status TEXT NOT NULL CHECK (
        commercial_license_status IN (
          'commercial-ok',
          'permission-needed',
          'personal-use',
          'unknown'
        )
      ),
      license_cost_amount REAL NOT NULL DEFAULT 0,
      license_billing_interval TEXT NOT NULL DEFAULT 'none' CHECK (
        license_billing_interval IN ('none', 'monthly', 'quarterly', 'yearly')
      ),
      filament_mode TEXT NOT NULL DEFAULT 'hueforge' CHECK (
        filament_mode IN ('hueforge', 'basic')
      ),
      hueforge_filaments TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      image_reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await addColumnIfMissing(db, "products", "license_cost_amount", "REAL NOT NULL DEFAULT 0");
  await addColumnIfMissing(
    db,
    "products",
    "license_billing_interval",
    "TEXT NOT NULL DEFAULT 'none' CHECK (license_billing_interval IN ('none', 'monthly', 'quarterly', 'yearly'))",
  );
  await addColumnIfMissing(db, "products", "hueforge_filaments", "TEXT NOT NULL DEFAULT '[]'");
  await addColumnIfMissing(
    db,
    "products",
    "filament_mode",
    "TEXT NOT NULL DEFAULT 'hueforge' CHECK (filament_mode IN ('hueforge', 'basic'))",
  );

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_products_category_design
    ON products (category, design_name)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_products_license_status
    ON products (commercial_license_status, design_name)
  `);
}

async function getProductById(db: SqlDatabase, id: number): Promise<ProductRecord | null> {
  const rows = await db.select<ProductRow[]>(
    `SELECT ${PRODUCT_COLUMNS}
     FROM products
     WHERE id = $1
     LIMIT 1`,
    [id],
  );

  return rows[0] ? mapProductRow(rows[0]) : null;
}

function toPersistedValues(input: ProductInput): readonly unknown[] {
  return [
    input.designName.trim(),
    input.sourceLink.trim(),
    input.authorName.trim(),
    input.category,
    input.saleUnit,
    input.commercialLicenseStatus,
    input.licenseCostAmount,
    input.licenseBillingInterval,
    input.filamentMode,
    JSON.stringify(input.hueForgeFilaments.map(toPersistedHueForgeFilament)),
    input.notes.trim(),
    input.imageReference.trim(),
  ];
}

function mapProductRow(row: ProductRow): ProductRecord {
  return {
    authorName: row.author_name,
    category: row.category as ProductCategory,
    commercialLicenseStatus: row.commercial_license_status as CommercialLicenseStatus,
    createdAt: row.created_at,
    designName: row.design_name,
    filamentMode: row.filament_mode === "basic" ? "basic" : "hueforge",
    id: row.id,
    hueForgeFilaments: parseHueForgeFilaments(row.hueforge_filaments),
    imageReference: row.image_reference ?? "",
    licenseBillingInterval: (row.license_billing_interval ?? "none") as LicenseBillingInterval,
    licenseCostAmount: row.license_cost_amount ?? 0,
    notes: row.notes ?? "",
    saleUnit: row.sale_unit as ProductSaleUnit,
    sourceLink: row.source_link,
    updatedAt: row.updated_at,
  };
}

function toPersistedHueForgeFilament(
  filament: ProductInput["hueForgeFilaments"][number],
): ProductInput["hueForgeFilaments"][number] {
  return {
    alternativeFilamentIds: normalizeAlternativeFilamentIds(filament.alternativeFilamentIds),
    brand: filament.brand.trim(),
    colorName: filament.colorName.trim(),
    hexColor: filament.hexColor.trim().toLowerCase(),
    layerRange: filament.layerRange.trim(),
    materialType: filament.materialType,
    purchaseSource: filament.purchaseSource.trim(),
    requiredGrams: filament.requiredGrams,
    role: filament.role.trim(),
    transmissionDistance: filament.transmissionDistance,
  };
}

function parseHueForgeFilaments(
  value: string | null,
): ProductInput["hueForgeFilaments"] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => mapParsedHueForgeFilament(item))
      .filter((item): item is ProductInput["hueForgeFilaments"][number] => item != null);
  } catch {
    return [];
  }
}

function mapParsedHueForgeFilament(
  item: unknown,
): ProductInput["hueForgeFilaments"][number] | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;
  const materialType = readString(record.materialType) || "Other";

  if (!isFilamentMaterial(materialType)) {
    return null;
  }

  return {
    alternativeFilamentIds: readAlternativeFilamentIds(
      record.alternativeFilamentIds ?? record.alternativeProfileIds,
    ),
    brand: readString(record.brand),
    colorName: readString(record.colorName),
    hexColor: readString(record.hexColor),
    layerRange: readString(record.layerRange),
    materialType,
    purchaseSource: readString(record.purchaseSource),
    requiredGrams: readNumber(record.requiredGrams) ?? 0,
    role: readString(record.role),
    transmissionDistance: readNumber(record.transmissionDistance),
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readAlternativeFilamentIds(value: unknown): readonly number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return normalizeAlternativeFilamentIds(
    value.filter((filamentId): filamentId is number => typeof filamentId === "number"),
  );
}

function normalizeAlternativeFilamentIds(filamentIds: readonly number[]): readonly number[] {
  return [...new Set(
    filamentIds.filter((filamentId) => Number.isInteger(filamentId) && filamentId > 0),
  )];
}

async function addColumnIfMissing(
  db: SqlDatabase,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  const columns = await db.select<Array<{ readonly name: string }>>(`PRAGMA table_info(${tableName})`);

  if (!columns.some((column) => column.name === columnName)) {
    await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export const productsRepository = createProductsRepository();
