import { FeatureScaffold } from "@/components/layout/FeatureScaffold";

export function InventoryPage() {
  return (
    <FeatureScaffold
      description="Placeholder for filament, add-on, hardware, and finished goods inventory entry points."
      focus={["Filament stock", "Add-ons and hardware", "Home finished goods"]}
      metrics={[
        { label: "Stock Areas", value: "3" },
        { label: "Home Stock", value: "Only", tone: "success" },
        { label: "Cafe Stock", value: "External" },
      ]}
      title="Inventory"
    />
  );
}
