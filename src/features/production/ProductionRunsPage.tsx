import { FeatureScaffold } from "@/components/layout/FeatureScaffold";

export function ProductionRunsPage() {
  return (
    <FeatureScaffold
      description="Placeholder for logging production runs, expected pieces, good pieces, failed pieces, and simple failure notes."
      focus={["Expected/good/failed pieces", "Failure notes", "Inventory deduction later"]}
      metrics={[
        { label: "Runs Logged", value: "--" },
        { label: "Deduction", value: "Later" },
        { label: "Manual Fixes", value: "Planned", tone: "success" },
      ]}
      title="Production Runs"
    />
  );
}
