import type { CustomFieldRender, Field, Fields } from '@puckeditor/core';
import {
  unwrapSchema,
  type EditorFieldKind,
  type EditorMeta,
} from '@shop/storefront-blocks/schema';
import type { z } from 'zod';

/**
 * Block prop schemas → Puck field definitions.
 *
 * The schema is the single source: its shape picks the control (string →
 * text, number → number, boolean → 开/关, enum or a union of literals →
 * select / radio, array of objects → Puck's array editor, object → Puck's
 * object editor) and its `.meta()` (see `EditorMeta`) supplies the label, the
 * option labels, the number step and the few *semantic* kinds that need a
 * control of the admin's own — image, link, colour, product source. Those are
 * Puck `custom` fields whose renderers the caller passes in, so this module
 * stays free of antd and is testable on its own.
 *
 * Nothing here is Puck-specific beyond the returned shape: swapping the editor
 * means rewriting this one adapter, not the schemas.
 */

/** The kinds the admin renders with a control of its own. */
export type SemanticFieldKind = Extract<
  EditorFieldKind,
  'image' | 'link' | 'color' | 'productSource' | 'richText' | 'hotspots'
>;

const SEMANTIC_KINDS: ReadonlySet<EditorFieldKind> = new Set<SemanticFieldKind>([
  'image',
  'link',
  'color',
  'productSource',
  'richText',
  'hotspots',
]);

/**
 * What a custom field's renderer finds on `field.metadata`: the schema's
 * editor metadata and whether the value may be left empty.
 */
export interface DecorFieldMetadata {
  meta: EditorMeta | undefined;
  optional: boolean;
  [key: string]: unknown;
}

export type CustomFieldRenderers = Readonly<Record<SemanticFieldKind, CustomFieldRender<any>>> & {
  /**
   * Renders a schema shape the adapter has no control for (a discriminated
   * union without a semantic kind, a record, …). Without it such a prop is an
   * error, so a new schema shape cannot silently vanish from the inspector.
   */
  readonly unsupported?: CustomFieldRender<any> | undefined;
};

type AnyDef = {
  type: string;
  checks?: readonly { _zod: { def: { check: string; minimum?: number; maximum?: number } } }[];
  entries?: Record<string, string | number>;
  options?: readonly z.ZodType[];
  values?: readonly unknown[];
  element?: z.ZodType;
  shape?: Record<string, z.ZodType>;
};

function defOf(schema: z.ZodType): AnyDef {
  return schema._zod.def as unknown as AnyDef;
}

/** `min_length` / `max_length` checks of a string or an array. */
function lengthBounds(def: AnyDef): { min?: number; max?: number } {
  const bounds: { min?: number; max?: number } = {};
  for (const check of def.checks ?? []) {
    const own = check._zod.def;
    if (own.check === 'min_length' && own.minimum !== undefined) bounds.min = own.minimum;
    if (own.check === 'max_length' && own.maximum !== undefined) bounds.max = own.maximum;
  }
  return bounds;
}

function optionLabel(meta: EditorMeta | undefined, value: string | number | boolean): string {
  return meta?.options?.[String(value)] ?? String(value);
}

/** The values of an enum, or of a union whose every member is a literal; else `undefined`. */
function choiceValues(def: AnyDef): (string | number | boolean)[] | undefined {
  if (def.type === 'enum' && def.entries) return Object.values(def.entries);
  if (def.type === 'union' && def.options) {
    const values: (string | number | boolean)[] = [];
    for (const option of def.options) {
      const own = defOf(option);
      if (own.type !== 'literal' || !own.values) return undefined;
      for (const value of own.values) {
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
          return undefined;
        }
        values.push(value);
      }
    }
    return values;
  }
  return undefined;
}

/**
 * The props a new array item starts with: each key's `.default()`, else an
 * empty value of its type. Optional keys are left out.
 */
export function defaultsOf(schema: z.ZodType): unknown {
  const { schema: inner, optional, defaultValue } = unwrapSchema(schema);
  if (defaultValue !== undefined) {
    // Through the schema, not the raw value: a `.prefault({})` default is an
    // *input* that the inner defaults still have to fill.
    const parsed = schema.safeParse(undefined);
    return parsed.success ? parsed.data : structuredClone(defaultValue);
  }
  if (optional) return undefined;
  const def = defOf(inner);
  switch (def.type) {
    case 'string':
      return '';
    case 'number': {
      const min = (inner as unknown as { minValue: number | null }).minValue;
      return min !== null && Number.isFinite(min) ? min : 0;
    }
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(def.shape ?? {})) {
        const value = defaultsOf(child);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    default: {
      const values = choiceValues(def);
      return values?.[0];
    }
  }
}

function fieldFor(name: string, schema: z.ZodType, custom: CustomFieldRenderers): Field | null {
  const { schema: inner, meta, optional } = unwrapSchema(schema);
  if (meta?.hidden) return null;
  const label = meta?.label ?? name;
  const metadata: DecorFieldMetadata = { meta, optional };
  const kind = meta?.field;

  if (kind && SEMANTIC_KINDS.has(kind)) {
    return { type: 'custom', label, metadata, render: custom[kind as SemanticFieldKind] };
  }

  const def = defOf(inner);
  const choices = choiceValues(def);
  if (choices) {
    const options = choices.map((value) => ({ label: optionLabel(meta, value), value }));
    // Two or three short options read better as radio buttons; the schema can ask.
    const type =
      kind === 'radio' || (kind !== 'select' && choices.length <= 3) ? 'radio' : 'select';
    return { type, label, metadata, options };
  }

  switch (def.type) {
    case 'string':
      return {
        type: kind === 'textarea' ? 'textarea' : 'text',
        label,
        metadata,
        ...(meta?.placeholder ? { placeholder: meta.placeholder } : {}),
      };
    case 'number': {
      const bounds = inner as unknown as { minValue: number | null; maxValue: number | null };
      return {
        type: 'number',
        label,
        metadata,
        ...(bounds.minValue !== null && Number.isFinite(bounds.minValue)
          ? { min: bounds.minValue }
          : {}),
        ...(bounds.maxValue !== null && Number.isFinite(bounds.maxValue)
          ? { max: bounds.maxValue }
          : {}),
        ...(meta?.step !== undefined ? { step: meta.step } : {}),
      };
    }
    case 'boolean':
      // Puck has no switch; a boolean radio stores a real boolean.
      return {
        type: 'radio',
        label,
        metadata,
        options: [
          { label: '开', value: true },
          { label: '关', value: false },
        ],
      };
    case 'array': {
      const element = def.element;
      const elementDef = element ? defOf(unwrapSchema(element).schema) : undefined;
      if (!element || elementDef?.type !== 'object') break;
      const { min, max } = lengthBounds(def);
      const itemLabel = meta?.itemLabel;
      const itemName = unwrapSchema(element).meta?.label ?? label;
      return {
        type: 'array',
        label,
        metadata,
        arrayFields: fieldsOf(unwrapSchema(element).schema as z.ZodObject, custom),
        defaultItemProps: () => defaultsOf(element) as Record<string, unknown>,
        getItemSummary: (item: Record<string, unknown>, index = 0) => {
          const text = itemLabel ? item[itemLabel] : undefined;
          return typeof text === 'string' && text ? text : `${itemName} ${index + 1}`;
        },
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
      };
    }
    case 'object':
      return {
        type: 'object',
        label,
        metadata,
        objectFields: fieldsOf(inner as z.ZodObject, custom),
      };
    default:
      break;
  }

  if (custom.unsupported) {
    return { type: 'custom', label, metadata, render: custom.unsupported };
  }
  throw new Error(`zodToPuckFields: no editor control for "${name}" (zod type "${def.type}")`);
}

function fieldsOf(schema: z.ZodObject, custom: CustomFieldRenderers): Fields {
  const fields: Fields = {};
  for (const [name, child] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
    const field = fieldFor(name, child, custom);
    if (field) fields[name] = field;
  }
  return fields;
}

/**
 * Puck `fields` for a block's (or the page root's) prop schema.
 *
 * Throws on a prop the adapter has no control for, unless `custom.unsupported`
 * is given — a schema change must show up in the editor or fail loudly.
 */
export function zodToPuckFields(schema: z.ZodObject, custom: CustomFieldRenderers): Fields {
  return fieldsOf(schema, custom);
}
