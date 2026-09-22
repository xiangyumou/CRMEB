/**
 * `eb_system_config` → `config_values`.
 *
 * This is the one group the runner maps itself rather than delegating to a
 * mapper, for a reason that is worth stating: the mapping is not a property of
 * any one domain. It is the union of every registered config group's
 * `legacyKeys`, and validating it means running each group's **zod schema** —
 * which a pure mapper cannot do without importing `@shop/core` and stops being
 * pure.
 *
 * `mappers/system.ts` has a `configKeyMap` input for the same job. The runner
 * does not use it, for one concrete reason: several legacy keys are claimed by
 * **more than one** group while the transition runs — `wechat_appid` by both
 * `wechat` (C's) and `wechat-oa` (F1's), `system_delivery_time` by both
 * `order-fulfil` and the not-yet-dissolved `trade` (CR-6-f1), `store_stock` by
 * both `catalog` and `trade`. `ReadonlyMap<string, {group, key}>` can only
 * express one, so a key would land in one group and silently not in the other,
 * and the shop would come up with half a setting. Here a key fans out to every
 * claimant. The mapper is untouched; see `CR-1-j`.
 *
 * `decodeConfigValue` and `CONFIG_VALUE_TRANSFORMS` are imported from that same
 * mapper rather than reimplemented, so `order_cancel_time`'s hours → minutes
 * conversion (ETL-F1-003) has exactly one definition.
 *
 * **Nothing here ever prints a value.** The report carries keys and `<set>` /
 * `<empty>` (`lib/secrets.ts`). A config migration report is the single most
 * likely place for a merchant private key to escape into a terminal
 * scrollback, a CI log and a support ticket.
 */

import '@shop/core/domains';
import { allConfigGroups, type ConfigGroupDef } from '@shop/core/kernel/config-registry';

import { droppedReason } from './config-dropped';
import { isIgnoredClaim } from './config-overrides';
import { coerceToExpected, isCoercibleType } from './lib/coerce';
import { describeValue, type ValueMarker } from './lib/secrets';
import { CONFIG_VALUE_TRANSFORMS, decodeConfigValue } from './mappers/system';

/** A row of `eb_system_config`. Only these three columns matter. */
export interface LegacySystemConfigRow {
  menu_name: string;
  value: string | null;
  /** 0 输入框, 1 单选, 2 多选, 3 图片, 4 文件, 5 下拉, 6 富文本… only used for context. */
  input_type?: number;
}

/** One row on its way into `config_values`. */
export interface ConfigValueRow extends Record<string, unknown> {
  group: string;
  key: string;
  value: unknown;
  updatedAt: Date;
  updatedBy: number | null;
}

export interface MappedConfigKey {
  legacyKey: string;
  group: string;
  key: string;
  /** `<set>` or `<empty>` — never the value. */
  marker: ValueMarker;
}

export interface DroppedConfigEntry {
  legacyKey: string;
  reason: string;
  marker: ValueMarker;
}

export interface InvalidConfigValue {
  group: string;
  key: string;
  /** zod's message. Zod does not put the value in it for the types we use. */
  problem: string;
}

export interface ConfigMigrationReport {
  /** Rows read from `eb_system_config`. */
  read: number;
  mapped: MappedConfigKey[];
  dropped: DroppedConfigEntry[];
  /** Keys on neither list. A non-empty list fails the run. */
  unmapped: string[];
  /** Values a group's schema refused. A non-empty list fails the run. */
  invalid: InvalidConfigValue[];
  /** Fields whose string value was converted to the type the schema wanted. */
  coerced: { group: string; key: string }[];
  /** Legacy keys claimed by more than one group, and by which. */
  fannedOut: { legacyKey: string; groups: string[] }[];
  /** Registered groups no legacy key fed. They boot on their defaults. */
  groupsWithoutLegacyValues: string[];
}

export interface ConfigMigrationOutput {
  values: ConfigValueRow[];
  report: ConfigMigrationReport;
}

export class ConfigMigrationError extends Error {
  readonly report: ConfigMigrationReport;

  constructor(message: string, report: ConfigMigrationReport) {
    super(message);
    this.name = 'ConfigMigrationError';
    this.report = report;
  }
}

/** `legacyKey → [{group, key}, …]`, built from every registered group. */
export function buildLegacyKeyIndex(
  groups: readonly ConfigGroupDef[] = allConfigGroups(),
): Map<string, { group: string; key: string }[]> {
  const index = new Map<string, { group: string; key: string }[]>();
  for (const group of groups) {
    for (const [field, legacy] of Object.entries(group.legacyKeys ?? {})) {
      const keys = typeof legacy === 'string' ? [legacy] : (legacy ?? []);
      for (const legacyKey of keys) {
        // A claim the migration has proved wrong is parked in
        // `config-overrides.ts` until the owning stream's CR lands.
        if (isIgnoredClaim(legacyKey, group.group, field)) continue;
        const bucket = index.get(legacyKey);
        const entry = { group: group.group, key: field };
        if (bucket) bucket.push(entry);
        else index.set(legacyKey, [entry]);
      }
    }
  }
  return index;
}

export interface MapConfigOptions {
  /** When set, a value a schema refuses is dropped and reported, not fatal. */
  allowInvalid?: boolean;
  /** Overridable so the unit tests do not depend on the whole registry. */
  groups?: readonly ConfigGroupDef[];
  /** The instant written into `updated_at`. */
  now: Date;
}

export function mapConfig(
  rows: readonly LegacySystemConfigRow[],
  options: MapConfigOptions,
): ConfigMigrationOutput {
  const groups = options.groups ?? allConfigGroups();
  const index = buildLegacyKeyIndex(groups);
  const byName = new Map(groups.map((group) => [group.group, group]));

  const mapped: MappedConfigKey[] = [];
  const dropped: DroppedConfigEntry[] = [];
  const unmapped: string[] = [];
  const fannedOut: { legacyKey: string; groups: string[] }[] = [];
  /** `group → { field: value }`, before validation. */
  const staged = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const legacyKey = row.menu_name;
    const claimants = index.get(legacyKey);
    const decoded = decodeConfigValue(row.value ?? '');

    if (claimants === undefined || claimants.length === 0) {
      const reason = droppedReason(legacyKey);
      if (reason === undefined) {
        unmapped.push(legacyKey);
      } else {
        dropped.push({ legacyKey, reason, marker: describeValue(decoded) });
      }
      continue;
    }

    if (claimants.length > 1) {
      fannedOut.push({ legacyKey, groups: claimants.map((c) => c.group) });
    }

    for (const claimant of claimants) {
      // A per-field transform (hours → minutes, …) is keyed by the *new*
      // `group.key`, so two groups claiming one legacy key can convert it
      // differently. `order_cancel_time` is the one that does.
      const transform =
        CONFIG_VALUE_TRANSFORMS.get(`${claimant.group}.${claimant.key}`) ??
        CONFIG_VALUE_TRANSFORMS.get(legacyKey);
      // The transform is fed the **decoded** value, not the raw column.
      // `eb_system_config.value` is JSON-encoded in the real dump (`"2"`, not
      // `2`), and `Number.parseFloat('"2"')` is NaN — which would make
      // `order_cancel_time`'s hours→minutes conversion fall back to its default
      // for every shop, silently. F1's own unit test passes a bare `2`, so the
      // mapper never sees it.
      const value = transform ? transform(decoded === null ? '' : String(decoded)) : decoded;

      const bucket = staged.get(claimant.group) ?? {};
      bucket[claimant.key] = value;
      staged.set(claimant.group, bucket);
      mapped.push({
        legacyKey,
        group: claimant.group,
        key: claimant.key,
        marker: describeValue(value),
      });
    }
  }

  // --- validate each group as a whole, the way the admin screen would -------
  const invalid: InvalidConfigValue[] = [];
  const values: ConfigValueRow[] = [];
  const coercedFields: { group: string; key: string }[] = [];

  for (const [groupName, staging] of [...staged.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const group = byName.get(groupName);
    if (!group) continue; // cannot happen: the index was built from these groups

    // Every legacy value is a string: `eb_system_config.value` is a text column
    // holding JSON, and the old admin forms posted strings, so the stock
    // threshold is `"5"` and a switch is `"1"`. The new schemas are typed.
    // Coerce what is unambiguous, guided by zod's own complaint, before
    // deciding anything is invalid — otherwise every numeric setting in a real
    // shop fails, and `--allow-invalid-config` resets the lot to defaults.
    const { value: raw, coerced } = coerceAgainstSchema(group.schema, staging);
    for (const key of coerced) coercedFields.push({ group: groupName, key });

    const parsed = group.schema.safeParse(raw);
    const accepted: Record<string, unknown> = {};

    if (parsed.success) {
      const data = parsed.data as Record<string, unknown>;
      // Write back only the fields a legacy key actually fed. Everything else
      // is the schema's default, and storing a default turns it into a value
      // that survives a later change of that default.
      for (const key of Object.keys(raw)) accepted[key] = data[key];
    } else {
      const broken = new Set<string>();
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.');
        broken.add(String(issue.path[0] ?? field));
        invalid.push({ group: groupName, key: field, problem: issue.message });
      }
      // Re-parse without the offending fields so the rest of the group still
      // migrates; whether that is enough is `allowInvalid`'s decision.
      const rest: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(raw)) if (!broken.has(key)) rest[key] = value;
      const retry = group.schema.safeParse(rest);
      if (retry.success) {
        const data = retry.data as Record<string, unknown>;
        for (const key of Object.keys(rest)) accepted[key] = data[key];
      }
    }

    for (const key of Object.keys(accepted).sort()) {
      values.push({
        group: groupName,
        key,
        value: accepted[key] ?? null,
        updatedAt: options.now,
        updatedBy: null,
      });
    }
  }

  const report: ConfigMigrationReport = {
    read: rows.length,
    mapped,
    dropped,
    unmapped: [...new Set(unmapped)].sort(),
    invalid,
    coerced: coercedFields,
    fannedOut,
    groupsWithoutLegacyValues: groups
      .map((group) => group.group)
      .filter((name) => !staged.has(name))
      .sort(),
  };

  if (report.unmapped.length > 0) {
    throw new ConfigMigrationError(
      `旧配置里有 ${String(report.unmapped.length)} 个键既没有被任何配置组认领，也不在 ` +
        `src/config-dropped.ts 的显式丢弃清单里：\n` +
        report.unmapped.map((key) => `  ${key}`).join('\n') +
        `\n请给每个键一个归宿（认领或写明丢弃理由）再迁移。静默忽略配置项，` +
        `等于让商城带着没人知道被关掉的功能上线。`,
      report,
    );
  }

  if (invalid.length > 0 && options.allowInvalid !== true) {
    throw new ConfigMigrationError(
      `有 ${String(invalid.length)} 个配置值不满足新的 schema：\n` +
        invalid.map((i) => `  ${i.group}.${i.key}: ${i.problem}`).join('\n') +
        `\n（这里不打印具体取值。）修好旧库里的值，或用 --allow-invalid-config ` +
        `让这些字段回落到默认值——但要知道自己在关掉什么。`,
      report,
    );
  }

  return { values, report };
}

/**
 * One coercion pass, driven by what the schema complained about.
 *
 * The object is parsed; each `invalid_type` issue names a field and the type it
 * wanted, and `coerceToExpected` converts that field when the conversion is
 * unambiguous. Nothing is coerced speculatively, and a field the schema is
 * happy with is never touched.
 *
 * Reading zod's report rather than the schema's internals is what keeps this
 * working for a field wrapped in `.default()`, `.optional()`, a union or a
 * transform — none of which this function has to know about.
 */
function coerceAgainstSchema(
  schema: ConfigGroupDef['schema'],
  raw: Record<string, unknown>,
): { value: Record<string, unknown>; coerced: string[] } {
  const first = schema.safeParse(raw);
  if (first.success) return { value: raw, coerced: [] };

  const next = { ...raw };
  const coerced: string[] = [];
  for (const issue of first.error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string' || issue.path.length !== 1) continue;
    if (issue.code !== 'invalid_type') continue;
    const expected: unknown = (issue as { expected?: unknown }).expected;
    if (!isCoercibleType(expected)) continue;
    const converted = coerceToExpected(next[field], expected);
    if (converted === undefined) continue;
    next[field] = converted;
    coerced.push(field);
  }
  return coerced.length === 0 ? { value: raw, coerced: [] } : { value: next, coerced };
}

// ---------------------------------------------------------------------------
// the group adapter
// ---------------------------------------------------------------------------

/** `config`'s input, in the shape `defineGroup` expects. */
export interface ConfigMigrationInput {
  configs?: readonly LegacySystemConfigRow[];
  /** Supplied by the runner through the group's `extras`. */
  now?: Date;
  allowInvalid?: boolean;
}

/**
 * `mapConfig` with the signature every other group has: one argument in, rows
 * plus a report out. The runner hands `now` through `extras`, so this stays a
 * pure function of its input like every mapper.
 */
export function configMapper(input: ConfigMigrationInput): ConfigMigrationOutput {
  return mapConfig(input.configs ?? [], {
    now: input.now ?? new Date(),
    ...(input.allowInvalid === undefined ? {} : { allowInvalid: input.allowInvalid }),
  });
}
