use serde::Deserialize;
use sqlx::Connection;
use std::collections::HashSet;
use tauri::State;

use super::{is_sale_unit, map_sqlx_error, DatabaseState};

const HISTORY_DAYS: i64 = 28;
const TARGET_DAYS: i64 = 14;
const ALGORITHM_VERSION: i64 = 1;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavePrintPlanItemInput {
    business_id: String,
    business_name: String,
    days_of_stock: Option<f64>,
    inventory_count: i64,
    product_id: Option<i64>,
    product_name: String,
    recommended_quantity: i64,
    sale_unit: String,
    status: String,
    target_quantity: i64,
    units_sold: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavePrintPlanInput {
    algorithm_version: i64,
    history_days: i64,
    items: Vec<SavePrintPlanItemInput>,
    plan_date: String,
    target_days: i64,
    warnings: Vec<String>,
    window_end: String,
    window_start: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecordIdOutput {
    id: i64,
}

#[tauri::command]
pub(crate) async fn save_print_plan(
    state: State<'_, DatabaseState>,
    input: SavePrintPlanInput,
) -> Result<RecordIdOutput, String> {
    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .ok_or_else(|| "The database connection is not available.".to_string())?;
    save_print_plan_on_connection(connection, &input).await
}

async fn save_print_plan_on_connection(
    connection: &mut sqlx::SqliteConnection,
    input: &SavePrintPlanInput,
) -> Result<RecordIdOutput, String> {
    validate_plan(input)?;
    let mut transaction = connection.begin().await.map_err(map_sqlx_error)?;

    for item in &input.items {
        let product_id = item.product_id.ok_or_else(|| {
            "A new print plan must reference an existing Product Library item.".to_string()
        })?;
        let identity_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM products WHERE id=$1 AND design_name=$2 AND sale_unit=$3",
        )
        .bind(product_id)
        .bind(item.product_name.trim())
        .bind(item.sale_unit.trim())
        .fetch_one(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;

        if identity_count != 1 {
            return Err(format!(
                "{} changed after the count started. Start a new plan and count again.",
                item.product_name.trim()
            ));
        }
    }

    let warnings = serde_json::to_string(&input.warnings).map_err(|error| error.to_string())?;
    let plan_result = sqlx::query(
        r#"INSERT INTO print_plans (
             plan_date, window_start, window_end, history_days, target_days,
             algorithm_version, warnings
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
    )
    .bind(input.plan_date.trim())
    .bind(input.window_start.trim())
    .bind(input.window_end.trim())
    .bind(input.history_days)
    .bind(input.target_days)
    .bind(input.algorithm_version)
    .bind(warnings)
    .execute(&mut *transaction)
    .await
    .map_err(map_sqlx_error)?;
    let plan_id = plan_result.last_insert_rowid();

    for item in &input.items {
        sqlx::query(
            r#"INSERT INTO print_plan_items (
                 plan_id, product_id, product_name, sale_unit, business_id, business_name,
                 inventory_count, units_sold, target_quantity, recommended_quantity,
                 days_of_stock, status
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"#,
        )
        .bind(plan_id)
        .bind(item.product_id)
        .bind(item.product_name.trim())
        .bind(item.sale_unit.trim())
        .bind(item.business_id.trim())
        .bind(item.business_name.trim())
        .bind(item.inventory_count)
        .bind(item.units_sold)
        .bind(item.target_quantity)
        .bind(item.recommended_quantity)
        .bind(item.days_of_stock)
        .bind(item.status.trim())
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    }

    transaction.commit().await.map_err(map_sqlx_error)?;
    Ok(RecordIdOutput { id: plan_id })
}

fn validate_plan(input: &SavePrintPlanInput) -> Result<(), String> {
    if input.algorithm_version != ALGORITHM_VERSION
        || input.history_days != HISTORY_DAYS
        || input.target_days != TARGET_DAYS
        || !is_iso_date(&input.plan_date)
        || !is_iso_date(&input.window_start)
        || !is_iso_date(&input.window_end)
        || input.window_end != input.plan_date
        || input.window_start > input.window_end
        || input
            .warnings
            .iter()
            .any(|warning| warning.trim().is_empty())
    {
        return Err("Print plan parameters are invalid or unsupported.".into());
    }

    let mut identities = HashSet::new();
    for item in &input.items {
        let product_id = item.product_id.unwrap_or_default();
        let expected_business_name = business_name(&item.business_id);
        let expected_target = if item.units_sold == 0 {
            0
        } else {
            (item.units_sold * TARGET_DAYS + HISTORY_DAYS - 1) / HISTORY_DAYS
        };
        let expected_recommendation = (expected_target - item.inventory_count).max(0);
        let expected_status = if item.units_sold == 0 {
            "no-history"
        } else if expected_recommendation > 0 {
            "print"
        } else {
            "covered"
        };
        let expected_days = if item.units_sold == 0 {
            None
        } else {
            Some(item.inventory_count as f64 / (item.units_sold as f64 / HISTORY_DAYS as f64))
        };
        let days_valid = match (item.days_of_stock, expected_days) {
            (None, None) => true,
            (Some(actual), Some(expected)) => {
                actual.is_finite() && actual >= 0.0 && (actual - expected).abs() < 0.000_001
            }
            _ => false,
        };

        if product_id <= 0
            || item.product_name.trim().is_empty()
            || !is_sale_unit(item.sale_unit.trim())
            || expected_business_name.is_none()
            || expected_business_name != Some(item.business_name.trim())
            || item.inventory_count < 0
            || item.units_sold < 0
            || item.target_quantity != expected_target
            || item.recommended_quantity != expected_recommendation
            || item.status != expected_status
            || !days_valid
            || !identities.insert((item.business_id.as_str(), product_id))
        {
            return Err("Print plan item values are invalid or inconsistent.".into());
        }
    }

    Ok(())
}

fn business_name(id: &str) -> Option<&'static str> {
    match id {
        "sincerely" => Some("Sincerely"),
        "flora" => Some("Flora"),
        "dear-reader" => Some("Dear Reader"),
        "angkong-dimsum" => Some("Angkong Dimsum"),
        "stomping" => Some("Stomping"),
        _ => None,
    }
}

fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| index != 4 && index != 7 && !byte.is_ascii_digit())
    {
        return false;
    }
    let parsed = (
        std::str::from_utf8(&bytes[0..4])
            .unwrap_or_default()
            .parse::<i32>(),
        std::str::from_utf8(&bytes[5..7])
            .unwrap_or_default()
            .parse::<u32>(),
        std::str::from_utf8(&bytes[8..10])
            .unwrap_or_default()
            .parse::<u32>(),
    );
    match parsed {
        (Ok(year), Ok(month), Ok(day)) => {
            year >= 1 && (1..=12).contains(&month) && day >= 1 && day <= days_in_month(year, month)
        }
        _ => false,
    }
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        2 if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Connection;

    async fn database() -> sqlx::SqliteConnection {
        let mut connection = sqlx::SqliteConnection::connect("sqlite::memory:")
            .await
            .unwrap();
        for statement in [
            "PRAGMA foreign_keys=ON",
            "CREATE TABLE products (id INTEGER PRIMARY KEY, design_name TEXT NOT NULL, sale_unit TEXT NOT NULL)",
            "CREATE TABLE print_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_date TEXT NOT NULL, window_start TEXT NOT NULL, window_end TEXT NOT NULL, history_days INTEGER NOT NULL, target_days INTEGER NOT NULL, algorithm_version INTEGER NOT NULL, warnings TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
            "CREATE TABLE print_plan_items (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL REFERENCES print_plans(id) ON DELETE CASCADE, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, product_name TEXT NOT NULL, sale_unit TEXT NOT NULL, business_id TEXT NOT NULL, business_name TEXT NOT NULL, inventory_count INTEGER NOT NULL, units_sold INTEGER NOT NULL, target_quantity INTEGER NOT NULL, recommended_quantity INTEGER NOT NULL, days_of_stock REAL, status TEXT NOT NULL, UNIQUE(plan_id,business_id,product_id))",
            "INSERT INTO products VALUES (1, 'Dragon', 'piece')",
        ] {
            sqlx::query(statement).execute(&mut connection).await.unwrap();
        }
        connection
    }

    fn valid_input() -> SavePrintPlanInput {
        SavePrintPlanInput {
            algorithm_version: 1,
            history_days: 28,
            items: vec![SavePrintPlanItemInput {
                business_id: "sincerely".into(),
                business_name: "Sincerely".into(),
                days_of_stock: Some(7.0),
                inventory_count: 1,
                product_id: Some(1),
                product_name: "Dragon".into(),
                recommended_quantity: 1,
                sale_unit: "piece".into(),
                status: "print".into(),
                target_quantity: 2,
                units_sold: 4,
            }],
            plan_date: "2026-08-19".into(),
            target_days: 14,
            warnings: vec!["Example warning".into()],
            window_end: "2026-08-19".into(),
            window_start: "2026-07-23".into(),
        }
    }

    #[tokio::test]
    async fn saves_header_and_items_atomically() {
        let mut connection = database().await;
        let output = save_print_plan_on_connection(&mut connection, &valid_input())
            .await
            .unwrap();
        let plan_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM print_plans")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        let item: (i64, i64, i64, String) = sqlx::query_as(
            "SELECT inventory_count, units_sold, recommended_quantity, status FROM print_plan_items WHERE plan_id=$1",
        )
        .bind(output.id)
        .fetch_one(&mut connection)
        .await
        .unwrap();
        assert_eq!(plan_count, 1);
        assert_eq!(item, (1, 4, 1, "print".into()));
    }

    #[tokio::test]
    async fn rejects_tampered_recommendations_before_writing() {
        let mut connection = database().await;
        let mut input = valid_input();
        input.items[0].recommended_quantity = 99;
        assert!(save_print_plan_on_connection(&mut connection, &input)
            .await
            .is_err());
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM print_plans")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn item_failure_rolls_back_the_plan_header_and_every_item() {
        let mut connection = database().await;
        sqlx::query("INSERT INTO products VALUES (2, 'Bookmark', 'piece')")
            .execute(&mut connection)
            .await
            .unwrap();
        sqlx::query(
            "CREATE TRIGGER fail_flora_plan_item BEFORE INSERT ON print_plan_items \
             WHEN NEW.business_id='flora' BEGIN SELECT RAISE(ABORT, 'injected planner failure'); END",
        )
        .execute(&mut connection)
        .await
        .unwrap();
        let mut input = valid_input();
        input.items.push(SavePrintPlanItemInput {
            business_id: "flora".into(),
            business_name: "Flora".into(),
            days_of_stock: None,
            inventory_count: 0,
            product_id: Some(2),
            product_name: "Bookmark".into(),
            recommended_quantity: 0,
            sale_unit: "piece".into(),
            status: "no-history".into(),
            target_quantity: 0,
            units_sold: 0,
        });

        assert!(save_print_plan_on_connection(&mut connection, &input)
            .await
            .is_err());

        let plans: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM print_plans")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        let items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM print_plan_items")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        assert_eq!((plans, items), (0, 0));
    }

    #[tokio::test]
    async fn deleting_a_product_keeps_the_saved_snapshot() {
        let mut connection = database().await;
        save_print_plan_on_connection(&mut connection, &valid_input())
            .await
            .unwrap();

        sqlx::query("DELETE FROM products WHERE id=1")
            .execute(&mut connection)
            .await
            .unwrap();

        let snapshot: (Option<i64>, String) =
            sqlx::query_as("SELECT product_id, product_name FROM print_plan_items LIMIT 1")
                .fetch_one(&mut connection)
                .await
                .unwrap();
        assert_eq!(snapshot, (None, "Dragon".into()));
    }
}
