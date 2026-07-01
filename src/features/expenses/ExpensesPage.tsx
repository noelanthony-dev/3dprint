import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

import { Page } from "@/components/layout/Page";
import { Badge, DataTable, MetricPanel, Panel, SegmentedFilter, ToolbarButton } from "@/components/ui";
import { expensesRepository } from "@/data/repositories";
import {
  calculateMonthTotal,
  EXPENSE_CATEGORIES,
  getLicenseWarningDisplay,
  getMonthlyEquivalent,
  LICENSE_WARNING_STATUSES,
  MEMBERSHIP_STATUSES,
  RECURRENCE_TYPES,
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

interface ExpenseFormState {
  readonly amount: string;
  readonly category: ExpenseCategory;
  readonly expenseDate: string;
  readonly notes: string;
  readonly recurrence: RecurrenceType;
  readonly recurrenceMonth: string;
  readonly vendor: string;
}

interface MembershipFormState {
  readonly amount: string;
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

const emptyExpenseForm: ExpenseFormState = {
  amount: "0",
  category: "Filament",
  expenseDate: todayInputValue(),
  notes: "",
  recurrence: "one-time",
  recurrenceMonth: currentMonthValue(),
  vendor: "",
};

const emptyMembershipForm: MembershipFormState = {
  amount: "0",
  commercialUseStatus: "unknown",
  creatorName: "",
  licenseNotes: "",
  membershipStatus: "active",
  notes: "",
  platform: "Patreon",
  recurrence: "monthly",
  recurrenceMonth: currentMonthValue(),
  vendor: "Patreon",
};

export function ExpensesPage() {
  const [activeMode, setActiveMode] = useState<"expenses" | "memberships">("expenses");
  const [error, setError] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(emptyExpenseForm);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [membershipForm, setMembershipForm] = useState<MembershipFormState>(emptyMembershipForm);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function loadExpenseData(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const [loadedExpenses, loadedMemberships] = await Promise.all([
        expensesRepository.listExpenses(),
        expensesRepository.listMemberships(),
      ]);

      setExpenses(loadedExpenses);
      setMemberships(loadedMemberships);
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadExpenseData();
  }, []);

  const month = currentMonthValue();
  const expenseInput = useMemo(() => toExpenseInput(expenseForm), [expenseForm]);
  const membershipInput = useMemo(() => toMembershipInput(membershipForm), [membershipForm]);
  const expenseValidation = validateExpenseInput(expenseInput);
  const membershipValidation = validateMembershipInput(membershipInput);
  const licenseWarnings = memberships.filter(
    (membership) => getLicenseWarningDisplay(membership.commercialUseStatus, membership.licenseNotes).shouldWarn,
  );
  const activeMemberships = memberships.filter((membership) => membership.membershipStatus === "active");
  const monthlyTotal = calculateMonthTotal(expenses, memberships, month);
  const monthlyEquivalent = expenses.reduce(
    (sum, expense) => sum + getMonthlyEquivalent(expense.amount, expense.recurrence),
    0,
  ) + memberships.reduce(
    (sum, membership) => sum + getMonthlyEquivalent(membership.amount, membership.recurrence),
    0,
  );

  async function handleExpenseSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    if (!expenseValidation.valid) {
      setValidationMessage(Object.values(expenseValidation.errors)[0] ?? "Check the expense fields.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await expensesRepository.createExpense(expenseInput);
      await loadExpenseData();
      setValidationMessage("Expense saved.");
      setExpenseForm({
        ...emptyExpenseForm,
        expenseDate: todayInputValue(),
        recurrenceMonth: currentMonthValue(),
      });
    } catch (saveError) {
      setError(formatRepositoryError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMembershipSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    if (!membershipValidation.valid) {
      setValidationMessage(Object.values(membershipValidation.errors)[0] ?? "Check the membership fields.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await expensesRepository.createMembership(membershipInput);
      await loadExpenseData();
      setValidationMessage("Membership saved. License status is shown as a warning only.");
      setMembershipForm({
        ...emptyMembershipForm,
        recurrenceMonth: currentMonthValue(),
      });
    } catch (saveError) {
      setError(formatRepositoryError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton onClick={() => void loadExpenseData()}>Refresh</ToolbarButton>
          <ToolbarButton
            disabled={isSaving}
            form={activeMode === "expenses" ? "expense-form" : "membership-form"}
            tone="primary"
            type="submit"
          >
            {activeMode === "expenses" ? "Add Expense" : "Add Membership"}
          </ToolbarButton>
        </>
      }
      description="Track business expenses, memberships, and commercial-license warnings without allocating subscriptions into product cost."
      meta={["Monthly overhead", "Warning-only licenses", "No accounting engine"]}
      title="Expenses & Licenses"
    >
      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}
      {validationMessage ? (
        <div className={validationMessage.includes("saved") ? "callout" : "callout callout--warning"}>
          <Badge tone={validationMessage.includes("saved") ? "success" : "warning"}>Expenses</Badge>
          <p>{validationMessage}</p>
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricPanel detail={month} label="Month Total" value={isLoading ? "..." : formatCurrency(monthlyTotal)} />
        <MetricPanel detail="recurring estimate" label="Monthly Run Rate" value={formatCurrency(monthlyEquivalent)} />
        <MetricPanel detail="active only" label="Memberships" tone="success" value={String(activeMemberships.length)} />
        <MetricPanel detail="commercial-use review" label="License Warnings" tone={licenseWarnings.length > 0 ? "warning" : "success"} value={String(licenseWarnings.length)} />
      </div>

      <div className="content-grid content-grid--costing">
        <div className="side-stack">
          <Panel
            title="Recent Expenses"
            actions={
              <SegmentedFilter
                label="Expense tabs"
                onChange={(value) => setActiveMode(value === "Memberships" ? "memberships" : "expenses")}
                options={[
                  { active: activeMode === "expenses", label: "Expenses" },
                  { active: activeMode === "memberships", label: "Memberships" },
                ]}
              />
            }
          >
            <DataTable
              columns={["Date", "Category", "Vendor", "Recurrence", "Amount"]}
              columnsTemplate="0.68fr 0.72fr minmax(150px, 1.2fr) 0.72fr 0.58fr"
              density="dense"
              footer={expenses.length === 0 ? "No expenses saved yet." : `Showing ${expenses.length} expense records.`}
              rows={expenses.map((expense) => [
                expense.expenseDate,
                <Badge tone={expense.category === "License" || expense.category === "Membership" ? "warning" : "neutral"}>
                  {expense.category}
                </Badge>,
                expense.vendor,
                expense.recurrence,
                <span className="numeric-readout">
                  <strong>{formatCurrency(expense.amount)}</strong>
                </span>,
              ])}
            />
          </Panel>

          <Panel title="Active Memberships">
            <DataTable
              columns={["Creator", "Platform", "Status", "License", "Amount"]}
              columnsTemplate="minmax(130px, 1fr) 0.7fr 0.75fr 0.78fr 0.58fr"
              density="dense"
              footer={memberships.length === 0 ? "No memberships saved yet." : "Memberships remain business expenses, not per-product costing allocations."}
              rows={memberships.map((membership) => {
                const warning = getLicenseWarningDisplay(membership.commercialUseStatus, membership.licenseNotes);

                return [
                  membership.creatorName,
                  membership.platform,
                  <Badge tone={membership.membershipStatus === "active" ? "success" : "warning"}>
                    {formatStatus(membership.membershipStatus)}
                  </Badge>,
                  <Badge tone={warning.tone}>{warning.label}</Badge>,
                  formatCurrency(membership.amount),
                ];
              })}
            />
          </Panel>
        </div>

        <div className="side-stack">
          <Panel title="License Warnings" actions={<Badge tone={licenseWarnings.length > 0 ? "warning" : "success"}>{licenseWarnings.length}</Badge>}>
            {licenseWarnings.length === 0 ? (
              <div className="empty-state">
                <p>No membership license warnings are currently saved.</p>
              </div>
            ) : (
              <div className="warning-list">
                {licenseWarnings.map((membership) => {
                  const warning = getLicenseWarningDisplay(membership.commercialUseStatus, membership.licenseNotes);

                  return (
                    <div className="warning-list__item" key={membership.id}>
                      <Badge tone={warning.tone}>{warning.label}</Badge>
                      <strong>{membership.creatorName}</strong>
                      <span>{warning.message}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="callout callout--warning">
              <Badge tone="warning">Scope</Badge>
              <p>Warnings are informational only. The app does not block products, sales, or production based on license status.</p>
            </div>
          </Panel>

          <Panel title={activeMode === "expenses" ? "Add Expense" : "Add Membership"}>
            {activeMode === "expenses" ? (
              <form className="inventory-form" id="expense-form" onSubmit={(event) => void handleExpenseSubmit(event)}>
                <FormField label="Vendor">
                  <input onChange={(event) => setExpenseValue("vendor", event.target.value, setExpenseForm)} value={expenseForm.vendor} />
                </FormField>
                <FormField label="Category">
                  <select onChange={(event) => setExpenseValue("category", event.target.value as ExpenseCategory, setExpenseForm)} value={expenseForm.category}>
                    {EXPENSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Amount">
                  <input inputMode="decimal" onChange={(event) => setExpenseValue("amount", event.target.value, setExpenseForm)} value={expenseForm.amount} />
                </FormField>
                <FormField label="Date">
                  <input onChange={(event) => setExpenseValue("expenseDate", event.target.value, setExpenseForm)} type="date" value={expenseForm.expenseDate} />
                </FormField>
                <FormField label="Recurrence">
                  <select onChange={(event) => setExpenseValue("recurrence", event.target.value as RecurrenceType, setExpenseForm)} value={expenseForm.recurrence}>
                    {RECURRENCE_TYPES.map((recurrence) => (
                      <option key={recurrence} value={recurrence}>
                        {recurrence}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Month">
                  <input onChange={(event) => setExpenseValue("recurrenceMonth", event.target.value, setExpenseForm)} type="month" value={expenseForm.recurrenceMonth} />
                </FormField>
                <FormField label="Notes" wide>
                  <textarea onChange={(event) => setExpenseValue("notes", event.target.value, setExpenseForm)} value={expenseForm.notes} />
                </FormField>
                <div className="form-actions">
                  <ToolbarButton disabled={isSaving} tone="primary" type="submit">
                    Save Expense
                  </ToolbarButton>
                </div>
              </form>
            ) : (
              <form className="inventory-form" id="membership-form" onSubmit={(event) => void handleMembershipSubmit(event)}>
                <FormField label="Creator">
                  <input onChange={(event) => setMembershipValue("creatorName", event.target.value, setMembershipForm)} value={membershipForm.creatorName} />
                </FormField>
                <FormField label="Platform">
                  <input onChange={(event) => setMembershipValue("platform", event.target.value, setMembershipForm)} value={membershipForm.platform} />
                </FormField>
                <FormField label="Vendor">
                  <input onChange={(event) => setMembershipValue("vendor", event.target.value, setMembershipForm)} value={membershipForm.vendor} />
                </FormField>
                <FormField label="Amount">
                  <input inputMode="decimal" onChange={(event) => setMembershipValue("amount", event.target.value, setMembershipForm)} value={membershipForm.amount} />
                </FormField>
                <FormField label="Recurrence">
                  <select onChange={(event) => setMembershipValue("recurrence", event.target.value as RecurrenceType, setMembershipForm)} value={membershipForm.recurrence}>
                    {RECURRENCE_TYPES.map((recurrence) => (
                      <option key={recurrence} value={recurrence}>
                        {recurrence}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Month">
                  <input onChange={(event) => setMembershipValue("recurrenceMonth", event.target.value, setMembershipForm)} type="month" value={membershipForm.recurrenceMonth} />
                </FormField>
                <FormField label="Status">
                  <select onChange={(event) => setMembershipValue("membershipStatus", event.target.value as MembershipStatus, setMembershipForm)} value={membershipForm.membershipStatus}>
                    {MEMBERSHIP_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {formatStatus(status)}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Commercial Use">
                  <select onChange={(event) => setMembershipValue("commercialUseStatus", event.target.value as LicenseWarningStatus, setMembershipForm)} value={membershipForm.commercialUseStatus}>
                    {LICENSE_WARNING_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {getLicenseWarningDisplay(status, "").label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="License Notes" wide>
                  <input onChange={(event) => setMembershipValue("licenseNotes", event.target.value, setMembershipForm)} value={membershipForm.licenseNotes} />
                </FormField>
                <FormField label="Notes" wide>
                  <textarea onChange={(event) => setMembershipValue("notes", event.target.value, setMembershipForm)} value={membershipForm.notes} />
                </FormField>
                <div className="form-actions">
                  <ToolbarButton disabled={isSaving} tone="primary" type="submit">
                    Save Membership
                  </ToolbarButton>
                </div>
              </form>
            )}
          </Panel>
        </div>
      </div>
    </Page>
  );
}

function FormField({
  children,
  label,
  wide = false,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly wide?: boolean;
}) {
  return (
    <label className="form-field" data-wide={wide ? "true" : "false"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function setExpenseValue<K extends keyof ExpenseFormState>(
  key: K,
  value: ExpenseFormState[K],
  setForm: Dispatch<SetStateAction<ExpenseFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function setMembershipValue<K extends keyof MembershipFormState>(
  key: K,
  value: MembershipFormState[K],
  setForm: Dispatch<SetStateAction<MembershipFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function toExpenseInput(form: ExpenseFormState): ExpenseInput {
  return {
    amount: toNumber(form.amount),
    category: form.category,
    expenseDate: form.expenseDate,
    notes: form.notes,
    recurrence: form.recurrence,
    recurrenceMonth: form.recurrenceMonth,
    vendor: form.vendor,
  };
}

function toMembershipInput(form: MembershipFormState): MembershipInput {
  return {
    amount: toNumber(form.amount),
    commercialUseStatus: form.commercialUseStatus,
    creatorName: form.creatorName,
    licenseNotes: form.licenseNotes,
    membershipStatus: form.membershipStatus,
    notes: form.notes,
    platform: form.platform,
    recurrence: form.recurrence,
    recurrenceMonth: form.recurrenceMonth,
    vendor: form.vendor,
  };
}

function toNumber(value: string): number {
  return Number(value.trim() || "0");
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthValue(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatStatus(status: string): string {
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRepositoryError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("invoke")) {
      return "Native SQLite storage is available when the app is opened through Tauri. Browser preview can render the screen but cannot access the local database.";
    }

    return error.message;
  }

  return "Expense storage is unavailable. Open the app through Tauri to use local SQLite.";
}
