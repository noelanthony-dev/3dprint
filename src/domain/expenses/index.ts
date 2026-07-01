import { createScaffoldModuleStatus } from "@/domain/shared";

export const EXPENSE_CATEGORIES = [
  "Filament",
  "Equipment",
  "Shipping",
  "Packaging",
  "Software",
  "License",
  "Membership",
  "Utilities",
  "Other",
] as const;

export const RECURRENCE_TYPES = ["one-time", "monthly", "annual"] as const;
export const MEMBERSHIP_STATUSES = ["active", "needs-renewal", "expired", "cancelled"] as const;
export const LICENSE_WARNING_STATUSES = ["commercial-ok", "missing", "expired", "unknown"] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type RecurrenceType = (typeof RECURRENCE_TYPES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export type LicenseWarningStatus = (typeof LICENSE_WARNING_STATUSES)[number];
export type LicenseWarningTone = "success" | "warning" | "danger";

export interface ExpenseInput {
  readonly amount: number;
  readonly category: ExpenseCategory;
  readonly expenseDate: string;
  readonly notes: string;
  readonly recurrence: RecurrenceType;
  readonly recurrenceMonth: string;
  readonly vendor: string;
}

export interface ExpenseRecord extends ExpenseInput {
  readonly createdAt: string;
  readonly id: number;
  readonly updatedAt: string;
}

export interface MembershipInput {
  readonly amount: number;
  readonly commercialUseStatus: LicenseWarningStatus;
  readonly creatorName: string;
  readonly licenseNotes: string;
  readonly membershipStatus: MembershipStatus;
  readonly notes: string;
  readonly platform: string;
  readonly recurrence: RecurrenceType;
  readonly recurrenceMonth: string;
  readonly vendor: string;
}

export interface MembershipRecord extends MembershipInput {
  readonly createdAt: string;
  readonly id: number;
  readonly updatedAt: string;
}

export interface ExpenseValidationResult {
  readonly errors: Partial<Record<keyof ExpenseInput, string>>;
  readonly valid: boolean;
}

export interface MembershipValidationResult {
  readonly errors: Partial<Record<keyof MembershipInput, string>>;
  readonly valid: boolean;
}

export interface LicenseWarningDisplay {
  readonly label: string;
  readonly message: string;
  readonly shouldWarn: boolean;
  readonly tone: LicenseWarningTone;
}

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return EXPENSE_CATEGORIES.includes(value as ExpenseCategory);
}

export function isRecurrenceType(value: string): value is RecurrenceType {
  return RECURRENCE_TYPES.includes(value as RecurrenceType);
}

export function isMembershipStatus(value: string): value is MembershipStatus {
  return MEMBERSHIP_STATUSES.includes(value as MembershipStatus);
}

export function isLicenseWarningStatus(value: string): value is LicenseWarningStatus {
  return LICENSE_WARNING_STATUSES.includes(value as LicenseWarningStatus);
}

export function getLicenseWarningDisplay(
  status: LicenseWarningStatus,
  notes: string,
): LicenseWarningDisplay {
  const cleanNotes = notes.trim();

  if (status === "commercial-ok") {
    return {
      label: "Commercial OK",
      message: cleanNotes || "Commercial use is marked as covered for this membership.",
      shouldWarn: false,
      tone: "success",
    };
  }

  if (status === "expired") {
    return {
      label: "Expired",
      message: cleanNotes || "Commercial use may be expired. Review before selling related designs.",
      shouldWarn: true,
      tone: "danger",
    };
  }

  if (status === "missing") {
    return {
      label: "Missing",
      message: cleanNotes || "Commercial-use permission has not been recorded for this membership.",
      shouldWarn: true,
      tone: "warning",
    };
  }

  return {
    label: "Unknown",
    message: cleanNotes || "Commercial-use coverage is unknown. Verify before relying on it.",
    shouldWarn: true,
    tone: "warning",
  };
}

export function getMonthlyEquivalent(amount: number, recurrence: RecurrenceType): number {
  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  if (recurrence === "annual") {
    return roundMoney(amount / 12);
  }

  if (recurrence === "monthly") {
    return roundMoney(amount);
  }

  return 0;
}

export function occursInMonth(
  item: Pick<ExpenseInput, "expenseDate" | "recurrence" | "recurrenceMonth">,
  month: string,
): boolean {
  if (!isMonthToken(month)) {
    return false;
  }

  if (item.recurrence === "monthly") {
    return true;
  }

  if (item.recurrence === "annual") {
    const recurrenceMonth = Number(item.recurrenceMonth.slice(5, 7));
    const targetMonth = Number(month.slice(5, 7));

    return recurrenceMonth === targetMonth;
  }

  return item.expenseDate.startsWith(month);
}

export function calculateMonthTotal(
  expenses: readonly Pick<ExpenseInput, "amount" | "expenseDate" | "recurrence" | "recurrenceMonth">[],
  memberships: readonly Pick<MembershipInput, "amount" | "recurrence" | "recurrenceMonth">[],
  month: string,
): number {
  const expenseTotal = expenses.reduce((sum, expense) => {
    if (!occursInMonth(expense, month)) {
      return sum;
    }

    return sum + expense.amount;
  }, 0);
  const membershipTotal = memberships.reduce((sum, membership) => {
    if (!occursInMonth({ ...membership, expenseDate: `${month}-01` }, month)) {
      return sum;
    }

    return sum + membership.amount;
  }, 0);

  return roundMoney(expenseTotal + membershipTotal);
}

export function validateExpenseInput(input: ExpenseInput): ExpenseValidationResult {
  const errors: Partial<Record<keyof ExpenseInput, string>> = {};

  if (!input.vendor.trim()) {
    errors.vendor = "Vendor is required.";
  }

  if (!isExpenseCategory(input.category)) {
    errors.category = "Choose a valid expense category.";
  }

  if (!isRecurrenceType(input.recurrence)) {
    errors.recurrence = "Choose a valid recurrence.";
  }

  if (!isDateToken(input.expenseDate)) {
    errors.expenseDate = "Expense date is required.";
  }

  if (!isMonthToken(input.recurrenceMonth)) {
    errors.recurrenceMonth = "Use a recurrence month like 2026-07.";
  }

  if (!Number.isFinite(input.amount) || input.amount < 0) {
    errors.amount = "Amount cannot be negative.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function validateMembershipInput(input: MembershipInput): MembershipValidationResult {
  const errors: Partial<Record<keyof MembershipInput, string>> = {};

  if (!input.creatorName.trim()) {
    errors.creatorName = "Creator or membership name is required.";
  }

  if (!input.platform.trim()) {
    errors.platform = "Platform is required.";
  }

  if (!input.vendor.trim()) {
    errors.vendor = "Vendor is required.";
  }

  if (!isMembershipStatus(input.membershipStatus)) {
    errors.membershipStatus = "Choose a valid membership status.";
  }

  if (!isLicenseWarningStatus(input.commercialUseStatus)) {
    errors.commercialUseStatus = "Choose a valid commercial-use status.";
  }

  if (!isRecurrenceType(input.recurrence)) {
    errors.recurrence = "Choose a valid recurrence.";
  }

  if (!isMonthToken(input.recurrenceMonth)) {
    errors.recurrenceMonth = "Use a recurrence month like 2026-07.";
  }

  if (!Number.isFinite(input.amount) || input.amount < 0) {
    errors.amount = "Amount cannot be negative.";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isDateToken(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function isMonthToken(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value.trim());
}

export const expensesDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "expenses",
  notes: ["Pure expense validation, recurring monthly helpers, and license-warning display."],
});
