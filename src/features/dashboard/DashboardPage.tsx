import { Page } from "@/components/layout/Page";
import { Badge, DataTable, MetricPanel, Panel, ToolbarButton } from "@/components/ui";

export function DashboardPage() {
  return (
    <Page
      actions={
        <>
          <ToolbarButton>Check HueForge</ToolbarButton>
          <ToolbarButton tone="primary">Add Run</ToolbarButton>
        </>
      }
      description="A lightweight landing page for future business snapshots, alerts, and recent activity."
      meta={["Offline mode", "Home stock", "Scaffold data"]}
      title="Today's Print Operations"
    >
      <div className="hero-panel">
        <div>
          <span className="hero-panel__kicker">Operational overview</span>
          <h2>PrintOps Studio command surface</h2>
          <p>
            Static placeholders mirror the future dashboard density without
            loading inventory, images, reports, or database work at startup.
          </p>
        </div>
        <div className="hero-panel__readouts">
          <span>
            <strong>0</strong>
            workflows live
          </span>
          <span>
            <strong>14</strong>
            modules planned
          </span>
        </div>
      </div>

      <div className="metric-grid">
        <MetricPanel detail="placeholder" label="Ready to Sell" tone="success" value="--" />
        <MetricPanel detail="future alert" label="Low Filaments" tone="warning" value="--" />
        <MetricPanel detail="library phase" label="Active Products" value="--" />
        <MetricPanel detail="reports phase" label="Month Profit" tone="success" value="--" />
      </div>

      <div className="content-grid content-grid--dashboard">
        <Panel title="Quick Actions">
          <div className="action-stack">
            <ToolbarButton tone="primary">Production Run</ToolbarButton>
            <ToolbarButton>Sale Entry</ToolbarButton>
            <ToolbarButton>Filament Intake</ToolbarButton>
            <ToolbarButton>HueForge Check</ToolbarButton>
          </div>
        </Panel>

        <Panel title="System Guardrails">
          <div className="status-grid">
            <span>
              <Badge tone="success">Offline</Badge>
              Local-only desktop
            </span>
            <span>
              <Badge tone="warning">Later</Badge>
              SQLite persistence
            </span>
            <span>
              <Badge>Lazy</Badge>
              Feature route loading
            </span>
          </div>
        </Panel>

        <Panel title="Recent Production Runs">
          <DataTable
            columns={["Job", "Product", "Qty", "Status"]}
            footer="Sample rows only; production logging is not implemented."
            rows={[
              ["PR-000", "Red Blossom Bookmark", "--", <Badge>Placeholder</Badge>],
              ["PR-000", "Tancho Koi Bookmark", "--", <Badge>Placeholder</Badge>],
              ["PR-000", "Geared Pen Holder", "--", <Badge>Placeholder</Badge>],
            ]}
          />
        </Panel>

        <Panel title="Products Worth Printing">
          <DataTable
            columns={["Product", "Material", "Signal"]}
            rows={[
              ["Red Blossom Bookmark", "PLA+", <Badge tone="success">Ready later</Badge>],
              ["Wall Planter", "PETG", <Badge>Needs recipe</Badge>],
              ["Clicker Shell", "ABS", <Badge tone="warning">Costing later</Badge>],
            ]}
          />
        </Panel>
      </div>
    </Page>
  );
}
