import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  validateProductInput,
  type CommercialLicenseStatus,
  type ProductCategory,
  type ProductInput,
  type ProductRecord,
  type ProductSaleUnit,
} from "@/domain/products";

export interface ProductsRepository {
  create(input: ProductInput): Promise<ProductRecord>;
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
  readonly image_reference: string | null;
  readonly license_notes: string | null;
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
  license_notes,
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
          license_notes,
          notes,
          image_reference
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        values,
      );

      if (result.lastInsertId == null) {
        throw new Error("SQLite did not return the inserted product id.");
      }

      const created = await this.get(result.lastInsertId);

      if (!created) {
        throw new Error("Inserted product could not be loaded.");
      }

      return created;
    },

    async get(id) {
      const db = await database();
      const rows = await db.select<ProductRow[]>(
        `SELECT ${PRODUCT_COLUMNS}
         FROM products
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      return rows[0] ? mapProductRow(rows[0]) : null;
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
          license_notes = $7,
          notes = $8,
          image_reference = $9,
          updated_at = datetime('now')
         WHERE id = $10`,
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
      license_notes TEXT,
      notes TEXT,
      image_reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_products_category_design
    ON products (category, design_name)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_products_license_status
    ON products (commercial_license_status, design_name)
  `);
}

function toPersistedValues(input: ProductInput): readonly unknown[] {
  return [
    input.designName.trim(),
    input.sourceLink.trim(),
    input.authorName.trim(),
    input.category,
    input.saleUnit,
    input.commercialLicenseStatus,
    input.licenseNotes.trim(),
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
    id: row.id,
    imageReference: row.image_reference ?? "",
    licenseNotes: row.license_notes ?? "",
    notes: row.notes ?? "",
    saleUnit: row.sale_unit as ProductSaleUnit,
    sourceLink: row.source_link,
    updatedAt: row.updated_at,
  };
}

export const productsRepository = createProductsRepository();
