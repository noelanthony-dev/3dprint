# Implementation Phases and Prompts

Use these phases one at a time. Do not combine phases unless the current phase has passed typecheck, tests, build, and a manual UI review.

Each prompt assumes Codex should read the current docs first, preserve architecture boundaries, keep the app offline/local-only, and avoid unrelated feature work.

## Phase 0: Native Tauri Readiness

Goal: Confirm the local machine can run and build the Tauri shell before native plugins are added.

Use this before adding SQLite or file-system plugins.

Prompt:

```text
Verify native Tauri readiness for this project.

Read docs/CODEX_RULES.md, docs/ARCHITECTURE.md, docs/DATABASE.md, and docs/SCAFFOLD_REVIEW.md first.

Scope:
- Check Node/npm versions.
- Check Rust, Cargo, rustup, Xcode command line tools, and Tauri CLI readiness.
- Run npm run typecheck, npm run test, and npm run build.
- Run npm run tauri -- --version.
- If Rust/Cargo are available, run a native Tauri dev/build smoke check only if practical.

Do not implement business features.
Do not add dependencies unless a missing prerequisite is clearly project-local and required.

Report:
- What passed.
- What failed.
- Exact setup steps still needed before native plugins can be added.
```

## Phase 1: Stitch UI Shell and Visual Foundation

Goal: Make the app shell, sidebar, page layout, colors, typography, and reusable scaffold UI primitives match the Stitch Industrial Precision direction.

This phase is visual foundation only. It should not add real CRUD, database persistence, or business calculations.

Prompt:

```text
Implement the Stitch UI shell and visual foundation for the 3D print business manager app.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/ARCHITECTURE.md, docs/PERFORMANCE.md, and docs/stitch/DESIGN.md first. Inspect the Stitch screenshots under docs/stitch/stitch_printops_studio_manager, especially dashboard, filament inventory, HueForge, and design library.

Scope:
- Update the app shell and sidebar to follow the Industrial Precision aesthetic.
- Add lightweight design tokens in CSS for colors, spacing, radius, borders, and typography.
- Keep dark mode as the primary visual direction unless the existing code strongly suggests otherwise.
- Add small reusable UI primitives only where genuinely useful, such as metric panels, technical badges, page headers, toolbar buttons, and table shell placeholders.
- Update placeholder pages so they feel like PrintOps Studio screens but still contain placeholder/sample UI only.
- Keep routes lazy-loaded.
- Keep components lean and feature-scoped.

Non-goals:
- Do not implement real inventory CRUD.
- Do not implement real database access.
- Do not implement HueForge matching.
- Do not implement costing, production, sales, reports, or backup logic.
- Do not paste generated Stitch HTML wholesale into React.
- Do not add Tailwind, a heavy UI framework, charting libraries, table libraries, or global state libraries.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.
- Start the dev server and visually review the main routes if practical.

Update docs/UI_UX.md if implementation decisions refine the visual system.
```

## Phase 2: SQLite Persistence Foundation

Goal: Add the minimum local SQLite foundation needed for real features, without creating the full production schema.

Prompt:

```text
Implement the minimal SQLite persistence foundation for the offline Tauri app.

Read docs/CODEX_RULES.md, docs/ARCHITECTURE.md, docs/DATABASE.md, docs/PERFORMANCE.md, and docs/IMPLEMENTATION_PHASES.md first.

Scope:
- Add the stable Tauri SQL plugin packages/crates only if Rust/Cargo readiness is confirmed.
- Add a small database client wrapper under src/data/db/client.
- Add a migration convention under src/data/db/migrations.
- Add only minimal migrations needed to support the next approved inventory phase, not the full schema.
- Add repository interfaces and testable repository boundary helpers.
- Keep raw SQL out of React components.
- Keep database-heavy work out of app startup.
- Document where the SQLite file will live and how migrations are applied.

Non-goals:
- Do not implement full inventory UI.
- Do not create every planned table.
- Do not add cloud sync, auth, Firebase, server code, or automatic backup.
- Do not implement costing, HueForge matching, production, sales, or reports.

Verification:
- Run npm install if dependencies changed.
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.
- Run Tauri native checks only if Rust/Cargo are installed.

Update docs/DATABASE.md and docs/SCAFFOLD_REVIEW.md or a new phase note with what persistence now supports.
```

## Phase 3: Filament Inventory MVP

Goal: Implement filament inventory as the first real business module.

Prompt:

```text
Implement Phase 3: Filament Inventory MVP.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, docs/IMPLEMENTATION_PHASES.md, and the Stitch filament inventory references first.

Scope:
- Implement filament inventory list, add/edit form, and detail-friendly data model.
- Track brand/name, material type, color name, hex color, TD value, spool status, starting grams, estimated grams left, cost, purchase/source notes if needed, and low-stock threshold.
- Use repository modules for all SQLite access.
- Keep all raw SQL inside data/repository modules.
- Add pure TypeScript helpers for low-stock status, grams-left display, and simple validation.
- Add focused Vitest tests for pure helpers and repository boundaries where practical.
- Use the Stitch Industrial Precision UI style without adding heavy UI dependencies.

Non-goals:
- Do not implement automatic production-run deduction yet.
- Do not implement HueForge matching yet.
- Do not implement costing formulas.
- Do not implement add-ons, products, sales, or reports except for navigation links/placeholders.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.
- Run native Tauri checks if persistence requires them and Rust/Cargo are available.

Update docs/DATABASE.md and docs/ROADMAP.md with the implemented filament slice.
```

## Phase 4: Add-ons and Hardware MVP

Goal: Add inventory tracking for non-filament materials.

Prompt:

```text
Implement Phase 4: Add-ons and Hardware MVP.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, docs/IMPLEMENTATION_PHASES.md, and the Stitch add-ons/hardware references first.

Scope:
- Implement add-ons and hardware list, add/edit form, and local SQLite repository.
- Track item name, category, unit, quantity on hand, low-stock threshold, unit cost, supplier/source notes, and active/inactive state if useful.
- Add pure TypeScript helpers for low-stock status, quantity display, and validation.
- Add tests for pure helpers and repository boundaries.
- Keep UI compact and aligned with the Stitch visual direction.

Non-goals:
- Do not connect add-ons to product costing yet.
- Do not implement automatic production deductions.
- Do not implement shopping list generation yet.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.
- Run native Tauri checks if needed and available.

Update docs/DATABASE.md and docs/ROADMAP.md with the implemented add-ons slice.
```

## Phase 5: Finished Goods Inventory MVP

Goal: Track ready-to-sell home stock without sales or production automation.

Prompt:

```text
Implement Phase 5: Finished Goods Inventory MVP.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, and docs/IMPLEMENTATION_PHASES.md first.

Scope:
- Implement finished goods inventory for home stock only.
- Track product/design reference as text if products are not implemented yet, quantity ready, reserved quantity if needed, sale unit, and notes.
- Add manual stock adjustment support through repository modules.
- Add pure helpers and tests for quantity status and sale unit validation.
- Preserve room for future production-run and sales integration.

Non-goals:
- Do not track cafe stock.
- Do not implement sales.
- Do not implement production-run automation.
- Do not implement product library CRUD unless explicitly required by this phase and approved.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.

Update docs/DATABASE.md and docs/ROADMAP.md.
```

## Phase 6: Design Library and Product Detail

Goal: Implement product/design records and the detail view that later modules can reference.

Prompt:

```text
Implement Phase 6: Design Library and Product Detail.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, docs/IMPLEMENTATION_PHASES.md, and the Stitch design library/product detail references first.

Scope:
- Implement product/design list, add/edit form, and product detail page.
- Track design name, source link, author/designer, category, sale unit, commercial license warning fields, notes, and one optional image reference field.
- Store image reference only; do not build complex image management.
- Add repository modules and minimal migrations for product/design tables only.
- Add pure helpers/tests for sale units, license warning display, and product validation.

Non-goals:
- Do not implement HueForge matching yet.
- Do not deduct inventory.
- Do not implement production, sales, costing, or reports.
- Do not import spreadsheets.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.

Update docs/DATABASE.md and docs/ROADMAP.md.
```

## Phase 7: HueForge Match Checker

Goal: Implement the HueForge workflow using pure matching logic and clear feasibility output.

Prompt:

```text
Implement Phase 7: HueForge Match Checker.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, docs/IMPLEMENTATION_PHASES.md, and the Stitch HueForge references first.

Scope:
- Implement required filament entry for author/designer HueForge requirements.
- Compare requirements against owned filament inventory by material type, hex color similarity, TD closeness, and stock availability.
- Add Culori only if implementing perceptual Delta E/CIEDE2000 in this phase; otherwise document the temporary matching approach clearly.
- Keep matching logic in src/domain/hueforge with focused Vitest tests.
- Add "Add to Design Library" flow that saves design metadata, requirements, suggested owned matches, missing filament warnings, and feasibility notes.
- Ensure adding to Design Library does not deduct inventory.

Non-goals:
- Do not implement production-run deduction.
- Do not implement costing or sales.
- Do not create a complex image manager.

Verification:
- Run npm install if Culori or another dependency is added.
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.

Update docs/DATABASE.md, docs/ROADMAP.md, and docs/UI_UX.md if the HueForge UI introduces reusable patterns.
```

## Phase 8: Print Profiles and Costing

Goal: Add cost modeling through pure, tested domain logic.

Prompt:

```text
Implement Phase 8: Print Profiles and Costing.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, docs/IMPLEMENTATION_PHASES.md, and the Stitch print costing references first.

Scope:
- Implement print profiles linked to products/designs.
- Track filament usage estimates, add-ons, print time, electricity/labor inputs if approved, failure allowance, and sale unit context.
- Keep costing and pricing formulas in src/domain/costing and src/domain/pricing.
- Add focused tests for every formula and edge case.
- Build UI that displays calculation inputs and outputs clearly.

Non-goals:
- Do not deduct inventory.
- Do not log production runs.
- Do not implement sales or reports.
- Do not allocate license subscriptions into per-product cost in MVP.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.

Update docs/DATABASE.md and docs/ROADMAP.md.
```

## Phase 9: Production Runs

Goal: Log production and deduct estimated inventory.

Prompt:

```text
Implement Phase 9: Production Runs.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, docs/IMPLEMENTATION_PHASES.md, and the Stitch production runs references first.

Scope:
- Implement production run list and logging flow.
- Track product/profile, expected pieces, good pieces, failed pieces, optional failure reason, run date, and notes.
- Deduct filament and add-ons as estimates through repository/service modules.
- Add stock adjustment records for deductions and manual correction.
- Add pure tests for deduction math and failed-print handling.

Non-goals:
- Do not implement sales.
- Do not implement monthly reports except placeholders.
- Do not make deductions irreversible; preserve adjustment paths.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.

Update docs/DATABASE.md and docs/ROADMAP.md.
```

## Phase 10: Sales

Goal: Record sales and reduce finished goods stock.

Prompt:

```text
Implement Phase 10: Sales.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, docs/IMPLEMENTATION_PHASES.md, and the Stitch sales references first.

Scope:
- Implement sales list and sale entry flow.
- Track date, product, quantity, sale unit, channel, gross revenue, discounts/fees if approved, notes, and stock movement.
- Reduce finished goods stock through repository/service modules.
- Add pure helpers/tests for sale unit handling, totals, and stock validation.

Non-goals:
- Do not implement full accounting.
- Do not create online payments or cloud integrations.
- Do not implement reports beyond data needed for the later reports phase.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.

Update docs/DATABASE.md and docs/ROADMAP.md.
```

## Phase 11: Expenses, Memberships, and Licenses

Goal: Track business expenses and license warnings.

Prompt:

```text
Implement Phase 11: Expenses, Memberships, and Licenses.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, docs/IMPLEMENTATION_PHASES.md, and the Stitch expenses/licenses references first.

Scope:
- Implement expense and membership tracking.
- Track amount, category, vendor, recurrence/month, notes, and license-related warning fields.
- Show commercial license warnings only; do not hard block product use.
- Keep license subscriptions as monthly business expenses, not per-product costs in MVP.
- Add tests for recurring/monthly helper logic if implemented.

Non-goals:
- Do not implement full accounting or tax logic.
- Do not allocate memberships into product costing.
- Do not add cloud reminders or automatic sync.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.

Update docs/DATABASE.md and docs/ROADMAP.md.
```

## Phase 12: Shopping List

Goal: Implement procurement planning from manual entries and generated warnings.

Prompt:

```text
Implement Phase 12: Shopping List.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, docs/IMPLEMENTATION_PHASES.md, and relevant Stitch references first.

Scope:
- Implement manual shopping list items.
- Add generated suggestions for low-stock add-ons and missing HueForge filaments if the source modules exist.
- Keep generated suggestions explainable and non-destructive.
- Add tests for suggestion helpers.

Non-goals:
- Do not add online ordering.
- Do not add external APIs.
- Do not add automatic purchasing or cloud sync.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.

Update docs/DATABASE.md and docs/ROADMAP.md.
```

## Phase 13: Monthly Reports

Goal: Add basic MVP reporting that calculates only when the reports page is opened or refreshed.

Prompt:

```text
Implement Phase 13: Monthly Reports.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, docs/IMPLEMENTATION_PHASES.md, and the Stitch business reports references first.

Scope:
- Implement basic monthly reports for sales, expenses, production, inventory movement, and simple profit summaries.
- Keep report calculations in src/domain/reports.
- Run report calculations only when the reports page is opened or explicitly refreshed.
- Add focused tests for report aggregation helpers.
- Keep visualizations lightweight; do not add charting libraries unless the need is clearly justified first.

Non-goals:
- Do not implement full accounting.
- Do not add cloud analytics.
- Do not run report calculations on app boot.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.

Update docs/PERFORMANCE.md and docs/ROADMAP.md.
```

## Phase 14: Settings, Backup, Export, and Import

Goal: Add local preferences and manual data safety workflows.

Prompt:

```text
Implement Phase 14: Settings, Backup, Export, and Import.

Read docs/CODEX_RULES.md, docs/UI_UX.md, docs/DATABASE.md, docs/PERFORMANCE.md, docs/IMPLEMENTATION_PHASES.md, and the Stitch settings/backup references first.

Scope:
- Implement local settings needed by existing features.
- Add manual backup/export/import workflows using stable Tauri dialog/file-system plugins.
- Keep backup explicit and user-triggered.
- Add validation and clear restore/import safety checks.
- Add tests for backup metadata helpers and import validation where practical.

Non-goals:
- Do not add automatic sync.
- Do not add cloud storage.
- Do not add authentication.
- Do not add background backup jobs.

Verification:
- Run npm install if plugins are added.
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.
- Run native Tauri checks if Rust/Cargo are available.

Update docs/DATABASE.md, docs/PERFORMANCE.md, and docs/ROADMAP.md.
```

## Phase 15: Polish, QA, and Packaging

Goal: Improve the finished MVP without expanding scope.

Prompt:

```text
Implement Phase 15: MVP Polish, QA, and Packaging.

Read all docs under docs/ first, including docs/stitch references and docs/SCAFFOLD_REVIEW.md.

Scope:
- Review navigation, keyboard usability, empty states, error states, loading states, and responsive behavior.
- Improve visual consistency with the Stitch Industrial Precision design system.
- Add missing tests for critical pure logic and repository paths.
- Verify startup performance and lazy loading.
- Run full frontend checks and native Tauri packaging checks if the environment supports them.

Non-goals:
- Do not add new business modules.
- Do not add cloud services, authentication, Firebase, or automatic sync.
- Do not add heavy dependencies without explicit approval.

Verification:
- Run npm run typecheck.
- Run npm run test.
- Run npm run build.
- Run native Tauri build/package checks if Rust/Cargo are available.

Produce a concise MVP readiness report.
```

