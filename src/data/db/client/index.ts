import { invoke } from "@tauri-apps/api/core";

export const PRINTOPS_DB_PATH = "sqlite:printops-studio.db";

export interface QueryResult {
  readonly lastInsertId?: number;
  readonly rowsAffected: number;
}

export interface SqlDatabase {
  close?(db?: string): Promise<boolean>;
  execute(query: string, bindValues?: readonly unknown[]): Promise<QueryResult>;
  select<T>(query: string, bindValues?: readonly unknown[]): Promise<T>;
}

let databasePromise: Promise<SqlDatabase> | null = null;

export function getDatabase(): Promise<SqlDatabase> {
  databasePromise ??= loadDatabase();

  return databasePromise;
}

export async function closeDatabase(): Promise<boolean> {
  if (!databasePromise) {
    return true;
  }

  databasePromise = null;
  return true;
}

export const databaseClientStatus = {
  databasePath: PRINTOPS_DB_PATH,
  implementation: "native-serialized-sqlite",
  persistenceEnabled: true,
  rawSqlAllowedInReact: false,
} as const;

async function loadDatabase(): Promise<SqlDatabase> {
  return {
    execute(query, bindValues = []) {
      return invoke<QueryResult>("db_execute", {
        query,
        values: [...bindValues],
      });
    },
    select<T>(query: string, bindValues: readonly unknown[] = []) {
      return invoke<T>("db_select", {
        query,
        values: [...bindValues],
      });
    },
  };
}
