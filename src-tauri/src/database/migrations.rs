use sqlx::{Connection, Row, SqliteConnection};
use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

const CURRENT_SCHEMA_VERSION: i64 = 6;

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

    if version == 5 {
        return Err(
            "This database uses the retired PrintOps schema version 5. Restore the supported schema 4 backup before opening it with this build; the rejected version 5 layout cannot be upgraded safely."
                .into(),
        );
    }

    if version == CURRENT_SCHEMA_VERSION {
        return Ok(());
    }

    if has_business_tables(connection).await? {
        create_pre_migration_snapshot(connection, database_path).await?;
    }

    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&mut *connection)
        .await
        .map_err(super::map_sqlx_error)?;

    let mut transaction = connection.begin().await.map_err(super::map_sqlx_error)?;
    let migration_result = async {
        apply_current_schema(&mut transaction).await?;
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

async fn apply_current_schema(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<(), String> {
    for statement in SCHEMA_STATEMENTS
        .iter()
        .filter(|statement| !is_index_statement(statement))
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
    migrate_expenses_constraint(transaction).await?;

    for statement in SCHEMA_STATEMENTS
        .iter()
        .filter(|statement| is_index_statement(statement))
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
    backfill_production_addon_allocations(transaction).await?;
    backfill_production_expenses(transaction).await?;

    Ok(())
}

fn is_index_statement(statement: &str) -> bool {
    statement.starts_with("CREATE INDEX") || statement.starts_with("CREATE UNIQUE INDEX")
}

async fn add_legacy_columns(connection: &mut SqliteConnection) -> Result<(), String> {
    let columns = [
        ("products", "license_cost_amount", "REAL NOT NULL DEFAULT 0"),
        ("products", "license_billing_interval", "TEXT NOT NULL DEFAULT 'none' CHECK (license_billing_interval IN ('none', 'monthly', 'quarterly', 'yearly'))"),
        ("products", "hueforge_filaments", "TEXT NOT NULL DEFAULT '[]'"),
        ("products", "filament_mode", "TEXT NOT NULL DEFAULT 'hueforge' CHECK (filament_mode IN ('hueforge', 'basic'))"),
        ("products", "can_print_with_inventory", "INTEGER NOT NULL DEFAULT 0"),
        ("products", "businesses", "TEXT NOT NULL DEFAULT '[]'"),
        ("products", "estimated_print_hours", "REAL CHECK (estimated_print_hours >= 0)"),
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
        ("expenses", "production_run_id", "INTEGER REFERENCES production_runs(id) ON DELETE CASCADE"),
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

async fn migrate_expenses_constraint(connection: &mut SqliteConnection) -> Result<(), String> {
    let create_sql: Option<String> = sqlx::query_scalar(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'expenses' LIMIT 1",
    )
    .fetch_optional(&mut *connection)
    .await
    .map_err(super::map_sqlx_error)?;
    let create_sql = create_sql.unwrap_or_default();

    if create_sql.contains("'Production'") && create_sql.contains("production_run_id") {
        return Ok(());
    }

    sqlx::query("DROP TABLE IF EXISTS expenses_migration")
        .execute(&mut *connection)
        .await
        .map_err(super::map_sqlx_error)?;
    sqlx::query(
        "CREATE TABLE expenses_migration (\
           id INTEGER PRIMARY KEY AUTOINCREMENT, vendor TEXT NOT NULL,\
           category TEXT NOT NULL CHECK (category IN ('Filament','Equipment','Shipping','Packaging','Software','License','Membership','Utilities','Production','Other')),\
           amount REAL NOT NULL CHECK (amount >= 0), expense_date TEXT NOT NULL,\
           recurrence TEXT NOT NULL CHECK (recurrence IN ('one-time','monthly','annual')), recurrence_month TEXT NOT NULL, notes TEXT,\
           production_run_id INTEGER UNIQUE REFERENCES production_runs(id) ON DELETE CASCADE,\
           created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))\
         )",
    )
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("Expense migration table creation failed: {}", super::map_sqlx_error(error)))?;
    sqlx::query(
        "INSERT INTO expenses_migration (\
           id,vendor,category,amount,expense_date,recurrence,recurrence_month,notes,production_run_id,created_at,updated_at\
         ) SELECT id,vendor,category,amount,expense_date,recurrence,recurrence_month,notes,production_run_id,created_at,updated_at FROM expenses",
    )
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("Expense data migration failed: {}", super::map_sqlx_error(error)))?;
    sqlx::query("DROP TABLE expenses")
        .execute(&mut *connection)
        .await
        .map_err(super::map_sqlx_error)?;
    sqlx::query("ALTER TABLE expenses_migration RENAME TO expenses")
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

async fn backfill_production_addon_allocations(
    connection: &mut SqliteConnection,
) -> Result<(), String> {
    sqlx::query(
        r#"INSERT OR IGNORE INTO production_run_addon_allocations (
             production_run_id, addon_id, quantity_deducted, sort_order
           )
           SELECT detail.production_run_id, detail.addon_id, SUM(detail.quantity_deducted),
             MIN(detail.id)
           FROM production_run_addons AS detail
           GROUP BY detail.production_run_id, detail.addon_id
           HAVING SUM(detail.quantity_deducted) > 0"#,
    )
    .execute(&mut *connection)
    .await
    .map_err(|error| {
        format!(
            "Production add-on allocation backfill failed: {}",
            super::map_sqlx_error(error)
        )
    })?;

    sqlx::query(
        r#"INSERT OR IGNORE INTO production_run_addon_allocations (
             production_run_id, addon_id, quantity_deducted, sort_order
           )
           SELECT run.id, run.addon_id, run.addon_quantity_deducted, 0
           FROM production_runs AS run
           WHERE run.addon_id IS NOT NULL AND run.addon_quantity_deducted > 0
             AND NOT EXISTS (
               SELECT 1 FROM production_run_addon_allocations AS allocation
               WHERE allocation.production_run_id = run.id
             )"#,
    )
    .execute(connection)
    .await
    .map_err(|error| {
        format!(
            "Legacy production add-on allocation backfill failed: {}",
            super::map_sqlx_error(error)
        )
    })?;

    Ok(())
}

async fn backfill_production_expenses(connection: &mut SqliteConnection) -> Result<(), String> {
    let run_ids: Vec<i64> = sqlx::query_scalar(
        "SELECT run.id FROM production_runs AS run \
         WHERE NOT EXISTS (SELECT 1 FROM expenses WHERE production_run_id = run.id) \
         ORDER BY run.id",
    )
    .fetch_all(&mut *connection)
    .await
    .map_err(super::map_sqlx_error)?;

    for run_id in run_ids {
        let expense = super::production_cost::calculate(connection, run_id).await?;
        super::production_cost::insert(connection, &expense).await?;
    }

    Ok(())
}

const SCHEMA_STATEMENTS: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS products (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, design_name TEXT NOT NULL, source_link TEXT NOT NULL,\
       author_name TEXT NOT NULL, category TEXT NOT NULL, sale_unit TEXT NOT NULL,\
       commercial_license_status TEXT NOT NULL CHECK (commercial_license_status IN ('commercial-ok','permission-needed','personal-use','unknown')),\
       license_cost_amount REAL NOT NULL DEFAULT 0,\
       license_billing_interval TEXT NOT NULL DEFAULT 'none' CHECK (license_billing_interval IN ('none','monthly','quarterly','yearly')),\
       filament_mode TEXT NOT NULL DEFAULT 'hueforge' CHECK (filament_mode IN ('hueforge','basic')),\
       hueforge_filaments TEXT NOT NULL DEFAULT '[]', can_print_with_inventory INTEGER NOT NULL DEFAULT 0,\
       businesses TEXT NOT NULL DEFAULT '[]', estimated_print_hours REAL CHECK (estimated_print_hours >= 0),\
       notes TEXT, image_reference TEXT,\
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
    "CREATE TABLE IF NOT EXISTS production_run_addon_allocations (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, production_run_id INTEGER NOT NULL, addon_id INTEGER NOT NULL,\
       quantity_deducted REAL NOT NULL CHECK (quantity_deducted > 0), sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),\
       UNIQUE (production_run_id, addon_id), FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE CASCADE,\
       FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE RESTRICT\
     )",
    "CREATE INDEX IF NOT EXISTS idx_production_run_addon_allocations_run ON production_run_addon_allocations (production_run_id, sort_order, id)",
    "CREATE TABLE IF NOT EXISTS production_run_corrections (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, production_run_id INTEGER NOT NULL, correction_type TEXT NOT NULL CHECK (correction_type IN ('addons')),\
       reason TEXT NOT NULL CHECK (length(trim(reason)) > 0), created_at TEXT NOT NULL DEFAULT (datetime('now')),\
       FOREIGN KEY (production_run_id) REFERENCES production_runs(id) ON DELETE CASCADE\
     )",
    "CREATE INDEX IF NOT EXISTS idx_production_run_corrections_run ON production_run_corrections (production_run_id, created_at DESC, id DESC)",
    "CREATE TABLE IF NOT EXISTS production_run_addon_correction_items (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, correction_id INTEGER NOT NULL, addon_id INTEGER NOT NULL, quantity_delta REAL NOT NULL CHECK (quantity_delta <> 0),\
       run_quantity_before REAL NOT NULL CHECK (run_quantity_before >= 0), run_quantity_after REAL NOT NULL CHECK (run_quantity_after >= 0),\
       stock_quantity_before REAL NOT NULL CHECK (stock_quantity_before >= 0), stock_quantity_after REAL NOT NULL CHECK (stock_quantity_after >= 0),\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (correction_id, addon_id),\
       FOREIGN KEY (correction_id) REFERENCES production_run_corrections(id) ON DELETE CASCADE,\
       FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE RESTRICT\
     )",
    "CREATE INDEX IF NOT EXISTS idx_production_run_addon_correction_items_event ON production_run_addon_correction_items (correction_id, id)",
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
    "CREATE TABLE IF NOT EXISTS print_plans (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, plan_date TEXT NOT NULL, window_start TEXT NOT NULL, window_end TEXT NOT NULL,\
       history_days INTEGER NOT NULL CHECK (history_days > 0), target_days INTEGER NOT NULL CHECK (target_days > 0),\
       algorithm_version INTEGER NOT NULL CHECK (algorithm_version > 0), warnings TEXT NOT NULL DEFAULT '[]',\
       created_at TEXT NOT NULL DEFAULT (datetime('now'))\
     )",
    "CREATE INDEX IF NOT EXISTS idx_print_plans_date ON print_plans (plan_date DESC, created_at DESC)",
    "CREATE TABLE IF NOT EXISTS print_plan_items (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL, product_id INTEGER, product_name TEXT NOT NULL, sale_unit TEXT NOT NULL,\
       business_id TEXT NOT NULL CHECK (business_id IN ('sincerely','flora','dear-reader','angkong-dimsum','stomping')), business_name TEXT NOT NULL,\
       inventory_count INTEGER NOT NULL CHECK (inventory_count >= 0), units_sold INTEGER NOT NULL CHECK (units_sold >= 0),\
       target_quantity INTEGER NOT NULL CHECK (target_quantity >= 0), recommended_quantity INTEGER NOT NULL CHECK (recommended_quantity >= 0),\
       days_of_stock REAL CHECK (days_of_stock IS NULL OR days_of_stock >= 0),\
       status TEXT NOT NULL CHECK (status IN ('covered','no-history','print')),\
       FOREIGN KEY (plan_id) REFERENCES print_plans(id) ON DELETE CASCADE, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,\
       UNIQUE (plan_id, business_id, product_id)\
     )",
    "CREATE INDEX IF NOT EXISTS idx_print_plan_items_plan ON print_plan_items (plan_id, business_id, product_name)",
    "CREATE TABLE IF NOT EXISTS sale_stock_movements (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL, finished_good_id INTEGER NOT NULL, quantity_delta INTEGER NOT NULL CHECK (quantity_delta < 0),\
       quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0), quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,\
       FOREIGN KEY (finished_good_id) REFERENCES finished_goods(id) ON DELETE RESTRICT\
     )",
    "CREATE INDEX IF NOT EXISTS idx_sale_stock_movements_sale ON sale_stock_movements (sale_id)",
    "CREATE TABLE IF NOT EXISTS expenses (\
       id INTEGER PRIMARY KEY AUTOINCREMENT, vendor TEXT NOT NULL, category TEXT NOT NULL CHECK (category IN ('Filament','Equipment','Shipping','Packaging','Software','License','Membership','Utilities','Production','Other')),\
       amount REAL NOT NULL CHECK (amount >= 0), expense_date TEXT NOT NULL, recurrence TEXT NOT NULL CHECK (recurrence IN ('one-time','monthly','annual')),\
       recurrence_month TEXT NOT NULL, notes TEXT, production_run_id INTEGER UNIQUE REFERENCES production_runs(id) ON DELETE CASCADE,\
       created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))\
     )",
    "CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date DESC, category)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_production_run ON expenses (production_run_id) WHERE production_run_id IS NOT NULL",
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
        let planner_tables: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('print_plans','print_plan_items')",
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
        assert_eq!(planner_tables, 2);
        assert_eq!(foreign_keys, 1);
    }

    #[tokio::test]
    async fn upgrades_schema_four_directly_to_six_with_planner_tables() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("schema-four.db");
        let mut database = connection(&path).await;

        for statement in SCHEMA_STATEMENTS.iter().filter(|statement| {
            !statement.contains("print_plans") && !statement.contains("print_plan_items")
        }) {
            sqlx::query(statement).execute(&mut database).await.unwrap();
        }
        sqlx::query(
            "CREATE TABLE _printops_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query("INSERT INTO _printops_schema_migrations (version) VALUES (4)")
            .execute(&mut database)
            .await
            .unwrap();

        migrate(&mut database, &path).await.unwrap();

        let version: i64 =
            sqlx::query_scalar("SELECT MAX(version) FROM _printops_schema_migrations")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let planner_tables: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('print_plans','print_plan_items')",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();

        assert_eq!(version, 6);
        assert_eq!(planner_tables, 2);
    }

    #[tokio::test]
    async fn rejects_the_retired_schema_five_layout() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("retired-five.db");
        let mut database = connection(&path).await;
        sqlx::query(
            "CREATE TABLE _printops_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query("INSERT INTO _printops_schema_migrations (version) VALUES (5)")
            .execute(&mut database)
            .await
            .unwrap();

        let error = migrate(&mut database, &path).await.unwrap_err();

        assert!(error.contains("retired PrintOps schema version 5"));
        let planner_tables: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='print_plans'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        assert_eq!(planner_tables, 0);
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
    async fn upgrades_v1_products_with_optional_print_hours_without_losing_data() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("v1.db");
        let mut database = connection(&path).await;

        for statement in SCHEMA_STATEMENTS {
            let v1_statement = statement.replace(
                ", estimated_print_hours REAL CHECK (estimated_print_hours >= 0)",
                "",
            );
            sqlx::query(&v1_statement)
                .execute(&mut database)
                .await
                .unwrap();
        }
        sqlx::query(
            "CREATE TABLE _printops_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query("INSERT INTO _printops_schema_migrations (version) VALUES (1)")
            .execute(&mut database)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO products (design_name,source_link,author_name,category,sale_unit,commercial_license_status) \
             VALUES ('Legacy Bookmark','https://example.test','Noel','Bookmarks','piece','commercial-ok')",
        )
        .execute(&mut database)
        .await
        .unwrap();

        migrate(&mut database, &path).await.unwrap();

        let row: (String, Option<f64>) =
            sqlx::query_as("SELECT design_name, estimated_print_hours FROM products WHERE id=1")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let version: i64 =
            sqlx::query_scalar("SELECT MAX(version) FROM _printops_schema_migrations")
                .fetch_one(&mut database)
                .await
                .unwrap();

        assert_eq!(row, ("Legacy Bookmark".into(), None));
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
        assert!(
            sqlx::query("UPDATE products SET estimated_print_hours = -1 WHERE id=1")
                .execute(&mut database)
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn upgrades_v2_and_backfills_linked_production_expenses_once() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("v2-production.db");
        let mut database = connection(&path).await;

        for statement in SCHEMA_STATEMENTS {
            if statement.contains("idx_expenses_production_run") {
                continue;
            }

            let v2_statement = statement
                .replace(",'Production'", "")
                .replace(", production_run_id INTEGER UNIQUE REFERENCES production_runs(id) ON DELETE CASCADE", "");
            sqlx::query(&v2_statement)
                .execute(&mut database)
                .await
                .unwrap();
        }
        sqlx::query(
            "CREATE TABLE _printops_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query("INSERT INTO _printops_schema_migrations (version) VALUES (2)")
            .execute(&mut database)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO products (id,design_name,source_link,author_name,category,sale_unit,commercial_license_status) \
             VALUES (1,'Costed Dragon','https://example.test','Noel','Models','piece','commercial-ok')",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO filaments (id,brand,name,material_type,color_name,hex_color,spool_status,starting_grams,estimated_grams_left,spool_cost) \
             VALUES (2,'Brand','Black','PLA','Black','#000000','open',1000,900,1000)",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO addons (id,item_name,category,unit,quantity_on_hand,unit_cost) \
             VALUES (3,'Clasp','Hardware','pcs',20,3)",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO print_profiles (\
               id,product_id,profile_name,sale_unit,filament_grams,support_grams,filament_cost_per_kg,\
               print_hours,print_minutes,electricity_rate_per_kwh,printer_power_watts,wear_rate_per_hour,\
               labor_minutes,labor_rate_per_hour,expected_good_units,expected_failed_units,target_markup\
             ) VALUES (4,1,'Standard','piece',10,0,1000,1,0,10,100,4,30,20,1,0,3)",
        )
        .execute(&mut database)
        .await
        .unwrap();
        for (id, grams, addon_quantity, run_date) in [
            (5_i64, 10.0_f64, 2.0_f64, "2026-07-10"),
            (6_i64, 5.0_f64, 1.0_f64, "2026-07-11"),
        ] {
            sqlx::query(
                "INSERT INTO production_runs (\
                   id,product_id,print_profile_id,filament_id,addon_id,run_date,expected_pieces,good_pieces,failed_pieces,\
                   filament_grams_deducted,addon_quantity_deducted\
                 ) VALUES ($1,1,4,2,3,$2,1,1,0,$3,$4)",
            )
            .bind(id)
            .bind(run_date)
            .bind(grams)
            .bind(addon_quantity)
            .execute(&mut database)
            .await
                .unwrap();
        }
        sqlx::query(
            "UPDATE production_runs SET addon_id=NULL, addon_quantity_deducted=0 WHERE id=6",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO production_run_filaments (production_run_id,filament_id,grams_deducted,grams_before,grams_after) \
             VALUES (5,2,10,100,90)",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO production_run_addons (production_run_id,addon_id,quantity_deducted,quantity_before,quantity_after) \
             VALUES (5,3,2,20,18)",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO expenses (vendor,category,amount,expense_date,recurrence,recurrence_month,notes) \
             VALUES ('Manual Vendor','Other',5,'2026-07-01','one-time','2026-07','keep me')",
        )
        .execute(&mut database)
        .await
        .unwrap();

        migrate(&mut database, &path).await.unwrap();
        migrate(&mut database, &path).await.unwrap();

        let expenses: Vec<(String, f64, Option<i64>)> =
            sqlx::query_as("SELECT vendor,amount,production_run_id FROM expenses ORDER BY id")
                .fetch_all(&mut database)
                .await
                .unwrap();
        let version: i64 =
            sqlx::query_scalar("SELECT MAX(version) FROM _printops_schema_migrations")
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

        assert_eq!(version, CURRENT_SCHEMA_VERSION);
        assert_eq!(
            expenses,
            vec![
                ("Manual Vendor".into(), 5.0, None),
                ("Costed Dragon".into(), 31.0, Some(5)),
                ("Costed Dragon".into(), 20.0, Some(6)),
            ]
        );
        assert!(snapshot_exists);

        sqlx::query("DELETE FROM production_runs WHERE id=6")
            .execute(&mut database)
            .await
            .unwrap();
        let remaining_expenses: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM expenses")
            .fetch_one(&mut database)
            .await
            .unwrap();
        assert_eq!(remaining_expenses, 2);
    }

    #[tokio::test]
    async fn upgrades_v3_and_backfills_current_addon_allocations_without_rewriting_history() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("v3-production-corrections.db");
        let mut database = connection(&path).await;

        for statement in SCHEMA_STATEMENTS.iter().filter(|statement| {
            !statement.contains("production_run_addon_allocations")
                && !statement.contains("production_run_corrections")
                && !statement.contains("production_run_addon_correction_items")
        }) {
            sqlx::query(statement).execute(&mut database).await.unwrap();
        }
        sqlx::query(
            "CREATE TABLE _printops_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query("INSERT INTO _printops_schema_migrations (version) VALUES (3)")
            .execute(&mut database)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO products (id,design_name,source_link,author_name,category,sale_unit,commercial_license_status) \
             VALUES (1,'Allocation Test','https://example.test','Noel','Models','piece','commercial-ok')",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO filaments (id,brand,name,material_type,color_name,hex_color,spool_status,starting_grams,estimated_grams_left,spool_cost) \
             VALUES (2,'Brand','Black','PLA','Black','#000000','open',1000,900,0)",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO addons (id,item_name,category,unit,quantity_on_hand,unit_cost) \
             VALUES (3,'Clasp','Hardware','pcs',20,2)",
        )
        .execute(&mut database)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO print_profiles (\
               id,product_id,profile_name,sale_unit,filament_grams,support_grams,filament_cost_per_kg,\
               print_hours,print_minutes,electricity_rate_per_kwh,printer_power_watts,wear_rate_per_hour,\
               labor_minutes,labor_rate_per_hour,expected_good_units,expected_failed_units,target_markup\
             ) VALUES (4,1,'Standard','piece',0,0,0,0,0,0,0,0,0,0,1,0,1)",
        )
        .execute(&mut database)
        .await
        .unwrap();
        for (id, quantity) in [(5_i64, 2.0_f64), (6_i64, 3.0_f64)] {
            sqlx::query(
                "INSERT INTO production_runs (\
                   id,product_id,print_profile_id,filament_id,addon_id,run_date,expected_pieces,good_pieces,failed_pieces,\
                   filament_grams_deducted,addon_quantity_deducted\
                 ) VALUES ($1,1,4,2,3,'2026-07-17',1,1,0,0,$2)",
            )
            .bind(id)
            .bind(quantity)
            .execute(&mut database)
            .await
            .unwrap();
        }
        sqlx::query(
            "INSERT INTO production_run_addons (production_run_id,addon_id,quantity_deducted,quantity_before,quantity_after) \
             VALUES (5,3,2,20,18)",
        )
        .execute(&mut database)
        .await
        .unwrap();

        migrate(&mut database, &path).await.unwrap();
        migrate(&mut database, &path).await.unwrap();

        let allocations: Vec<(i64, i64, f64)> = sqlx::query_as(
            "SELECT production_run_id,addon_id,quantity_deducted FROM production_run_addon_allocations ORDER BY production_run_id",
        )
        .fetch_all(&mut database)
        .await
        .unwrap();
        let original_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM production_run_addons")
            .fetch_one(&mut database)
            .await
            .unwrap();
        let version: i64 =
            sqlx::query_scalar("SELECT MAX(version) FROM _printops_schema_migrations")
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

        assert_eq!(allocations, vec![(5, 3, 2.0), (6, 3, 3.0)]);
        assert_eq!(original_rows, 1);
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
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
