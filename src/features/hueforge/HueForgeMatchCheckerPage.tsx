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
              <input disabled placeholder="Designer handle" />
            </label>
            <label>
              <span>Notes</span>
              <textarea disabled placeholder="Layer swaps and feasibility notes later." />
            </label>
          </div>
        </Panel>

        <Panel title="Required Filaments" actions={<Badge>4 colors</Badge>}>
          <DataTable
            columns={["Role", "Color", "TD", "Swap"]}
            columnsTemplate="0.9fr minmax(170px, 1.6fr) 0.5fr 0.75fr"
            rows={[
              ["Base", <Swatch color="#1a1a1a" label="Black PLA" />, "0.6", "L0-L12"],
              ["Midtone 1", <Swatch color="#8a2be2" label="Purple PETG" />, "2.4", "L13-L18"],
              ["Midtone 2", <Swatch color="#ff1493" label="Magenta PLA+" />, "4.1", "L19-L24"],
              ["Highlight", <Swatch color="#00ffff" label="Cyan PLA" />, "6.8", "L25-L30"],
            ]}
          />
        </Panel>

        <Panel title="Inventory Matches" actions={<Badge tone="success">Preview</Badge>}>
          <div className="match-list">
            <div className="match-card">
              <Swatch color="#101010" label="Sunlu PLA Matte Black" />
              <Badge tone="success">Excellent</Badge>
              <span>TD and stock checks are future domain logic.</span>
            </div>
            <div className="match-card">
              <Swatch color="#8a2be2" label="Elegoo Deep Purple" />
              <Badge tone="success">Good sub</Badge>
              <span>Perceptual color matching comes later.</span>
            </div>
            <div className="match-card">
              <Swatch color="#ff4ba3" label="Overture PLA Pink" />
              <Badge tone="warning">Test first</Badge>
              <span>Feasibility warning placeholder only.</span>
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
