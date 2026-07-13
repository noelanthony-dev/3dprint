import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  savePrintProfileNative,
  type SavePrintProfileCommand,
} from "@/data/db/nativeWorkflows";
import {
  validatePrintProfileInput,
  type PrintProfileAddOn,
  type PrintProfileInput,
  type PrintProfileRecord,
} from "@/domain/costing";
import type { ProductSaleUnit } from "@/domain/products";

export interface PrintProfilesRepository {
  create(input: PrintProfileInput): Promise<PrintProfileRecord>;
  get(id: number): Promise<PrintProfileRecord | null>;
  list(): Promise<PrintProfileRecord[]>;
  update(id: number, input: PrintProfileInput): Promise<PrintProfileRecord>;
}

interface PrintProfileRow {
  readonly add_on_cost: number;
  readonly add_on_description: string | null;
  readonly add_on_id: number | null;
  readonly add_on_quantity: number | null;
  readonly created_at: string;
  readonly electricity_rate_per_kwh: number;
  readonly expected_failed_units: number;
  readonly expected_good_units: number;
  readonly filament_cost_per_kg: number;
  readonly filament_grams: number;
  readonly id: number;
  readonly labor_minutes: number;
  readonly labor_rate_per_hour: number;
  readonly notes: string | null;
  readonly printer_power_watts: number;
  readonly print_hours: number;
  readonly print_minutes: number;
  readonly product_id: number;
  readonly profile_name: string;
  readonly sale_unit: string;
  readonly support_grams: number;
  readonly target_markup: number;
  readonly updated_at: string;
  readonly wear_rate_per_hour: number;
}

interface PrintProfileAddOnRow {
  readonly addon_id: number | null;
  readonly description: string;
  readonly print_profile_id: number;
  readonly quantity: number;
  readonly total_cost: number;
  readonly unit_cost: number;
}

type DatabaseFactory = () => Promise<SqlDatabase>;
type ProfileSaver = (input: SavePrintProfileCommand) => Promise<number>;

const PRINT_PROFILE_COLUMNS = `
  id,
  product_id,
  profile_name,
  sale_unit,
  filament_grams,
  support_grams,
  filament_cost_per_kg,
  add_on_id,
  add_on_description,
  add_on_quantity,
  add_on_cost,
  print_hours,
  print_minutes,
  electricity_rate_per_kwh,
  printer_power_watts,
  wear_rate_per_hour,
  labor_minutes,
  labor_rate_per_hour,
  expected_good_units,
  expected_failed_units,
  target_markup,
  notes,
  created_at,
  updated_at
`;

const PRINT_PROFILE_ADDON_COLUMNS = `
  print_profile_id,
  addon_id,
  description,
  quantity,
  unit_cost,
  total_cost
`;

export function createPrintProfilesRepository(
  databaseFactory: DatabaseFactory = getDatabase,
  profileSaver: ProfileSaver = savePrintProfileNative,
): PrintProfilesRepository {
  async function database(): Promise<SqlDatabase> {
    return databaseFactory();
  }

  return {
    async create(input) {
      const validation = validatePrintProfileInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid print profile.");
      }

      await database();
      const insertedId = await profileSaver(toNativePrintProfile(null, input));

      const created = await this.get(insertedId);

      if (!created) {
        throw new Error("Inserted print profile could not be loaded.");
      }

      return created;
    },

    async get(id) {
      const db = await database();
      const rows = await db.select<PrintProfileRow[]>(
        `SELECT ${PRINT_PROFILE_COLUMNS}
         FROM print_profiles
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      if (!rows[0]) return null;
      const addOns = await getProfileAddOns(db, [id]);
      return mapPrintProfileRow(rows[0], addOns.get(id) ?? []);
    },

    async list() {
      const db = await database();
      const rows = await db.select<PrintProfileRow[]>(
        `SELECT ${PRINT_PROFILE_COLUMNS}
         FROM print_profiles
         ORDER BY product_id, profile_name COLLATE NOCASE`,
      );

      const addOns = await getProfileAddOns(db, rows.map((row) => row.id));
      return rows.map((row) => mapPrintProfileRow(row, addOns.get(row.id) ?? []));
    },

    async update(id, input) {
      const validation = validatePrintProfileInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid print profile.");
      }

      await database();
      await profileSaver(toNativePrintProfile(id, input));

      const updated = await this.get(id);

      if (!updated) {
        throw new Error("Updated print profile could not be loaded.");
      }

      return updated;
    },
  };
}

function toNativePrintProfile(
  id: number | null,
  input: PrintProfileInput,
): SavePrintProfileCommand {
  return {
    addOns: input.addOns.map((addOn) => ({
      addOnId: addOn.addOnId,
      description: addOn.description.trim(),
      quantity: addOn.quantity,
      totalCost: addOn.totalCost,
      unitCost: addOn.unitCost,
    })),
    electricityRatePerKwh: input.electricityRatePerKwh,
    expectedFailedUnits: input.expectedFailedUnits,
    expectedGoodUnits: input.expectedGoodUnits,
    filamentCostPerKg: input.filamentCostPerKg,
    filamentGrams: input.filamentGrams,
    id,
    laborMinutes: input.laborMinutes,
    laborRatePerHour: input.laborRatePerHour,
    notes: input.notes.trim(),
    printerPowerWatts: input.printerPowerWatts,
    printHours: input.printHours,
    printMinutes: input.printMinutes,
    productId: input.productId,
    profileName: input.profileName.trim(),
    saleUnit: input.saleUnit,
    supportGrams: input.supportGrams,
    targetMarkup: input.targetMarkup,
    wearRatePerHour: input.wearRatePerHour,
  };
}

function mapPrintProfileRow(
  row: PrintProfileRow,
  addOns: readonly PrintProfileAddOn[],
): PrintProfileRecord {
  return {
    addOns,
    createdAt: row.created_at,
    electricityRatePerKwh: row.electricity_rate_per_kwh,
    expectedFailedUnits: row.expected_failed_units,
    expectedGoodUnits: row.expected_good_units,
    filamentCostPerKg: row.filament_cost_per_kg,
    filamentGrams: row.filament_grams,
    id: row.id,
    laborMinutes: row.labor_minutes,
    laborRatePerHour: row.labor_rate_per_hour,
    notes: row.notes ?? "",
    printerPowerWatts: row.printer_power_watts,
    printHours: row.print_hours,
    printMinutes: row.print_minutes,
    productId: row.product_id,
    profileName: row.profile_name,
    saleUnit: row.sale_unit as ProductSaleUnit,
    supportGrams: row.support_grams,
    targetMarkup: row.target_markup,
    updatedAt: row.updated_at,
    wearRatePerHour: row.wear_rate_per_hour,
  };
}

async function getProfileAddOns(
  db: SqlDatabase,
  profileIds: readonly number[],
): Promise<Map<number, PrintProfileAddOn[]>> {
  const grouped = new Map<number, PrintProfileAddOn[]>();
  if (profileIds.length === 0) return grouped;

  const placeholders = profileIds.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await db.select<PrintProfileAddOnRow[]>(
    `SELECT ${PRINT_PROFILE_ADDON_COLUMNS}
     FROM print_profile_addons
     WHERE print_profile_id IN (${placeholders})
     ORDER BY print_profile_id, id`,
    profileIds,
  );

  rows.forEach((row) => {
    const current = grouped.get(row.print_profile_id) ?? [];
    current.push({
      addOnId: row.addon_id,
      description: row.description,
      quantity: row.quantity,
      totalCost: row.total_cost,
      unitCost: row.unit_cost,
    });
    grouped.set(row.print_profile_id, current);
  });
  return grouped;
}

export const printProfilesRepository = createPrintProfilesRepository();
