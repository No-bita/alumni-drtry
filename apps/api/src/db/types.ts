import type { QueryResult } from "pg";

export interface DbExecutor {
  query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

