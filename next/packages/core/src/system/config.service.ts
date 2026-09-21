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
import { configFieldExtra } from './config-ui-extras';
import * as repo from './system.repo';
import './config-groups';

/**
 * The generic settings screen.
 *
 * The old admin had one hand-written page per config tab — about fifty of them,
 * plus `edit_basics`/`save_basics` aliased across unrelated modules so that
 * "which tab am I saving" was decided by request parameters. Here a domain
 * declares `defineConfigGroup({ group, schema, ui, legacyKeys })` in
 * `core/src/<domain>/<group>.config.ts`, and these three functions serve every
 * group there will ever be.
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

function fieldDescriptor(group: string, key: string, ui: ConfigFieldUi): ConfigFieldDescriptor {
  const secret = ui.secret === true || ui.type === 'password';
  // `visibleWhen` is not on `ConfigFieldUi` yet — CR-1-f1. Until it is, a group
  // registers it beside its definition and it is merged in here, so the screen
  // and the contract already behave as though the CR had landed.
  const extra = configFieldExtra(group, key);
  return {
    key,
    label: ui.label,
    kind: secret ? 'password' : FIELD_KIND[ui.type],
    ...(ui.help === undefined ? {} : { help: ui.help }),
    ...(ui.placeholder === undefined ? {} : { placeholder: ui.placeholder }),
    ...(ui.options === undefined ? {} : { options: ui.options.map((o) => ({ ...o })) }),
    ...(ui.section === undefined ? {} : { section: ui.section }),
    ...(ui.type === 'images' || ui.type === 'multi-select' ? { multiple: true } : {}),
    ...(extra?.visibleWhen === undefined ? {} : { visibleWhen: extra.visibleWhen }),
    ...(secret ? { secret: true } : {}),
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
    // a value the ETL or a job writes, not an operator.
    if (!entry.ui) continue;
    fields.push(fieldDescriptor(def.group, entry.key, entry.ui));
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

  const known = new Set(Object.keys(def.schema.shape));
  const unknown = Object.keys(body.values).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new DomainError('SYSTEM_CONFIG_UNKNOWN_KEY', { details: { keys: unknown } });
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
