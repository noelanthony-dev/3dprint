# Database

## Direction

All data will eventually live in a local SQLite database. The app uses the Tauri SQL plugin for native SQLite persistence, with no cloud database, no server, no Firebase, no authentication, and no automatic sync.

The current implemented persistence slice is filament inventory only.

## SQLite Location

The frontend database client loads:

- `sqlite:printops-studio.db`

For Tauri SQL, this path is relative to Tauri's app data directory. The database is not preloaded at app startup; it is opened when the filament inventory repository is used.

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

## Migration Folder

Migrations live in `src/data/db/migrations`.

The current `0000_scaffold_only.sql` file remains documentation-only and must not be treated as production schema. A fuller migration runner can replace the repository-local schema creation once more persisted modules exist.

## Planned Tables

Future schema planning should consider these tables:

- `addons`
- `finished_goods`
- `products`
- `product_images`
- `author_filament_requirements`
- `print_profiles`
- `print_profile_filaments`
- `product_addons`
- `production_runs`
- `production_run_filaments`
- `production_run_addons`
- `sales`
- `expenses`
- `memberships`
- `shopping_list_items`
- `stock_adjustments`
- `settings`

Do not implement the full schema until the relevant feature phase is approved.

## Backup Direction

Backup, export, and import should be manual workflows later through Tauri dialog and file-system plugins. Do not add background sync or remote storage.
