import { useState } from "react";

import { Page } from "@/components/layout/Page";
import { Badge, MetricPanel, Panel, ToolbarButton } from "@/components/ui";
import { localSettingsRepository } from "@/data/settings/localSettingsRepository";
import type { BackupMetadata } from "@/domain/backup";
import {
  createLocalBackup,
  exportSettingsFile,
  importSettingsFile,
  restoreLocalBackup,
} from "@/infrastructure/backup";

type BackupStatusTone = "neutral" | "success" | "warning" | "danger";

interface BackupStatus {
  readonly message: string;
  readonly metadata: BackupMetadata | null;
  readonly tone: BackupStatusTone;
  readonly warnings: readonly string[];
}

export function BackupPage() {
  const [isWorking, setIsWorking] = useState(false);
  const [restorePhrase, setRestorePhrase] = useState("");
  const [status, setStatus] = useState<BackupStatus>({
    message: "No backup action has run in this session.",
    metadata: null,
    tone: "neutral",
    warnings: [],
  });

  async function runBackupAction(action: () => Promise<BackupStatus>): Promise<void> {
    setIsWorking(true);

    try {
      setStatus(await action());
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        metadata: null,
        tone: "danger",
        warnings: [],
      });
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <Page
      actions={
        <>
          <ToolbarButton
            disabled={isWorking}
            onClick={() =>
              void runBackupAction(async () => {
                const result = await createLocalBackup(localSettingsRepository.load());

                return {
                  message: result.message,
                  metadata: result.metadata,
                  tone: result.canceled ? "neutral" : "success",
                  warnings: result.warnings,
                };
              })
            }
            tone="primary"
          >
            Create Backup
          </ToolbarButton>
        </>
      }
      description="Create, export, and restore local-only backup files with explicit file dialogs and validation."
      meta={["Manual only", "Tauri dialog/fs", "No cloud sync"]}
      title="Backup / Export / Import"
    >
      <div className="metric-grid">
        <MetricPanel detail="user-triggered" label="Backup Mode" tone="success" value="Manual" />
        <MetricPanel detail="JSON envelope" label="Backup Format" value="v1" />
        <MetricPanel detail="remote storage" label="Cloud Sync" tone="success" value="None" />
        <MetricPanel detail={status.tone === "danger" ? "review required" : "current session"} label="Last Action" tone={status.tone === "danger" ? "danger" : "default"} value={status.tone} />
      </div>

      <div className="content-grid content-grid--costing">
        <div className="side-stack">
          <Panel title="Data Backup and Export">
            <div className="callout callout--warning">
              <Badge tone="warning">Local Only</Badge>
              <p>Backups are explicit files you choose and secure yourself. No automatic sync or background backup job is enabled.</p>
            </div>
            <div className="table-actions">
              <button
                disabled={isWorking}
                onClick={() =>
                  void runBackupAction(async () => {
                    const result = await createLocalBackup(localSettingsRepository.load());

                    return {
                      message: result.message,
                      metadata: result.metadata,
                      tone: result.canceled ? "neutral" : "success",
                      warnings: result.warnings,
                    };
                  })
                }
                type="button"
              >
                Create Local Backup
              </button>
              <button
                disabled={isWorking}
                onClick={() =>
                  void runBackupAction(async () => {
                    const result = await exportSettingsFile(localSettingsRepository.load());

                    return {
                      message: result.message,
                      metadata: result.metadata,
                      tone: result.canceled ? "neutral" : "success",
                      warnings: result.warnings,
                    };
                  })
                }
                type="button"
              >
                Export Settings
              </button>
            </div>
          </Panel>

          <Panel title="Restore / Import Safety">
            <div className="inventory-form">
              <label className="form-field" data-wide="true">
                <span>Restore Confirmation</span>
                <input
                  onChange={(event) => setRestorePhrase(event.target.value)}
                  placeholder="Type RESTORE to enable full backup restore"
                  type="text"
                  value={restorePhrase}
                />
              </label>
            </div>
            <div className="table-actions">
              <button
                disabled={isWorking || restorePhrase !== "RESTORE"}
                onClick={() =>
                  void runBackupAction(async () => {
                    const result = await restoreLocalBackup();

                    if (result.settings) {
                      localSettingsRepository.save(result.settings);
                    }

                    return {
                      message: result.message,
                      metadata: result.metadata,
                      tone: result.canceled ? "neutral" : "warning",
                      warnings: result.warnings,
                    };
                  })
                }
                type="button"
              >
                Restore Full Backup
              </button>
              <button
                disabled={isWorking}
                onClick={() =>
                  void runBackupAction(async () => {
                    const result = await importSettingsFile();

                    if (result.settings) {
                      localSettingsRepository.save(result.settings);
                    }

                    return {
                      message: result.message,
                      metadata: null,
                      tone: result.canceled ? "neutral" : "success",
                      warnings: [],
                    };
                  })
                }
                type="button"
              >
                Import Settings
              </button>
            </div>
          </Panel>
        </div>

        <div className="side-stack">
          <Panel title="Action Status">
            <div className={status.tone === "danger" ? "callout callout--warning" : "callout"}>
              <Badge tone={status.tone === "neutral" ? "neutral" : status.tone}>{status.tone}</Badge>
              <p>{status.message}</p>
            </div>
            {status.warnings.map((warning) => (
              <div className="callout callout--warning" key={warning}>
                <Badge tone="warning">Warning</Badge>
                <p>{warning}</p>
              </div>
            ))}
          </Panel>

          <Panel title="Last Backup Metadata">
            {status.metadata ? (
              <div className="key-value-list">
                <span>Created</span>
                <strong>{formatDate(status.metadata.createdAt)}</strong>
                <span>App version</span>
                <strong>{status.metadata.appVersion}</strong>
                <span>Format</span>
                <strong>{status.metadata.formatVersion}</strong>
                <span>Database</span>
                <strong>{formatBytes(status.metadata.databaseBytes)}</strong>
                <span>Settings</span>
                <strong>{status.metadata.settingsIncluded ? "Included" : "Missing"}</strong>
              </div>
            ) : (
              <div className="empty-state">
                <p>Create or restore a backup to show metadata for this session.</p>
              </div>
            )}
          </Panel>

          <Panel title="Restore Checks">
            <div className="warning-list">
              <div className="callout">
                <Badge tone="success">Validate</Badge>
                <p>Import checks the PrintOps backup format, version, SQLite header, byte count, and settings ranges.</p>
              </div>
              <div className="callout callout--warning">
                <Badge tone="warning">Restart</Badge>
                <p>After a full database restore, restart the app before continuing work so open SQLite handles reload cleanly.</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
