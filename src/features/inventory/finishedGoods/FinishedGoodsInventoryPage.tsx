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
  SearchField,
  SegmentedFilter,
  ToolbarButton,
} from "@/components/ui";
import { finishedGoodsRepository } from "@/data/repositories";
import {
  FINISHED_GOOD_SALE_UNITS,
  formatFinishedGoodsQuantity,
  formatFinishedGoodsQuantityDelta,
  getAvailableFinishedGoodsQuantity,
  getFinishedGoodQuantityStatus,
  validateFinishedGoodInput,
  validateFinishedGoodStockAdjustmentInput,
  type FinishedGoodInput,
  type FinishedGoodQuantityStatus,
  type FinishedGoodRecord,
  type FinishedGoodSaleUnit,
  type FinishedGoodStockAdjustmentInput,
  type FinishedGoodStockAdjustmentRecord,
} from "@/domain/inventory";

type FilterValue = "all" | FinishedGoodQuantityStatus;

interface FinishedGoodFormState {
  readonly notes: string;
  readonly productReference: string;
  readonly quantityReady: string;
  readonly quantityReserved: string;
  readonly saleUnit: FinishedGoodSaleUnit;
}

interface AdjustmentFormState {
  readonly notes: string;
  readonly quantityDelta: string;
  readonly reason: string;
}

const emptyForm: FinishedGoodFormState = {
  notes: "",
  productReference: "",
  quantityReady: "0",
  quantityReserved: "0",
  saleUnit: "piece",
};

const emptyAdjustmentForm: AdjustmentFormState = {
  notes: "",
  quantityDelta: "1",
  reason: "manual count",
};

const quantityTone: Record<FinishedGoodQuantityStatus, "neutral" | "success" | "warning" | "danger"> =
  {
    low: "warning",
    out: "danger",
    ready: "success",
    reserved: "neutral",
  };

export function FinishedGoodsInventoryPage() {
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormState>(emptyAdjustmentForm);
  const [adjustments, setAdjustments] = useState<FinishedGoodStockAdjustmentRecord[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [finishedGoods, setFinishedGoods] = useState<FinishedGoodRecord[]>([]);
  const [form, setForm] = useState<FinishedGoodFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function loadFinishedGoods(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const loaded = await finishedGoodsRepository.list();
      setFinishedGoods(loaded);
      setSelectedId((current) => current ?? loaded[0]?.id ?? null);
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAdjustments(finishedGoodId: number | null): Promise<void> {
    if (finishedGoodId == null) {
      setAdjustments([]);
      return;
    }

    try {
      const loaded = await finishedGoodsRepository.listAdjustments(finishedGoodId);
      setAdjustments(loaded);
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
    }
  }

  useEffect(() => {
    void loadFinishedGoods();
  }, []);

  useEffect(() => {
    void loadAdjustments(selectedId);
  }, [selectedId]);

  const selectedFinishedGood =
    finishedGoods.find((item) => item.id === selectedId) ?? finishedGoods[0] ?? null;

  const filteredFinishedGoods = useMemo(() => {
    const query = search.trim().toLowerCase();

    return finishedGoods.filter((item) => {
      const status = getFinishedGoodQuantityStatus(item);
      const matchesFilter = filter === "all" || status === filter;
      const matchesQuery =
        !query ||
        [item.productReference, item.saleUnit, item.notes].join(" ").toLowerCase().includes(query);

      return matchesFilter && matchesQuery;
    });
  }, [filter, finishedGoods, search]);

  const totalReady = finishedGoods.reduce((total, item) => total + item.quantityReady, 0);
  const totalReserved = finishedGoods.reduce((total, item) => total + item.quantityReserved, 0);
  const totalAvailable = finishedGoods.reduce(
    (total, item) => total + getAvailableFinishedGoodsQuantity(item),
    0,
  );
  const lowCount = finishedGoods.filter((item) => {
    const status = getFinishedGoodQuantityStatus(item);

    return status === "low" || status === "out";
  }).length;

  function startCreate(): void {
    setEditingId(null);
    setForm(emptyForm);
    setValidationMessage(null);
  }

  function startEdit(item: FinishedGoodRecord): void {
    setEditingId(item.id);
    setSelectedId(item.id);
    setForm(toFormState(item));
    setValidationMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    const input = toFinishedGoodInput(form);
    const validation = validateFinishedGoodInput(input);

    if (!validation.valid) {
      setValidationMessage(Object.values(validation.errors)[0] ?? "Check the finished-good fields.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const saved =
        editingId == null
          ? await finishedGoodsRepository.create(input)
          : await finishedGoodsRepository.update(editingId, input);
      const loaded = await finishedGoodsRepository.list();

      setFinishedGoods(loaded);
      setSelectedId(saved.id);
      setEditingId(saved.id);
      setForm(toFormState(saved));
      await loadAdjustments(saved.id);
    } catch (saveError) {
      setError(formatRepositoryError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdjustmentSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedFinishedGood) {
      setValidationMessage("Select a finished good before adjusting stock.");
      return;
    }

    const input = toAdjustmentInput(adjustmentForm);
    const validation = validateFinishedGoodStockAdjustmentInput(input);

    if (!validation.valid) {
      setValidationMessage(
        Object.values(validation.errors)[0] ?? "Check the stock adjustment fields.",
      );
      return;
    }

    setIsAdjusting(true);
    setValidationMessage(null);
    setError(null);

    try {
      const adjusted = await finishedGoodsRepository.adjustStock(selectedFinishedGood.id, input);
      const loaded = await finishedGoodsRepository.list();

      setFinishedGoods(loaded);
      setSelectedId(adjusted.id);
      setForm((current) =>
        editingId === adjusted.id ? toFormState(adjusted) : current,
      );
      setAdjustmentForm(emptyAdjustmentForm);
      await loadAdjustments(adjusted.id);
    } catch (adjustError) {
      setError(formatRepositoryError(adjustError));
    } finally {
      setIsAdjusting(false);
    }
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton onClick={() => void loadFinishedGoods()}>Refresh</ToolbarButton>
          <ToolbarButton onClick={startCreate} tone="primary">
            Add Stock
          </ToolbarButton>
        </>
      }
      description="Track ready-to-sell home stock with manual adjustments and sale-unit context. Cafe stock, sales, and production automation are deferred."
      meta={["Home stock only", "Manual adjustments", "No sales automation"]}
      title="Finished Goods Inventory"
    >
      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="screen-toolbar">
        <SearchField
          label="Stock search"
          onChange={setSearch}
          placeholder="Search product/design reference..."
          value={search}
        />
        <SegmentedFilter
          label="Quantity status"
          onChange={(value) => setFilter(value as FilterValue)}
          options={[
            { active: filter === "all", label: "All", value: "all" },
            { active: filter === "ready", label: "Ready", value: "ready" },
            { active: filter === "low", label: "Low", value: "low" },
            { active: filter === "reserved", label: "Reserved", value: "reserved" },
            { active: filter === "out", label: "Out", value: "out" },
          ]}
        />
      </div>

      <div className="metric-grid">
        <MetricPanel detail="home stock rows" label="Products" value={String(finishedGoods.length)} />
        <MetricPanel detail="ready quantity" label="Ready Units" tone="success" value={String(totalReady)} />
        <MetricPanel detail="ready minus reserved" label="Available" value={String(totalAvailable)} />
        <MetricPanel detail={`${totalReserved} reserved`} label="Low / Out" tone="warning" value={String(lowCount)} />
      </div>

      <div className="content-grid content-grid--split">
        <Panel title="Home Stock">
          <DataTable
            columns={["Product / Design", "Unit", "Ready", "Reserved", "Available", "Status"]}
            columnsTemplate="minmax(160px, 1.45fr) 0.55fr 0.6fr 0.62fr minmax(120px, 0.95fr) 0.62fr"
            density="dense"
            footer={
              isLoading
                ? "Loading local SQLite records..."
                : `${filteredFinishedGoods.length} visible of ${finishedGoods.length} finished-good records.`
            }
            rows={filteredFinishedGoods.map((item) => {
              const available = getAvailableFinishedGoodsQuantity(item);
              const status = getFinishedGoodQuantityStatus(item);
              const progressTone =
                status === "out" ? "danger" : status === "low" ? "warning" : "success";

              return [
                <button
                  className="table-link"
                  onClick={() => {
                    setSelectedId(item.id);
                    startEdit(item);
                  }}
                  type="button"
                >
                  {item.productReference}
                </button>,
                <Badge>{item.saleUnit}</Badge>,
                formatFinishedGoodsQuantity(item.quantityReady, item.saleUnit),
                formatFinishedGoodsQuantity(item.quantityReserved, item.saleUnit),
                <ProgressBar
                  label={formatFinishedGoodsQuantity(available, item.saleUnit)}
                  tone={progressTone}
                  value={getAvailablePercent(item)}
                />,
                <Badge tone={quantityTone[status]}>{status}</Badge>,
              ];
            })}
          />
        </Panel>

        <div className="side-stack">
          <Panel title="Selected Home Stock">
            {selectedFinishedGood ? (
              <FinishedGoodDetail
                adjustments={adjustments}
                item={selectedFinishedGood}
                onEdit={() => startEdit(selectedFinishedGood)}
              />
            ) : (
              <div className="empty-state">
                <Badge>Empty</Badge>
                <p>Add ready-to-sell home stock to start tracking finished goods.</p>
              </div>
            )}
          </Panel>

          <Panel title="Manual Adjustment">
            <form className="inventory-form" onSubmit={(event) => void handleAdjustmentSubmit(event)}>
              <FormField label="Delta">
                <input
                  inputMode="numeric"
                  onChange={(event) =>
                    setAdjustmentValue("quantityDelta", event.target.value, setAdjustmentForm)
                  }
                  value={adjustmentForm.quantityDelta}
                />
              </FormField>
              <FormField label="Reason">
                <input
                  onChange={(event) =>
                    setAdjustmentValue("reason", event.target.value, setAdjustmentForm)
                  }
                  value={adjustmentForm.reason}
                />
              </FormField>
              <FormField label="Notes" wide>
                <textarea
                  onChange={(event) =>
                    setAdjustmentValue("notes", event.target.value, setAdjustmentForm)
                  }
                  value={adjustmentForm.notes}
                />
              </FormField>
              <div className="form-actions">
                <ToolbarButton
                  disabled={!selectedFinishedGood || isAdjusting}
                  tone="primary"
                  type="submit"
                >
                  Apply Adjustment
                </ToolbarButton>
              </div>
            </form>
          </Panel>

          <Panel title={editingId == null ? "Add Finished Good" : "Edit Finished Good"}>
            <form className="inventory-form" onSubmit={(event) => void handleSubmit(event)}>
              <FormField label="Product / Design" wide>
                <input
                  onChange={(event) =>
                    setFormValue("productReference", event.target.value, setForm)
                  }
                  value={form.productReference}
                />
              </FormField>
              <FormField label="Sale Unit">
                <select
                  onChange={(event) =>
                    setFormValue("saleUnit", event.target.value as FinishedGoodSaleUnit, setForm)
                  }
                  value={form.saleUnit}
                >
                  {FINISHED_GOOD_SALE_UNITS.map((saleUnit) => (
                    <option key={saleUnit} value={saleUnit}>
                      {saleUnit}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Ready Qty">
                <input
                  inputMode="numeric"
                  onChange={(event) => setFormValue("quantityReady", event.target.value, setForm)}
                  value={form.quantityReady}
                />
              </FormField>
              <FormField label="Reserved Qty">
                <input
                  inputMode="numeric"
                  onChange={(event) =>
                    setFormValue("quantityReserved", event.target.value, setForm)
                  }
                  value={form.quantityReserved}
                />
              </FormField>
              <FormField label="Notes" wide>
                <textarea
                  onChange={(event) => setFormValue("notes", event.target.value, setForm)}
                  value={form.notes}
                />
              </FormField>
              {validationMessage ? (
                <div className="form-message" role="alert">
                  {validationMessage}
                </div>
              ) : null}
              <div className="form-actions">
                <ToolbarButton onClick={startCreate}>Clear</ToolbarButton>
                <ToolbarButton disabled={isSaving} tone="primary" type="submit">
                  {editingId == null ? "Save Stock" : "Update Stock"}
                </ToolbarButton>
              </div>
            </form>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

function FinishedGoodDetail({
  adjustments,
  item,
  onEdit,
}: {
  readonly adjustments: readonly FinishedGoodStockAdjustmentRecord[];
  readonly item: FinishedGoodRecord;
  readonly onEdit: () => void;
}) {
  const available = getAvailableFinishedGoodsQuantity(item);
  const status = getFinishedGoodQuantityStatus(item);

  return (
    <div className="detail-stack">
      <div className="spool-card-head">
        <span className="spool-card-head__image">FG</span>
        <div>
          <div className="spool-card-head__badges">
            <Badge>{item.saleUnit}</Badge>
            <Badge tone={quantityTone[status]}>{status}</Badge>
          </div>
          <strong>{item.productReference}</strong>
          <span>ID: FGI-{String(item.id).padStart(4, "0")}</span>
        </div>
      </div>
      <div className="detail-stack__metric">
        <span>Available Home Stock</span>
        <strong>{formatFinishedGoodsQuantity(available, item.saleUnit)}</strong>
      </div>
      <div className="key-value-list">
        <span>Ready</span>
        <strong>{formatFinishedGoodsQuantity(item.quantityReady, item.saleUnit)}</strong>
        <span>Reserved</span>
        <strong>{formatFinishedGoodsQuantity(item.quantityReserved, item.saleUnit)}</strong>
        <span>Sale Unit</span>
        <strong>{item.saleUnit}</strong>
        <span>Updated</span>
        <strong>{item.updatedAt}</strong>
      </div>
      <div className="callout">
        <Badge>Notes</Badge>
        <p>{item.notes || "No finished-good notes saved."}</p>
      </div>
      <AdjustmentList adjustments={adjustments} saleUnit={item.saleUnit} />
      <ToolbarButton onClick={onEdit} tone="primary">
        Edit Selected
      </ToolbarButton>
    </div>
  );
}

function AdjustmentList({
  adjustments,
  saleUnit,
}: {
  readonly adjustments: readonly FinishedGoodStockAdjustmentRecord[];
  readonly saleUnit: FinishedGoodSaleUnit;
}) {
  if (adjustments.length === 0) {
    return (
      <div className="empty-state">
        <Badge>Adjustments</Badge>
        <p>No manual stock adjustments recorded.</p>
      </div>
    );
  }

  return (
    <div className="stock-adjustment-list">
      <Badge>Adjustments</Badge>
      {adjustments.map((adjustment) => (
        <div className="stock-adjustment-list__item" key={adjustment.id}>
          <strong>
            {formatFinishedGoodsQuantityDelta(adjustment.quantityDelta, saleUnit)}
          </strong>
          <span>{adjustment.reason}</span>
          <small>After: {formatFinishedGoodsQuantity(adjustment.quantityAfter, saleUnit)}</small>
        </div>
      ))}
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

function setFormValue<K extends keyof FinishedGoodFormState>(
  key: K,
  value: FinishedGoodFormState[K],
  setForm: Dispatch<SetStateAction<FinishedGoodFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function setAdjustmentValue<K extends keyof AdjustmentFormState>(
  key: K,
  value: AdjustmentFormState[K],
  setForm: Dispatch<SetStateAction<AdjustmentFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function toFinishedGoodInput(form: FinishedGoodFormState): FinishedGoodInput {
  return {
    notes: form.notes,
    productReference: form.productReference,
    quantityReady: Number(form.quantityReady),
    quantityReserved: Number(form.quantityReserved),
    saleUnit: form.saleUnit,
  };
}

function toAdjustmentInput(form: AdjustmentFormState): FinishedGoodStockAdjustmentInput {
  return {
    notes: form.notes,
    quantityDelta: Number(form.quantityDelta),
    reason: form.reason,
  };
}

function toFormState(item: FinishedGoodRecord): FinishedGoodFormState {
  return {
    notes: item.notes,
    productReference: item.productReference,
    quantityReady: String(item.quantityReady),
    quantityReserved: String(item.quantityReserved),
    saleUnit: item.saleUnit,
  };
}

function getAvailablePercent(item: FinishedGoodRecord): number {
  if (item.quantityReady <= 0) {
    return 0;
  }

  return Math.round((getAvailableFinishedGoodsQuantity(item) / item.quantityReady) * 100);
}

function formatRepositoryError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("invoke")) {
      return "Native SQLite storage is available when the app is opened through Tauri. Browser preview can render the screen but cannot access the local database.";
    }

    return error.message;
  }

  return "Finished goods storage is unavailable. Open the app through Tauri to use local SQLite.";
}
