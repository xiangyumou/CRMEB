import {
  listLabels,
  listProducts,
  productCategoryTree,
  resolveLabels,
  resolveProducts,
} from '../decor/catalog-records';
import {
  articleCategoryTree,
  listArticles,
  listCoupons,
  listGroupbuys,
  resolveArticles,
  resolveCoupons,
  resolveGroupbuys,
} from '../decor/record-kinds';
import type {
  DiyDataSource,
  DiyPickerItem,
  DiyPickerKind,
  DiyPickerQuery,
  DiyPickerResult,
} from './data-source';

// Kept for anything that still imports them from here.
export { isClaimableNow, isRunningNow, nestArticleCategories } from '../decor/record-kinds';

/**
 * The `DiyDataSource` the legacy editor mounts: its picker kinds, answered by
 * the decor editor's record kinds (`admin/decor/catalog-records.ts`,
 * `admin/decor/record-kinds.ts`), which own the routes, filters and mapping.
 * This file only names them the way the legacy panels do (`labels`,
 * `combination`). Deleted with `admin/diy` at the cutover.
 */

interface KindSource {
  list(query: DiyPickerQuery): Promise<DiyPickerResult>;
  resolve(ids: readonly string[]): Promise<DiyPickerItem[]>;
}

export interface DiyDataSourceOptions {
  /** The clock the time-window filters read. Tests pin it. */
  now?: (() => Date) | undefined;
}

export function createDiyDataSource(options: DiyDataSourceOptions = {}): DiyDataSource {
  const now = options.now ?? (() => new Date());
  const kinds: Record<DiyPickerKind, KindSource> = {
    product: { list: listProducts, resolve: resolveProducts },
    labels: { list: listLabels, resolve: resolveLabels },
    article: { list: listArticles, resolve: resolveArticles },
    coupon: {
      list: (query) => listCoupons(query, now()),
      resolve: resolveCoupons,
    },
    combination: {
      list: (query) => listGroupbuys(query, now()),
      resolve: resolveGroupbuys,
    },
  };
  return {
    list: (kind, query) => kinds[kind].list(query),
    resolve: (kind, ids) => kinds[kind].resolve(ids),
    categories: (kind) => (kind === 'product' ? productCategoryTree() : articleCategoryTree()),
  };
}
