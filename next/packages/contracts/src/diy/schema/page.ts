import { z } from 'zod';

import { diyComponentNode, type DiyComponentNode } from './registry';

/**
 * The page envelope.
 *
 * A saved page is an **object**, not an array: keys are the component's
 * `timestamp` rendered as a decimal string. Two production pages store one node
 * under the literal key `"undefined"` (`prod-7`, `prod-8`), so the key is not
 * trustworthy — `timestamp` is. The renderer proves it: `pageDesign.vue:514`
 * sorts the keys lexicographically, then `:561` throws that order away with
 * `temp.sort((a, b) => a.timestamp - b.timestamp)`.
 *
 * Hidden nodes (`isHide`) stay in the payload and are skipped at render time
 * (`pageDesign.vue:554`), so hiding a component must never delete it.
 */
export const diyPageValue = z.record(z.string(), diyComponentNode);
export type DiyPageValue = z.infer<typeof diyPageValue>;

/**
 * What `diy_pages.content` holds. `value` is the legacy payload verbatim;
 * everything beside it is ours. `z.looseObject` so a future key added by a
 * newer editor survives a read/write cycle in an older deployment.
 */
export const diyPageContent = z.looseObject({
  value: diyPageValue,
  /**
   * Opaque build stamp the legacy editor wrote into `eb_diy.version`
   * (e.g. `"67bd313ce57d7"`). Carried through so an ETL'd page is unchanged.
   */
  version: z.string().optional(),
  /** Legacy `eb_diy.order_status`: personal-centre order block style. */
  orderStatus: z.number().int().optional(),
});
export type DiyPageContent = z.infer<typeof diyPageContent>;

/** Background image repeat mode; legacy `eb_diy.bg_tab_val`. */
export const diyBackgroundMode = z.enum(['full', 'repeat', 'fixed']);
export type DiyBackgroundMode = z.infer<typeof diyBackgroundMode>;

export const diyPageBackground = z.object({
  color: z.string().optional(),
  imageUrl: z.string().optional(),
  imageMode: diyBackgroundMode.optional(),
});
export type DiyPageBackground = z.infer<typeof diyPageBackground>;

export const diyPageKind = z.enum(['home', 'category', 'product_detail', 'user_center', 'micro']);
export type DiyPageKind = z.infer<typeof diyPageKind>;

export const diyPageStatus = z.enum(['draft', 'published']);
export type DiyPageStatus = z.infer<typeof diyPageStatus>;

// ---------------------------------------------------------------------------
// parse / serialise
// ---------------------------------------------------------------------------

export class DiyParseError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super(`DIY 页面数据格式不正确：${z.prettifyError(new z.ZodError(issues))}`);
    this.name = 'DiyParseError';
  }
}

/**
 * Validates a saved page and hands back **the caller's own object**.
 *
 * Deliberately not `schema.parse(input)`: zod rebuilds a loose object with the
 * declared keys first and the unknown ones after, which silently reorders the
 * JSON. The fixtures are compared byte for byte, and a reordered page is a
 * changed page as far as `git diff` and every cache ETag are concerned. Since
 * no schema in this directory declares a default, a coercion or a transform,
 * "validated" and "unchanged" are the same value — so return the original.
 */
export function parseDiyPageValue(input: unknown): DiyPageValue {
  const result = diyPageValue.safeParse(input);
  if (!result.success) throw new DiyParseError(result.error.issues);
  return input as DiyPageValue;
}

export function safeParseDiyPageValue(
  input: unknown,
): { ok: true; value: DiyPageValue } | { ok: false; issues: z.core.$ZodIssue[] } {
  const result = diyPageValue.safeParse(input);
  return result.success
    ? { ok: true, value: input as DiyPageValue }
    : { ok: false, issues: result.error.issues };
}

/**
 * JSON for a saved page. `JSON.stringify` walks own enumerable keys in
 * insertion order, and `parseDiyPageValue` never rebuilds an object, so
 * `serialise(parse(x))` reproduces the input byte for byte. `indent` defaults
 * to 2 because that is how the production exports in `__fixtures__` are stored.
 */
export function serialiseDiyPageValue(value: DiyPageValue, indent: number | undefined = 2): string {
  return JSON.stringify(value, null, indent);
}

// ---------------------------------------------------------------------------
// ordering
// ---------------------------------------------------------------------------

function timestampOf(node: DiyComponentNode): number {
  const raw = (node as { timestamp?: unknown }).timestamp;
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : Number.NaN;
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export interface DiyPageEntry {
  /** The object key the node is stored under — possibly `"undefined"`. */
  key: string;
  node: DiyComponentNode;
}

/**
 * The nodes in render order: ascending `timestamp`, ties broken by key so the
 * result is total and stable. Nodes without a usable `timestamp` sort last
 * instead of scattering, which is what V8 does today with the renderer's
 * `NaN`-returning comparator but is not guaranteed by the spec.
 */
export function diyPageEntriesInOrder(value: DiyPageValue): DiyPageEntry[] {
  return Object.entries(value)
    .map(([key, node]) => ({ key, node: node as DiyComponentNode }))
    .sort((a, b) => timestampOf(a.node) - timestampOf(b.node) || (a.key < b.key ? -1 : 1));
}

/**
 * Rebuilds the object so key order matches render order and every key equals
 * its node's `timestamp`. The editor writes pages through this; an ETL'd page
 * is left alone, because rewriting keys on import would change bytes we promised
 * not to touch.
 */
export function reindexDiyPageValue(entries: readonly DiyPageEntry[]): DiyPageValue {
  const out: Record<string, DiyComponentNode> = {};
  for (const { key, node } of entries) {
    const stamp = (node as { timestamp?: unknown }).timestamp;
    out[stamp === undefined || stamp === null ? key : String(stamp)] = node;
  }
  return out;
}
