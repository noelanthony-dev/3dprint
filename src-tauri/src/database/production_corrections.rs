use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use sqlx::{Connection, Row, SqliteConnection};
use tauri::State;

use super::DatabaseState;

const QUANTITY_EPSILON: f64 = 0.000_001;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProductionAddOnCorrectionSelectionInput {
    add_on_id: i64,
    quantity: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CorrectProductionRunAddOnsInput {
    add_ons: Vec<ProductionAddOnCorrectionSelectionInput>,
    production_run_id: i64,
    reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CorrectProductionRunAddOnsOutput {
    correction_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteProductionRunInput {
    production_run_id: i64,
}

#[tauri::command]
pub(crate) async fn correct_production_run_addons(
    state: State<'_, DatabaseState>,
    input: CorrectProductionRunAddOnsInput,
) -> Result<CorrectProductionRunAddOnsOutput, String> {
    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .ok_or_else(|| "The database connection is not available.".to_string())?;

    correct_production_run_addons_on_connection(connection, &input).await
}

#[tauri::command]
pub(crate) async fn delete_production_run(
    state: State<'_, DatabaseState>,
    input: DeleteProductionRunInput,
) -> Result<(), String> {
    if input.production_run_id <= 0 {
        return Err("Choose a valid production run.".into());
    }

    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .ok_or_else(|| "The database connection is not available.".to_string())?;

    delete_production_run_on_connection(connection, input.production_run_id).await
}

pub(crate) async fn delete_production_run_on_connection(
    connection: &mut SqliteConnection,
    production_run_id: i64,
) -> Result<(), String> {
    if production_run_id <= 0 {
        return Err("Choose a valid production run.".into());
    }

    let mut transaction = connection.begin().await.map_err(super::map_sqlx_error)?;
    let run = sqlx::query(
        "SELECT run.filament_id, run.filament_grams_deducted, run.addon_id, \
                run.addon_quantity_deducted, run.finished_good_id, run.good_pieces, \
                run.run_date, product.design_name \
         FROM production_runs AS run \
         JOIN products AS product ON product.id = run.product_id \
         WHERE run.id = $1 LIMIT 1",
    )
    .bind(production_run_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(super::map_sqlx_error)?
    .ok_or_else(|| format!("Production run {production_run_id} does not exist."))?;

    let primary_filament_id: i64 = run.try_get("filament_id").map_err(super::map_sqlx_error)?;
    let summary_filament_grams: f64 = run
        .try_get("filament_grams_deducted")
        .map_err(super::map_sqlx_error)?;
    let primary_add_on_id: Option<i64> = run.try_get("addon_id").map_err(super::map_sqlx_error)?;
    let summary_add_on_quantity: f64 = run
        .try_get("addon_quantity_deducted")
        .map_err(super::map_sqlx_error)?;
    let finished_good_id: Option<i64> = run
        .try_get("finished_good_id")
        .map_err(super::map_sqlx_error)?;
    let good_pieces: i64 = run.try_get("good_pieces").map_err(super::map_sqlx_error)?;
    let run_date: String = run.try_get("run_date").map_err(super::map_sqlx_error)?;
    let product_name: String = run.try_get("design_name").map_err(super::map_sqlx_error)?;
    let note = format!(
        "Reversed inventory after deleting misentered RUN-{production_run_id} for {product_name} ({run_date})."
    );

    let mut filament_returns: Vec<(i64, f64)> = sqlx::query_as(
        "SELECT filament_id, SUM(grams_deducted) \
         FROM production_run_filaments WHERE production_run_id = $1 \
         GROUP BY filament_id ORDER BY filament_id",
    )
    .bind(production_run_id)
    .fetch_all(&mut *transaction)
    .await
    .map_err(super::map_sqlx_error)?;
    if filament_returns.is_empty() && summary_filament_grams > QUANTITY_EPSILON {
        filament_returns.push((primary_filament_id, summary_filament_grams));
    }

    for (filament_id, grams_to_return) in filament_returns {
        let filament = sqlx::query(
            "SELECT estimated_grams_left, starting_grams, spool_status \
             FROM filaments WHERE id = $1 LIMIT 1",
        )
        .bind(filament_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?
        .ok_or_else(|| {
            format!("Filament {filament_id} no longer exists. The production run was not deleted.")
        })?;
        let grams_before: f64 = filament
            .try_get("estimated_grams_left")
            .map_err(super::map_sqlx_error)?;
        let starting_grams: f64 = filament
            .try_get("starting_grams")
            .map_err(super::map_sqlx_error)?;
        let spool_status: String = filament
            .try_get("spool_status")
            .map_err(super::map_sqlx_error)?;
        let grams_after = grams_before + grams_to_return;

        if grams_after > starting_grams + QUANTITY_EPSILON {
            return Err(format!(
                "Deleting this run would restore filament {filament_id} above its starting capacity. Correct that spool's stock first."
            ));
        }

        let restored_status = if spool_status == "empty" {
            "open"
        } else {
            &spool_status
        };
        let result = sqlx::query(
            "UPDATE filaments SET estimated_grams_left = $1, spool_status = $2, updated_at = datetime('now') \
             WHERE id = $3 AND ABS(estimated_grams_left - $4) < 0.000001",
        )
        .bind(grams_after.min(starting_grams))
        .bind(restored_status)
        .bind(filament_id)
        .bind(grams_before)
        .execute(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;
        if result.rows_affected() != 1 {
            return Err(
                "Filament stock changed before the production run could be deleted.".into(),
            );
        }

        if grams_to_return > QUANTITY_EPSILON {
            sqlx::query(
                "INSERT INTO filament_stock_adjustments \
                 (filament_id, grams_delta, grams_after, reason, notes) \
                 VALUES ($1, $2, $3, 'production run deletion', $4)",
            )
            .bind(filament_id)
            .bind(grams_to_return)
            .bind(grams_after.min(starting_grams))
            .bind(&note)
            .execute(&mut *transaction)
            .await
            .map_err(super::map_sqlx_error)?;
        }
    }

    let mut add_on_returns: Vec<(i64, f64)> = sqlx::query_as(
        "SELECT addon_id, SUM(quantity_deducted) \
         FROM production_run_addon_allocations WHERE production_run_id = $1 \
         GROUP BY addon_id ORDER BY addon_id",
    )
    .bind(production_run_id)
    .fetch_all(&mut *transaction)
    .await
    .map_err(super::map_sqlx_error)?;
    if add_on_returns.is_empty() {
        let correction_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM production_run_corrections WHERE production_run_id = $1",
        )
        .bind(production_run_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;
        if correction_count == 0 {
            add_on_returns = sqlx::query_as(
                "SELECT addon_id, SUM(quantity_deducted) \
                 FROM production_run_addons WHERE production_run_id = $1 \
                 GROUP BY addon_id ORDER BY addon_id",
            )
            .bind(production_run_id)
            .fetch_all(&mut *transaction)
            .await
            .map_err(super::map_sqlx_error)?;
            if add_on_returns.is_empty() && summary_add_on_quantity > QUANTITY_EPSILON {
                if let Some(add_on_id) = primary_add_on_id {
                    add_on_returns.push((add_on_id, summary_add_on_quantity));
                }
            }
        }
    }

    for (add_on_id, quantity_to_return) in add_on_returns {
        let quantity_before: f64 =
            sqlx::query_scalar("SELECT quantity_on_hand FROM addons WHERE id = $1 LIMIT 1")
                .bind(add_on_id)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(super::map_sqlx_error)?
                .ok_or_else(|| {
                    format!(
                        "Add-on {add_on_id} no longer exists. The production run was not deleted."
                    )
                })?;
        let quantity_after = round_quantity(quantity_before + quantity_to_return);
        let result = sqlx::query(
            "UPDATE addons SET quantity_on_hand = $1, updated_at = datetime('now') \
             WHERE id = $2 AND ABS(quantity_on_hand - $3) < 0.000001",
        )
        .bind(quantity_after)
        .bind(add_on_id)
        .bind(quantity_before)
        .execute(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;
        if result.rows_affected() != 1 {
            return Err("Add-on stock changed before the production run could be deleted.".into());
        }

        if quantity_to_return > QUANTITY_EPSILON {
            sqlx::query(
                "INSERT INTO addon_stock_adjustments \
                 (addon_id, quantity_delta, quantity_after, reason, notes) \
                 VALUES ($1, $2, $3, 'production run deletion', $4)",
            )
            .bind(add_on_id)
            .bind(quantity_to_return)
            .bind(quantity_after)
            .bind(&note)
            .execute(&mut *transaction)
            .await
            .map_err(super::map_sqlx_error)?;
        }
    }

    if good_pieces > 0 {
        let finished_good_id = finished_good_id.ok_or_else(|| {
            "This run has finished-goods output but its inventory link is missing. The run was not deleted."
                .to_string()
        })?;
        let stock = sqlx::query(
            "SELECT quantity_ready, quantity_reserved FROM finished_goods WHERE id = $1 LIMIT 1",
        )
        .bind(finished_good_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?
        .ok_or_else(|| {
            "This run's finished-goods record no longer exists. The run was not deleted."
                .to_string()
        })?;
        let quantity_before: i64 = stock
            .try_get("quantity_ready")
            .map_err(super::map_sqlx_error)?;
        let quantity_reserved: i64 = stock
            .try_get("quantity_reserved")
            .map_err(super::map_sqlx_error)?;
        let quantity_after = quantity_before.checked_sub(good_pieces).ok_or_else(|| {
            "The finished goods from this run are no longer available, so the run cannot be safely deleted."
                .to_string()
        })?;
        if quantity_after < quantity_reserved {
            return Err(
                "The finished goods from this run are sold, reserved, or otherwise unavailable. Release or correct that stock before deleting the run."
                    .into(),
            );
        }

        let result = sqlx::query(
            "UPDATE finished_goods SET quantity_ready = $1, updated_at = datetime('now') \
             WHERE id = $2 AND quantity_ready = $3 AND quantity_reserved <= $1",
        )
        .bind(quantity_after)
        .bind(finished_good_id)
        .bind(quantity_before)
        .execute(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;
        if result.rows_affected() != 1 {
            return Err(
                "Finished-goods stock changed before the production run could be deleted.".into(),
            );
        }

        sqlx::query(
            "INSERT INTO finished_good_stock_adjustments \
             (finished_good_id, quantity_delta, quantity_after, reason, notes) \
             VALUES ($1, $2, $3, 'production run deletion', $4)",
        )
        .bind(finished_good_id)
        .bind(-good_pieces)
        .bind(quantity_after)
        .bind(&note)
        .execute(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;
    }

    let deleted = sqlx::query("DELETE FROM production_runs WHERE id = $1")
        .bind(production_run_id)
        .execute(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;
    if deleted.rows_affected() != 1 {
        return Err(format!(
            "Production run {production_run_id} no longer exists."
        ));
    }

    transaction.commit().await.map_err(super::map_sqlx_error)
}

pub(crate) async fn correct_production_run_addons_on_connection(
    connection: &mut SqliteConnection,
    input: &CorrectProductionRunAddOnsInput,
) -> Result<CorrectProductionRunAddOnsOutput, String> {
    validate_input(input)?;
    let desired = normalized_desired_quantities(input)?;
    let mut transaction = connection.begin().await.map_err(super::map_sqlx_error)?;

    let run_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM production_runs WHERE id = $1")
        .bind(input.production_run_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;

    if run_exists != 1 {
        return Err(format!(
            "Production run {} does not exist.",
            input.production_run_id
        ));
    }

    let allocation_rows = sqlx::query(
        "SELECT addon_id, quantity_deducted FROM production_run_addon_allocations \
         WHERE production_run_id = $1 ORDER BY sort_order, id",
    )
    .bind(input.production_run_id)
    .fetch_all(&mut *transaction)
    .await
    .map_err(super::map_sqlx_error)?;
    let current = allocation_rows
        .into_iter()
        .map(|row| {
            Ok((
                row.try_get::<i64, _>("addon_id")
                    .map_err(super::map_sqlx_error)?,
                row.try_get::<f64, _>("quantity_deducted")
                    .map_err(super::map_sqlx_error)?,
            ))
        })
        .collect::<Result<HashMap<_, _>, String>>()?;

    if quantities_match(&current, &desired) {
        return Err("Change at least one add-on quantity before saving a correction.".into());
    }

    let correction_result = sqlx::query(
        "INSERT INTO production_run_corrections (production_run_id, correction_type, reason) \
         VALUES ($1, 'addons', $2)",
    )
    .bind(input.production_run_id)
    .bind(input.reason.trim())
    .execute(&mut *transaction)
    .await
    .map_err(super::map_sqlx_error)?;
    let correction_id = correction_result.last_insert_rowid();

    let mut affected_ids = current.keys().copied().collect::<HashSet<_>>();
    affected_ids.extend(desired.keys().copied());
    let mut affected_ids = affected_ids.into_iter().collect::<Vec<_>>();
    affected_ids.sort_unstable();

    for add_on_id in affected_ids {
        let run_quantity_before = current.get(&add_on_id).copied().unwrap_or(0.0);
        let run_quantity_after = desired.get(&add_on_id).copied().unwrap_or(0.0);
        let quantity_delta = round_quantity(run_quantity_after - run_quantity_before);

        if quantity_delta.abs() <= QUANTITY_EPSILON {
            continue;
        }

        let add_on =
            sqlx::query("SELECT quantity_on_hand, is_active FROM addons WHERE id = $1 LIMIT 1")
                .bind(add_on_id)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(super::map_sqlx_error)?
                .ok_or_else(|| format!("Add-on {add_on_id} does not exist."))?;
        let stock_quantity_before: f64 = add_on
            .try_get("quantity_on_hand")
            .map_err(super::map_sqlx_error)?;
        let is_active: i64 = add_on.try_get("is_active").map_err(super::map_sqlx_error)?;

        if quantity_delta > 0.0 && is_active == 0 {
            return Err(
                "Inactive add-ons cannot be added to or increased on a production run.".into(),
            );
        }

        let stock_quantity_after = round_quantity(stock_quantity_before - quantity_delta);
        if stock_quantity_after < -QUANTITY_EPSILON {
            return Err(format!(
                "Add-on {add_on_id} does not have enough quantity for this correction."
            ));
        }

        let update_result = sqlx::query(
            "UPDATE addons SET quantity_on_hand = $1, updated_at = datetime('now') \
             WHERE id = $2 AND ABS(quantity_on_hand - $3) < 0.000001 AND $1 >= 0",
        )
        .bind(stock_quantity_after.max(0.0))
        .bind(add_on_id)
        .bind(stock_quantity_before)
        .execute(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;

        if update_result.rows_affected() != 1 {
            return Err(
                "Add-on stock changed before the production correction could be saved.".into(),
            );
        }

        let adjustment_note = format!(
            "RUN-{} add-on correction: {}",
            input.production_run_id,
            input.reason.trim()
        );
        sqlx::query(
            "INSERT INTO addon_stock_adjustments \
             (addon_id, quantity_delta, quantity_after, reason, notes) \
             VALUES ($1, $2, $3, 'production run correction', $4)",
        )
        .bind(add_on_id)
        .bind(-quantity_delta)
        .bind(stock_quantity_after.max(0.0))
        .bind(adjustment_note)
        .execute(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;

        sqlx::query(
            "INSERT INTO production_run_addon_correction_items (\
               correction_id, addon_id, quantity_delta, run_quantity_before, run_quantity_after,\
               stock_quantity_before, stock_quantity_after\
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(correction_id)
        .bind(add_on_id)
        .bind(quantity_delta)
        .bind(run_quantity_before)
        .bind(run_quantity_after)
        .bind(stock_quantity_before)
        .bind(stock_quantity_after.max(0.0))
        .execute(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;
    }

    sqlx::query("DELETE FROM production_run_addon_allocations WHERE production_run_id = $1")
        .bind(input.production_run_id)
        .execute(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;

    for (sort_order, selection) in input.add_ons.iter().enumerate() {
        let quantity = round_quantity(selection.quantity);
        sqlx::query(
            "INSERT INTO production_run_addon_allocations (\
               production_run_id, addon_id, quantity_deducted, sort_order\
             ) VALUES ($1, $2, $3, $4)",
        )
        .bind(input.production_run_id)
        .bind(selection.add_on_id)
        .bind(quantity)
        .bind(sort_order as i64)
        .execute(&mut *transaction)
        .await
        .map_err(super::map_sqlx_error)?;
    }

    let total_quantity = round_quantity(desired.values().copied().sum::<f64>());
    let primary_add_on_id = input.add_ons.first().map(|selection| selection.add_on_id);
    let run_update = sqlx::query(
        "UPDATE production_runs SET addon_id = $1, addon_quantity_deducted = $2, \
           updated_at = datetime('now') WHERE id = $3",
    )
    .bind(primary_add_on_id)
    .bind(total_quantity)
    .bind(input.production_run_id)
    .execute(&mut *transaction)
    .await
    .map_err(super::map_sqlx_error)?;

    if run_update.rows_affected() != 1 {
        return Err("The production run summary could not be corrected.".into());
    }

    let expense =
        super::production_cost::calculate(&mut transaction, input.production_run_id).await?;
    super::production_cost::upsert(&mut transaction, &expense).await?;

    transaction.commit().await.map_err(super::map_sqlx_error)?;

    Ok(CorrectProductionRunAddOnsOutput { correction_id })
}

fn validate_input(input: &CorrectProductionRunAddOnsInput) -> Result<(), String> {
    if input.production_run_id <= 0 {
        return Err("Choose a valid production run.".into());
    }

    if input.reason.trim().is_empty() {
        return Err("A correction reason is required.".into());
    }

    if input.reason.trim().len() > 500 {
        return Err("The correction reason must be 500 characters or fewer.".into());
    }

    Ok(())
}

fn normalized_desired_quantities(
    input: &CorrectProductionRunAddOnsInput,
) -> Result<HashMap<i64, f64>, String> {
    let mut desired = HashMap::new();

    for selection in &input.add_ons {
        let quantity = round_quantity(selection.quantity);
        if selection.add_on_id <= 0 || !selection.quantity.is_finite() || quantity <= 0.0 {
            return Err("Corrected add-on quantities must be greater than zero.".into());
        }

        if desired.insert(selection.add_on_id, quantity).is_some() {
            return Err("Each add-on can only appear once in a production correction.".into());
        }
    }

    Ok(desired)
}

fn quantities_match(current: &HashMap<i64, f64>, desired: &HashMap<i64, f64>) -> bool {
    current.len() == desired.len()
        && current.iter().all(|(add_on_id, current_quantity)| {
            desired
                .get(add_on_id)
                .is_some_and(|quantity| (quantity - current_quantity).abs() <= QUANTITY_EPSILON)
        })
}

fn round_quantity(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Connection;

    #[tokio::test]
    async fn correction_applies_net_stock_changes_preserves_originals_and_updates_expense() {
        let mut database = correction_database().await;
        let expense_id: i64 = sqlx::query_scalar("SELECT id FROM expenses")
            .fetch_one(&mut database)
            .await
            .unwrap();

        let result = correct_production_run_addons_on_connection(
            &mut database,
            &input(vec![(1, 1.0), (2, 3.0)]),
        )
        .await
        .unwrap();

        let stock: Vec<(i64, f64)> =
            sqlx::query_as("SELECT id,quantity_on_hand FROM addons ORDER BY id")
                .fetch_all(&mut database)
                .await
                .unwrap();
        let allocations: Vec<(i64, f64, i64)> = sqlx::query_as(
            "SELECT addon_id,quantity_deducted,sort_order FROM production_run_addon_allocations ORDER BY sort_order",
        )
        .fetch_all(&mut database)
        .await
        .unwrap();
        let ledger: Vec<(i64, f64, String)> = sqlx::query_as(
            "SELECT addon_id,quantity_delta,reason FROM addon_stock_adjustments ORDER BY id",
        )
        .fetch_all(&mut database)
        .await
        .unwrap();
        let summary: (Option<i64>, f64) = sqlx::query_as(
            "SELECT addon_id,addon_quantity_deducted FROM production_runs WHERE id=10",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        let expense: (i64, f64) =
            sqlx::query_as("SELECT id,amount FROM expenses WHERE production_run_id=10")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let original_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM production_run_addons")
            .fetch_one(&mut database)
            .await
            .unwrap();
        let correction_items: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM production_run_addon_correction_items WHERE correction_id=$1",
        )
        .bind(result.correction_id)
        .fetch_one(&mut database)
        .await
        .unwrap();

        assert_eq!(stock, vec![(1, 11.0), (2, 2.0)]);
        assert_eq!(allocations, vec![(1, 1.0, 0), (2, 3.0, 1)]);
        assert_eq!(
            ledger,
            vec![
                (1, 1.0, "production run correction".into()),
                (2, -3.0, "production run correction".into())
            ]
        );
        assert_eq!(summary, (Some(1), 4.0));
        assert_eq!(expense, (expense_id, 14.0));
        assert_eq!(original_rows, 1);
        assert_eq!(correction_items, 2);
    }

    #[tokio::test]
    async fn insufficient_stock_rolls_back_the_entire_correction() {
        let mut database = correction_database().await;

        assert!(correct_production_run_addons_on_connection(
            &mut database,
            &input(vec![(1, 2.0), (2, 6.0)]),
        )
        .await
        .is_err());

        assert_unchanged(&mut database).await;
    }

    #[tokio::test]
    async fn expense_failure_rolls_back_stock_allocations_and_audit() {
        let mut database = correction_database().await;
        sqlx::query(
            "CREATE TRIGGER fail_expense_correction BEFORE UPDATE ON expenses \
             BEGIN SELECT RAISE(ABORT, 'injected expense update failure'); END",
        )
        .execute(&mut database)
        .await
        .unwrap();

        assert!(correct_production_run_addons_on_connection(
            &mut database,
            &input(vec![(1, 1.0), (2, 3.0)]),
        )
        .await
        .is_err());

        assert_unchanged(&mut database).await;
    }

    #[tokio::test]
    async fn inactive_addons_cannot_be_increased_but_can_be_reduced() {
        let mut database = correction_database().await;
        sqlx::query("UPDATE addons SET is_active=0 WHERE id=1")
            .execute(&mut database)
            .await
            .unwrap();

        assert!(
            correct_production_run_addons_on_connection(&mut database, &input(vec![(1, 3.0)]),)
                .await
                .is_err()
        );

        correct_production_run_addons_on_connection(&mut database, &input(vec![(1, 1.0)]))
            .await
            .unwrap();
        let stock: f64 = sqlx::query_scalar("SELECT quantity_on_hand FROM addons WHERE id=1")
            .fetch_one(&mut database)
            .await
            .unwrap();
        assert_eq!(stock, 11.0);
    }

    #[tokio::test]
    async fn removing_every_addon_returns_stock_and_removes_addon_expense_cost() {
        let mut database = correction_database().await;

        correct_production_run_addons_on_connection(&mut database, &input(vec![]))
            .await
            .unwrap();

        let stock: f64 = sqlx::query_scalar("SELECT quantity_on_hand FROM addons WHERE id=1")
            .fetch_one(&mut database)
            .await
            .unwrap();
        let allocations: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM production_run_addon_allocations")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let amount: f64 =
            sqlx::query_scalar("SELECT amount FROM expenses WHERE production_run_id=10")
                .fetch_one(&mut database)
                .await
                .unwrap();

        assert_eq!(stock, 12.0);
        assert_eq!(allocations, 0);
        assert_eq!(amount, 0.0);
    }

    #[tokio::test]
    async fn deletion_reverses_current_inventory_and_removes_linked_records() {
        let mut database = deletion_database().await;

        delete_production_run_on_connection(&mut database, 10)
            .await
            .unwrap();

        let filament: (f64, String) =
            sqlx::query_as("SELECT estimated_grams_left,spool_status FROM filaments WHERE id=3")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let add_on_stock: f64 =
            sqlx::query_scalar("SELECT quantity_on_hand FROM addons WHERE id=1")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let finished_goods: i64 =
            sqlx::query_scalar("SELECT quantity_ready FROM finished_goods WHERE id=4")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let linked_records: i64 = sqlx::query_scalar(
            "SELECT (SELECT COUNT(*) FROM production_runs) + \
                    (SELECT COUNT(*) FROM production_run_filaments) + \
                    (SELECT COUNT(*) FROM production_run_addons) + \
                    (SELECT COUNT(*) FROM production_run_addon_allocations) + \
                    (SELECT COUNT(*) FROM production_run_corrections) + \
                    (SELECT COUNT(*) FROM expenses)",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        let ledgers: Vec<(String, f64)> = sqlx::query_as(
            "SELECT reason,CAST(grams_delta AS REAL) FROM filament_stock_adjustments \
             UNION ALL SELECT reason,CAST(quantity_delta AS REAL) FROM addon_stock_adjustments \
             UNION ALL SELECT reason,CAST(quantity_delta AS REAL) FROM finished_good_stock_adjustments",
        )
        .fetch_all(&mut database)
        .await
        .unwrap();

        assert_eq!(filament, (900.0, "open".into()));
        assert_eq!(add_on_stock, 11.0);
        assert_eq!(finished_goods, 3);
        assert_eq!(linked_records, 0);
        assert_eq!(ledgers.len(), 3);
        assert!(ledgers
            .iter()
            .all(|(reason, _)| reason == "production run deletion"));
        assert!(ledgers.iter().any(|(_, delta)| *delta == 100.0));
        assert!(ledgers.iter().any(|(_, delta)| *delta == 3.0));
        assert!(ledgers.iter().any(|(_, delta)| *delta == -4.0));
    }

    #[tokio::test]
    async fn unavailable_finished_goods_refuse_deletion_and_roll_back_returns() {
        let mut database = deletion_database().await;
        sqlx::query("UPDATE finished_goods SET quantity_ready=3 WHERE id=4")
            .execute(&mut database)
            .await
            .unwrap();

        let error = delete_production_run_on_connection(&mut database, 10)
            .await
            .unwrap_err();

        assert!(error.contains("unavailable"), "{error}");
        let filament: f64 =
            sqlx::query_scalar("SELECT estimated_grams_left FROM filaments WHERE id=3")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let add_on: f64 = sqlx::query_scalar("SELECT quantity_on_hand FROM addons WHERE id=1")
            .fetch_one(&mut database)
            .await
            .unwrap();
        let run_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM production_runs")
            .fetch_one(&mut database)
            .await
            .unwrap();
        let ledger_count: i64 = sqlx::query_scalar(
            "SELECT (SELECT COUNT(*) FROM filament_stock_adjustments) + \
                    (SELECT COUNT(*) FROM addon_stock_adjustments) + \
                    (SELECT COUNT(*) FROM finished_good_stock_adjustments)",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();

        assert_eq!(filament, 800.0);
        assert_eq!(add_on, 8.0);
        assert_eq!(run_count, 1);
        assert_eq!(ledger_count, 0);
    }

    async fn assert_unchanged(database: &mut SqliteConnection) {
        let stock: Vec<(i64, f64)> =
            sqlx::query_as("SELECT id,quantity_on_hand FROM addons ORDER BY id")
                .fetch_all(&mut *database)
                .await
                .unwrap();
        let allocations: Vec<(i64, f64)> = sqlx::query_as(
            "SELECT addon_id,quantity_deducted FROM production_run_addon_allocations ORDER BY id",
        )
        .fetch_all(&mut *database)
        .await
        .unwrap();
        let corrections: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM production_run_corrections")
                .fetch_one(&mut *database)
                .await
                .unwrap();
        let ledger: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM addon_stock_adjustments")
            .fetch_one(&mut *database)
            .await
            .unwrap();
        let expense: (i64, f64) =
            sqlx::query_as("SELECT id,amount FROM expenses WHERE production_run_id=10")
                .fetch_one(&mut *database)
                .await
                .unwrap();

        assert_eq!(stock, vec![(1, 10.0), (2, 5.0)]);
        assert_eq!(allocations, vec![(1, 2.0)]);
        assert_eq!(corrections, 0);
        assert_eq!(ledger, 0);
        assert_eq!(expense, (50, 4.0));
    }

    fn input(add_ons: Vec<(i64, f64)>) -> CorrectProductionRunAddOnsInput {
        CorrectProductionRunAddOnsInput {
            add_ons: add_ons
                .into_iter()
                .map(
                    |(add_on_id, quantity)| ProductionAddOnCorrectionSelectionInput {
                        add_on_id,
                        quantity,
                    },
                )
                .collect(),
            production_run_id: 10,
            reason: "Forgotten hardware".into(),
        }
    }

    async fn correction_database() -> SqliteConnection {
        let mut database = SqliteConnection::connect("sqlite::memory:").await.unwrap();
        for statement in [
            "CREATE TABLE products (id INTEGER PRIMARY KEY, design_name TEXT NOT NULL)",
            "CREATE TABLE print_profiles (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, filament_cost_per_kg REAL NOT NULL, print_hours REAL NOT NULL, print_minutes REAL NOT NULL, electricity_rate_per_kwh REAL NOT NULL, printer_power_watts REAL NOT NULL, wear_rate_per_hour REAL NOT NULL, labor_minutes REAL NOT NULL, labor_rate_per_hour REAL NOT NULL, expected_good_units INTEGER NOT NULL, expected_failed_units INTEGER NOT NULL)",
            "CREATE TABLE filaments (id INTEGER PRIMARY KEY, starting_grams REAL NOT NULL, spool_cost REAL NOT NULL)",
            "CREATE TABLE addons (id INTEGER PRIMARY KEY, item_name TEXT NOT NULL, quantity_on_hand REAL NOT NULL, unit_cost REAL NOT NULL, is_active INTEGER NOT NULL, updated_at TEXT)",
            "CREATE TABLE addon_stock_adjustments (id INTEGER PRIMARY KEY AUTOINCREMENT, addon_id INTEGER NOT NULL, quantity_delta REAL NOT NULL, quantity_after REAL NOT NULL, reason TEXT NOT NULL, notes TEXT)",
            "CREATE TABLE production_runs (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, print_profile_id INTEGER NOT NULL, filament_id INTEGER NOT NULL, addon_id INTEGER, run_date TEXT NOT NULL, good_pieces INTEGER NOT NULL, failed_pieces INTEGER NOT NULL, filament_grams_deducted REAL NOT NULL, addon_quantity_deducted REAL NOT NULL, updated_at TEXT)",
            "CREATE TABLE production_run_filaments (id INTEGER PRIMARY KEY, production_run_id INTEGER NOT NULL, filament_id INTEGER NOT NULL, grams_deducted REAL NOT NULL)",
            "CREATE TABLE production_run_addons (id INTEGER PRIMARY KEY, production_run_id INTEGER NOT NULL, addon_id INTEGER NOT NULL, quantity_deducted REAL NOT NULL, quantity_before REAL NOT NULL, quantity_after REAL NOT NULL)",
            "CREATE TABLE production_run_addon_allocations (id INTEGER PRIMARY KEY AUTOINCREMENT, production_run_id INTEGER NOT NULL, addon_id INTEGER NOT NULL, quantity_deducted REAL NOT NULL, sort_order INTEGER NOT NULL)",
            "CREATE TABLE production_run_corrections (id INTEGER PRIMARY KEY AUTOINCREMENT, production_run_id INTEGER NOT NULL, correction_type TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))",
            "CREATE TABLE production_run_addon_correction_items (id INTEGER PRIMARY KEY AUTOINCREMENT, correction_id INTEGER NOT NULL, addon_id INTEGER NOT NULL, quantity_delta REAL NOT NULL, run_quantity_before REAL NOT NULL, run_quantity_after REAL NOT NULL, stock_quantity_before REAL NOT NULL, stock_quantity_after REAL NOT NULL)",
            "CREATE TABLE expenses (id INTEGER PRIMARY KEY, vendor TEXT NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL, expense_date TEXT NOT NULL, recurrence TEXT NOT NULL, recurrence_month TEXT NOT NULL, notes TEXT, production_run_id INTEGER UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
            "INSERT INTO products VALUES (1,'Corrected Dragon')",
            "INSERT INTO print_profiles VALUES (2,1,0,0,0,0,0,0,0,0,1,0)",
            "INSERT INTO filaments VALUES (3,1000,0)",
            "INSERT INTO addons VALUES (1,'Clasp',10,2,1,'2026-01-01')",
            "INSERT INTO addons VALUES (2,'Tassel',5,4,1,'2026-01-01')",
            "INSERT INTO production_runs VALUES (10,1,2,3,1,'2026-07-17',1,0,0,2,'2026-07-17')",
            "INSERT INTO production_run_addons VALUES (20,10,1,2,12,10)",
            "INSERT INTO production_run_addon_allocations (production_run_id,addon_id,quantity_deducted,sort_order) VALUES (10,1,2,0)",
            "INSERT INTO expenses VALUES (50,'Corrected Dragon','Production',4,'2026-07-17','one-time','2026-07','RUN-10',10,'2026-07-17','2026-07-17')",
        ] {
            sqlx::query(statement).execute(&mut database).await.unwrap();
        }
        database
    }

    async fn deletion_database() -> SqliteConnection {
        let mut database = SqliteConnection::connect("sqlite::memory:").await.unwrap();
        sqlx::query("PRAGMA foreign_keys=ON")
            .execute(&mut database)
            .await
            .unwrap();
        for statement in [
            "CREATE TABLE products (id INTEGER PRIMARY KEY, design_name TEXT NOT NULL)",
            "CREATE TABLE filaments (id INTEGER PRIMARY KEY, starting_grams REAL NOT NULL, estimated_grams_left REAL NOT NULL, spool_status TEXT NOT NULL, updated_at TEXT)",
            "CREATE TABLE addons (id INTEGER PRIMARY KEY, quantity_on_hand REAL NOT NULL, updated_at TEXT)",
            "CREATE TABLE finished_goods (id INTEGER PRIMARY KEY, quantity_ready INTEGER NOT NULL, quantity_reserved INTEGER NOT NULL, updated_at TEXT)",
            "CREATE TABLE production_runs (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), filament_id INTEGER NOT NULL REFERENCES filaments(id), addon_id INTEGER REFERENCES addons(id), filament_grams_deducted REAL NOT NULL, addon_quantity_deducted REAL NOT NULL, finished_good_id INTEGER REFERENCES finished_goods(id), good_pieces INTEGER NOT NULL, run_date TEXT NOT NULL)",
            "CREATE TABLE production_run_filaments (id INTEGER PRIMARY KEY, production_run_id INTEGER NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE, filament_id INTEGER NOT NULL, grams_deducted REAL NOT NULL)",
            "CREATE TABLE production_run_addons (id INTEGER PRIMARY KEY, production_run_id INTEGER NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE, addon_id INTEGER NOT NULL, quantity_deducted REAL NOT NULL)",
            "CREATE TABLE production_run_addon_allocations (id INTEGER PRIMARY KEY, production_run_id INTEGER NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE, addon_id INTEGER NOT NULL, quantity_deducted REAL NOT NULL)",
            "CREATE TABLE production_run_corrections (id INTEGER PRIMARY KEY, production_run_id INTEGER NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE)",
            "CREATE TABLE expenses (id INTEGER PRIMARY KEY, production_run_id INTEGER REFERENCES production_runs(id) ON DELETE CASCADE)",
            "CREATE TABLE filament_stock_adjustments (id INTEGER PRIMARY KEY, filament_id INTEGER NOT NULL, grams_delta REAL NOT NULL, grams_after REAL NOT NULL, reason TEXT NOT NULL, notes TEXT)",
            "CREATE TABLE addon_stock_adjustments (id INTEGER PRIMARY KEY, addon_id INTEGER NOT NULL, quantity_delta REAL NOT NULL, quantity_after REAL NOT NULL, reason TEXT NOT NULL, notes TEXT)",
            "CREATE TABLE finished_good_stock_adjustments (id INTEGER PRIMARY KEY, finished_good_id INTEGER NOT NULL, quantity_delta INTEGER NOT NULL, quantity_after INTEGER NOT NULL, reason TEXT NOT NULL, notes TEXT)",
            "INSERT INTO products VALUES (1,'Deletion Test Product')",
            "INSERT INTO filaments VALUES (3,1000,800,'empty','2026-01-01')",
            "INSERT INTO addons VALUES (1,8,'2026-01-01')",
            "INSERT INTO finished_goods VALUES (4,7,1,'2026-01-01')",
            "INSERT INTO production_runs VALUES (10,1,3,1,100,2,4,4,'2026-08-20')",
            "INSERT INTO production_run_filaments VALUES (20,10,3,100)",
            "INSERT INTO production_run_addons VALUES (30,10,1,2)",
            "INSERT INTO production_run_addon_allocations VALUES (40,10,1,3)",
            "INSERT INTO production_run_corrections VALUES (50,10)",
            "INSERT INTO expenses VALUES (60,10)",
        ] {
            sqlx::query(statement).execute(&mut database).await.unwrap();
        }
        database
    }
}
