# Roadmap

For copy-ready implementation prompts, use `docs/IMPLEMENTATION_PHASES.md`.

## Phase 1: App Shell, Navigation, Database Scaffolding

- Keep the Tauri + React + TypeScript scaffold working.
- Maintain lazy-loaded placeholder pages.
- Keep data, domain, and infrastructure folders separated.
- Prepare SQLite documentation without implementing persistence.
- Status: complete.

## Phase 2: Stitch UI Foundation

- Translate the Stitch Industrial Precision shell and placeholder screens into project-native React and CSS.
- Add lightweight UI primitives without heavy styling dependencies.
- Status: complete.

## Phase 3: Filament Inventory MVP

- Add filament inventory screens and SQLite repository.
- Track brand/name, material, color metadata, TD, status, starting grams, estimated grams left, cost, source notes, and low-stock threshold.
- Add pure inventory helpers and focused tests.
- Keep automatic production-run deduction out of this phase.
- Status: complete.

## Phase 4: Add-ons and Hardware

- Add add-ons and hardware inventory screens.
- Track item name, category, unit, quantity on hand, low-stock threshold, unit cost, supplier notes, and active state.
- Add pure helper tests and SQLite repository boundary tests.
- Keep product costing links, production deductions, stock adjustment history, and shopping list generation out of this phase.
- Status: complete for the add/edit/list MVP.

## Phase 5: Finished Goods Inventory MVP

- Add finished goods home-stock screens.
- Track product/design reference text, sale unit, ready quantity, reserved quantity, and notes.
- Add manual stock adjustments through repository modules with adjustment history.
- Keep cafe stock, sales, production automation, and product library CRUD out of this phase.
- Status: complete for the home-stock add/edit/list and manual adjustment MVP.

## Phase 6: Design Library / Products

- Add product and design library screens.
- Track design name, source link, author/designer, category, sale unit, commercial license status and notes, general notes, and one optional image reference.
- Add pure helper tests and SQLite repository boundary tests.
- Keep HueForge matching, inventory deduction, costing, production, sales, and complex image management out of this phase.
- Status: complete for the product/design add/edit/list and detail MVP.

## Phase 7: HueForge Match Checker

- Add HueForge requirement entry.
- Match owned filament by type, color, TD, and stock availability.
- Add Culori only when perceptual color matching is implemented.
- Add "Add to Design Library" without deducting inventory.

## Phase 8: Print Profiles and Costing

- Add print profile inputs.
- Add pure costing and pricing formulas.
- Add focused unit tests before relying on calculations in UI.

## Phase 9: Production Runs and Sales

- Log production runs with expected, good, and failed pieces.
- Deduct filament and add-ons when production runs are logged.
- Add sales records and finished goods stock movement.

## Phase 10: Expenses, Memberships, Reports

- Track expenses, memberships, and commercial licenses.
- Show license warnings without hard blocks.
- Add basic monthly report pages.
- Run report calculations only when reports are opened or refreshed.

## Phase 11: Backup / Export / Import and Polish

- Add manual backup/export/import workflows.
- Add Tauri dialog and file-system plugin integration.
- Improve UI polish and performance after core workflows exist.
