import { FeatureScaffold } from "@/components/layout/FeatureScaffold";

export function AddOnsInventoryPage() {
  return (
    <FeatureScaffold
      description="Placeholder for add-ons, hardware, packaging materials, and low-stock tracking."
      focus={["Magnets and tassels", "Packaging", "Low-stock thresholds"]}
      metrics={[
        { label: "Units", value: "Flexible" },
        { label: "Costing Link", value: "Later" },
        { label: "Stock Alerts", value: "Planned", tone: "warning" },
      ]}
      title="Add-ons & Hardware"
    />
  );
}
