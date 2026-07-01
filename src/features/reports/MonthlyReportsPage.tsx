import { FeatureScaffold } from "@/components/layout/FeatureScaffold";

export function MonthlyReportsPage() {
  return (
    <FeatureScaffold
      description="Placeholder for future monthly revenue, cost, expense, and inventory summary reports."
      focus={["Monthly revenue", "Expense summaries", "On-demand calculations"]}
      metrics={[
        { label: "Boot Work", value: "None", tone: "success" },
        { label: "Aggregation", value: "Domain" },
        { label: "Charts", value: "Not yet" },
      ]}
      title="Monthly Reports"
    />
  );
}
