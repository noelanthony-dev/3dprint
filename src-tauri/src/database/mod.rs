mod migrations;
pub(crate) mod workflows;

use serde::Serialize;
use serde_json::{Map as JsonMap, Value as JsonValue};
use sqlx::{
    query::Query,
    sqlite::{
        SqliteArguments, SqliteConnectOptions, SqliteJournalMode, SqliteQueryResult, SqliteRow,
        SqliteSynchronous, SqliteValueRef,
    },
    Column, Connection, Row, Sqlite, SqliteConnection, TypeInfo, Value, ValueRef,
};
use std::{
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tokio::sync::{Mutex, MutexGuard};

const DATABASE_FILE_NAME: &str = "printops-studio.db";

pub(crate) struct DatabaseState {
    path: PathBuf,
    runtime: Mutex<DatabaseRuntime>,
}

pub(crate) struct DatabaseRuntime {
    pub(crate) connection: Option<SqliteConnection>,
    pub(crate) restart_required: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DbQueryResult {
    last_insert_id: i64,
    rows_affected: u64,
}

impl DatabaseState {
    pub(crate) async fn open(app: &AppHandle) -> Result<Self, String> {
        // The retired Tauri SQL plugin resolved relative SQLite URLs against
        // app_config_dir. Keep that exact location so existing installations
        // are adopted instead of silently starting a second database.
        let app_config_dir = app
            .path()
            .app_config_dir()
            .map_err(|error| error.to_string())?;
        std::fs::create_dir_all(&app_config_dir).map_err(|error| error.to_string())?;
        let path = app_config_dir.join(DATABASE_FILE_NAME);
        let mut connection = open_connection(&path).await?;

        migrations::migrate(&mut connection, &path).await?;

        Ok(Self {
            path,
            runtime: Mutex::new(DatabaseRuntime {
                connection: Some(connection),
                restart_required: false,
            }),
        })
    }

    pub(crate) async fn lock(&self) -> Result<MutexGuard<'_, DatabaseRuntime>, String> {
        let runtime = self.runtime.lock().await;

        if runtime.restart_required {
            return Err(
                "The database was restored. Restart PrintOps Studio before continuing.".into(),
            );
        }

        if runtime.connection.is_none() {
            return Err(
                "The database connection is not available. Restart PrintOps Studio.".into(),
            );
        }

        Ok(runtime)
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }
}

pub(crate) async fn create_state(app: &AppHandle) -> Result<DatabaseState, String> {
    DatabaseState::open(app).await
}

async fn open_connection(path: &Path) -> Result<SqliteConnection, String> {
    connect(path, true).await
}

async fn open_existing_connection(path: &Path) -> Result<SqliteConnection, String> {
    connect(path, false).await
}

async fn connect(path: &Path, create_if_missing: bool) -> Result<SqliteConnection, String> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(create_if_missing)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));

    SqliteConnection::connect_with(&options)
        .await
        .map_err(map_sqlx_error)
}

#[tauri::command]
pub(crate) async fn export_database_snapshot(
    state: State<'_, DatabaseState>,
) -> Result<Vec<u8>, String> {
    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .ok_or_else(|| "The database connection is not available.".to_string())?;
    create_snapshot_bytes(connection, state.path()).await
}

async fn create_snapshot_bytes(
    connection: &mut SqliteConnection,
    database_path: &Path,
) -> Result<Vec<u8>, String> {
    let snapshot_path = unique_sibling_path(database_path, "backup-snapshot");
    sqlx::query("VACUUM INTO $1")
        .bind(snapshot_path.to_string_lossy().to_string())
        .execute(connection)
        .await
        .map_err(map_sqlx_error)?;

    let bytes = std::fs::read(&snapshot_path).map_err(|error| error.to_string());
    let _ = std::fs::remove_file(&snapshot_path);
    remove_sidecars(&snapshot_path);
    bytes
}

#[tauri::command]
pub(crate) async fn restore_database_snapshot(
    state: State<'_, DatabaseState>,
    database_bytes: Vec<u8>,
) -> Result<(), String> {
    if !database_bytes.starts_with(b"SQLite format 3\0") {
        return Err("The selected backup does not contain a valid SQLite database header.".into());
    }

    let temporary_path = unique_sibling_path(state.path(), "restore-validation");
    std::fs::write(&temporary_path, database_bytes).map_err(|error| error.to_string())?;

    let validation = validate_restore_database(&temporary_path).await;
    if let Err(error) = validation {
        let _ = std::fs::remove_file(&temporary_path);
        remove_sidecars(&temporary_path);
        return Err(error);
    }

    let mut runtime = state.runtime.lock().await;
    if runtime.restart_required {
        let _ = std::fs::remove_file(&temporary_path);
        remove_sidecars(&temporary_path);
        return Err(
            "The database was already restored. Restart PrintOps Studio before restoring again."
                .into(),
        );
    }

    if let Some(connection) = runtime.connection.take() {
        connection.close().await.map_err(map_sqlx_error)?;
    }

    remove_sidecars(state.path());
    let previous_path = unique_sibling_path(state.path(), "pre-restore");
    if let Err(error) = std::fs::rename(state.path(), &previous_path) {
        runtime.connection = Some(open_connection(state.path()).await?);
        let _ = std::fs::remove_file(&temporary_path);
        remove_sidecars(&temporary_path);
        return Err(format!(
            "The current database could not be prepared for restore: {error}"
        ));
    }

    if let Err(error) = std::fs::rename(&temporary_path, state.path()) {
        let _ = std::fs::rename(&previous_path, state.path());
        runtime.connection = Some(open_connection(state.path()).await?);
        remove_sidecars(&temporary_path);
        return Err(format!(
            "The backup could not replace the current database: {error}"
        ));
    }

    remove_sidecars(&temporary_path);
    runtime.restart_required = true;
    Ok(())
}

async fn validate_restore_database(path: &Path) -> Result<(), String> {
    let mut connection = open_existing_connection(path).await?;
    let check: String = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_one(&mut connection)
        .await
        .map_err(map_sqlx_error)?;
    connection.close().await.map_err(map_sqlx_error)?;
    remove_sidecars(path);

    if check.eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err(format!(
            "The backup failed SQLite integrity validation: {check}"
        ))
    }
}

fn unique_sibling_path(database_path: &Path, label: &str) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    database_path.with_file_name(format!("printops-studio.{label}-{timestamp}.db"))
}

fn remove_sidecars(path: &Path) {
    let path = path.to_string_lossy();
    for suffix in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{path}{suffix}"));
    }
}

#[tauri::command]
pub(crate) async fn db_execute(
    state: State<'_, DatabaseState>,
    query: String,
    values: Vec<JsonValue>,
) -> Result<DbQueryResult, String> {
    validate_runtime_statement(&query)?;
    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .ok_or_else(|| "The database connection is not available.".to_string())?;
    let result = bind_query(sqlx::query(&query), values)
        .execute(connection)
        .await
        .map_err(map_sqlx_error)?;

    Ok(map_query_result(result))
}

#[tauri::command]
pub(crate) async fn db_select(
    state: State<'_, DatabaseState>,
    query: String,
    values: Vec<JsonValue>,
) -> Result<Vec<JsonMap<String, JsonValue>>, String> {
    validate_read_statement(&query)?;

    let mut runtime = state.lock().await?;
    let connection = runtime
        .connection
        .as_mut()
        .ok_or_else(|| "The database connection is not available.".to_string())?;
    let rows = bind_query(sqlx::query(&query), values)
        .fetch_all(connection)
        .await
        .map_err(map_sqlx_error)?;

    rows.into_iter().map(row_to_json).collect()
}

fn validate_runtime_statement(query: &str) -> Result<(), String> {
    validate_single_statement(query)?;
    let statement = first_keyword(query);

    if !matches!(
        statement.as_str(),
        "INSERT" | "UPDATE" | "DELETE" | "REPLACE"
    ) {
        return Err(format!(
            "Runtime database writes must be one INSERT, UPDATE, DELETE, or REPLACE statement; received {statement}."
        ));
    }

    Ok(())
}

fn validate_read_statement(query: &str) -> Result<(), String> {
    validate_single_statement(query)?;
    let statement = first_keyword(query);

    if matches!(statement.as_str(), "SELECT" | "EXPLAIN") {
        Ok(())
    } else {
        Err("Read queries must start with SELECT or EXPLAIN.".into())
    }
}

fn validate_single_statement(query: &str) -> Result<(), String> {
    let without_trailing_terminator = query.trim().strip_suffix(';').unwrap_or(query.trim());

    if without_trailing_terminator.contains(';') {
        Err("Runtime database access accepts exactly one SQL statement.".into())
    } else {
        Ok(())
    }
}

fn first_keyword(query: &str) -> String {
    query
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_matches(|character: char| !character.is_ascii_alphabetic())
        .to_ascii_uppercase()
}

pub(crate) fn bind_query<'query>(
    mut query: Query<'query, Sqlite, SqliteArguments<'query>>,
    values: Vec<JsonValue>,
) -> Query<'query, Sqlite, SqliteArguments<'query>> {
    for value in values {
        query = match value {
            JsonValue::Null => query.bind(Option::<String>::None),
            JsonValue::Bool(value) => query.bind(if value { 1_i64 } else { 0_i64 }),
            JsonValue::Number(value) => {
                if let Some(integer) = value.as_i64() {
                    query.bind(integer)
                } else if let Some(unsigned) = value.as_u64() {
                    query.bind(unsigned as i64)
                } else {
                    query.bind(value.as_f64().unwrap_or_default())
                }
            }
            JsonValue::String(value) => query.bind(value),
            JsonValue::Array(_) | JsonValue::Object(_) => query.bind(value.to_string()),
        };
    }

    query
}

fn row_to_json(row: SqliteRow) -> Result<JsonMap<String, JsonValue>, String> {
    let mut result = JsonMap::new();

    for (index, column) in row.columns().iter().enumerate() {
        let raw = row.try_get_raw(index).map_err(map_sqlx_error)?;
        result.insert(column.name().to_string(), sqlite_value_to_json(raw)?);
    }

    Ok(result)
}

fn sqlite_value_to_json(value: SqliteValueRef<'_>) -> Result<JsonValue, String> {
    if value.is_null() {
        return Ok(JsonValue::Null);
    }

    match value.type_info().name() {
        "TEXT" | "DATE" | "TIME" | "DATETIME" => value
            .to_owned()
            .try_decode::<String>()
            .map(JsonValue::String)
            .map_err(|error| error.to_string()),
        "REAL" => value
            .to_owned()
            .try_decode::<f64>()
            .map(JsonValue::from)
            .map_err(|error| error.to_string()),
        "INTEGER" | "NUMERIC" | "BOOLEAN" => value
            .to_owned()
            .try_decode::<i64>()
            .map(JsonValue::from)
            .map_err(|error| error.to_string()),
        "BLOB" => value
            .to_owned()
            .try_decode::<Vec<u8>>()
            .map(|bytes| JsonValue::Array(bytes.into_iter().map(JsonValue::from).collect()))
            .map_err(|error| error.to_string()),
        "NULL" => Ok(JsonValue::Null),
        data_type => Err(format!("Unsupported SQLite result type: {data_type}.")),
    }
}

fn map_query_result(result: SqliteQueryResult) -> DbQueryResult {
    DbQueryResult {
        last_insert_id: result.last_insert_rowid(),
        rows_affected: result.rows_affected(),
    }
}

pub(crate) fn map_sqlx_error(error: sqlx::Error) -> String {
    let message = error.to_string();
    let normalized = message.to_ascii_lowercase();

    if normalized.contains("database is locked")
        || normalized.contains("database table is locked")
        || normalized.contains("sqlite_busy")
        || normalized.contains("sqlite_locked")
    {
        "The PrintOps database is being used by another process. Close other PrintOps windows or database tools, then try again.".into()
    } else {
        message
    }
}

pub(crate) fn is_sale_unit(value: &str) -> bool {
    matches!(value, "piece" | "pair" | "set" | "bundle" | "pack")
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Connection;
    use std::sync::Arc;
    use tempfile::tempdir;

    #[test]
    fn runtime_writes_reject_transactions_schema_changes_and_multiple_statements() {
        for query in [
            "BEGIN IMMEDIATE",
            "COMMIT",
            "ROLLBACK",
            "CREATE TABLE unsafe (id INTEGER)",
            "ALTER TABLE products ADD COLUMN unsafe TEXT",
            "DROP TABLE products",
            "UPDATE products SET notes = ''; DROP TABLE products",
        ] {
            assert!(
                validate_runtime_statement(query).is_err(),
                "{query} should be rejected"
            );
        }

        assert!(
            validate_runtime_statement("UPDATE products SET notes = $1 WHERE id = $2;").is_ok()
        );
        assert!(validate_read_statement("SELECT id FROM products;").is_ok());
        assert!(validate_read_statement("SELECT 1; DELETE FROM products").is_err());
        assert!(validate_read_statement("PRAGMA journal_mode=DELETE").is_err());
    }

    #[tokio::test]
    async fn snapshot_contains_committed_wal_data() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("snapshot-source.db");
        let mut connection = open_connection(&path).await.unwrap();
        sqlx::query("CREATE TABLE snapshot_rows (value TEXT NOT NULL)")
            .execute(&mut connection)
            .await
            .unwrap();
        sqlx::query("INSERT INTO snapshot_rows (value) VALUES ('committed-in-wal')")
            .execute(&mut connection)
            .await
            .unwrap();

        let bytes = create_snapshot_bytes(&mut connection, &path).await.unwrap();
        let restored_path = directory.path().join("snapshot-copy.db");
        std::fs::write(&restored_path, bytes).unwrap();
        let mut restored = open_existing_connection(&restored_path).await.unwrap();
        let value: String = sqlx::query_scalar("SELECT value FROM snapshot_rows")
            .fetch_one(&mut restored)
            .await
            .unwrap();

        assert_eq!(value, "committed-in-wal");
        assert!(validate_restore_database(&restored_path).await.is_ok());
    }

    #[tokio::test]
    async fn serialized_owner_handles_concurrent_reads_and_writes_without_busy_errors() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("concurrent.db");
        let mut connection = open_connection(&path).await.unwrap();
        sqlx::query("CREATE TABLE writes (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)")
            .execute(&mut connection)
            .await
            .unwrap();
        let state = Arc::new(DatabaseState {
            path,
            runtime: Mutex::new(DatabaseRuntime {
                connection: Some(connection),
                restart_required: false,
            }),
        });

        let writes = (0..40).map(|value| {
            let state = Arc::clone(&state);
            tokio::spawn(async move {
                let mut runtime = state.lock().await.unwrap();
                let connection = runtime.connection.as_mut().unwrap();
                let _: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM writes")
                    .fetch_one(&mut *connection)
                    .await
                    .unwrap();
                let mut transaction = connection.begin().await.unwrap();
                sqlx::query("INSERT INTO writes (value) VALUES ($1)")
                    .bind(value)
                    .execute(&mut *transaction)
                    .await
                    .unwrap();
                transaction.commit().await.unwrap();
            })
        });

        for write in writes {
            write.await.unwrap();
        }

        let mut runtime = state.lock().await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM writes")
            .fetch_one(runtime.connection.as_mut().unwrap())
            .await
            .unwrap();
        assert_eq!(count, 40);
    }
}
