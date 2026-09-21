/**
 * Descriptor types for `<ConfigGroupForm>`.
 *
 * Deliberately minimal and data-only (no functions in the default shape, no
 * zod) so that P0-A's `defineConfigGroup` in `core/system/config/<group>.config.ts`
 * can emit one straight over the wire, and so the shapes can round-trip through
 * JSON. Anything richer belongs in the group's own page, not here.
 */

export type ConfigFieldKind =
  'text' | 'password' | 'number' | 'money' | 'switch' | 'select' | 'textarea' | 'asset' | 'json';

export interface ConfigSelectOption {
  label: string;
  value: string | number | boolean;
}

/** Data-only conditional visibility: show when `values[key]` matches. */
export interface ConfigVisibleWhen {
  key: string;
  /** A single value, or any of a list. */
  equals: unknown;
}

export interface ConfigFieldDescriptor {
  /** Key inside the group. The saved payload is `{ [key]: value }`. */
  key: string;
  label: string;
  /** Grey hint under the control. */
  help?: string | undefined;
  kind: ConfigFieldKind;
  options?: ConfigSelectOption[] | undefined;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  visibleWhen?: (ConfigVisibleWhen | ((values: ConfigValues) => boolean)) | undefined;
  /** `asset` only. */
  multiple?: boolean | undefined;
  max?: number | undefined;
  /** `number` only. */
  min?: number | undefined;
  /** Width out of 24 at `md`+. Defaults to the form's `columns` setting. */
  span?: number | undefined;
}

export interface ConfigGroupDescriptor {
  /** Registry group name, e.g. `payment`. Also the route param. */
  group: string;
  title: string;
  description?: string | undefined;
  fields: ConfigFieldDescriptor[];
}

/**
 * Current values for a group.
 *
 * **Secrets**: a `password` field's value is a *boolean*, not the secret —
 * `true` means 已设置, `false`/absent means 未设置. The server never sends a
 * stored secret back, and the form only includes a `password` key in the saved
 * payload when the operator typed a new value.
 */
export type ConfigValues = Record<string, unknown>;

export function isConfigFieldVisible(field: ConfigFieldDescriptor, values: ConfigValues): boolean {
  const condition = field.visibleWhen;
  if (!condition) return true;
  if (typeof condition === 'function') return condition(values);
  const actual = values[condition.key];
  return Array.isArray(condition.equals)
    ? condition.equals.includes(actual)
    : actual === condition.equals;
}

/**
 * Builds the payload to save.
 *
 * Every visible non-secret field is included. A `password` field is included
 * only when `secrets[key]` holds something the operator typed, so saving an
 * unrelated setting can never blank out a stored credential.
 */
export function buildConfigPayload(
  descriptor: ConfigGroupDescriptor,
  formValues: ConfigValues,
  secrets: Record<string, string>,
): ConfigValues {
  const payload: ConfigValues = {};
  for (const field of descriptor.fields) {
    if (!isConfigFieldVisible(field, formValues)) continue;
    if (field.kind === 'password') {
      const typed = secrets[field.key];
      if (typed !== undefined && typed !== '') payload[field.key] = typed;
      continue;
    }
    payload[field.key] = formValues[field.key];
  }
  return payload;
}
