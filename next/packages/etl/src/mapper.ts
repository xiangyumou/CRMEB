/**
 * The contract every domain mapper already satisfies, written down.
 *
 * This interface was **derived from** the five mappers that had landed when the
 * runner was written (`coupon`, `diy`, `catalog`, `system`, `storage`), not
 * imposed on them. None of them changed. Read them and the shape is the same
 * every time:
 *
 * ```ts
 * export function mapX(input: XMigrationInput): XMigrationOutput
 * interface XMigrationInput  { [source]?: readonly LegacyRow[]; …extras }
 * interface XMigrationOutput { [target]: NewRow[]; report: XMigrationReport }
 * ```
 *
 * A mapper is a **pure function**: legacy rows in, new rows and a report out.
 * It opens nothing, reads no clock and knows no SQL, which is why its unit test
 * can run on literal rows copied out of the dump with no Docker anywhere.
 * Everything a mapper cannot know — the id sets that survived another group,
 * the migration instant, the digest of a file on disk — arrives through its
 * input, computed by the runner.
 *
 * The three facts the runner relies on, and nothing else:
 *
 *  1. it is `(input) => output` — one argument, synchronous, no `this`;
 *  2. every key of `input` is either an array of legacy rows or an extra the
 *     runner computes;
 *  3. `output.report` exists, and every other key of `output` is an array of
 *     rows for one target table.
 *
 * A mapper that does not fit gets a CR against its stream rather than a special
 * case here (`docs/rewrite/cr/`), because the moment the runner starts
 * accommodating shapes, the shape stops being a contract.
 */

/** Anything a mapper counts, names or lists. Plain data — it gets printed. */
export type MapperReport = object;

/** Every mapper's return value: some arrays of rows, plus a report. */
export interface MapperOutput {
  readonly report: MapperReport;
}

/** The function itself. `mapCoupons`, `mapCatalog`, … all satisfy this. */
export type Mapper<Input extends object, Output extends MapperOutput> = (input: Input) => Output;

/** One row on its way into PostgreSQL. Keys are the mapper's camelCase names. */
export type TargetRow = Record<string, unknown>;

// ---------------------------------------------------------------------------
// binding a mapper to the database
// ---------------------------------------------------------------------------

/** One legacy table feeding one key of the mapper's input. */
export interface SourceSpec<Input extends object = object> {
  /** The legacy table, with its `eb_` prefix. */
  readonly table: string;
  /** Which key of the mapper's input its rows go into. */
  readonly into: keyof Input & string;
  /**
   * An optional `WHERE` fragment, for a table the mapper only wants part of.
   * It is a constant in this file — never interpolated from input — and is
   * shown verbatim by `etl plan`.
   */
  readonly where?: string;
  /**
   * A table that a partial dump may legitimately not have. A missing
   * non-optional table fails the run: silently mapping zero rows of a table
   * that exists but was not exported is exactly the "quietly loses data"
   * failure the mappers' own reports are designed to prevent.
   */
  readonly optional?: boolean;
}

/** One key of the mapper's output feeding one PostgreSQL table. */
export interface TargetSpec<Output extends MapperOutput = MapperOutput> {
  /** The PostgreSQL table. */
  readonly table: string;
  /** Which key of the mapper's output holds its rows. */
  readonly from: Exclude<keyof Output & string, 'report'>;
  /**
   * Fields the mapper emits that the table deliberately does not have.
   *
   * The runner refuses to insert a row carrying a column the table does not
   * know, because the alternative — dropping it quietly — is how a migration
   * loses a field and nobody finds out until someone asks where it went. An
   * entry here is the explicit decision to drop one, written where a reviewer
   * reading the group sees it, with the reason next to it.
   *
   * It is not a place to park a mismatch: every entry should have a CR behind
   * it that ends with either the column existing or the mapper not emitting it.
   */
  readonly dropColumns?: readonly { readonly column: string; readonly reason: string }[];
  /**
   * Merge into a table `packages/db`'s seed already filled, instead of
   * emptying and reloading it.
   *
   * Two tables need this, and both for the same reason: the seed writes rows
   * the application relies on that no legacy table holds. `express_companies`
   * is the 1101-row carrier catalogue — the legacy `eb_express` only carries
   * what an operator changed on it (the order and the on/off switch) — and
   * `notification_templates` holds the registry's shells. Emptying either would
   * delete seed rows the ETL cannot put back, which is exactly the "two sources
   * of truth" that decision 9 in `status/j.md` forbids.
   *
   * So the rows are written `INSERT … ON CONFLICT (conflict) DO UPDATE`: a row
   * the seed has is overwritten column by column with what the mapper
   * produced (never `created_at`, which stays the seed's), a row it lacks is
   * inserted. Running it twice changes nothing, which is what makes it safe to
   * leave out of the clear. `reason` is printed with the run report.
   */
  readonly upsert?: { readonly conflict: readonly string[]; readonly reason: string };
}

/**
 * How a group borrows an id set from another group.
 *
 * `catalog` wants the ids that survived `user`, so a favourite of a deleted
 * account is dropped instead of breaking a foreign key. When `user` has not
 * landed yet, the runner hands over an **empty** set, and the mapper's own
 * report then counts every row it dropped for it — loudly, by name. That is
 * the difference between "the user group is pending, so 412 favourites were
 * dropped" and a silent skip.
 */
export interface SoftDependency<Input extends object = object> {
  /** The group whose surviving ids are wanted. */
  readonly group: string;
  /** Which key of this mapper's input receives them. */
  readonly into: keyof Input & string;
  /** Which target table of that group to read the ids from. */
  readonly table: string;
  /** The column to read. Defaults to `id`. */
  readonly column?: string;
}

export interface GroupDefinition<Input extends object, Output extends MapperOutput> {
  /** Stable name, used by `--group` and in every report. */
  readonly name: string;
  /** What an operator calls it. */
  readonly title: string;
  /**
   * The mapper, or `null` when the owning stream has not written it yet. A
   * `null` mapper makes the group **pending**: `plan` and `run` say so, `verify`
   * says so, and `run --require-complete` fails. It is never skipped quietly.
   */
  readonly mapper: Mapper<Input, Output> | null;
  /** Who owes the mapper, shown next to a pending group. */
  readonly owner: string;
  readonly sources: readonly SourceSpec<Input>[];
  /** Targets in **insert order**: a parent table before the children. */
  readonly targets: readonly TargetSpec<Output>[];
  readonly softDependencies?: readonly SoftDependency<Input>[];
  /**
   * Reference tables this group's foreign keys point at that **no group
   * migrates**.
   *
   * `user_addresses.city_id` is the case that found this. The city dictionary
   * is not carried over from the dump at all: it is seeded by `packages/db`
   * (`pnpm --filter @shop/db db:seed`) from `seed-data/cities.json`, with the
   * legacy ids deliberately kept so an address can go on pointing at city 1.
   * Run the ETL against an unseeded database and every address fails a foreign
   * key — the right outcome, but only if the message says "run the seed"
   * rather than quoting a constraint name.
   *
   * Checked before the first group is touched, because an unseeded database is
   * an operator setup mistake rather than a data problem, and finding it out
   * three groups into a cutover wastes the window.
   */
  readonly requiresReference?: readonly { readonly table: string; readonly reason: string }[];
  /**
   * Extras the runner computes and the mapper cannot: the migration instant,
   * a key map, a digest. Runs after the sources are read and before the mapper.
   */
  readonly extras?: (context: GroupContext) => Promise<Partial<Input>> | Partial<Input>;
  /**
   * A last pass over the rows of one target before they are inserted — the one
   * place a value that needs the filesystem or the database can be filled in
   * (`attachments.sha256` is the only user today). It may drop rows; what it
   * drops it must record in `context.notes`.
   */
  readonly finalise?: (
    table: string,
    rows: readonly TargetRow[],
    context: GroupContext,
  ) => Promise<TargetRow[]>;
}

/** What the runner gives a group's `extras` and `finalise` hooks. */
export interface GroupContext {
  /** When this migration is deemed to have happened. One instant per run. */
  readonly migratedAt: Date;
  /** Ids that survived each already-loaded group, by `${group}:${table}`. */
  readonly keptIds: ReadonlyMap<string, ReadonlySet<number>>;
  /** Groups whose mapper has not landed. */
  readonly pending: ReadonlySet<string>;
  /** Where the legacy uploads directory is mounted, if it is. */
  readonly uploadsRoot: string | null;
  /**
   * Let a config value a group's zod schema refuses fall back to its default
   * rather than aborting the run. Only the `config` group reads this, but it
   * belongs here because `extras` is the only channel a group has to the
   * run's own options.
   */
  readonly allowInvalidConfig: boolean;
  /**
   * The ids already in a target table — for a **reference** table this
   * migration does not write, which is the one case a mapper cannot reason
   * about on its own.
   *
   * `user` uses it for the city dictionary: `user_addresses.city_id` is a real
   * foreign key into rows that arrive from `packages/db`'s seed, so an id the
   * dictionary does not have has to become NULL and be counted, rather than
   * roll the whole group back (CR-3-j). Ids that survived another *group* do
   * not come from here — those are `keptIds`, filled in group order.
   */
  readonly idsOf: (table: string, column?: string) => Promise<ReadonlySet<number>>;
  /**
   * Some columns of a table another group has **already loaded in this run**,
   * read inside the run's transaction, so it sees what that group wrote.
   *
   * `groupbuy` and `presale` point their SKU rows at `product_skus.id`, which
   * the legacy side does not have: the only way to find it is the pair
   * `(product_id, spec_text)` catalog just wrote. Column names are constants in
   * `groups.ts`, never input.
   */
  readonly selectTarget: <T extends Record<string, unknown>>(
    table: string,
    columns: readonly string[],
  ) => Promise<T[]>;
  /**
   * `select count(*)` against the legacy database — for a table a mapper only
   * needs to *report on*, never to read row by row. `eb_store_pink` is the
   * case: teams are not migrated (PLAN §6), and the number of rows that were
   * left behind belongs in the report rather than in a guess. A table the dump
   * does not have counts as 0.
   */
  readonly countSource: (table: string, where?: string) => Promise<number>;
  /** Free-text findings that end up in the run report. Never a value. */
  readonly notes: string[];
}

// ---------------------------------------------------------------------------
// type erasure
// ---------------------------------------------------------------------------

/**
 * A group with its generics erased, so the registry can hold a list of them.
 *
 * `defineGroup` is the only way to build one, and it type-checks the mapper
 * against its own sources and targets on the way in — so `into: 'issue'` when
 * the mapper's input calls it `issues` is a compile error, at the definition,
 * not a runtime `undefined` halfway through a production cutover.
 */
export interface ErasedGroup {
  readonly name: string;
  readonly title: string;
  readonly owner: string;
  readonly pending: boolean;
  readonly sources: readonly SourceSpec[];
  readonly targets: readonly TargetSpec[];
  readonly softDependencies: readonly SoftDependency[];
  readonly requiresReference: readonly { readonly table: string; readonly reason: string }[];
  readonly extras: (context: GroupContext) => Promise<Record<string, unknown>>;
  readonly finalise: (
    table: string,
    rows: readonly TargetRow[],
    context: GroupContext,
  ) => Promise<TargetRow[]>;
  /** Runs the mapper. Throws if the group is pending — check `pending` first. */
  readonly map: (input: Record<string, unknown>) => MapperOutput;
}

export function defineGroup<Input extends object, Output extends MapperOutput>(
  definition: GroupDefinition<Input, Output>,
): ErasedGroup {
  const { mapper } = definition;
  return {
    name: definition.name,
    title: definition.title,
    owner: definition.owner,
    pending: mapper === null,
    sources: definition.sources as readonly SourceSpec[],
    targets: definition.targets as readonly TargetSpec[],
    softDependencies: (definition.softDependencies ?? []) as readonly SoftDependency[],
    requiresReference: definition.requiresReference ?? [],
    extras: async (context) =>
      ((await definition.extras?.(context)) ?? {}) as Record<string, unknown>,
    finalise: async (table, rows, context) =>
      (await definition.finalise?.(table, rows, context)) ?? [...rows],
    map: (input) => {
      if (mapper === null) {
        throw new Error(
          `group "${definition.name}" 的 mapper 尚未落地（owner: ${definition.owner}）`,
        );
      }
      return mapper(input as Input);
    },
  };
}

/** Every row array a mapper produced, keyed by target table. */
export function rowsByTable(group: ErasedGroup, output: MapperOutput): Map<string, TargetRow[]> {
  const byTable = new Map<string, TargetRow[]>();
  const record = output as unknown as Record<string, unknown>;
  for (const target of group.targets) {
    const rows = record[target.from];
    if (!Array.isArray(rows)) {
      throw new Error(
        `group "${group.name}"：mapper 的输出里没有数组 "${target.from}"（目标表 ${target.table}）`,
      );
    }
    byTable.set(target.table, rows as TargetRow[]);
  }
  return byTable;
}
