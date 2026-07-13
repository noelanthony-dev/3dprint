use serde::{Deserialize, Serialize};
use sqlx::Connection;
use tauri::State;

use super::{is_sale_unit, map_sqlx_error, DatabaseState};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AdjustDecimalStockInput {
    id: i64,
    quantity_before: f64,
    quantity_after: f64,
    quantity_delta: f64,
    reason: String,
    notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AdjustFinishedGoodStockInput {
    id: i64,
    quantity_before: i64,
    quantity_after: i64,
    quantity_delta: i64,
    reason: String,
    notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FilamentProfileInput {
    brand: String,
    material_type: String,
    color_name: String,
    hex_color: String,
    transmission_distance: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HueForgeRequirementInput {
    role: String,
    brand: String,
    material_type: String,
    color_name: String,
    hex_color: String,
    transmission_distance: Option<f64>,
    required_grams: f64,
    layer_range: String,
    suggested_filament_id: Option<i64>,
    suggested_filament_label: String,
    match_score: i64,
    match_status: String,
    color_distance: Option<f64>,
    td_delta: Option<f64>,
    stock_signal: String,
    warning: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveHueForgeAnalysisInput {
    product_id: i64,
    feasibility_status: String,
    feasibility_notes: String,
    missing_warnings: Vec<String>,
    requirements: Vec<HueForgeRequirementInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PrintProfileAddOnInput {
    add_on_id: Option<i64>,
    description: String,
    quantity: f64,
    unit_cost: f64,
    total_cost: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavePrintProfileInput {
    id: Option<i64>,
    product_id: i64,
    profile_name: String,
    sale_unit: String,
    filament_grams: f64,
    support_grams: f64,
    filament_cost_per_kg: f64,
    print_hours: f64,
    print_minutes: f64,
    electricity_rate_per_kwh: f64,
    printer_power_watts: f64,
    wear_rate_per_hour: f64,
    labor_minutes: f64,
    labor_rate_per_hour: f64,
    expected_good_units: i64,
    expected_failed_units: i64,
    target_markup: f64,
    notes: String,
    add_ons: Vec<PrintProfileAddOnInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveShoppingItemInput {
    id: Option<i64>,
    item_name: String,
    product_ids: Vec<i64>,
    category: String,
    quantity_needed: f64,
    required_transmission_distance: Option<f64>,
    shopee_listing_name: String,
    unit: String,
    priority: String,
    status: String,
    source_type: String,
    source_note: String,
    notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateSaleDetailsInput {
    sale_id: i64,
    sale_date: String,
    channel: String,
    gross_revenue: f64,
    discounts_fees: f64,
    net_revenue: f64,
    notes: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecordIdOutput {
    id: i64,
}

#[tauri::command]
pub(crate) async fn adjust_filament_stock(
    state: State<'_, DatabaseState>,
    input: AdjustDecimalStockInput,
) -> Result<(), String> {
    validate_decimal_adjustment(&input)?;
    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .expect("connection checked by lock");
    adjust_filament_stock_on_connection(connection, &input).await
}

async fn adjust_filament_stock_on_connection(
    connection: &mut sqlx::SqliteConnection,
    input: &AdjustDecimalStockInput,
) -> Result<(), String> {
    let mut transaction = connection.begin().await.map_err(map_sqlx_error)?;
    let result = sqlx::query(
        "UPDATE filaments SET estimated_grams_left = $1, updated_at = datetime('now') \
         WHERE id = $2 AND ABS(estimated_grams_left - $3) < 0.000001 \
           AND $1 >= 0 AND $1 <= starting_grams",
    )
    .bind(input.quantity_after)
    .bind(input.id)
    .bind(input.quantity_before)
    .execute(&mut *transaction)
    .await
    .map_err(map_sqlx_error)?;

    if result.rows_affected() == 0 {
        return Err("Filament stock changed before the adjustment could be saved.".into());
    }

    sqlx::query(
        "INSERT INTO filament_stock_adjustments \
         (filament_id, grams_delta, grams_after, reason, notes) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(input.id)
    .bind(input.quantity_delta)
    .bind(input.quantity_after)
    .bind(input.reason.trim())
    .bind(input.notes.trim())
    .execute(&mut *transaction)
    .await
    .map_err(map_sqlx_error)?;

    transaction.commit().await.map_err(map_sqlx_error)
}

#[tauri::command]
pub(crate) async fn adjust_addon_stock(
    state: State<'_, DatabaseState>,
    input: AdjustDecimalStockInput,
) -> Result<(), String> {
    validate_decimal_adjustment(&input)?;
    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .expect("connection checked by lock");
    adjust_addon_stock_on_connection(connection, &input).await
}

async fn adjust_addon_stock_on_connection(
    connection: &mut sqlx::SqliteConnection,
    input: &AdjustDecimalStockInput,
) -> Result<(), String> {
    let mut transaction = connection.begin().await.map_err(map_sqlx_error)?;
    let result = sqlx::query(
        "UPDATE addons SET quantity_on_hand = $1, updated_at = datetime('now') \
         WHERE id = $2 AND ABS(quantity_on_hand - $3) < 0.000001 AND $1 >= 0",
    )
    .bind(input.quantity_after)
    .bind(input.id)
    .bind(input.quantity_before)
    .execute(&mut *transaction)
    .await
    .map_err(map_sqlx_error)?;

    if result.rows_affected() == 0 {
        return Err("Add-on stock changed before the adjustment could be saved.".into());
    }

    sqlx::query(
        "INSERT INTO addon_stock_adjustments \
         (addon_id, quantity_delta, quantity_after, reason, notes) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(input.id)
    .bind(input.quantity_delta)
    .bind(input.quantity_after)
    .bind(input.reason.trim())
    .bind(input.notes.trim())
    .execute(&mut *transaction)
    .await
    .map_err(map_sqlx_error)?;

    transaction.commit().await.map_err(map_sqlx_error)
}

#[tauri::command]
pub(crate) async fn adjust_finished_good_stock(
    state: State<'_, DatabaseState>,
    input: AdjustFinishedGoodStockInput,
) -> Result<(), String> {
    if input.id <= 0
        || input.quantity_delta == 0
        || input.quantity_before < 0
        || input.quantity_after < 0
        || input.reason.trim().is_empty()
        || input.quantity_before + input.quantity_delta != input.quantity_after
    {
        return Err("Finished-goods adjustment values are inconsistent.".into());
    }

    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .expect("connection checked by lock");
    adjust_finished_good_stock_on_connection(connection, &input).await
}

async fn adjust_finished_good_stock_on_connection(
    connection: &mut sqlx::SqliteConnection,
    input: &AdjustFinishedGoodStockInput,
) -> Result<(), String> {
    let mut transaction = connection.begin().await.map_err(map_sqlx_error)?;
    let result = sqlx::query(
        "UPDATE finished_goods SET quantity_ready = $1, updated_at = datetime('now') \
         WHERE id = $2 AND quantity_ready = $3 AND quantity_reserved <= $1",
    )
    .bind(input.quantity_after)
    .bind(input.id)
    .bind(input.quantity_before)
    .execute(&mut *transaction)
    .await
    .map_err(map_sqlx_error)?;

    if result.rows_affected() == 0 {
        return Err("Finished-goods stock changed before the adjustment could be saved.".into());
    }

    sqlx::query(
        "INSERT INTO finished_good_stock_adjustments \
         (finished_good_id, quantity_delta, quantity_after, reason, notes) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(input.id)
    .bind(input.quantity_delta)
    .bind(input.quantity_after)
    .bind(input.reason.trim())
    .bind(input.notes.trim())
    .execute(&mut *transaction)
    .await
    .map_err(map_sqlx_error)?;

    transaction.commit().await.map_err(map_sqlx_error)
}

#[tauri::command]
pub(crate) async fn upsert_filament_profiles(
    state: State<'_, DatabaseState>,
    inputs: Vec<FilamentProfileInput>,
) -> Result<(), String> {
    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .expect("connection checked by lock");
    upsert_filament_profiles_on_connection(connection, inputs).await
}

async fn upsert_filament_profiles_on_connection(
    connection: &mut sqlx::SqliteConnection,
    inputs: Vec<FilamentProfileInput>,
) -> Result<(), String> {
    let mut transaction = connection.begin().await.map_err(map_sqlx_error)?;

    for input in inputs {
        if input.brand.trim().is_empty()
            || !is_filament_material(input.material_type.trim())
            || input.color_name.trim().is_empty()
            || !is_hex_color(input.hex_color.trim())
            || input
                .transmission_distance
                .is_some_and(|value| value < 0.0 || !value.is_finite())
        {
            return Err("Filament profile values are invalid.".into());
        }

        sqlx::query(
            "INSERT INTO filament_profiles (brand, material_type, color_name, hex_color, transmission_distance) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT DO UPDATE SET brand = excluded.brand, material_type = excluded.material_type, \
               color_name = excluded.color_name, hex_color = excluded.hex_color, \
               transmission_distance = excluded.transmission_distance, updated_at = datetime('now')",
        )
        .bind(input.brand.trim())
        .bind(input.material_type.trim())
        .bind(input.color_name.trim())
        .bind(input.hex_color.trim().to_ascii_lowercase())
        .bind(input.transmission_distance)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    }

    transaction.commit().await.map_err(map_sqlx_error)
}

#[tauri::command]
pub(crate) async fn save_hueforge_analysis(
    state: State<'_, DatabaseState>,
    input: SaveHueForgeAnalysisInput,
) -> Result<(), String> {
    if input.product_id <= 0
        || !matches!(
            input.feasibility_status.as_str(),
            "ready" | "needs-test" | "missing"
        )
    {
        return Err("HueForge analysis values are invalid.".into());
    }

    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .expect("connection checked by lock");
    save_hueforge_analysis_on_connection(connection, input).await
}

async fn save_hueforge_analysis_on_connection(
    connection: &mut sqlx::SqliteConnection,
    input: SaveHueForgeAnalysisInput,
) -> Result<(), String> {
    let mut transaction = connection.begin().await.map_err(map_sqlx_error)?;
    sqlx::query("DELETE FROM author_filament_requirements WHERE product_id = $1")
        .bind(input.product_id)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    sqlx::query("DELETE FROM hueforge_design_analyses WHERE product_id = $1")
        .bind(input.product_id)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    sqlx::query(
        "INSERT INTO hueforge_design_analyses \
         (product_id, feasibility_status, feasibility_notes, missing_warnings) VALUES ($1, $2, $3, $4)",
    )
    .bind(input.product_id)
    .bind(&input.feasibility_status)
    .bind(input.feasibility_notes.trim())
    .bind(input.missing_warnings.join("\n"))
    .execute(&mut *transaction)
    .await
    .map_err(map_sqlx_error)?;

    for requirement in input.requirements {
        if requirement.role.trim().is_empty()
            || requirement.brand.trim().is_empty()
            || !is_filament_material(requirement.material_type.trim())
            || requirement.color_name.trim().is_empty()
            || !is_hex_color(requirement.hex_color.trim())
            || requirement.required_grams < 0.0
            || !requirement.required_grams.is_finite()
            || requirement
                .transmission_distance
                .is_none_or(|value| value < 0.0 || !value.is_finite())
            || requirement.suggested_filament_id.is_some_and(|id| id <= 0)
            || !(0..=100).contains(&requirement.match_score)
            || requirement
                .color_distance
                .is_some_and(|value| value < 0.0 || !value.is_finite())
            || requirement
                .td_delta
                .is_some_and(|value| value < 0.0 || !value.is_finite())
            || !matches!(
                requirement.match_status.as_str(),
                "excellent" | "good" | "test" | "missing"
            )
            || !matches!(
                requirement.stock_signal.as_str(),
                "ready" | "low" | "empty" | "sealed" | "archived" | "missing"
            )
        {
            return Err("HueForge requirement values are invalid.".into());
        }

        sqlx::query(
            "INSERT INTO author_filament_requirements (\
               product_id, role, brand, material_type, color_name, hex_color, transmission_distance, required_grams,\
               layer_range, suggested_filament_id, suggested_filament_label, match_score, match_status, color_distance,\
               td_delta, stock_signal, warning\
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
        )
        .bind(input.product_id)
        .bind(requirement.role.trim())
        .bind(requirement.brand.trim())
        .bind(requirement.material_type.trim())
        .bind(requirement.color_name.trim())
        .bind(requirement.hex_color.trim().to_ascii_lowercase())
        .bind(requirement.transmission_distance)
        .bind(requirement.required_grams)
        .bind(requirement.layer_range.trim())
        .bind(requirement.suggested_filament_id)
        .bind(requirement.suggested_filament_label.trim())
        .bind(requirement.match_score)
        .bind(requirement.match_status)
        .bind(requirement.color_distance)
        .bind(requirement.td_delta)
        .bind(requirement.stock_signal)
        .bind(requirement.warning.trim())
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    }

    transaction.commit().await.map_err(map_sqlx_error)
}

#[tauri::command]
pub(crate) async fn save_print_profile(
    state: State<'_, DatabaseState>,
    input: SavePrintProfileInput,
) -> Result<RecordIdOutput, String> {
    validate_print_profile(&input)?;
    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .expect("connection checked by lock");
    save_print_profile_on_connection(connection, input).await
}

async fn save_print_profile_on_connection(
    connection: &mut sqlx::SqliteConnection,
    input: SavePrintProfileInput,
) -> Result<RecordIdOutput, String> {
    let mut transaction = connection.begin().await.map_err(map_sqlx_error)?;
    let first_add_on = input.add_ons.first();
    let total_add_on_cost: f64 = input.add_ons.iter().map(|item| item.total_cost).sum();

    let id = if let Some(id) = input.id {
        let result = sqlx::query(
            "UPDATE print_profiles SET product_id=$1, profile_name=$2, sale_unit=$3, filament_grams=$4, support_grams=$5,\
             filament_cost_per_kg=$6, add_on_id=$7, add_on_description=$8, add_on_quantity=$9, add_on_cost=$10,\
             print_hours=$11, print_minutes=$12, electricity_rate_per_kwh=$13, printer_power_watts=$14, wear_rate_per_hour=$15,\
             labor_minutes=$16, labor_rate_per_hour=$17, expected_good_units=$18, expected_failed_units=$19, target_markup=$20,\
             notes=$21, updated_at=datetime('now') WHERE id=$22",
        )
        .bind(input.product_id)
        .bind(input.profile_name.trim())
        .bind(input.sale_unit.trim())
        .bind(input.filament_grams)
        .bind(input.support_grams)
        .bind(input.filament_cost_per_kg)
        .bind(first_add_on.and_then(|item| item.add_on_id))
        .bind(first_add_on.map(|item| item.description.trim()).unwrap_or(""))
        .bind(first_add_on.map(|item| item.quantity).unwrap_or(0.0))
        .bind(total_add_on_cost)
        .bind(input.print_hours)
        .bind(input.print_minutes)
        .bind(input.electricity_rate_per_kwh)
        .bind(input.printer_power_watts)
        .bind(input.wear_rate_per_hour)
        .bind(input.labor_minutes)
        .bind(input.labor_rate_per_hour)
        .bind(input.expected_good_units)
        .bind(input.expected_failed_units)
        .bind(input.target_markup)
        .bind(input.notes.trim())
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
        if result.rows_affected() == 0 {
            return Err(format!("Print profile {id} does not exist."));
        }
        id
    } else {
        sqlx::query(
            "INSERT INTO print_profiles (product_id,profile_name,sale_unit,filament_grams,support_grams,filament_cost_per_kg,\
             add_on_id,add_on_description,add_on_quantity,add_on_cost,print_hours,print_minutes,electricity_rate_per_kwh,\
             printer_power_watts,wear_rate_per_hour,labor_minutes,labor_rate_per_hour,expected_good_units,expected_failed_units,target_markup,notes)\
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)",
        )
        .bind(input.product_id)
        .bind(input.profile_name.trim())
        .bind(input.sale_unit.trim())
        .bind(input.filament_grams)
        .bind(input.support_grams)
        .bind(input.filament_cost_per_kg)
        .bind(first_add_on.and_then(|item| item.add_on_id))
        .bind(first_add_on.map(|item| item.description.trim()).unwrap_or(""))
        .bind(first_add_on.map(|item| item.quantity).unwrap_or(0.0))
        .bind(total_add_on_cost)
        .bind(input.print_hours)
        .bind(input.print_minutes)
        .bind(input.electricity_rate_per_kwh)
        .bind(input.printer_power_watts)
        .bind(input.wear_rate_per_hour)
        .bind(input.labor_minutes)
        .bind(input.labor_rate_per_hour)
        .bind(input.expected_good_units)
        .bind(input.expected_failed_units)
        .bind(input.target_markup)
        .bind(input.notes.trim())
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?
        .last_insert_rowid()
    };

    sqlx::query("DELETE FROM print_profile_addons WHERE print_profile_id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    for add_on in input.add_ons {
        sqlx::query(
            "INSERT INTO print_profile_addons \
             (print_profile_id,addon_id,description,quantity,unit_cost,total_cost) VALUES ($1,$2,$3,$4,$5,$6)",
        )
        .bind(id)
        .bind(add_on.add_on_id)
        .bind(add_on.description.trim())
        .bind(add_on.quantity)
        .bind(add_on.unit_cost)
        .bind(add_on.total_cost)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    }

    transaction.commit().await.map_err(map_sqlx_error)?;
    Ok(RecordIdOutput { id })
}

#[tauri::command]
pub(crate) async fn save_shopping_item(
    state: State<'_, DatabaseState>,
    mut input: SaveShoppingItemInput,
) -> Result<RecordIdOutput, String> {
    validate_shopping_item(&input)?;
    input.product_ids.sort_unstable();
    input.product_ids.dedup();
    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .expect("connection checked by lock");
    save_shopping_item_on_connection(connection, input).await
}

async fn save_shopping_item_on_connection(
    connection: &mut sqlx::SqliteConnection,
    input: SaveShoppingItemInput,
) -> Result<RecordIdOutput, String> {
    let primary_product_id = input.product_ids.first().copied();
    let mut transaction = connection.begin().await.map_err(map_sqlx_error)?;

    let id = if let Some(id) = input.id {
        let result = sqlx::query(
            "UPDATE shopping_list_items SET item_name=$1,product_id=$2,category=$3,quantity_needed=$4,\
             required_transmission_distance=$5,shopee_listing_name=$6,unit=$7,priority=$8,status=$9,source_type=$10,\
             source_note=$11,notes=$12,updated_at=datetime('now') WHERE id=$13",
        )
        .bind(input.item_name.trim())
        .bind(primary_product_id)
        .bind(&input.category)
        .bind(input.quantity_needed)
        .bind(input.required_transmission_distance)
        .bind(input.shopee_listing_name.trim())
        .bind(input.unit.trim())
        .bind(&input.priority)
        .bind(&input.status)
        .bind(&input.source_type)
        .bind(input.source_note.trim())
        .bind(input.notes.trim())
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
        if result.rows_affected() == 0 {
            return Err(format!("Shopping list item {id} does not exist."));
        }
        id
    } else {
        sqlx::query(
            "INSERT INTO shopping_list_items (item_name,product_id,category,quantity_needed,required_transmission_distance,\
             shopee_listing_name,unit,priority,status,source_type,source_note,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        )
        .bind(input.item_name.trim())
        .bind(primary_product_id)
        .bind(&input.category)
        .bind(input.quantity_needed)
        .bind(input.required_transmission_distance)
        .bind(input.shopee_listing_name.trim())
        .bind(input.unit.trim())
        .bind(&input.priority)
        .bind(&input.status)
        .bind(&input.source_type)
        .bind(input.source_note.trim())
        .bind(input.notes.trim())
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?
        .last_insert_rowid()
    };

    sqlx::query("DELETE FROM shopping_list_item_products WHERE shopping_item_id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    for product_id in input.product_ids {
        sqlx::query(
            "INSERT OR IGNORE INTO shopping_list_item_products (shopping_item_id, product_id) VALUES ($1, $2)",
        )
        .bind(id)
        .bind(product_id)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    }

    transaction.commit().await.map_err(map_sqlx_error)?;
    Ok(RecordIdOutput { id })
}

#[tauri::command]
pub(crate) async fn delete_product(state: State<'_, DatabaseState>, id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err("Product id is invalid.".into());
    }
    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .expect("connection checked by lock");
    delete_product_on_connection(connection, id).await
}

#[tauri::command]
pub(crate) async fn update_sale_details(
    state: State<'_, DatabaseState>,
    input: UpdateSaleDetailsInput,
) -> Result<(), String> {
    validate_sale_details(&input)?;
    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .expect("connection checked by lock");
    update_sale_details_on_connection(connection, &input).await
}

async fn update_sale_details_on_connection(
    connection: &mut sqlx::SqliteConnection,
    input: &UpdateSaleDetailsInput,
) -> Result<(), String> {
    let mut transaction = connection.begin().await.map_err(map_sqlx_error)?;
    let result = sqlx::query(
        "UPDATE sales SET sale_date=$1, channel=$2, gross_revenue=$3, discounts_fees=$4, \
         net_revenue=$5, notes=$6, updated_at=datetime('now') WHERE id=$7",
    )
    .bind(input.sale_date.trim())
    .bind(&input.channel)
    .bind(input.gross_revenue)
    .bind(input.discounts_fees)
    .bind(input.net_revenue)
    .bind(input.notes.trim())
    .bind(input.sale_id)
    .execute(&mut *transaction)
    .await
    .map_err(map_sqlx_error)?;

    if result.rows_affected() == 0 {
        return Err(format!("Sale {} does not exist.", input.sale_id));
    }

    transaction.commit().await.map_err(map_sqlx_error)
}

async fn delete_product_on_connection(
    connection: &mut sqlx::SqliteConnection,
    id: i64,
) -> Result<(), String> {
    let mut transaction = connection.begin().await.map_err(map_sqlx_error)?;
    sqlx::query("UPDATE shopping_list_items SET product_id = NULL WHERE product_id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    sqlx::query("DELETE FROM shopping_list_item_products WHERE product_id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    let result = sqlx::query("DELETE FROM products WHERE id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(map_sqlx_error)?;
    if result.rows_affected() == 0 {
        return Err(format!("Product {id} does not exist."));
    }
    transaction.commit().await.map_err(map_sqlx_error)
}

fn validate_decimal_adjustment(input: &AdjustDecimalStockInput) -> Result<(), String> {
    if input.id <= 0
        || input.reason.trim().is_empty()
        || !input.quantity_before.is_finite()
        || !input.quantity_after.is_finite()
        || !input.quantity_delta.is_finite()
        || input.quantity_before < 0.0
        || input.quantity_delta.abs() < 0.000_001
        || input.quantity_after < 0.0
        || (input.quantity_before + input.quantity_delta - input.quantity_after).abs() > 0.000_001
    {
        Err("Stock adjustment values are inconsistent.".into())
    } else {
        Ok(())
    }
}

fn validate_print_profile(input: &SavePrintProfileInput) -> Result<(), String> {
    let non_negative = [
        input.filament_grams,
        input.support_grams,
        input.filament_cost_per_kg,
        input.print_hours,
        input.print_minutes,
        input.electricity_rate_per_kwh,
        input.printer_power_watts,
        input.wear_rate_per_hour,
        input.labor_minutes,
        input.labor_rate_per_hour,
    ]
    .into_iter()
    .all(|value| value >= 0.0 && value.is_finite());
    let mut add_on_ids = std::collections::HashSet::new();
    let add_ons_valid = input.add_ons.iter().all(|item| {
        item.add_on_id
            .is_none_or(|id| id > 0 && add_on_ids.insert(id))
            && (item.add_on_id.is_some() || !item.description.trim().is_empty())
            && item.quantity >= 0.0
            && item.quantity.is_finite()
            && item.unit_cost >= 0.0
            && item.unit_cost.is_finite()
            && item.total_cost >= 0.0
            && item.total_cost.is_finite()
    });

    if input.product_id <= 0
        || input.profile_name.trim().is_empty()
        || input.id.is_some_and(|id| id <= 0)
        || !is_sale_unit(input.sale_unit.trim())
        || !non_negative
        || !add_ons_valid
        || input.expected_good_units <= 0
        || input.expected_failed_units < 0
        || !input.target_markup.is_finite()
        || input.target_markup < 1.0
    {
        Err("Print profile values are invalid.".into())
    } else {
        Ok(())
    }
}

fn validate_shopping_item(input: &SaveShoppingItemInput) -> Result<(), String> {
    if input.item_name.trim().is_empty()
        || input.id.is_some_and(|id| id <= 0)
        || input.quantity_needed <= 0.0
        || !input.quantity_needed.is_finite()
        || input
            .required_transmission_distance
            .is_some_and(|value| value < 0.0 || !value.is_finite())
        || input.unit.trim().is_empty()
        || input.product_ids.iter().any(|id| *id <= 0)
        || !matches!(
            input.category.as_str(),
            "Filament" | "Hardware" | "Packaging" | "Tooling" | "License" | "Other"
        )
        || !matches!(input.priority.as_str(), "low" | "normal" | "high")
        || !matches!(input.status.as_str(), "open" | "purchased" | "ignored")
        || !matches!(
            input.source_type.as_str(),
            "manual" | "low-stock-addon" | "missing-hueforge-filament"
        )
    {
        Err("Shopping-list item values are invalid.".into())
    } else {
        Ok(())
    }
}

fn validate_sale_details(input: &UpdateSaleDetailsInput) -> Result<(), String> {
    let expected_net = ((input.gross_revenue - input.discounts_fees) * 100.0).round() / 100.0;
    if input.sale_id <= 0
        || input.sale_date.trim().is_empty()
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
        Err("Sale correction values are invalid or inconsistent.".into())
    } else {
        Ok(())
    }
}

fn is_filament_material(value: &str) -> bool {
    matches!(
        value,
        "PLA" | "PLA+" | "PETG" | "ABS" | "ASA" | "TPU" | "Other"
    )
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..]
            .bytes()
            .all(|character| character.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tempfile::tempdir;

    #[tokio::test]
    async fn serialized_state_handles_rapid_cross_feature_stock_saves() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("cross-feature-concurrency.db");
        let mut connection = super::super::open_connection(&path).await.unwrap();
        for statement in [
            "CREATE TABLE filaments (id INTEGER PRIMARY KEY, starting_grams REAL NOT NULL, estimated_grams_left REAL NOT NULL, updated_at TEXT)",
            "CREATE TABLE filament_stock_adjustments (id INTEGER PRIMARY KEY, filament_id INTEGER NOT NULL, grams_delta REAL NOT NULL, grams_after REAL NOT NULL, reason TEXT NOT NULL, notes TEXT)",
            "CREATE TABLE addons (id INTEGER PRIMARY KEY, quantity_on_hand REAL NOT NULL, updated_at TEXT)",
            "CREATE TABLE addon_stock_adjustments (id INTEGER PRIMARY KEY, addon_id INTEGER NOT NULL, quantity_delta REAL NOT NULL, quantity_after REAL NOT NULL, reason TEXT NOT NULL, notes TEXT)",
            "CREATE TABLE finished_goods (id INTEGER PRIMARY KEY, quantity_ready INTEGER NOT NULL, quantity_reserved INTEGER NOT NULL, updated_at TEXT)",
            "CREATE TABLE finished_good_stock_adjustments (id INTEGER PRIMARY KEY, finished_good_id INTEGER NOT NULL, quantity_delta INTEGER NOT NULL, quantity_after INTEGER NOT NULL, reason TEXT NOT NULL, notes TEXT)",
        ] {
            sqlx::query(statement).execute(&mut connection).await.unwrap();
        }
        for id in 1..=10 {
            sqlx::query("INSERT INTO filaments VALUES ($1, 1000, 100, '2026-01-01')")
                .bind(id)
                .execute(&mut connection)
                .await
                .unwrap();
            sqlx::query("INSERT INTO addons VALUES ($1, 20, '2026-01-01')")
                .bind(id)
                .execute(&mut connection)
                .await
                .unwrap();
            sqlx::query("INSERT INTO finished_goods VALUES ($1, 8, 0, '2026-01-01')")
                .bind(id)
                .execute(&mut connection)
                .await
                .unwrap();
        }
        let state = Arc::new(DatabaseState {
            path,
            runtime: tokio::sync::Mutex::new(crate::database::DatabaseRuntime {
                connection: Some(connection),
                restart_required: false,
            }),
        });

        let saves = (1..=30).map(|sequence| {
            let state = Arc::clone(&state);
            tokio::spawn(async move {
                let id = ((sequence - 1) % 10) + 1;
                let mut runtime = state.lock().await?;
                let connection = runtime.connection.as_mut().unwrap();
                match sequence % 3 {
                    0 => {
                        adjust_filament_stock_on_connection(
                            connection,
                            &AdjustDecimalStockInput {
                                id,
                                quantity_before: 100.0,
                                quantity_after: 90.0,
                                quantity_delta: -10.0,
                                reason: "test".into(),
                                notes: String::new(),
                            },
                        )
                        .await
                    }
                    1 => {
                        adjust_addon_stock_on_connection(
                            connection,
                            &AdjustDecimalStockInput {
                                id,
                                quantity_before: 20.0,
                                quantity_after: 18.0,
                                quantity_delta: -2.0,
                                reason: "test".into(),
                                notes: String::new(),
                            },
                        )
                        .await
                    }
                    _ => {
                        adjust_finished_good_stock_on_connection(
                            connection,
                            &AdjustFinishedGoodStockInput {
                                id,
                                quantity_before: 8,
                                quantity_after: 9,
                                quantity_delta: 1,
                                reason: "test".into(),
                                notes: String::new(),
                            },
                        )
                        .await
                    }
                }
            })
        });

        for save in saves {
            save.await.unwrap().unwrap();
        }

        let mut runtime = state.lock().await.unwrap();
        for table in [
            "filament_stock_adjustments",
            "addon_stock_adjustments",
            "finished_good_stock_adjustments",
        ] {
            let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                .fetch_one(runtime.connection.as_mut().unwrap())
                .await
                .unwrap();
            assert_eq!(count, 10);
        }
    }

    #[tokio::test]
    async fn sale_detail_correction_preserves_stock_history() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("sale-correction.db");
        let mut connection = super::super::open_connection(&path).await.unwrap();
        for statement in [
            "CREATE TABLE sales (id INTEGER PRIMARY KEY, sale_date TEXT NOT NULL, channel TEXT NOT NULL, gross_revenue REAL NOT NULL, discounts_fees REAL NOT NULL, net_revenue REAL NOT NULL, notes TEXT, stock_quantity_before INTEGER NOT NULL, stock_quantity_after INTEGER NOT NULL, updated_at TEXT)",
            "CREATE TABLE sale_stock_movements (id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL, quantity_delta INTEGER NOT NULL, quantity_before INTEGER NOT NULL, quantity_after INTEGER NOT NULL)",
            "INSERT INTO sales VALUES (1, '2026-07-08', 'Direct', 0, 0, 0, '', 3, 2, '2026-07-08')",
            "INSERT INTO sale_stock_movements VALUES (1, 1, -1, 3, 2)",
        ] {
            sqlx::query(statement).execute(&mut connection).await.unwrap();
        }
        let input = UpdateSaleDetailsInput {
            sale_id: 1,
            sale_date: "2026-07-09".into(),
            channel: "Sincerely".into(),
            gross_revenue: 150.0,
            discounts_fees: 10.0,
            net_revenue: 140.0,
            notes: "Corrected price".into(),
        };

        update_sale_details_on_connection(&mut connection, &input)
            .await
            .unwrap();

        let sale: (String, String, f64, f64, i64, i64) = sqlx::query_as(
            "SELECT sale_date, channel, gross_revenue, net_revenue, stock_quantity_before, stock_quantity_after FROM sales WHERE id=1",
        )
        .fetch_one(&mut connection)
        .await
        .unwrap();
        let movement: (i64, i64, i64) = sqlx::query_as(
            "SELECT quantity_delta, quantity_before, quantity_after FROM sale_stock_movements WHERE sale_id=1",
        )
        .fetch_one(&mut connection)
        .await
        .unwrap();

        assert_eq!(
            sale,
            ("2026-07-09".into(), "Sincerely".into(), 150.0, 140.0, 3, 2)
        );
        assert_eq!(movement, (-1, 3, 2));
    }

    #[tokio::test]
    async fn stock_adjustment_rolls_back_when_ledger_insert_fails() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("workflow-rollback.db");
        let mut connection = super::super::open_connection(&path).await.unwrap();
        sqlx::query(
            "CREATE TABLE filaments (\
               id INTEGER PRIMARY KEY, starting_grams REAL NOT NULL, estimated_grams_left REAL NOT NULL, updated_at TEXT\
             )",
        )
        .execute(&mut connection)
        .await
        .unwrap();
        sqlx::query(
            "CREATE TABLE filament_stock_adjustments (\
               id INTEGER PRIMARY KEY, filament_id INTEGER NOT NULL, grams_delta REAL NOT NULL, grams_after REAL NOT NULL,\
               reason TEXT NOT NULL, notes TEXT\
             )",
        )
        .execute(&mut connection)
        .await
        .unwrap();
        sqlx::query("INSERT INTO filaments VALUES (1, 1000, 100, '2026-01-01')")
            .execute(&mut connection)
            .await
            .unwrap();
        sqlx::query(
            "CREATE TRIGGER fail_adjustment BEFORE INSERT ON filament_stock_adjustments \
             BEGIN SELECT RAISE(ABORT, 'injected ledger failure'); END",
        )
        .execute(&mut connection)
        .await
        .unwrap();
        let input = AdjustDecimalStockInput {
            id: 1,
            quantity_before: 100.0,
            quantity_after: 90.0,
            quantity_delta: -10.0,
            reason: "test".into(),
            notes: String::new(),
        };

        assert!(adjust_filament_stock_on_connection(&mut connection, &input)
            .await
            .is_err());

        let remaining: f64 =
            sqlx::query_scalar("SELECT estimated_grams_left FROM filaments WHERE id=1")
                .fetch_one(&mut connection)
                .await
                .unwrap();
        let ledger_rows: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM filament_stock_adjustments")
                .fetch_one(&mut connection)
                .await
                .unwrap();

        assert_eq!(remaining, 100.0);
        assert_eq!(ledger_rows, 0);
    }

    #[tokio::test]
    async fn addon_and_finished_good_adjustments_roll_back_on_ledger_failure() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("other-stock-rollbacks.db");
        let mut connection = super::super::open_connection(&path).await.unwrap();
        for statement in [
            "CREATE TABLE addons (id INTEGER PRIMARY KEY, quantity_on_hand REAL NOT NULL, updated_at TEXT)",
            "CREATE TABLE addon_stock_adjustments (id INTEGER PRIMARY KEY, addon_id INTEGER NOT NULL, quantity_delta REAL NOT NULL, quantity_after REAL NOT NULL, reason TEXT NOT NULL, notes TEXT)",
            "CREATE TABLE finished_goods (id INTEGER PRIMARY KEY, quantity_ready INTEGER NOT NULL, quantity_reserved INTEGER NOT NULL, updated_at TEXT)",
            "CREATE TABLE finished_good_stock_adjustments (id INTEGER PRIMARY KEY, finished_good_id INTEGER NOT NULL, quantity_delta INTEGER NOT NULL, quantity_after INTEGER NOT NULL, reason TEXT NOT NULL, notes TEXT)",
            "INSERT INTO addons VALUES (1, 20, '2026-01-01')",
            "INSERT INTO finished_goods VALUES (1, 8, 2, '2026-01-01')",
            "CREATE TRIGGER fail_addon_ledger BEFORE INSERT ON addon_stock_adjustments BEGIN SELECT RAISE(ABORT, 'injected add-on ledger failure'); END",
            "CREATE TRIGGER fail_goods_ledger BEFORE INSERT ON finished_good_stock_adjustments BEGIN SELECT RAISE(ABORT, 'injected goods ledger failure'); END",
        ] {
            sqlx::query(statement).execute(&mut connection).await.unwrap();
        }

        let addon_input = AdjustDecimalStockInput {
            id: 1,
            quantity_before: 20.0,
            quantity_after: 18.0,
            quantity_delta: -2.0,
            reason: "test".into(),
            notes: String::new(),
        };
        let goods_input = AdjustFinishedGoodStockInput {
            id: 1,
            quantity_before: 8,
            quantity_after: 10,
            quantity_delta: 2,
            reason: "test".into(),
            notes: String::new(),
        };

        assert!(
            adjust_addon_stock_on_connection(&mut connection, &addon_input)
                .await
                .is_err()
        );
        assert!(
            adjust_finished_good_stock_on_connection(&mut connection, &goods_input)
                .await
                .is_err()
        );

        let addon_quantity: f64 =
            sqlx::query_scalar("SELECT quantity_on_hand FROM addons WHERE id=1")
                .fetch_one(&mut connection)
                .await
                .unwrap();
        let goods_quantity: i64 =
            sqlx::query_scalar("SELECT quantity_ready FROM finished_goods WHERE id=1")
                .fetch_one(&mut connection)
                .await
                .unwrap();
        assert_eq!(addon_quantity, 20.0);
        assert_eq!(goods_quantity, 8);
    }

    #[tokio::test]
    async fn bulk_profile_upsert_rolls_back_every_row_on_failure() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("profile-bulk-rollback.db");
        let mut connection = super::super::open_connection(&path).await.unwrap();
        for statement in [
            "CREATE TABLE filament_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, material_type TEXT NOT NULL, color_name TEXT NOT NULL, hex_color TEXT NOT NULL, transmission_distance REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)",
            "CREATE UNIQUE INDEX profiles_unique ON filament_profiles (lower(brand), material_type, lower(color_name), hex_color, COALESCE(transmission_distance, -1))",
            "CREATE TRIGGER fail_second_profile BEFORE INSERT ON filament_profiles WHEN NEW.brand = 'Second' BEGIN SELECT RAISE(ABORT, 'injected profile failure'); END",
        ] {
            sqlx::query(statement).execute(&mut connection).await.unwrap();
        }
        let profiles = vec![
            FilamentProfileInput {
                brand: "First".into(),
                material_type: "PLA".into(),
                color_name: "Black".into(),
                hex_color: "#000000".into(),
                transmission_distance: Some(0.3),
            },
            FilamentProfileInput {
                brand: "Second".into(),
                material_type: "PLA".into(),
                color_name: "White".into(),
                hex_color: "#ffffff".into(),
                transmission_distance: Some(4.0),
            },
        ];

        assert!(
            upsert_filament_profiles_on_connection(&mut connection, profiles)
                .await
                .is_err()
        );
        let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM filament_profiles")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        assert_eq!(rows, 0);
    }

    #[tokio::test]
    async fn hueforge_replacement_restores_old_rows_on_failure() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("hueforge-rollback.db");
        let mut connection = super::super::open_connection(&path).await.unwrap();
        for statement in [
            "CREATE TABLE hueforge_design_analyses (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL UNIQUE, feasibility_status TEXT NOT NULL, feasibility_notes TEXT NOT NULL, missing_warnings TEXT)",
            "CREATE TABLE author_filament_requirements (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, role TEXT NOT NULL, brand TEXT NOT NULL, material_type TEXT NOT NULL, color_name TEXT NOT NULL, hex_color TEXT NOT NULL, transmission_distance REAL NOT NULL, required_grams REAL NOT NULL, layer_range TEXT, suggested_filament_id INTEGER, suggested_filament_label TEXT, match_score INTEGER NOT NULL, match_status TEXT NOT NULL, color_distance REAL, td_delta REAL, stock_signal TEXT NOT NULL, warning TEXT)",
            "INSERT INTO hueforge_design_analyses VALUES (1, 7, 'missing', 'old analysis', 'old warning')",
            "INSERT INTO author_filament_requirements VALUES (1, 7, 'Base', 'Old', 'PLA', 'Old Black', '#000000', 0.3, 5, '', NULL, '', 0, 'missing', NULL, NULL, 'missing', 'old requirement')",
            "CREATE TRIGGER fail_requirement BEFORE INSERT ON author_filament_requirements BEGIN SELECT RAISE(ABORT, 'injected requirement failure'); END",
        ] {
            sqlx::query(statement).execute(&mut connection).await.unwrap();
        }
        let input = SaveHueForgeAnalysisInput {
            product_id: 7,
            feasibility_status: "ready".into(),
            feasibility_notes: "new analysis".into(),
            missing_warnings: vec![],
            requirements: vec![HueForgeRequirementInput {
                role: "Base".into(),
                brand: "New".into(),
                material_type: "PLA".into(),
                color_name: "New Black".into(),
                hex_color: "#111111".into(),
                transmission_distance: Some(0.4),
                required_grams: 6.0,
                layer_range: String::new(),
                suggested_filament_id: None,
                suggested_filament_label: String::new(),
                match_score: 90,
                match_status: "good".into(),
                color_distance: Some(1.0),
                td_delta: Some(0.1),
                stock_signal: "ready".into(),
                warning: String::new(),
            }],
        };

        assert!(save_hueforge_analysis_on_connection(&mut connection, input)
            .await
            .is_err());
        let notes: String = sqlx::query_scalar(
            "SELECT feasibility_notes FROM hueforge_design_analyses WHERE product_id=7",
        )
        .fetch_one(&mut connection)
        .await
        .unwrap();
        let brand: String =
            sqlx::query_scalar("SELECT brand FROM author_filament_requirements WHERE product_id=7")
                .fetch_one(&mut connection)
                .await
                .unwrap();
        assert_eq!(notes, "old analysis");
        assert_eq!(brand, "Old");
    }

    #[tokio::test]
    async fn profile_and_shopping_children_roll_back_parent_rows_on_failure() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("child-row-rollbacks.db");
        let mut connection = super::super::open_connection(&path).await.unwrap();
        for statement in [
            "CREATE TABLE print_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, profile_name TEXT NOT NULL, sale_unit TEXT NOT NULL, filament_grams REAL NOT NULL, support_grams REAL NOT NULL, filament_cost_per_kg REAL NOT NULL, add_on_id INTEGER, add_on_description TEXT, add_on_quantity REAL NOT NULL, add_on_cost REAL NOT NULL, print_hours REAL NOT NULL, print_minutes REAL NOT NULL, electricity_rate_per_kwh REAL NOT NULL, printer_power_watts REAL NOT NULL, wear_rate_per_hour REAL NOT NULL, labor_minutes REAL NOT NULL, labor_rate_per_hour REAL NOT NULL, expected_good_units INTEGER NOT NULL, expected_failed_units INTEGER NOT NULL, target_markup REAL NOT NULL, notes TEXT)",
            "CREATE TABLE print_profile_addons (id INTEGER PRIMARY KEY, print_profile_id INTEGER NOT NULL, addon_id INTEGER, description TEXT NOT NULL, quantity REAL NOT NULL, unit_cost REAL NOT NULL, total_cost REAL NOT NULL)",
            "CREATE TRIGGER fail_profile_child BEFORE INSERT ON print_profile_addons BEGIN SELECT RAISE(ABORT, 'injected profile child failure'); END",
            "CREATE TABLE shopping_list_items (id INTEGER PRIMARY KEY AUTOINCREMENT, item_name TEXT NOT NULL, product_id INTEGER, category TEXT NOT NULL, quantity_needed REAL NOT NULL, required_transmission_distance REAL, shopee_listing_name TEXT, unit TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL, source_type TEXT NOT NULL, source_note TEXT, notes TEXT)",
            "CREATE TABLE shopping_list_item_products (shopping_item_id INTEGER NOT NULL, product_id INTEGER NOT NULL, PRIMARY KEY (shopping_item_id, product_id))",
            "CREATE TRIGGER fail_shopping_link BEFORE INSERT ON shopping_list_item_products BEGIN SELECT RAISE(ABORT, 'injected shopping link failure'); END",
        ] {
            sqlx::query(statement).execute(&mut connection).await.unwrap();
        }
        let profile = SavePrintProfileInput {
            id: None,
            product_id: 7,
            profile_name: "Standard".into(),
            sale_unit: "piece".into(),
            filament_grams: 10.0,
            support_grams: 0.0,
            filament_cost_per_kg: 1000.0,
            print_hours: 1.0,
            print_minutes: 0.0,
            electricity_rate_per_kwh: 1.0,
            printer_power_watts: 100.0,
            wear_rate_per_hour: 1.0,
            labor_minutes: 0.0,
            labor_rate_per_hour: 0.0,
            expected_good_units: 1,
            expected_failed_units: 0,
            target_markup: 3.0,
            notes: String::new(),
            add_ons: vec![PrintProfileAddOnInput {
                add_on_id: Some(3),
                description: "Switch".into(),
                quantity: 1.0,
                unit_cost: 2.0,
                total_cost: 2.0,
            }],
        };
        let shopping = SaveShoppingItemInput {
            id: None,
            item_name: "Filament".into(),
            product_ids: vec![7],
            category: "Filament".into(),
            quantity_needed: 1.0,
            required_transmission_distance: Some(1.0),
            shopee_listing_name: String::new(),
            unit: "spool".into(),
            priority: "normal".into(),
            status: "open".into(),
            source_type: "manual".into(),
            source_note: String::new(),
            notes: String::new(),
        };

        assert!(save_print_profile_on_connection(&mut connection, profile)
            .await
            .is_err());
        assert!(save_shopping_item_on_connection(&mut connection, shopping)
            .await
            .is_err());
        let profiles: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM print_profiles")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        let shopping_items: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM shopping_list_items")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        assert_eq!(profiles, 0);
        assert_eq!(shopping_items, 0);
    }

    #[tokio::test]
    async fn product_delete_restores_links_when_delete_fails() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("product-delete-rollback.db");
        let mut connection = super::super::open_connection(&path).await.unwrap();
        for statement in [
            "CREATE TABLE products (id INTEGER PRIMARY KEY)",
            "CREATE TABLE shopping_list_items (id INTEGER PRIMARY KEY, product_id INTEGER)",
            "CREATE TABLE shopping_list_item_products (shopping_item_id INTEGER NOT NULL, product_id INTEGER NOT NULL)",
            "INSERT INTO products VALUES (7)",
            "INSERT INTO shopping_list_items VALUES (1, 7)",
            "INSERT INTO shopping_list_item_products VALUES (1, 7)",
            "CREATE TRIGGER fail_product_delete BEFORE DELETE ON products BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END",
        ] {
            sqlx::query(statement).execute(&mut connection).await.unwrap();
        }

        assert!(delete_product_on_connection(&mut connection, 7)
            .await
            .is_err());
        let item_product: i64 =
            sqlx::query_scalar("SELECT product_id FROM shopping_list_items WHERE id=1")
                .fetch_one(&mut connection)
                .await
                .unwrap();
        let links: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM shopping_list_item_products")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        assert_eq!(item_product, 7);
        assert_eq!(links, 1);
    }
}
