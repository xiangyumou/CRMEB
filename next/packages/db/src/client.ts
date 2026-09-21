import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export type Db = NodePgDatabase;
/** The transaction handle `withTx` passes down; repos accept `Db | Tx`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDb(url: string, options: { max?: number } = {}): DbHandle {
  const pool = new pg.Pool({ connectionString: url, max: options.max ?? 10 });
  const db = drizzle(pool, { casing: 'snake_case' });
  return { db, pool, close: () => pool.end() };
}
