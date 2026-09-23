import type { z } from 'zod';

/**
 * Editor metadata carried on a block prop schema through zod 4's `.meta()`.
 *
 * DRAFT — moves to `@shop/contracts` in stream F1, together with the block
 * schemas. The editor (admin) turns these into form fields; the storefront
 * ignores them. Nothing here may depend on React or on the editor library, so
 * the same schema can be imported by the contracts, the resolver and both
 * clients.
 *
 * ```ts
 * z.number().int().min(0).max(40).default(20).meta(ui({ label: '间距', group: '样式' }))
 * ```
 */

/**
 * The control an editor should use for a value. Omitted → inferred from the
 * schema: string → text, number → number, boolean → switch, enum → select,
 * array → array, object → object.
 *
 * The last four are *semantic* kinds: an editor renders them with a control of
 * its own (the admin reuses its asset / link / record pickers).
 */
export type EditorFieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'radio'
  | 'switch'
  | 'array'
  | 'object'
  | 'color'
  | 'image'
  | 'link'
  | 'productSource';

// A type alias, not an interface: zod's `GlobalMeta` has an index signature,
// which an interface is not assignable to.
export type EditorMeta = {
  /** Field label, Simplified Chinese. */
  label: string;
  field?: EditorFieldKind | undefined;
  /** Groups fields under a heading in the inspector, in first-appearance order. */
  group?: string | undefined;
  help?: string | undefined;
  placeholder?: string | undefined;
  /** Enum value → label, for `select` / `radio`. Missing values show the raw value. */
  options?: Readonly<Record<string, string>> | undefined;
  /** For arrays: which item key names an item in the collapsed list. */
  itemLabel?: string | undefined;
  /** For numbers, when the schema has no `.min()`/`.max()` or the control needs a step. */
  step?: number | undefined;
  /** Hidden from the editor (still validated and stored). */
  hidden?: boolean | undefined;
};

/** Typed helper for `.meta()`: `z.string().meta(ui({ label: '标题' }))`. */
export function ui(meta: EditorMeta): EditorMeta {
  return meta;
}

function isEditorMeta(value: unknown): value is EditorMeta {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { label?: unknown }).label === 'string'
  );
}

/** The wrapper types whose inner schema carries the value shape. */
const WRAPPERS = new Set(['optional', 'nullable', 'default', 'prefault', 'catch', 'readonly']);

interface Unwrapped {
  /** The innermost, non-wrapper schema. */
  schema: z.ZodType;
  /** Metadata merged from the outermost wrapper inwards; the outer value wins. */
  meta: EditorMeta | undefined;
  optional: boolean;
  /** The value `.default()` supplies, if any. */
  defaultValue: unknown;
}

/**
 * Peels `optional` / `nullable` / `default` / … off a schema and collects the
 * editor metadata attached at any level (`.meta()` may be called before or
 * after `.default()`).
 */
export function unwrapSchema(schema: z.ZodType): Unwrapped {
  let current = schema;
  let meta: EditorMeta | undefined;
  let optional = false;
  let defaultValue: unknown;
  for (;;) {
    const own = current.meta();
    if (isEditorMeta(own)) meta = { ...own, ...meta };
    const def = current._zod.def as { type: string; innerType?: z.ZodType; defaultValue?: unknown };
    if (!WRAPPERS.has(def.type) || !def.innerType) break;
    if (def.type === 'optional' || def.type === 'nullable') optional = true;
    if ((def.type === 'default' || def.type === 'prefault') && defaultValue === undefined) {
      defaultValue = def.defaultValue;
    }
    current = def.innerType;
  }
  return { schema: current, meta, optional, defaultValue };
}
