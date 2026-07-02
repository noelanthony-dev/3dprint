import { closeDatabase, PRINTOPS_DB_PATH } from "@/data/db/client";
import {
  createBackupEnvelope,
  decodeBase64ToBytes,
  encodeBytesToBase64,
  validateBackupEnvelope,
  validateSettingsImport,
  type BackupEnvelope,
  type BackupMetadata,
} from "@/domain/backup";
import type { AppSettings } from "@/domain/settings";
import { BaseDirectory, exists, readFile, readTextFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { open, save } from "@tauri-apps/plugin-dialog";

const APP_VERSION = "0.1.0";
const BACKUP_FILE_PREFIX = "printops-backup";
const SETTINGS_FILE_PREFIX = "printops-settings";
const DATABASE_FILE_NAME = "printops-studio.db";

export interface BackupActionResult {
  readonly canceled: boolean;
  readonly filePath: string | null;
  readonly metadata: BackupMetadata | null;
  readonly message: string;
  readonly warnings: readonly string[];
}

export interface SettingsImportResult {
  readonly canceled: boolean;
  readonly filePath: string | null;
  readonly message: string;
  readonly settings: AppSettings | null;
}

export async function createLocalBackup(settings: AppSettings): Promise<BackupActionResult> {
  const filePath = await save({
    defaultPath: `${BACKUP_FILE_PREFIX}-${timestampForFileName()}.json`,
    filters: [{ extensions: ["json"], name: "PrintOps backup" }],
    title: "Create PrintOps backup",
  });

  if (!filePath) {
    return canceledBackupResult("Backup canceled.");
  }

  const databaseExists = await exists(DATABASE_FILE_NAME, { baseDir: BaseDirectory.AppData });

  if (!databaseExists) {
    throw new Error("Local SQLite database file was not found. Open a persisted feature once before creating a full backup.");
  }

  const databaseBytes = await readFile(DATABASE_FILE_NAME, { baseDir: BaseDirectory.AppData });
  const envelope = createBackupEnvelope({
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    databaseBase64: encodeBytesToBase64(databaseBytes),
    databaseBytes,
    databasePath: PRINTOPS_DB_PATH,
    settings,
  });

  await writeTextFile(filePath, JSON.stringify(envelope, null, 2));

  return {
    canceled: false,
    filePath,
    metadata: envelope.metadata,
    message: `Backup created with ${formatBytes(envelope.metadata.databaseBytes)} of SQLite data.`,
    warnings: [],
  };
}

export async function restoreLocalBackup(): Promise<BackupActionResult & { readonly settings: AppSettings | null }> {
  const filePath = await chooseJsonFile("Select PrintOps backup");

  if (!filePath) {
    return {
      ...canceledBackupResult("Restore canceled."),
      settings: null,
    };
  }

  const envelope = await readBackupEnvelope(filePath);
  const validation = validateBackupEnvelope(envelope);

  if (!validation.valid || !validation.metadata || !validation.settings) {
    throw new Error(`Backup restore blocked: ${validation.errors.join(" ")}`);
  }

  await closeDatabase();
  await writeFile(DATABASE_FILE_NAME, decodeBase64ToBytes(envelope.databaseBase64), {
    baseDir: BaseDirectory.AppData,
  });

  return {
    canceled: false,
    filePath,
    metadata: validation.metadata,
    message: `Backup restored from ${formatBackupDate(validation.metadata.createdAt)}. Restart the app before continuing work.`,
    settings: validation.settings,
    warnings: validation.warnings,
  };
}

export async function exportSettingsFile(settings: AppSettings): Promise<BackupActionResult> {
  const filePath = await save({
    defaultPath: `${SETTINGS_FILE_PREFIX}-${timestampForFileName()}.json`,
    filters: [{ extensions: ["json"], name: "PrintOps settings" }],
    title: "Export PrintOps settings",
  });

  if (!filePath) {
    return canceledBackupResult("Settings export canceled.");
  }

  await writeTextFile(filePath, JSON.stringify(settings, null, 2));

  return {
    canceled: false,
    filePath,
    metadata: null,
    message: "Settings exported.",
    warnings: [],
  };
}

export async function importSettingsFile(): Promise<SettingsImportResult> {
  const filePath = await chooseJsonFile("Import PrintOps settings");

  if (!filePath) {
    return {
      canceled: true,
      filePath: null,
      message: "Settings import canceled.",
      settings: null,
    };
  }

  const rawJson = await readTextFile(filePath);
  const validation = validateSettingsImport(JSON.parse(rawJson));

  if (!validation.valid || !validation.settings) {
    throw new Error(`Settings import blocked: ${validation.errors.join(" ")}`);
  }

  return {
    canceled: false,
    filePath,
    message: "Settings imported and validated.",
    settings: validation.settings,
  };
}

async function readBackupEnvelope(filePath: string): Promise<BackupEnvelope> {
  const rawJson = await readTextFile(filePath);

  return JSON.parse(rawJson) as BackupEnvelope;
}

async function chooseJsonFile(title: string): Promise<string | null> {
  const filePath = await open({
    filters: [{ extensions: ["json"], name: "JSON files" }],
    multiple: false,
    title,
  });

  return typeof filePath === "string" ? filePath : null;
}

function canceledBackupResult(message: string): BackupActionResult {
  return {
    canceled: true,
    filePath: null,
    metadata: null,
    message,
    warnings: [],
  };
}

function formatBackupDate(value: string): string {
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

function timestampForFileName(): string {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

export const backupInfrastructureStatus = {
  automaticSyncEnabled: false,
  implementation: "tauri-dialog-fs",
  manualOnly: true,
} as const;
