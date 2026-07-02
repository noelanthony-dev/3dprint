import { describe, expect, it } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@/domain/settings";

import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  createBackupEnvelope,
  decodeBase64ToBytes,
  encodeBytesToBase64,
  hasSqliteHeader,
  validateBackupEnvelope,
  validateSettingsImport,
} from "./index";

const sqliteBytes = new TextEncoder().encode("SQLite format 3\u0000test-body");

describe("backup domain", () => {
  it("creates backup metadata with the expected app format", () => {
    const envelope = createBackupEnvelope({
      appVersion: "0.1.0",
      createdAt: "2026-07-02T00:00:00.000Z",
      databaseBase64: encodeBytesToBase64(sqliteBytes),
      databaseBytes: sqliteBytes,
      databasePath: "printops-studio.db",
      settings: DEFAULT_APP_SETTINGS,
    });

    expect(envelope.metadata).toMatchObject({
      appName: "PrintOps Studio",
      databaseBytes: sqliteBytes.byteLength,
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      settingsIncluded: true,
    });
  });

  it("validates backup envelopes and SQLite headers", () => {
    const envelope = createBackupEnvelope({
      appVersion: "0.1.0",
      createdAt: "2026-07-02T00:00:00.000Z",
      databaseBase64: encodeBytesToBase64(sqliteBytes),
      databaseBytes: sqliteBytes,
      databasePath: "printops-studio.db",
      settings: DEFAULT_APP_SETTINGS,
    });

    expect(hasSqliteHeader(sqliteBytes)).toBe(true);
    expect(validateBackupEnvelope(envelope)).toMatchObject({
      errors: [],
      valid: true,
    });
    expect(decodeBase64ToBytes(envelope.databaseBase64)).toEqual(sqliteBytes);
  });

  it("rejects unsupported or unsafe backup imports", () => {
    const invalid = validateBackupEnvelope({
      databaseBase64: encodeBytesToBase64(new TextEncoder().encode("not sqlite")),
      metadata: {
        appName: "PrintOps Studio",
        appVersion: "0.1.0",
        createdAt: "2026-07-02T00:00:00.000Z",
        databaseBytes: 10,
        databasePath: "printops-studio.db",
        format: "other",
        formatVersion: 99,
        settingsIncluded: true,
      },
      settings: DEFAULT_APP_SETTINGS,
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain("Backup format is not a PrintOps Studio backup.");
    expect(invalid.errors).toContain("Backup format version 99 is not supported.");
    expect(invalid.errors).toContain("Backup database payload is not a SQLite database.");
  });

  it("validates settings-only imports", () => {
    expect(validateSettingsImport(DEFAULT_APP_SETTINGS).valid).toBe(true);
    expect(
      validateSettingsImport({
        ...DEFAULT_APP_SETTINGS,
        hueForgeAcceptableDeltaE: 0,
      }).valid,
    ).toBe(false);
  });
});
