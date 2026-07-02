import { Page } from "@/components/layout/Page";
import { Badge, MetricPanel, Panel } from "@/components/ui";

const inventoryAreas = [
  {
    description: "Spool color, TD, grams left, status, cost, and low-stock thresholds.",
    href: "#/inventory/filaments",
    label: "Filament Inventory",
    meta: "Spools / TD / grams",
    tone: "success" as const,
  },
  {
    description: "Hardware, packaging, parts, unit costs, supplier notes, and low-stock status.",
    href: "#/inventory/add-ons",
    label: "Add-ons & Hardware",
    meta: "Parts / packaging",
    tone: "warning" as const,
  },
  {
    description: "Ready and reserved home stock for finished products, with adjustment history.",
    href: "#/inventory/finished-goods",
    label: "Finished Goods",
    meta: "Home stock only",
    tone: "success" as const,
  },
] as const;

export function InventoryPage() {
  return (
    <Page
      description="Choose an inventory workspace for material stock, hardware, or ready-to-sell finished goods."
      meta={["Repository backed", "Manual adjustments", "Home stock only"]}
      title="Inventory"
    >
      <div className="metric-grid">
        <MetricPanel detail="filament / add-ons / goods" label="Stock Areas" value="3" />
        <MetricPanel detail="tracked in app" label="Home Stock" tone="success" value="Active" />
        <MetricPanel detail="low-stock helpers" label="Alerts" tone="warning" value="Local" />
        <MetricPanel detail="not tracked here" label="Cafe Stock" value="External" />
      </div>

      <Panel title="Inventory Workspaces">
        <div className="inventory-entry-grid">
          {inventoryAreas.map((area) => (
            <a className="inventory-entry-card" href={area.href} key={area.href}>
              <Badge tone={area.tone}>{area.meta}</Badge>
              <strong>{area.label}</strong>
              <span>{area.description}</span>
            </a>
          ))}
        </div>
      </Panel>
    </Page>
  );
}
