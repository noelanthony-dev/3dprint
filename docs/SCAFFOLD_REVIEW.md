# Scaffold Review

Review date: 2026-07-01

## 1. Overall Scaffold Status

Pass.

The scaffold is clean, lightweight, and aligned with the planned macOS-first offline Tauri + React + TypeScript architecture. Minor scaffold-level fixes were made during this review.

## 2. Commands Run and Results

- `npm install`: passed; updated `package-lock.json`, removed unnecessary DOM test packages, found 0 vulnerabilities.
- `npm run typecheck`: passed.
- `npm run test`: passed; 2 test files and 4 tests.
- `npm run build`: passed; Vite emitted separate lazy chunks for placeholder feature pages.
- `npm ls --depth=0`: passed; dependency set is small and does not include Redux, Zustand, Jotai, TanStack Table, charting libraries, Firebase, or UI frameworks.
- `npm run tauri -- --version`: passed; Tauri CLI is `2.11.4`.
- `rustc --version`: failed because Rust is not installed.
- `cargo --version`: failed because Cargo is not installed.

No `lint` or `format:check` scripts exist yet, so those commands were not run.

## 3. Folder Structure Review

Pass.

The scaffold matches the requested folder direction:

- `src/app` contains app bootstrap, routes, layout, providers, and navigation.
- `src/components` contains shared UI, form, feedback, and layout placeholders.
- `src/features` contains the planned feature folders, including inventory submodules.
- `src/domain` contains pure TypeScript placeholder modules for costing, HueForge, inventory, ledger, reports, pricing, and shared domain helpers.
- `src/data` contains database client, migration, schema, repository, and seed placeholders.
- `src/infrastructure` contains Tauri, files, images, and backup placeholders.
- `src/styles`, `src/test`, and `src/utils` exist.

## 4. Dependency Review

Pass.

Current direct dependencies are intentionally small:

- Runtime: `@tauri-apps/api`, `react`, `react-dom`
- Development: `@tauri-apps/cli`, React/Node types, Vite, Vitest, TypeScript, React plugin

No heavy UI framework, charting library, table library, global state library, Firebase package, cloud SDK, or SQLite plugin has been added prematurely.

## 5. TypeScript, Build, and Test Review

Pass.

TypeScript strict mode is enabled. The scaffold uses an `@/` path alias and route/domain smoke tests. The frontend build passes and confirms feature pages are code-split into small lazy chunks.

The native Tauri build was not run because Rust and Cargo are not installed in the local environment.

## 6. Performance Architecture Review

Pass.

- Feature pages are lazy-loaded.
- The sidebar and shell are simple.
- No images load at startup.
- No database work runs on app boot.
- No reports or business calculations run at startup.
- Shared components are small.
- No unnecessary global state exists.

## 7. Database Architecture Review

Pass.

SQLite direction, repository boundaries, migration location, and planned future tables are documented. Persistence is not implemented yet.

Searches found no raw SQL or query execution calls in React components or other scaffold code. The only SQL file is a documented scaffold-only migration note.

## 8. Feature Placeholder Review

Pass.

Placeholder pages, `index.ts` exports, and README files exist for:

- Dashboard
- Products
- HueForge
- Inventory
- Filament Inventory
- Add-ons & Hardware
- Finished Goods Inventory
- Costing
- Production Runs
- Sales
- Expenses
- Monthly Reports
- Shopping List
- Settings
- Backup / Export / Import

No real CRUD, forms, database tables, costing formulas, HueForge matching, production logic, sales logic, reports, or backup workflows were implemented.

## 9. Documentation Review

Pass.

The required documentation files exist and match the scaffold direction:

- `docs/ARCHITECTURE.md`
- `docs/PERFORMANCE.md`
- `docs/DATABASE.md`
- `docs/ROADMAP.md`
- `docs/CODEX_RULES.md`

HueForge future requirements are documented, including filament type, hex color similarity, perceptual Delta E/CIEDE2000 through Culori later, TD closeness, stock availability, and the future "Add to Design Library" flow.

## 10. Issues Found

- `jsdom` was included even though the current scaffold tests are pure TypeScript and do not need a DOM environment.
- `@types/node` was pinned to the Node 26 type line while the local runtime is Node 22.
- Tauri `devUrl` used `localhost` while the Vite dev server binds to `127.0.0.1`.
- The Tauri bundle identifier included a segment beginning with a number, which is avoidable in a scaffold.
- Rust/Cargo are missing locally, so native Tauri builds cannot run yet.

## 11. Fixes Made

- Removed the unnecessary `jsdom` dev dependency and Vitest DOM environment.
- Updated `@types/node` to the Node 22 type line.
- Updated Tauri `devUrl` to `http://127.0.0.1:1420`.
- Updated the Tauri identifier to `com.noel.printbusinessmanager`.
- Refreshed `package-lock.json`.

## 12. Remaining Recommendations

- Install Rust through rustup before running `npm run tauri:dev` or `npm run tauri:build`.
- Start Phase 2 with small filament inventory and add-ons slices only after scaffold approval.
- Add persistence in thin repository-backed increments; do not create the full schema in one pass.
- Add pure domain tests before relying on inventory, costing, pricing, HueForge, or report calculations in UI.
- Add linting or formatting checks later if the project starts accumulating enough code to justify them.

