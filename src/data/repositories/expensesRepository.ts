import { getDatabase, type SqlDatabase } from "@/data/db/client";
import {
  validateExpenseInput,
  validateMembershipInput,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseRecord,
  type LicenseWarningStatus,
  type MembershipInput,
  type MembershipRecord,
  type MembershipStatus,
  type RecurrenceType,
} from "@/domain/expenses";

export interface ExpensesRepository {
  createExpense(input: ExpenseInput): Promise<ExpenseRecord>;
  createMembership(input: MembershipInput): Promise<MembershipRecord>;
  getExpense(id: number): Promise<ExpenseRecord | null>;
  getMembership(id: number): Promise<MembershipRecord | null>;
  listExpenses(): Promise<ExpenseRecord[]>;
  listMemberships(): Promise<MembershipRecord[]>;
}

interface ExpenseRow {
  readonly amount: number;
  readonly category: string;
  readonly created_at: string;
  readonly expense_date: string;
  readonly id: number;
  readonly notes: string | null;
  readonly recurrence: string;
  readonly recurrence_month: string;
  readonly updated_at: string;
  readonly vendor: string;
}

interface MembershipRow {
  readonly amount: number;
  readonly commercial_use_status: string;
  readonly created_at: string;
  readonly creator_name: string;
  readonly id: number;
  readonly license_notes: string | null;
  readonly membership_status: string;
  readonly notes: string | null;
  readonly platform: string;
  readonly recurrence: string;
  readonly recurrence_month: string;
  readonly updated_at: string;
  readonly vendor: string;
}

type DatabaseFactory = () => Promise<SqlDatabase>;

const EXPENSE_COLUMNS = `
  id,
  vendor,
  category,
  amount,
  expense_date,
  recurrence,
  recurrence_month,
  notes,
  created_at,
  updated_at
`;

const MEMBERSHIP_COLUMNS = `
  id,
  creator_name,
  platform,
  vendor,
  amount,
  recurrence,
  recurrence_month,
  membership_status,
  commercial_use_status,
  license_notes,
  notes,
  created_at,
  updated_at
`;

export function createExpensesRepository(
  databaseFactory: DatabaseFactory = getDatabase,
): ExpensesRepository {
  async function database(): Promise<SqlDatabase> {
    return databaseFactory();
  }

  return {
    async createExpense(input) {
      const validation = validateExpenseInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid expense.");
      }

      const db = await database();
      const result = await db.execute(
        `INSERT INTO expenses (
          vendor,
          category,
          amount,
          expense_date,
          recurrence,
          recurrence_month,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.vendor.trim(),
          input.category,
          input.amount,
          input.expenseDate.trim(),
          input.recurrence,
          input.recurrenceMonth.trim(),
          input.notes.trim(),
        ],
      );

      if (result.lastInsertId == null) {
        throw new Error("SQLite did not return the inserted expense id.");
      }

      const created = await this.getExpense(result.lastInsertId);

      if (!created) {
        throw new Error("Inserted expense could not be loaded.");
      }

      return created;
    },

    async createMembership(input) {
      const validation = validateMembershipInput(input);

      if (!validation.valid) {
        throw new Error(Object.values(validation.errors)[0] ?? "Invalid membership.");
      }

      const db = await database();
      const result = await db.execute(
        `INSERT INTO memberships (
          creator_name,
          platform,
          vendor,
          amount,
          recurrence,
          recurrence_month,
          membership_status,
          commercial_use_status,
          license_notes,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          input.creatorName.trim(),
          input.platform.trim(),
          input.vendor.trim(),
          input.amount,
          input.recurrence,
          input.recurrenceMonth.trim(),
          input.membershipStatus,
          input.commercialUseStatus,
          input.licenseNotes.trim(),
          input.notes.trim(),
        ],
      );

      if (result.lastInsertId == null) {
        throw new Error("SQLite did not return the inserted membership id.");
      }

      const created = await this.getMembership(result.lastInsertId);

      if (!created) {
        throw new Error("Inserted membership could not be loaded.");
      }

      return created;
    },

    async getExpense(id) {
      const db = await database();
      const rows = await db.select<ExpenseRow[]>(
        `SELECT ${EXPENSE_COLUMNS}
         FROM expenses
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      return rows[0] ? mapExpenseRow(rows[0]) : null;
    },

    async getMembership(id) {
      const db = await database();
      const rows = await db.select<MembershipRow[]>(
        `SELECT ${MEMBERSHIP_COLUMNS}
         FROM memberships
         WHERE id = $1
         LIMIT 1`,
        [id],
      );

      return rows[0] ? mapMembershipRow(rows[0]) : null;
    },

    async listExpenses() {
      const db = await database();
      const rows = await db.select<ExpenseRow[]>(
        `SELECT ${EXPENSE_COLUMNS}
         FROM expenses
         ORDER BY expense_date DESC, created_at DESC, id DESC`,
      );

      return rows.map(mapExpenseRow);
    },

    async listMemberships() {
      const db = await database();
      const rows = await db.select<MembershipRow[]>(
        `SELECT ${MEMBERSHIP_COLUMNS}
         FROM memberships
         ORDER BY
          CASE membership_status
            WHEN 'active' THEN 0
            WHEN 'needs-renewal' THEN 1
            WHEN 'expired' THEN 2
            ELSE 3
          END,
          creator_name COLLATE NOCASE`,
      );

      return rows.map(mapMembershipRow);
    },
  };
}

function mapExpenseRow(row: ExpenseRow): ExpenseRecord {
  return {
    amount: row.amount,
    category: row.category as ExpenseCategory,
    createdAt: row.created_at,
    expenseDate: row.expense_date,
    id: row.id,
    notes: row.notes ?? "",
    recurrence: row.recurrence as RecurrenceType,
    recurrenceMonth: row.recurrence_month,
    updatedAt: row.updated_at,
    vendor: row.vendor,
  };
}

function mapMembershipRow(row: MembershipRow): MembershipRecord {
  return {
    amount: row.amount,
    commercialUseStatus: row.commercial_use_status as LicenseWarningStatus,
    createdAt: row.created_at,
    creatorName: row.creator_name,
    id: row.id,
    licenseNotes: row.license_notes ?? "",
    membershipStatus: row.membership_status as MembershipStatus,
    notes: row.notes ?? "",
    platform: row.platform,
    recurrence: row.recurrence as RecurrenceType,
    recurrenceMonth: row.recurrence_month,
    updatedAt: row.updated_at,
    vendor: row.vendor,
  };
}

export const expensesRepository = createExpensesRepository();
