import type {
  ConfigFieldDescriptor,
  ConfigGroupDescriptor,
  ConfigGroupSummary,
  ConfigGroupValues,
  ConfigSaveBody,
} from '@shop/contracts/system/schemas';
import type { Ctx } from '../kernel/context';
import { requireAdminId } from '../kernel/context';
import {
  allConfigGroups,
  getConfigGroup,
  type ConfigFieldType,
  type ConfigFieldUi,
  type ConfigGroupDef,
} from '../kernel/config-registry';
import { DomainError } from '../kernel/errors';
import { hasPermission } from '../auth/rbac';
import { invalidateAppConfigCache } from './app-config.service';
import * as repo from './system.repo';
// The gen'd bucket: `defineConfigGroup` registers as a side effect of its
// module being imported, so this is what makes a group exist. `pnpm gen`
// collects every `src/<domain>/*.config.ts`, so adding a settings screen is one
// new file and no shared index to edit.
import '../config-groups.gen';

/**
 * The generic settings screen.
 *
 * A domain declares `defineConfigGroup({ group, schema, ui })` in
 * `core/src/<domain>/<group>.config.ts`, and these three functions serve every
 * group there will ever be — no hand-written page per tab, and no request
 * parameter deciding which tab is being saved.
 *
 * ## Secrets
 *
 * A field marked `secret` is **write-only**. `read` replaces its value with a
 * boolean "is set" flag, and `save` drops the key when the client sends the flag
 * back instead of a new string. There is no code path that returns a stored
 * credential to a browser, and none that logs one.
 */

/** Registry field types the browser cannot render map onto ones it can. */
const FIELD_KIND: Record<ConfigFieldType, ConfigFieldDescriptor['kind']> = {
  text: 'text',
  textarea: 'textarea',
  number: 'number',
  switch: 'switch',
  select: 'select',
  'multi-select': 'select',
  image: 'asset',
  images: 'asset',
  file: 'asset',
  password: 'password',
  json: 'json',
};

/**
 * A read-only field's help text always says where the value does come from.
 *
 * "You cannot change this here" on its own is an unanswerable screen: the
 * operator still has `http://localhost` in their WeChat links and now no idea
 * where it is written. `source` names the environment variable. A group that
 * also wrote `help` keeps it, with the source appended.
 */
function helpFor(ui: ConfigFieldUi): string | undefined {
  if (ui.readOnly !== true || ui.source === undefined) return ui.help;
  const source = `由部署环境决定：${ui.source}`;
  return ui.help === undefined ? source : `${ui.help}（${source}）`;
}

function fieldDescriptor(key: string, ui: ConfigFieldUi): ConfigFieldDescriptor {
  const secret = ui.secret === true || ui.type === 'password';
  const help = helpFor(ui);
  return {
    key,
    label: ui.label,
    kind: secret ? 'password' : FIELD_KIND[ui.type],
    ...(help === undefined ? {} : { help }),
    ...(ui.placeholder === undefined ? {} : { placeholder: ui.placeholder }),
    ...(ui.options === undefined ? {} : { options: ui.options.map((o) => ({ ...o })) }),
    ...(ui.section === undefined ? {} : { section: ui.section }),
    ...(ui.type === 'images' || ui.type === 'multi-select' ? { multiple: true } : {}),
    ...(ui.visibleWhen === undefined ? {} : { visibleWhen: { ...ui.visibleWhen } }),
    ...(secret ? { secret: true } : {}),
    ...(ui.readOnly === true ? { readOnly: true } : {}),
  };
}

export function describeGroup(def: ConfigGroupDef): ConfigGroupDescriptor {
  const fields: ConfigFieldDescriptor[] = [];
  // Declaration order, then `order`, so a group reads the way it was written.
  const entries = Object.keys(def.schema.shape).map((key, index) => {
    const ui = (def.ui as Record<string, ConfigFieldUi | undefined>)[key];
    return { key, ui, index };
  });
  entries.sort((a, b) => (a.ui?.order ?? a.index) - (b.ui?.order ?? b.index));
  for (const entry of entries) {
    // A key with no `ui` entry is deliberately not editable in the admin: it is
    // a value a job or the code writes, not an operator.
    if (!entry.ui) continue;
    fields.push(fieldDescriptor(entry.key, entry.ui));
  }
  return {
    group: def.group,
    title: def.title,
    permission: def.permission ?? 'system:config:read',
    fields,
  };
}

/** Which keys of a group are secret. The one list both `read` and `save` use. */
function secretKeys(def: ConfigGroupDef): Set<string> {
  const out = new Set<string>();
  for (const [key, ui] of Object.entries(def.ui as Record<string, ConfigFieldUi | undefined>)) {
    if (ui && (ui.secret === true || ui.type === 'password')) out.add(key);
  }
  return out;
}

/**
 * Which keys of a group the deployment decides rather than an operator.
 *
 * The screen renders these as plain text and never submits them; this is the
 * half that holds for a stale tab or a hand-made request.
 */
function readOnlyKeys(def: ConfigGroupDef): Set<string> {
  const out = new Set<string>();
  for (const [key, ui] of Object.entries(def.ui as Record<string, ConfigFieldUi | undefined>)) {
    if (ui?.readOnly === true) out.add(key);
  }
  return out;
}

/**
 * Which keys `configSave` accepts: those with a `ui` entry. Deliberately the
 * same rule `describeGroup` uses to decide what the form shows, so the screen
 * and the write path cannot disagree about what an operator may set.
 */
function writableKeys(def: ConfigGroupDef): Set<string> {
  const ui = def.ui as Record<string, ConfigFieldUi | undefined>;
  return new Set(Object.keys(def.schema.shape).filter((key) => ui[key] !== undefined));
}

function requireGroup(name: string): ConfigGroupDef {
  const def = getConfigGroup(name);
  if (!def) throw new DomainError('SYSTEM_CONFIG_GROUP_NOT_FOUND');
  return def;
}

export async function configGroupList(ctx: Ctx): Promise<{ groups: ConfigGroupSummary[] }> {
  const groups = allConfigGroups()
    .map((def) => {
      const descriptor = describeGroup(def);
      return {
        group: descriptor.group,
        title: descriptor.title,
        permission: descriptor.permission,
        fieldCount: descriptor.fields.length,
        writable: hasPermission(ctx.actor, writePermissionFor(descriptor.permission)),
      };
    })
    // A group the caller may not read is not listed at all: a settings index
    // that names screens you cannot open is just a list of 403s.
    .filter((summary) => hasPermission(ctx.actor, summary.permission));
  return { groups };
}

/**
 * A group declaring `system:config:read` is written with `system:config:write`.
 * A group that narrows its permission (say `payment:config:read`) is written
 * with the matching `:write` atom, which its own domain declares.
 */
function writePermissionFor(readPermission: string): string {
  return readPermission.endsWith(':read')
    ? `${readPermission.slice(0, -':read'.length)}:write`
    : readPermission;
}

export async function configGet(ctx: Ctx, params: { group: string }): Promise<ConfigGroupValues> {
  const def = requireGroup(params.group);
  const descriptor = describeGroup(def);
  if (!hasPermission(ctx.actor, descriptor.permission)) {
    throw new DomainError('FORBIDDEN', { details: { permission: descriptor.permission } });
  }

  const effective = (await ctx.config.get(def)) as Record<string, unknown>;
  const secrets = secretKeys(def);
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(effective)) {
    // The flag, never the secret. This is the whole rule, in one line.
    values[key] = secrets.has(key) ? typeof value === 'string' && value.length > 0 : value;
  }

  const updatedAt = await repo.configGroupUpdatedAt(ctx.db, def.group);
  return { descriptor, values, updatedAt: updatedAt ? updatedAt.toISOString() : null };
}

export async function configSave(
  ctx: Ctx,
  params: { group: string },
  body: ConfigSaveBody,
): Promise<ConfigGroupValues> {
  const def = requireGroup(params.group);
  const descriptor = describeGroup(def);
  const writePermission = writePermissionFor(descriptor.permission);
  if (!hasPermission(ctx.actor, writePermission)) {
    throw new DomainError('FORBIDDEN', { details: { permission: writePermission } });
  }

  // The keys the form shows, not every key of the schema. A schema key with no
  // `ui` entry is written by a job or `ctx.config.set` — `wechat.apiBaseUrl` /
  // `payment.apiBaseUrl` exist so a test can point a client at a fake — and
  // accepting it here would let a `payment:config:write` holder repoint the
  // WeChat client at their own host and read the write-only AppSecret off the
  // next token refresh. "Not on the screen" means "not writable from the
  // screen"; a group that ever needs a hidden writable key has to say so in its
  // `ui`, not inherit it from the schema.
  const known = writableKeys(def);
  const unknown = Object.keys(body.values).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new DomainError('SYSTEM_CONFIG_UNKNOWN_KEY', { details: { keys: unknown } });
  }

  // Refused on presence, not on difference. "You may send it as long as it
  // matches" would mean the value is settable the moment the environment
  // changes underneath a tab that is still open, and it would hide the bug
  // this exists to surface: a caller that thinks `site.publicOrigin` is its to
  // write is wrong even when it happens to send the right string.
  const frozen = readOnlyKeys(def);
  const attempted = Object.keys(body.values).filter((key) => frozen.has(key));
  if (attempted.length > 0) {
    throw new DomainError('CONFIG_FIELD_READ_ONLY', { details: { keys: attempted } });
  }

  const secrets = secretKeys(def);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body.values)) {
    if (secrets.has(key)) {
      // The browser round-trips the "is set" flag. Treat anything that is not a
      // non-empty string as "leave it alone", so saving the site name can never
      // blank out a credential.
      if (typeof value !== 'string' || value.length === 0) continue;
    }
    patch[key] = value;
  }

  // `set` validates the *whole* merged group, so a patch that would leave the
  // group invalid is refused rather than half-written.
  await ctx.config.set(def, patch as never, { updatedBy: adminIdOrNull(ctx) });
  // The mini-program's `GET /api/v1/app/config` is a 60-second Redis cache over
  // a few of these groups (`appConfigSourceGroups`); saving one of them drops
  // it, so the operator sees their change in the app now rather than within
  // the minute.
  await invalidateAppConfigCache(ctx, def.group);
  ctx.logger.info(
    { group: def.group, keys: Object.keys(patch).filter((k) => !secrets.has(k)) },
    'config group saved',
  );
  return configGet(ctx, params);
}

function adminIdOrNull(ctx: Ctx): number | null {
  try {
    return requireAdminId(ctx);
  } catch {
    return null;
  }
}
