/**
 * tinyint → enum, through an explicit table that **throws** on a value it does
 * not know.
 *
 * The legacy schema encodes every state as a small integer whose DDL comment is
 * routinely wrong (`eb_store_order.status`'s comment disagrees with every
 * writer in the codebase — SCHEMA.md §4.4). A `switch` with a `default` that
 * picks something reasonable is how a migration turns a state nobody
 * anticipated into a plausible-looking wrong one. So: one table per column, and
 * an unknown value stops the run with the table, the column and the value.
 *
 * `-1`, `9` and other sentinels that really do mean "nothing" are listed
 * explicitly as `null`, so that "we thought about this one" is visible in the
 * source rather than implied by a missing case.
 */

export class UnknownEnumValueError extends Error {
  readonly table: string;
  readonly column: string;
  readonly value: unknown;

  constructor(table: string, column: string, value: unknown, known: readonly string[]) {
    super(
      `${table}.${column} 出现未知取值 ${JSON.stringify(value)}；` +
        `已知取值：${known.join(', ')}。请先补全映射表再迁移，不要猜。`,
    );
    this.name = 'UnknownEnumValueError';
    this.table = table;
    this.column = column;
    this.value = value;
  }
}

export interface EnumTable<T> {
  /** Maps one legacy value. Throws `UnknownEnumValueError` on anything else. */
  (value: number | string | null | undefined): T;
  /** The legacy values this table accepts, for the plan report. */
  readonly known: readonly string[];
}

/**
 * Builds a mapping function from an explicit table.
 *
 * ```ts
 * const productKind = enumTable('eb_store_product', 'virtual_type', {
 *   0: 'physical', 1: 'virtual_card', 2: 'virtual_coupon', 3: 'virtual_manual',
 * });
 * ```
 *
 * `null` and `undefined` map through the `null` key when it is declared, and
 * throw otherwise — a NULL in a NOT NULL-in-spirit column is a finding, not a
 * default.
 */
export function enumTable<T>(
  table: string,
  column: string,
  mapping: Readonly<Record<string, T>>,
): EnumTable<T> {
  const known = Object.keys(mapping);
  const fn = (value: number | string | null | undefined): T => {
    const key = value === null || value === undefined ? 'null' : String(value);
    if (!Object.hasOwn(mapping, key)) {
      throw new UnknownEnumValueError(table, column, value, known);
    }
    return mapping[key] as T;
  };
  return Object.assign(fn, { known }) as EnumTable<T>;
}

/**
 * A legacy `tinyint(1)` boolean. Only `0`, `1`, `'0'`, `'1'`, `true`, `false`
 * and NULL are accepted; `2` in a boolean column means the column is not a
 * boolean, and the run should stop rather than guess which side of the fence
 * it falls on.
 */
export function legacyBoolean(
  table: string,
  column: string,
  value: number | string | boolean | null | undefined,
): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  const text = String(value);
  if (text === '0') return false;
  if (text === '1') return true;
  throw new UnknownEnumValueError(table, column, value, ['0', '1']);
}
