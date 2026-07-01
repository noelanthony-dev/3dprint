import { Page } from "@/components/layout/Page";
import { Badge, DataTable, MetricPanel, Panel, ProgressBar, ToolbarButton } from "@/components/ui";

export function ProductLibraryPage() {
  return (
    <Page
      actions={
        <>
          <ToolbarButton>Check HueForge</ToolbarButton>
          <ToolbarButton tone="primary">Add Product</ToolbarButton>
        </>
      }
      description="Placeholder for the design library, product catalog, author links, categories, and optional image references."
      title="Design Library"
    >
      <div className="metric-grid">
        <MetricPanel detail="future records" label="Designs" value="--" />
        <MetricPanel detail="warning only" label="License Flags" tone="warning" value="--" />
        <MetricPanel detail="optional" label="Images" value="1 field" />
        <MetricPanel detail="piece/set/pair/pack" label="Sale Units" tone="success" value="Ready" />
      </div>

      <div className="content-grid content-grid--split">
        <Panel title="Product Catalog">
          <DataTable
            columns={["Product", "Source", "Unit", "Status"]}
            columnsTemplate="minmax(170px, 1.5fr) 0.8fr 0.55fr minmax(120px, 0.9fr)"
            footer="Static catalog rows; product CRUD is planned for a later phase."
            rows={[
              ["Red Blossom Bookmark", "Printables", "Piece", <Badge tone="success">Visual sample</Badge>],
              ["Water Clicker", "MakerWorld", "Piece", <Badge>Placeholder</Badge>],
              ["Hex Wall Planter", "Thingiverse", "Pack", <Badge tone="warning">License note</Badge>],
            ]}
          />
        </Panel>

        <Panel title="Selected Item Preview">
          <div className="preview-card">
            <div className="preview-card__image">IMG</div>
            <h2>Red Blossom Bookmark</h2>
            <p>
              Future product detail area for author, source, license warnings,
              recipe references, and one optional image.
            </p>
            <ProgressBar label="Current stock placeholder" value={42} />
            <div className="status-grid">
              <span>
                <Badge tone="warning">Warning</Badge>
                Commercial license message only
              </span>
              <span>
                <Badge>Source</Badge>
                Link saved later
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </Page>
  );
}
