# Database

## Direction

All data will eventually live in a local SQLite database. The app uses the Tauri SQL plugin for native SQLite persistence, with no cloud database, no server, no Firebase, no authentication, and no automatic sync.

The current implemented persistence slices are filament inventory, add-ons/hardware inventory, finished goods home stock, product/design library records, HueForge match snapshots, print profiles/costing, production runs with estimated stock movements, sales with finished goods stock movement, and expenses/memberships with commercial-use warning fields.

## SQLite Location

The frontend database client loads:

- `sqlite:printops-studio.db`

For Tauri SQL, this path is relative to Tauri's app data directory. The database is not preloaded at app startup; it is opened when a persistence-backed inventory repository is used.

## Access Pattern

All SQLite access must go through repository modules under `src/data/repositories`.

Rules:

- No raw SQL inside React components.
- No raw SQL inside shared UI components.
- No database calls from pure domain modules.
- Repositories map SQLite rows into application-friendly data shapes.
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

The `filaments` schema is currently created by `src/data/repositories/filamentsRepository.ts` on first repository use. This keeps schema work out of React and avoids database work during application boot.

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

The `addons` schema is currently created by `src/data/repositories/addOnsRepository.ts` on first repository use.

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

The `finished_goods` and `finished_good_stock_adjustments` schemas are currently created by `src/data/repositories/finishedGoodsRepository.ts` on first repository use. This slice tracks home stock only. Production runs add good pieces through stock adjustments, and sales reduce ready stock through stock adjustments. Cafe stock and product-library foreign keys are intentionally deferred.

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
- `license_notes`
- `notes`
- `image_reference`
- `created_at`
- `updated_at`

The `products` schema is currently created by `src/data/repositories/productsRepository.ts` on first repository use. The `image_reference` field stores one optional reference string only. There is no image upload, copying, resizing, gallery, product costing, HueForge matching, production automation, or sales integration in this slice.

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

The HueForge schemas are currently created by `src/data/repositories/hueForgeRepository.ts` on first repository use. Saving from HueForge creates a product/design record, then stores the author requirements, suggested owned matches, missing warnings, and feasibility notes. It does not deduct filament inventory.

## Print Profiles and Costing Slice

Implemented table:

- `print_profiles`

Implemented fields:

- `id`
- `product_id`
- `profile_name`
- `sale_unit`
- `filament_grams`
- `support_grams`
- `filament_cost_per_kg`
- `add_on_description`
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

The `print_profiles` schema is currently created by `src/data/repositories/printProfilesRepository.ts` on first repository use. Profiles are linked to `products.id` and store costing inputs only. They do not deduct filament, consume add-ons, log production runs, create sales, or allocate license subscriptions.

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

The production run schema is currently created by `src/data/repositories/productionRunsRepository.ts` on first repository use. Production logging is coordinated by `src/data/services/productionRunsService.ts`: it validates the selected product/profile, calculates estimated deductions with `src/domain/production`, deducts filament and optional add-ons through inventory repository adjustment methods, records good pieces through finished goods stock adjustments, and saves the production run history. It does not create sales, monthly reports, or irreversible inventory movements.

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

The sales schema is currently created by `src/data/repositories/salesRepository.ts` on first repository use. Sales are recorded against finished goods home stock, snapshot the product reference and sale unit, calculate gross/net revenue in `src/domain/sales`, reduce ready stock through `src/data/services/salesService.ts`, and preserve sale stock movement rows. This slice does not implement online payments, channel integrations, full accounting, profit reporting, or monthly reports.

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

The expenses and memberships schema is currently created by `src/data/repositories/expensesRepository.ts` on first repository use. Recurrence helpers, monthly totals, monthly-equivalent estimates, and commercial-use warning display live in `src/domain/expenses`. Memberships and license subscriptions are tracked as monthly or recurring business expenses only; they are not allocated into product costing. License warnings are informational and do not block products, production, or sales.

## Migration Folder

Migrations live in `src/data/db/migrations`.

The current `0000_scaffold_only.sql` file remains documentation-only and must not be treated as production schema. A fuller migration runner can replace the repository-local schema creation once more persisted modules exist.

## Planned Tables

Future schema planning should consider these tables:

- `product_images`
- `print_profile_filaments`
- `product_addons`
- `shopping_list_items`
- `settings`

Do not implement the full schema until the relevant feature phase is approved.

## Backup Direction

Backup, export, and import should be manual workflows later through Tauri dialog and file-system plugins. Do not add background sync or remote storage.
