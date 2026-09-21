import {
  isRemovedDiyComponent,
  normaliseStorefrontPath,
  REMOVED_STOREFRONT_PAGES,
} from '@shop/contracts/diy/removed';

/**
 * The port of `DiyCompatibilityServices::clean`
 * (`crmeb/app/services/diy/DiyCompatibilityServices.php:28`).
 *
 * Read-time only. A page decorated before 拼团 / 秒杀 / 积分商城 were dropped still
 * has those components and those links in its saved JSON; the row is never
 * rewritten, so the filter is applied on the way out and re-enabling a feature
 * stays a code change rather than a data migration.
 *
 * Three ways an entry is dropped, all taken from the PHP in its own order:
 *
 * 1. its **key** is a retired component name — this is how the theme blobs are
 *    stored, keyed by name (`moren.js`);
 * 2. its value's **`name`** is a retired component — this is how a page is
 *    stored, keyed by timestamp;
 * 3. its value navigates to a page that no longer exists, checked at
 *    `info[1].value` first and then at `link`, `url` and `value`.
 *
 * Everything else recurses. Lists are re-indexed after the deletions
 * (`array_values`), objects keep their keys — which is exactly why a component
 * survives cleaning byte-identically unless something inside it was removed.
 */

const removedPaths = new Set(REMOVED_STOREFRONT_PAGES);

/**
 * `in_array(ltrim(explode('?', $v)[0], '/'), $paths, true)` — note there is no
 * `http` exemption here, matching the PHP: a URL with a scheme cannot equal a
 * bare `pages/...` entry, so the check is a no-op for external links.
 */
function pointsAtRemovedPage(value: unknown): boolean {
  return typeof value === 'string' && removedPaths.has(normaliseStorefrontPath(value));
}

/** `$value['info'][1]['value'] ?? null` — the positional link slot of an image row. */
function navigationTargetOf(value: object): unknown {
  const info = (value as { info?: unknown }).info;
  if (!Array.isArray(info)) return undefined;
  const second = info[1];
  if (typeof second !== 'object' || second === null) return undefined;
  return (second as { value?: unknown }).value;
}

const LINK_FIELDS = ['link', 'url', 'value'] as const;

/** `is_array($data)` is true for both a JSON object and a JSON list. */
function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

function shouldDrop(key: string, value: unknown): boolean {
  if (isRemovedDiyComponent(key)) return true;
  if (isContainer(value) && isRemovedDiyComponent((value as { name?: unknown }).name)) return true;
  if (!isContainer(value)) return false;
  if (pointsAtRemovedPage(navigationTargetOf(value))) return true;
  for (const field of LINK_FIELDS) {
    // `isset()` is false for null, so a null link is not a removed link.
    const candidate = (value as Record<string, unknown>)[field];
    if (candidate !== undefined && candidate !== null && pointsAtRemovedPage(candidate))
      return true;
  }
  return false;
}

/**
 * Strips retired components and dead links from a decoded page envelope.
 *
 * Pure: the input is never mutated. Untouched sub-trees are returned by
 * identity, so `clean(x) === x` holds for a page that has nothing to strip and
 * the caller can skip a re-serialise.
 */
export function cleanDiyData<T>(data: T): T {
  if (!isContainer(data)) return data;

  if (Array.isArray(data)) {
    const out: unknown[] = [];
    let changed = false;
    for (const [index, value] of data.entries()) {
      if (shouldDrop(String(index), value)) {
        changed = true;
        continue;
      }
      // `continue` in the PHP skips the recursion for a non-array value.
      const cleaned = isContainer(value) ? cleanDiyData(value) : value;
      if (cleaned !== value) changed = true;
      out.push(cleaned);
    }
    return (changed ? out : data) as T;
  }

  const out: Record<string, unknown> = {};
  let changed = false;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (shouldDrop(key, value)) {
      changed = true;
      continue;
    }
    const cleaned = isContainer(value) ? cleanDiyData(value) : value;
    if (cleaned !== value) changed = true;
    out[key] = cleaned;
  }
  return (changed ? out : data) as T;
}

export { isRemovedDiyComponent, isRemovedStorefrontPage } from '@shop/contracts/diy/removed';
