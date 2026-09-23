/**
 * Strips `undefined` entries so an options bag can be spread into a component whose props are
 * declared `prop?: T` without `| undefined` (Taro's and NutUI's are). Same helper as
 * `apps/web/src/admin/kit/props.ts`; the workspace runs with `exactOptionalPropertyTypes`.
 *
 * ```tsx
 * <NutInput {...defined({ placeholder, maxLength })} />
 * ```
 */
export type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

export function defined<T extends object>(props: T): Defined<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Defined<T>;
}
