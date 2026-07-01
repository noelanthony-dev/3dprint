# Database

## Direction

All data will eventually live in a local SQLite database. The app uses the Tauri SQL plugin for native SQLite persistence, with no cloud database, no server, no Firebase, no authentication, and no automatic sync.

The current implemented persistence slices are filament inventory, add-ons/hardware inventory, finished goods home stock, product/design library records, HueForge match snapshots, and print profiles/costing.

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

## Add-ons and Hardware Slice

Implemented table:

- `addons`

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

The `addons` schema is currently created by `src/data/repositories/addOnsRepository.ts` on first repository use. It supports manual add/edit/list workflows only. Production deductions, shopping list generation, and product costing links are intentionally deferred.

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

The `finished_goods` and `finished_good_stock_adjustments` schemas are currently created by `src/data/repositories/finishedGoodsRepository.ts` on first repository use. This slice tracks home stock only. Cafe stock, sales records, production-run automation, and product-library foreign keys are intentionally deferred.

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

## Migration Folder

Migrations live in `src/data/db/migrations`.

The current `0000_scaffold_only.sql` file remains documentation-only and must not be treated as production schema. A fuller migration runner can replace the repository-local schema creation once more persisted modules exist.

## Planned Tables

Future schema planning should consider these tables:

- `product_images`
- `print_profile_filaments`
- `product_addons`
- `production_runs`
- `production_run_filaments`
- `production_run_addons`
- `sales`
- `expenses`
- `memberships`
- `shopping_list_items`
- `settings`

Do not implement the full schema until the relevant feature phase is approved.

## Backup Direction

Backup, export, and import should be manual workflows later through Tauri dialog and file-system plugins. Do not add background sync or remote storage.
