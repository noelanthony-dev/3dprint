# Database

## Direction

All data will eventually live in a local SQLite database. The app should use the Tauri SQL plugin later, with no cloud database, no server, no Firebase, no authentication, and no automatic sync.

Persistence is not implemented in this scaffold.

## Access Pattern

All future SQLite access must go through repository modules under `src/data/repositories`.

Rules:

- No raw SQL inside React components.
- No raw SQL inside shared UI components.
- No database calls from pure domain modules.
- Repositories map SQLite rows into application-friendly data shapes.
- Feature modules call repositories through feature services or hooks once those layers exist.

## Migration Folder

Migrations will live in `src/data/db/migrations`.

The current `0000_scaffold_only.sql` file is documentation-only and must not be treated as production schema.

## Planned Tables

Future schema planning should consider these tables:

- `filaments`
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

