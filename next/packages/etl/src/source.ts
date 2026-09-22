/**
 * The MySQL side: read-only, and pinned.
 *
 * Three settings decide whether the numbers that come out are the numbers that
 * went in:
 *
 * - **`timezone: '+08:00'`** — a legacy `DATETIME` has no offset, and `mysql2`
 *   resolves it against the *connection's* zone. The old PHP ran as
 *   `Asia/Shanghai`; a runner on a UTC container would shift every such value
 *   by eight hours, silently. Unix-second columns are unaffected, which is most
 *   of them, which is why this is easy to miss.
 * - **`decimalNumbers: false`** — the default, restated because it matters:
 *   `DECIMAL` arrives as a string and stays one (`lib/money.ts`).
 * - **`supportBigNumbers` + `bigNumberStrings`** — a `bigint` id must not go
 *   through a float.
 *
 * The session is `READ ONLY` and `REPEATABLE READ`: the whole migration reads
 * one consistent snapshot even though it runs group by group, and a mistake in
 * this package cannot write to the old shop, which is still serving traffic
 * during the rehearsal.
 *
 * The URL is parsed here and handed to `mysql2` as **discrete fields** rather
 * than as its `uri` option. That is not a style preference: an error thrown
 * during connect propagates as a `cause` through every log and every ticket,
 * and a driver given a URI is liable to quote it back. Given a host, a user and
 * a password separately, there is no string for it to quote — `ECONNREFUSED
 * 10.0.0.4:3306` and `ER_ACCESS_DENIED_ERROR` say everything an operator needs
 * and nothing a reader should not see.
 */

import mysql from 'mysql2/promise';

import { redactUrl } from './lib/secrets';

export interface SourceTableInfo {
  table: string;
  exists: boolean;
  rows: number;
}

export interface Source {
  /** The connection string with its credentials removed. Safe to print. */
  readonly label: string;
  rows<T = Record<string, unknown>>(table: string, where?: string): Promise<T[]>;
  count(table: string, where?: string): Promise<number>;
  tableExists(table: string): Promise<boolean>;
  describe(tables: readonly string[]): Promise<SourceTableInfo[]>;
  close(): Promise<void>;
}

export class MissingLegacyTableError extends Error {
  constructor(table: string) {
    super(
      `旧库里没有表 ${table}。这不是"这张表是空的"，而是"这份导出不完整"：` +
        `继续迁移会把整张表的数据静默丢掉。请用完整导出重跑，或把这张表标记为 optional。`,
    );
    this.name = 'MissingLegacyTableError';
  }
}

/** `mysql://user:pw@host:3306/db` → discrete connection fields. */
export function parseMysqlUrl(url: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      'LEGACY_MYSQL_URL 不是一个合法的 URL。期望形如 mysql://user:password@host:3306/dbname' +
        '（这里不回显你传进来的值）。',
    );
  }
  const database = parsed.pathname.replace(/^\//, '');
  if (database === '') {
    throw new Error('LEGACY_MYSQL_URL 里没有数据库名：路径部分应该是 /dbname。');
  }
  return {
    host: parsed.hostname,
    port: parsed.port === '' ? 3306 : Number(parsed.port),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
}

export async function openSource(url: string): Promise<Source> {
  const label = redactUrl(url);
  const connectionFields = parseMysqlUrl(url);
  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection({
      ...connectionFields,
      timezone: '+08:00',
      decimalNumbers: false,
      supportBigNumbers: true,
      bigNumberStrings: true,
      // The legacy dump is utf8mb4; anything else would mangle every 商品名称.
      charset: 'utf8mb4_general_ci',
      multipleStatements: false,
    });
  } catch (error) {
    // Safe to chain: the driver was given discrete fields, so its message is
    // `ECONNREFUSED 10.0.0.4:3306` or `ER_ACCESS_DENIED_ERROR` — a host and a
    // username, never the password and never the whole URI.
    const code =
      error !== null && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : error instanceof Error
          ? error.name
          : 'unknown error';
    throw new Error(`无法连接旧库 ${label}：${code}`, { cause: error });
  }

  await connection.query('set session transaction isolation level repeatable read');
  await connection.query('start transaction read only');

  const existing = new Map<string, boolean>();

  const count = async (table: string, where?: string): Promise<number> => {
    if (!(await tableExists(table))) return 0;
    const clause = where === undefined ? '' : ` where ${where}`;
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `select count(*) as n from \`${table}\`${clause}`,
    );
    return Number(rows[0]?.['n'] ?? 0);
  };

  const tableExists = async (table: string): Promise<boolean> => {
    const cached = existing.get(table);
    if (cached !== undefined) return cached;
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `select count(*) as n from information_schema.tables
        where table_schema = database() and table_name = ?`,
      [table],
    );
    const exists = Number(rows[0]?.['n'] ?? 0) > 0;
    existing.set(table, exists);
    return exists;
  };

  return {
    label,
    tableExists,
    count,

    async rows<T>(table: string, where?: string): Promise<T[]> {
      if (!(await tableExists(table))) throw new MissingLegacyTableError(table);
      const clause = where === undefined ? '' : ` where ${where}`;
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `select * from \`${table}\`${clause}`,
      );
      return rows as T[];
    },

    async describe(tables) {
      const info: SourceTableInfo[] = [];
      for (const table of tables) {
        const exists = await tableExists(table);
        info.push({ table, exists, rows: exists ? await count(table) : 0 });
      }
      return info;
    },

    async close() {
      // A read-only transaction has nothing to commit; end it explicitly so the
      // snapshot is released before the connection goes.
      await connection.query('rollback').catch(() => undefined);
      await connection.end();
    },
  };
}
