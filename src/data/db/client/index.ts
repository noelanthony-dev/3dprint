import Database from "@tauri-apps/plugin-sql";

export const PRINTOPS_DB_PATH = "sqlite:printops-studio.db";

export interface QueryResult {
  readonly lastInsertId?: number;
  readonly rowsAffected: number;
}

export interface SqlDatabase {
  execute(query: string, bindValues?: readonly unknown[]): Promise<QueryResult>;
  select<T>(query: string, bindValues?: readonly unknown[]): Promise<T>;
}

let databasePromise: Promise<SqlDatabase> | null = null;

export function getDatabase(): Promise<SqlDatabase> {
  databasePromise ??= Database.load(PRINTOPS_DB_PATH);

  return databasePromise;
}

export const databaseClientStatus = {
  databasePath: PRINTOPS_DB_PATH,
  implementation: "tauri-sqlite",
  persistenceEnabled: true,
  rawSqlAllowedInReact: false,
} as const;
