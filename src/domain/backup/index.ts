import type { AppSettings } from "@/domain/settings";
import { normalizeAppSettings, validateAppSettings } from "@/domain/settings";
import { createScaffoldModuleStatus } from "@/domain/shared";

export const BACKUP_FORMAT = "printops-studio.backup";
export const BACKUP_FORMAT_VERSION = 1;
export const SQLITE_FILE_HEADER = "SQLite format 3\u0000";

export interface BackupMetadata {
  readonly appName: "PrintOps Studio";
  readonly appVersion: string;
  readonly createdAt: string;
  readonly databaseBytes: number;
  readonly databasePath: string;
  readonly format: typeof BACKUP_FORMAT;
  readonly formatVersion: typeof BACKUP_FORMAT_VERSION;
  readonly settingsIncluded: boolean;
}

export interface BackupEnvelope {
  readonly databaseBase64: string;
  readonly metadata: BackupMetadata;
  readonly settings: AppSettings;
}

export interface BackupValidationResult {
  readonly errors: readonly string[];
  readonly metadata: BackupMetadata | null;
  readonly settings: AppSettings | null;
  readonly valid: boolean;
  readonly warnings: readonly string[];
}

export function createBackupEnvelope(input: {
  readonly appVersion: string;
  readonly createdAt: string;
  readonly databaseBase64: string;
  readonly databaseBytes: Uint8Array;
  readonly databasePath: string;
  readonly settings: AppSettings;
}): BackupEnvelope {
  return {
    databaseBase64: input.databaseBase64,
    metadata: {
      appName: "PrintOps Studio",
      appVersion: input.appVersion,
      createdAt: input.createdAt,
      databaseBytes: input.databaseBytes.byteLength,
      databasePath: input.databasePath,
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      settingsIncluded: true,
    },
    settings: input.settings,
  };
}

export function validateBackupEnvelope(value: unknown): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObjectRecord(value)) {
    return {
      errors: ["Backup file must contain a JSON object."],
      metadata: null,
      settings: null,
      valid: false,
      warnings,
    };
  }

  const metadata = isObjectRecord(value.metadata) ? parseMetadata(value.metadata) : null;

  if (!metadata) {
    errors.push("Backup metadata is missing or invalid.");
  } else {
    if (metadata.format !== BACKUP_FORMAT) {
      errors.push("Backup format is not a PrintOps Studio backup.");
    }

    if (metadata.formatVersion !== BACKUP_FORMAT_VERSION) {
      errors.push(`Backup format version ${metadata.formatVersion} is not supported.`);
    }

    if (metadata.databaseBytes <= 0) {
      errors.push("Backup metadata reports an empty database.");
    }
  }

  if (typeof value.databaseBase64 !== "string" || value.databaseBase64.trim().length === 0) {
    errors.push("Backup database payload is missing.");
  } else {
    const databaseBytes = decodeBase64ToBytes(value.databaseBase64);

    if (databaseBytes.length === 0) {
      errors.push("Backup database payload could not be decoded.");
    } else if (!hasSqliteHeader(databaseBytes)) {
      errors.push("Backup database payload is not a SQLite database.");
    } else if (metadata && databaseBytes.byteLength !== metadata.databaseBytes) {
      warnings.push("Backup metadata byte count does not match the database payload.");
    }
  }

  const settings = normalizeAppSettings(value.settings);
  const settingsValidation = validateAppSettings(settings);

  if (!settingsValidation.valid) {
    errors.push("Backup settings contain invalid values.");
  }

  return {
    errors,
    metadata,
    settings,
    valid: errors.length === 0,
    warnings,
  };
}

export function validateSettingsImport(value: unknown): BackupValidationResult {
  const settings = normalizeAppSettings(value);
  const settingsValidation = validateAppSettings(settings);
  const errors = Object.values(settingsValidation.errors).filter(Boolean);

  return {
    errors,
    metadata: null,
    settings,
    valid: errors.length === 0,
    warnings: [],
  };
}

export function hasSqliteHeader(bytes: Uint8Array): boolean {
  const header = new TextEncoder().encode(SQLITE_FILE_HEADER);

  if (bytes.byteLength < header.byteLength) {
    return false;
  }

  return header.every((byte, index) => bytes[index] === byte);
}

export function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function decodeBase64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return new Uint8Array();
  }
}

function parseMetadata(value: Record<string, unknown>): BackupMetadata | null {
  if (
    value.appName !== "PrintOps Studio" ||
    typeof value.appVersion !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.databaseBytes !== "number" ||
    typeof value.databasePath !== "string" ||
    typeof value.format !== "string" ||
    typeof value.formatVersion !== "number" ||
    typeof value.settingsIncluded !== "boolean"
  ) {
    return null;
  }

  return {
    appName: "PrintOps Studio",
    appVersion: value.appVersion,
    createdAt: value.createdAt,
    databaseBytes: value.databaseBytes,
    databasePath: value.databasePath,
    format: value.format as typeof BACKUP_FORMAT,
    formatVersion: value.formatVersion as typeof BACKUP_FORMAT_VERSION,
    settingsIncluded: value.settingsIncluded,
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const backupDomainStatus = createScaffoldModuleStatus({
  layer: "domain",
  name: "backup",
  notes: ["Backup envelope metadata, SQLite validation, and settings import validation."],
});
