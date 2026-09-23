/**
 * `plan` and `run`.
 *
 * **One run = one PostgreSQL transaction.** Inside it: empty every target
 * table of every selected group (children first, across groups), then load
 * the groups in order — insert the mapper's rows, reset the identity
 * sequences — and finally assert that nothing order-shaped was written. If
 * anything throws, the transaction rolls back and the target database is
 * **exactly as it was**, which is the property that makes a failed migration
 * recoverable instead of a restore-from-backup.
 *
 * It used to be one transaction *per group*. That stopped working the moment
 * a later group held a restricting foreign key into an earlier one:
 * `products.shipping_template_id` restricts `shipping_templates`, and
 * `groupbuy_activities` / `presale_activities` restrict `products` and
 * `product_skus`. On a second run, `shipping` would try to empty its templates
 * while run #1's products still pointed at them, and fail. Emptying everything
 * first, in reverse load order, is the only order in which every `DELETE` is
 * legal — and doing it in the same transaction as the load is what keeps
 * "a failed run changes nothing" true. `--group` still empties exactly that
 * group's tables, and a restricting reference from another group's rows then
 * fails the `DELETE` with the constraint's name, which is the right answer.
 *
 * Idempotency comes from the same place. Running twice empties and reloads the
 * same tables from the same source snapshot, so the second run produces the
 * same database as the first. `run` twice followed by a dump comparison is the
 * integration test; there is no "resume" mode, because a resumable ETL has
 * partial states and partial states are where the surprises live.
 *
 * Ids are carried over unchanged (`pk()` is `generatedByDefaultAsIdentity` for
 * exactly this reason), so a support ticket quoting a legacy product id still
 * works after the cutover. The sequences are then set past `max(id)` — skip
 * that and the first product an operator creates collides with product #1.
 */

import { GROUPS, groupByName } from './groups';
import { assertNotMigrated, type RowCounter } from './lib/not-migrated';
import { rowsByTable, type ErasedGroup, type GroupContext, type TargetRow } from './mapper';
import type { Source } from './source';
import { snakeCase, type Target, type TargetTx } from './target';

export interface RunOptions {
  source: Source;
  target: Target;
  /** Only this group (plus nothing else). Absent means every ready group. */
  group?: string;
  /**
   * The group registry. Defaults to `GROUPS`; a test passes its own to prove
   * the `--require-complete` gate against a pending group, now that the real
   * registry has none.
   */
  groups?: readonly ErasedGroup[];
  /** Map and report, but roll back instead of committing. */
  dryRun?: boolean;
  /** Fail if any group is still pending. The cutover gate. */
  requireComplete?: boolean;
  /** Where the legacy uploads tree is mounted, for attachment digests. */
  uploadsRoot?: string | null;
  /** Let a config value the schema refuses fall back to its default. */
  allowInvalidConfig?: boolean;
  /** The instant this migration is deemed to have happened. */
  migratedAt?: Date;
  /** Progress lines. Defaults to silence; the CLI passes its printer. */
  log?: (line: string) => void;
}

export interface TableResult {
  table: string;
  /** Rows the mapper produced. */
  mapped: number;
  /** Rows actually inserted — lower when `finalise` dropped some. */
  inserted: number;
  /** The sequence's new value, or null for a table without one. */
  sequence: number | null;
}

export interface GroupResult {
  group: string;
  title: string;
  owner: string;
  /**
   * `rolled-back`: the group loaded, then a later group failed and the run's
   * one transaction took it back out. `skipped`: a dry run.
   */
  status: 'loaded' | 'pending' | 'skipped' | 'failed' | 'rolled-back';
  /** The mapper's own report, printed verbatim. Never holds a config value. */
  report?: unknown;
  tables: TableResult[];
  sourceRows: { table: string; rows: number }[];
  notes: string[];
  durationMs: number;
  error?: string;
}

export interface RunResult {
  migratedAt: Date;
  dryRun: boolean;
  groups: GroupResult[];
  /** Groups whose mapper has not landed, with the stream that owes it. */
  pending: { group: string; owner: string; title: string }[];
  durationMs: number;
}

export class PendingGroupsError extends Error {
  constructor(pending: readonly { group: string; owner: string }[]) {
    super(
      `还有 ${String(pending.length)} 个 group 的 mapper 没有落地：\n` +
        pending.map((p) => `  ${p.group}（owner: ${p.owner}）`).join('\n') +
        `\n--require-complete 是切换正式环境用的闸门：这些域的数据一行都不会被迁移。`,
    );
    this.name = 'PendingGroupsError';
  }
}

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

export interface PlannedGroup {
  group: string;
  title: string;
  owner: string;
  pending: boolean;
  sources: { table: string; exists: boolean; rows: number; where?: string; optional: boolean }[];
  targets: string[];
  softDependencies: { group: string; table: string; pending: boolean }[];
}

/** Read-only: counts the source rows and lists the target tables. Writes nothing. */
export async function plan(options: { source: Source; group?: string }): Promise<PlannedGroup[]> {
  const groups = selectGroups(options.group);
  const pending = new Set(GROUPS.filter((g) => g.pending).map((g) => g.name));
  const planned: PlannedGroup[] = [];

  for (const group of groups) {
    const sources: PlannedGroup['sources'] = [];
    for (const source of group.sources) {
      const exists = await options.source.tableExists(source.table);
      sources.push({
        table: source.table,
        exists,
        rows: exists ? await options.source.count(source.table, source.where) : 0,
        ...(source.where === undefined ? {} : { where: source.where }),
        optional: source.optional === true,
      });
    }
    planned.push({
      group: group.name,
      title: group.title,
      owner: group.owner,
      pending: group.pending,
      sources,
      targets: group.targets.map((target) => target.table),
      softDependencies: group.softDependencies.map((dependency) => ({
        group: dependency.group,
        table: dependency.table,
        pending: pending.has(dependency.group),
      })),
    });
  }
  return planned;
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

function selectGroups(name?: string, registry: readonly ErasedGroup[] = GROUPS): ErasedGroup[] {
  if (name === undefined) return [...registry];
  const group =
    registry === GROUPS ? groupByName(name) : registry.find((entry) => entry.name === name);
  if (!group) {
    throw new Error(`没有名为 "${name}" 的 group。可用：${registry.map((g) => g.name).join(', ')}`);
  }
  return [group];
}

export async function run(options: RunOptions): Promise<RunResult> {
  const startedAt = Date.now();
  const log = options.log ?? (() => undefined);
  const migratedAt = options.migratedAt ?? new Date();
  const registry = options.groups ?? GROUPS;
  const groups = selectGroups(options.group, registry);
  const pending = registry.filter((group) => group.pending);

  if (options.requireComplete === true && pending.length > 0) {
    throw new PendingGroupsError(pending.map((g) => ({ group: g.name, owner: g.owner })));
  }

  // Before anything is read or written: is the reference seed in place? A dry
  // run checks it too — a rehearsal that skips the check would report success
  // against a database the real run cannot load into.
  await checkReferenceData(options.target, groups);

  /** `${group}:${table}` → the ids that survived. Fed to soft dependencies. */
  const keptIds = new Map<string, ReadonlySet<number>>();
  const pendingNames = new Set(pending.map((group) => group.name));
  const results: GroupResult[] = [];

  try {
    await options.target.transaction(async (tx: TargetTx) => {
      if (options.group === undefined) {
        // Every group's own tables, children first *across* groups: the only
        // order in which a restricting reference from a later group (a group
        // buy's product, a product's freight template) never blocks a DELETE.
        // Seeded tables that are merged rather than reloaded are left alone.
        const tables = groups
          .filter((group) => !group.pending)
          .flatMap((group) => clearedTargets(group));
        await tx.clear(tables);
      }

      for (const group of groups) {
        if (group.pending) {
          log(
            `  ${group.name}: pending —《${group.title}》的 mapper 还没写（owner: ${group.owner}）`,
          );
          results.push({
            group: group.name,
            title: group.title,
            owner: group.owner,
            status: 'pending',
            tables: [],
            sourceRows: [],
            notes: [`mapper 未落地，本组一行数据都没有迁移；owner: ${group.owner}`],
            durationMs: 0,
          });
          continue;
        }
        results.push(
          await loadGroup(group, tx, {
            options,
            registry,
            migratedAt,
            keptIds,
            pendingNames,
            results,
            log,
          }),
        );
      }

      if (options.dryRun === true) {
        // Everything above really ran — the inserts, the constraints, the
        // sequences — and is then thrown away. A dry run that skips the
        // inserts proves nothing about whether they would have worked.
        throw new DryRun();
      }
      // Nothing above may have written an order, a cart, a payment or a
      // refund. Asserted inside the transaction, so a violation takes the
      // whole run back out rather than leaving it committed and flagged.
      await assertNotMigrated(txCounter(tx));
    });
  } catch (error) {
    if (error instanceof DryRun) {
      for (const result of results) {
        if (result.status !== 'loaded') continue;
        result.status = 'skipped';
        result.notes.push('试运行：已映射并试插入，事务已回滚');
      }
      log('  试运行通过（整次迁移的事务已回滚）');
    } else {
      for (const result of results) {
        if (result.status === 'loaded') result.status = 'rolled-back';
      }
      throw error;
    }
  }

  return {
    migratedAt,
    dryRun: options.dryRun === true,
    groups: results,
    pending: pending.map((group) => ({
      group: group.name,
      owner: group.owner,
      title: group.title,
    })),
    durationMs: Date.now() - startedAt,
  };
}

/** A group's targets that `run` empties before loading — all but the merged ones. */
function clearedTargets(group: ErasedGroup): string[] {
  return group.targets.filter((target) => target.upsert === undefined).map((t) => t.table);
}

interface LoadState {
  options: RunOptions;
  registry: readonly ErasedGroup[];
  migratedAt: Date;
  keptIds: Map<string, ReadonlySet<number>>;
  pendingNames: ReadonlySet<string>;
  /** Earlier groups' results, carried by a `GroupFailedError`. */
  results: GroupResult[];
  log: (line: string) => void;
}

/** One group: read, map, preflight, load — inside the run's transaction. */
async function loadGroup(group: ErasedGroup, tx: TargetTx, state: LoadState): Promise<GroupResult> {
  const { options, migratedAt, keptIds, log } = state;
  const groupStartedAt = Date.now();
  const notes: string[] = [];
  const context: GroupContext = {
    migratedAt,
    keptIds,
    pending: state.pendingNames,
    uploadsRoot: options.uploadsRoot ?? null,
    allowInvalidConfig: options.allowInvalidConfig === true,
    idsOf: (table, column) => survivingIds(tx, table, column),
    selectTarget: async <T extends Record<string, unknown>>(
      table: string,
      columns: readonly string[],
    ) =>
      tx.query<T>(
        `select ${columns.map((column) => `"${column}"`).join(', ')} from "${table}" order by 1`,
      ),
    countSource: async (table, where) =>
      (await options.source.tableExists(table)) ? options.source.count(table, where) : 0,
    notes,
  };

  try {
    // --- read the source -----------------------------------------------------
    const input: Record<string, unknown> = {};
    const sourceRows: { table: string; rows: number }[] = [];
    for (const source of group.sources) {
      if (source.optional === true && !(await options.source.tableExists(source.table))) {
        notes.push(`旧库没有可选表 ${source.table}，按空表处理`);
        input[source.into] = [];
        sourceRows.push({ table: source.table, rows: 0 });
        continue;
      }
      const rows = await options.source.rows(source.table, source.where);
      input[source.into] = rows;
      sourceRows.push({ table: source.table, rows: rows.length });
    }

    // --- soft dependencies ---------------------------------------------------
    for (const dependency of group.softDependencies) {
      const ids = keptIds.get(`${dependency.group}:${dependency.table}`);
      input[dependency.into] = ids ?? new Set<number>();
      if (ids === undefined) {
        notes.push(
          `${dependency.group} 还没迁移（pending），所以 ${dependency.into} 是空集合：` +
            `指向它的行会被丢弃，数量见下面 mapper 自己的报告`,
        );
      }
    }

    Object.assign(input, await group.extras(context));

    // --- map -------------------------------------------------------------------
    const output = group.map(input);
    const mapped = rowsByTable(group, output);

    // --- preflight: does every field the mapper emits have a column? ---------
    // Before anything is written, so the failure names the mapper, the table
    // and the field instead of arriving as `column "x" of relation "y" does
    // not exist` from four frames deeper.
    const dropped = await checkColumns(options.target, group, mapped, notes);

    // Which of each table's columns are `json`/`jsonb`, asked of the database
    // so the encoding cannot drift from the schema.
    const jsonKeys = new Map<string, string[]>();
    for (const target of group.targets) {
      const columns = await options.target.columnsOf(target.table);
      const jsonColumns = await options.target.jsonColumnsOf(target.table);
      const rows = mapped.get(target.table) ?? [];
      const keys = new Set<string>();
      for (const row of rows) {
        for (const key of Object.keys(row)) if (jsonColumns.has(snakeCase(key))) keys.add(key);
      }
      jsonKeys.set(target.table, [...keys]);
      pinTimestamps(rows, columns, migratedAt);
    }

    // --- load ------------------------------------------------------------------
    // Empty in a full run already; `--group` empties exactly this group here.
    await tx.clear(clearedTargets(group));
    const tables: TableResult[] = [];
    for (const target of group.targets) {
      const rows = mapped.get(target.table) ?? [];
      const finalised = await group.finalise(target.table, rows, context);
      const toInsert = stripColumns(finalised, dropped.get(target.table));
      let inserted: number;
      if (target.upsert !== undefined) {
        notes.push(
          `${target.table} 按 (${target.upsert.conflict.join(', ')}) 合并，不清空：${target.upsert.reason}`,
        );
        inserted = await tx.upsert(
          target.table,
          toInsert,
          target.upsert.conflict,
          jsonKeys.get(target.table) ?? [],
        );
      } else {
        // A table whose rows carry no id of their own gets them from the
        // identity sequence — and the sequence does not go back to where it
        // was when the previous run's rows were deleted. Run the migration
        // twice and the same `wechat_identities` row is id 1, then id 2: the
        // data is identical, the ids are not, which is enough to break "load
        // twice and compare" and, worse, enough to make two rehearsals
        // disagree about a row a support ticket quotes.
        //
        // The table is empty at this point, so `resetSequence` restarts it at
        // 1 (`is_called = false`) and the reload reproduces the first run's
        // ids exactly. Only when *no* row brings an id: restarting underneath
        // a batch that carries explicit ids would hand the sequence a value
        // some other row already occupies. Never for a merged table, which is
        // not empty.
        if (toInsert.length > 0 && toInsert.every((row) => row['id'] === undefined)) {
          await tx.resetSequence(target.table);
        }
        inserted = await tx.insert(target.table, toInsert, jsonKeys.get(target.table) ?? []);
      }
      const sequence = await tx.resetSequence(target.table);
      tables.push({ table: target.table, mapped: rows.length, inserted, sequence });
    }

    // Publish the ids a later group's soft dependency will filter on, read
    // back from the database rather than from the mapper's output: what
    // matters downstream is what the constraints accepted, not what the mapper
    // hoped for. Only the tables somebody actually asks about are read back —
    // catalog has eighteen.
    for (const wanted of wantedIdSets(group.name, state.registry)) {
      keptIds.set(
        `${group.name}:${wanted.table}`,
        await survivingIds(tx, wanted.table, wanted.column),
      );
    }
    log(
      `  ${group.name}: ${tables.reduce((sum, t) => sum + t.inserted, 0).toString()} 行写入 ` +
        `${String(tables.length)} 张表（${String(Date.now() - groupStartedAt)}ms）`,
    );
    return {
      group: group.name,
      title: group.title,
      owner: group.owner,
      status: 'loaded',
      report: output.report,
      tables,
      sourceRows,
      notes,
      durationMs: Date.now() - groupStartedAt,
    };
  } catch (error) {
    state.results.push({
      group: group.name,
      title: group.title,
      owner: group.owner,
      status: 'failed',
      tables: [],
      sourceRows: [],
      notes,
      durationMs: Date.now() - groupStartedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    // The run's one transaction rolls back on the way out, so the target is
    // exactly as it was. Stop: a later group would load against half a
    // migration.
    throw new GroupFailedError(group.name, error, state.results);
  }
}

/** `RowCounter` over the run's transaction, for the not-migrated assertion. */
function txCounter(tx: TargetTx): RowCounter {
  const exists = async (table: string): Promise<boolean> => {
    const [row] = await tx.query<{ present: boolean }>(
      `select to_regclass($1) is not null as present`,
      [table],
    );
    return row?.present === true;
  };
  return {
    async countRows(table) {
      if (!(await exists(table))) return 0;
      const [row] = await tx.query<{ count: string }>(
        `select count(*)::text as count from "${table}"`,
      );
      return Number(row?.count ?? '0');
    },
    async countWhere(table, predicate) {
      if (!(await exists(table))) return 0;
      const [row] = await tx.query<{ count: string }>(
        `select count(*)::text as count from "${table}" where ${predicate}`,
      );
      return Number(row?.count ?? '0');
    },
  };
}

/**
 * The reference seed has not been run, so a lookup table a group points at is
 * empty.
 *
 * Deliberately not "insert what is missing": the seed lives in `packages/db`
 * with its own data files and its own idempotent upserts, and an ETL that
 * quietly half-fills a dictionary gives you two sources of truth for the city
 * list. This one only refuses, and says which command fixes it.
 */
export class MissingReferenceDataError extends Error {
  constructor(missing: readonly { table: string; groups: string[]; reason: string }[]) {
    super(
      `目标库缺少基础数据，迁移无法开始：\n` +
        missing
          .map((m) => `  ${m.table} 是空表——${m.reason}（需要它的 group：${m.groups.join('、')}）`)
          .join('\n') +
        `\n这些表不由迁移产生，而是由 packages/db 的种子数据写入，并且刻意沿用旧库的 id，` +
        `所以旧数据可以继续指向同一个 id。先执行 pnpm --filter @shop/db db:seed，再重跑迁移。`,
    );
    this.name = 'MissingReferenceDataError';
  }
}

/**
 * One `exists` per distinct reference table the selected groups declare.
 *
 * `exists` rather than `count(*)`: a partially seeded dictionary is not
 * something this check can meaningfully judge — the foreign keys do that, row
 * by row — and counting 3,939 cities to learn "not zero" is wasted work.
 */
async function checkReferenceData(target: Target, groups: readonly ErasedGroup[]): Promise<void> {
  const wanted = new Map<string, { table: string; groups: string[]; reason: string }>();
  for (const group of groups) {
    if (group.pending) continue;
    for (const requirement of group.requiresReference) {
      const entry = wanted.get(requirement.table);
      if (entry) entry.groups.push(group.name);
      else {
        wanted.set(requirement.table, {
          table: requirement.table,
          groups: [group.name],
          reason: requirement.reason,
        });
      }
    }
  }

  const missing: { table: string; groups: string[]; reason: string }[] = [];
  for (const entry of wanted.values()) {
    const rows = await target.query<{ present: boolean }>(
      `select exists(select 1 from "${entry.table}") as present`,
    );
    if (rows[0]?.present !== true) missing.push(entry);
  }
  if (missing.length > 0) throw new MissingReferenceDataError(missing);
}

/**
 * A field the mapper emits that its target table has no column for.
 *
 * Loud on purpose. The tempting alternative is to drop the unknown key and
 * carry on, and that is precisely how a migration loses a field: the run goes
 * green, the column is simply absent, and somebody notices months later when a
 * screen is blank. Either the schema gains the column or the mapper stops
 * emitting it — and until one of those happens, `dropColumns` records the
 * decision in the group where a reviewer can see it.
 */
export class UnknownTargetColumnError extends Error {
  constructor(group: string, offenders: readonly { table: string; columns: string[] }[]) {
    super(
      `group "${group}" 的 mapper 产出了目标表里不存在的字段：\n` +
        offenders.map((o) => `  ${o.table}: ${o.columns.join(', ')}`).join('\n') +
        `\n这不是可以忽略的差异——直接跳过这些字段，迁移会"成功"但数据少一块，` +
        `而且没人会发现。请二选一：给表加上列，或者让 mapper 不要再产出它；` +
        `如果确实是有意丢弃，就在 group 的 targets 里写下 dropColumns 和理由。`,
    );
    this.name = 'UnknownTargetColumnError';
  }
}

/**
 * Compares every mapper field against the table's real columns.
 *
 * Returns, per table, the set of declared-dropped columns to strip. Any other
 * unknown field throws.
 */
async function checkColumns(
  target: Target,
  group: ErasedGroup,
  mapped: ReadonlyMap<string, TargetRow[]>,
  notes: string[],
): Promise<Map<string, Set<string>>> {
  const toStrip = new Map<string, Set<string>>();
  const offenders: { table: string; columns: string[] }[] = [];

  for (const spec of group.targets) {
    const rows = mapped.get(spec.table) ?? [];
    if (rows.length === 0) continue;
    const columns = await target.columnsOf(spec.table);
    const declared = new Map(
      (spec.dropColumns ?? []).map((entry) => [snakeCase(entry.column), entry.reason]),
    );
    const unknown = new Set<string>();
    const strip = new Set<string>();

    // Every row, not just the first: a mapper that emits an optional field only
    // for some rows would otherwise slip through whichever row happened to be
    // first, and `insert` derives its column list from the first row too.
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        const column = snakeCase(key);
        if (columns.has(column)) continue;
        if (declared.has(column)) strip.add(key);
        else unknown.add(key);
      }
    }
    if (unknown.size > 0) offenders.push({ table: spec.table, columns: [...unknown].sort() });
    if (strip.size > 0) {
      toStrip.set(spec.table, strip);
      for (const key of [...strip].sort()) {
        notes.push(`${spec.table}.${key} 有意不迁移：${declared.get(snakeCase(key)) ?? ''}`);
      }
    }
  }

  if (offenders.length > 0) throw new UnknownTargetColumnError(group.name, offenders);
  return toStrip;
}

/**
 * Fills `created_at` / `updated_at` the mapper did not set with `migratedAt`.
 *
 * Some legacy tables have no timestamp to carry over —
 * `eb_system_attachment_category` has no `time` column at all — so the mapper
 * rightly omits the field and the column's `default now()` fills it. That is
 * the one thing that makes an otherwise perfectly repeatable migration
 * unrepeatable: run it twice and every such row differs by the milliseconds
 * between the two runs, which is enough to make "load twice and compare" — the
 * only real proof that a rehearsal can be repeated — impossible to state.
 *
 * Pinning them to the run's single instant costs nothing and is more honest
 * besides: these rows were created by the migration, and `migratedAt` is when
 * the migration happened. A value the mapper *did* set is never touched.
 */
function pinTimestamps(
  rows: readonly TargetRow[],
  columns: ReadonlySet<string>,
  migratedAt: Date,
): void {
  const hasCreated = columns.has('created_at');
  const hasUpdated = columns.has('updated_at');
  if (!hasCreated && !hasUpdated) return;
  for (const row of rows) {
    const mutable = row as Record<string, unknown>;
    if (hasCreated && mutable['createdAt'] === undefined) mutable['createdAt'] = migratedAt;
    if (hasUpdated && mutable['updatedAt'] === undefined) mutable['updatedAt'] = migratedAt;
  }
}

function stripColumns(rows: readonly TargetRow[], strip: Set<string> | undefined): TargetRow[] {
  if (strip === undefined || strip.size === 0) return [...rows];
  return rows.map((row) => {
    const copy: TargetRow = {};
    for (const [key, value] of Object.entries(row)) if (!strip.has(key)) copy[key] = value;
    return copy;
  });
}

/** Thrown inside the transaction to force a rollback after a successful load. */
class DryRun extends Error {
  constructor() {
    super('dry run');
    this.name = 'DryRun';
  }
}

export class GroupFailedError extends Error {
  readonly group: string;
  readonly results: readonly GroupResult[];
  constructor(group: string, cause: unknown, results: readonly GroupResult[]) {
    super(
      `group "${group}" 失败，整次迁移的事务已回滚，目标库保持原样：\n  ` +
        (cause instanceof Error ? cause.message : String(cause)),
      { cause },
    );
    this.name = 'GroupFailedError';
    this.group = group;
    this.results = results;
  }
}

/** Which of a group's tables some later group's soft dependency asks about. */
function wantedIdSets(
  groupName: string,
  registry: readonly ErasedGroup[],
): { table: string; column: string }[] {
  const wanted = new Map<string, { table: string; column: string }>();
  for (const other of registry) {
    for (const dependency of other.softDependencies) {
      if (dependency.group !== groupName) continue;
      const column = dependency.column ?? 'id';
      wanted.set(`${dependency.table}.${column}`, { table: dependency.table, column });
    }
  }
  return [...wanted.values()];
}

/**
 * The ids in a table, read inside the run's transaction — the ids a group just
 * loaded (so the next group can filter on them), or a seeded dictionary's.
 */
async function survivingIds(
  tx: TargetTx,
  table: string,
  column = 'id',
): Promise<ReadonlySet<number>> {
  const [exists] = await tx.query<{ present: boolean }>(
    `select to_regclass($1) is not null as present`,
    [table],
  );
  if (exists?.present !== true) return new Set<number>();
  const rows = await tx.query<{ id: string }>(`select "${column}"::text as id from "${table}"`);
  return new Set(rows.map((row) => Number(row.id)));
}

export type { TargetRow };
