import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Page } from "@/components/layout/Page";
import {
  Badge,
  DataTable,
  MetricPanel,
  Panel,
  SearchField,
  SegmentedFilter,
  ToolbarButton,
} from "@/components/ui";
import {
  printPlansRepository,
  productsRepository,
  salesRepository,
} from "@/data/repositories";
import {
  buildPrintPlanCalculation,
  getPrintPlanRecommendations,
  getRequiredFreshInventoryCounts,
  isProductStockedAtBusiness,
  PRINT_PLANNER_BUSINESSES,
  PRINT_PLANNER_HISTORY_DAYS,
  PRINT_PLANNER_TARGET_DAYS,
  type FreshInventoryCount,
  type PrintPlan,
  type PrintPlanItem,
  type PrintPlannerBusinessId,
} from "@/domain/printPlanner";
import type { ProductRecord } from "@/domain/products";

type PlannerView = "count" | "plan" | "setup";

export function PrintPlannerPage() {
  const [activeBusinessId, setActiveBusinessId] = useState<PrintPlannerBusinessId>("sincerely");
  const [countDraft, setCountDraft] = useState<Record<string, string>>({});
  const [draftProducts, setDraftProducts] = useState<readonly ProductRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [plans, setPlans] = useState<PrintPlan[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [view, setView] = useState<PlannerView>("setup");

  async function loadPlanner(): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      const [loadedProducts, loadedPlans] = await Promise.all([
        productsRepository.list(),
        printPlansRepository.list(),
      ]);
      setProducts(loadedProducts);
      setPlans(loadedPlans);
      setSelectedPlanId((current) =>
        current != null && loadedPlans.some((plan) => plan.id === current)
          ? current
          : loadedPlans[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(formatError(loadError, "Planner data could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPlanner();
  }, []);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const activeBusiness = PRINT_PLANNER_BUSINESSES.find(
    (business) => business.id === activeBusinessId,
  )!;
  const requiredCounts = useMemo(
    () => getRequiredFreshInventoryCounts(draftProducts ?? []),
    [draftProducts],
  );
  const completedCountTotal = requiredCounts.filter(({ productId, businessId }) =>
    isValidCountValue(countDraft[countKey(productId, businessId)]),
  ).length;
  const countIsComplete = draftProducts != null && completedCountTotal === requiredCounts.length;
  const totalAssignments = PRINT_PLANNER_BUSINESSES.reduce(
    (total, business) => total + products.filter((product) =>
      isProductStockedAtBusiness(product, business),
    ).length,
    0,
  );

  function startNewPlan(): void {
    setDraftProducts(products.map((product) => ({ ...product })));
    setCountDraft({});
    setSuccessMessage(null);
    setError(null);
    setActiveBusinessId("sincerely");
    setView("count");
  }

  function cancelCount(): void {
    setDraftProducts(null);
    setCountDraft({});
    setView("setup");
  }

  async function toggleStocking(product: ProductRecord): Promise<void> {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    const isStocked = isProductStockedAtBusiness(product, activeBusiness);
    const nextBusinesses = isStocked
      ? product.businesses.filter(
          (name) => normalizeIdentity(name) !== normalizeIdentity(activeBusiness.productBusinessName),
        )
      : [...product.businesses, activeBusiness.productBusinessName];

    try {
      const updated = await productsRepository.updateBusinesses(product.id, nextBusinesses);
      setProducts((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSuccessMessage(
        `${updated.designName} is ${isStocked ? "no longer" : "now"} stocked at ${activeBusiness.label}.`,
      );
    } catch (saveError) {
      setError(formatError(saveError, "The stocking assignment could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  async function generateAndSavePlan(): Promise<void> {
    if (!draftProducts || !countIsComplete || isSaving) return;
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const latestSales = await salesRepository.list();
      const counts: FreshInventoryCount[] = requiredCounts.map(({ productId, businessId }) => ({
        businessId,
        productId,
        quantity: Number(countDraft[countKey(productId, businessId)]),
      }));
      const calculation = buildPrintPlanCalculation({
        counts,
        planDate: todayInputValue(),
        products: draftProducts,
        sales: latestSales,
      });
      const saved = await printPlansRepository.save(calculation);
      setPlans((current) => [saved, ...current]);
      setSelectedPlanId(saved.id);
      setDraftProducts(null);
      setCountDraft({});
      setSuccessMessage(`Plan #${saved.id} was generated and saved.`);
      setView("plan");
    } catch (saveError) {
      setError(formatError(saveError, "The print plan could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton disabled={isSaving} onClick={() => void loadPlanner()}>Refresh</ToolbarButton>
          {view !== "setup" ? (
            <ToolbarButton disabled={isSaving} onClick={() => {
              setDraftProducts(null);
              setCountDraft({});
              setView("setup");
            }}>
              Stocking Setup
            </ToolbarButton>
          ) : null}
          {view !== "count" ? (
            <ToolbarButton disabled={isLoading || isSaving} onClick={startNewPlan} tone="primary">
              Start New Plan
            </ToolbarButton>
          ) : null}
        </>
      }
      description="Count stock at each business and turn the last 28 days of sales into a transparent 14-day print queue."
      meta={["Planning counts only", "28-day sales history", "Saved SQLite snapshots"]}
      title="Print Planner"
    >
      {error ? <PlannerCallout tone="warning" title="Planner">{error}</PlannerCallout> : null}
      {successMessage ? <PlannerCallout tone="success" title="Saved">{successMessage}</PlannerCallout> : null}

      <div className="metric-grid">
        <MetricPanel detail="product and business pairs" label="Stocked Assignments" value={totalAssignments} />
        <MetricPanel detail="calendar days ending today" label="Sales Window" value={`${PRINT_PLANNER_HISTORY_DAYS} days`} />
        <MetricPanel detail="rounded up to whole units" label="Stock Target" value={`${PRINT_PLANNER_TARGET_DAYS} days`} />
        <MetricPanel detail="read-only count snapshots" label="Saved Plans" value={plans.length} />
      </div>

      {view === "setup" ? (
        <StockingSetup
          activeBusinessId={activeBusinessId}
          isLoading={isLoading}
          isSaving={isSaving}
          onBusinessChange={setActiveBusinessId}
          onSearchChange={setSearch}
          onToggle={(product) => void toggleStocking(product)}
          products={products}
          search={search}
        />
      ) : null}

      {view === "count" && draftProducts ? (
        <FreshCountWorksheet
          activeBusinessId={activeBusinessId}
          completedCountTotal={completedCountTotal}
          countDraft={countDraft}
          isComplete={countIsComplete}
          isSaving={isSaving}
          onBusinessChange={setActiveBusinessId}
          onCancel={cancelCount}
          onCountChange={(key, value) => setCountDraft((current) => ({ ...current, [key]: value }))}
          onGenerate={() => void generateAndSavePlan()}
          products={draftProducts}
          requiredCountTotal={requiredCounts.length}
        />
      ) : null}

      {view === "plan" ? (
        <SavedPlanView
          onBusinessChange={setActiveBusinessId}
          onPlanChange={setSelectedPlanId}
          plan={selectedPlan}
          plans={plans}
          selectedBusinessId={activeBusinessId}
        />
      ) : null}

      {view === "setup" && plans.length > 0 ? (
        <Panel
          actions={<ToolbarButton onClick={() => setView("plan")}>Open History</ToolbarButton>}
          title="Recent Plans"
        >
          <PlanHistoryTable
            onSelect={(id) => {
              setSelectedPlanId(id);
              setView("plan");
            }}
            plans={plans.slice(0, 5)}
          />
        </Panel>
      ) : null}
    </Page>
  );
}

function StockingSetup({
  activeBusinessId,
  isLoading,
  isSaving,
  onBusinessChange,
  onSearchChange,
  onToggle,
  products,
  search,
}: {
  readonly activeBusinessId: PrintPlannerBusinessId;
  readonly isLoading: boolean;
  readonly isSaving: boolean;
  readonly onBusinessChange: (id: PrintPlannerBusinessId) => void;
  readonly onSearchChange: (value: string) => void;
  readonly onToggle: (product: ProductRecord) => void;
  readonly products: readonly ProductRecord[];
  readonly search: string;
}) {
  const business = PRINT_PLANNER_BUSINESSES.find((item) => item.id === activeBusinessId)!;
  const query = normalizeIdentity(search);
  const filtered = products.filter((product) =>
    !query || normalizeIdentity(`${product.designName} ${product.category}`).includes(query),
  );
  const stockedCount = products.filter((product) => isProductStockedAtBusiness(product, business)).length;

  return (
    <Panel
      actions={<Badge tone="success">{stockedCount} stocked</Badge>}
      title="Stocking Setup"
    >
      <p className="planner-intro">
        Choose which Product Library items are physically stocked at each business. Other custom
        business assignments remain unchanged.
      </p>
      <div className="planner-toolbar">
        <SegmentedFilter
          label="Stocking business"
          onChange={(value) => onBusinessChange(value as PrintPlannerBusinessId)}
          options={PRINT_PLANNER_BUSINESSES.map((item) => ({
            active: item.id === activeBusinessId,
            label: item.label,
            value: item.id,
          }))}
        />
        <SearchField
          disabled={isLoading}
          label="Search products"
          onChange={onSearchChange}
          placeholder="Product or category"
          value={search}
        />
      </div>
      <div className="planner-table planner-table--setup">
        <DataTable
          columns={["Stocked", "Product", "Category", "Sale Unit", "Other Planner Locations"]}
          columnsTemplate="90px minmax(240px, 1.4fr) minmax(130px, .7fr) 100px minmax(220px, 1fr)"
          emptyMessage={isLoading ? "Loading products..." : "No products match this search."}
          minimumWidth="900px"
          rows={filtered.map((product) => {
            const stocked = isProductStockedAtBusiness(product, business);
            const otherLocations = PRINT_PLANNER_BUSINESSES
              .filter((item) => item.id !== business.id && isProductStockedAtBusiness(product, item))
              .map((item) => item.label);
            return [
              <label className="planner-stock-toggle" key={`${product.id}-stocked`}>
                <input
                  checked={stocked}
                  disabled={isSaving}
                  onChange={() => onToggle(product)}
                  type="checkbox"
                />
                <span>{stocked ? "Yes" : "No"}</span>
              </label>,
              <strong key={`${product.id}-name`}>{product.designName}</strong>,
              product.category,
              product.saleUnit,
              otherLocations.join(", ") || "—",
            ];
          })}
        />
      </div>
    </Panel>
  );
}

function FreshCountWorksheet({
  activeBusinessId,
  completedCountTotal,
  countDraft,
  isComplete,
  isSaving,
  onBusinessChange,
  onCancel,
  onCountChange,
  onGenerate,
  products,
  requiredCountTotal,
}: {
  readonly activeBusinessId: PrintPlannerBusinessId;
  readonly completedCountTotal: number;
  readonly countDraft: Readonly<Record<string, string>>;
  readonly isComplete: boolean;
  readonly isSaving: boolean;
  readonly onBusinessChange: (id: PrintPlannerBusinessId) => void;
  readonly onCancel: () => void;
  readonly onCountChange: (key: string, value: string) => void;
  readonly onGenerate: () => void;
  readonly products: readonly ProductRecord[];
  readonly requiredCountTotal: number;
}) {
  const business = PRINT_PLANNER_BUSINESSES.find((item) => item.id === activeBusinessId)!;
  const stockedProducts = products.filter((product) => isProductStockedAtBusiness(product, business));

  return (
    <Panel
      actions={<Badge tone={isComplete ? "success" : "warning"}>{completedCountTotal}/{requiredCountTotal} counted</Badge>}
      title="Fresh Physical Count"
    >
      <PlannerCallout tone="warning" title="Planning Only">
        These counts will be saved only in this plan. They do not change Finished Goods or any stock movement.
      </PlannerCallout>
      <div className="planner-toolbar planner-toolbar--count">
        <SegmentedFilter
          label="Count business"
          onChange={(value) => onBusinessChange(value as PrintPlannerBusinessId)}
          options={PRINT_PLANNER_BUSINESSES.map((item) => {
            const required = products.filter((product) => isProductStockedAtBusiness(product, item));
            const complete = required.filter((product) =>
              isValidCountValue(countDraft[countKey(product.id, item.id)]),
            ).length;
            return {
              active: item.id === activeBusinessId,
              label: `${item.label} ${complete}/${required.length}`,
              value: item.id,
            };
          })}
        />
      </div>
      <div className="planner-table planner-table--count">
        <DataTable
          columns={["Product", "Sale Unit", "Fresh Physical Count"]}
          columnsTemplate="minmax(260px, 1fr) 120px 180px"
          emptyMessage="No products are marked as stocked at this business."
          minimumWidth="620px"
          rows={stockedProducts.map((product) => {
            const key = countKey(product.id, business.id);
            return [
              <strong key={`${key}-name`}>{product.designName}</strong>,
              product.saleUnit,
              <input
                aria-label={`${product.designName} physical count at ${business.label}`}
                className="table-input table-input--short"
                key={`${key}-count`}
                min="0"
                onChange={(event) => onCountChange(key, sanitizeCountInput(event.target.value))}
                placeholder="Required"
                step="1"
                type="number"
                value={countDraft[key] ?? ""}
              />,
            ];
          })}
        />
      </div>
      <div className="planner-actions">
        <ToolbarButton disabled={isSaving} onClick={onCancel}>Cancel Count</ToolbarButton>
        <ToolbarButton
          disabled={!isComplete}
          isLoading={isSaving}
          loadingLabel="Saving Plan"
          onClick={onGenerate}
          tone="primary"
        >
          Generate and Save Plan
        </ToolbarButton>
      </div>
    </Panel>
  );
}

function SavedPlanView({
  onBusinessChange,
  onPlanChange,
  plan,
  plans,
  selectedBusinessId,
}: {
  readonly onBusinessChange: (id: PrintPlannerBusinessId) => void;
  readonly onPlanChange: (id: number) => void;
  readonly plan: PrintPlan | null;
  readonly plans: readonly PrintPlan[];
  readonly selectedBusinessId: PrintPlannerBusinessId;
}) {
  if (!plan) {
    return (
      <Panel title="Saved Plans">
        <p className="planner-empty">No completed print plans have been saved yet.</p>
      </Panel>
    );
  }

  const recommendations = getPrintPlanRecommendations(plan);
  const totalToPrint = recommendations.reduce(
    (sum, recommendation) => sum + recommendation.totalRecommendedQuantity,
    0,
  );
  const businessItems = plan.items.filter((item) => item.businessId === selectedBusinessId);

  return (
    <>
      <div className="planner-history-bar">
        <label>
          <span>Saved plan</span>
          <select
            className="table-input"
            onChange={(event) => onPlanChange(Number(event.target.value))}
            value={plan.id}
          >
            {plans.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.id} · {formatDate(item.planDate)} · {item.items.length} counts
              </option>
            ))}
          </select>
        </label>
        <span>Sales window {formatDate(plan.windowStart)}–{formatDate(plan.windowEnd)}</span>
      </div>

      <div className="metric-grid">
        <MetricPanel detail="combined across businesses" label="Units to Print" tone={totalToPrint > 0 ? "warning" : "success"} value={totalToPrint} />
        <MetricPanel detail="ranked printable products" label="Print Queue" value={recommendations.length} />
        <MetricPanel detail="all stocked product counts" label="Counted Rows" value={plan.items.length} />
        <MetricPanel detail={`algorithm version ${plan.algorithmVersion}`} label="Plan Date" value={formatDate(plan.planDate)} />
      </div>

      {plan.warnings.length > 0 ? (
        <PlannerCallout tone="warning" title="Data Quality">
          <ul className="planner-warning-list">
            {plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </PlannerCallout>
      ) : null}

      <Panel actions={<Badge tone={recommendations.length > 0 ? "warning" : "success"}>{recommendations.length} products</Badge>} title="Print Next">
        <div className="planner-table planner-table--queue">
          <DataTable
            columns={["Priority", "Product", "Print", "Business Allocation", "28-Day Units", "Lowest Coverage"]}
            columnsTemplate="80px minmax(240px, 1.2fr) 100px minmax(240px, 1fr) 110px 130px"
            emptyMessage="Every product with sales history meets its 14-day target. Nothing needs printing."
            minimumWidth="960px"
            rows={recommendations.map((recommendation, index) => [
              <Badge key={`${recommendation.productId}-rank`} tone={index === 0 ? "danger" : "warning"}>#{index + 1}</Badge>,
              <strong key={`${recommendation.productId}-name`}>{recommendation.productName}</strong>,
              <strong className="planner-print-quantity" key={`${recommendation.productId}-qty`}>
                {recommendation.totalRecommendedQuantity} {pluralize(recommendation.saleUnit, recommendation.totalRecommendedQuantity)}
              </strong>,
              recommendation.allocations.map((allocation) => `${allocation.businessName} ${allocation.quantity}`).join(" · "),
              recommendation.totalUnitsSold,
              formatDays(recommendation.minimumDaysOfStock),
            ])}
          />
        </div>
      </Panel>

      <Panel title="Business Breakdown">
        <div className="planner-toolbar planner-toolbar--count">
          <SegmentedFilter
            label="Plan business breakdown"
            onChange={(value) => onBusinessChange(value as PrintPlannerBusinessId)}
            options={PRINT_PLANNER_BUSINESSES.map((business) => ({
              active: business.id === selectedBusinessId,
              label: business.label,
              value: business.id,
            }))}
          />
        </div>
        <BusinessBreakdownTable items={businessItems} />
      </Panel>

      <Panel title="Plan History">
        <PlanHistoryTable onSelect={onPlanChange} plans={plans} selectedPlanId={plan.id} />
      </Panel>
    </>
  );
}

function BusinessBreakdownTable({ items }: { readonly items: readonly PrintPlanItem[] }) {
  return (
    <div className="planner-table planner-table--breakdown">
      <DataTable
        columns={["Product", "Count", "28-Day Sales", "14-Day Target", "Print", "Status"]}
        columnsTemplate="minmax(260px, 1fr) 90px 110px 110px 90px 130px"
        emptyMessage="No products were stocked at this business when the plan was created."
        minimumWidth="850px"
        rows={items.map((item) => [
          <strong key={`${item.businessId}-${item.productName}-name`}>{item.productName}</strong>,
          item.inventoryCount,
          item.unitsSold,
          item.targetQuantity,
          item.recommendedQuantity,
          <Badge
            key={`${item.businessId}-${item.productName}-status`}
            tone={item.status === "print" ? "warning" : item.status === "covered" ? "success" : "neutral"}
          >
            {item.status === "print" ? "Print" : item.status === "covered" ? "Covered" : "No history"}
          </Badge>,
        ])}
      />
    </div>
  );
}

function PlanHistoryTable({
  onSelect,
  plans,
  selectedPlanId = null,
}: {
  readonly onSelect: (id: number) => void;
  readonly plans: readonly PrintPlan[];
  readonly selectedPlanId?: number | null;
}) {
  return (
    <div className="planner-table planner-table--history">
      <DataTable
        columns={["Plan", "Date", "Counted Rows", "Units to Print", "Warnings"]}
        columnsTemplate="100px 160px 120px 120px 100px"
        emptyMessage="No completed print plans have been saved yet."
        minimumWidth="650px"
        onRowClick={(index) => {
          const plan = plans[index];
          if (plan) onSelect(plan.id);
        }}
        rows={plans.map((plan) => [
          <strong key={`${plan.id}-id`}>#{plan.id}</strong>,
          formatDate(plan.planDate),
          plan.items.length,
          plan.items.reduce((sum, item) => sum + item.recommendedQuantity, 0),
          plan.warnings.length,
        ])}
        selectedRowIndex={plans.findIndex((plan) => plan.id === selectedPlanId)}
      />
    </div>
  );
}

function PlannerCallout({
  children,
  title,
  tone,
}: {
  readonly children: ReactNode;
  readonly title: string;
  readonly tone: "success" | "warning";
}) {
  return (
    <div className={tone === "warning" ? "callout callout--warning" : "callout"}>
      <Badge tone={tone}>{title}</Badge>
      <div>{children}</div>
    </div>
  );
}

function countKey(productId: number, businessId: PrintPlannerBusinessId): string {
  return `${businessId}:${productId}`;
}

function sanitizeCountInput(value: string): string {
  if (value === "") return "";
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? String(parsed) : value;
}

function isValidCountValue(value: string | undefined): boolean {
  if (value == null || value.trim() === "") return false;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0;
}

function normalizeIdentity(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function todayInputValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDays(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} days`;
}

function pluralize(unit: string, quantity: number): string {
  if (quantity === 1) return unit;
  if (unit === "piece") return "pieces";
  if (unit === "pair") return "pairs";
  return `${unit}s`;
}

function formatError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.toLocaleLowerCase().includes("invoke")) {
    return "Print Planner requires the desktop app database. Open this page in the Tauri app.";
  }
  return error instanceof Error ? error.message : fallback;
}
