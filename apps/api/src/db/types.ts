import type { PoolClient, QueryResult, QueryResultRow } from "pg";

export interface DbExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

/** Pool (or test double) that can hand out a client for transactions / SET LOCAL. */
export interface PoolExecutor extends DbExecutor {
  connect(): Promise<PoolClient>;
}