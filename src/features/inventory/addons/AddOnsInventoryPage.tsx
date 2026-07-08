import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

import { Toast, type ToastMessage, type ToastTone } from "@/components/feedback/Toast";
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
import { addOnsRepository } from "@/data/repositories";
import {
  ADD_ON_CATEGORIES,
  ADD_ON_UNITS,
  formatQuantity,
  getAddOnStockSignal,
  validateAddOnInput,
  type AddOnCategory,
  type AddOnInput,
  type AddOnRecord,
  type AddOnStockSignal,
  type AddOnUnit,
} from "@/domain/inventory";

type FilterValue = "all" | "low" | "active" | "inactive";

interface AddOnFormState {
  readonly category: AddOnCategory;
  readonly isActive: "active" | "inactive";
  readonly itemName: string;
  readonly lowStockThreshold: string;
  readonly notes: string;
  readonly quantityOnHand: string;
  readonly supplier: string;
  readonly unit: AddOnUnit;
  readonly unitCost: string;
}

const emptyForm: AddOnFormState = {
  category: "Hardware",
  isActive: "active",
  itemName: "",
  lowStockThreshold: "25",
  notes: "",
  quantityOnHand: "0",
  supplier: "",
  unit: "pcs",
  unitCost: "0",
};

const categoryTone: Partial<Record<AddOnCategory, "accent" | "success" | "warning">> = {
  Embellishment: "accent",
  Hardware: "success",
  Packaging: "warning",
};

const stockTone: Record<AddOnStockSignal, "neutral" | "success" | "warning" | "danger"> = {
  inactive: "neutral",
  low: "warning",
  ok: "success",
  out: "danger",
};

export function AddOnsInventoryPage() {
  const [addOns, setAddOns] = useState<AddOnRecord[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [form, setForm] = useState<AddOnFormState>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback((tone: ToastTone, title: string, message: string) => {
    setToast({
      id: Date.now(),
      message,
      title,
      tone,
    });
  }, []);

  async function loadAddOns(showFeedback = false): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const loaded = await addOnsRepository.list();
      setAddOns(loaded);
      setSelectedId((current) => current ?? loaded[0]?.id ?? null);
      if (showFeedback) {
        showToast("success", "Items Refreshed", "Local add-on records were reloaded.");
      }
    } catch (loadError) {
      const message = formatRepositoryError(loadError);
      setError(message);
      if (showFeedback) {
        showToast("danger", "Refresh Failed", message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAddOns();
  }, []);

  const selectedAddOn = addOns.find((item) => item.id === selectedId) ?? addOns[0] ?? null;

  const filteredAddOns = useMemo(() => {
    const query = search.trim().toLowerCase();

    return addOns.filter((item) => {
      const signal = getAddOnStockSignal(item);
      const matchesFilter =
        filter === "all" ||
        (filter === "low"
          ? signal === "low" || signal === "out"
          : filter === "active"
            ? item.isActive
            : !item.isActive);
      const matchesQuery =
        !query ||
        [item.itemName, item.category, item.unit, item.supplier]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesFilter && matchesQuery;
    });
  }, [addOns, filter, search]);

  const activeCount = addOns.filter((item) => item.isActive).length;
  const lowCount = addOns.filter((item) => {
    const signal = getAddOnStockSignal(item);

    return signal === "low" || signal === "out";
  }).length;
  const inactiveCount = addOns.length - activeCount;
  const inventoryValue = addOns.reduce(
    (total, item) => total + item.quantityOnHand * item.unitCost,
    0,
  );

  function startCreate(): void {
    setEditingId(null);
    setForm(emptyForm);
    setValidationMessage(null);
    setIsFormOpen(true);
  }

  function startEdit(item: AddOnRecord): void {
    setEditingId(item.id);
    setSelectedId(item.id);
    setForm(toFormState(item));
    setValidationMessage(null);
    setIsFormOpen(true);
  }

  function closeForm(): void {
    if (isSaving) {
      return;
    }

    setIsFormOpen(false);
    setValidationMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    const input = toAddOnInput(form);
    const validation = validateAddOnInput(input);

    if (!validation.valid) {
      const message = Object.values(validation.errors)[0] ?? "Check the add-on fields.";
      setValidationMessage(message);
      showToast("warning", "Check Item", message);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const saved =
        editingId == null
          ? await addOnsRepository.create(input)
          : await addOnsRepository.update(editingId, input);
      const loaded = await addOnsRepository.list();

      setAddOns(loaded);
      setSelectedId(saved.id);
      setEditingId(saved.id);
      setForm(toFormState(saved));
      setIsFormOpen(false);
      showToast(
        "success",
        editingId == null ? "Item Saved" : "Item Updated",
        `${saved.itemName} was saved locally.`,
      );
    } catch (saveError) {
      const message = formatRepositoryError(saveError);
      setError(message);
      showToast("danger", "Save Failed", message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton
            isLoading={isLoading}
            loadingLabel="Refreshing"
            onClick={() => void loadAddOns(true)}
          >
            Refresh
          </ToolbarButton>
          <ToolbarButton onClick={startCreate} tone="primary">
            Add Item
          </ToolbarButton>
        </>
      }
      description="Track hardware, packaging, embellishments, and shop consumables with manual stock levels and low-stock thresholds."
      eyebrow=""
      meta={[]}
      title="Add-ons & Hardware"
    >
      <Toast onDismiss={clearToast} toast={toast} />

      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="screen-toolbar">
        <SearchField
          label="Item search"
          onChange={setSearch}
          placeholder="Search hardware, supplier, category..."
          value={search}
        />
        <SegmentedFilter
          label="Item status"
          onChange={(value) => setFilter(value as FilterValue)}
          options={[
            { active: filter === "all", label: "All", value: "all" },
            { active: filter === "active", label: "Active", value: "active" },
            { active: filter === "low", label: "Low", value: "low" },
            { active: filter === "inactive", label: "Inactive", value: "inactive" },
          ]}
        />
      </div>

      <div className="metric-grid">
        <MetricPanel detail="local records" label="Items" value={String(addOns.length)} />
        <MetricPanel detail="at or below threshold" label="Low Stock" tone="warning" value={String(lowCount)} />
        <MetricPanel detail="available for use" label="Active" tone="success" value={String(activeCount)} />
        <MetricPanel detail={`${inactiveCount} inactive`} label="Inventory Value" value={`₱${inventoryValue.toFixed(2)}`} />
      </div>

      <div className="content-grid content-grid--split">
        <Panel title="Hardware Stock">
          <DataTable
            columns={["Item", "Category", "Unit", "Qty", "Cost", "Supplier", "Status"]}
            columnsTemplate="minmax(128px, 1.25fr) 0.7fr 0.42fr minmax(112px, 0.85fr) 0.52fr minmax(104px, 0.85fr) 0.58fr"
            density="dense"
            footer={
              isLoading
                ? "Loading local SQLite records..."
                : `${filteredAddOns.length} visible of ${addOns.length} add-on records.`
            }
            rows={filteredAddOns.map((item) => {
              const signal = getAddOnStockSignal(item);
              const categoryBadgeTone = categoryTone[item.category];
              const progressTone =
                signal === "out" ? "danger" : signal === "low" ? "warning" : "success";

              return [
                <button
                  className="table-link"
                  onClick={() => {
                    setSelectedId(item.id);
                    startEdit(item);
                  }}
                  type="button"
                >
                  {item.itemName}
                </button>,
                <Badge {...(categoryBadgeTone ? { tone: categoryBadgeTone } : {})}>
                  {item.category}
                </Badge>,
                item.unit,
                <ProgressBar
                  label={formatQuantity(item.quantityOnHand, item.unit)}
                  tone={progressTone}
                  value={getStockPercent(item)}
                />,
                `₱${item.unitCost.toFixed(2)}`,
                item.supplier || "--",
                <Badge tone={stockTone[signal]}>{signal}</Badge>,
              ];
            })}
          />
        </Panel>

        <div className="side-stack">
          <Panel title="Selected Item">
            {selectedAddOn ? (
              <AddOnDetail item={selectedAddOn} onEdit={() => startEdit(selectedAddOn)} />
            ) : (
              <div className="empty-state">
                <Badge>Empty</Badge>
                <p>Add hardware, packaging, or consumables to start tracking shop stock.</p>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="addon-form-title"
            aria-modal="true"
            className="modal"
            role="dialog"
          >
            <header className="modal__header">
              <h2 id="addon-form-title">{editingId == null ? "Add Item" : "Edit Item"}</h2>
              <button
                aria-label="Close item form"
                disabled={isSaving}
                onClick={closeForm}
                type="button"
              >
                x
              </button>
            </header>
            <form className="inventory-form modal__body" onSubmit={(event) => void handleSubmit(event)}>
              <AddOnFormFields form={form} setForm={setForm} />
              {validationMessage ? (
                <div className="form-message" role="alert">
                  {validationMessage}
                </div>
              ) : null}
              <div className="form-actions">
                <ToolbarButton disabled={isSaving} onClick={startCreate}>
                  Clear
                </ToolbarButton>
                <ToolbarButton disabled={isSaving} onClick={closeForm}>
                  Cancel
                </ToolbarButton>
                <ToolbarButton
                  isLoading={isSaving}
                  loadingLabel={editingId == null ? "Saving" : "Updating"}
                  tone="primary"
                  type="submit"
                >
                  {editingId == null ? "Save Item" : "Update Item"}
                </ToolbarButton>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </Page>
  );
}

function AddOnDetail({
  item,
  onEdit,
}: {
  readonly item: AddOnRecord;
  readonly onEdit: () => void;
}) {
  const signal = getAddOnStockSignal(item);
  const categoryBadgeTone = categoryTone[item.category];

  return (
    <div className="detail-stack">
      <div className="spool-card-head">
        <span className="spool-card-head__image">HW</span>
        <div>
          <div className="spool-card-head__badges">
            <Badge {...(categoryBadgeTone ? { tone: categoryBadgeTone } : {})}>
              {item.category}
            </Badge>
            <Badge tone={stockTone[signal]}>{signal}</Badge>
          </div>
          <strong>{item.itemName}</strong>
          <span>ID: ADD-{String(item.id).padStart(4, "0")}</span>
        </div>
      </div>
      <div className="detail-stack__metric">
        <span>Quantity On Hand</span>
        <strong>{formatQuantity(item.quantityOnHand, item.unit)}</strong>
      </div>
      <div className="key-value-list">
        <span>Unit</span>
        <strong>{item.unit}</strong>
        <span>Low Threshold</span>
        <strong>{formatQuantity(item.lowStockThreshold, item.unit)}</strong>
        <span>Unit Cost</span>
        <strong>₱{item.unitCost.toFixed(2)}</strong>
        <span>Supplier</span>
        <strong>{item.supplier || "--"}</strong>
        <span>State</span>
        <strong>{item.isActive ? "active" : "inactive"}</strong>
      </div>
      <div className="callout">
        <Badge>Notes</Badge>
        <p>{item.notes || "No supplier notes saved."}</p>
      </div>
      <ToolbarButton onClick={onEdit} tone="primary">
        Edit Selected
      </ToolbarButton>
    </div>
  );
}

function AddOnFormFields({
  form,
  setForm,
}: {
  readonly form: AddOnFormState;
  readonly setForm: Dispatch<SetStateAction<AddOnFormState>>;
}) {
  return (
    <>
      <FormField label="Item Name">
        <input
          onChange={(event) => setFormValue("itemName", event.target.value, setForm)}
          value={form.itemName}
        />
      </FormField>
      <FormField label="Category">
        <select
          onChange={(event) =>
            setFormValue("category", event.target.value as AddOnCategory, setForm)
          }
          value={form.category}
        >
          {ADD_ON_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Unit">
        <select
          onChange={(event) => setFormValue("unit", event.target.value as AddOnUnit, setForm)}
          value={form.unit}
        >
          {ADD_ON_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="State">
        <select
          onChange={(event) =>
            setFormValue("isActive", event.target.value as AddOnFormState["isActive"], setForm)
          }
          value={form.isActive}
        >
          <option value="active">active</option>
          <option value="inactive">inactive</option>
        </select>
      </FormField>
      <FormField label="Quantity">
        <input
          inputMode="decimal"
          onChange={(event) => setFormValue("quantityOnHand", event.target.value, setForm)}
          value={form.quantityOnHand}
        />
      </FormField>
      <FormField label="Low Threshold">
        <input
          inputMode="decimal"
          onChange={(event) => setFormValue("lowStockThreshold", event.target.value, setForm)}
          value={form.lowStockThreshold}
        />
      </FormField>
      <FormField label="Unit Cost">
        <input
          inputMode="decimal"
          onChange={(event) => setFormValue("unitCost", event.target.value, setForm)}
          value={form.unitCost}
        />
      </FormField>
      <FormField label="Supplier">
        <input
          onChange={(event) => setFormValue("supplier", event.target.value, setForm)}
          value={form.supplier}
        />
      </FormField>
      <FormField label="Notes" wide>
        <textarea
          onChange={(event) => setFormValue("notes", event.target.value, setForm)}
          value={form.notes}
        />
      </FormField>
    </>
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

function setFormValue<K extends keyof AddOnFormState>(
  key: K,
  value: AddOnFormState[K],
  setForm: Dispatch<SetStateAction<AddOnFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function toAddOnInput(form: AddOnFormState): AddOnInput {
  return {
    category: form.category,
    isActive: form.isActive === "active",
    itemName: form.itemName,
    lowStockThreshold: Number(form.lowStockThreshold),
    notes: form.notes,
    quantityOnHand: Number(form.quantityOnHand),
    supplier: form.supplier,
    unit: form.unit,
    unitCost: Number(form.unitCost),
  };
}

function toFormState(item: AddOnRecord): AddOnFormState {
  return {
    category: item.category,
    isActive: item.isActive ? "active" : "inactive",
    itemName: item.itemName,
    lowStockThreshold: String(item.lowStockThreshold),
    notes: item.notes,
    quantityOnHand: String(item.quantityOnHand),
    supplier: item.supplier,
    unit: item.unit,
    unitCost: String(item.unitCost),
  };
}

function getStockPercent(item: AddOnRecord): number {
  if (item.lowStockThreshold <= 0) {
    return item.quantityOnHand > 0 ? 100 : 0;
  }

  return Math.round((item.quantityOnHand / (item.lowStockThreshold * 4)) * 100);
}

function formatRepositoryError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("invoke")) {
      return "Native SQLite storage is available when the app is opened through Tauri. Browser preview can render the screen but cannot access the local database.";
    }

    return error.message;
  }

  return "Add-ons storage is unavailable. Open the app through Tauri to use local SQLite.";
}
