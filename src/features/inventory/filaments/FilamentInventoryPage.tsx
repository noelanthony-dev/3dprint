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
      <div className="screen-toolbar">
        <SearchField label="Spool search" placeholder="Scan or search..." />
        <SegmentedFilter
          label="Spool status"
          options={[
            { active: true, label: "All" },
            { label: "Open" },
            { label: "Low" },
            { label: "Sealed" },
          ]}
        />
      </div>

      <div className="metric-grid">
        <MetricPanel detail="sample rows" label="Total Spools" value="142" />
        <MetricPanel detail="<200g threshold later" label="Low Stock" tone="warning" value="4" />
        <MetricPanel detail="TD metadata" label="Avg TD" value="2.7" />
        <MetricPanel detail="manual overrides later" label="Adjustments" tone="success" value="Ready" />
      </div>

      <div className="content-grid content-grid--split">
        <Panel title="Spool Telemetry">
          <DataTable
            columns={["Clr", "Brand", "Mat", "Name", "TD", "Stock", "Cost/g", "Status"]}
            columnsTemplate="34px 0.65fr 0.6fr minmax(128px, 1.35fr) 0.35fr minmax(112px, 1fr) 0.55fr 0.6fr"
            density="dense"
            footer="Rows are static UI placeholders; inventory CRUD is not implemented."
            rows={[
              [
                <Swatch color="#f8f8f2" label="" />,
                "eSUN",
                <Badge tone="success">PLA+</Badge>,
                "Cold White",
                "2.1",
                <ProgressBar label="840g" value={84} />,
                "$0.021",
                <Badge tone="success">Open</Badge>,
              ],
              [
                <Swatch color="#ff7a00" label="" />,
                "Bambu",
                <Badge>PETG</Badge>,
                "Safety Orange",
                "3.5",
                <ProgressBar label="120g" tone="warning" value={12} />,
                "$0.025",
                <Badge tone="warning">Low</Badge>,
              ],
              [
                <Swatch color="#111111" label="" />,
                "Hatchbox",
                <Badge>PLA</Badge>,
                "True Black",
                "--",
                <ProgressBar label="1000g" value={100} />,
                "$0.019",
                <Badge>Sealed</Badge>,
              ],
            ]}
          />
        </Panel>

        <Panel title="Selected Spool">
          <div className="detail-stack">
            <div className="spool-card-head">
              <span className="spool-card-head__image">SPL</span>
              <div>
                <div className="spool-card-head__badges">
                  <Badge>eSUN</Badge>
                  <Badge tone="success">PLA+</Badge>
                </div>
                <strong>Cold White</strong>
                <span>ID: SPL-8924-WH</span>
              </div>
            </div>
            <div className="detail-stack__metric">
              <span>Current Weight</span>
              <strong>840g</strong>
            </div>
            <div className="key-value-list">
              <span>Transmission Distance</span>
              <strong>2.1</strong>
              <span>Hex Code</span>
              <strong>#f8f8f2</strong>
              <span>Cost / Gram</span>
              <strong>$0.021</strong>
              <span>Date Opened</span>
              <strong>sample</strong>
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
