mod database;

use serde::{Deserialize, Serialize};
use sqlx::Connection;
use tauri::{Manager, State};

use database::DatabaseState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordSaleInput {
    finished_good_id: i64,
    product_reference: String,
    sale_date: String,
    quantity: i64,
    sale_unit: String,
    channel: String,
    gross_revenue: f64,
    discounts_fees: f64,
    net_revenue: f64,
    notes: String,
    stock_quantity_before: i64,
    stock_quantity_after: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordSaleOutput {
    sale_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductionFilamentDeductionInput {
    filament_id: i64,
    grams_after: f64,
    grams_before: f64,
    grams_deducted: f64,
    notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductionAddOnDeductionInput {
    add_on_id: i64,
    quantity_after: f64,
    quantity_before: f64,
    quantity_deducted: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductionFinishedGoodOutputInput {
    finished_good_id: Option<i64>,
    product_reference: String,
    quantity_after: i64,
    quantity_before: i64,
    sale_unit: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordProductionRunInput {
    add_on_deductions: Vec<ProductionAddOnDeductionInput>,
    add_on_id: Option<i64>,
    add_on_quantity_deducted: f64,
    expected_pieces: i64,
    failed_pieces: i64,
    failure_reason: String,
    filament_deductions: Vec<ProductionFilamentDeductionInput>,
    filament_grams_deducted: f64,
    filament_id: i64,
    finished_good_output: Option<ProductionFinishedGoodOutputInput>,
    good_pieces: i64,
    notes: String,
    print_profile_id: i64,
    product_id: i64,
    run_date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordProductionRunOutput {
    run_id: i64,
}

#[tauri::command]
async fn record_sale_with_stock_movement(
    state: State<'_, DatabaseState>,
    input: RecordSaleInput,
) -> Result<RecordSaleOutput, String> {
    let expected_net = ((input.gross_revenue - input.discounts_fees) * 100.0).round() / 100.0;
    if input.finished_good_id <= 0
        || input.quantity <= 0
        || input.product_reference.trim().is_empty()
        || input.sale_date.trim().is_empty()
        || !database::is_sale_unit(&input.sale_unit)
        || !matches!(
            input.channel.as_str(),
            "Direct" | "Sincerely" | "Dear Reader" | "Flora"
        )
        || !input.gross_revenue.is_finite()
        || !input.discounts_fees.is_finite()
        || !input.net_revenue.is_finite()
        || input.gross_revenue < 0.0
        || input.discounts_fees < 0.0
        || input.discounts_fees > input.gross_revenue
        || (input.net_revenue - expected_net).abs() > 0.005
    {
        return Err("Sale values are invalid or inconsistent.".into());
    }

    if input.stock_quantity_before < 0
        || input.stock_quantity_after != input.stock_quantity_before - input.quantity
    {
        return Err("Sale stock movement does not match the sale quantity.".into());
    }

    if input.stock_quantity_after < 0 {
        return Err("Sale cannot reduce ready quantity below zero.".into());
    }

    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .ok_or_else(|| "The database connection is not available.".to_string())?;
    record_sale_on_connection(connection, &input).await
}

async fn record_sale_on_connection(
    connection: &mut sqlx::SqliteConnection,
    input: &RecordSaleInput,
) -> Result<RecordSaleOutput, String> {
    let mut transaction = connection.begin().await.map_err(database::map_sqlx_error)?;

    let stock_result = sqlx::query(
        r#"UPDATE finished_goods
         SET
          quantity_ready = $1,
          updated_at = datetime('now')
         WHERE id = $2
          AND quantity_ready = $3
          AND quantity_reserved <= $1
          AND product_reference = $4
          AND sale_unit = $5"#,
    )
    .bind(input.stock_quantity_after)
    .bind(input.finished_good_id)
    .bind(input.stock_quantity_before)
    .bind(input.product_reference.trim())
    .bind(input.sale_unit.trim())
    .execute(&mut *transaction)
    .await
    .map_err(database::map_sqlx_error)?;

    if stock_result.rows_affected() == 0 {
        transaction
            .rollback()
            .await
            .map_err(database::map_sqlx_error)?;
        return Err("Finished goods stock changed before the sale could be recorded.".into());
    }

    sqlx::query(
        r#"INSERT INTO finished_good_stock_adjustments (
          finished_good_id,
          quantity_delta,
          quantity_after,
          reason,
          notes
        ) VALUES ($1, $2, $3, $4, $5)"#,
    )
    .bind(input.finished_good_id)
    .bind(-input.quantity)
    .bind(input.stock_quantity_after)
    .bind("sale")
    .bind(sale_adjustment_note(input))
    .execute(&mut *transaction)
    .await
    .map_err(database::map_sqlx_error)?;

    let sale_result = sqlx::query(
        r#"INSERT INTO sales (
          finished_good_id,
          product_reference,
          sale_date,
          quantity,
          sale_unit,
          channel,
          gross_revenue,
          discounts_fees,
          net_revenue,
          notes,
          stock_quantity_before,
          stock_quantity_after
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"#,
    )
    .bind(input.finished_good_id)
    .bind(input.product_reference.trim())
    .bind(input.sale_date.trim())
    .bind(input.quantity)
    .bind(&input.sale_unit)
    .bind(&input.channel)
    .bind(input.gross_revenue)
    .bind(input.discounts_fees)
    .bind(input.net_revenue)
    .bind(input.notes.trim())
    .bind(input.stock_quantity_before)
    .bind(input.stock_quantity_after)
    .execute(&mut *transaction)
    .await
    .map_err(database::map_sqlx_error)?;
    let sale_id = sale_result.last_insert_rowid();

    sqlx::query(
        r#"INSERT INTO sale_stock_movements (
          sale_id,
          finished_good_id,
          quantity_delta,
          quantity_before,
          quantity_after
        ) VALUES ($1, $2, $3, $4, $5)"#,
    )
    .bind(sale_id)
    .bind(input.finished_good_id)
    .bind(-input.quantity)
    .bind(input.stock_quantity_before)
    .bind(input.stock_quantity_after)
    .execute(&mut *transaction)
    .await
    .map_err(database::map_sqlx_error)?;

    transaction
        .commit()
        .await
        .map_err(database::map_sqlx_error)?;

    Ok(RecordSaleOutput { sale_id })
}

#[tauri::command]
async fn record_production_run(
    state: State<'_, DatabaseState>,
    input: RecordProductionRunInput,
) -> Result<RecordProductionRunOutput, String> {
    if input.product_id <= 0
        || input.print_profile_id <= 0
        || input.filament_id <= 0
        || input.run_date.trim().is_empty()
        || input.expected_pieces <= 0
        || input.good_pieces < 0
        || input.failed_pieces < 0
        || input.good_pieces + input.failed_pieces <= 0
    {
        return Err("Production piece counts are invalid.".into());
    }

    if !input.filament_grams_deducted.is_finite()
        || !input.add_on_quantity_deducted.is_finite()
        || input.filament_grams_deducted < 0.0
        || input.add_on_quantity_deducted < 0.0
    {
        return Err("Production deductions cannot be negative.".into());
    }

    let filament_total: f64 = input
        .filament_deductions
        .iter()
        .map(|deduction| deduction.grams_deducted)
        .sum();

    if (filament_total - input.filament_grams_deducted).abs() > 0.000_001 {
        return Err("Production filament total does not match its deductions.".into());
    }

    let add_on_total = input
        .add_on_deductions
        .iter()
        .map(|deduction| deduction.quantity_deducted)
        .sum::<f64>();

    if (add_on_total - input.add_on_quantity_deducted).abs() > 0.000_001 {
        return Err("Production add-on total does not match its deduction.".into());
    }

    if input.add_on_id
        != input
            .add_on_deductions
            .first()
            .map(|deduction| deduction.add_on_id)
    {
        return Err("Production add-on summary does not match its deductions.".into());
    }

    if input
        .filament_deductions
        .first()
        .is_none_or(|deduction| deduction.filament_id != input.filament_id)
    {
        return Err("Production filament summary does not match its deductions.".into());
    }

    let mut add_on_ids = std::collections::HashSet::new();
    if input
        .add_on_deductions
        .iter()
        .any(|deduction| !add_on_ids.insert(deduction.add_on_id))
    {
        return Err("Each production add-on can only be deducted once.".into());
    }

    if (input.good_pieces > 0) != input.finished_good_output.is_some() {
        return Err("Finished goods output does not match the good piece count.".into());
    }

    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .ok_or_else(|| "The database connection is not available.".to_string())?;
    record_production_run_on_connection(connection, &input).await
}

async fn record_production_run_on_connection(
    connection: &mut sqlx::SqliteConnection,
    input: &RecordProductionRunInput,
) -> Result<RecordProductionRunOutput, String> {
    let mut transaction = connection.begin().await.map_err(database::map_sqlx_error)?;

    let identity_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM print_profiles AS profile \
         JOIN products AS product ON product.id = profile.product_id \
         JOIN filaments AS filament ON filament.id = $3 \
         WHERE product.id = $1 AND profile.id = $2",
    )
    .bind(input.product_id)
    .bind(input.print_profile_id)
    .bind(input.filament_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(database::map_sqlx_error)?;

    if identity_count != 1 {
        return Err("Production product, print profile, or filament identity is invalid.".into());
    }

    for deduction in &input.filament_deductions {
        if deduction.filament_id <= 0
            || !deduction.grams_before.is_finite()
            || !deduction.grams_after.is_finite()
            || !deduction.grams_deducted.is_finite()
            || deduction.grams_before < 0.0
            || deduction.grams_deducted < 0.0
            || deduction.grams_after < 0.0
            || (deduction.grams_before - deduction.grams_deducted - deduction.grams_after).abs()
                > 0.000_001
        {
            return Err("Filament deduction values are inconsistent.".into());
        }

        if deduction.grams_deducted > 0.0 {
            let result = sqlx::query(
                r#"UPDATE filaments
                   SET estimated_grams_left = $1, updated_at = datetime('now')
                   WHERE id = $2 AND ABS(estimated_grams_left - $3) < 0.000001"#,
            )
            .bind(deduction.grams_after)
            .bind(deduction.filament_id)
            .bind(deduction.grams_before)
            .execute(&mut *transaction)
            .await
            .map_err(database::map_sqlx_error)?;

            if result.rows_affected() == 0 {
                return Err(
                    "Filament stock changed before the production run could be saved.".into(),
                );
            }

            sqlx::query(
                r#"INSERT INTO filament_stock_adjustments (
                     filament_id, grams_delta, grams_after, reason, notes
                   ) VALUES ($1, $2, $3, $4, $5)"#,
            )
            .bind(deduction.filament_id)
            .bind(-deduction.grams_deducted)
            .bind(deduction.grams_after)
            .bind("production run deduction")
            .bind(deduction.notes.trim())
            .execute(&mut *transaction)
            .await
            .map_err(database::map_sqlx_error)?;
        }
    }

    for deduction in &input.add_on_deductions {
        if deduction.add_on_id <= 0
            || !deduction.quantity_before.is_finite()
            || !deduction.quantity_after.is_finite()
            || !deduction.quantity_deducted.is_finite()
            || deduction.quantity_before < 0.0
            || deduction.quantity_deducted <= 0.0
            || deduction.quantity_after < 0.0
            || (deduction.quantity_before - deduction.quantity_deducted - deduction.quantity_after)
                .abs()
                > 0.000_001
        {
            return Err("Add-on deduction values are inconsistent.".into());
        }

        let result = sqlx::query(
            r#"UPDATE addons
               SET quantity_on_hand = $1, updated_at = datetime('now')
               WHERE id = $2 AND ABS(quantity_on_hand - $3) < 0.000001"#,
        )
        .bind(deduction.quantity_after)
        .bind(deduction.add_on_id)
        .bind(deduction.quantity_before)
        .execute(&mut *transaction)
        .await
        .map_err(database::map_sqlx_error)?;

        if result.rows_affected() == 0 {
            return Err("Add-on stock changed before the production run could be saved.".into());
        }

        sqlx::query(
            r#"INSERT INTO addon_stock_adjustments (
                 addon_id, quantity_delta, quantity_after, reason, notes
               ) VALUES ($1, $2, $3, $4, $5)"#,
        )
        .bind(deduction.add_on_id)
        .bind(-deduction.quantity_deducted)
        .bind(deduction.quantity_after)
        .bind("production run deduction")
        .bind(production_adjustment_note(input))
        .execute(&mut *transaction)
        .await
        .map_err(database::map_sqlx_error)?;
    }

    let mut finished_good_id = None;

    if let Some(output) = &input.finished_good_output {
        if output.finished_good_id.is_some_and(|id| id <= 0)
            || output.product_reference.trim().is_empty()
            || !database::is_sale_unit(&output.sale_unit)
            || output.quantity_before < 0
            || output.quantity_after != output.quantity_before + input.good_pieces
        {
            return Err("Finished goods output does not match the good piece count.".into());
        }

        let id = if let Some(existing_id) = output.finished_good_id {
            let result = sqlx::query(
                r#"UPDATE finished_goods
                   SET quantity_ready = $1, updated_at = datetime('now')
                   WHERE id = $2 AND quantity_ready = $3 AND quantity_reserved <= $1
                     AND product_reference = $4 AND sale_unit = $5"#,
            )
            .bind(output.quantity_after)
            .bind(existing_id)
            .bind(output.quantity_before)
            .bind(output.product_reference.trim())
            .bind(output.sale_unit.trim())
            .execute(&mut *transaction)
            .await
            .map_err(database::map_sqlx_error)?;

            if result.rows_affected() == 0 {
                return Err(
                    "Finished goods stock changed before the production run could be saved.".into(),
                );
            }

            existing_id
        } else {
            if output.quantity_before != 0 {
                return Err("New finished goods must start at zero quantity.".into());
            }

            let result = sqlx::query(
                r#"INSERT INTO finished_goods (
                     product_reference, sale_unit, quantity_ready, quantity_reserved, notes
                   ) VALUES ($1, $2, $3, 0, $4)"#,
            )
            .bind(output.product_reference.trim())
            .bind(output.sale_unit.trim())
            .bind(output.quantity_after)
            .bind("Created by production run logging.")
            .execute(&mut *transaction)
            .await
            .map_err(database::map_sqlx_error)?;

            result.last_insert_rowid()
        };

        sqlx::query(
            r#"INSERT INTO finished_good_stock_adjustments (
                 finished_good_id, quantity_delta, quantity_after, reason, notes
               ) VALUES ($1, $2, $3, $4, $5)"#,
        )
        .bind(id)
        .bind(input.good_pieces)
        .bind(output.quantity_after)
        .bind("production run output")
        .bind(production_adjustment_note(input))
        .execute(&mut *transaction)
        .await
        .map_err(database::map_sqlx_error)?;

        finished_good_id = Some(id);
    }

    let run_result = sqlx::query(
        r#"INSERT INTO production_runs (
             product_id, print_profile_id, filament_id, addon_id, run_date,
             expected_pieces, good_pieces, failed_pieces, failure_reason, notes,
             filament_grams_deducted, addon_quantity_deducted, finished_good_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)"#,
    )
    .bind(input.product_id)
    .bind(input.print_profile_id)
    .bind(input.filament_id)
    .bind(input.add_on_id)
    .bind(input.run_date.trim())
    .bind(input.expected_pieces)
    .bind(input.good_pieces)
    .bind(input.failed_pieces)
    .bind(input.failure_reason.trim())
    .bind(input.notes.trim())
    .bind(input.filament_grams_deducted)
    .bind(input.add_on_quantity_deducted)
    .bind(finished_good_id)
    .execute(&mut *transaction)
    .await
    .map_err(database::map_sqlx_error)?;
    let run_id = run_result.last_insert_rowid();

    for deduction in &input.filament_deductions {
        sqlx::query(
            r#"INSERT INTO production_run_filaments (
                 production_run_id, filament_id, grams_deducted, grams_before, grams_after
               ) VALUES ($1, $2, $3, $4, $5)"#,
        )
        .bind(run_id)
        .bind(deduction.filament_id)
        .bind(deduction.grams_deducted)
        .bind(deduction.grams_before)
        .bind(deduction.grams_after)
        .execute(&mut *transaction)
        .await
        .map_err(database::map_sqlx_error)?;
    }

    for deduction in &input.add_on_deductions {
        sqlx::query(
            r#"INSERT INTO production_run_addons (
                 production_run_id, addon_id, quantity_deducted, quantity_before, quantity_after
               ) VALUES ($1, $2, $3, $4, $5)"#,
        )
        .bind(run_id)
        .bind(deduction.add_on_id)
        .bind(deduction.quantity_deducted)
        .bind(deduction.quantity_before)
        .bind(deduction.quantity_after)
        .execute(&mut *transaction)
        .await
        .map_err(database::map_sqlx_error)?;
    }

    transaction
        .commit()
        .await
        .map_err(database::map_sqlx_error)?;

    Ok(RecordProductionRunOutput { run_id })
}

fn production_adjustment_note(input: &RecordProductionRunInput) -> String {
    let failure_text = if input.failed_pieces > 0 {
        format!(", {} failed", input.failed_pieces)
    } else {
        String::new()
    };

    format!(
        "Run {}: {} good{}. {}",
        input.run_date.trim(),
        input.good_pieces,
        failure_text,
        input.notes.trim()
    )
    .trim()
    .to_string()
}

fn sale_adjustment_note(input: &RecordSaleInput) -> String {
    format!(
        "Sale {}: {} {} via {}. {}",
        input.sale_date.trim(),
        input.quantity,
        input.sale_unit,
        input.channel,
        input.notes.trim()
    )
    .trim()
    .to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    builder
        .setup(|app| {
            let state = tauri::async_runtime::block_on(database::create_state(app.handle()))
                .map_err(std::io::Error::other)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            database::db_execute,
            database::db_select,
            database::export_database_snapshot,
            database::restore_database_snapshot,
            database::workflows::adjust_addon_stock,
            database::workflows::adjust_filament_stock,
            database::workflows::adjust_finished_good_stock,
            database::workflows::delete_product,
            database::workflows::save_hueforge_analysis,
            database::workflows::save_print_profile,
            database::workflows::save_shopping_item,
            database::workflows::update_sale_details,
            database::workflows::upsert_filament_profiles,
            record_sale_with_stock_movement,
            record_production_run
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

#[cfg(test)]
mod workflow_tests {
    use super::*;
    use sqlx::{Connection, SqliteConnection};

    #[tokio::test]
    async fn sale_rolls_back_stock_and_ledgers_when_insert_fails() {
        let mut database = SqliteConnection::connect("sqlite::memory:").await.unwrap();
        for statement in [
            "CREATE TABLE finished_goods (id INTEGER PRIMARY KEY, product_reference TEXT NOT NULL, sale_unit TEXT NOT NULL, quantity_ready INTEGER NOT NULL, quantity_reserved INTEGER NOT NULL, updated_at TEXT)",
            "CREATE TABLE finished_good_stock_adjustments (id INTEGER PRIMARY KEY, finished_good_id INTEGER NOT NULL, quantity_delta INTEGER NOT NULL, quantity_after INTEGER NOT NULL, reason TEXT NOT NULL, notes TEXT)",
            "CREATE TABLE sales (id INTEGER PRIMARY KEY AUTOINCREMENT, finished_good_id INTEGER NOT NULL, product_reference TEXT NOT NULL, sale_date TEXT NOT NULL, quantity INTEGER NOT NULL, sale_unit TEXT NOT NULL, channel TEXT NOT NULL, gross_revenue REAL NOT NULL, discounts_fees REAL NOT NULL, net_revenue REAL NOT NULL, notes TEXT, stock_quantity_before INTEGER NOT NULL, stock_quantity_after INTEGER NOT NULL)",
            "CREATE TABLE sale_stock_movements (id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL, finished_good_id INTEGER NOT NULL, quantity_delta INTEGER NOT NULL, quantity_before INTEGER NOT NULL, quantity_after INTEGER NOT NULL)",
            "INSERT INTO finished_goods VALUES (1, 'Dragon', 'piece', 5, 0, '2026-01-01')",
            "CREATE TRIGGER fail_sale BEFORE INSERT ON sales BEGIN SELECT RAISE(ABORT, 'injected sale failure'); END",
        ] {
            sqlx::query(statement).execute(&mut database).await.unwrap();
        }
        let input = RecordSaleInput {
            finished_good_id: 1,
            product_reference: "Dragon".into(),
            sale_date: "2026-07-13".into(),
            quantity: 2,
            sale_unit: "piece".into(),
            channel: "Direct".into(),
            gross_revenue: 100.0,
            discounts_fees: 0.0,
            net_revenue: 100.0,
            notes: String::new(),
            stock_quantity_before: 5,
            stock_quantity_after: 3,
        };

        assert!(record_sale_on_connection(&mut database, &input)
            .await
            .is_err());

        let quantity: i64 =
            sqlx::query_scalar("SELECT quantity_ready FROM finished_goods WHERE id=1")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let adjustments: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM finished_good_stock_adjustments")
                .fetch_one(&mut database)
                .await
                .unwrap();
        assert_eq!(quantity, 5);
        assert_eq!(adjustments, 0);
    }

    #[tokio::test]
    async fn production_rolls_back_deductions_when_history_insert_fails() {
        let mut database = SqliteConnection::connect("sqlite::memory:").await.unwrap();
        for statement in [
            "CREATE TABLE products (id INTEGER PRIMARY KEY)",
            "CREATE TABLE print_profiles (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL)",
            "CREATE TABLE filaments (id INTEGER PRIMARY KEY, estimated_grams_left REAL NOT NULL, updated_at TEXT)",
            "CREATE TABLE filament_stock_adjustments (id INTEGER PRIMARY KEY, filament_id INTEGER NOT NULL, grams_delta REAL NOT NULL, grams_after REAL NOT NULL, reason TEXT NOT NULL, notes TEXT)",
            "CREATE TABLE production_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, print_profile_id INTEGER NOT NULL, filament_id INTEGER NOT NULL, addon_id INTEGER, run_date TEXT NOT NULL, expected_pieces INTEGER NOT NULL, good_pieces INTEGER NOT NULL, failed_pieces INTEGER NOT NULL, failure_reason TEXT, notes TEXT, filament_grams_deducted REAL NOT NULL, addon_quantity_deducted REAL NOT NULL, finished_good_id INTEGER)",
            "CREATE TABLE production_run_filaments (id INTEGER PRIMARY KEY, production_run_id INTEGER NOT NULL, filament_id INTEGER NOT NULL, grams_deducted REAL NOT NULL, grams_before REAL NOT NULL, grams_after REAL NOT NULL)",
            "CREATE TABLE production_run_addons (id INTEGER PRIMARY KEY, production_run_id INTEGER NOT NULL, addon_id INTEGER NOT NULL, quantity_deducted REAL NOT NULL, quantity_before REAL NOT NULL, quantity_after REAL NOT NULL)",
            "INSERT INTO products VALUES (1)",
            "INSERT INTO print_profiles VALUES (2, 1)",
            "INSERT INTO filaments VALUES (3, 100, '2026-01-01')",
            "CREATE TRIGGER fail_run BEFORE INSERT ON production_runs BEGIN SELECT RAISE(ABORT, 'injected run failure'); END",
        ] {
            sqlx::query(statement).execute(&mut database).await.unwrap();
        }
        let input = RecordProductionRunInput {
            add_on_deductions: vec![],
            add_on_id: None,
            add_on_quantity_deducted: 0.0,
            expected_pieces: 1,
            failed_pieces: 1,
            failure_reason: "test failure".into(),
            filament_deductions: vec![ProductionFilamentDeductionInput {
                filament_id: 3,
                grams_after: 90.0,
                grams_before: 100.0,
                grams_deducted: 10.0,
                notes: String::new(),
            }],
            filament_grams_deducted: 10.0,
            filament_id: 3,
            finished_good_output: None,
            good_pieces: 0,
            notes: String::new(),
            print_profile_id: 2,
            product_id: 1,
            run_date: "2026-07-13".into(),
        };

        assert!(record_production_run_on_connection(&mut database, &input)
            .await
            .is_err());

        let grams: f64 =
            sqlx::query_scalar("SELECT estimated_grams_left FROM filaments WHERE id=3")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let adjustments: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM filament_stock_adjustments")
                .fetch_one(&mut database)
                .await
                .unwrap();
        assert_eq!(grams, 100.0);
        assert_eq!(adjustments, 0);
    }
}
