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
import { Badge, DataTable, MetricPanel, Panel, ProductDesignCombobox, ToolbarButton } from "@/components/ui";
import { productionRunsService } from "@/data/services/productionRunsService";
import {
  addOnsRepository,
  filamentRepository,
  printProfilesRepository,
  productionRunsRepository,
  productsRepository,
} from "@/data/repositories";
import type { PrintProfileRecord } from "@/domain/costing";
import {
  formatGramsLeft,
  formatQuantity,
  normalizeHexColor,
  type AddOnRecord,
  type FilamentRecord,
} from "@/domain/inventory";
import type { ProductHueForgeFilament, ProductRecord } from "@/domain/products";
import {
  calculateProductionDeductionPlan,
  validateProductionAddOnCorrectionInput,
  validateProductionRunInput,
  type ProductionAddOnCorrectionInput,
  type ProductionAddOnCorrectionRecord,
  type ProductionDeductionPlan,
  type ProductionRunInput,
  type ProductionRunRecord,
} from "@/domain/production";

interface RunFormState {
  readonly addOns: readonly RunAddOnFormState[];
  readonly expectedPieces: string;
  readonly failedPieces: string;
  readonly failureReason: string;
  readonly filamentId: string;
  readonly filamentSelections: Record<string, string>;
  readonly goodPieces: string;
  readonly notes: string;
  readonly printProfileId: string;
  readonly productId: string;
  readonly runDate: string;
}

interface RunAddOnFormState {
  readonly key: string;
  readonly addOnId: string;
  readonly quantity: string;
}

interface AddOnCorrectionFormState {
  readonly addOns: readonly RunAddOnFormState[];
  readonly reason: string;
}

export interface ProductionAddOnCorrectionPreviewItem {
  readonly addOnId: number;
  readonly quantityDelta: number;
  readonly runQuantityAfter: number;
  readonly runQuantityBefore: number;
  readonly stockQuantityAfter: number;
}

const emptyForm: RunFormState = {
  addOns: [],
  expectedPieces: "10",
  failedPieces: "0",
  failureReason: "",
  filamentId: "",
  filamentSelections: {},
  goodPieces: "10",
  notes: "",
  printProfileId: "",
  productId: "",
  runDate: todayInputValue(),
};

const emptyPlan: ProductionDeductionPlan = {
  addOnDeductions: [],
  attemptedPieces: 0,
  expectedPieces: 0,
  failedPieces: 0,
  filamentDeductions: [],
  failureRate: 0,
  filamentGramsToDeduct: 0,
  finishedGoodsQuantityToAdd: 0,
  goodPieces: 0,
  profileAttemptedPieces: 1,
  scaleFactor: 0,
  warnings: [],
};

export function ProductionRunsPage() {
  const [addOns, setAddOns] = useState<AddOnRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingRun, setEditingRun] = useState<ProductionRunRecord | null>(null);
  const [correctionForm, setCorrectionForm] = useState<AddOnCorrectionFormState>({ addOns: [], reason: "" });
  const [correctionHistory, setCorrectionHistory] = useState<ProductionAddOnCorrectionRecord[]>([]);
  const [filaments, setFilaments] = useState<FilamentRecord[]>([]);
  const [form, setForm] = useState<RunFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [profiles, setProfiles] = useState<PrintProfileRecord[]>([]);
  const [runs, setRuns] = useState<ProductionRunRecord[]>([]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function loadProductionData(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const [loadedProducts, loadedProfiles, loadedFilaments, loadedAddOns, loadedRuns] =
        await Promise.all([
          productsRepository.list(),
          printProfilesRepository.list(),
          filamentRepository.list(),
          addOnsRepository.list(),
          productionRunsRepository.list(),
        ]);

      setProducts(loadedProducts);
      setProfiles(loadedProfiles);
      setFilaments(loadedFilaments);
      setAddOns(loadedAddOns);
      setRuns(loadedRuns);
      setForm((current) =>
        hydrateEmptySelections(current, loadedProducts, loadedProfiles, loadedFilaments),
      );
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProductionData();
  }, []);

  const productNames = useMemo(
    () => new Map(products.map((product) => [product.id, product.designName] as const)),
    [products],
  );
  const profileNames = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.profileName] as const)),
    [profiles],
  );
  const filamentNames = useMemo(
    () =>
      new Map(
        filaments.map((filament) => [
          filament.id,
          `${filament.brand} ${filament.name} (${formatGramsLeft(filament.estimatedGramsLeft)})`,
        ] as const),
      ),
    [filaments],
  );
  const addOnNames = useMemo(
    () => new Map(addOns.map((addOn) => [addOn.id, addOn.itemName] as const)),
    [addOns],
  );

  const selectedProduct = products.find((product) => String(product.id) === form.productId) ?? null;
  const selectableProfiles = selectedProduct
    ? profiles.filter((profile) => profile.productId === selectedProduct.id)
    : profiles;
  const selectedProfile =
    profiles.find((profile) => String(profile.id) === form.printProfileId) ?? null;
  const selectedFilament =
    filaments.find((filament) => String(filament.id) === form.filamentId) ?? null;
  const productFilamentRequirements = selectedProduct
    ? getProductFilamentRequirements(selectedProduct)
    : [];
  const selectableFilamentsForRun = filaments.filter(isUsableProductionFilament);
  const input = useMemo(
    () => toProductionRunInput(form, productFilamentRequirements),
    [form, productFilamentRequirements],
  );
  const validation = validateProductionRunInput(input);
  const deductionPlan = selectedProfile
    ? calculateProductionDeductionPlan(selectedProfile, input)
    : emptyPlan;
  const suggestedFilaments = selectedProduct && productFilamentRequirements.length === 0
    ? getSuggestedInventoryFilaments(
        selectedProduct,
        selectableFilamentsForRun,
        deductionPlan.filamentGramsToDeduct,
      )
    : [];
  const otherFilaments = selectableFilamentsForRun.filter(
    (filament) => !suggestedFilaments.some((suggested) => suggested.id === filament.id),
  );

  const totalGoodPieces = runs.reduce((sum, run) => sum + run.goodPieces, 0);
  const totalFailedPieces = runs.reduce((sum, run) => sum + run.failedPieces, 0);
  const totalFilamentDeducted = runs.reduce((sum, run) => sum + run.filamentGramsDeducted, 0);
  const yieldRate =
    totalGoodPieces + totalFailedPieces > 0
      ? totalGoodPieces / (totalGoodPieces + totalFailedPieces)
      : 0;
  const correctionInput = editingRun
    ? toProductionAddOnCorrectionInput(editingRun.id, correctionForm)
    : null;
  const correctionValidation = correctionInput
    ? validateProductionAddOnCorrectionInput(correctionInput)
    : null;
  const correctionPreview = editingRun
    ? calculateProductionAddOnCorrectionPreview(editingRun, correctionForm.addOns, addOns)
    : [];

  function handleProductChange(productId: string): void {
    const nextProduct = products.find((product) => String(product.id) === productId);
    const nextProfile = nextProduct
      ? profiles.find((profile) => profile.productId === nextProduct.id)
      : null;
    const nextProfileDefaults = getProfileRunDefaults(nextProfile);

    setForm((current) => ({
      ...current,
      ...nextProfileDefaults,
      printProfileId: nextProfile ? String(nextProfile.id) : "",
      productId,
      filamentSelections: chooseRecommendedFilamentSelections(
        nextProduct ?? null,
        filaments,
        nextProfile ? nextProfile.expectedGoodUnits + nextProfile.expectedFailedUnits : 1,
      ),
      filamentId: chooseRecommendedFilamentId(
        nextProduct ?? null,
        filaments,
        nextProfile ? nextProfile.filamentGrams + nextProfile.supportGrams : 0,
      ),
    }));
  }

  function handleProfileChange(printProfileId: string): void {
    const nextProfile = profiles.find((profile) => String(profile.id) === printProfileId);
    const nextProfileDefaults = getProfileRunDefaults(nextProfile);

    setForm((current) => ({
      ...current,
      ...nextProfileDefaults,
      filamentSelections: chooseRecommendedFilamentSelections(
        selectedProduct,
        filaments,
        nextProfile ? nextProfile.expectedGoodUnits + nextProfile.expectedFailedUnits : 1,
      ),
      printProfileId,
    }));
  }

  function handleRequirementFilamentChange(index: number, filamentId: string): void {
    setForm((current) => {
      const nextSelections = {
        ...current.filamentSelections,
        [String(index)]: filamentId,
      };
      const firstSelection = Object.keys(nextSelections)
        .sort((left, right) => Number(left) - Number(right))
        .map((key) => nextSelections[key])
        .find(Boolean);

      return {
        ...current,
        filamentId: firstSelection ?? current.filamentId,
        filamentSelections: nextSelections,
      };
    });
  }

  function addAddOnRow(): void {
    setForm((current) => ({
      ...current,
      addOns: [...current.addOns, createRunAddOnRow()],
    }));
  }

  function updateAddOnRow(key: string, field: "addOnId" | "quantity", value: string): void {
    setForm((current) => ({
      ...current,
      addOns: current.addOns.map((addOn) =>
        addOn.key === key ? { ...addOn, [field]: value } : addOn,
      ),
    }));
  }

  function removeAddOnRow(key: string): void {
    setForm((current) => ({
      ...current,
      addOns: current.addOns.filter((addOn) => addOn.key !== key),
    }));
  }

  function addCorrectionAddOnRow(): void {
    setCorrectionForm((current) => ({
      ...current,
      addOns: [...current.addOns, createRunAddOnRow()],
    }));
  }

  function updateCorrectionAddOnRow(
    key: string,
    field: "addOnId" | "quantity",
    value: string,
  ): void {
    setCorrectionForm((current) => ({
      ...current,
      addOns: current.addOns.map((addOn) =>
        addOn.key === key ? { ...addOn, [field]: value } : addOn,
      ),
    }));
  }

  function removeCorrectionAddOnRow(key: string): void {
    setCorrectionForm((current) => ({
      ...current,
      addOns: current.addOns.filter((addOn) => addOn.key !== key),
    }));
  }

  async function openCorrectionModal(run: ProductionRunRecord): Promise<void> {
    setValidationMessage(null);
    setError(null);
    setEditingRun(run);
    setCorrectionForm({
      addOns: run.addOnDeductions.map((deduction, index) => ({
        addOnId: String(deduction.addOnId),
        key: `correction-${run.id}-${deduction.addOnId}-${index}`,
        quantity: String(deduction.quantityDeducted),
      })),
      reason: "",
    });
    setCorrectionHistory([]);

    try {
      setCorrectionHistory(await productionRunsRepository.listAddOnCorrections(run.id));
    } catch (historyError) {
      setError(formatRepositoryError(historyError));
    }
  }

  function closeCorrectionModal(): void {
    if (!isSaving) {
      setEditingRun(null);
      setCorrectionHistory([]);
    }
  }

  async function handleCorrectionSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    if (!editingRun || !correctionInput || !correctionValidation?.valid) {
      setValidationMessage(
        correctionValidation
          ? Object.values(correctionValidation.errors)[0] ?? "Check the correction fields."
          : "Choose a production run to correct.",
      );
      return;
    }

    const previewError = getProductionAddOnCorrectionPreviewError(
      editingRun,
      correctionForm.addOns,
      addOns,
      correctionPreview,
    );
    if (previewError) {
      setValidationMessage(previewError);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await productionRunsService.correctAddOns(correctionInput);
      await loadProductionData();
      setEditingRun(null);
      setCorrectionHistory([]);
      setValidationMessage("Production add-ons corrected. Inventory and the linked expense were updated.");
    } catch (saveError) {
      setError(formatRepositoryError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  function handleOpenRunModal(): void {
    setValidationMessage(null);
    setIsRunModalOpen(true);
  }

  function handleCloseRunModal(): void {
    if (!isSaving) {
      setIsRunModalOpen(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    if (!validation.valid) {
      setValidationMessage(Object.values(validation.errors)[0] ?? "Check the production run fields.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await productionRunsService.logProductionRun(input);
      await loadProductionData();
      setValidationMessage("Production run logged. Estimated inventory and finished goods were updated.");
      setIsRunModalOpen(false);
      setForm((current) => ({
        ...current,
        failureReason: "",
        notes: "",
        runDate: todayInputValue(),
      }));
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
          <ToolbarButton onClick={() => void loadProductionData()}>Refresh</ToolbarButton>
          <ToolbarButton
            disabled={products.length === 0 || profiles.length === 0 || filaments.length === 0}
            onClick={handleOpenRunModal}
            tone="primary"
            type="button"
          >
            Record Production
          </ToolbarButton>
        </>
      }
      description="Log production runs, deduct estimated filament and add-ons, and move good pieces into home finished goods stock."
      meta={["SQLite production log", "Estimated deductions", "Manual corrections preserved"]}
      title="Production Runs"
    >
      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}
      {validationMessage ? (
        <div className="callout">
          <Badge tone={validationMessage.startsWith("Production") ? "success" : "warning"}>
            Run Log
          </Badge>
          <p>{validationMessage}</p>
        </div>
      ) : null}
      {!error && (products.length === 0 || profiles.length === 0 || filaments.length === 0) ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Prerequisites</Badge>
          <p>Create at least one product, print profile, and filament spool before logging production.</p>
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricPanel detail="saved records" label="Runs Logged" value={isLoading ? "..." : String(runs.length)} />
        <MetricPanel detail={`${totalFailedPieces} failed`} label="Good Pieces" tone="success" value={String(totalGoodPieces)} />
        <MetricPanel detail="good / attempted" label="Yield Rate" value={`${(yieldRate * 100).toFixed(1)}%`} />
        <MetricPanel detail="estimated usage" label="Filament Used" value={formatGramsLeft(totalFilamentDeducted)} />
      </div>

      <div className="side-stack">
        <Panel title="Production History" actions={<Badge>{runs.length} runs</Badge>}>
          <DataTable
            columns={["Date", "Product", "Profile", "Yield", "Filament", "Add-on", "Actions"]}
            columnsTemplate="0.68fr minmax(145px, 1.2fr) minmax(120px, 0.95fr) 0.46fr 0.5fr minmax(145px, 0.9fr) 0.46fr"
            density="dense"
            footer={runs.length === 0 ? "No production runs logged yet." : `Showing ${runs.length} production runs.`}
            rows={runs.map((run) => [
              run.runDate,
              productNames.get(run.productId) ?? `Product ${run.productId}`,
              profileNames.get(run.printProfileId) ?? `Profile ${run.printProfileId}`,
              <span className="numeric-readout">
                <strong>{run.goodPieces}</strong> / {run.failedPieces}
              </span>,
              formatGramsLeft(run.filamentGramsDeducted),
              <span className="production-addon-summary">
                <span>
                  {run.addOnDeductions.length > 0
                    ? run.addOnDeductions
                        .map((deduction) => `${formatQuantity(deduction.quantityDeducted, "")} ${addOnNames.get(deduction.addOnId) ?? "add-on"}`)
                        .join(", ")
                    : "--"}
                </span>
                {run.addOnCorrectionCount > 0 ? <Badge tone="warning">Corrected</Badge> : null}
              </span>,
              <span className="table-actions">
                <button disabled={isSaving} onClick={() => void openCorrectionModal(run)} type="button">
                  Correct Add-ons
                </button>
              </span>,
            ])}
          />
        </Panel>
      </div>

      {editingRun ? (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeCorrectionModal();
        }} role="presentation">
          <section
            aria-labelledby="production-correction-modal-title"
            aria-modal="true"
            className="modal production-correction-modal"
            role="dialog"
          >
            <header className="modal__header">
              <div className="modal__title-stack">
                <h2 id="production-correction-modal-title">Correct Production Add-ons</h2>
                <span className="modal__position">RUN-{editingRun.id}</span>
              </div>
              <button aria-label="Close production correction" disabled={isSaving} onClick={closeCorrectionModal} type="button">x</button>
            </header>
            <div className="modal__body">
              <div className="production-correction-modal__grid">
                <form className="inventory-form" onSubmit={(event) => void handleCorrectionSubmit(event)}>
                  <div className="callout callout--warning" data-wide="true">
                    <Badge tone="warning">Audited Correction</Badge>
                    <p>Only add-ons can change. Stock is adjusted by the difference and the original production movements remain preserved.</p>
                  </div>
                  <div className="production-correction-locked" data-wide="true">
                    <span>Product</span>
                    <strong>{productNames.get(editingRun.productId) ?? `Product ${editingRun.productId}`}</strong>
                    <span>Date</span>
                    <strong>{editingRun.runDate}</strong>
                    <span>Yield</span>
                    <strong>{editingRun.goodPieces} good / {editingRun.failedPieces} failed</strong>
                    <span>Filament</span>
                    <strong>{formatGramsLeft(editingRun.filamentGramsDeducted)}</strong>
                  </div>
                  <div className="addon-editor" data-wide="true">
                    <div className="addon-editor__header">
                      <span>Corrected Add-on Deductions</span>
                      <ToolbarButton onClick={addCorrectionAddOnRow} type="button">Add Add-on</ToolbarButton>
                    </div>
                    {correctionForm.addOns.length === 0 ? (
                      <p className="addon-editor__empty">No add-ons will remain assigned to this run.</p>
                    ) : correctionForm.addOns.map((row, index) => {
                      const original = editingRun.addOnDeductions.find(
                        (deduction) => deduction.addOnId === Number(row.addOnId),
                      );
                      return (
                        <div className="addon-editor__row" key={row.key}>
                          <FormField label={`Add-on ${index + 1}`}>
                            <select
                              onChange={(event) => updateCorrectionAddOnRow(row.key, "addOnId", event.target.value)}
                              value={row.addOnId}
                            >
                              <option value="">Choose an add-on</option>
                              {addOns
                                .filter((addOn) => addOn.isActive || original?.addOnId === addOn.id)
                                .map((addOn) => (
                                  <option
                                    disabled={correctionForm.addOns.some((selected) => selected.key !== row.key && selected.addOnId === String(addOn.id))}
                                    key={addOn.id}
                                    value={addOn.id}
                                  >
                                    {addOn.itemName} ({formatQuantity(addOn.quantityOnHand, addOn.unit)}){addOn.isActive ? "" : " - inactive"}
                                  </option>
                                ))}
                            </select>
                          </FormField>
                          <FormField label="Quantity">
                            <input
                              inputMode="decimal"
                              onChange={(event) => updateCorrectionAddOnRow(row.key, "quantity", event.target.value)}
                              value={row.quantity}
                            />
                          </FormField>
                          <ToolbarButton onClick={() => removeCorrectionAddOnRow(row.key)} type="button">Remove</ToolbarButton>
                        </div>
                      );
                    })}
                  </div>
                  <FormField label="Correction Reason" wide>
                    <textarea
                      maxLength={500}
                      onChange={(event) => setCorrectionForm((current) => ({ ...current, reason: event.target.value }))}
                      placeholder="Why is this production history being corrected?"
                      value={correctionForm.reason}
                    />
                  </FormField>
                  {validationMessage ? (
                    <div className="form-message" role="alert">
                      {validationMessage}
                    </div>
                  ) : null}
                  {error ? (
                    <div className="callout callout--warning" data-wide="true" role="alert">
                      <Badge tone="warning">Correction</Badge>
                      <p>{error}</p>
                    </div>
                  ) : null}
                  <div className="form-actions">
                    <ToolbarButton disabled={isSaving} onClick={closeCorrectionModal} type="button">Cancel</ToolbarButton>
                    <ToolbarButton isLoading={isSaving} loadingLabel="Saving" tone="primary" type="submit">
                      Save Correction
                    </ToolbarButton>
                  </div>
                </form>

                <aside className="side-stack" aria-label="Correction preview">
                  <Panel title="Inventory Delta" actions={<Badge>{correctionPreview.length || "No changes"}</Badge>}>
                    {correctionPreview.length === 0 ? (
                      <p className="muted-copy">Change an add-on or quantity to preview its stock impact.</p>
                    ) : (
                      <div className="production-correction-preview">
                        {correctionPreview.map((item) => {
                          const addOn = addOns.find((candidate) => candidate.id === item.addOnId);
                          return (
                            <div key={item.addOnId}>
                              <span>{addOn?.itemName ?? `Add-on ${item.addOnId}`}</span>
                              <strong>{item.quantityDelta > 0 ? "Deduct" : "Return"} {formatQuantity(Math.abs(item.quantityDelta), addOn?.unit ?? "")}</strong>
                              <small>Run {formatQuantity(item.runQuantityBefore, "")} → {formatQuantity(item.runQuantityAfter, "")} · Stock after {formatQuantity(item.stockQuantityAfter, addOn?.unit ?? "")}</small>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Panel>
                  <Panel title="Correction History" actions={<Badge>{correctionHistory.length}</Badge>}>
                    {correctionHistory.length === 0 ? (
                      <p className="muted-copy">No prior corrections for this run.</p>
                    ) : (
                      <div className="production-correction-history">
                        {correctionHistory.map((correction) => (
                          <div key={correction.id}>
                            <strong>{correction.reason}</strong>
                            <small>{formatCorrectionTimestamp(correction.createdAt)}</small>
                            <span>{correction.items.map((item) => {
                              const name = addOnNames.get(item.addOnId) ?? `Add-on ${item.addOnId}`;
                              const sign = item.quantityDelta > 0 ? "+" : "";
                              return `${name} ${sign}${formatQuantity(item.quantityDelta, "")}`;
                            }).join(", ")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                </aside>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isRunModalOpen ? (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            handleCloseRunModal();
          }
        }} role="presentation">
          <div aria-labelledby="production-run-modal-title" aria-modal="true" className="modal production-run-modal" role="dialog">
            <div className="modal__header">
              <h2 id="production-run-modal-title">Record Production Run</h2>
              <button aria-label="Close production run form" disabled={isSaving} onClick={handleCloseRunModal} type="button">
                x
              </button>
            </div>
            <div className="modal__body">
              <div className="production-run-modal__grid">
                <div className="side-stack">
                  <div className="callout callout--warning">
                    <Badge tone="warning">Inventory Impact</Badge>
                    <p>Saving a run deducts estimated filament and optional add-ons, then adds good pieces to home stock.</p>
                  </div>
                  <form className="inventory-form" id="production-run-form" onSubmit={(event) => void handleSubmit(event)}>
                    <FormField label="Product / Design" wide>
                      <ProductDesignCombobox
                        onSelect={(product) => handleProductChange(product ? String(product.id) : "")}
                        products={products}
                        selectedProductId={form.productId}
                      />
                    </FormField>
                    <FormField
                      label="Print Profile"
                      tooltip="A saved production preset from Print Profiles & Costing. It supplies grams, expected yield, and add-on defaults for this run."
                    >
                      <select onChange={(event) => handleProfileChange(event.target.value)} value={form.printProfileId}>
                        <option value="">Choose profile...</option>
                        {selectableProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.profileName}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    {selectedProduct && selectableProfiles.length === 0 ? (
                      <div className="callout callout--warning" data-wide="true">
                        <Badge tone="warning">Profile Required</Badge>
                        <p>Create a print profile for this product in Print Profiles & Costing before logging production.</p>
                      </div>
                    ) : null}
                    <FormField label="Run Date">
                      <input onChange={(event) => setFormValue("runDate", event.target.value, setForm)} type="date" value={form.runDate} />
                    </FormField>
                    {productFilamentRequirements.length > 0 ? (
                      <div className="form-section production-requirements">
                        <div className="form-section__header">
                          <span>Filament Deductions</span>
                          <Badge>{productFilamentRequirements.length} rows</Badge>
                        </div>
                        <div className="production-deduction-list">
                          {productFilamentRequirements.map((requirement, index) => (
                            <div className="production-deduction-list__item" key={`${requirement.brand}-${requirement.colorName}-${index}`}>
                              <span>{formatProductFilamentRequirement(requirement)}</span>
                              <select
                                aria-label={`Inventory stock for ${formatProductFilamentRequirement(requirement)}`}
                                onChange={(event) => handleRequirementFilamentChange(index, event.target.value)}
                                value={form.filamentSelections[String(index)] ?? ""}
                              >
                                <option value="">Choose inventory stock...</option>
                                {getSuggestedInventoryFilamentsForRequirement(
                                  requirement,
                                  selectableFilamentsForRun,
                                  getScaledRequirementGrams(requirement, deductionPlan.attemptedPieces),
                                ).map((filament) => (
                                  <option key={filament.id} value={filament.id}>
                                    {filamentNames.get(filament.id)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <FormField
                        label="Deduct From Inventory"
                        tooltip="The print profile decides how many grams to deduct. This selects which local stock record loses those grams."
                        wide
                      >
                        <select onChange={(event) => setFormValue("filamentId", event.target.value, setForm)} value={form.filamentId}>
                          <option value="">Choose inventory stock...</option>
                          {suggestedFilaments.length > 0 ? (
                            <optgroup label="Suggested for selected product">
                              {suggestedFilaments.map((filament) => (
                                <option key={filament.id} value={filament.id}>
                                  {filamentNames.get(filament.id)}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                          <optgroup label={suggestedFilaments.length > 0 ? "Other stock" : "Available stock"}>
                            {otherFilaments.map((filament) => (
                              <option key={filament.id} value={filament.id}>
                                {filamentNames.get(filament.id)}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </FormField>
                    )}
                    <FormField label="Expected Pieces">
                      <input inputMode="numeric" onChange={(event) => setFormValue("expectedPieces", event.target.value, setForm)} value={form.expectedPieces} />
                    </FormField>
                    <FormField label="Good Pieces">
                      <input inputMode="numeric" onChange={(event) => setFormValue("goodPieces", event.target.value, setForm)} value={form.goodPieces} />
                    </FormField>
                    <FormField label="Failed Pieces">
                      <input inputMode="numeric" onChange={(event) => setFormValue("failedPieces", event.target.value, setForm)} value={form.failedPieces} />
                    </FormField>
                    <div className="addon-editor" data-wide="true">
                      <div className="addon-editor__header">
                        <span>Add-on Deductions</span>
                        <ToolbarButton onClick={addAddOnRow} type="button">Add Add-on</ToolbarButton>
                      </div>
                      {form.addOns.length === 0 ? (
                        <p className="addon-editor__empty">No add-on deductions for this run.</p>
                      ) : form.addOns.map((row, index) => (
                        <div className="addon-editor__row" key={row.key}>
                          <FormField label={`Add-on ${index + 1}`}>
                            <select
                              onChange={(event) => updateAddOnRow(row.key, "addOnId", event.target.value)}
                              value={row.addOnId}
                            >
                              <option value="">Choose an add-on</option>
                              {addOns
                                .filter((addOn) => addOn.isActive || String(addOn.id) === row.addOnId)
                                .map((addOn) => (
                                  <option
                                    disabled={form.addOns.some((selected) => selected.key !== row.key && selected.addOnId === String(addOn.id))}
                                    key={addOn.id}
                                    value={addOn.id}
                                  >
                                    {addOn.itemName} ({formatQuantity(addOn.quantityOnHand, addOn.unit)})
                                  </option>
                                ))}
                            </select>
                          </FormField>
                          <FormField label="Quantity">
                            <input
                              inputMode="decimal"
                              onChange={(event) => updateAddOnRow(row.key, "quantity", event.target.value)}
                              value={row.quantity}
                            />
                          </FormField>
                          <ToolbarButton onClick={() => removeAddOnRow(row.key)} type="button">Remove</ToolbarButton>
                        </div>
                      ))}
                    </div>
                    <FormField label="Failure Reason" wide>
                      <input onChange={(event) => setFormValue("failureReason", event.target.value, setForm)} value={form.failureReason} />
                    </FormField>
                    <FormField label="Notes" wide>
                      <textarea onChange={(event) => setFormValue("notes", event.target.value, setForm)} value={form.notes} />
                    </FormField>
                    <div className="form-actions">
                      <ToolbarButton
                        disabled={products.length === 0 || selectedProfile == null || filaments.length === 0}
                        isLoading={isSaving}
                        loadingLabel="Saving"
                        tone="primary"
                        type="submit"
                      >
                        Save & Update Stock
                      </ToolbarButton>
                    </div>
                  </form>
                </div>

                <div className="side-stack">
                  <Panel title="Deduction Preview" actions={selectedProfile ? <Badge>CFG-{selectedProfile.id}</Badge> : <Badge>Draft</Badge>}>
            <div className="key-value-list">
              <span>Attempted Pieces</span>
              <strong>{deductionPlan.attemptedPieces}</strong>
              <span>Good to Stock</span>
              <strong>{deductionPlan.finishedGoodsQuantityToAdd}</strong>
              <span>Filament Deduction</span>
              <strong>{formatGramsLeft(deductionPlan.filamentGramsToDeduct)}</strong>
              <span>Failure Rate</span>
              <strong>{(deductionPlan.failureRate * 100).toFixed(1)}%</strong>
              <span>Filament Sources</span>
              <strong>{selectedFilament ? formatGramsLeft(selectedFilament.estimatedGramsLeft) : "--"}</strong>
              <span>Product Filaments</span>
              <strong>{productFilamentRequirements.length > 0 ? productFilamentRequirements.length : "--"}</strong>
              <span>Add-on Deductions</span>
              <strong>{deductionPlan.addOnDeductions.length || "--"}</strong>
            </div>
            {deductionPlan.addOnDeductions.length > 0 ? (
              <div className="production-deduction-preview">
                {deductionPlan.addOnDeductions.map((deduction) => {
                  const item = addOns.find((addOn) => addOn.id === deduction.addOnId);
                  return (
                    <div key={deduction.addOnId}>
                      <span>{item?.itemName ?? `Add-on ${deduction.addOnId}`}</span>
                      <strong>{formatQuantity(deduction.quantityToDeduct, item?.unit ?? "")}</strong>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {deductionPlan.filamentDeductions.length > 1 ? (
              <div className="production-deduction-preview">
                {deductionPlan.filamentDeductions.map((deduction, index) => (
                  <div key={`${deduction.requirementLabel}-${index}`}>
                    <span>{deduction.requirementLabel}</span>
                    <strong>{formatGramsLeft(deduction.gramsToDeduct)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {deductionPlan.warnings.length > 0 ? (
              <div className="callout callout--warning">
                <Badge tone="warning">Warnings</Badge>
                <p>{deductionPlan.warnings.join(" ")}</p>
              </div>
            ) : null}
                  </Panel>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
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
        {label}
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

function hydrateEmptySelections(
  current: RunFormState,
  products: readonly ProductRecord[],
  profiles: readonly PrintProfileRecord[],
  filaments: readonly FilamentRecord[],
): RunFormState {
  if (current.productId || current.printProfileId || current.filamentId) {
    return current;
  }

  const product = products[0];
  const profile = product
    ? profiles.find((candidate) => candidate.productId === product.id)
    : profiles[0];
  const profileDefaults = getProfileRunDefaults(profile);

  return {
    ...current,
    ...profileDefaults,
    filamentSelections: chooseRecommendedFilamentSelections(
      product ?? null,
      filaments,
      profile ? profile.expectedGoodUnits + profile.expectedFailedUnits : 1,
    ),
    filamentId: chooseRecommendedFilamentId(
      product ?? null,
      filaments,
      profile ? profile.filamentGrams + profile.supportGrams : 0,
    ),
    printProfileId: profile ? String(profile.id) : "",
    productId: product ? String(product.id) : "",
  };
}

function getProfileRunDefaults(
  profile: PrintProfileRecord | null | undefined,
): Pick<
  RunFormState,
  "addOns" | "expectedPieces" | "failedPieces" | "goodPieces"
> {
  if (!profile) {
    return {
      addOns: [],
      expectedPieces: "",
      failedPieces: "0",
      goodPieces: "",
    };
  }

  return {
    addOns: profile.addOns
      .filter((addOn) => addOn.addOnId != null)
      .map((addOn, index) => ({
        addOnId: String(addOn.addOnId),
        key: `profile-${profile.id}-${index}`,
        quantity: String(addOn.quantity),
      })),
    expectedPieces: String(profile.expectedGoodUnits + profile.expectedFailedUnits),
    failedPieces: String(profile.expectedFailedUnits),
    goodPieces: String(profile.expectedGoodUnits),
  };
}

function getProductFilamentRequirements(
  product: ProductRecord,
): readonly ProductHueForgeFilament[] {
  return product.hueForgeFilaments.filter(
    (requirement) =>
      requirement.requiredGrams > 0 ||
      requirement.brand.trim() ||
      requirement.colorName.trim() ||
      requirement.materialType !== "Other",
  );
}

function getSuggestedInventoryFilaments(
  product: ProductRecord,
  filaments: readonly FilamentRecord[],
  requiredGrams: number,
): readonly FilamentRecord[] {
  const requirements = getProductFilamentRequirements(product);
  const openEnoughFilaments = filaments.filter(
    (filament) => isUsableProductionFilament(filament) && filament.estimatedGramsLeft >= requiredGrams,
  );
  const exactMatches = openEnoughFilaments.filter((filament) =>
    requirements.some((requirement) => doesFilamentMatchRequirement(filament, requirement)),
  );

  if (exactMatches.length > 0) {
    return sortFilamentsForProduction(exactMatches);
  }

  const materialMatches = openEnoughFilaments.filter((filament) =>
    requirements.some((requirement) => filament.materialType === requirement.materialType),
  );

  if (materialMatches.length > 0) {
    return sortFilamentsForProduction(materialMatches);
  }

  return sortFilamentsForProduction(openEnoughFilaments);
}

export function getSuggestedInventoryFilamentsForRequirement(
  requirement: ProductHueForgeFilament,
  filaments: readonly FilamentRecord[],
  requiredGrams: number,
): readonly FilamentRecord[] {
  const openEnoughFilaments = filaments.filter(
    (filament) => isUsableProductionFilament(filament) && filament.estimatedGramsLeft >= requiredGrams,
  );
  const exactMatches = openEnoughFilaments.filter((filament) =>
    doesFilamentMatchRequirement(filament, requirement),
  );
  const rankedIds = new Set(exactMatches.map((filament) => filament.id));
  const alternativeMatches: FilamentRecord[] = [];

  requirement.alternativeFilamentIds.forEach((filamentId) => {
    const alternative = openEnoughFilaments.find((filament) => filament.id === filamentId);

    if (alternative && !rankedIds.has(alternative.id)) {
      alternativeMatches.push(alternative);
      rankedIds.add(alternative.id);
    }
  });

  const materialMatches = openEnoughFilaments.filter(
    (filament) =>
      filament.materialType === requirement.materialType &&
      !rankedIds.has(filament.id),
  );
  materialMatches.forEach((filament) => rankedIds.add(filament.id));
  const otherMatches = openEnoughFilaments.filter((filament) => !rankedIds.has(filament.id));

  return [
    ...sortFilamentsForProduction(exactMatches),
    ...alternativeMatches,
    ...sortFilamentsForProduction(materialMatches),
    ...sortFilamentsForProduction(otherMatches),
  ];
}

export function chooseRecommendedFilamentSelections(
  product: ProductRecord | null,
  filaments: readonly FilamentRecord[],
  attemptedPieces: number,
): Record<string, string> {
  if (!product) {
    return {};
  }

  const requirements = getProductFilamentRequirements(product);
  return Object.fromEntries(
    requirements.map((requirement, index) => {
      const suggested = getSuggestedInventoryFilamentsForRequirement(
        requirement,
        filaments,
        getScaledRequirementGrams(requirement, attemptedPieces),
      );

      return [String(index), suggested[0] ? String(suggested[0].id) : ""];
    }),
  );
}

function chooseRecommendedFilamentId(
  product: ProductRecord | null,
  filaments: readonly FilamentRecord[],
  requiredGrams: number,
): string {
  const suggested = product
    ? getSuggestedInventoryFilaments(product, filaments, requiredGrams)
    : sortFilamentsForProduction(
        filaments.filter(
          (filament) =>
            isUsableProductionFilament(filament) &&
            filament.estimatedGramsLeft >= requiredGrams,
        ),
      );

  return suggested[0] ? String(suggested[0].id) : filaments[0] ? String(filaments[0].id) : "";
}

function isUsableProductionFilament(filament: FilamentRecord): boolean {
  return filament.spoolStatus !== "archived" && filament.spoolStatus !== "empty";
}

function doesFilamentMatchRequirement(
  filament: FilamentRecord,
  requirement: ProductHueForgeFilament,
): boolean {
  if (filament.materialType !== requirement.materialType) {
    return false;
  }

  const requirementBrand = requirement.brand.trim().toLowerCase();
  const requirementColor = requirement.colorName.trim().toLowerCase();
  const brandMatches =
    !requirementBrand || filament.brand.trim().toLowerCase() === requirementBrand;
  const colorMatches =
    !requirementColor || filament.colorName.trim().toLowerCase() === requirementColor;
  const hexMatches =
    !requirement.hexColor.trim() ||
    normalizeHexColor(filament.hexColor) === normalizeHexColor(requirement.hexColor);

  return brandMatches && colorMatches && hexMatches;
}

function sortFilamentsForProduction(filaments: readonly FilamentRecord[]): readonly FilamentRecord[] {
  return [...filaments].sort((left, right) => {
    const statusDelta = getProductionStatusRank(left) - getProductionStatusRank(right);

    if (statusDelta !== 0) {
      return statusDelta;
    }

    return right.estimatedGramsLeft - left.estimatedGramsLeft;
  });
}

function getProductionStatusRank(filament: FilamentRecord): number {
  if (filament.spoolStatus === "open") {
    return 0;
  }

  if (filament.spoolStatus === "sealed") {
    return 1;
  }

  if (filament.spoolStatus === "empty") {
    return 2;
  }

  return 3;
}

function formatProductFilamentRequirement(requirement: ProductHueForgeFilament): string {
  const grams = requirement.requiredGrams > 0 ? `${formatGramsLeft(requirement.requiredGrams)} ` : "";
  const brand = requirement.brand.trim();
  const color = requirement.colorName.trim();
  const material = requirement.materialType === "Other" ? "" : requirement.materialType;
  const name = [brand, color, material].filter(Boolean).join(" ");

  return `${grams}${name || "Basic filament"}`;
}

function getScaledRequirementGrams(
  requirement: ProductHueForgeFilament,
  attemptedPieces: number,
): number {
  return Math.max(0, requirement.requiredGrams) * Math.max(0, attemptedPieces || 1);
}

function setFormValue<K extends keyof RunFormState>(
  key: K,
  value: RunFormState[K],
  setForm: Dispatch<SetStateAction<RunFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function toProductionRunInput(
  form: RunFormState,
  requirements: readonly ProductHueForgeFilament[],
): ProductionRunInput {
  const filamentSelections = requirements.map((requirement, index) => ({
    filamentId: Number(form.filamentSelections[String(index)] ?? "0"),
    requiredGrams: Math.max(0, requirement.requiredGrams),
    requirementLabel: formatProductFilamentRequirement(requirement),
  }));
  const primaryFilamentId =
    filamentSelections.find((selection) => selection.filamentId > 0)?.filamentId ??
    Number(form.filamentId);

  return {
    addOns: form.addOns.map((addOn) => ({
      addOnId: Number(addOn.addOnId),
      quantity: toNumber(addOn.quantity),
    })),
    expectedPieces: toInteger(form.expectedPieces),
    failedPieces: toInteger(form.failedPieces),
    failureReason: form.failureReason,
    filamentId: primaryFilamentId,
    filamentSelections,
    goodPieces: toInteger(form.goodPieces),
    notes: form.notes,
    printProfileId: Number(form.printProfileId),
    productId: Number(form.productId),
    runDate: form.runDate,
  };
}

function toProductionAddOnCorrectionInput(
  productionRunId: number,
  form: AddOnCorrectionFormState,
): ProductionAddOnCorrectionInput {
  return {
    addOns: form.addOns.map((addOn) => ({
      addOnId: Number(addOn.addOnId),
      quantity: toNumber(addOn.quantity),
    })),
    productionRunId,
    reason: form.reason,
  };
}

export function calculateProductionAddOnCorrectionPreview(
  run: Pick<ProductionRunRecord, "addOnDeductions">,
  rows: readonly Pick<RunAddOnFormState, "addOnId" | "quantity">[],
  addOns: readonly Pick<AddOnRecord, "id" | "quantityOnHand">[],
): ProductionAddOnCorrectionPreviewItem[] {
  const current = new Map(
    run.addOnDeductions.map((deduction) => [deduction.addOnId, deduction.quantityDeducted] as const),
  );
  const desired = new Map<number, number>();
  rows.forEach((row) => {
    const addOnId = Number(row.addOnId);
    const quantity = roundCorrectionQuantity(toNumber(row.quantity));
    if (Number.isInteger(addOnId) && addOnId > 0 && quantity > 0) {
      desired.set(addOnId, quantity);
    }
  });
  const affectedIds = [...new Set([...current.keys(), ...desired.keys()])].sort(
    (left, right) => left - right,
  );

  return affectedIds.flatMap((addOnId) => {
    const runQuantityBefore = current.get(addOnId) ?? 0;
    const runQuantityAfter = desired.get(addOnId) ?? 0;
    const quantityDelta = roundCorrectionQuantity(runQuantityAfter - runQuantityBefore);
    if (Math.abs(quantityDelta) < 0.000001) return [];
    const stockQuantity = addOns.find((addOn) => addOn.id === addOnId)?.quantityOnHand ?? 0;

    return [{
      addOnId,
      quantityDelta,
      runQuantityAfter,
      runQuantityBefore,
      stockQuantityAfter: roundCorrectionQuantity(stockQuantity - quantityDelta),
    }];
  });
}

function getProductionAddOnCorrectionPreviewError(
  run: ProductionRunRecord,
  rows: readonly RunAddOnFormState[],
  addOns: readonly AddOnRecord[],
  preview: readonly ProductionAddOnCorrectionPreviewItem[],
): string | null {
  if (preview.length === 0) {
    return "Change at least one add-on quantity before saving a correction.";
  }

  for (const item of preview) {
    const addOn = addOns.find((candidate) => candidate.id === item.addOnId);
    if (!addOn) return `Add-on ${item.addOnId} does not exist.`;
    if (item.quantityDelta > 0 && !addOn.isActive) {
      return `${addOn.itemName} is inactive and cannot be added or increased.`;
    }
    if (item.stockQuantityAfter < 0) {
      return `${addOn.itemName} does not have enough stock for this correction.`;
    }
  }

  const originalInactiveIds = new Set(
    run.addOnDeductions
      .filter((deduction) => !addOns.find((addOn) => addOn.id === deduction.addOnId)?.isActive)
      .map((deduction) => deduction.addOnId),
  );
  const selectedIds = new Set(rows.map((row) => Number(row.addOnId)));
  if ([...selectedIds].some((id) => id > 0 && !originalInactiveIds.has(id) && !addOns.find((addOn) => addOn.id === id)?.isActive)) {
    return "Inactive add-ons cannot be newly selected.";
  }

  return null;
}

function roundCorrectionQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatCorrectionTimestamp(value: string): string {
  return value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

let nextRunAddOnRowId = 1;

function createRunAddOnRow(): RunAddOnFormState {
  return {
    addOnId: "",
    key: `run-${nextRunAddOnRowId++}`,
    quantity: "1",
  };
}

function toInteger(value: string): number {
  return Math.trunc(Number(value.trim() || "0"));
}

function toNumber(value: string): number {
  return Number(value.trim() || "0");
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatRepositoryError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("invoke")) {
      return "Native SQLite storage is available when the app is opened through Tauri. Browser preview can render the screen but cannot access the local database.";
    }

    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Production storage is unavailable. Refresh the page and check the local SQLite setup if it continues.";
}
