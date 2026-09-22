/**
 * `etl verify` — the question "did the migration work?" answered by looking at
 * both databases, not by trusting the run that just finished.
 *
 * It runs after `run`, against the same pair of databases, and is the check an
 * operator reads before switching traffic. Every check names what it compared
 * so a failure is actionable; nothing here prints a config value.
 *
 * The seven checks:
 *
 *  1. **row counts** — a declared expectation per group, written as a *source
 *     filter → target table* pair. `exact` where the mapper's filter is simple
 *     and documented (a deleted admin is dropped, a 会员券 is dropped); `atMost`
 *     where it drops rows for reasons only its own report can explain, so that
 *     this file does not quietly become a second copy of the mapper.
 *  2. **money sums** — coupon face values and SKU prices add up to the same
 *     total on both sides, in integer arithmetic (`lib/money.ts`). A mapping
 *     that loses a row usually keeps the count and changes the total, or the
 *     other way round; checking both catches either.
 *  3. **DIY pages as parsed JSON** — CR-1-g1: `jsonb` reorders the keys inside
 *     a node, so byte comparison is meaningless and *document* comparison is
 *     the real invariant. The column is read as text (the driver-wide parser in
 *     `@shop/db`) and parsed here exactly once.
 *  4. **attachments** — every row's file is under the uploads root and its
 *     bytes hash to the stored `sha256`. This is the check that turns "the
 *     rsync said it copied" into "the shop can serve every image".
 *  5. **foreign keys** — every FK constraint is validated and has no orphan.
 *     PostgreSQL enforces these on insert, so a failure here means a constraint
 *     the schema forgot rather than a row the ETL got wrong — which is exactly
 *     the kind of gap worth finding before the cutover and not after.
 *  6. **sequences** — `nextval` is past `max(id)` for every migrated table.
 *     Skip it and the first product an operator creates collides with #1.
 *  7. **not migrated** — the order, cart, payment and refund families are
 *     empty, and no migrated coupon points at an order.
 */

import { stat } from 'node:fs/promises';

import { GROUPS } from './groups';
import { digestFile } from './lib/digest';
import { sumDecimalStrings } from './lib/money';
import { findNotMigratedOffenders } from './lib/not-migrated';
import { localFilePath } from './lib/storage-keys';
import type { Source } from './source';
import type { Target } from './target';

export interface Check {
  group: string;
  name: string;
  ok: boolean;
  detail: string;
}

export interface VerifyResult {
  checks: Check[];
  pending: { group: string; owner: string }[];
  ok: boolean;
}

export interface VerifyOptions {
  source: Source;
  target: Target;
  uploadsRoot?: string | null;
  /** Hash every attachment rather than a sample. Slow on a real uploads tree. */
  fullDigest?: boolean;
  log?: (line: string) => void;
}

/** A declared expectation: this source filter should produce this many target rows. */
interface CountExpectation {
  group: string;
  sourceTable: string;
  sourceWhere?: string;
  targetTable: string;
  /**
   * Counts only part of the target table — for a table several sources feed.
   * A constant in this file, never interpolated, and printed with the check.
   */
  targetWhere?: string;
  mode: 'exact' | 'atMost';
  /** Why `atMost` rather than `exact`, so the looseness is a decision. */
  note?: string;
}

const COUNTS: readonly CountExpectation[] = [
  {
    group: 'system',
    sourceTable: 'eb_system_admin',
    sourceWhere: 'is_del = 0',
    targetTable: 'admins',
    mode: 'exact',
  },
  { group: 'system', sourceTable: 'eb_system_role', targetTable: 'roles', mode: 'exact' },
  {
    group: 'storage',
    sourceTable: 'eb_system_attachment_category',
    targetTable: 'attachment_categories',
    mode: 'atMost',
    note: '父子成环的分类会被丢弃并计数（见 storage 报告 categoriesDroppedCycle）',
  },
  {
    group: 'storage',
    sourceTable: 'eb_system_attachment',
    targetTable: 'attachments',
    mode: 'atMost',
    note: '没有路径、路径重复、或本地文件缺失（算不出 sha256）的行会被丢弃并计数',
  },
  {
    group: 'catalog',
    sourceTable: 'eb_store_category',
    targetTable: 'product_categories',
    mode: 'exact',
  },
  {
    group: 'catalog',
    sourceTable: 'eb_store_product',
    targetTable: 'products',
    mode: 'exact',
    note: '软删除的商品也要迁移，否则订单明细会悬空',
  },
  {
    group: 'coupon',
    sourceTable: 'eb_store_coupon_issue',
    sourceWhere: 'is_del = 0 and receive_type <> 4',
    targetTable: 'coupon_templates',
    mode: 'exact',
    note: '会员券（receive_type = 4）没有新的领取方式，按 COUPON-001 丢弃',
  },
  {
    group: 'coupon',
    sourceTable: 'eb_store_coupon_user',
    targetTable: 'user_coupons',
    mode: 'atMost',
    note: '模板或账号已不存在的券会被丢弃并计数',
  },
  {
    group: 'diy',
    sourceTable: 'eb_diy',
    targetTable: 'diy_pages',
    mode: 'atMost',
    note: 'template_name 行是设置不是页面，value 不是 JSON 的行也不是页面',
  },
  {
    // 分类页 / 个人中心 版式：旧库把它们放在 eb_diy 里，新库是 diy 配置组的
    // 两个字段，由 config group 搬运（见 config.ts）。放在这里计数，是因为
    // "运营迁完还得自己重挑一次版式" 正是这条路径存在之前的状况。
    group: 'config',
    sourceTable: 'eb_diy',
    sourceWhere: "template_name in ('category', 'member')",
    targetTable: 'config_values',
    targetWhere: `"group" = 'diy'`,
    mode: 'atMost',
    note: 'value 不是数字的行说明不了任何事，按"没设过"处理，留给 schema 的默认值',
  },
];

export async function verify(options: VerifyOptions): Promise<VerifyResult> {
  const { source, target } = options;
  const log = options.log ?? (() => undefined);
  const checks: Check[] = [];
  const add = (check: Check): void => {
    checks.push(check);
    log(`  ${check.ok ? 'ok  ' : 'FAIL'} ${check.group}/${check.name}: ${check.detail}`);
  };

  const pendingGroups = new Set(GROUPS.filter((group) => group.pending).map((g) => g.name));

  // --- 1. row counts --------------------------------------------------------
  for (const expectation of COUNTS) {
    if (pendingGroups.has(expectation.group)) continue;
    const expected = await source.count(expectation.sourceTable, expectation.sourceWhere);
    const actual =
      expectation.targetWhere === undefined
        ? await target.countRows(expectation.targetTable)
        : await target.countWhere(expectation.targetTable, expectation.targetWhere);
    const ok = expectation.mode === 'exact' ? actual === expected : actual <= expected;
    const where = expectation.sourceWhere === undefined ? '' : ` where ${expectation.sourceWhere}`;
    const targetWhere =
      expectation.targetWhere === undefined ? '' : ` where ${expectation.targetWhere}`;
    add({
      group: expectation.group,
      // A table two expectations look at needs two distinguishable names, or
      // the second check silently reads as a restatement of the first.
      name: `rows:${expectation.targetTable}${targetWhere}`,
      ok,
      detail:
        `${expectation.sourceTable}${where} = ${String(expected)} → ` +
        `${expectation.targetTable}${targetWhere} = ${String(actual)} (${expectation.mode})` +
        (expectation.note === undefined ? '' : `；${expectation.note}`),
    });
  }

  // --- 2. money sums --------------------------------------------------------
  if (!pendingGroups.has('coupon')) {
    await compareMoney(add, {
      group: 'coupon',
      name: 'money:coupon_templates.discount_amount',
      source,
      target,
      sourceTable: 'eb_store_coupon_issue',
      sourceWhere: 'is_del = 0 and receive_type <> 4',
      sourceColumn: 'coupon_price',
      targetTable: 'coupon_templates',
      targetColumn: 'discount_amount',
    });
  }
  if (!pendingGroups.has('catalog')) {
    await compareMoney(add, {
      group: 'catalog',
      name: 'money:product_skus.price',
      source,
      target,
      // `type = 0` is the ordinary SKU; the other values belong to the retired
      // activities (秒杀 / 砍价 / 拼团) and are not migrated.
      sourceTable: 'eb_store_product_attr_value',
      sourceWhere: 'type = 0',
      sourceColumn: 'price',
      targetTable: 'product_skus',
      targetColumn: 'price',
    });
    await compareMoney(add, {
      group: 'catalog',
      name: 'money:products.price',
      source,
      target,
      sourceTable: 'eb_store_product',
      sourceColumn: 'price',
      targetTable: 'products',
      targetColumn: 'price',
    });
  }

  // --- 3. DIY pages, compared as parsed JSON (CR-1-g1) ----------------------
  if (!pendingGroups.has('diy')) {
    add(await verifyDiy(source, target));
  }

  // --- 4. attachments -------------------------------------------------------
  if (!pendingGroups.has('storage')) {
    add(await verifyAttachments(target, options.uploadsRoot ?? null, options.fullDigest === true));
  }

  // --- 5. foreign keys ------------------------------------------------------
  for (const check of await verifyForeignKeys(target)) add(check);

  // --- 6. sequences ---------------------------------------------------------
  add(await verifySequences(target));

  // --- 7. what must not have been migrated ---------------------------------
  const offenders = await findNotMigratedOffenders(target);
  add({
    group: 'all',
    name: 'not-migrated',
    ok: offenders.length === 0,
    detail:
      offenders.length === 0
        ? '订单、购物车、支付、退款相关的表都是空的，已迁移的券也没有指向订单'
        : offenders.map((o) => `${o.table}=${String(o.rows)}（${o.reason}）`).join('; '),
  });

  return {
    checks,
    pending: GROUPS.filter((group) => group.pending).map((group) => ({
      group: group.name,
      owner: group.owner,
    })),
    ok: checks.every((check) => check.ok),
  };
}

// ---------------------------------------------------------------------------

/**
 * The same money column added up on both sides, in integer arithmetic.
 *
 * A mapping that loses rows usually keeps one of count and total unchanged and
 * moves the other, so checking both catches either mistake. Both sides are read
 * as **strings** — `decimal` from mysql2 and `::text` from PostgreSQL — because
 * a float sum of 100k prices is not the same number twice.
 */
async function compareMoney(
  add: (check: Check) => void,
  input: {
    group: string;
    name: string;
    source: Source;
    target: Target;
    sourceTable: string;
    sourceWhere?: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
  },
): Promise<void> {
  const sourceRows = await input.source.rows<Record<string, string | null>>(
    input.sourceTable,
    input.sourceWhere,
  );
  const targetRows = await input.target.query<{ amount: string | null }>(
    `select "${input.targetColumn}"::text as amount from "${input.targetTable}"`,
  );
  const expected = sumDecimalStrings(
    sourceRows.map((row) => row[input.sourceColumn] ?? '0').map(String),
  );
  const actual = sumDecimalStrings(targetRows.map((row) => row.amount ?? '0'));
  add({
    group: input.group,
    name: input.name,
    ok: expected === actual,
    detail:
      `${input.sourceTable}.${input.sourceColumn} 合计 ${expected} → ` +
      `${input.targetTable}.${input.targetColumn} 合计 ${actual}`,
  });
}

async function verifyDiy(source: Source, target: Target): Promise<Check> {
  interface LegacyDiyRow {
    id: number;
    name: string;
    value: string | null;
  }
  const legacy = await source.rows<LegacyDiyRow>('eb_diy');
  // `content` is jsonb; `@shop/db` makes the driver hand it over as TEXT, so
  // it is parsed here exactly once (CR-6-c) and compared as a document, never
  // as text — `jsonb` reorders the keys inside a node (CR-1-g1).
  const migrated = await target.query<{ id: string; content: string }>(
    'select id::text as id, content::text as content from diy_pages',
  );
  const byId = new Map(migrated.map((row) => [Number(row.id), row.content]));

  const mismatches: string[] = [];
  let compared = 0;
  for (const row of legacy) {
    const stored = byId.get(row.id);
    if (stored === undefined) continue; // dropped on purpose; the count check covers it
    let expected: unknown;
    try {
      expected = JSON.parse(row.value ?? 'null');
    } catch {
      continue;
    }
    compared += 1;
    if (!deepEqual(expected, JSON.parse(stored))) mismatches.push(`#${String(row.id)} ${row.name}`);
  }
  return {
    group: 'diy',
    name: 'diy:content',
    ok: mismatches.length === 0,
    detail:
      mismatches.length === 0
        ? `${String(compared)} 个页面的 content 解析为 JSON 后与旧库完全一致（CR-1-g1：比文档不比字节）`
        : `与旧库不一致的页面：${mismatches.join(', ')}`,
  };
}

async function verifyAttachments(
  target: Target,
  uploadsRoot: string | null,
  full: boolean,
): Promise<Check> {
  const rows = await target.query<{
    id: string;
    storage_key: string;
    sha256: string;
    driver: string;
  }>(
    `select id::text as id, storage_key, sha256, driver from attachments
      where driver = 'local' order by id`,
  );
  if (rows.length === 0) {
    return {
      group: 'storage',
      name: 'storage:files',
      ok: true,
      detail: '没有本地驱动的附件需要核对',
    };
  }
  if (uploadsRoot === null) {
    return {
      group: 'storage',
      name: 'storage:files',
      ok: false,
      detail: `有 ${String(rows.length)} 个本地附件，但没有给 --uploads-root，无法证明文件真的到位了`,
    };
  }
  // Every row's file must exist — that is the check that turns "rsync said it
  // copied" into "the shop can serve every image", and it is cheap. Hashing is
  // not: an uploads tree with videos in it takes minutes, which is a poor use
  // of a cutover window, so by default one row in fifty is hashed and
  // `--full-digest` is the belt-and-braces run before the real switch.
  const every = Math.max(1, Math.ceil(rows.length / 50));
  const missing: string[] = [];
  const wrong: string[] = [];
  let hashed = 0;

  for (const [index, row] of rows.entries()) {
    const file = localFilePath(uploadsRoot, row.storage_key);
    if (file === null) {
      // A key that will not resolve to a path under the uploads root at all:
      // traversal, a NUL, or empty. Nothing can serve it.
      missing.push(row.storage_key);
      continue;
    }
    if (!(full || index % every === 0)) {
      if (!(await fileExists(file))) missing.push(row.storage_key);
      continue;
    }
    const digest = await digestFile(file);
    hashed += 1;
    if (digest === null) missing.push(row.storage_key);
    else if (digest !== row.sha256) wrong.push(row.storage_key);
  }

  const ok = missing.length === 0 && wrong.length === 0;
  return {
    group: 'storage',
    name: 'storage:files',
    ok,
    detail: ok
      ? `${String(rows.length)} 个本地附件的文件都在，其中 ${String(hashed)} 个逐字节校验了 sha256` +
        (full ? '' : '（切换前请用 --full-digest 全量校验一次）')
      : `缺失 ${String(missing.length)} 个（${missing.slice(0, 5).join(', ')}）；` +
        `摘要不符 ${String(wrong.length)} 个（${wrong.slice(0, 5).join(', ')}）`,
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function verifyForeignKeys(target: Target): Promise<Check[]> {
  const constraints = await target.query<{
    name: string;
    child: string;
    parent: string;
    child_columns: string[];
    parent_columns: string[];
    validated: boolean;
  }>(`
    select c.conname as name,
           child.relname as child,
           parent.relname as parent,
           array_agg(child_attr.attname order by u.ord) as child_columns,
           array_agg(parent_attr.attname order by u.ord) as parent_columns,
           c.convalidated as validated
      from pg_constraint c
      join pg_class child on child.oid = c.conrelid
      join pg_class parent on parent.oid = c.confrelid
      join lateral unnest(c.conkey, c.confkey) with ordinality as u(child_att, parent_att, ord)
        on true
      join pg_attribute child_attr
        on child_attr.attrelid = c.conrelid and child_attr.attnum = u.child_att
      join pg_attribute parent_attr
        on parent_attr.attrelid = c.confrelid and parent_attr.attnum = u.parent_att
     where c.contype = 'f'
       and child.relnamespace = 'public'::regnamespace
     group by c.conname, child.relname, parent.relname, c.convalidated
     order by child.relname, c.conname
  `);

  const unvalidated = constraints.filter((row) => !row.validated);
  const checks: Check[] = [
    {
      group: 'all',
      name: 'fk:validated',
      ok: unvalidated.length === 0,
      detail:
        unvalidated.length === 0
          ? `${String(constraints.length)} 个外键约束全部处于 VALIDATED 状态`
          : `未校验的外键：${unvalidated.map((row) => row.name).join(', ')}`,
    },
  ];

  // PostgreSQL enforces these on insert, so an orphan means a constraint the
  // schema forgot rather than a row the ETL got wrong. Cheap, and exactly the
  // gap worth finding before a cutover.
  const orphaned: string[] = [];
  for (const constraint of constraints) {
    const childColumn = constraint.child_columns[0];
    const parentColumn = constraint.parent_columns[0];
    if (constraint.child_columns.length !== 1 || !childColumn || !parentColumn) continue;
    const rows = await target.query<{ count: string }>(
      `select count(*)::text as count
         from "${constraint.child}" child
        where child."${childColumn}" is not null
          and not exists (
            select 1 from "${constraint.parent}" parent
             where parent."${parentColumn}" = child."${childColumn}")`,
    );
    if (Number(rows[0]?.count ?? '0') > 0) {
      orphaned.push(
        `${constraint.child}.${childColumn} → ${constraint.parent} (${rows[0]?.count ?? '?'})`,
      );
    }
  }
  checks.push({
    group: 'all',
    name: 'fk:orphans',
    ok: orphaned.length === 0,
    detail: orphaned.length === 0 ? '没有任何悬空外键' : orphaned.join('; '),
  });
  return checks;
}

async function verifySequences(target: Target): Promise<Check> {
  // `pg_get_serial_sequence` *raises* on a table with no such column rather
  // than returning null, and PostgreSQL is free to evaluate it before the join
  // that would have excluded that table — which it does, on `role_permissions`
  // and every other composite-key join table. `materialized` forces the filter
  // to happen first, so the function only ever sees a table that has an `id`.
  const rows = await target.query<{ table_name: string; sequence: string }>(`
    with with_id as materialized (
      select c.relname
        from pg_class c
        join pg_attribute a
          on a.attrelid = c.oid and a.attname = 'id' and a.attnum > 0 and not a.attisdropped
       where c.relkind = 'r' and c.relnamespace = 'public'::regnamespace
    )
    select relname as table_name, pg_get_serial_sequence(relname, 'id') as sequence
      from with_id
     where pg_get_serial_sequence(relname, 'id') is not null
     order by relname
  `);
  const behind: string[] = [];
  let checked = 0;
  for (const row of rows) {
    const [result] = await target.query<{ max_id: string | null; next: string }>(
      `select (select max(id)::text from "${row.table_name}") as max_id,
              (select last_value::text from ${row.sequence}) as next`,
    );
    if (!result || result.max_id === null) continue;
    checked += 1;
    if (Number(result.next) < Number(result.max_id)) {
      behind.push(`${row.table_name}: last_value=${result.next} < max(id)=${result.max_id}`);
    }
  }
  return {
    group: 'all',
    name: 'sequences',
    ok: behind.length === 0,
    detail:
      behind.length === 0
        ? `${String(checked)} 张有数据的表，序列都在 max(id) 之后`
        : behind.join('; '),
  };
}

/** Structural equality for parsed JSON. Key order is irrelevant by design. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    if (leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    return leftKeys.every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}

export { deepEqual };
