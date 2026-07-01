import { FeatureScaffold } from "@/components/layout/FeatureScaffold";

export function CostingPage() {
  return (
    <FeatureScaffold
      description="Placeholder for print profiles, material usage, add-ons, pricing inputs, and costing outputs."
      focus={["Print profile inputs", "Pure costing formulas", "Pricing guidance"]}
      metrics={[
        { label: "Formula Layer", value: "Domain" },
        { label: "UI Inputs", value: "Later" },
        { label: "Tests", value: "Required", tone: "success" },
      ]}
      title="Print Profiles & Costing"
    />
  );
}
