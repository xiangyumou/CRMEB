/**
 * `lower(account)` collision check — run **before** the load, not during it.
 *
 * MySQL's default collation (`utf8mb4_general_ci`) is case-insensitive, so the
 * legacy `eb_system_admin.account` and `eb_user.account` unique indexes already
 * treated `Admin` and `admin` as the same account. PostgreSQL's `text` is
 * case-**sensitive**, and the new schema adds `lower(account)` unique indexes
 * to keep the old behaviour. Two rows that MySQL could never have held at once
 * therefore cannot collide… except that the legacy uniqueness was only ever
 * enforced on *some* of these columns, and a dump merged from two shops can
 * hold both.
 *
 * Finding that out halfway through an insert gives a constraint violation
 * naming one row. Finding it out first gives the operator every colliding pair
 * with the ids and the accounts, which is what they need in order to decide
 * which one to rename — so this runs as a pre-flight, and the run stops before
 * a single row is written.
 */

export interface AccountRow {
  id: number;
  account: string;
}

export interface AccountCollision {
  /** The lower-cased key the new unique index is built on. */
  key: string;
  rows: AccountRow[];
}

export class AccountCollisionError extends Error {
  readonly collisions: readonly AccountCollision[];

  constructor(label: string, collisions: readonly AccountCollision[]) {
    const detail = collisions
      .map((c) => `  ${c.key}: ${c.rows.map((r) => `#${String(r.id)} ${r.account}`).join(' / ')}`)
      .join('\n');
    super(
      `${label}：忽略大小写后存在重复账号，PostgreSQL 的 lower(account) 唯一索引会拒绝它们。\n` +
        `请先在旧库里改名，再重新迁移：\n${detail}`,
    );
    this.name = 'AccountCollisionError';
    this.collisions = collisions;
  }
}

/**
 * Groups rows by `lower(trim(account))` and returns only the groups with more
 * than one row. An empty or whitespace-only account is reported under the key
 * `''`, because the new index would collapse those too.
 */
export function findAccountCollisions(rows: readonly AccountRow[]): AccountCollision[] {
  const byKey = new Map<string, AccountRow[]>();
  for (const row of rows) {
    const key = row.account.trim().toLowerCase();
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }
  return [...byKey.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({ key, rows: bucket }));
}

/** Throws with every colliding pair, or returns quietly. */
export function assertNoAccountCollisions(label: string, rows: readonly AccountRow[]): void {
  const collisions = findAccountCollisions(rows);
  if (collisions.length > 0) throw new AccountCollisionError(label, collisions);
}
