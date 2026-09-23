import type { DiyComponentKey } from '@shop/contracts/diy/schema/registry';
import type { DiyPageKind } from '@shop/contracts/diy/schema/page';
import type { ComponentType } from 'react';
import type { z } from 'zod';

/**
 * The contract between the DIY editor shell and the ~60 config panels.
 * **Stable.** Changing anything here changes every panel at once.
 *
 * A panel is a controlled component over one node of the saved page. It is
 * handed the node, a setter and a context; it owns nothing else. In particular
 * a panel never talks to the store, never reads the page, and never calls a
 * route directly — everything it needs arrives through `value` or `ctx`.
 */

/** One node of a saved page, as the schemas describe it: loose, unknown keys kept. */
export type DiyComponentValue = Record<string, unknown> & { name?: string };

/** Colour tokens the storefront theme applies; panels use them for live previews. */
export interface DiyTheme {
  /** Primary brand colour, e.g. `#E93323`. */
  theme: string;
  /** Secondary/accent colour. */
  accent: string;
}

export const DEFAULT_DIY_THEME: DiyTheme = { theme: '#E93323', accent: '#FF7E00' };

export interface DiyPanelContext {
  /** The component key this panel edits. Always equals `definition.key`. */
  componentKey: DiyComponentKey;
  /** Which storefront surface is being decorated. Some panels differ per surface. */
  pageKind: DiyPageKind;
  /** Page-wide colour theme, for previewing "follow the theme" options. */
  theme: DiyTheme;
  /** Restores the node to its factory default. No-op if the panel declares no default. */
  reset: () => void;
  /**
   * Removes the component from the page. Absent for the singletons
   * (`pageFoot`, `bottomMenu`), which the page owns rather than the canvas.
   */
  remove?: (() => void) | undefined;
  /** True while the page is read-only (no `diy:page:update` permission, or publishing). */
  disabled: boolean;
}

export interface DiyPanelProps<T extends DiyComponentValue = DiyComponentValue> {
  value: T;
  /**
   * Replaces the whole node. Always call with a **new** object — the store
   * compares by reference to decide whether an undo entry is worth keeping.
   */
  onChange: (next: T) => void;
  ctx: DiyPanelContext;
}

export type DiyPanelComponent<T extends DiyComponentValue = DiyComponentValue> = ComponentType<
  DiyPanelProps<T>
>;

export interface DiyPanelDefinition<T extends DiyComponentValue = DiyComponentValue> {
  key: DiyComponentKey;
  /** The component's schema from `@shop/contracts/diy/schema/<key>.schema`. */
  schema: z.ZodType<unknown>;
  /**
   * Factory default for a freshly dragged component, and what `ctx.reset()`
   * restores. Must satisfy `schema`; `panels.test.tsx` checks that for every
   * registered panel, so a typo here fails CI rather than production.
   *
   * `timestamp`, `name` and `cname` are filled in by the store — return the
   * body only, or include them and they will be overwritten.
   */
  createDefault: () => T;
  Panel: DiyPanelComponent<T>;
  /** Shown in the palette; defaults to the schema's `cname`. */
  label?: string;
  /** One-line description shown under the palette entry. */
  description?: string;
}

/**
 * A panel after its value type has been erased.
 *
 * `DiyPanelDefinition<T>` is contravariant in `T` through `Panel`'s props, so a
 * `swiperBg` panel is not assignable to a `DiyPanelDefinition<DiyComponentValue>`
 * and a heterogeneous array of panels has no useful common type. The erasure
 * happens once, inside `defineDiyPanel`, where the node has just been checked
 * against the schema — rather than at every call site.
 */
export type AnyDiyPanelDefinition = DiyPanelDefinition<DiyComponentValue>;

/** Declares a panel: `export default defineDiyPanel<SwiperBgComponent>({…})`. */
export function defineDiyPanel<T extends DiyComponentValue>(
  definition: DiyPanelDefinition<T>,
): AnyDiyPanelDefinition {
  return definition as unknown as AnyDiyPanelDefinition;
}

export interface DiyPanelRegistry {
  get(key: string): AnyDiyPanelDefinition | undefined;
  has(key: string): boolean;
  /** Registered keys, in the order they were passed in. */
  keys: DiyComponentKey[];
}

/**
 * Builds the lookup the editor shell uses.
 *
 * Deliberately explicit rather than a `pnpm gen` glob: the shell must boot with
 * an incomplete set, and an unregistered key
 * has to degrade to the raw fallback editor instead of failing the build.
 */
export function createDiyPanelRegistry(
  definitions: readonly AnyDiyPanelDefinition[],
): DiyPanelRegistry {
  const byKey = new Map<string, AnyDiyPanelDefinition>();
  for (const definition of definitions) {
    if (byKey.has(definition.key)) {
      throw new Error(`DIY panel ${definition.key} is registered twice`);
    }
    byKey.set(definition.key, definition);
  }
  return {
    get: (key) => byKey.get(key),
    has: (key) => byKey.has(key),
    keys: [...byKey.keys()] as DiyComponentKey[],
  };
}

// ---------------------------------------------------------------------------
// field binding
// ---------------------------------------------------------------------------

/** What every field editor in `fields/` accepts. */
export interface DiyFieldProps<V> {
  value: V | undefined;
  onChange: (next: V) => void;
  disabled?: boolean | undefined;
}

export interface DiyBinder<T extends DiyComponentValue> {
  /** `{...bind('dotColor')}` wires a field editor to one key of the node. */
  bind<K extends keyof T & string>(key: K): DiyFieldProps<NonNullable<T[K]>>;
  /** Shallow-merges a patch into the node. */
  patch(next: Partial<T>): void;
  /**
   * The selected 展示设置 / 样式设置 tab, read from `setUp.tabVal` exactly as
   * stored pages carry it. `0` when the node has no `setUp`.
   */
  tab: number;
  setTab(next: number): void;
}

/**
 * Wires a panel's `value`/`onChange` pair to the field editors.
 *
 * Not a hook — no state of its own — so it is safe to call conditionally and
 * cheap to call per render.
 */
export function bindDiyPanel<T extends DiyComponentValue>(
  value: T,
  onChange: (next: T) => void,
  disabled = false,
): DiyBinder<T> {
  const patch = (next: Partial<T>): void => {
    onChange({ ...value, ...next });
  };
  const setUp = value.setUp as { tabVal?: unknown } | undefined;
  const rawTab = setUp?.tabVal;
  return {
    bind: (key) => ({
      value: value[key] as never,
      onChange: (next) => patch({ [key]: next } as unknown as Partial<T>),
      disabled,
    }),
    patch,
    tab: typeof rawTab === 'number' ? rawTab : Number(rawTab ?? 0) || 0,
    setTab: (next) => patch({ setUp: { ...(setUp ?? {}), tabVal: next } } as unknown as Partial<T>),
  };
}
