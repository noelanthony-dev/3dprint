import { FeatureScaffold } from "@/components/layout/FeatureScaffold";

export function ExpensesPage() {
  return (
    <FeatureScaffold
      description="Placeholder for business expenses, memberships, commercial licenses, and subscriptions."
      focus={["Monthly subscriptions", "Commercial license warnings", "Business overhead"]}
      metrics={[
        { label: "License Blocks", value: "No", tone: "success" },
        { label: "Monthly View", value: "Planned" },
        { label: "Per-product Allocation", value: "No MVP" },
      ]}
      title="Expenses"
    />
  );
}
