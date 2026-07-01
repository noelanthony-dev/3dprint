import { FeatureScaffold } from "@/components/layout/FeatureScaffold";

export function BackupPage() {
  return (
    <FeatureScaffold
      description="Placeholder for manual backup, export, and import workflows using Tauri file-system and dialog plugins later."
      focus={["Manual database backup", "CSV export", "Restore validation"]}
      metrics={[
        { label: "Backup Mode", value: "Manual", tone: "success" },
        { label: "Cloud Sync", value: "Never" },
        { label: "Plugin Phase", value: "Later" },
      ]}
      title="Backup / Export / Import"
    />
  );
}
