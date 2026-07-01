import { Page } from "@/components/layout/Page";
import {
  Badge,
  DataTable,
  MetricPanel,
  Panel,
  ProgressBar,
  SearchField,
  SegmentedFilter,
  ToolbarButton,
} from "@/components/ui";

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
      <div className="screen-toolbar">
        <SearchField label="Design search" placeholder="Search design library..." />
        <SegmentedFilter
          label="Design status"
          options={[
            { active: true, label: "All" },
            { label: "Active" },
            { label: "Archived" },
          ]}
        />
      </div>

      <div className="metric-grid">
        <MetricPanel detail="sample catalog" label="Designs" value="142" />
        <MetricPanel detail="warning only" label="License Flags" tone="warning" value="3" />
        <MetricPanel detail="optional field" label="Images" value="1 each" />
        <MetricPanel detail="piece/set/pair/pack" label="Sale Units" tone="success" value="Ready" />
      </div>

      <div className="content-grid content-grid--split">
        <Panel title="Product Catalog">
          <DataTable
            columns={["Img", "Product Info", "Cost", "Price", "Margin", "Stock", "Status"]}
            columnsTemplate="56px minmax(190px, 1.8fr) 0.55fr 0.55fr 0.55fr 0.45fr 0.7fr"
            footer="Static catalog rows; product CRUD is planned for a later phase."
            rows={[
              [
                <span className="product-thumb product-thumb--flower">IMG</span>,
                <span className="row-title">
                  <strong>Red Blossom Bookmark</strong>
                  <small>Accessory / Printables / piece</small>
                </span>,
                "$0.32",
                "$4.99",
                <Badge tone="success">+93%</Badge>,
                "14",
                <Badge tone="success">Active</Badge>,
              ],
              [
                <span className="product-thumb">IMG</span>,
                <span className="row-title">
                  <strong>Water Clicker</strong>
                  <small>Clicker / MakerWorld / piece</small>
                </span>,
                "$0.45",
                "$8.00",
                <Badge tone="success">+94%</Badge>,
                "45",
                <Badge>Sample</Badge>,
              ],
              [
                <span className="product-thumb product-thumb--empty">IMG</span>,
                <span className="row-title">
                  <strong>Hex Wall Planter</strong>
                  <small>Decor / Thingiverse / pack</small>
                </span>,
                "$2.10",
                "$15.00",
                <Badge tone="success">+86%</Badge>,
                "0",
                <Badge tone="warning">Draft</Badge>,
              ],
            ]}
          />
        </Panel>

        <Panel title="Selected Item Preview">
          <div className="preview-card preview-card--product">
            <div className="preview-card__image preview-card__image--tall">SELECTED ITEM</div>
            <h2>Red Blossom Bookmark</h2>
            <div className="license-warning">
              <Badge tone="warning">Commercial license warning</Badge>
              <p>This sample warning mirrors future license guidance without enforcing a workflow.</p>
            </div>
            <p>
              Future product detail area for author, source, license warnings,
              recipe references, and one optional image.
            </p>
            <ProgressBar label="Current stock placeholder" value={42} />
            <div className="key-value-list">
              <span>Source</span>
              <strong>Printables</strong>
              <span>Sale Unit</span>
              <strong>Piece</strong>
              <span>Material Cost</span>
              <strong>$0.32</strong>
              <span>Est. Print Time</span>
              <strong>45m</strong>
            </div>
          </div>
        </Panel>
      </div>
    </Page>
  );
}
