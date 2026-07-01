import { FeatureScaffold } from "@/components/layout/FeatureScaffold";

export function SettingsPage() {
  return (
    <FeatureScaffold
      description="Placeholder for local-only app preferences and future database/file locations."
      focus={["Local preferences", "Threshold defaults", "Database location notes"]}
      metrics={[
        { label: "Login", value: "None", tone: "success" },
        { label: "Sync", value: "None" },
        { label: "Device", value: "Mac" },
      ]}
      title="Settings"
    />
  );
}
