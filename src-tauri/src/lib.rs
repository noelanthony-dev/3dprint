use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, Connection, SqliteConnection};
use std::time::Duration;
use tauri::Manager;

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

#[tauri::command]
async fn record_sale_with_stock_movement(
    app: tauri::AppHandle,
    input: RecordSaleInput,
) -> Result<RecordSaleOutput, String> {
    if input.stock_quantity_after != input.stock_quantity_before - input.quantity {
        return Err("Sale stock movement does not match the sale quantity.".into());
    }

    if input.stock_quantity_after < 0 {
        return Err("Sale cannot reduce ready quantity below zero.".into());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

    let db_path = app_data_dir.join("printops-studio.db");
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .busy_timeout(Duration::from_secs(5));
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| error.to_string())?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| error.to_string())?;

    let stock_result = sqlx::query(
        r#"UPDATE finished_goods
         SET
          quantity_ready = $1,
          updated_at = datetime('now')
         WHERE id = $2
          AND quantity_ready = $3
          AND quantity_reserved <= $1"#,
    )
    .bind(input.stock_quantity_after)
    .bind(input.finished_good_id)
    .bind(input.stock_quantity_before)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

    if stock_result.rows_affected() == 0 {
        transaction
            .rollback()
            .await
            .map_err(|error| error.to_string())?;
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
    .bind(sale_adjustment_note(&input))
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

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
    .map_err(|error| error.to_string())?;
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
    .map_err(|error| error.to_string())?;

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;

    Ok(RecordSaleOutput { sale_id })
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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![record_sale_with_stock_movement])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
