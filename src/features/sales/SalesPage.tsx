import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

import { Page } from "@/components/layout/Page";
import {
  Badge,
  DataTable,
  MetricPanel,
  Panel,
  SegmentedFilter,
  ToolbarButton,
} from "@/components/ui";
import { finishedGoodsRepository, salesRepository } from "@/data/repositories";
import { salesService } from "@/data/services/salesService";
import {
  formatFinishedGoodsQuantity,
  type FinishedGoodRecord,
  type FinishedGoodSaleUnit,
} from "@/domain/inventory";
import {
  calculateSaleTotals,
  SALES_CHANNELS,
  validateSaleAgainstStock,
  validateSaleInput,
  type SaleInput,
  type SaleRecord,
  type SalesChannel,
} from "@/domain/sales";

interface SaleFormState {
  readonly channel: SalesChannel;
  readonly discountsFees: string;
  readonly finishedGoodId: string;
  readonly finishedGoodQuery: string;
  readonly grossRevenue: string;
  readonly notes: string;
  readonly quantity: string;
  readonly saleDate: string;
}

const emptyForm: SaleFormState = {
  channel: "Direct",
  discountsFees: "0",
  finishedGoodId: "",
  finishedGoodQuery: "",
  grossRevenue: "0",
  notes: "",
  quantity: "1",
  saleDate: todayInputValue(),
};

export function SalesPage() {
  const [channelFilter, setChannelFilter] = useState<"All" | SalesChannel>("All");
  const [error, setError] = useState<string | null>(null);
  const [finishedGoods, setFinishedGoods] = useState<FinishedGoodRecord[]>([]);
  const [form, setForm] = useState<SaleFormState>(emptyForm);
  const [isAddSaleOpen, setIsAddSaleOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const saveInFlightRef = useRef(false);

  async function loadSalesData(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const loadedFinishedGoods = await finishedGoodsRepository.list();
      const loadedSales = await salesRepository.list();

      setFinishedGoods(loadedFinishedGoods);
      setSales(loadedSales);
      setForm((current) => {
        const selectedId = current.finishedGoodId || (loadedFinishedGoods[0] ? String(loadedFinishedGoods[0].id) : "");
        const selectedStock = loadedFinishedGoods.find((item) => String(item.id) === selectedId) ?? null;

        return {
          ...current,
          finishedGoodId: selectedStock ? String(selectedStock.id) : "",
          finishedGoodQuery: selectedStock
            ? getFinishedGoodOptionLabel(selectedStock)
            : current.finishedGoodQuery,
        };
      });
    } catch (loadError) {
      setError(formatRepositoryError(loadError, "load"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSalesData();
  }, []);

  const selectedFinishedGood =
    finishedGoods.find((item) => String(item.id) === form.finishedGoodId) ?? null;
  const input = useMemo(
    () => toSaleInput(form, selectedFinishedGood),
    [form, selectedFinishedGood],
  );
  const validation = validateSaleInput(input);
  const stockMessage = selectedFinishedGood
    ? validateSaleAgainstStock(input, selectedFinishedGood)
    : "Choose a finished good item.";
  const totals = calculateSaleTotals(input);
  const filteredSales = channelFilter === "All"
    ? sales
    : sales.filter((sale) => sale.channel === channelFilter);

  const grossRevenue = sales.reduce((sum, sale) => sum + sale.grossRevenue, 0);
  const netRevenue = sales.reduce((sum, sale) => sum + sale.netRevenue, 0);
  const unitsSold = sales.reduce((sum, sale) => sum + sale.quantity, 0);
  const averageOrder = sales.length > 0 ? netRevenue / sales.length : 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (saveInFlightRef.current) {
      return;
    }

    setValidationMessage(null);

    if (!validation.valid) {
      setValidationMessage(Object.values(validation.errors)[0] ?? "Check the sale fields.");
      return;
    }

    if (stockMessage) {
      setValidationMessage(stockMessage);
      return;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    setError(null);

    try {
      await salesService.recordSale(input);
      setValidationMessage("Sale recorded. Finished goods stock was reduced.");
      setIsAddSaleOpen(false);
      setForm((current) => ({
        ...current,
        discountsFees: "0",
        grossRevenue: "0",
        notes: "",
        quantity: "1",
        saleDate: todayInputValue(),
      }));
    } catch (saveError) {
      setError(formatRepositoryError(saveError, "save"));
      saveInFlightRef.current = false;
      setIsSaving(false);
      return;
    }

    try {
      await loadSalesData();
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  function openAddSaleModal(): void {
    setValidationMessage(null);
    setIsAddSaleOpen(true);
  }

  function closeAddSaleModal(): void {
    if (!isSaving) {
      setIsAddSaleOpen(false);
    }
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton disabled={isSaving} onClick={() => void loadSalesData()}>Refresh</ToolbarButton>
          <ToolbarButton disabled={isSaving} onClick={openAddSaleModal} tone="primary">
            Add Sale
          </ToolbarButton>
        </>
      }
      description="Record offline sales, track gross and net revenue, and reduce ready finished goods stock."
      meta={["SQLite sales log", "Finished goods movement", "No payments or cloud"]}
      title="Sales Tracking"
    >
      {error ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Storage</Badge>
          <p>{error}</p>
        </div>
      ) : null}
      {validationMessage && !isAddSaleOpen ? (
        <div className={validationMessage.startsWith("Sale recorded") ? "callout" : "callout callout--warning"}>
          <Badge tone={validationMessage.startsWith("Sale recorded") ? "success" : "warning"}>
            Sale Entry
          </Badge>
          <p>{validationMessage}</p>
        </div>
      ) : null}
      {!error && finishedGoods.length === 0 ? (
        <div className="callout callout--warning">
          <Badge tone="warning">Stock</Badge>
          <p>Add finished goods stock before recording sales.</p>
        </div>
      ) : null}

      <div className="metric-grid">
        <MetricPanel detail="all channels" label="Gross Revenue" value={formatCurrency(grossRevenue)} />
        <MetricPanel detail="gross less discounts/fees" label="Net Revenue" tone="success" value={formatCurrency(netRevenue)} />
        <MetricPanel detail="quantity sold" label="Units Sold" value={isLoading ? "..." : String(unitsSold)} />
        <MetricPanel detail="net per order" label="Avg Order" value={formatCurrency(averageOrder)} />
      </div>

      <Panel title="Transaction Overview">
        <div className="sales-filter-bar">
          <SegmentedFilter
            label="Channels"
            onChange={(value) => setChannelFilter(value as "All" | SalesChannel)}
            options={[
              { active: channelFilter === "All", label: "All" },
              ...SALES_CHANNELS.map((channel) => ({
                active: channelFilter === channel,
                label: channel,
              })),
            ]}
          />
        </div>
        <DataTable
          columns={["Date", "Product", "Channel", "Qty", "Gross", "Net", "Stock"]}
          columnsTemplate="0.68fr minmax(150px, 1.35fr) 0.65fr 0.42fr 0.58fr 0.58fr 0.5fr"
          density="dense"
          footer={filteredSales.length === 0 ? "No sales recorded for this channel." : `Showing ${filteredSales.length} sales.`}
          rows={filteredSales.map((sale) => [
            sale.saleDate,
            sale.productReference,
            <Badge>{sale.channel}</Badge>,
            formatFinishedGoodsQuantity(sale.quantity, sale.saleUnit),
            formatCurrency(sale.grossRevenue),
            <span className="numeric-readout">
              <strong>{formatCurrency(sale.netRevenue)}</strong>
            </span>,
            `${sale.stockQuantityBefore} -> ${sale.stockQuantityAfter}`,
          ])}
        />
      </Panel>

      {isAddSaleOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="add-sale-form-title"
            aria-modal="true"
            className="modal modal--sale"
            role="dialog"
          >
            <header className="modal__header">
              <h2 id="add-sale-form-title">Add Sale</h2>
              <button
                aria-label="Close add sale form"
                disabled={isSaving}
                onClick={closeAddSaleModal}
                type="button"
              >
                x
              </button>
            </header>
            <form className="inventory-form sales-form" id="sale-entry-form" onSubmit={(event) => void handleSubmit(event)}>
              <div className="sale-modal__form-header">
                <Badge>{selectedFinishedGood?.saleUnit ?? "Unit"}</Badge>
              </div>
              <div className="form-field" data-wide="true">
                <span>Finished Good</span>
                <FinishedGoodCombobox
                  finishedGoods={finishedGoods}
                  onQueryChange={(value) => setFinishedGoodQuery(value, finishedGoods, setForm)}
                  onSelect={(item) => selectFinishedGood(item, setForm)}
                  query={form.finishedGoodQuery}
                  selectedId={form.finishedGoodId}
                />
              </div>
              <FormField label="Sale Date">
                <input onChange={(event) => setFormValue("saleDate", event.target.value, setForm)} type="date" value={form.saleDate} />
              </FormField>
              <FormField label="Channel">
                <select onChange={(event) => setFormValue("channel", event.target.value as SalesChannel, setForm)} value={form.channel}>
                  {SALES_CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Quantity">
                <input inputMode="numeric" onChange={(event) => setFormValue("quantity", event.target.value, setForm)} value={form.quantity} />
              </FormField>
              <FormField label="Sale Unit">
                <input readOnly value={selectedFinishedGood?.saleUnit ?? ""} />
              </FormField>
              <FormField label="Gross Revenue">
                <input inputMode="decimal" onChange={(event) => setFormValue("grossRevenue", event.target.value, setForm)} value={form.grossRevenue} />
              </FormField>
              <FormField label="Discounts / Fees">
                <input inputMode="decimal" onChange={(event) => setFormValue("discountsFees", event.target.value, setForm)} value={form.discountsFees} />
              </FormField>
              <FormField label="Notes" wide>
                <textarea onChange={(event) => setFormValue("notes", event.target.value, setForm)} value={form.notes} />
              </FormField>
              <div className="form-actions">
                <ToolbarButton disabled={isSaving} onClick={closeAddSaleModal}>
                  Cancel
                </ToolbarButton>
                <ToolbarButton disabled={finishedGoods.length === 0} isLoading={isSaving} loadingLabel="Saving" tone="primary" type="submit">
                  Save Sale
                </ToolbarButton>
              </div>
              {validationMessage ? (
                <div className="form-message" role="alert">
                  {validationMessage}
                </div>
              ) : null}
            </form>

            <aside className="sale-modal__preview" aria-label="Sale preview">
              <div className="pricing-readout">
                <span>Net Revenue</span>
                <strong>{formatCurrency(totals.netRevenue)}</strong>
                <small>after discounts and fees</small>
              </div>
              <div className="key-value-list">
                <span>Gross Revenue</span>
                <strong>{formatCurrency(totals.grossRevenue)}</strong>
                <span>Discounts / Fees</span>
                <strong>{formatCurrency(totals.discountsFees)}</strong>
                <span>Average Unit</span>
                <strong>{formatCurrency(totals.averageUnitPrice)}</strong>
                <span>Ready Stock</span>
                <strong>
                  {selectedFinishedGood
                    ? formatFinishedGoodsQuantity(selectedFinishedGood.quantityReady, selectedFinishedGood.saleUnit)
                    : "--"}
                </strong>
                <span>After Sale</span>
                <strong>
                  {selectedFinishedGood
                    ? formatFinishedGoodsQuantity(
                        Math.max(0, selectedFinishedGood.quantityReady - input.quantity),
                        selectedFinishedGood.saleUnit,
                      )
                    : "--"}
                </strong>
              </div>
              {stockMessage ? (
                <div className="callout callout--warning">
                  <Badge tone="warning">Stock</Badge>
                  <p>{stockMessage}</p>
                </div>
              ) : null}
            </aside>
          </section>
        </div>
      ) : null}
    </Page>
  );
}

function FinishedGoodCombobox({
  finishedGoods,
  onQueryChange,
  onSelect,
  query,
  selectedId,
}: {
  readonly finishedGoods: readonly FinishedGoodRecord[];
  readonly onQueryChange: (value: string) => void;
  readonly onSelect: (item: FinishedGoodRecord) => void;
  readonly query: string;
  readonly selectedId: string;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const filteredFinishedGoods = useMemo(
    () => filterFinishedGoods(query, finishedGoods),
    [finishedGoods, query],
  );
  const boundedActiveIndex = Math.min(activeIndex, Math.max(0, filteredFinishedGoods.length - 1));
  const activeOption = filteredFinishedGoods[boundedActiveIndex] ?? null;

  function openWithSelection(): void {
    const selectedIndex = filteredFinishedGoods.findIndex((item) => String(item.id) === selectedId);

    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  }

  function handleQueryChange(value: string): void {
    onQueryChange(value);
    setActiveIndex(0);
    setIsOpen(true);
  }

  function chooseFinishedGood(item: FinishedGoodRecord): void {
    onSelect(item);
    setActiveIndex(0);
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        filteredFinishedGoods.length === 0 ? 0 : (current + 1) % filteredFinishedGoods.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        filteredFinishedGoods.length === 0
          ? 0
          : (current - 1 + filteredFinishedGoods.length) % filteredFinishedGoods.length,
      );
      return;
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();

      if (activeOption) {
        chooseFinishedGood(activeOption);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    }
  }

  return (
    <div
      className="finished-good-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <input
        aria-activedescendant={isOpen && activeOption ? getFinishedGoodOptionId(listboxId, activeOption) : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        autoComplete="off"
        id={inputId}
        onChange={(event) => handleQueryChange(event.target.value)}
        onFocus={openWithSelection}
        onKeyDown={handleKeyDown}
        placeholder="Type finished good..."
        role="combobox"
        value={query}
      />
      {isOpen ? (
        <div className="finished-good-combobox__menu" id={listboxId} role="listbox">
          {filteredFinishedGoods.length > 0 ? (
            filteredFinishedGoods.map((item, index) => {
              const isActive = index === boundedActiveIndex;
              const isSelected = String(item.id) === selectedId;

              return (
                <div
                  aria-selected={isSelected}
                  className="finished-good-combobox__option"
                  data-active={isActive ? "true" : "false"}
                  data-selected={isSelected ? "true" : "false"}
                  id={getFinishedGoodOptionId(listboxId, item)}
                  key={item.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    chooseFinishedGood(item);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                >
                  <span>{item.productReference}</span>
                  <strong>{formatFinishedGoodsQuantity(item.quantityReady, item.saleUnit)}</strong>
                </div>
              );
            })
          ) : (
            <div className="finished-good-combobox__empty">No finished goods match this search.</div>
          )}
        </div>
      ) : null}
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

function setFormValue<K extends keyof SaleFormState>(
  key: K,
  value: SaleFormState[K],
  setForm: Dispatch<SetStateAction<SaleFormState>>,
): void {
  setForm((current) => ({ ...current, [key]: value }));
}

function setFinishedGoodQuery(
  value: string,
  finishedGoods: readonly FinishedGoodRecord[],
  setForm: Dispatch<SetStateAction<SaleFormState>>,
): void {
  const matchedStock = findFinishedGoodByQuery(value, finishedGoods);

  setForm((current) => ({
    ...current,
    finishedGoodId: matchedStock ? String(matchedStock.id) : "",
    finishedGoodQuery: value,
  }));
}

function selectFinishedGood(
  item: FinishedGoodRecord,
  setForm: Dispatch<SetStateAction<SaleFormState>>,
): void {
  setForm((current) => ({
    ...current,
    finishedGoodId: String(item.id),
    finishedGoodQuery: getFinishedGoodOptionLabel(item),
  }));
}

function filterFinishedGoods(
  query: string,
  finishedGoods: readonly FinishedGoodRecord[],
): readonly FinishedGoodRecord[] {
  const normalized = normalizeFinishedGoodQuery(query);

  if (!normalized) {
    return finishedGoods;
  }

  return finishedGoods.filter((item) => {
    const optionLabel = normalizeFinishedGoodQuery(getFinishedGoodOptionLabel(item));
    const productReference = normalizeFinishedGoodQuery(item.productReference);

    return optionLabel.includes(normalized) || productReference.includes(normalized);
  });
}

function findFinishedGoodByQuery(
  value: string,
  finishedGoods: readonly FinishedGoodRecord[],
): FinishedGoodRecord | null {
  const normalized = normalizeFinishedGoodQuery(value);

  if (!normalized) {
    return null;
  }

  return (
    finishedGoods.find((item) => normalizeFinishedGoodQuery(getFinishedGoodOptionLabel(item)) === normalized) ??
    finishedGoods.find((item) => normalizeFinishedGoodQuery(item.productReference) === normalized) ??
    null
  );
}

function getFinishedGoodOptionLabel(item: FinishedGoodRecord): string {
  return `${item.productReference} (${formatFinishedGoodsQuantity(item.quantityReady, item.saleUnit)})`;
}

function normalizeFinishedGoodQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function getFinishedGoodOptionId(listboxId: string, item: FinishedGoodRecord): string {
  return `${listboxId}-option-${item.id}`;
}

function toSaleInput(form: SaleFormState, selectedStock: FinishedGoodRecord | null): SaleInput {
  return {
    channel: form.channel,
    discountsFees: toNumber(form.discountsFees),
    finishedGoodId: Number(form.finishedGoodId),
    grossRevenue: toNumber(form.grossRevenue),
    notes: form.notes,
    productReference: selectedStock?.productReference ?? "",
    quantity: toInteger(form.quantity),
    saleDate: form.saleDate,
    saleUnit: selectedStock?.saleUnit ?? ("piece" as FinishedGoodSaleUnit),
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

function formatCurrency(value: number): string {
  return `₱${value.toFixed(2)}`;
}

function formatRepositoryError(error: unknown, context: "load" | "save" = "load"): string {
  const message = getErrorMessage(error);
  const fallback = context === "save" ? "Sale could not be saved." : "Sales storage could not be opened.";
  const prefix = context === "save" ? "Sale could not be saved" : "Sales storage could not be opened";

  if (error instanceof Error) {
    if (isBrowserPreviewError(error)) {
      return "Browser preview cannot access the Tauri SQLite plugin. Open the desktop app to load and save local sales.";
    }
  }

  return message
    ? `${prefix}: ${message}`
    : fallback;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error.trim();
  }

  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return "";
}

function isBrowserPreviewError(error: Error): boolean {
  const hasTauriRuntime =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  return !hasTauriRuntime && error.message.includes("invoke");
}
