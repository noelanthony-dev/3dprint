import { useEffect, useMemo, useState } from "react";

import { Page } from "@/components/layout/Page";
import {
  Badge,
  DataTable,
  MetricPanel,
  Panel,
  ProgressBar,
  SearchField,
  SegmentedFilter,
  Swatch,
  ToolbarButton,
} from "@/components/ui";
import { filamentRepository } from "@/data/repositories";
import {
  FILAMENT_MATERIALS,
  SPOOL_STATUSES,
  formatGramsLeft,
  getStockSignal,
  normalizeHexColor,
  validateFilamentInput,
  type FilamentInput,
  type FilamentMaterial,
  type FilamentRecord,
  type SpoolStatus,
  type StockSignal,
} from "@/domain/inventory";

type FilterValue = "all" | "low" | SpoolStatus;

interface FilamentFormState {
  readonly brand: string;
  readonly colorName: string;
  readonly estimatedGramsLeft: string;
  readonly hexColor: string;
  readonly lowStockThresholdGrams: string;
  readonly materialType: FilamentMaterial;
  readonly name: string;
  readonly notes: string;
  readonly purchaseSource: string;
  readonly spoolCost: string;
  readonly spoolStatus: SpoolStatus;
  readonly startingGrams: string;
  readonly transmissionDistance: string;
}

const emptyForm: FilamentFormState = {
  brand: "",
  colorName: "",
  estimatedGramsLeft: "1000",
  hexColor: "#ffffff",
  lowStockThresholdGrams: "200",
  materialType: "PLA",
  name: "",
  notes: "",
  purchaseSource: "",
  spoolCost: "0",
  spoolStatus: "open",
  startingGrams: "1000",
  transmissionDistance: "",
};

const materialTone: Partial<Record<FilamentMaterial, "success" | "warning" | "accent">> = {
  ABS: "warning",
  ASA: "warning",
  PETG: "accent",
  PLA: "success",
  "PLA+": "success",
  TPU: "accent",
};

const stockTone: Record<StockSignal, "neutral" | "success" | "warning" | "danger"> = {
  archived: "neutral",
  empty: "danger",
  low: "warning",
  ready: "success",
  sealed: "neutral",
};

export function FilamentInventoryPage() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filaments, setFilaments] = useState<FilamentRecord[]>([]);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [form, setForm] = useState<FilamentFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function loadFilaments(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const loaded = await filamentRepository.list();
      setFilaments(loaded);
      setSelectedId((current) => current ?? loaded[0]?.id ?? null);
    } catch (loadError) {
      setError(formatRepositoryError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadFilaments();
  }, []);

  const selectedFilament =
    filaments.find((filament) => filament.id === selectedId) ?? filaments[0] ?? null;

  const filteredFilaments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return filaments.filter((filament) => {
      const signal = getStockSignal(filament);
      const matchesFilter =
        filter === "all" ||
        (filter === "low" ? signal === "low" : filament.spoolStatus === filter);
      const matchesQuery =
        !query ||
        [filament.brand, filament.name, filament.colorName, filament.materialType]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesFilter && matchesQuery;
    });
  }, [filaments, filter, search]);

  const lowCount = filaments.filter((filament) => getStockSignal(filament) === "low").length;
  const openCount = filaments.filter((filament) => filament.spoolStatus === "open").length;
  const sealedCount = filaments.filter((filament) => filament.spoolStatus === "sealed").length;

  function startCreate(): void {
    setEditingId(null);
    setForm(emptyForm);
    setValidationMessage(null);
  }

  function startEdit(filament: FilamentRecord): void {
    setEditingId(filament.id);
    setSelectedId(filament.id);
    setForm(toFormState(filament));
    setValidationMessage(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setValidationMessage(null);

    const input = toFilamentInput(form);
    const validation = validateFilamentInput(input);

    if (!validation.valid) {
      setValidationMessage(Object.values(validation.errors)[0] ?? "Check the filament fields.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const saved =
        editingId == null
          ? await filamentRepository.create(input)
          : await filamentRepository.update(editingId, input);
      const loaded = await filamentRepository.list();

      setFilaments(loaded);
      setSelectedId(saved.id);
      setEditingId(saved.id);
      setForm(toFormState(saved));
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
          <ToolbarButton onClick={() => void loadFilaments()}>Refresh</ToolbarButton>
          <ToolbarButton onClick={startCreate} tone="primary">
            Add Spool
          </ToolbarButton>
        </>
      }
      description="Track local filament spools, TD values, color metadata, grams left, low-stock thresholds, and spool status."
      meta={["SQLite local", "Manual edits", "No production deduction yet"]}
      title="Filament Inventory"
    >
      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="screen-toolbar">
        <SearchField
          label="Spool search"
          onChange={setSearch}
          placeholder="Scan or search..."
          value={search}
        />
        <SegmentedFilter
          label="Spool status"
          onChange={(value) => setFilter(value as FilterValue)}
          options={[
            { active: filter === "all", label: "All", value: "all" },
            { active: filter === "open", label: "Open", value: "open" },
            { active: filter === "low", label: "Low", value: "low" },
            { active: filter === "sealed", label: "Sealed", value: "sealed" },
          ]}
        />
      </div>

      <div className="metric-grid">
        <MetricPanel detail="local records" label="Total Spools" value={String(filaments.length)} />
        <MetricPanel detail="< threshold" label="Low Stock" tone="warning" value={String(lowCount)} />
        <MetricPanel detail="open spools" label="In Use" value={String(openCount)} />
        <MetricPanel detail="sealed stock" label="Sealed" tone="success" value={String(sealedCount)} />
      </div>

      <div className="content-grid content-grid--split">
        <Panel title="Spool Telemetry">
          <DataTable
            columns={["Clr", "Brand", "Mat", "Name", "TD", "Stock", "Cost", "Status"]}
            columnsTemplate="34px 0.65fr 0.58fr minmax(128px, 1.35fr) 0.35fr minmax(112px, 1fr) 0.55fr 0.65fr"
            density="dense"
            footer={
              isLoading
                ? "Loading local SQLite records..."
                : `${filteredFilaments.length} visible of ${filaments.length} filament records.`
            }
            rows={filteredFilaments.map((filament) => {
              const signal = getStockSignal(filament);
              const percent = Math.round(
                (filament.estimatedGramsLeft / filament.startingGrams) * 100,
              );

              const progressTone =
                signal === "low" ? "warning" : signal === "empty" ? "danger" : "success";
              const currentMaterialTone = materialTone[filament.materialType];

              return [
                <Swatch color={filament.hexColor} />,
                filament.brand,
                <Badge {...(currentMaterialTone ? { tone: currentMaterialTone } : {})}>
                  {filament.materialType}
                </Badge>,
                <button
                  className="table-link"
                  onClick={() => {
                    setSelectedId(filament.id);
                    startEdit(filament);
                  }}
                  type="button"
                >
                  {filament.name}
                </button>,
                filament.transmissionDistance?.toString() ?? "--",
                <ProgressBar
                  label={formatGramsLeft(filament.estimatedGramsLeft)}
                  tone={progressTone}
                  value={percent}
                />,
                `$${filament.spoolCost.toFixed(2)}`,
                <Badge tone={stockTone[signal]}>{signal}</Badge>,
              ];
            })}
          />
        </Panel>

        <div className="side-stack">
          <Panel title="Selected Spool">
            {selectedFilament ? (
              <FilamentDetail filament={selectedFilament} onEdit={() => startEdit(selectedFilament)} />
            ) : (
              <div className="empty-state">
                <Badge>Empty</Badge>
                <p>Add a spool to start tracking filament inventory.</p>
              </div>
            )}
          </Panel>

          <Panel title={editingId == null ? "Add Spool" : "Edit Spool"}>
            <form className="filament-form" onSubmit={(event) => void handleSubmit(event)}>
              <FormField label="Brand">
                <input
                  onChange={(event) => setFormValue("brand", event.target.value, setForm)}
                  value={form.brand}
                />
              </FormField>
              <FormField label="Name">
                <input
                  onChange={(event) => setFormValue("name", event.target.value, setForm)}
                  value={form.name}
                />
              </FormField>
              <FormField label="Material">
                <select
                  onChange={(event) =>
                    setFormValue("materialType", event.target.value as FilamentMaterial, setForm)
                  }
                  value={form.materialType}
                >
                  {FILAMENT_MATERIALS.map((material) => (
                    <option key={material} value={material}>
                      {material}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Status">
                <select
                  onChange={(event) =>
                    setFormValue("spoolStatus", event.target.value as SpoolStatus, setForm)
                  }
                  value={form.spoolStatus}
                >
                  {SPOOL_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Color Name">
                <input
                  onChange={(event) => setFormValue("colorName", event.target.value, setForm)}
                  value={form.colorName}
                />
              </FormField>
              <FormField label="Hex Color">
                <input
                  onBlur={() => setFormValue("hexColor", normalizeHexColor(form.hexColor), setForm)}
                  onChange={(event) => setFormValue("hexColor", event.target.value, setForm)}
                  value={form.hexColor}
                />
              </FormField>
              <FormField label="TD">
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    setFormValue("transmissionDistance", event.target.value, setForm)
                  }
                  value={form.transmissionDistance}
                />
              </FormField>
              <FormField label="Starting g">
                <input
                  inputMode="decimal"
                  onChange={(event) => setFormValue("startingGrams", event.target.value, setForm)}
                  value={form.startingGrams}
                />
              </FormField>
              <FormField label="Left g">
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    setFormValue("estimatedGramsLeft", event.target.value, setForm)
                  }
                  value={form.estimatedGramsLeft}
                />
              </FormField>
              <FormField label="Cost">
                <input
                  inputMode="decimal"
                  onChange={(event) => setFormValue("spoolCost", event.target.value, setForm)}
                  value={form.spoolCost}
                />
              </FormField>
              <FormField label="Low g">
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    setFormValue("lowStockThresholdGrams", event.target.value, setForm)
                  }
                  value={form.lowStockThresholdGrams}
                />
              </FormField>
              <FormField label="Source">
                <input
                  onChange={(event) => setFormValue("purchaseSource", event.target.value, setForm)}
                  value={form.purchaseSource}
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
                  {editingId == null ? "Save Spool" : "Update Spool"}
                </ToolbarButton>
              </div>
            </form>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

function FilamentDetail({
  filament,
  onEdit,
}: {
  readonly filament: FilamentRecord;
  readonly onEdit: () => void;
}) {
  const signal = getStockSignal(filament);
  const currentMaterialTone = materialTone[filament.materialType];

  return (
    <div className="detail-stack">
      <div className="spool-card-head">
        <span className="spool-card-head__image">
          <Swatch color={filament.hexColor} />
        </span>
        <div>
          <div className="spool-card-head__badges">
            <Badge>{filament.brand}</Badge>
            <Badge {...(currentMaterialTone ? { tone: currentMaterialTone } : {})}>
              {filament.materialType}
            </Badge>
          </div>
          <strong>{filament.name}</strong>
          <span>ID: SPL-{String(filament.id).padStart(4, "0")}</span>
        </div>
      </div>
      <div className="detail-stack__metric">
        <span>Current Weight</span>
        <strong>{formatGramsLeft(filament.estimatedGramsLeft)}</strong>
      </div>
      <div className="key-value-list">
        <span>Color</span>
        <strong>{filament.colorName}</strong>
        <span>Hex Code</span>
        <strong>{filament.hexColor}</strong>
        <span>Transmission Distance</span>
        <strong>{filament.transmissionDistance ?? "--"}</strong>
        <span>Starting Weight</span>
        <strong>{formatGramsLeft(filament.startingGrams)}</strong>
        <span>Low Threshold</span>
        <strong>{formatGramsLeft(filament.lowStockThresholdGrams)}</strong>
        <span>Spool Cost</span>
        <strong>${filament.spoolCost.toFixed(2)}</strong>
        <span>Status</span>
        <strong>{signal}</strong>
      </div>
      <div className="callout">
        <Badge>Notes</Badge>
        <p>{filament.notes || filament.purchaseSource || "No purchase notes saved."}</p>
      </div>
      <ToolbarButton onClick={onEdit} tone="primary">
        Edit Selected
      </ToolbarButton>
    </div>
  );
}

function FormField({
  children,
  label,
  wide = false,
}: {
  readonly children: React.ReactNode;
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

function setFormValue<K extends keyof FilamentFormState>(
  key: K,
  value: FilamentFormState[K],
  setForm: React.Dispatch<React.SetStateAction<FilamentFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function toFilamentInput(form: FilamentFormState): FilamentInput {
  return {
    brand: form.brand,
    name: form.name,
    materialType: form.materialType,
    colorName: form.colorName,
    hexColor: normalizeHexColor(form.hexColor),
    transmissionDistance:
      form.transmissionDistance.trim() === "" ? null : Number(form.transmissionDistance),
    spoolStatus: form.spoolStatus,
    startingGrams: Number(form.startingGrams),
    estimatedGramsLeft: Number(form.estimatedGramsLeft),
    spoolCost: Number(form.spoolCost),
    purchaseSource: form.purchaseSource,
    notes: form.notes,
    lowStockThresholdGrams: Number(form.lowStockThresholdGrams),
  };
}

function toFormState(filament: FilamentRecord): FilamentFormState {
  return {
    brand: filament.brand,
    colorName: filament.colorName,
    estimatedGramsLeft: String(filament.estimatedGramsLeft),
    hexColor: filament.hexColor,
    lowStockThresholdGrams: String(filament.lowStockThresholdGrams),
    materialType: filament.materialType,
    name: filament.name,
    notes: filament.notes,
    purchaseSource: filament.purchaseSource,
    spoolCost: String(filament.spoolCost),
    spoolStatus: filament.spoolStatus,
    startingGrams: String(filament.startingGrams),
    transmissionDistance: filament.transmissionDistance?.toString() ?? "",
  };
}

function formatRepositoryError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("invoke")) {
      return "Native SQLite storage is available when the app is opened through Tauri. Browser preview can render the screen but cannot access the local database.";
    }

    return error.message;
  }

  return "Filament storage is unavailable. Open the app through Tauri to use local SQLite.";
}
