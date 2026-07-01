# Roadmap

For copy-ready implementation prompts, use `docs/IMPLEMENTATION_PHASES.md`.

## Phase 1: App Shell, Navigation, Database Scaffolding

- Keep the Tauri + React + TypeScript scaffold working.
- Maintain lazy-loaded placeholder pages.
- Keep data, domain, and infrastructure folders separated.
- Prepare SQLite documentation without implementing persistence.

## Phase 2: Filament Inventory and Add-ons

- Add filament inventory screens and repositories.
- Add add-ons and hardware inventory screens.
- Add stock adjustment tests.
- Keep grams-left deductions estimate-based with manual adjustment.

## Phase 3: Design Library / Products

- Add product and design library models.
- Support source links, author details, categories, sale units, and one optional image field.
- Avoid complex image management.

## Phase 4: HueForge Match Checker

- Add HueForge requirement entry.
- Match owned filament by type, color, TD, and stock availability.
- Add Culori only when perceptual color matching is implemented.
- Add "Add to Design Library" without deducting inventory.

## Phase 5: Print Profiles and Costing

- Add print profile inputs.
- Add pure costing and pricing formulas.
- Add focused unit tests before relying on calculations in UI.

## Phase 6: Production Runs and Sales

- Log production runs with expected, good, and failed pieces.
- Deduct filament and add-ons when production runs are logged.
- Add sales records and finished goods stock movement.

## Phase 7: Expenses, Memberships, Reports

- Track expenses, memberships, and commercial licenses.
- Show license warnings without hard blocks.
- Add basic monthly report pages.
- Run report calculations only when reports are opened or refreshed.

## Phase 8: Backup / Export / Import and Polish

- Add manual backup/export/import workflows.
- Add Tauri dialog and file-system plugin integration.
- Improve UI polish and performance after core workflows exist.
