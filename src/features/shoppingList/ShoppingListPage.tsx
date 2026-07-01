import { FeatureScaffold } from "@/components/layout/FeatureScaffold";

export function ShoppingListPage() {
  return (
    <FeatureScaffold
      description="Placeholder for missing HueForge filaments, low-stock add-ons, and manual purchase planning."
      focus={["Manual procurement items", "Missing HueForge filaments", "Low-stock add-ons"]}
      metrics={[
        { label: "Suggestions", value: "Later" },
        { label: "Purchasing", value: "Manual", tone: "success" },
        { label: "External APIs", value: "None" },
      ]}
      title="Shopping List"
    />
  );
}
