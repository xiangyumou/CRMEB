import {
  parseDiyPageValue,
  DiyParseError,
  type DiyPageValue,
} from '@shop/contracts/diy/schema/page';
import { DomainError } from '../kernel/errors';
import { randomToken } from '../kernel/ids';

/**
 * What happens to an editor's payload between the wire and the row.
 *
 * Nothing here reformats a page. The saved JSON is the renderer's own format
 * and must round-trip byte for byte, so every function below either returns its
 * input by identity or returns a shallow copy whose key order is unchanged.
 */

/** `config('database.page.limitMax', 50)` in the legacy config. */
export const DIY_PRODUCT_LIMIT = 50;

/**
 * Validates the envelope and hands back the caller's own object.
 *
 * `parseDiyPageValue` never rebuilds the value, so the bytes that reach the
 * database are the bytes the editor sent. A failure becomes
 * `DIY_CONTENT_INVALID` with the zod paths in `details`, which is what lets the
 * editor point at the component that is wrong rather than saying "保存失败".
 */
export function validateDiyContent(input: unknown): DiyPageValue {
  try {
    return parseDiyPageValue(input);
  } catch (cause) {
    if (cause instanceof DiyParseError) {
      throw new DomainError('DIY_CONTENT_INVALID', {
        details: cause.issues.map((issue) => ({
          field: issue.path.map(String).join('.'),
          message: issue.message,
        })),
        cause,
      });
    }
    throw cause;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function idsOf(list: readonly unknown[]): unknown[] {
  return list.map((item) => asRecord(item)?.id).filter((value) => value !== undefined);
}

/**
 * Drops the rows the editor resolved for preview, keeping only the ids.
 *
 * Port of `Diy::saveDiyData`'s `is_diy` branch
 * (`crmeb/app/adminapi/controller/v1/diy/Diy.php:117`): a decorated page stores
 * *which* products it shows, never a copy of them. Copies go stale the moment a
 * price changes, and a hundred-product home page would be half a megabyte of
 * duplicated catalogue in one jsonb column.
 *
 * The admin editor re-resolves them through `DiyDataSource` when the page is
 * opened again, and the storefront renderer fetches them itself.
 */
export function dehydrateDiyContent(value: DiyPageValue): DiyPageValue {
  let changed = false;
  const out: Record<string, unknown> = {};

  for (const [key, node] of Object.entries(value)) {
    const record = asRecord(node);
    if (!record) {
      out[key] = node;
      continue;
    }
    const next = dehydrateNode(record);
    if (next !== record) changed = true;
    out[key] = next;
  }
  return (changed ? out : value) as DiyPageValue;
}

function dehydrateNode(node: Record<string, unknown>): Record<string, unknown> {
  switch (node.name) {
    case 'goodList':
      return dehydrateGoodList(node);
    case 'articleList':
      return withoutListIn(node, 'selectList');
    case 'promotionList':
      return withoutListIn(node, 'productList');
    default:
      return node;
  }
}

function dehydrateGoodList(node: Record<string, unknown>): Record<string, unknown> {
  const selectConfig = asRecord(node.selectConfig);
  const goodsList = asRecord(node.goodsList);
  const hasSelect = selectConfig !== null && 'list' in selectConfig;
  const hasGoods = goodsList !== null && Array.isArray(goodsList.list);
  if (!hasSelect && !hasGoods) return node;

  const next = { ...node };
  if (hasSelect) {
    const { list: _list, ...rest } = selectConfig;
    next.selectConfig = rest;
  }
  if (hasGoods) {
    const { list, ...rest } = goodsList;
    // `ids` is appended where the PHP appended it, and `list` removed after,
    // so the key order of everything else is untouched.
    next.goodsList = { ...rest, ids: idsOf(list as unknown[]) };
  }
  return next;
}

function withoutListIn(node: Record<string, unknown>, key: string): Record<string, unknown> {
  const holder = asRecord(node[key]);
  if (!holder || !('list' in holder)) return node;
  const { list: _list, ...rest } = holder;
  return { ...node, [key]: rest };
}

/**
 * The legacy product-count guard, message and all.
 *
 * `Diy::saveDiyData:125` checks the *automatic* mode (`tabConfig.tabVal == 0`)
 * against `numConfig.val`. The explicit mode is checked here too, against the
 * length of the chosen list, which the legacy code only did on the theme branch
 * (`Diy::saveData:80`) and forgot on this one.
 */
export function assertProductLimits(value: DiyPageValue, limit = DIY_PRODUCT_LIMIT): void {
  for (const node of Object.values(value)) {
    const record = asRecord(node);
    if (!record || record.name !== 'goodList') continue;

    const tab = Number(asRecord(record.tabConfig)?.tabVal ?? 0);
    const count = Number(asRecord(record.numConfig)?.val ?? 0);
    if (tab === 0 && Number.isFinite(count) && count > limit) {
      throw new DomainError('DIY_COMPONENT_LIMIT_EXCEEDED', { details: { limit, count } });
    }

    const goodsList = asRecord(record.goodsList);
    const chosen = Array.isArray(goodsList?.list)
      ? goodsList.list.length
      : Array.isArray(goodsList?.ids)
        ? goodsList.ids.length
        : 0;
    if (tab !== 0 && chosen > limit) {
      throw new DomainError('DIY_COMPONENT_LIMIT_EXCEEDED', { details: { limit, count: chosen } });
    }
  }
}

/**
 * The optimistic-concurrency token, derived from the row rather than stored in
 * a column of its own.
 *
 * Two parts, because neither alone is enough:
 *
 * - `updated_at`, which moves on every write, including a rename; the
 *   storefront's `ETag` has to change then too.
 * - the envelope's own `version`, a fresh opaque string written on every
 *   content save. The legacy editor did exactly this
 *   (`$data['version'] = uniqid()` in `Diy::saveData`), and it is what makes
 *   the guard correct at sub-millisecond resolution — two saves inside the same
 *   millisecond share an `updated_at` but never a `version`.
 */
export function versionOf(row: {
  updatedAt: Date;
  content: Record<string, unknown> | null;
}): string {
  return `${row.updatedAt.getTime()}-${contentVersionOf(row.content) ?? '0'}`;
}

export function contentVersionOf(content: Record<string, unknown> | null): string | null {
  const version = content?.version;
  return typeof version === 'string' ? version : null;
}

/** A fresh envelope version. `uniqid()` was time + a counter; so is this. */
export function nextContentVersion(now: Date): string {
  return `${now.getTime().toString(36)}${randomToken(6)}`;
}

export function countComponents(content: unknown): number {
  const record = asRecord(content);
  return record ? Object.keys(record).length : 0;
}
