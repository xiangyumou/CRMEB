import type { FormInstance, FormRule } from 'antd';
import { z } from 'zod';

import { ApiError, parseFieldErrors } from '../../api/errors';
import { toNamePath, type FieldName } from './types';

type AnyObjectSchema = z.ZodObject<z.ZodRawShape>;

/** The schema for one top-level field, or `undefined` for nested/unknown paths. */
export function fieldSchemaOf(
  schema: AnyObjectSchema,
  name: FieldName,
): z.ZodType | undefined {
  const path = toNamePath(name);
  if (path.length !== 1) return undefined;
  const key = String(path[0]);
  return (schema.shape as Record<string, z.ZodType | undefined>)[key];
}

/**
 * Whether zod would reject `undefined` for this field — which is exactly what
 * "required" means to an operator. Fields with a `.default()` are not required.
 */
export function isFieldRequired(schema: AnyObjectSchema, name: FieldName): boolean {
  const field = fieldSchemaOf(schema, name);
  if (!field) return false;
  return !field.safeParse(undefined).success;
}

/**
 * An antd rule that runs the field's own zod schema. Cross-field refinements
 * cannot be expressed per field, so they are caught by the whole-object parse
 * in `ZodForm`'s submit handler and mapped back with `setFields`.
 */
export function zodFieldRule(schema: AnyObjectSchema, name: FieldName): FormRule | null {
  const field = fieldSchemaOf(schema, name);
  if (!field) return null;
  return {
    async validator(_rule: unknown, value: unknown) {
      // An empty control gives `''`; treat it as "absent" so the schema's own
      // optionality decides, rather than failing a `.min(1)` on a blank string.
      const candidate = value === '' ? undefined : value;
      const result = field.safeParse(candidate);
      if (result.success) return;
      throw new Error(result.error.issues[0]?.message ?? '输入有误');
    },
  };
}

/** `['sku', 0, 'price']` from `"sku.0.price"`. */
export function issuePathToName(path: readonly PropertyKey[]): (string | number)[] {
  return path.map((segment) =>
    typeof segment === 'number' ? segment : /^\d+$/.test(String(segment)) ? Number(segment) : String(segment),
  );
}

/** Pushes zod issues onto the matching antd fields. Returns how many landed. */
export function applyZodIssues(form: FormInstance, error: z.ZodError): number {
  const byPath = new Map<string, string[]>();
  for (const issue of error.issues) {
    const key = JSON.stringify(issuePathToName(issue.path));
    const list = byPath.get(key) ?? [];
    list.push(issue.message);
    byPath.set(key, list);
  }
  const fields = [...byPath.entries()].map(([key, errors]) => ({
    name: JSON.parse(key) as (string | number)[],
    errors,
  }));
  form.setFields(fields.filter((field) => field.name.length > 0));
  return fields.length;
}

/**
 * Maps a server 422 back onto the form.
 *
 * Handles every `details` shape `parseFieldErrors` knows (zod `flatten()`,
 * a flat `{field: message}` map, or a raw issue list). Returns `true` when at
 * least one message landed on a field — the caller can then skip the toast,
 * because the operator can already see what is wrong.
 */
export function applyApiErrorToForm(form: FormInstance, error: unknown): boolean {
  if (!ApiError.is(error) || error.status !== 422) return false;
  const fieldErrors = parseFieldErrors(error.details);
  if (!fieldErrors) return false;
  const entries = Object.entries(fieldErrors);
  if (entries.length === 0) return false;
  form.setFields(
    entries.map(([path, message]) => ({
      name: issuePathToName(path.split('.')),
      errors: [message],
    })),
  );
  return true;
}
