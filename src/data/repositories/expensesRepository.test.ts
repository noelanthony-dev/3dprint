import { describe, expect, it } from "vitest";

import type { QueryResult, SqlDatabase } from "@/data/db/client";
import type { ExpenseInput, MembershipInput } from "@/domain/expenses";

import { createExpensesRepository } from "./expensesRepository";

class FakeDatabase implements SqlDatabase {
  readonly executed: { query: string; values: readonly unknown[] }[] = [];
  readonly selected: { query: string; values: readonly unknown[] }[] = [];

  private expenseRow = {
    amount: 55.98,
    category: "Filament",
    created_at: "2026-07-02T00:00:00.000Z",
    expense_date: "2026-07-02",
    id: 1,
    notes: "Bambu PETG",
    recurrence: "one-time",
    recurrence_month: "2026-07",
    updated_at: "2026-07-02T00:00:00.000Z",
    vendor: "Bambu Lab",
  };

  private membershipRow = {
    amount: 12,
    commercial_use_status: "missing",
    created_at: "2026-07-02T00:00:00.000Z",
    creator_name: "Hex3D",
    id: 2,
    license_notes: "Need commercial tier confirmation",
    membership_status: "needs-renewal",
    notes: "",
    platform: "Thangs",
    recurrence: "monthly",
    recurrence_month: "2026-07",
    updated_at: "2026-07-02T00:00:00.000Z",
    vendor: "Thangs",
  };

  async execute(query: string, bindValues: readonly unknown[] = []): Promise<QueryResult> {
    this.executed.push({ query, values: bindValues });

    if (query.includes("INSERT INTO expenses")) {
      return { lastInsertId: 1, rowsAffected: 1 };
    }

    if (query.includes("INSERT INTO memberships")) {
      return { lastInsertId: 2, rowsAffected: 1 };
    }

    return { rowsAffected: 1 };
  }

  async select<T>(query: string, bindValues: readonly unknown[] = []): Promise<T> {
    this.selected.push({ query, values: bindValues });

    if (query.includes("FROM memberships")) {
      return [this.membershipRow] as T;
    }

    return [this.expenseRow] as T;
  }
}

const expenseInput: ExpenseInput = {
  amount: 55.98,
  category: "Filament",
  expenseDate: "2026-07-02",
  notes: " Bambu PETG ",
  recurrence: "one-time",
  recurrenceMonth: "2026-07",
  vendor: " Bambu Lab ",
};

const membershipInput: MembershipInput = {
  amount: 12,
  commercialUseStatus: "missing",
  creatorName: " Hex3D ",
  licenseNotes: " Need commercial tier confirmation ",
  membershipStatus: "needs-renewal",
  notes: "",
  platform: " Thangs ",
  recurrence: "monthly",
  recurrenceMonth: "2026-07",
  vendor: " Thangs ",
};

describe("expenses repository", () => {
  it("creates expense and membership schema before the first query", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createExpensesRepository(async () => fakeDb);

    await repository.listExpenses();

    expect(fakeDb.executed[0]?.query).toContain("CREATE TABLE IF NOT EXISTS expenses");
    expect(fakeDb.executed.some((statement) =>
      statement.query.includes("CREATE TABLE IF NOT EXISTS memberships"),
    )).toBe(true);
    expect(fakeDb.selected[0]?.query).toContain("FROM expenses");
  });

  it("binds expense values instead of interpolating notes", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createExpensesRepository(async () => fakeDb);

    await repository.createExpense(expenseInput);

    const insert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO expenses"),
    );

    expect(insert?.query).toContain("VALUES ($1, $2, $3");
    expect(insert?.query).not.toContain("Bambu PETG");
    expect(insert?.values[0]).toBe("Bambu Lab");
    expect(insert?.values[6]).toBe("Bambu PETG");
  });

  it("binds membership values and maps warning fields", async () => {
    const fakeDb = new FakeDatabase();
    const repository = createExpensesRepository(async () => fakeDb);

    const membership = await repository.createMembership(membershipInput);

    const insert = fakeDb.executed.find((statement) =>
      statement.query.includes("INSERT INTO memberships"),
    );

    expect(insert?.query).toContain("VALUES ($1, $2, $3");
    expect(insert?.query).not.toContain("Hex3D");
    expect(insert?.values[0]).toBe("Hex3D");
    expect(insert?.values[7]).toBe("missing");
    expect(insert?.values[8]).toBe("Need commercial tier confirmation");
    expect(membership.commercialUseStatus).toBe("missing");
  });
});
