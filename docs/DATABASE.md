# Database

## Direction

Business data lives in a local SQLite database owned by one native Rust `DatabaseState`. One `SqliteConnection` is held behind an async mutex, so all access inside the app process is serialized. The connection uses WAL, foreign keys, normal synchronous mode, and a five-second busy timeout. There is no cloud database, server, Firebase, authentication, or automatic sync.

The current implemented persistence slices are filament inventory, add-ons/hardware inventory, finished goods home stock, product/design library records, HueForge match snapshots, print profiles/costing, production runs with estimated stock movements, sales with finished goods stock movement, expenses/memberships with commercial-use warning fields, and shopping list items.

Local app settings are stored in `localStorage` under a versioned PrintOps key. They are not SQLite business records, but full backup exports include them alongside the SQLite database payload.

## SQLite Location

The managed database path is:

- `sqlite:printops-studio.db`

The path is relative to Tauri's app configuration directory, matching the location used by the retired SQL plugin so existing records are adopted in place. Native startup opens it, applies versioned migrations once, and only then exposes repository commands. A second desktop app process is redirected to the existing window by the single-instance plugin.

## Access Pattern

Feature-facing SQLite access goes through repository modules under `src/data/repositories`. Repositories use `db_select` and restricted single-statement `db_execute` calls for simple operations, and typed native commands for compound workflows.

Rules:

- No raw SQL inside React components.
- No raw SQL inside shared UI components.
- No database calls from pure domain modules.
- Repositories map SQLite rows into application-friendly data shapes.
- Repositories must not issue DDL or transaction-control statements.
- Multi-row stock, Sales, Production, HueForge, profile, shopping-link, and deletion workflows run in one native `sqlx::Transaction`.
- Feature modules call repositories; service or hook layers can be added later when workflows span multiple repositories.

## Filament Inventory Slice

Implemented table:

- `filaments`
- `filament_stock_adjustments`

Implemented fields:

- `id`
- `brand`
- `name`
- `material_type`
- `color_name`
- `hex_color`
- `transmission_distance`
- `spool_status`
- `starting_grams`
- `estimated_grams_left`
- `spool_cost`
- `purchase_source`
- `notes`
- `low_stock_threshold_grams`
- `created_at`
- `updated_at`

The native versioned migration creates and upgrades the filament tables before repository access.

`filament_stock_adjustments` records production-run deductions and future manual corrections through repository methods. Implemented fields:

- `id`
- `filament_id`
- `grams_delta`
- `grams_after`
- `reason`
- `notes`
- `created_at`

## Add-ons and Hardware Slice

Implemented table:

- `addons`
- `addon_stock_adjustments`

Implemented fields:

- `id`
- `item_name`
- `category`
- `unit`
- `quantity_on_hand`
- `low_stock_threshold`
- `unit_cost`
- `supplier`
- `notes`
- `is_active`
- `created_at`
- `updated_at`

The native versioned migration creates and upgrades the add-on tables before repository access.

`addon_stock_adjustments` records production-run deductions and future manual corrections through repository methods. Implemented fields:

- `id`
- `addon_id`
- `quantity_delta`
- `quantity_after`
- `reason`
- `notes`
- `created_at`

Product costing links, automatic shopping list generation, and generated procurement suggestions are intentionally deferred.

## Finished Goods Inventory Slice

Implemented tables:

- `finished_goods`
- `finished_good_stock_adjustments`

Implemented `finished_goods` fields:

- `id`
- `product_reference`
- `sale_unit`
- `quantity_ready`
- `quantity_reserved`
- `notes`
- `created_at`
- `updated_at`

Implemented `finished_good_stock_adjustments` fields:

- `id`
- `finished_good_id`
- `quantity_delta`
- `quantity_after`
- `reason`
- `notes`
- `created_at`

The native versioned migration creates and upgrades `finished_goods` and its ledger. This slice tracks home stock only. Production runs add good pieces and sales reduce ready stock inside their respective native transactions. Cafe stock and product-library foreign keys are intentionally deferred.

## Product / Design Library Slice

Implemented table:

- `products`

Implemented fields:

- `id`
- `design_name`
- `source_link`
- `author_name`
- `category`
- `sale_unit`
- `commercial_license_status`
- `license_cost_amount`
- `license_billing_interval`
- `notes`
- `image_reference`
- `created_at`
- `updated_at`

The native versioned migration creates and upgrades `products`. The `image_reference` field stores one optional reference string only. Product records track warning-only commercial license status plus optional recurring license cost by monthly, quarterly, or yearly billing interval.

## HueForge Match Slice

Implemented tables:

- `hueforge_design_analyses`
- `author_filament_requirements`

Implemented `hueforge_design_analyses` fields:

- `id`
- `product_id`
- `feasibility_status`
- `feasibility_notes`
- `missing_warnings`
- `created_at`
- `updated_at`

Implemented `author_filament_requirements` fields:

- `id`
- `product_id`
- `role`
- `brand`
- `material_type`
- `color_name`
- `hex_color`
- `transmission_distance`
- `required_grams`
- `layer_range`
- `suggested_filament_id`
- `suggested_filament_label`
- `match_score`
- `match_status`
- `color_distance`
- `td_delta`
- `stock_signal`
- `warning`
- `created_at`

The native versioned migration creates and upgrades the HueForge tables. Replacing an analysis and all requirement rows is one native transaction. It does not deduct filament inventory.

## Print Profiles and Costing Slice

Implemented table:

- `print_profiles`
- `print_profile_addons`

Implemented fields:

- `id`
- `product_id`
- `profile_name`
- `sale_unit`
- `filament_grams`
- `support_grams`
- `filament_cost_per_kg`
- `add_on_id`
- `add_on_description`
- `add_on_quantity`
- `add_on_cost`
- `print_hours`
- `print_minutes`
- `electricity_rate_per_kwh`
- `printer_power_watts`
- `wear_rate_per_hour`
- `labor_minutes`
- `labor_rate_per_hour`
- `expected_good_units`
- `expected_failed_units`
- `target_markup`
- `notes`
- `created_at`
- `updated_at`

Implemented `print_profile_addons` fields:

- `id`
- `print_profile_id`
- `addon_id`
- `description`
- `quantity`
- `unit_cost`
- `total_cost`
- `created_at`

The native versioned migration creates and upgrades print-profile tables. A profile and all child add-ons are saved in one native transaction. Descriptions, quantities, unit costs, and total costs are calculation snapshots; setting an inventory item inactive does not alter a saved profile. Legacy singular add-on values are adopted into the child table once during migration. Costing does not deduct stock.

## Production Runs Slice

Implemented tables:

- `production_runs`
- `production_run_filaments`
- `production_run_addons`

Implemented `production_runs` fields:

- `id`
- `product_id`
- `print_profile_id`
- `filament_id`
- `addon_id`
- `run_date`
- `expected_pieces`
- `good_pieces`
- `failed_pieces`
- `failure_reason`
- `notes`
- `filament_grams_deducted`
- `addon_quantity_deducted`
- `finished_good_id`
- `created_at`
- `updated_at`

Implemented `production_run_filaments` fields:

- `id`
- `production_run_id`
- `filament_id`
- `grams_deducted`
- `grams_before`
- `grams_after`
- `created_at`

Implemented `production_run_addons` fields:

- `id`
- `production_run_id`
- `addon_id`
- `quantity_deducted`
- `quantity_before`
- `quantity_after`
- `created_at`

The native migration owns the production schema. `src/data/services/productionRunsService.ts` validates and prepares deductions, then passes every filament, add-on, and finished-good change to one native transaction with the run history. If any identity, stock, or consistency check fails, the complete run rolls back.

## Sales Slice

Implemented tables:

- `sales`
- `sale_stock_movements`

Implemented `sales` fields:

- `id`
- `finished_good_id`
- `product_reference`
- `sale_date`
- `quantity`
- `sale_unit`
- `channel`
- `gross_revenue`
- `discounts_fees`
- `net_revenue`
- `notes`
- `stock_quantity_before`
- `stock_quantity_after`
- `created_at`
- `updated_at`

Implemented `sale_stock_movements` fields:

- `id`
- `sale_id`
- `finished_good_id`
- `quantity_delta`
- `quantity_before`
- `quantity_after`
- `created_at`

The native migration owns the Sales schema. Each sale, finished-goods reduction, adjustment ledger row, and sale movement row is recorded by one native transaction after repeating identity, revenue, and stock checks. Existing sales can correct their date, channel, gross revenue, discounts/fees, and notes through a native command; product, quantity, and stock history remain immutable in the correction form.

## Expenses, Memberships, and Licenses Slice

Implemented tables:

- `expenses`
- `memberships`

Implemented `expenses` fields:

- `id`
- `vendor`
- `category`
- `amount`
- `expense_date`
- `recurrence`
- `recurrence_month`
- `notes`
- `created_at`
- `updated_at`

Implemented `memberships` fields:

- `id`
- `creator_name`
- `platform`
- `vendor`
- `amount`
- `recurrence`
- `recurrence_month`
- `membership_status`
- `commercial_use_status`
- `license_notes`
- `notes`
- `created_at`
- `updated_at`

The native versioned migration creates and upgrades expense and membership tables. Recurrence helpers, monthly totals, monthly-equivalent estimates, and commercial-use warning display live in `src/domain/expenses`.

## Shopping List Slice

Implemented table:

- `shopping_list_items`

Implemented fields:

- `id`
- `item_name`
- `product_id`
- `category`
- `quantity_needed`
- `unit`
- `priority`
- `status`
- `source_type`
- `source_note`
- `notes`
- `created_at`
- `updated_at`

The native versioned migration owns the shopping schema and legacy product-link backfill. Saving an item and replacing all product links is one native transaction. Generated suggestions remain explainable and non-destructive until explicitly added.

## Native Migrations

Production migrations live in `src-tauri/src/database/migrations.rs`. Existing unversioned databases are inspected and preserved, a consistent pre-migration snapshot is created, missing schema changes and child-row backfills run atomically, and the applied version is recorded in `_printops_schema_migrations`. The old `src/data/db/migrations/0000_scaffold_only.sql` file is documentation-only.

## Settings Slice

Implemented local-only settings:

- currency display
- dark-mode preference
- metric-units preference
- labor-rate default
- electricity-rate default
- printer-power default
- wear-and-tear rate default
- machine-life default
- expected failure-rate default
- HueForge transmission-distance thresholds
- HueForge acceptable Delta E threshold

Settings are normalized and validated in `src/domain/settings`, persisted through `src/data/settings/localSettingsRepository.ts`, and surfaced in the Settings page. They remain local-only and do not add accounts, sync, Firebase, or authentication.

## Backup / Export / Import Slice

Implemented manual workflows:

- create full local backup
- restore full local backup
- export settings
- import settings

Full backups retain the existing JSON envelope and settings payload. Database bytes come from native `VACUUM INTO`, producing a consistent snapshot that includes committed WAL data. Restore validates the envelope, SQLite header, and native `quick_check`, closes the managed connection, replaces the database, removes stale WAL/SHM files, and blocks further database operations until restart.

The native workflow uses the stable Tauri dialog and file-system plugins. Backups are explicit user-triggered files only. There is no background backup job, cloud storage, automatic sync, or authentication.

## Planned Tables

Future schema planning should consider these tables:

- `product_images`
- `print_profile_filaments`
- `product_addons`

Do not implement the full schema until the relevant feature phase is approved.

## Backup Direction

Backup, export, and import are manual workflows through Tauri dialog and file-system plugins. Do not add background sync, automatic backup jobs, or remote storage.
