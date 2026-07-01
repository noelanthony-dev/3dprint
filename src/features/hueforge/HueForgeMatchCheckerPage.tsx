import { Page } from "@/components/layout/Page";
import { Badge, DataTable, Panel, Swatch, ToolbarButton } from "@/components/ui";

export function HueForgeMatchCheckerPage() {
  return (
    <Page
      actions={
        <>
          <ToolbarButton>Add to Design Library</ToolbarButton>
          <ToolbarButton tone="primary">Add to Shopping List</ToolbarButton>
        </>
      }
      description="Placeholder for comparing HueForge filament requirements against owned filament inventory."
      title="HueForge Match Checker"
    >
      <div className="content-grid content-grid--hueforge">
        <Panel title="Design Input">
          <div className="mock-form">
            <label>
              <span>Design Name</span>
              <input disabled placeholder="Cyberpunk Cityscape" />
            </label>
            <label>
              <span>Author</span>
              <input disabled placeholder="NeonPrints3D" />
            </label>
            <label>
              <span>Category</span>
              <input disabled placeholder="Wall Art" />
            </label>
            <label>
              <span>Notes</span>
              <textarea disabled placeholder="Requires 0.08mm layer height for optimal blending." />
            </label>
          </div>
        </Panel>

        <Panel title="Required Filaments" actions={<Badge>4 colors</Badge>}>
          <DataTable
            columns={["Role", "Brand / Color", "TD", "g", "Swap"]}
            columnsTemplate="0.85fr minmax(170px, 1.5fr) 0.45fr 0.45fr 0.7fr"
            rows={[
              ["Base / Shadow", <Swatch color="#1a1a1a" label="Bambu PLA Basic Black" />, "0.6", "15.2", "L0-L12"],
              ["Midtone 1", <Swatch color="#8a2be2" label="Polymaker Purple" />, "2.4", "8.5", "L13-L18"],
              ["Midtone 2", <Swatch color="#ff1493" label="eSun PLA+ Magenta" />, "4.1", "4.2", "L19-L24"],
              ["Highlight", <Swatch color="#00ffff" label="Sunlu PLA Cyan" />, "6.8", "2.1", "L25-L30"],
            ]}
          />
        </Panel>

        <Panel title="Inventory Matches" actions={<Badge tone="success">Preview</Badge>}>
          <div className="match-list">
            <div className="match-card">
              <span className="match-card__arrow">-&gt;</span>
              <Swatch color="#101010" label="Sunlu PLA Matte Black" />
              <Badge tone="success">Excellent</Badge>
              <span className="match-card__copy">TD 0.5 / 840g in stock</span>
            </div>
            <div className="match-card">
              <span className="match-card__arrow">-&gt;</span>
              <Swatch color="#8a2be2" label="Elegoo Deep Purple" />
              <Badge tone="success">Good sub</Badge>
              <span className="match-card__copy">TD 2.8 / 320g in stock</span>
            </div>
            <div className="match-card">
              <span className="match-card__arrow">-&gt;</span>
              <Swatch color="#ff4ba3" label="Overture PLA Pink" />
              <Badge tone="warning">Test first</Badge>
              <span className="match-card__copy">TD variance warning</span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Feasibility Note">
        <div className="callout callout--warning">
          <Badge tone="warning">Needs test print</Badge>
          <p>
            Future HueForge matching will compare type, hex similarity,
            Delta E, TD closeness, and stock availability. This screen is
            presentation-only for now.
          </p>
        </div>
      </Panel>
    </Page>
  );
}
