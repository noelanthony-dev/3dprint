import { Page } from "@/components/layout/Page";
import { Badge, DataTable, MetricPanel, Panel, ProgressBar, Swatch, ToolbarButton } from "@/components/ui";

export function FilamentInventoryPage() {
  return (
    <Page
      actions={
        <>
          <ToolbarButton>Filter</ToolbarButton>
          <ToolbarButton tone="primary">Add Spool</ToolbarButton>
        </>
      }
      description="Placeholder for local filament stock, color metadata, TD values, low-stock warnings, and manual adjustments."
      title="Filament Inventory"
    >
      <div className="metric-grid">
        <MetricPanel detail="planned" label="Total Spools" value="--" />
        <MetricPanel detail="<200g threshold later" label="Low Stock" tone="warning" value="--" />
        <MetricPanel detail="TD metadata" label="Avg TD" value="--" />
        <MetricPanel detail="manual overrides later" label="Adjustments" tone="success" value="Ready" />
      </div>

      <div className="content-grid content-grid--split">
        <Panel title="Spool Telemetry">
          <DataTable
            columns={["Color", "Brand / Name", "Type", "Remaining", "Status"]}
            columnsTemplate="minmax(104px, 0.8fr) minmax(180px, 1.6fr) 0.65fr minmax(152px, 1.15fr) 0.75fr"
            footer="Rows are static UI placeholders; inventory CRUD is not implemented."
            rows={[
              [
                <Swatch color="#f0442f" label="Red" />,
                "Bambu Lab PLA Basic",
                <Badge>PLA</Badge>,
                <ProgressBar label="Red spool placeholder" value={84} />,
                <Badge tone="success">Open</Badge>,
              ],
              [
                <Swatch color="#ff7a00" label="Orange" />,
                "Bambu PETG Safety Orange",
                <Badge>PETG</Badge>,
                <ProgressBar label="Orange spool placeholder" tone="warning" value={12} />,
                <Badge tone="warning">Low</Badge>,
              ],
              [
                <Swatch color="#111111" label="Black" />,
                "Hatchbox True Black",
                <Badge>PLA</Badge>,
                <ProgressBar label="Black spool placeholder" value={100} />,
                <Badge>Sealed</Badge>,
              ],
            ]}
          />
        </Panel>

        <Panel title="Selected Spool">
          <div className="detail-stack">
            <Swatch color="#f8f8f2" label="Cold White PLA+" />
            <div className="detail-stack__metric">
              <span>Current Weight</span>
              <strong>--g</strong>
            </div>
            <div className="key-value-list">
              <span>Transmission Distance</span>
              <strong>planned</strong>
              <span>Hex Code</span>
              <strong>#ffffff</strong>
              <span>Cost / Gram</span>
              <strong>later</strong>
            </div>
            <div className="callout">
              <Badge>Notes</Badge>
              <p>Manual weight adjustment and stock history are future workflows.</p>
            </div>
          </div>
        </Panel>
      </div>
    </Page>
  );
}
