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
  ProductDesignCombobox,
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
  readonly addOns: readonly ProfileAddOnFormState[];
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

export interface ProfileAddOnFormState {
  readonly key: string;
  readonly addOnId: string;
  readonly description: string;
  readonly quantity: string;
  readonly totalCost: string;
  readonly unitCost: string;
}

const emptyForm: ProfileFormState = {
  addOns: [],
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
  const input = useMemo(
    () => toPrintProfileInput(form, settings, addOns),
    [addOns, form, settings],
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
  const selectedAddOnIds = new Set(form.addOns.map((addOn) => addOn.addOnId).filter(Boolean));

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
      const next = {
        ...current,
        addOns: key === "expectedGoodUnits"
          ? syncAddOnQuantities(current.addOns, current.expectedGoodUnits, value)
          : current.addOns,
        [key]: value,
      };

      return {
        ...next,
        filamentGrams: product ? getBatchFilamentGramsForForm(product, next) : current.filamentGrams,
      };
    });
  }

  function addAddOnRow(): void {
    setForm((current) => ({
      ...current,
      addOns: [...current.addOns, createAddOnFormRow(current.expectedGoodUnits)],
    }));
  }

  function removeAddOnRow(key: string): void {
    setForm((current) => ({
      ...current,
      addOns: current.addOns.filter((addOn) => addOn.key !== key),
    }));
  }

  function updateAddOnRow(
    key: string,
    update: (current: ProfileAddOnFormState) => ProfileAddOnFormState,
  ): void {
    setForm((current) => ({
      ...current,
      addOns: current.addOns.map((addOn) => addOn.key === key ? update(addOn) : addOn),
    }));
  }

  function handleAddOnChange(key: string, addOnId: string): void {
    const inventoryItem = addOns.find((candidate) => String(candidate.id) === addOnId) ?? null;
    updateAddOnRow(key, (current) => ({
      ...current,
      addOnId,
      description: inventoryItem ? buildAddOnDescription(inventoryItem) : "",
      totalCost: inventoryItem
        ? String(calculateAddOnCost(inventoryItem, toNumber(current.quantity)))
        : "0",
      unitCost: inventoryItem ? String(inventoryItem.unitCost) : "0",
    }));
  }

  function handleAddOnQuantityChange(key: string, quantity: string): void {
    updateAddOnRow(key, (current) => {
      const inventoryItem = addOns.find((candidate) => String(candidate.id) === current.addOnId);
      const unitCost = inventoryItem?.unitCost ?? toNumber(current.unitCost);
      return {
        ...current,
        quantity,
        totalCost: String(roundCost(unitCost * toNumber(quantity))),
      };
    });
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
                <ProductDesignCombobox
                  onSelect={(product) => handleProductChange(product ? String(product.id) : "")}
                  products={products}
                  selectedProductId={form.productId}
                />
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
              <div className="addon-editor" data-wide="true">
                <div className="addon-editor__header">
                  <span>Add-ons / Hardware</span>
                  <ToolbarButton onClick={addAddOnRow} type="button">Add Add-on</ToolbarButton>
                </div>
                {form.addOns.length === 0 ? (
                  <p className="addon-editor__empty">No add-ons configured for this profile.</p>
                ) : form.addOns.map((row, index) => {
                  const inventoryItem = addOns.find((addOn) => String(addOn.id) === row.addOnId) ?? null;
                  return (
                    <div className="addon-editor__row" key={row.key}>
                      <FormField label={`Add-on ${index + 1}`}>
                        <select
                          onChange={(event) => handleAddOnChange(row.key, event.target.value)}
                          value={row.addOnId}
                        >
                          <option value="">Choose an add-on</option>
                          {!inventoryItem && row.description ? (
                            <option value="">{row.description} (inventory item removed)</option>
                          ) : null}
                          {addOns
                            .filter((addOn) => addOn.isActive || String(addOn.id) === row.addOnId)
                            .map((addOn) => (
                              <option
                                disabled={selectedAddOnIds.has(String(addOn.id)) && String(addOn.id) !== row.addOnId}
                                key={addOn.id}
                                value={addOn.id}
                              >
                                {addOn.itemName} - {formatCurrency(addOn.unitCost, settings.currencySymbol)} / {addOn.unit}
                                {addOn.isActive ? "" : " (inactive)"}
                              </option>
                            ))}
                        </select>
                      </FormField>
                      <FormField label="Quantity">
                        <input
                          inputMode="decimal"
                          onChange={(event) => handleAddOnQuantityChange(row.key, event.target.value)}
                          value={row.quantity}
                        />
                      </FormField>
                      <div className="addon-editor__cost">
                        <span>Cost</span>
                        <strong>{formatCurrency(toNumber(row.totalCost), settings.currencySymbol)}</strong>
                      </div>
                      <ToolbarButton onClick={() => removeAddOnRow(row.key)} type="button">Remove</ToolbarButton>
                    </div>
                  );
                })}
              </div>
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
                {input.addOns.length > 0 ? (
                  <div className="addon-cost-list">
                    {input.addOns.map((addOn, index) => {
                      const inventoryItem = addOns.find((item) => item.id === addOn.addOnId);
                      return (
                        <p key={`${addOn.addOnId ?? "removed"}-${index}`}>
                          {addOn.description}: {formatQuantity(addOn.quantity, inventoryItem?.unit ?? "")} x {formatCurrency(addOn.unitCost, settings.currencySymbol)} = {formatCurrency(addOn.totalCost, settings.currencySymbol)}
                        </p>
                      );
                    })}
                    <strong>Total: {formatCurrency(breakdown.addOnCost, settings.currencySymbol)}</strong>
                  </div>
                ) : <p>No add-on or hardware items selected for this batch profile.</p>}
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
              columns={["Product", "Good", "Markup", "Unit Cost", "Suggested Sell Price"]}
              columnsTemplate="minmax(190px, 1.45fr) 0.48fr 0.5fr 0.65fr minmax(140px, 0.85fr)"
              density="dense"
              footer={`${profiles.length} print profiles. Profiles estimate only; inventory is not deducted.`}
              rows={profiles.map((profile) => {
                const profileCost = calculatePrintCost(profile);
                const profilePricing = calculatePricing({
                  costPerUnit: profileCost.costPerGoodUnit,
                  expectedGoodUnits: profile.expectedGoodUnits,
                  laborMinutes: profile.laborMinutes,
                  markupMultiplier: profile.targetMarkup,
                  printHours: profileCost.totalPrintHours,
                });

                return [
                  <button className="table-link" onClick={() => startEdit(profile)} type="button">
                    {profileProductNames.get(profile.productId) ?? `Product ${profile.productId}`}
                  </button>,
                  `${profile.expectedGoodUnits} ${profile.saleUnit}`,
                  formatMarkupPercent(profile.targetMarkup),
                  formatCurrency(profileCost.costPerGoodUnit, settings.currencySymbol),
                  formatCurrency(profilePricing.suggestedSellPrice, settings.currencySymbol),
                ];
              })}
            />
          </Panel>
        </div>

        <div className="side-stack">
          <Panel title="Cost Breakdown">
            <div className="cost-breakdown">
              <CostLine currency={settings.currencySymbol} label={`Filament (${formatCurrency(input.filamentCostPerKg, settings.currencySymbol)}/kg)`} tone="success" value={breakdown.filamentCost} />
              {input.addOns.map((addOn, index) => (
                <CostLine
                  currency={settings.currencySymbol}
                  key={`${addOn.addOnId ?? "removed"}-${index}`}
                  label={addOn.description || `Add-on ${index + 1}`}
                  tone="warning"
                  value={addOn.totalCost}
                />
              ))}
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
  inventoryAddOns: readonly AddOnRecord[],
): PrintProfileInput {
  const printTime = splitPrintTimeMinutes(toNumber(form.printMinutes));

  return {
    addOns: form.addOns.map((row) => {
      const inventoryItem = inventoryAddOns.find((addOn) => String(addOn.id) === row.addOnId);
      const quantity = toNumber(row.quantity);
      const unitCost = toNumber(row.unitCost);
      return {
        addOnId: inventoryItem?.id ?? null,
        description: inventoryItem ? buildAddOnDescription(inventoryItem) : row.description,
        quantity,
        totalCost: roundCost(unitCost * quantity),
        unitCost,
      };
    }),
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

export function toFormState(profile: PrintProfileRecord): ProfileFormState {
  return {
    addOns: profile.addOns.map((addOn, index) => ({
      addOnId: addOn.addOnId == null ? "" : String(addOn.addOnId),
      description: addOn.description,
      key: `saved-${profile.id}-${index}`,
      quantity: String(addOn.quantity),
      totalCost: String(addOn.totalCost),
      unitCost: String(addOn.unitCost),
    })),
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

let nextAddOnRowId = 1;

export function createAddOnFormRow(expectedGoodUnits: string): ProfileAddOnFormState {
  return {
    addOnId: "",
    description: "",
    key: `new-${nextAddOnRowId++}`,
    quantity: toNumber(expectedGoodUnits) > 0 ? expectedGoodUnits : "1",
    totalCost: "0",
    unitCost: "0",
  };
}

export function syncAddOnQuantities(
  addOns: readonly ProfileAddOnFormState[],
  previousExpectedGoodUnits: string,
  nextExpectedGoodUnits: string,
): readonly ProfileAddOnFormState[] {
  return addOns.map((addOn) => ({
    ...addOn,
    quantity:
      toNumber(addOn.quantity) === toNumber(previousExpectedGoodUnits)
        ? nextExpectedGoodUnits
        : addOn.quantity,
  }));
}

function roundCost(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
