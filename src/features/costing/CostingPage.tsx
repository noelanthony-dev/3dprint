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
import { addOnsRepository, printProfilesRepository, productsRepository } from "@/data/repositories";
import { localSettingsRepository } from "@/data/settings/localSettingsRepository";
import {
  calculatePrintCost,
  validatePrintProfileInput,
  type PrintProfileInput,
  type PrintProfileRecord,
} from "@/domain/costing";
import { formatQuantity, type AddOnRecord } from "@/domain/inventory";
import { calculatePricing } from "@/domain/pricing";
import type { ProductRecord, ProductSaleUnit } from "@/domain/products";
import type { AppSettings } from "@/domain/settings";

interface ProfileFormState {
  readonly addOnCost: string;
  readonly addOnDescription: string;
  readonly addOnId: string;
  readonly addOnQuantity: string;
  readonly expectedFailedUnits: string;
  readonly expectedGoodUnits: string;
  readonly filamentCostPerKg: string;
  readonly filamentGrams: string;
  readonly laborMinutes: string;
  readonly notes: string;
  readonly printMinutes: string;
  readonly productId: string;
  readonly profileName: string;
  readonly saleUnit: ProductSaleUnit;
  readonly supportGrams: string;
  readonly targetMarkup: string;
}

const emptyForm: ProfileFormState = {
  addOnCost: "0",
  addOnDescription: "",
  addOnId: "",
  addOnQuantity: "0",
  expectedFailedUnits: "0",
  expectedGoodUnits: "1",
  filamentCostPerKg: "750",
  filamentGrams: "450",
  laborMinutes: "15",
  notes: "",
  printMinutes: "0",
  productId: "",
  profileName: "0.4mm Standard",
  saleUnit: "piece",
  supportGrams: "0",
  targetMarkup: "100",
};

export function CostingPage() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [addOns, setAddOns] = useState<AddOnRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [profiles, setProfiles] = useState<PrintProfileRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => localSettingsRepository.load());
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function loadCostingData(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const [loadedProducts, loadedProfiles, loadedAddOns] = await Promise.all([
        productsRepository.list(),
        printProfilesRepository.list(),
        addOnsRepository.list(),
      ]);

      setProducts(loadedProducts);
      setProfiles(loadedProfiles);
      setAddOns(loadedAddOns);
      setSettings(localSettingsRepository.load());
      setSelectedProfileId((current) => current ?? loadedProfiles[0]?.id ?? null);

      const firstProduct = loadedProducts[0];

      if (!form.productId && firstProduct) {
        setForm((current) => ({
          ...current,
          filamentGrams: getBatchFilamentGramsForForm(firstProduct, current),
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
  const selectedAddOn = addOns.find((addOn) => String(addOn.id) === form.addOnId) ?? null;
  const input = useMemo(
    () => toPrintProfileInput(form, settings, selectedAddOn),
    [form, selectedAddOn, settings],
  );
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
    setForm((current) => {
      const product =
        products.find((candidate) => String(candidate.id) === current.productId) ??
        products[0] ??
        null;
      const nextForm = {
        ...emptyForm,
        productId: product ? String(product.id) : "",
        saleUnit: product?.saleUnit ?? "piece",
      };

      return {
        ...nextForm,
        filamentGrams: product ? getBatchFilamentGramsForForm(product, nextForm) : nextForm.filamentGrams,
      };
    });
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
      filamentGrams: product ? getBatchFilamentGramsForForm(product, current) : current.filamentGrams,
      productId,
      saleUnit: product?.saleUnit ?? current.saleUnit,
    }));
  }

  function handleExpectedUnitsChange(
    key: "expectedGoodUnits" | "expectedFailedUnits",
    value: string,
  ): void {
    const product = products.find((candidate) => String(candidate.id) === form.productId);

    setForm((current) => {
      const shouldSyncAddOnQuantity =
        key === "expectedGoodUnits" &&
        current.addOnId &&
        toNumber(current.addOnQuantity) === toNumber(current.expectedGoodUnits);
      const next = {
        ...current,
        addOnQuantity: shouldSyncAddOnQuantity ? value : current.addOnQuantity,
        [key]: value,
      };

      return {
        ...next,
        filamentGrams: product ? getBatchFilamentGramsForForm(product, next) : current.filamentGrams,
      };
    });
  }

  function handleAddOnChange(addOnId: string): void {
    const addOn = addOns.find((candidate) => String(candidate.id) === addOnId) ?? null;
    const quantity = addOn ? normalizeQuantity(form.expectedGoodUnits, "1") : "0";
    const addOnCost = addOn ? calculateAddOnCost(addOn, toNumber(quantity)) : 0;

    setForm((current) => ({
      ...current,
      addOnCost: String(addOnCost),
      addOnDescription: addOn ? buildAddOnDescription(addOn) : "",
      addOnId,
      addOnQuantity: quantity,
    }));
  }

  function handleAddOnQuantityChange(quantity: string): void {
    const addOnCost = selectedAddOn ? calculateAddOnCost(selectedAddOn, toNumber(quantity)) : 0;

    setForm((current) => ({
      ...current,
      addOnCost: String(addOnCost),
      addOnDescription: selectedAddOn ? buildAddOnDescription(selectedAddOn) : "",
      addOnQuantity: quantity,
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
      meta={["Settings defaults", "SQLite profiles", "No stock deduction"]}
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
        <MetricPanel detail="batch estimate" label="Batch Cost" value={formatCurrency(breakdown.batchCost, settings.currencySymbol)} />
        <MetricPanel detail="good units only" label="Unit Cost" value={formatCurrency(breakdown.costPerGoodUnit, settings.currencySymbol)} />
        <MetricPanel detail={`${formatMarkupPercent(input.targetMarkup)} markup`} label="Sell Price" tone="success" value={formatCurrency(pricing.suggestedSellPrice, settings.currencySymbol)} />
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
              <FormField
                label="Profile Name"
                tooltip="A saved costing preset name. Use it for the setup variant, such as 0.4mm Standard, 0.2mm Fine, or Fast Draft."
              >
                <input
                  onChange={(event) => setFormValue("profileName", event.target.value, setForm)}
                  value={form.profileName}
                />
              </FormField>
              <FormField label="Sale Unit">
                <input readOnly value={form.saleUnit} />
              </FormField>
              <FormField
                label="Filament g"
                tooltip="Auto-filled from the selected product's filament grams multiplied by good units plus expected fails. You can still edit it manually."
              >
                <input inputMode="decimal" onChange={(event) => setFormValue("filamentGrams", event.target.value, setForm)} value={form.filamentGrams} />
              </FormField>
              <FormField label="Purge/Support g">
                <input inputMode="decimal" onChange={(event) => setFormValue("supportGrams", event.target.value, setForm)} value={form.supportGrams} />
              </FormField>
              <FormField
                label={`Filament ${getCurrencyUnitLabel(settings.currencySymbol)}/kg`}
                tooltip="The price you pay for one full kilogram spool. Example: enter 1000 for a ₱1,000/kg filament."
              >
                <input inputMode="decimal" onChange={(event) => setFormValue("filamentCostPerKg", event.target.value, setForm)} value={form.filamentCostPerKg} />
              </FormField>
              <FormField label="Add-on / Hardware">
                <select onChange={(event) => handleAddOnChange(event.target.value)} value={form.addOnId}>
                  <option value="">No add-on</option>
                  {addOns.map((addOn) => (
                    <option key={addOn.id} value={addOn.id}>
                      {addOn.itemName} - {formatCurrency(addOn.unitCost, settings.currencySymbol)} / {addOn.unit}
                      {addOn.isActive ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Add-on Qty">
                <input
                  disabled={!selectedAddOn}
                  inputMode="decimal"
                  onChange={(event) => handleAddOnQuantityChange(event.target.value)}
                  value={form.addOnQuantity}
                />
              </FormField>
              <FormField
                label="Print Minutes"
                tooltip="Total machine print time in minutes. Example: enter 870 for 14h 30m."
              >
                <input inputMode="decimal" onChange={(event) => setFormValue("printMinutes", event.target.value, setForm)} value={form.printMinutes} />
              </FormField>
              <FormField label="Labor Min">
                <input inputMode="decimal" onChange={(event) => setFormValue("laborMinutes", event.target.value, setForm)} value={form.laborMinutes} />
              </FormField>
              <FormField label="Good Qty">
                <input inputMode="numeric" onChange={(event) => handleExpectedUnitsChange("expectedGoodUnits", event.target.value)} value={form.expectedGoodUnits} />
              </FormField>
              <FormField label="Expected Fails">
                <input inputMode="numeric" onChange={(event) => handleExpectedUnitsChange("expectedFailedUnits", event.target.value)} value={form.expectedFailedUnits} />
              </FormField>
              <FormField
                label="Target Markup %"
                tooltip="Markup is profit over cost. 200% markup means sell at 3x cost; 0% means sell at cost."
              >
                <input inputMode="decimal" onChange={(event) => setFormValue("targetMarkup", event.target.value, setForm)} value={form.targetMarkup} />
              </FormField>
              <div className="callout" data-wide="true">
                <Badge>Add-on Cost</Badge>
                <p>
                  {selectedAddOn
                    ? `${formatQuantity(toNumber(form.addOnQuantity), selectedAddOn.unit)} x ${formatCurrency(selectedAddOn.unitCost, settings.currencySymbol)} = ${formatCurrency(input.addOnCost, settings.currencySymbol)}`
                    : "No add-on or hardware item selected for this batch profile."}
                </p>
              </div>
              <div className="callout" data-wide="true">
                <Badge>Settings Defaults</Badge>
                <p>
                  Electricity {settings.electricityRatePerKwh.toFixed(2)} {getCurrencyUnitLabel(settings.currencySymbol)}/kWh, {settings.printerPowerWatts.toFixed(0)} watts, wear {formatCurrency(settings.wearRatePerHour, settings.currencySymbol)}/hr, labor {formatCurrency(settings.laborRateHourly, settings.currencySymbol)}/hr.
                </p>
              </div>
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
                  formatMarkupPercent(profile.targetMarkup),
                  formatCurrency(profileCost.costPerGoodUnit, settings.currencySymbol),
                ];
              })}
            />
          </Panel>
        </div>

        <div className="side-stack">
          <Panel title="Cost Breakdown">
            <div className="cost-breakdown">
              <CostLine currency={settings.currencySymbol} label={`Filament (${formatCurrency(input.filamentCostPerKg, settings.currencySymbol)}/kg)`} tone="success" value={breakdown.filamentCost} />
              <CostLine currency={settings.currencySymbol} label={input.addOnDescription || "Add-ons"} tone="warning" value={breakdown.addOnCost} />
              <CostLine currency={settings.currencySymbol} label={`Electricity (${settings.electricityRatePerKwh.toFixed(2)} ${getCurrencyUnitLabel(settings.currencySymbol)}/kWh)`} value={breakdown.electricityCost} />
              <CostLine currency={settings.currencySymbol} label={`Wear & Tear (${formatCurrency(settings.wearRatePerHour, settings.currencySymbol)}/hr)`} value={breakdown.wearCost} />
              <CostLine currency={settings.currencySymbol} label={`Labor (${formatCurrency(settings.laborRateHourly, settings.currencySymbol)}/hr)`} tone="danger" value={breakdown.laborCost} />
            </div>
            <div className="detail-stack__metric">
              <span>Total Batch Cost</span>
              <strong>{formatCurrency(breakdown.batchCost, settings.currencySymbol)}</strong>
            </div>
            <div className="key-value-list">
              <span>Good Units</span>
              <strong>{input.expectedGoodUnits}</strong>
              <span>Expected Fails</span>
              <strong>{input.expectedFailedUnits}</strong>
              <span>Failure Rate</span>
              <strong>{(breakdown.failureRate * 100).toFixed(1)}%</strong>
              <span>Cost / Good Unit</span>
              <strong>{formatCurrency(breakdown.costPerGoodUnit, settings.currencySymbol)}</strong>
            </div>
          </Panel>

          <Panel title="Pricing Guidance">
            <div className="pricing-readout">
              <span>Suggested Sell Price</span>
              <strong>{formatCurrency(pricing.suggestedSellPrice, settings.currencySymbol)}</strong>
              <small>per {form.saleUnit}</small>
            </div>
            <ProgressBar label={`${pricing.marginPercent}% margin`} value={pricing.marginPercent} />
            <div className="key-value-list">
              <span>Profit / Unit</span>
              <strong>{formatCurrency(pricing.profitPerUnit, settings.currencySymbol)}</strong>
              <span>Profit / Batch</span>
              <strong>{formatCurrency(pricing.profitPerBatch, settings.currencySymbol)}</strong>
              <span>Profit / Print Hour</span>
              <strong>{formatCurrency(pricing.profitPerHour, settings.currencySymbol)}</strong>
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
  currency,
  label,
  tone = "neutral",
  value,
}: {
  readonly currency: AppSettings["currencySymbol"];
  readonly label: string;
  readonly tone?: "neutral" | "success" | "warning" | "danger";
  readonly value: number;
}) {
  return (
    <div className="cost-line">
      <span data-tone={tone}>{label}</span>
      <strong>{formatCurrency(value, currency)}</strong>
    </div>
  );
}

function FormField({
  children,
  label,
  tooltip,
  wide = false,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly tooltip?: string;
  readonly wide?: boolean;
}) {
  return (
    <label className="form-field" data-wide={wide ? "true" : "false"}>
      <span className="form-field__label">
        <span>{label}</span>
        {tooltip ? (
          <span className="form-field__help" data-tooltip={tooltip} tabIndex={0}>
            ?
          </span>
        ) : null}
      </span>
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

function toPrintProfileInput(
  form: ProfileFormState,
  settings: AppSettings,
  selectedAddOn: AddOnRecord | null,
): PrintProfileInput {
  const addOnQuantity = toNumber(form.addOnQuantity);
  const addOnCost = selectedAddOn
    ? calculateAddOnCost(selectedAddOn, addOnQuantity)
    : toNumber(form.addOnCost);
  const printTime = splitPrintTimeMinutes(toNumber(form.printMinutes));

  return {
    addOnCost,
    addOnDescription: selectedAddOn ? buildAddOnDescription(selectedAddOn) : form.addOnDescription,
    addOnId: selectedAddOn ? selectedAddOn.id : null,
    addOnQuantity,
    electricityRatePerKwh: settings.electricityRatePerKwh,
    expectedFailedUnits: toNumber(form.expectedFailedUnits),
    expectedGoodUnits: toNumber(form.expectedGoodUnits),
    filamentCostPerKg: toNumber(form.filamentCostPerKg),
    filamentGrams: toNumber(form.filamentGrams),
    laborMinutes: toNumber(form.laborMinutes),
    laborRatePerHour: settings.laborRateHourly,
    notes: form.notes,
    printerPowerWatts: settings.printerPowerWatts,
    printHours: printTime.hours,
    printMinutes: printTime.minutes,
    productId: Number(form.productId),
    profileName: form.profileName,
    saleUnit: form.saleUnit,
    supportGrams: toNumber(form.supportGrams),
    targetMarkup: markupPercentToMultiplier(toNumber(form.targetMarkup)),
    wearRatePerHour: settings.wearRatePerHour,
  };
}

function toFormState(profile: PrintProfileRecord): ProfileFormState {
  return {
    addOnCost: String(profile.addOnCost),
    addOnDescription: profile.addOnDescription,
    addOnId: profile.addOnId == null ? "" : String(profile.addOnId),
    addOnQuantity: String(profile.addOnQuantity),
    expectedFailedUnits: String(profile.expectedFailedUnits),
    expectedGoodUnits: String(profile.expectedGoodUnits),
    filamentCostPerKg: String(profile.filamentCostPerKg),
    filamentGrams: String(profile.filamentGrams),
    laborMinutes: String(profile.laborMinutes),
    notes: profile.notes,
    printMinutes: formatMinuteInput(profile.printHours * 60 + profile.printMinutes),
    productId: String(profile.productId),
    profileName: profile.profileName,
    saleUnit: profile.saleUnit,
    supportGrams: String(profile.supportGrams),
    targetMarkup: String(markupMultiplierToPercent(profile.targetMarkup)),
  };
}

function markupPercentToMultiplier(markupPercent: number): number {
  if (!Number.isFinite(markupPercent)) {
    return 1;
  }

  return 1 + markupPercent / 100;
}

function splitPrintTimeMinutes(totalMinutes: number): { readonly hours: number; readonly minutes: number } {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return {
      hours: 0,
      minutes: totalMinutes,
    };
  }

  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function formatMinuteInput(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function markupMultiplierToPercent(markupMultiplier: number): number {
  if (!Number.isFinite(markupMultiplier)) {
    return 0;
  }

  return Math.round((markupMultiplier - 1) * 1000) / 10;
}

function formatMarkupPercent(markupMultiplier: number): string {
  return `${markupMultiplierToPercent(markupMultiplier).toFixed(1).replace(/\.0$/, "")}%`;
}

function buildAddOnDescription(addOn: AddOnRecord): string {
  return `${addOn.itemName} (${addOn.category}, ${addOn.unit})`;
}

function calculateAddOnCost(addOn: AddOnRecord, quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }

  return Math.round((addOn.unitCost * quantity + Number.EPSILON) * 100) / 100;
}

function normalizeQuantity(value: string, fallback: string): string {
  const parsed = toNumber(value);

  return parsed > 0 ? value : fallback;
}

function getBatchFilamentGramsForForm(
  product: ProductRecord,
  form: Pick<ProfileFormState, "expectedFailedUnits" | "expectedGoodUnits" | "filamentGrams">,
): string {
  const gramsPerUnit = product.hueForgeFilaments.reduce((total, filament) => {
    if (!Number.isFinite(filament.requiredGrams) || filament.requiredGrams <= 0) {
      return total;
    }

    return total + filament.requiredGrams;
  }, 0);

  if (gramsPerUnit <= 0) {
    return form.filamentGrams;
  }

  const attemptedUnits = Math.max(
    0,
    toNumber(form.expectedGoodUnits) + toNumber(form.expectedFailedUnits),
  );

  return formatGramInput(gramsPerUnit * attemptedUnits);
}

function formatGramInput(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function toNumber(value: string): number {
  return Number(value.trim() || "0");
}

function formatCurrency(value: number, currencyDisplay: AppSettings["currencySymbol"]): string {
  const currencyCode = getCurrencyCode(currencyDisplay);
  const locale = currencyCode === "PHP" ? "en-PH" : "en-US";

  return new Intl.NumberFormat(locale, {
    currency: currencyCode,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function getCurrencyCode(currencyDisplay: AppSettings["currencySymbol"]): string {
  return currencyDisplay.slice(0, 3);
}

function getCurrencyUnitLabel(currencyDisplay: AppSettings["currencySymbol"]): string {
  return getCurrencyCode(currencyDisplay) === "PHP" ? "₱" : currencyDisplay.slice(0, 3);
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
