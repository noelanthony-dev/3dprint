import { FeatureScaffold } from "@/components/layout/FeatureScaffold";

export function FinishedGoodsInventoryPage() {
  return (
    <FeatureScaffold
      description="Placeholder for finished product stock held at home and later production-to-inventory movement."
      focus={["Ready-to-sell home stock", "Manual adjustments", "Production output later"]}
      metrics={[
        { label: "Cafe Stock", value: "Excluded", tone: "success" },
        { label: "Sale Units", value: "Flexible" },
        { label: "Automation", value: "Later" },
      ]}
      title="Finished Goods Inventory"
    />
  );
}
