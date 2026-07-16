import { getDatabase, type SqlDatabase } from "@/data/db/client";
import { deleteProductNative } from "@/data/db/nativeWorkflows";
import {
  PRODUCT_BUSINESSES,
  validateProductInput,
  isFilamentMaterial,
  type CommercialLicenseStatus,
  type LicenseBillingInterval,
  type ProductCategory,
  type ProductBusiness,
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
  readonly can_print_with_inventory: number | null;
  readonly businesses: string | null;
  readonly category: string;
  readonly commercial_license_status: string;
  readonly created_at: string;
  readonly design_name: string;
  readonly estimated_print_hours: number | null;
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
type ProductDeleter = (id: number) => Promise<void>;

const PRODUCT_COLUMNS = `
  id,
  can_print_with_inventory,
  businesses,
  design_name,
  estimated_print_hours,
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
  productDeleter: ProductDeleter = deleteProductNative,
): ProductsRepository {
  async function database(): Promise<SqlDatabase> {
    return databaseFactory();
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
          estimated_print_hours,
          source_link,
          author_name,
          category,
          sale_unit,
          commercial_license_status,
          license_cost_amount,
          license_billing_interval,
          filament_mode,
          hueforge_filaments,
          can_print_with_inventory,
          businesses,
          notes,
          image_reference
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
      await database();
      await productDeleter(id);
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
          estimated_print_hours = $2,
          source_link = $3,
          author_name = $4,
          category = $5,
          sale_unit = $6,
          commercial_license_status = $7,
          license_cost_amount = $8,
          license_billing_interval = $9,
          filament_mode = $10,
          hueforge_filaments = $11,
          can_print_with_inventory = $12,
          businesses = $13,
          notes = $14,
          image_reference = $15,
          updated_at = datetime('now')
         WHERE id = $16`,
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
    input.estimatedPrintHours,
    input.sourceLink.trim(),
    input.authorName.trim(),
    input.category,
    input.saleUnit,
    input.commercialLicenseStatus,
    input.licenseCostAmount,
    input.licenseBillingInterval,
    input.filamentMode,
    JSON.stringify(input.hueForgeFilaments.map(toPersistedHueForgeFilament)),
    input.canPrintWithInventory ? 1 : 0,
    JSON.stringify(input.businesses),
    input.notes.trim(),
    input.imageReference.trim(),
  ];
}

function mapProductRow(row: ProductRow): ProductRecord {
  return {
    authorName: row.author_name,
    canPrintWithInventory: row.can_print_with_inventory === 1,
    businesses: parseBusinesses(row.businesses),
    category: row.category as ProductCategory,
    commercialLicenseStatus: row.commercial_license_status as CommercialLicenseStatus,
    createdAt: row.created_at,
    designName: row.design_name,
    estimatedPrintHours: row.estimated_print_hours,
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

function parseBusinesses(value: string | null): readonly ProductBusiness[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((business): business is ProductBusiness =>
      typeof business === "string" && PRODUCT_BUSINESSES.includes(business as ProductBusiness),
    );
  } catch {
    return [];
  }
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

export const productsRepository = createProductsRepository();
