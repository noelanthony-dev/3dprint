import { FeatureScaffold } from "@/components/layout/FeatureScaffold";

export function SalesPage() {
  return (
    <FeatureScaffold
      description="Placeholder for future sales records, sale units, revenue tracking, and inventory movement."
      focus={["Sale units", "Channel notes", "Finished goods movement"]}
      metrics={[
        { label: "Units", value: "4" },
        { label: "Payments", value: "Manual" },
        { label: "Cloud", value: "None", tone: "success" },
      ]}
      title="Sales"
    />
  );
}
