# Architecture

## Direction

This app is a personal-use, macOS-first, fully offline desktop app for managing a small 3D print business. The MVP has no cloud sync, no login, no Firebase, no server, and no iOS support.

Final technical direction:

- Tauri v2 desktop shell
- React + TypeScript + Vite frontend
- Local SQLite database later
- Tauri SQL plugin later for database access
- Tauri dialog and file-system plugins later for backup, export, and import
- Vitest for unit tests
- Culori later for HueForge color matching

## Current Scaffold

The current codebase intentionally includes only:

- App shell
- Sidebar navigation
- Lazy-loaded placeholder pages
- Feature folders
- Domain/data/infrastructure placeholders
- Documentation and development guardrails
- Minimal smoke tests

No production business logic, forms, repository queries, database persistence, imports, exports, or calculations are implemented yet.

## Folder Boundaries

`src/app`
: Application bootstrap, providers, routes, layout, and navigation.

`src/components`
: Shared presentation-only components. Avoid business logic here.

`src/features`
: User-facing feature modules. Feature UI belongs here, scoped by business area.

`src/domain`
: Pure TypeScript business rules and calculations. This layer must not import React, Tauri, or SQLite clients.

`src/data`
: SQLite client setup, migrations, schemas, repositories, and seed data later.

`src/infrastructure`
: Tauri plugin adapters, file handling, image helpers, and backup adapters later.

`src/styles`
: Lightweight global styling.

`src/test`
: Shared test setup and testing documentation.

## Feature Modules

Planned feature areas:

- Dashboard
- Filament Inventory
- Add-ons & Hardware
- Finished Goods Inventory
- Design Library / Products
- HueForge Match Checker
- Print Profiles & Costing
- Production Runs
- Sales
- Expenses, Memberships & Licenses
- Shopping List
- Monthly Reports
- Settings
- Backup / Export / Import

## Business Decisions

- Personal use first.
- macOS desktop is the main platform.
- No automatic syncing.
- Backup, export, and import are manual workflows later.
- Finished goods inventory is tracked.
- Products are usually sold by piece, but sale units should allow piece, set, pair, or pack later.
- Commercial licenses show warnings only, not hard blocks.
- License subscriptions are monthly business expenses in MVP, not per-product costs.
- Failed prints should later track expected pieces, good pieces, failed pieces, and optional failure reason.
- Filament grams left should later be automatically deducted as an estimate with manual adjustment support.
- Shopping list should later support missing HueForge filaments and low-stock add-ons.
- Product image support starts as one optional image field.
- Existing spreadsheet import is not needed for MVP.
- Basic monthly reporting is planned.
- Only home stock is tracked in this app. Cafe stock remains elsewhere.

## HueForge Direction

The HueForge Match Checker should eventually compare designer-required filaments against owned filament inventory using:

- Filament type
- Hex color similarity
- Transmission Distance/TD closeness
- Stock availability

Hex matching should later use perceptual color difference, preferably CIEDE2000/Delta E through Culori. TD matching is important for HueForge bookmarks.

The HueForge page should later support an "Add to Design Library" action that saves design name, source link, author, product category, author requirements, TD values, hex values, layer swap notes, suggested owned filament matches, missing filament warnings, and feasibility notes.

Adding to the design library must not deduct inventory. Inventory should only be deducted when a production run is logged.

## Guardrails

- React components must not contain raw SQL.
- React components must not contain costing, HueForge, inventory, pricing, or report calculations.
- SQLite access must go through repository modules.
- Business calculations should be pure TypeScript and covered by focused tests.
- Avoid global state libraries until a concrete need appears.
- Avoid heavy UI, table, and chart dependencies during early phases.

