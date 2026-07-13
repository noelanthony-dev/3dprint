# MVP Readiness Report

Review date: 2026-07-02

## Status

MVP-ready for local development and debug `.app` packaging, with one remaining packaging issue for DMG output.

## What Passed

- Frontend typecheck passed with `npm run typecheck`.
- Unit tests passed with `npm run test`: 27 test files, 96 tests.
- Frontend production build passed with `npm run build`.
- Cargo native check passed with `cargo check` in `src-tauri`.
- Tauri CLI check passed with `npm run tauri -- --version`.
- Native debug app bundle passed with `npm run tauri -- build --debug --bundles app`.
- Browser smoke QA passed for dashboard, production navigation, settings, backup, invalid-route recovery after reload, and compact inventory layout.
- Startup build output still keeps feature routes code-split into lazy chunks.
- Dependency review remains small: React, Tauri API/plugins, Vite, TypeScript, and Vitest only.

## Remaining Issue

- Full debug packaging with `npm run tauri -- build --debug` compiles the app and creates the macOS `.app`, then fails during DMG creation in Tauri's generated `bundle_dmg.sh`.
- The same DMG failure reproduced outside the sandbox. The helper reports only `failed to run .../bundle_dmg.sh`, without a lower-level `hdiutil` or script error.
- Confirmed working package artifact: `src-tauri/target/debug/bundle/macos/3D Print Business Manager.app`.

## Phase 15 Polish Completed

- Added keyboard skip-link support and visible focus styling.
- Wired topbar quick actions to Sales and Production routes.
- Replaced stale scaffold/placeholder wording in route metadata, page defaults, sidebar status, dashboard copy, and the inventory landing route.
- Reworked the Inventory landing page into three implemented workspace entry cards.
- Added accessible empty table output for empty data sets.
- Added horizontal scrolling for dense tables on compact widths.
- Added database client tests for the native facade and command routing; native tests cover migrations, serialization, rollback, and backup snapshots.
- Added route metadata tests to guard against stale placeholder language.

## MVP Constraints Preserved

- No cloud services.
- No authentication.
- No Firebase.
- No automatic sync.
- No background backup jobs.
- No heavy UI, table, charting, or global-state dependencies.
