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
  channel: "Local",
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  async function loadSalesData(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const [loadedFinishedGoods, loadedSales] = await Promise.all([
        finishedGoodsRepository.list(),
        salesRepository.list(),
      ]);

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
      setError(formatRepositoryError(loadError));
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
    setValidationMessage(null);

    if (!validation.valid) {
      setValidationMessage(Object.values(validation.errors)[0] ?? "Check the sale fields.");
      return;
    }

    if (stockMessage) {
      setValidationMessage(stockMessage);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await salesService.recordSale(input);
      await loadSalesData();
      setValidationMessage("Sale recorded. Finished goods stock was reduced.");
      setForm((current) => ({
        ...current,
        discountsFees: "0",
        grossRevenue: "0",
        notes: "",
        quantity: "1",
        saleDate: todayInputValue(),
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
          <ToolbarButton onClick={() => void loadSalesData()}>Refresh</ToolbarButton>
          <ToolbarButton disabled={isSaving || finishedGoods.length === 0} form="sale-entry-form" tone="primary" type="submit">
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
      {validationMessage ? (
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

      <div className="content-grid content-grid--sales">
        <div className="side-stack">
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
        </div>

        <div className="side-stack">
          <Panel title="Add Sale" actions={<Badge>{selectedFinishedGood?.saleUnit ?? "Unit"}</Badge>}>
            <form className="inventory-form sales-form" id="sale-entry-form" onSubmit={(event) => void handleSubmit(event)}>
              <FormField label="Finished Good" wide>
                <input
                  autoComplete="off"
                  list="finished-good-options"
                  onChange={(event) => setFinishedGoodQuery(event.target.value, finishedGoods, setForm)}
                  placeholder="Type finished good..."
                  value={form.finishedGoodQuery}
                />
                <datalist id="finished-good-options">
                  {finishedGoods.map((item) => (
                    <option key={item.id} value={getFinishedGoodOptionLabel(item)} />
                  ))}
                </datalist>
              </FormField>
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
                <ToolbarButton disabled={isSaving || finishedGoods.length === 0} tone="primary" type="submit">
                  Save Sale & Reduce Stock
                </ToolbarButton>
              </div>
            </form>
          </Panel>

          <Panel title="Sale Preview">
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

function formatRepositoryError(error: unknown): string {
  const message = getErrorMessage(error);

  if (error instanceof Error) {
    if (isBrowserPreviewError(error)) {
      return "Browser preview cannot access the Tauri SQLite plugin. Open the desktop app to load and save local sales.";
    }
  }

  return message
    ? `Sales storage could not be opened: ${message}`
    : "Sales storage could not be opened.";
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
