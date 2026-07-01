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

- Add editable author/designer HueForge filament requirements.
- Match owned filament by material type, temporary RGB color distance, TD closeness, and stock availability.
- Save HueForge designs to the Design Library with requirements, suggested owned matches, missing warnings, and feasibility notes.
- Keep Culori/Delta E, production deductions, costing, sales, and complex image management out of this phase.
- Status: complete for the matching and save-to-library MVP.

## Phase 8: Print Profiles and Costing

- Add print profile inputs linked to product/design records.
- Track filament usage estimates, purge/support grams, add-on estimate text/cost, print time, electricity, wear, labor, yield/failure allowance, sale unit, and target markup.
- Add pure costing and pricing formulas with focused tests.
- Keep inventory deduction, production runs, sales, reports, and license subscription allocation out of this phase.
- Status: complete for saved print profiles and costing/pricing guidance.

## Phase 9: Production Runs

- Log production runs with expected, good, and failed pieces.
- Deduct estimated filament and optional add-ons when production runs are logged.
- Add finished goods stock movement for good pieces.
- Preserve stock adjustment records for production deductions and future manual corrections.
- Keep sales records out of this phase.
- Status: complete for the production run logging, estimated deduction, and finished-goods output MVP.

## Phase 10: Sales

- Record sales and reduce finished goods stock.
- Track date, product, quantity, sale unit, channel, revenue, discounts/fees if approved, and notes.
- Keep full accounting and cloud integrations out of this phase.
- Status: complete for the offline sales list, sale entry, revenue totals, and finished-goods stock reduction MVP.

## Phase 11: Expenses, Memberships, and Licenses

- Track expenses, memberships, and commercial licenses.
- Show license warnings without hard blocks.
- Track recurring/monthly overhead without allocating subscriptions into product cost.
- Keep full accounting, tax logic, reminders, and sync out of this phase.
- Status: complete for expense entry, membership tracking, monthly overhead helpers, and warning-only commercial license status.

## Phase 12: Shopping List

- Add manual shopping list items.
- Add generated suggestions for low-stock add-ons and missing HueForge filaments if the source modules exist.
- Keep generated suggestions explainable and non-destructive.

## Phase 13: Monthly Reports

- Add basic monthly report pages.
- Run report calculations only when reports are opened or refreshed.
- Keep report calculations in `src/domain/reports`.

## Phase 14: Backup / Export / Import and Polish

- Add manual backup/export/import workflows.
- Add Tauri dialog and file-system plugin integration.
- Improve UI polish and performance after core workflows exist.
