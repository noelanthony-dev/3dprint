use sqlx::{Row, SqliteConnection};

#[derive(Debug)]
pub(crate) struct ProductionExpenseDraft {
    pub(crate) add_on_cost: f64,
    pub(crate) electricity_cost: f64,
    pub(crate) expense_date: String,
    pub(crate) filament_cost: f64,
    pub(crate) labor_cost: f64,
    pub(crate) production_run_id: i64,
    pub(crate) recurrence_month: String,
    pub(crate) total_cost: f64,
    pub(crate) vendor: String,
    pub(crate) wear_cost: f64,
}

pub(crate) async fn calculate(
    connection: &mut SqliteConnection,
    production_run_id: i64,
) -> Result<ProductionExpenseDraft, String> {
    let row = sqlx::query(
        r#"SELECT
             run.id AS production_run_id,
             run.run_date,
             product.design_name,
             CAST(run.good_pieces + run.failed_pieces AS REAL) /
               MAX(1, profile.expected_good_units + profile.expected_failed_units) AS scale_factor,
             CAST(CASE WHEN EXISTS (
               SELECT 1 FROM production_run_filaments AS detail
               WHERE detail.production_run_id = run.id
             ) THEN COALESCE((
               SELECT SUM(detail.grams_deducted *
                 CASE WHEN filament.starting_grams > 0
                   THEN filament.spool_cost / filament.starting_grams
                   ELSE profile.filament_cost_per_kg / 1000.0 END)
               FROM production_run_filaments AS detail
               JOIN filaments AS filament ON filament.id = detail.filament_id
               WHERE detail.production_run_id = run.id
             ), 0)
             ELSE run.filament_grams_deducted *
               CASE WHEN primary_filament.starting_grams > 0
                 THEN primary_filament.spool_cost / primary_filament.starting_grams
                 ELSE profile.filament_cost_per_kg / 1000.0 END
             END AS REAL) AS filament_cost,
             CAST(CASE WHEN EXISTS (
               SELECT 1 FROM production_run_addon_allocations AS allocation
               WHERE allocation.production_run_id = run.id
             ) THEN COALESCE((
               SELECT SUM(allocation.quantity_deducted * addon.unit_cost)
               FROM production_run_addon_allocations AS allocation
               JOIN addons AS addon ON addon.id = allocation.addon_id
               WHERE allocation.production_run_id = run.id
             ), 0)
             WHEN EXISTS (
               SELECT 1 FROM production_run_corrections AS correction
               WHERE correction.production_run_id = run.id
                 AND correction.correction_type = 'addons'
             ) THEN 0
             WHEN EXISTS (
               SELECT 1 FROM production_run_addons AS detail
               WHERE detail.production_run_id = run.id
             ) THEN COALESCE((
               SELECT SUM(detail.quantity_deducted * addon.unit_cost)
               FROM production_run_addons AS detail
               JOIN addons AS addon ON addon.id = detail.addon_id
               WHERE detail.production_run_id = run.id
             ), 0)
             ELSE COALESCE(run.addon_quantity_deducted * primary_addon.unit_cost, 0)
             END AS REAL) AS add_on_cost,
             CAST((profile.print_hours + profile.print_minutes / 60.0) *
               (profile.printer_power_watts / 1000.0) * profile.electricity_rate_per_kwh AS REAL) AS profile_electricity_cost,
             CAST((profile.print_hours + profile.print_minutes / 60.0) * profile.wear_rate_per_hour AS REAL) AS profile_wear_cost,
             CAST((profile.labor_minutes / 60.0) * profile.labor_rate_per_hour AS REAL) AS profile_labor_cost
           FROM production_runs AS run
           JOIN products AS product ON product.id = run.product_id
           JOIN print_profiles AS profile ON profile.id = run.print_profile_id
           JOIN filaments AS primary_filament ON primary_filament.id = run.filament_id
           LEFT JOIN addons AS primary_addon ON primary_addon.id = run.addon_id
           WHERE run.id = $1"#,
    )
    .bind(production_run_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(super::map_sqlx_error)?
    .ok_or_else(|| format!("Production run {production_run_id} could not be costed."))?;

    let scale_factor: f64 = row.try_get("scale_factor").map_err(super::map_sqlx_error)?;
    let filament_cost: f64 = row
        .try_get("filament_cost")
        .map_err(super::map_sqlx_error)?;
    let add_on_cost: f64 = row.try_get("add_on_cost").map_err(super::map_sqlx_error)?;
    let electricity_cost = row
        .try_get::<f64, _>("profile_electricity_cost")
        .map_err(super::map_sqlx_error)?
        * scale_factor;
    let wear_cost = row
        .try_get::<f64, _>("profile_wear_cost")
        .map_err(super::map_sqlx_error)?
        * scale_factor;
    let labor_cost = row
        .try_get::<f64, _>("profile_labor_cost")
        .map_err(super::map_sqlx_error)?
        * scale_factor;
    let expense_date: String = row.try_get("run_date").map_err(super::map_sqlx_error)?;
    let total_cost =
        round_money(filament_cost + add_on_cost + electricity_cost + wear_cost + labor_cost);

    Ok(ProductionExpenseDraft {
        add_on_cost: round_money(add_on_cost),
        electricity_cost: round_money(electricity_cost),
        expense_date: expense_date.clone(),
        filament_cost: round_money(filament_cost),
        labor_cost: round_money(labor_cost),
        production_run_id,
        recurrence_month: expense_date.chars().take(7).collect(),
        total_cost,
        vendor: row.try_get("design_name").map_err(super::map_sqlx_error)?,
        wear_cost: round_money(wear_cost),
    })
}

pub(crate) async fn insert(
    connection: &mut SqliteConnection,
    expense: &ProductionExpenseDraft,
) -> Result<i64, String> {
    let notes = expense_notes(expense);
    let result = sqlx::query(
        r#"INSERT INTO expenses (
             vendor, category, amount, expense_date, recurrence, recurrence_month, notes,
             production_run_id, created_at, updated_at
           )
           SELECT $1, 'Production', $2, $3, 'one-time', $4, $5, $6,
             created_at, updated_at
           FROM production_runs WHERE id = $6"#,
    )
    .bind(expense.vendor.trim())
    .bind(expense.total_cost)
    .bind(expense.expense_date.trim())
    .bind(expense.recurrence_month.trim())
    .bind(notes)
    .bind(expense.production_run_id)
    .execute(connection)
    .await
    .map_err(super::map_sqlx_error)?;

    if result.rows_affected() != 1 {
        return Err("The production expense could not be saved.".into());
    }

    Ok(result.last_insert_rowid())
}

pub(crate) async fn upsert(
    connection: &mut SqliteConnection,
    expense: &ProductionExpenseDraft,
) -> Result<i64, String> {
    let notes = expense_notes(expense);
    let existing_id: Option<i64> =
        sqlx::query_scalar("SELECT id FROM expenses WHERE production_run_id = $1 LIMIT 1")
            .bind(expense.production_run_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(super::map_sqlx_error)?;

    if let Some(id) = existing_id {
        let result = sqlx::query(
            r#"UPDATE expenses
               SET vendor = $1, category = 'Production', amount = $2, expense_date = $3,
                 recurrence = 'one-time', recurrence_month = $4, notes = $5,
                 updated_at = datetime('now')
               WHERE id = $6 AND production_run_id = $7"#,
        )
        .bind(expense.vendor.trim())
        .bind(expense.total_cost)
        .bind(expense.expense_date.trim())
        .bind(expense.recurrence_month.trim())
        .bind(notes)
        .bind(id)
        .bind(expense.production_run_id)
        .execute(connection)
        .await
        .map_err(super::map_sqlx_error)?;

        if result.rows_affected() != 1 {
            return Err("The linked production expense could not be updated.".into());
        }

        return Ok(id);
    }

    insert(connection, expense).await
}

fn expense_notes(expense: &ProductionExpenseDraft) -> String {
    format!(
        "RUN-{} cost breakdown: filament {:.2}; add-ons {:.2}; electricity {:.2}; wear {:.2}; labor {:.2}. Generated from production inventory and print profile costs.",
        expense.production_run_id,
        expense.filament_cost,
        expense.add_on_cost,
        expense.electricity_cost,
        expense.wear_cost,
        expense.labor_cost,
    )
}

fn round_money(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}
