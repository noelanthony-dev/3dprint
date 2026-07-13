use sqlx::{Connection, Row, SqliteConnection};
use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

const CURRENT_SCHEMA_VERSION: i64 = 1;

pub(super) async fn migrate(
    connection: &mut SqliteConnection,
    database_path: &Path,
) -> Result<(), String> {
    let version = migration_version(connection).await?;

    if version > CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "This database uses schema version {version}, but this PrintOps build supports version {CURRENT_SCHEMA_VERSION}. Update the app before continuing."
        ));
    }

    if version == CURRENT_SCHEMA_VERSION {
        return Ok(());
    }

    if version == 0 && has_business_tables(connection).await? {
        create_pre_migration_snapshot(connection, database_path).await?;
    }

    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&mut *connection)
        .await
        .map_err(super::map_sqlx_error)?;

    let mut transaction = connection.begin().await.map_err(super::map_sqlx_error)?;
    let migration_result = async {
        apply_schema_v1(&mut transaction).await?;
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS _printops_schema_migrations (\
               version INTEGER PRIMARY KEY,\
               applied_at TEXT NOT NULL DEFAULT (datetime('now'))\
             )",
        )
        .execute(&mut *transaction)
        .await
        .map_err(|error| {
            format!(
                "Migration ledger creation failed: {}",
                super::map_sqlx_error(error)
            )
        })?;
        sqlx::query("INSERT OR IGNORE INTO _printops_schema_migrations (version) VALUES ($1)")
            .bind(CURRENT_SCHEMA_VERSION)
            .execute(&mut *transaction)
            .await
            .map_err(|error| {
                format!(
                    "Migration ledger write failed: {}",
                    super::map_sqlx_error(error)
                )
            })?;
        transaction.commit().await.map_err(super::map_sqlx_error)
    }
    .await;

    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut *connection)
        .await
        .map_err(super::map_sqlx_error)?;

    migration_result
}

async fn migration_version(connection: &mut SqliteConnection) -> Result<i64, String> {
    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master \
         WHERE type = 'table' AND name = '_printops_schema_migrations'",
    )
    .fetch_one(&mut *connection)
    .await
    .map_err(super::map_sqlx_error)?;

    if exists == 0 {
        return Ok(0);
    }

    sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM _printops_schema_migrations")
        .fetch_one(&mut *connection)
        .await
        .map_err(super::map_sqlx_error)
}

async fn has_business_tables(connection: &mut SqliteConnection) -> Result<bool, String> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master \
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_printops_schema_migrations'",
    )
    .fetch_one(connection)
    .await
    .map_err(super::map_sqlx_error)?;

    Ok(count > 0)
}

async fn create_pre_migration_snapshot(
    connection: &mut SqliteConnection,
    database_path: &Path,
) -> Result<(), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let snapshot_path =
        database_path.with_file_name(format!("printops-studio.pre-migration-{timestamp}.db"));

    sqlx::query("VACUUM INTO $1")
        .bind(snapshot_path.to_string_lossy().to_string())
        .execute(connection)
        .await
        .map_err(super::map_sqlx_error)?;

    Ok(())
}

async fn apply_schema_v1(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<(), String> {
    for statement in SCHEMA_V1_STATEMENTS
        .iter()
        .filter(|statement| !statement.starts_with("CREATE INDEX"))
    {
        sqlx::query(statement)
            .execute(&mut **transaction)
            .await
            .map_err(|error| {
                format!(
                    "Schema statement failed: {statement}: {}",
                    super::map_sqlx_error(error)
                )
            })?;
    }

    add_legacy_columns(transaction).await?;
    migrate_sales_channel_constraint(transaction).await?;

    for statement in SCHEMA_V1_STATEMENTS
        .iter()
        .filter(|statement| statement.starts_with("CREATE INDEX"))
    {
        sqlx::query(statement)
            .execute(&mut **transaction)
            .await
            .map_err(|error| {
                format!(
                    "Schema index failed: {statement}: {}",
                    super::map_sqlx_error(error)
                )
            })?;
    }

    backfill_child_tables(transaction).await?;

    Ok(())
}

async fn add_legacy_columns(connection: &mut SqliteConnection) -> Result<(), String> {
    let columns = [
        ("products", "license_cost_amount", "REAL NOT NULL DEFAULT 0"),
        ("products", "license_billing_interval", "TEXT NOT NULL DEFAULT 'none' CHECK (license_billing_interval IN ('none', 'monthly', 'quarterly', 'yearly'))"),
        ("products", "hueforge_filaments", "TEXT NOT NULL DEFAULT '[]'"),
        ("products", "filament_mode", "TEXT NOT NULL DEFAULT 'hueforge' CHECK (filament_mode IN ('hueforge', 'basic'))"),
        ("products", "can_print_with_inventory", "INTEGER NOT NULL DEFAULT 0"),
        ("products", "businesses", "TEXT NOT NULL DEFAULT '[]'"),
        ("shopping_list_items", "product_id", "INTEGER"),
        ("shopping_list_items", "required_transmission_distance", "REAL"),
        ("shopping_list_items", "shopee_listing_name", "TEXT"),
        ("print_profiles", "add_on_id", "INTEGER"),
        ("print_profiles", "add_on_quantity", "REAL NOT NULL DEFAULT 0 CHECK (add_on_quantity >= 0)"),
        ("production_runs", "addon_id", "INTEGER"),
        ("production_runs", "failure_reason", "TEXT"),
        ("production_runs", "notes", "TEXT"),
        ("production_runs", "filament_grams_deducted", "REAL NOT NULL DEFAULT 0 CHECK (filament_grams_deducted >= 0)"),
        ("production_runs", "addon_quantity_deducted", "REAL NOT NULL DEFAULT 0 CHECK (addon_quantity_deducted >= 0)"),
        ("production_runs", "finished_good_id", "INTEGER"),
        ("production_runs", "created_at", "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'"),
        ("production_runs", "updated_at", "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'"),
        ("hueforge_design_analyses", "product_id", "INTEGER NOT NULL DEFAULT 0"),
        ("hueforge_design_analyses", "feasibility_status", "TEXT NOT NULL DEFAULT 'missing' CHECK (feasibility_status IN ('ready', 'needs-test', 'missing'))"),
        ("hueforge_design_analyses", "feasibility_notes", "TEXT NOT NULL DEFAULT ''"),
        ("hueforge_design_analyses", "missing_warnings", "TEXT"),
        ("hueforge_design_analyses", "created_at", "TEXT"),
        ("hueforge_design_analyses", "updated_at", "TEXT"),
        ("author_filament_requirements", "product_id", "INTEGER NOT NULL DEFAULT 0"),
        ("author_filament_requirements", "role", "TEXT NOT NULL DEFAULT ''"),
        ("author_filament_requirements", "brand", "TEXT NOT NULL DEFAULT ''"),
        ("author_filament_requirements", "material_type", "TEXT NOT NULL DEFAULT ''"),
        ("author_filament_requirements", "color_name", "TEXT NOT NULL DEFAULT ''"),
        ("author_filament_requirements", "hex_color", "TEXT NOT NULL DEFAULT ''"),
        ("author_filament_requirements", "transmission_distance", "REAL NOT NULL DEFAULT 0"),
        ("author_filament_requirements", "required_grams", "REAL NOT NULL DEFAULT 0 CHECK (required_grams >= 0)"),
        ("author_filament_requirements", "layer_range", "TEXT"),
        ("author_filament_requirements", "suggested_filament_id", "INTEGER"),
        ("author_filament_requirements", "suggested_filament_label", "TEXT"),
        ("author_filament_requirements", "match_score", "INTEGER NOT NULL DEFAULT 0"),
        ("author_filament_requirements", "match_status", "TEXT NOT NULL DEFAULT 'missing' CHECK (match_status IN ('excellent', 'good', 'test', 'missing'))"),
        ("author_filament_requirements", "color_distance", "REAL"),
        ("author_filament_requirements", "td_delta", "REAL"),
        ("author_filament_requirements", "stock_signal", "TEXT NOT NULL DEFAULT 'missing'"),
        ("author_filament_requirements", "warning", "TEXT"),
        ("author_filament_requirements", "created_at", "TEXT"),
    ];

    for (table, column, definition) in columns {
        add_column_if_missing(connection, table, column, definition).await?;
    }

    Ok(())
}

async fn migrate_sales_channel_constraint(connection: &mut SqliteConnection) -> Result<(), String> {
    let create_sql: Option<String> = sqlx::query_scalar(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sales' LIMIT 1",
    )
    .fetch_optional(&mut *connection)
    .await
    .map_err(super::map_sqlx_error)?;

    if !create_sql
        .unwrap_or_default()
        .to_ascii_lowercase()
        .contains("channel text not null check")
    {
        return Ok(());
    }

    sqlx::query("DROP TABLE IF EXISTS sales_channel_migration")
        .execute(&mut *connection)
        .await
        .map_err(super::map_sqlx_error)?;
    sqlx::query(
        "CREATE TABLE sales_channel_migration (\
           id INTEGER PRIMARY KEY AUTOINCREMENT, finished_good_id INTEGER NOT NULL, product_reference TEXT NOT NULL,\
           sale_date TEXT NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0), sale_unit TEXT NOT NULL, channel TEXT NOT NULL,\
           gross_revenue REAL NOT NULL DEFAULT 0 CHECK (gross_revenue >= 0), discounts_fees REAL NOT NULL DEFAULT 0 CHECK (discounts_fees >= 0),\
           net_revenue REAL NOT NULL DEFAULT 0 CHECK (net_revenue >= 0), notes TEXT, stock_quantity_before INTEGER NOT NULL CHECK (stock_quantity_before >= 0),\
           stock_quantity_after INTEGER NOT NULL CHECK (stock_quantity_after >= 0), created_at TEXT NOT NULL DEFAULT (datetime('now')),\
           updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE RESTRICT\
         )",
    )
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("Sales channel migration table creation failed: {}", super::map_sqlx_error(error)))?;
    sqlx::query(
        "INSERT INTO sales_channel_migration (\
           id,finished_good_id,product_reference,sale_date,quantity,sale_unit,channel,gross_revenue,discounts_fees,net_revenue,notes,\
           stock_quantity_before,stock_quantity_after,created_at,updated_at\
         ) SELECT id,finished_good_id,product_reference,sale_date,quantity,sale_unit,channel,gross_revenue,discounts_fees,net_revenue,notes,\
           stock_quantity_before,stock_quantity_after,created_at,updated_at FROM sales",
    )
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("Sales channel data migration failed: {}", super::map_sqlx_error(error)))?;
    sqlx::query("DROP TABLE sales")
        .execute(&mut *connection)
        .await
        .map_err(super::map_sqlx_error)?;
    sqlx::query("ALTER TABLE sales_channel_migration RENAME TO sales")
        .execute(connection)
        .await
        .map_err(super::map_sqlx_error)?;

    Ok(())
}

async fn add_column_if_missing(
    connection: &mut SqliteConnection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let query = format!("PRAGMA table_info({table})");
    let rows = sqlx::query(&query)
        .fetch_all(&mut *connection)
        .await
        .map_err(super::map_sqlx_error)?;
    let exists = rows.iter().any(|row| {
        row.try_get::<String, _>("name")
            .map(|name| name == column)
            .unwrap_or(false)
    });

    if !exists {
        let alter = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
        sqlx::query(&alter)
            .execute(connection)
            .await
            .map_err(|error| {
                format!(
                    "Legacy column upgrade failed: {alter}: {}",
                    super::map_sqlx_error(error)
                )
            })?;
    }

    Ok(())
}

async fn backfill_child_tables(connection: &mut SqliteConnection) -> Result<(), String> {
    sqlx::query(
        "INSERT OR IGNORE INTO shopping_list_item_products (shopping_item_id, product_id) \
         SELECT id, product_id FROM shopping_list_items WHERE product_id IS NOT NULL",
    )
    .execute(&mut *connection)
    .await
    .map_err(|error| {
        format!(
            "Shopping product-link backfill failed: {}",
            super::map_sqlx_error(error)
        )
    })?;

    sqlx::query(
        "INSERT INTO print_profile_addons (\
           print_profile_id, addon_id, description, quantity, unit_cost, total_cost\
         ) \
         SELECT id, add_on_id, COALESCE(add_on_description, ''), COALESCE(add_on_quantity, 0),\
           CASE WHEN COALESCE(add_on_quantity, 0) > 0 \
             THEN COALESCE(add_on_cost, 0) / add_on_quantity ELSE COALESCE(add_on_cost, 0) END,\
           COALESCE(add_on_cost, 0) \
         FROM print_profiles AS profile \
         WHERE (add_on_id IS NOT NULL OR COALESCE(add_on_description, '') <> '' \
           OR COALESCE(add_on_quantity, 0) > 0 OR COALESCE(add_on_cost, 0) > 0) \
           AND NOT EXISTS (SELECT 1 FROM print_profile_addons AS existing \
             WHERE existing.print_profile_id = profile.id)",
    )
    .execute(connection)
    .await
    .map_err(|error| {
        format!(
            "Print-profile add-on backfill failed: {}",
            super::map_sqlx_error(error)
        )
    })?;

    Ok(())
}

const SCHEMA_V1_STATEMENTS: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS products (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, design_name TEXT NOT NULL, source_link TEXT NOT NULL,\
       author_name TEXT NOT NULL, category TEXT NOT NULL, sale_unit TEXT NOT NULL,\
       commercial_license_status TEXT NOT NULL CHECK (commercial_license_status IN ('commercial-ok','permission-needed','personal-use','unknown')),\
       license_cost_amount REAL NOT NULL DEFAULT 0,\
       license_billing_interval TEXT NOT NULL DEFAULT 'none' CHECK (license_billing_interval IN ('none','monthly','quarterly','yearly')),\
       filament_mode TEXT NOT NULL DEFAULT 'hueforge' CHECK (filament_mode IN ('hueforge','basic')),\
       hueforge_filaments TEXT NOT NULL DEFAULT '[]', can_print_with_inventory INTEGER NOT NULL DEFAULT 0,\
       businesses TEXT NOT NULL DEFAULT '[]', notes TEXT, image_reference TEXT,\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))\
     )",
    "CREATE INDEX IF NOT EXISTS idx_products_category_design ON products (category, design_name)",
    "CREATE INDEX IF NOT EXISTS idx_products_license_status ON products (commercial_license_status, design_name)",
    "CREATE TABLE IF NOT EXISTS filaments (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, name TEXT NOT NULL, material_type TEXT NOT NULL,\
       color_name TEXT NOT NULL, hex_color TEXT NOT NULL, transmission_distance REAL,\
       spool_status TEXT NOT NULL CHECK (spool_status IN ('open','sealed','empty','archived')),\
       starting_grams REAL NOT NULL CHECK (starting_grams > 0), estimated_grams_left REAL NOT NULL CHECK (estimated_grams_left >= 0),\
       spool_cost REAL NOT NULL DEFAULT 0 CHECK (spool_cost >= 0), purchase_source TEXT, notes TEXT,\
       low_stock_threshold_grams REAL NOT NULL DEFAULT 200 CHECK (low_stock_threshold_grams >= 0),\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))\
     )",
    "CREATE INDEX IF NOT EXISTS idx_filaments_status_brand ON filaments (spool_status, brand, name)",
    "CREATE TABLE IF NOT EXISTS filament_stock_adjustments (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, filament_id INTEGER NOT NULL, grams_delta REAL NOT NULL CHECK (grams_delta != 0),\
       grams_after REAL NOT NULL CHECK (grams_after >= 0), reason TEXT NOT NULL, notes TEXT,\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE CASCADE\
     )",
    "CREATE INDEX IF NOT EXISTS idx_filament_stock_adjustments_item ON filament_stock_adjustments (filament_id, created_at DESC)",
    "CREATE TABLE IF NOT EXISTS filament_profiles (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, material_type TEXT NOT NULL, color_name TEXT NOT NULL,\
       hex_color TEXT NOT NULL, transmission_distance REAL, created_at TEXT NOT NULL DEFAULT (datetime('now')),\
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))\
     )",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_filament_profiles_unique_normalized ON filament_profiles (lower(brand), material_type, lower(color_name), hex_color, COALESCE(transmission_distance, -1))",
    "CREATE INDEX IF NOT EXISTS idx_filament_profiles_lookup ON filament_profiles (brand, material_type, color_name)",
    "CREATE TABLE IF NOT EXISTS addons (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, item_name TEXT NOT NULL, category TEXT NOT NULL, unit TEXT NOT NULL,\
       quantity_on_hand REAL NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0), low_stock_threshold REAL NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),\
       unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0), supplier TEXT, notes TEXT,\
       is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)), created_at TEXT NOT NULL DEFAULT (datetime('now')),\
       updated_at TEXT NOT NULL DEFAULT (datetime('now'))\
     )",
    "CREATE INDEX IF NOT EXISTS idx_addons_active_category ON addons (is_active, category, item_name)",
    "CREATE TABLE IF NOT EXISTS addon_stock_adjustments (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, addon_id INTEGER NOT NULL, quantity_delta REAL NOT NULL CHECK (quantity_delta != 0),\
       quantity_after REAL NOT NULL CHECK (quantity_after >= 0), reason TEXT NOT NULL, notes TEXT,\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE CASCADE\
     )",
    "CREATE INDEX IF NOT EXISTS idx_addon_stock_adjustments_item ON addon_stock_adjustments (addon_id, created_at DESC)",
    "CREATE TABLE IF NOT EXISTS finished_goods (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, product_reference TEXT NOT NULL, sale_unit TEXT NOT NULL,\
       quantity_ready INTEGER NOT NULL DEFAULT 0 CHECK (quantity_ready >= 0), quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),\
       notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),\
       CHECK (quantity_reserved <= quantity_ready)\
     )",
    "CREATE INDEX IF NOT EXISTS idx_finished_goods_product_reference ON finished_goods (product_reference, sale_unit)",
    "CREATE TABLE IF NOT EXISTS finished_good_stock_adjustments (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, finished_good_id INTEGER NOT NULL, quantity_delta INTEGER NOT NULL CHECK (quantity_delta != 0),\
       quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0), reason TEXT NOT NULL, notes TEXT,\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE CASCADE\
     )",
    "CREATE INDEX IF NOT EXISTS idx_finished_good_stock_adjustments_item ON finished_good_stock_adjustments (finished_good_id, created_at DESC)",
    "CREATE TABLE IF NOT EXISTS hueforge_design_analyses (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL UNIQUE,\
       feasibility_status TEXT NOT NULL CHECK (feasibility_status IN ('ready','needs-test','missing')),\
       feasibility_notes TEXT NOT NULL, missing_warnings TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),\
       updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE\
     )",
    "CREATE TABLE IF NOT EXISTS author_filament_requirements (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, role TEXT NOT NULL, brand TEXT NOT NULL,\
       material_type TEXT NOT NULL, color_name TEXT NOT NULL, hex_color TEXT NOT NULL, transmission_distance REAL NOT NULL,\
       required_grams REAL NOT NULL DEFAULT 0 CHECK (required_grams >= 0), layer_range TEXT, suggested_filament_id INTEGER,\
       suggested_filament_label TEXT, match_score INTEGER NOT NULL DEFAULT 0,\
       match_status TEXT NOT NULL CHECK (match_status IN ('excellent','good','test','missing')), color_distance REAL, td_delta REAL,\
       stock_signal TEXT NOT NULL, warning TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),\
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE, FOREIGN KEY (suggested_filament_id) REFERENCES filaments(id) ON DELETE SET NULL\
     )",
    "CREATE INDEX IF NOT EXISTS idx_author_filament_requirements_product ON author_filament_requirements (product_id, role)",
    "CREATE TABLE IF NOT EXISTS print_profiles (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, profile_name TEXT NOT NULL, sale_unit TEXT NOT NULL,\
       filament_grams REAL NOT NULL DEFAULT 0 CHECK (filament_grams >= 0), support_grams REAL NOT NULL DEFAULT 0 CHECK (support_grams >= 0),\
       filament_cost_per_kg REAL NOT NULL DEFAULT 0 CHECK (filament_cost_per_kg >= 0), add_on_id INTEGER, add_on_description TEXT,\
       add_on_quantity REAL NOT NULL DEFAULT 0 CHECK (add_on_quantity >= 0), add_on_cost REAL NOT NULL DEFAULT 0 CHECK (add_on_cost >= 0),\
       print_hours REAL NOT NULL DEFAULT 0 CHECK (print_hours >= 0), print_minutes REAL NOT NULL DEFAULT 0 CHECK (print_minutes >= 0),\
       electricity_rate_per_kwh REAL NOT NULL DEFAULT 0 CHECK (electricity_rate_per_kwh >= 0), printer_power_watts REAL NOT NULL DEFAULT 0 CHECK (printer_power_watts >= 0),\
       wear_rate_per_hour REAL NOT NULL DEFAULT 0 CHECK (wear_rate_per_hour >= 0), labor_minutes REAL NOT NULL DEFAULT 0 CHECK (labor_minutes >= 0),\
       labor_rate_per_hour REAL NOT NULL DEFAULT 0 CHECK (labor_rate_per_hour >= 0), expected_good_units INTEGER NOT NULL DEFAULT 1 CHECK (expected_good_units > 0),\
       expected_failed_units INTEGER NOT NULL DEFAULT 0 CHECK (expected_failed_units >= 0), target_markup REAL NOT NULL DEFAULT 3 CHECK (target_markup >= 1),\
       notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),\
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE, FOREIGN KEY (add_on_id) REFERENCES addons(id) ON DELETE SET NULL\
     )",
    "CREATE INDEX IF NOT EXISTS idx_print_profiles_product ON print_profiles (product_id, profile_name)",
    "CREATE TABLE IF NOT EXISTS print_profile_addons (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, print_profile_id INTEGER NOT NULL, addon_id INTEGER, description TEXT NOT NULL,\
       quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0), unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),\
       total_cost REAL NOT NULL DEFAULT 0 CHECK (total_cost >= 0), created_at TEXT NOT NULL DEFAULT (datetime('now')),\
       FOREIGN KEY (print_profile_id) REFERENCES print_profiles(id) ON DELETE CASCADE, FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE SET NULL\
     )",
    "CREATE INDEX IF NOT EXISTS idx_print_profile_addons_profile ON print_profile_addons (print_profile_id, id)",
    "CREATE TABLE IF NOT EXISTS production_runs (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, print_profile_id INTEGER NOT NULL, filament_id INTEGER NOT NULL, addon_id INTEGER,\
       run_date TEXT NOT NULL, expected_pieces INTEGER NOT NULL CHECK (expected_pieces > 0), good_pieces INTEGER NOT NULL CHECK (good_pieces >= 0),\
       failed_pieces INTEGER NOT NULL CHECK (failed_pieces >= 0), failure_reason TEXT, notes TEXT, filament_grams_deducted REAL NOT NULL DEFAULT 0 CHECK (filament_grams_deducted >= 0),\
       addon_quantity_deducted REAL NOT NULL DEFAULT 0 CHECK (addon_quantity_deducted >= 0), finished_good_id INTEGER,\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (good_pieces + failed_pieces > 0),\
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT, FOREIGN KEY (print_profile_id) REFERENCES print_profiles(id) ON DELETE RESTRICT,\
       FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE RESTRICT, FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE RESTRICT,\
       FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE SET NULL\
     )",
    "CREATE INDEX IF NOT EXISTS idx_production_runs_date ON production_runs (run_date DESC, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_production_runs_product ON production_runs (product_id, print_profile_id)",
    "CREATE TABLE IF NOT EXISTS production_run_filaments (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, production_run_id INTEGER NOT NULL, filament_id INTEGER NOT NULL, grams_deducted REAL NOT NULL CHECK (grams_deducted >= 0),\
       grams_before REAL NOT NULL CHECK (grams_before >= 0), grams_after REAL NOT NULL CHECK (grams_after >= 0), created_at TEXT NOT NULL DEFAULT (datetime('now')),\
       FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE CASCADE, FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE RESTRICT\
     )",
    "CREATE INDEX IF NOT EXISTS idx_production_run_filaments_run ON production_run_filaments (production_run_id)",
    "CREATE TABLE IF NOT EXISTS production_run_addons (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, production_run_id INTEGER NOT NULL, addon_id INTEGER NOT NULL, quantity_deducted REAL NOT NULL CHECK (quantity_deducted >= 0),\
       quantity_before REAL NOT NULL CHECK (quantity_before >= 0), quantity_after REAL NOT NULL CHECK (quantity_after >= 0), created_at TEXT NOT NULL DEFAULT (datetime('now')),\
       FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE CASCADE, FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE RESTRICT\
     )",
    "CREATE INDEX IF NOT EXISTS idx_production_run_addons_run ON production_run_addons (production_run_id)",
    "CREATE TABLE IF NOT EXISTS sales (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, finished_good_id INTEGER NOT NULL, product_reference TEXT NOT NULL, sale_date TEXT NOT NULL,\
       quantity INTEGER NOT NULL CHECK (quantity > 0), sale_unit TEXT NOT NULL, channel TEXT NOT NULL, gross_revenue REAL NOT NULL DEFAULT 0 CHECK (gross_revenue >= 0),\
       discounts_fees REAL NOT NULL DEFAULT 0 CHECK (discounts_fees >= 0), net_revenue REAL NOT NULL DEFAULT 0 CHECK (net_revenue >= 0), notes TEXT,\
       stock_quantity_before INTEGER NOT NULL CHECK (stock_quantity_before >= 0), stock_quantity_after INTEGER NOT NULL CHECK (stock_quantity_after >= 0),\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),\
       FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE RESTRICT\
     )",
    "CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (sale_date DESC, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_sales_channel ON sales (channel, sale_date DESC)",
    "CREATE TABLE IF NOT EXISTS sale_stock_movements (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL, finished_good_id INTEGER NOT NULL, quantity_delta INTEGER NOT NULL CHECK (quantity_delta < 0),\
       quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0), quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,\
       FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE RESTRICT\
     )",
    "CREATE INDEX IF NOT EXISTS idx_sale_stock_movements_sale ON sale_stock_movements (sale_id)",
    "CREATE TABLE IF NOT EXISTS expenses (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, vendor TEXT NOT NULL, category TEXT NOT NULL CHECK (category IN ('Filament','Equipment','Shipping','Packaging','Software','License','Membership','Utilities','Other')),\
       amount REAL NOT NULL CHECK (amount >= 0), expense_date TEXT NOT NULL, recurrence TEXT NOT NULL CHECK (recurrence IN ('one-time','monthly','annual')),\
       recurrence_month TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))\
     )",
    "CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date DESC, category)",
    "CREATE TABLE IF NOT EXISTS memberships (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, creator_name TEXT NOT NULL, platform TEXT NOT NULL, vendor TEXT NOT NULL, amount REAL NOT NULL CHECK (amount >= 0),\
       recurrence TEXT NOT NULL CHECK (recurrence IN ('one-time','monthly','annual')), recurrence_month TEXT NOT NULL,\
       membership_status TEXT NOT NULL CHECK (membership_status IN ('active','needs-renewal','expired','cancelled')),\
       commercial_use_status TEXT NOT NULL CHECK (commercial_use_status IN ('commercial-ok','missing','expired','unknown')),\
       license_notes TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))\
     )",
    "CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships (membership_status, commercial_use_status, creator_name)",
    "CREATE TABLE IF NOT EXISTS shopping_list_items (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, item_name TEXT NOT NULL, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,\
       category TEXT NOT NULL CHECK (category IN ('Filament','Hardware','Packaging','Tooling','License','Other')), quantity_needed REAL NOT NULL CHECK (quantity_needed > 0),\
       required_transmission_distance REAL CHECK (required_transmission_distance IS NULL OR required_transmission_distance >= 0), shopee_listing_name TEXT, unit TEXT NOT NULL, priority TEXT NOT NULL CHECK (priority IN ('low','normal','high')),\
       status TEXT NOT NULL CHECK (status IN ('open','purchased','ignored')), source_type TEXT NOT NULL CHECK (source_type IN ('manual','low-stock-addon','missing-hueforge-filament')),\
       source_note TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))\
     )",
    "CREATE INDEX IF NOT EXISTS idx_shopping_list_status_priority ON shopping_list_items (status, priority, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_shopping_list_product_status ON shopping_list_items (product_id, status, created_at DESC)",
    "CREATE TABLE IF NOT EXISTS shopping_list_item_products (\
       shopping_item_id INTEGER NOT NULL, product_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),\
       PRIMARY KEY (shopping_item_id, product_id), FOREIGN KEY (shopping_item_id) REFERENCES shopping_list_items(id) ON DELETE CASCADE,\
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE\
     )",
    "CREATE INDEX IF NOT EXISTS idx_shopping_list_item_products_product ON shopping_list_item_products (product_id, shopping_item_id)",
];

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use tempfile::tempdir;

    async fn connection(path: &Path) -> SqliteConnection {
        super::super::open_connection(path).await.unwrap()
    }

    #[tokio::test]
    async fn initializes_empty_database_once_and_is_repeatable() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("empty.db");
        let mut database = connection(&path).await;

        migrate(&mut database, &path).await.unwrap();
        migrate(&mut database, &path).await.unwrap();

        let version: i64 =
            sqlx::query_scalar("SELECT MAX(version) FROM _printops_schema_migrations")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let products: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='products'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&mut database)
            .await
            .unwrap();

        assert_eq!(version, CURRENT_SCHEMA_VERSION);
        assert_eq!(products, 1);
        assert_eq!(foreign_keys, 1);
    }

    #[tokio::test]
    async fn adopts_legacy_schema_preserves_data_and_creates_snapshot() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("legacy.db");
        let mut database = connection(&path).await;
        sqlx::query(
            "CREATE TABLE products (\
               id INTEGER PRIMARY KEY AUTOINCREMENT, design_name TEXT NOT NULL, source_link TEXT NOT NULL,\
               author_name TEXT NOT NULL, category TEXT NOT NULL, sale_unit TEXT NOT NULL, commercial_license_status TEXT NOT NULL,\
               notes TEXT, image_reference TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL\
             )",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO products (design_name,source_link,author_name,category,sale_unit,commercial_license_status,created_at,updated_at) \
             VALUES ('Legacy Dragon','https://example.test','Noel','Models','piece','commercial-ok','2025-01-01','2025-01-01')",
        )
        .execute(&mut database)
        .await
        .unwrap();

        migrate(&mut database, &path).await.unwrap();

        let row: (String, String, i64) = sqlx::query_as(
            "SELECT design_name, filament_mode, can_print_with_inventory FROM products WHERE id=1",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        let snapshot_exists = std::fs::read_dir(directory.path())
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("printops-studio.pre-migration-")
            });

        assert_eq!(row, ("Legacy Dragon".into(), "hueforge".into(), 0));
        assert!(snapshot_exists);
    }

    #[tokio::test]
    async fn rolls_back_all_schema_changes_when_migration_fails() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("broken-legacy.db");
        let mut database = connection(&path).await;
        sqlx::query("CREATE TABLE products (id INTEGER PRIMARY KEY)")
            .execute(&mut database)
            .await
            .unwrap();

        assert!(migrate(&mut database, &path).await.is_err());

        let migration_table: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_printops_schema_migrations'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        let added_column: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pragma_table_info('products') WHERE name='license_cost_amount'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();

        assert_eq!(migration_table, 0);
        assert_eq!(added_column, 0);
    }

    #[tokio::test]
    async fn removes_legacy_sales_channel_constraint_without_losing_sales() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("legacy-sales.db");
        let mut database = connection(&path).await;
        sqlx::query(
            "CREATE TABLE finished_goods (\
               id INTEGER PRIMARY KEY, product_reference TEXT NOT NULL, sale_unit TEXT NOT NULL, quantity_ready INTEGER NOT NULL,\
               quantity_reserved INTEGER NOT NULL, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL\
             )",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query("INSERT INTO finished_goods VALUES (1,'Dragon','piece',4,0,'','2025-01-01','2025-01-01')")
            .execute(&mut database)
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE sales (\
               id INTEGER PRIMARY KEY, finished_good_id INTEGER NOT NULL, product_reference TEXT NOT NULL, sale_date TEXT NOT NULL,\
               quantity INTEGER NOT NULL, sale_unit TEXT NOT NULL, channel TEXT NOT NULL CHECK (channel IN ('Direct','Other')),\
               gross_revenue REAL NOT NULL, discounts_fees REAL NOT NULL, net_revenue REAL NOT NULL, notes TEXT,\
               stock_quantity_before INTEGER NOT NULL, stock_quantity_after INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL\
             )",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO sales VALUES (1,1,'Dragon','2025-01-02',1,'piece','Direct',100,0,100,'',4,3,'2025-01-02','2025-01-02')",
        )
        .execute(&mut database)
        .await
        .unwrap();

        migrate(&mut database, &path).await.unwrap();

        let schema: String =
            sqlx::query_scalar("SELECT sql FROM sqlite_master WHERE type='table' AND name='sales'")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let sale: (String, f64) =
            sqlx::query_as("SELECT channel, net_revenue FROM sales WHERE id=1")
                .fetch_one(&mut database)
                .await
                .unwrap();

        assert!(!schema
            .to_ascii_lowercase()
            .contains("channel text not null check"));
        assert_eq!(sale, ("Direct".into(), 100.0));
    }
}
