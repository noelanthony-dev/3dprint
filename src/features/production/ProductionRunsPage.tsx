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
import { Badge, DataTable, MetricPanel, Panel, ToolbarButton } from "@/components/ui";
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
  type AddOnRecord,
  type FilamentRecord,
} from "@/domain/inventory";
import type { ProductRecord } from "@/domain/products";
import {
  calculateProductionDeductionPlan,
  validateProductionRunInput,
  type ProductionDeductionPlan,
  type ProductionRunInput,
  type ProductionRunRecord,
} from "@/domain/production";

interface RunFormState {
  readonly addOnId: string;
  readonly addOnQuantity: string;
  readonly expectedPieces: string;
  readonly failedPieces: string;
  readonly failureReason: string;
  readonly filamentId: string;
  readonly goodPieces: string;
  readonly notes: string;
  readonly printProfileId: string;
  readonly productId: string;
  readonly runDate: string;
}

const emptyForm: RunFormState = {
  addOnId: "",
  addOnQuantity: "0",
  expectedPieces: "10",
  failedPieces: "0",
  failureReason: "",
  filamentId: "",
  goodPieces: "10",
  notes: "",
  printProfileId: "",
  productId: "",
  runDate: todayInputValue(),
};

const emptyPlan: ProductionDeductionPlan = {
  addOnQuantityToDeduct: 0,
  attemptedPieces: 0,
  expectedPieces: 0,
  failedPieces: 0,
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
  const [filaments, setFilaments] = useState<FilamentRecord[]>([]);
  const [form, setForm] = useState<RunFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
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
  const selectedAddOn = addOns.find((addOn) => String(addOn.id) === form.addOnId) ?? null;
  const input = useMemo(() => toProductionRunInput(form), [form]);
  const validation = validateProductionRunInput(input);
  const deductionPlan = selectedProfile
    ? calculateProductionDeductionPlan(selectedProfile, input)
    : emptyPlan;

  const totalGoodPieces = runs.reduce((sum, run) => sum + run.goodPieces, 0);
  const totalFailedPieces = runs.reduce((sum, run) => sum + run.failedPieces, 0);
  const totalFilamentDeducted = runs.reduce((sum, run) => sum + run.filamentGramsDeducted, 0);
  const yieldRate =
    totalGoodPieces + totalFailedPieces > 0
      ? totalGoodPieces / (totalGoodPieces + totalFailedPieces)
      : 0;

  function handleProductChange(productId: string): void {
    const nextProduct = products.find((product) => String(product.id) === productId);
    const nextProfile = nextProduct
      ? profiles.find((profile) => profile.productId === nextProduct.id)
      : null;

    setForm((current) => ({
      ...current,
      expectedPieces: nextProfile
        ? String(nextProfile.expectedGoodUnits + nextProfile.expectedFailedUnits)
        : current.expectedPieces,
      failedPieces: nextProfile ? String(nextProfile.expectedFailedUnits) : current.failedPieces,
      goodPieces: nextProfile ? String(nextProfile.expectedGoodUnits) : current.goodPieces,
      printProfileId: nextProfile ? String(nextProfile.id) : "",
      productId,
    }));
  }

  function handleProfileChange(printProfileId: string): void {
    const nextProfile = profiles.find((profile) => String(profile.id) === printProfileId);

    setForm((current) => ({
      ...current,
      expectedPieces: nextProfile
        ? String(nextProfile.expectedGoodUnits + nextProfile.expectedFailedUnits)
        : current.expectedPieces,
      failedPieces: nextProfile ? String(nextProfile.expectedFailedUnits) : current.failedPieces,
      goodPieces: nextProfile ? String(nextProfile.expectedGoodUnits) : current.goodPieces,
      printProfileId,
    }));
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
          <ToolbarButton disabled={isSaving || products.length === 0} form="production-run-form" tone="primary" type="submit">
            Log Run
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

      <div className="content-grid content-grid--costing">
        <div className="side-stack">
          <Panel title="Production History" actions={<Badge>{runs.length} runs</Badge>}>
            <DataTable
              columns={["Date", "Product", "Profile", "Yield", "Filament", "Add-on"]}
              columnsTemplate="0.72fr minmax(145px, 1.25fr) minmax(120px, 1fr) 0.5fr 0.55fr 0.72fr"
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
                run.addOnId
                  ? `${formatQuantity(run.addOnQuantityDeducted, "")} ${addOnNames.get(run.addOnId) ?? "add-on"}`
                  : "--",
              ])}
            />
          </Panel>
        </div>

        <div className="side-stack">
          <Panel title="Log Production Run" actions={selectedProfile ? <Badge>CFG-{selectedProfile.id}</Badge> : <Badge>Draft</Badge>}>
            <div className="callout callout--warning">
              <Badge tone="warning">Inventory Impact</Badge>
              <p>Saving a run deducts estimated filament and optional add-ons, then adds good pieces to home stock.</p>
            </div>
            <form className="inventory-form" id="production-run-form" onSubmit={(event) => void handleSubmit(event)}>
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
              <FormField label="Print Profile">
                <select onChange={(event) => handleProfileChange(event.target.value)} value={form.printProfileId}>
                  <option value="">Choose profile...</option>
                  {selectableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.profileName}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Run Date">
                <input onChange={(event) => setFormValue("runDate", event.target.value, setForm)} type="date" value={form.runDate} />
              </FormField>
              <FormField label="Filament Spool" wide>
                <select onChange={(event) => setFormValue("filamentId", event.target.value, setForm)} value={form.filamentId}>
                  <option value="">Choose filament...</option>
                  {filaments.map((filament) => (
                    <option key={filament.id} value={filament.id}>
                      {filamentNames.get(filament.id)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Expected Pieces">
                <input inputMode="numeric" onChange={(event) => setFormValue("expectedPieces", event.target.value, setForm)} value={form.expectedPieces} />
              </FormField>
              <FormField label="Good Pieces">
                <input inputMode="numeric" onChange={(event) => setFormValue("goodPieces", event.target.value, setForm)} value={form.goodPieces} />
              </FormField>
              <FormField label="Failed Pieces">
                <input inputMode="numeric" onChange={(event) => setFormValue("failedPieces", event.target.value, setForm)} value={form.failedPieces} />
              </FormField>
              <FormField label="Add-on Quantity">
                <input inputMode="decimal" onChange={(event) => setFormValue("addOnQuantity", event.target.value, setForm)} value={form.addOnQuantity} />
              </FormField>
              <FormField label="Add-on Item" wide>
                <select onChange={(event) => setFormValue("addOnId", event.target.value, setForm)} value={form.addOnId}>
                  <option value="">No add-on deduction</option>
                  {addOns.filter((addOn) => addOn.isActive).map((addOn) => (
                    <option key={addOn.id} value={addOn.id}>
                      {addOn.itemName} ({formatQuantity(addOn.quantityOnHand, addOn.unit)})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Failure Reason" wide>
                <input onChange={(event) => setFormValue("failureReason", event.target.value, setForm)} value={form.failureReason} />
              </FormField>
              <FormField label="Notes" wide>
                <textarea onChange={(event) => setFormValue("notes", event.target.value, setForm)} value={form.notes} />
              </FormField>
              <div className="form-actions">
                <ToolbarButton disabled={isSaving || products.length === 0 || profiles.length === 0 || filaments.length === 0} tone="primary" type="submit">
                  Save & Update Stock
                </ToolbarButton>
              </div>
            </form>
          </Panel>

          <Panel title="Deduction Preview">
            <div className="key-value-list">
              <span>Attempted Pieces</span>
              <strong>{deductionPlan.attemptedPieces}</strong>
              <span>Good to Stock</span>
              <strong>{deductionPlan.finishedGoodsQuantityToAdd}</strong>
              <span>Filament Deduction</span>
              <strong>{formatGramsLeft(deductionPlan.filamentGramsToDeduct)}</strong>
              <span>Failure Rate</span>
              <strong>{(deductionPlan.failureRate * 100).toFixed(1)}%</strong>
              <span>Selected Spool</span>
              <strong>{selectedFilament ? formatGramsLeft(selectedFilament.estimatedGramsLeft) : "--"}</strong>
              <span>Add-on Deduction</span>
              <strong>{selectedAddOn ? formatQuantity(deductionPlan.addOnQuantityToDeduct, selectedAddOn.unit) : "--"}</strong>
            </div>
            {deductionPlan.warnings.length > 0 ? (
              <div className="callout callout--warning">
                <Badge tone="warning">Warnings</Badge>
                <p>{deductionPlan.warnings.join(" ")}</p>
              </div>
            ) : null}
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

  return {
    ...current,
    expectedPieces: profile
      ? String(profile.expectedGoodUnits + profile.expectedFailedUnits)
      : current.expectedPieces,
    failedPieces: profile ? String(profile.expectedFailedUnits) : current.failedPieces,
    filamentId: filaments[0] ? String(filaments[0].id) : "",
    goodPieces: profile ? String(profile.expectedGoodUnits) : current.goodPieces,
    printProfileId: profile ? String(profile.id) : "",
    productId: product ? String(product.id) : "",
  };
}

function setFormValue<K extends keyof RunFormState>(
  key: K,
  value: RunFormState[K],
  setForm: Dispatch<SetStateAction<RunFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function toProductionRunInput(form: RunFormState): ProductionRunInput {
  return {
    addOnId: form.addOnId ? Number(form.addOnId) : null,
    addOnQuantity: toNumber(form.addOnQuantity),
    expectedPieces: toInteger(form.expectedPieces),
    failedPieces: toInteger(form.failedPieces),
    failureReason: form.failureReason,
    filamentId: Number(form.filamentId),
    goodPieces: toInteger(form.goodPieces),
    notes: form.notes,
    printProfileId: Number(form.printProfileId),
    productId: Number(form.productId),
    runDate: form.runDate,
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

  return "Production storage is unavailable. Open the app through Tauri to use local SQLite.";
}
