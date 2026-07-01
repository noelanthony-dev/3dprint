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
import {
  Badge,
  DataTable,
  MetricPanel,
  Panel,
  ProgressBar,
  ToolbarButton,
} from "@/components/ui";
import { printProfilesRepository, productsRepository } from "@/data/repositories";
import {
  calculatePrintCost,
  validatePrintProfileInput,
  type PrintProfileInput,
  type PrintProfileRecord,
} from "@/domain/costing";
import { calculatePricing } from "@/domain/pricing";
import type { ProductRecord, ProductSaleUnit } from "@/domain/products";

interface ProfileFormState {
  readonly addOnCost: string;
  readonly addOnDescription: string;
  readonly electricityRatePerKwh: string;
  readonly expectedFailedUnits: string;
  readonly expectedGoodUnits: string;
  readonly filamentCostPerKg: string;
  readonly filamentGrams: string;
  readonly laborMinutes: string;
  readonly laborRatePerHour: string;
  readonly notes: string;
  readonly printerPowerWatts: string;
  readonly printHours: string;
  readonly printMinutes: string;
  readonly productId: string;
  readonly profileName: string;
  readonly saleUnit: ProductSaleUnit;
  readonly supportGrams: string;
  readonly targetMarkup: string;
  readonly wearRatePerHour: string;
}

const emptyForm: ProfileFormState = {
  addOnCost: "2.5",
  addOnDescription: "Magnets, boxes, labels",
  electricityRatePerKwh: "0.15",
  expectedFailedUnits: "1",
  expectedGoodUnits: "10",
  filamentCostPerKg: "24.99",
  filamentGrams: "450",
  laborMinutes: "15",
  laborRatePerHour: "20",
  notes: "",
  printerPowerWatts: "100",
  printHours: "14",
  printMinutes: "30",
  productId: "",
  profileName: "0.2mm Standard",
  saleUnit: "piece",
  supportGrams: "45",
  targetMarkup: "3",
  wearRatePerHour: "0.1",
};

export function CostingPage() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [profiles, setProfiles] = useState<PrintProfileRecord[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function loadCostingData(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const [loadedProducts, loadedProfiles] = await Promise.all([
        productsRepository.list(),
        printProfilesRepository.list(),
      ]);

      setProducts(loadedProducts);
      setProfiles(loadedProfiles);
      setSelectedProfileId((current) => current ?? loadedProfiles[0]?.id ?? null);

      const firstProduct = loadedProducts[0];

      if (!form.productId && firstProduct) {
        setForm((current) => ({
          ...current,
          productId: String(firstProduct.id),
          saleUnit: firstProduct.saleUnit,
        }));
      }
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCostingData();
  }, []);

  const selectedProduct = products.find((product) => String(product.id) === form.productId) ?? null;
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const input = useMemo(() => toPrintProfileInput(form), [form]);
  const validation = validatePrintProfileInput(input);
  const breakdown = calculatePrintCost(input);
  const pricing = calculatePricing({
    costPerUnit: breakdown.costPerGoodUnit,
    expectedGoodUnits: input.expectedGoodUnits,
    laborMinutes: input.laborMinutes,
    markupMultiplier: input.targetMarkup,
    printHours: breakdown.totalPrintHours,
  });

  const profileProductNames = useMemo(
    () =>
      new Map(
        products.map((product) => [product.id, product.designName] as const),
      ),
    [products],
  );

  function startCreate(): void {
    setEditingId(null);
    setSelectedProfileId(null);
    setValidationMessage(null);
    setForm((current) => ({
      ...emptyForm,
      productId: current.productId || (products[0] ? String(products[0].id) : ""),
      saleUnit: selectedProduct?.saleUnit ?? products[0]?.saleUnit ?? "piece",
    }));
  }

  function startEdit(profile: PrintProfileRecord): void {
    setEditingId(profile.id);
    setSelectedProfileId(profile.id);
    setForm(toFormState(profile));
    setValidationMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    if (!validation.valid) {
      setValidationMessage(Object.values(validation.errors)[0] ?? "Check the profile fields.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const saved =
        editingId == null
          ? await printProfilesRepository.create(input)
          : await printProfilesRepository.update(editingId, input);
      const loadedProfiles = await printProfilesRepository.list();

      setProfiles(loadedProfiles);
      setSelectedProfileId(saved.id);
      setEditingId(saved.id);
      setForm(toFormState(saved));
    } catch (saveError) {
      setError(formatRepositoryError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  function handleProductChange(productId: string): void {
    const product = products.find((candidate) => String(candidate.id) === productId);

    setForm((current) => ({
      ...current,
      productId,
      saleUnit: product?.saleUnit ?? current.saleUnit,
    }));
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton onClick={() => void loadCostingData()}>Refresh</ToolbarButton>
          <ToolbarButton onClick={startCreate} tone="primary">
            New Profile
          </ToolbarButton>
        </>
      }
      description="Build print profiles linked to designs, estimate batch cost, and model pricing without logging production or deducting inventory."
      meta={["Pure formulas", "SQLite profiles", "No stock deduction"]}
      title="Print Profiles & Costing"
    >
      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}
      {validationMessage ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Validation</Badge>
          <p>{validationMessage}</p>
        </div>
      ) : null}
      {!error && products.length === 0 ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Products</Badge>
          <p>Create a product in the Design Library before saving print profiles.</p>
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricPanel detail="saved records" label="Profiles" value={isLoading ? "..." : String(profiles.length)} />
        <MetricPanel detail="batch estimate" label="Batch Cost" value={formatCurrency(breakdown.batchCost)} />
        <MetricPanel detail="good units only" label="Unit Cost" value={formatCurrency(breakdown.costPerGoodUnit)} />
        <MetricPanel detail={`${input.targetMarkup}x markup`} label="Sell Price" tone="success" value={formatCurrency(pricing.suggestedSellPrice)} />
      </div>

      <div className="content-grid content-grid--costing">
        <div className="side-stack">
          <Panel title="Batch Setup" actions={selectedProfile ? <Badge>CFG-{selectedProfile.id}</Badge> : <Badge>Draft</Badge>}>
            <form className="inventory-form" onSubmit={(event) => void handleSubmit(event)}>
              <FormField label="Product / Design" wide>
                <select onChange={(event) => handleProductChange(event.target.value)} value={form.productId}>
                  <option value="">Choose product...</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.designName}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Profile Name">
                <input
                  onChange={(event) => setFormValue("profileName", event.target.value, setForm)}
                  value={form.profileName}
                />
              </FormField>
              <FormField label="Sale Unit">
                <input readOnly value={form.saleUnit} />
              </FormField>
              <FormField label="Filament g">
                <input inputMode="decimal" onChange={(event) => setFormValue("filamentGrams", event.target.value, setForm)} value={form.filamentGrams} />
              </FormField>
              <FormField label="Purge/Support g">
                <input inputMode="decimal" onChange={(event) => setFormValue("supportGrams", event.target.value, setForm)} value={form.supportGrams} />
              </FormField>
              <FormField label="Filament $/kg">
                <input inputMode="decimal" onChange={(event) => setFormValue("filamentCostPerKg", event.target.value, setForm)} value={form.filamentCostPerKg} />
              </FormField>
              <FormField label="Add-on Cost">
                <input inputMode="decimal" onChange={(event) => setFormValue("addOnCost", event.target.value, setForm)} value={form.addOnCost} />
              </FormField>
              <FormField label="Print Hours">
                <input inputMode="decimal" onChange={(event) => setFormValue("printHours", event.target.value, setForm)} value={form.printHours} />
              </FormField>
              <FormField label="Minutes">
                <input inputMode="decimal" onChange={(event) => setFormValue("printMinutes", event.target.value, setForm)} value={form.printMinutes} />
              </FormField>
              <FormField label="Electric $/kWh">
                <input inputMode="decimal" onChange={(event) => setFormValue("electricityRatePerKwh", event.target.value, setForm)} value={form.electricityRatePerKwh} />
              </FormField>
              <FormField label="Printer Watts">
                <input inputMode="decimal" onChange={(event) => setFormValue("printerPowerWatts", event.target.value, setForm)} value={form.printerPowerWatts} />
              </FormField>
              <FormField label="Wear $/hr">
                <input inputMode="decimal" onChange={(event) => setFormValue("wearRatePerHour", event.target.value, setForm)} value={form.wearRatePerHour} />
              </FormField>
              <FormField label="Labor Min">
                <input inputMode="decimal" onChange={(event) => setFormValue("laborMinutes", event.target.value, setForm)} value={form.laborMinutes} />
              </FormField>
              <FormField label="Labor $/hr">
                <input inputMode="decimal" onChange={(event) => setFormValue("laborRatePerHour", event.target.value, setForm)} value={form.laborRatePerHour} />
              </FormField>
              <FormField label="Good Qty">
                <input inputMode="numeric" onChange={(event) => setFormValue("expectedGoodUnits", event.target.value, setForm)} value={form.expectedGoodUnits} />
              </FormField>
              <FormField label="Expected Fails">
                <input inputMode="numeric" onChange={(event) => setFormValue("expectedFailedUnits", event.target.value, setForm)} value={form.expectedFailedUnits} />
              </FormField>
              <FormField label="Target Markup">
                <input inputMode="decimal" onChange={(event) => setFormValue("targetMarkup", event.target.value, setForm)} value={form.targetMarkup} />
              </FormField>
              <FormField label="Add-ons" wide>
                <input onChange={(event) => setFormValue("addOnDescription", event.target.value, setForm)} value={form.addOnDescription} />
              </FormField>
              <FormField label="Notes" wide>
                <textarea onChange={(event) => setFormValue("notes", event.target.value, setForm)} value={form.notes} />
              </FormField>
              <div className="form-actions">
                <ToolbarButton disabled={products.length === 0 || isSaving} tone="primary" type="submit">
                  {editingId == null ? "Save Costing Profile" : "Update Costing Profile"}
                </ToolbarButton>
              </div>
            </form>
          </Panel>

          <Panel title="Saved Profiles">
            <DataTable
              columns={["Product", "Profile", "Good", "Markup", "Unit Cost"]}
              columnsTemplate="minmax(150px, 1.35fr) minmax(126px, 1fr) 0.42fr 0.45fr 0.58fr"
              density="dense"
              footer={`${profiles.length} print profiles. Profiles estimate only; inventory is not deducted.`}
              rows={profiles.map((profile) => {
                const profileCost = calculatePrintCost(profile);

                return [
                  profileProductNames.get(profile.productId) ?? `Product ${profile.productId}`,
                  <button className="table-link" onClick={() => startEdit(profile)} type="button">
                    {profile.profileName}
                  </button>,
                  `${profile.expectedGoodUnits} ${profile.saleUnit}`,
                  `${profile.targetMarkup}x`,
                  formatCurrency(profileCost.costPerGoodUnit),
                ];
              })}
            />
          </Panel>
        </div>

        <div className="side-stack">
          <Panel title="Cost Breakdown">
            <div className="cost-breakdown">
              <CostLine label={`Filament (${input.filamentCostPerKg}/kg)`} tone="success" value={breakdown.filamentCost} />
              <CostLine label="Add-ons" tone="warning" value={breakdown.addOnCost} />
              <CostLine label={`Electricity (${input.electricityRatePerKwh}/kWh)`} value={breakdown.electricityCost} />
              <CostLine label={`Wear & Tear (${input.wearRatePerHour}/hr)`} value={breakdown.wearCost} />
              <CostLine label={`Labor (${input.laborRatePerHour}/hr)`} tone="danger" value={breakdown.laborCost} />
            </div>
            <div className="detail-stack__metric">
              <span>Total Batch Cost</span>
              <strong>{formatCurrency(breakdown.batchCost)}</strong>
            </div>
            <div className="key-value-list">
              <span>Good Units</span>
              <strong>{input.expectedGoodUnits}</strong>
              <span>Expected Fails</span>
              <strong>{input.expectedFailedUnits}</strong>
              <span>Failure Rate</span>
              <strong>{(breakdown.failureRate * 100).toFixed(1)}%</strong>
              <span>Cost / Good Unit</span>
              <strong>{formatCurrency(breakdown.costPerGoodUnit)}</strong>
            </div>
          </Panel>

          <Panel title="Pricing Guidance">
            <div className="pricing-readout">
              <span>Suggested Sell Price</span>
              <strong>{formatCurrency(pricing.suggestedSellPrice)}</strong>
              <small>per {form.saleUnit}</small>
            </div>
            <ProgressBar label={`${pricing.marginPercent}% margin`} value={pricing.marginPercent} />
            <div className="key-value-list">
              <span>Profit / Unit</span>
              <strong>{formatCurrency(pricing.profitPerUnit)}</strong>
              <span>Profit / Batch</span>
              <strong>{formatCurrency(pricing.profitPerBatch)}</strong>
              <span>Profit / Print Hour</span>
              <strong>{formatCurrency(pricing.profitPerHour)}</strong>
              <span>Total Print Time</span>
              <strong>{breakdown.totalPrintHours.toFixed(2)}h</strong>
            </div>
            <div className="callout">
              <Badge>Scope</Badge>
              <p>License subscriptions, sales fees, production runs, and inventory deductions are not included in this MVP costing profile.</p>
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

function CostLine({
  label,
  tone = "neutral",
  value,
}: {
  readonly label: string;
  readonly tone?: "neutral" | "success" | "warning" | "danger";
  readonly value: number;
}) {
  return (
    <div className="cost-line">
      <span data-tone={tone}>{label}</span>
      <strong>{formatCurrency(value)}</strong>
    </div>
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

function setFormValue<K extends keyof ProfileFormState>(
  key: K,
  value: ProfileFormState[K],
  setForm: Dispatch<SetStateAction<ProfileFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function toPrintProfileInput(form: ProfileFormState): PrintProfileInput {
  return {
    addOnCost: toNumber(form.addOnCost),
    addOnDescription: form.addOnDescription,
    electricityRatePerKwh: toNumber(form.electricityRatePerKwh),
    expectedFailedUnits: toNumber(form.expectedFailedUnits),
    expectedGoodUnits: toNumber(form.expectedGoodUnits),
    filamentCostPerKg: toNumber(form.filamentCostPerKg),
    filamentGrams: toNumber(form.filamentGrams),
    laborMinutes: toNumber(form.laborMinutes),
    laborRatePerHour: toNumber(form.laborRatePerHour),
    notes: form.notes,
    printerPowerWatts: toNumber(form.printerPowerWatts),
    printHours: toNumber(form.printHours),
    printMinutes: toNumber(form.printMinutes),
    productId: Number(form.productId),
    profileName: form.profileName,
    saleUnit: form.saleUnit,
    supportGrams: toNumber(form.supportGrams),
    targetMarkup: toNumber(form.targetMarkup),
    wearRatePerHour: toNumber(form.wearRatePerHour),
  };
}

function toFormState(profile: PrintProfileRecord): ProfileFormState {
  return {
    addOnCost: String(profile.addOnCost),
    addOnDescription: profile.addOnDescription,
    electricityRatePerKwh: String(profile.electricityRatePerKwh),
    expectedFailedUnits: String(profile.expectedFailedUnits),
    expectedGoodUnits: String(profile.expectedGoodUnits),
    filamentCostPerKg: String(profile.filamentCostPerKg),
    filamentGrams: String(profile.filamentGrams),
    laborMinutes: String(profile.laborMinutes),
    laborRatePerHour: String(profile.laborRatePerHour),
    notes: profile.notes,
    printerPowerWatts: String(profile.printerPowerWatts),
    printHours: String(profile.printHours),
    printMinutes: String(profile.printMinutes),
    productId: String(profile.productId),
    profileName: profile.profileName,
    saleUnit: profile.saleUnit,
    supportGrams: String(profile.supportGrams),
    targetMarkup: String(profile.targetMarkup),
    wearRatePerHour: String(profile.wearRatePerHour),
  };
}

function toNumber(value: string): number {
  return Number(value.trim() || "0");
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatRepositoryError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("invoke")) {
      return "Native SQLite storage is available when the app is opened through Tauri. Browser preview can render the screen but cannot access the local database.";
    }

    return error.message;
  }

  return "Costing storage is unavailable. Open the app through Tauri to use local SQLite.";
}
