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

const JSON_OID = 114;
const JSONB_OID = 3802;

/**
 * `json`/`jsonb` reach drizzle as text, so they are parsed exactly once.
 *
 * node-postgres parses them by default and drizzle's jsonb column then parses
 * any *string* it is handed a second time: a stored `"1900000001"` (a merchant
 * id, a phone number) came back as a number, `"true"` as a boolean, and a
 * schema that expected a string silently fell back to its default (CR-6-c).
 *
 * It has to be the driver-wide parser: drizzle passes its own `types` with
 * every query and falls back to `pg.types`, so a pool-level override is never
 * consulted. Every connection in this workspace is made here, and a raw
 * `db.execute` that selects jsonb gets text — read such columns through a
 * drizzle column, or `JSON.parse` them yourself.
 */
const keepText = (value: string): string => value;
pg.types.setTypeParser(JSON_OID, keepText);
pg.types.setTypeParser(JSONB_OID, keepText);

export function createDb(url: string, options: { max?: number } = {}): DbHandle {
  const pool = new pg.Pool({ connectionString: url, max: options.max ?? 10 });
  const db = drizzle(pool, { casing: 'snake_case' });
  return { db, pool, close: () => pool.end() };
}
