/**
 * The PostgreSQL side of the migration.
 *
 * Opened through `@shop/db` so that the driver-wide `json`/`jsonb` text parser
 * is installed (CR-6-c): a raw `SELECT` of a jsonb column here gives **text**,
 * which is what the verification wants — it parses once, itself, and compares
 * the parsed documents (CR-1-g1).
 *
 * Two deliberate choices:
 *
 * **Column names are derived, not declared.** `@shop/db` builds its drizzle
 * client with `casing: 'snake_case'`, so a schema property `uploadedByAdminId`
 * is the column `uploaded_by_admin_id`. The mappers name their row fields after
 * exactly those properties. Deriving the column name with the same rule means a
 * new target table costs one line in `groups.ts` instead of a column map that
 * drifts; a name that does not exist fails loudly on the first insert, in the
 * integration test, naming the column.
 *
 * **Reload is `DELETE`, not `TRUNCATE`.** The brief forbids
 * `TRUNCATE … RESTART IDENTITY CASCADE`, and plain `TRUNCATE` cannot be used
 * either: PostgreSQL refuses it whenever *any* table outside the list has a
 * foreign key to a listed one, **even when that table is empty** — and
 * `cart_items.product_id → products.id` is exactly that. `DELETE` respects the
 * constraints instead of bypassing them, so reloading `catalog` while an order
 * references a product fails with the constraint name rather than silently
 * cascading the order away. Sequences are then reset explicitly.
 */

import { createDb, type DbHandle } from '@shop/db';
import type pg from 'pg';

import type { RowCounter } from './lib/not-migrated';
import { redactUrl } from './lib/secrets';
import type { TargetRow } from './mapper';

/** `uploadedByAdminId` → `uploaded_by_admin_id`, drizzle's `snake_case` rule. */
export function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** How many rows go into one multi-row INSERT. Bound by PostgreSQL's 65535 parameters. */
const BATCH_ROWS = 500;

export interface Target extends RowCounter {
  /**
   * The connection string with its credentials removed. Safe to print, which
   * is the point: the raw string is never kept on the handle, so no report,
   * log line or error message can reach for it by accident.
   */
  readonly label: string;
  /** Runs `body` inside one transaction, rolling back on any throw. */
  transaction<T>(body: (tx: TargetTx) => Promise<T>): Promise<T>;
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<T[]>;
  tableExists(table: string): Promise<boolean>;
  /** The table's real column names, snake_case, for the runner's preflight. */
  columnsOf(table: string): Promise<Set<string>>;
  /**
   * The table's `json`/`jsonb` column names.
   *
   * Asked of the database rather than declared per group: a hand-kept list is
   * one schema change away from being wrong, and being wrong here means either
   * a rejected insert or — worse — a double-encoded document that loads fine
   * and reads back as a string.
   */
  jsonColumnsOf(table: string): Promise<Set<string>>;
  close(): Promise<void>;
}

/** The handle inside a transaction. Everything a group's load needs. */
export interface TargetTx {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<T[]>;
  /** Empties exactly these tables, children first. Never cascades. */
  clear(tables: readonly string[]): Promise<void>;
  /** Inserts rows, deriving the column list from the first row's keys. */
  insert(table: string, rows: readonly TargetRow[], json?: readonly string[]): Promise<number>;
  /** `setval(pg_get_serial_sequence(table,'id'), max(id))`, so nextval is ahead. */
  resetSequence(table: string): Promise<number | null>;
}

/**
 * Renders one value for the driver.
 *
 * `Date`, `null`, numbers, booleans and strings go through untouched — `pg`
 * knows them. Anything else is a JSON document (`jsonb`), and is stringified
 * here rather than being handed to `pg` as an object, which would render an
 * array as a PostgreSQL array literal.
 */
function encode(value: unknown, jsonColumn: boolean): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  // A `json`/`jsonb` column needs a JSON *document*, and a bare string is not
  // one: `config_values.value` holding a site URL has to arrive as
  // `"https://…"` with the quotes, or PostgreSQL rejects it with `Token
  // "https" is invalid`. Numbers and booleans are valid JSON as they stand, but
  // go through the same call so there is one rule rather than three.
  if (jsonColumn) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function makeTx(client: pg.PoolClient): TargetTx {
  const query = async <T extends pg.QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<T[]> => (await client.query<T>(text, [...values])).rows;

  return {
    query,

    async clear(tables) {
      // Children first: a DELETE that a foreign key refuses is the signal that
      // something outside this group still points at the data.
      for (const table of [...tables].reverse()) {
        await query(`delete from "${table}"`);
      }
    },

    async insert(table, rows, json = []) {
      if (rows.length === 0) return 0;
      const first = rows[0] as TargetRow;
      const keys = Object.keys(first);
      if (keys.length === 0) throw new Error(`表 ${table} 的待插入行没有任何字段`);
      const jsonKeys = new Set(json);
      const columns = keys.map((key) => `"${snakeCase(key)}"`).join(', ');

      let written = 0;
      for (let offset = 0; offset < rows.length; offset += BATCH_ROWS) {
        const batch = rows.slice(offset, offset + BATCH_ROWS);
        const values: unknown[] = [];
        const tuples = batch.map((row) => {
          const placeholders = keys.map((key) => {
            values.push(encode(row[key], jsonKeys.has(key)));
            return `$${String(values.length)}`;
          });
          return `(${placeholders.join(', ')})`;
        });
        await query(`insert into "${table}" (${columns}) values ${tuples.join(', ')}`, values);
        written += batch.length;
      }
      return written;
    },

    async resetSequence(table) {
      // `pg_get_serial_sequence` raises rather than returning null when the
      // column does not exist, so a join table with a composite key has to be
      // ruled out before it is called, not by checking its result.
      const [hasId] = await query<{ present: boolean }>(
        `select exists (
           select 1 from pg_attribute a
            where a.attrelid = $1::regclass and a.attname = 'id'
              and a.attnum > 0 and not a.attisdropped) as present`,
        [table],
      );
      if (hasId?.present !== true) return null;
      const rows = await query<{ sequence: string | null }>(
        `select pg_get_serial_sequence($1, 'id') as sequence`,
        [table],
      );
      const sequence = rows[0]?.sequence ?? null;
      if (sequence === null) return null;
      // `max(id)` with `is_called = true` makes the next value max(id) + 1.
      // An empty table resets to 1 with `is_called = false`, so the first row
      // still gets id 1.
      const [result] = await query<{ value: string }>(
        `select setval($1, coalesce((select max(id) from "${table}"), 1),
                       (select count(*) > 0 from "${table}")) as value`,
        [sequence],
      );
      return result ? Number(result.value) : null;
    },
  };
}

export function openTarget(url: string): Target {
  const handle: DbHandle = createDb(url, { max: 4 });
  const { pool } = handle;

  const query = async <T extends pg.QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<T[]> => (await pool.query<T>(text, [...values])).rows;

  return {
    label: redactUrl(url),
    query,

    async transaction(body) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await body(makeTx(client));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async tableExists(table) {
      const rows = await query<{ exists: boolean }>(
        `select to_regclass($1) is not null as exists`,
        [table],
      );
      return rows[0]?.exists ?? false;
    },

    async columnsOf(table) {
      const rows = await query<{ name: string }>(
        `select a.attname as name
           from pg_attribute a
          where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped`,
        [table],
      );
      return new Set(rows.map((row) => row.name));
    },

    async jsonColumnsOf(table) {
      const rows = await query<{ name: string }>(
        `select a.attname as name
           from pg_attribute a
           join pg_type t on t.oid = a.atttypid
          where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
            and t.typname in ('json', 'jsonb')`,
        [table],
      );
      return new Set(rows.map((row) => row.name));
    },

    async countRows(table) {
      if (!(await this.tableExists(table))) return 0;
      const rows = await query<{ count: string }>(`select count(*)::text as count from "${table}"`);
      return Number(rows[0]?.count ?? '0');
    },

    async countWhere(table, predicate) {
      if (!(await this.tableExists(table))) return 0;
      const rows = await query<{ count: string }>(
        `select count(*)::text as count from "${table}" where ${predicate}`,
      );
      return Number(rows[0]?.count ?? '0');
    },

    close: () => handle.close(),
  };
}
