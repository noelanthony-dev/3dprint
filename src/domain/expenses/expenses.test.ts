import { describe, expect, it } from "vitest";

import {
  calculateMonthTotal,
  getLicenseWarningDisplay,
  getMonthlyEquivalent,
  occursInMonth,
  validateExpenseInput,
  validateMembershipInput,
  type ExpenseInput,
  type MembershipInput,
} from "./index";

const expenseInput: ExpenseInput = {
  amount: 42.5,
  category: "Shipping",
  expenseDate: "2026-07-02",
  notes: "",
  recurrence: "one-time",
  recurrenceMonth: "2026-07",
  vendor: "USPS",
};

const membershipInput: MembershipInput = {
  amount: 12,
  commercialUseStatus: "commercial-ok",
  creatorName: "Hex3D",
  licenseNotes: "",
  membershipStatus: "active",
  notes: "",
  platform: "Patreon",
  recurrence: "monthly",
  recurrenceMonth: "2026-07",
  vendor: "Patreon",
};

describe("expense validation", () => {
  it("accepts valid expense input", () => {
    expect(validateExpenseInput(expenseInput)).toEqual({
      errors: {},
      valid: true,
    });
  });

  it("rejects invalid recurrence month and negative amount", () => {
    const validation = validateExpenseInput({
      ...expenseInput,
      amount: -1,
      recurrenceMonth: "July",
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.amount).toBe("Amount cannot be negative.");
    expect(validation.errors.recurrenceMonth).toBe("Use a recurrence month like 2026-07.");
  });
});

describe("membership validation and license warnings", () => {
  it("accepts valid membership input", () => {
    expect(validateMembershipInput(membershipInput)).toEqual({
      errors: {},
      valid: true,
    });
  });

  it("shows commercial license warnings without blocking the membership", () => {
    const warning = getLicenseWarningDisplay("expired", "");

    expect(warning.shouldWarn).toBe(true);
    expect(warning.tone).toBe("danger");
    expect(warning.label).toBe("Expired");
  });

  it("does not warn when commercial use is recorded as covered", () => {
    expect(getLicenseWarningDisplay("commercial-ok", "").shouldWarn).toBe(false);
  });
});

describe("monthly recurrence helpers", () => {
  it("calculates monthly equivalents for recurring expenses", () => {
    expect(getMonthlyEquivalent(120, "annual")).toBe(10);
    expect(getMonthlyEquivalent(15, "monthly")).toBe(15);
    expect(getMonthlyEquivalent(99, "one-time")).toBe(0);
  });

  it("matches one-time, monthly, and annual expenses to target months", () => {
    expect(occursInMonth(expenseInput, "2026-07")).toBe(true);
    expect(occursInMonth(expenseInput, "2026-08")).toBe(false);
    expect(occursInMonth({ ...expenseInput, recurrence: "monthly" }, "2027-01")).toBe(true);
    expect(
      occursInMonth(
        { ...expenseInput, expenseDate: "2026-01-02", recurrence: "annual", recurrenceMonth: "2026-07" },
        "2027-07",
      ),
    ).toBe(true);
  });

  it("totals expenses and memberships for a month", () => {
    const total = calculateMonthTotal(
      [
        expenseInput,
        { ...expenseInput, amount: 20, expenseDate: "2026-08-02", recurrenceMonth: "2026-08" },
        { ...expenseInput, amount: 120, recurrence: "annual", recurrenceMonth: "2026-07" },
      ],
      [membershipInput],
      "2026-07",
    );

    expect(total).toBe(174.5);
  });
});
