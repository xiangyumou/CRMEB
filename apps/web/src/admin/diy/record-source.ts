import {
  cmsArticleDetail,
  cmsArticleList,
  cmsCategoryList,
} from '@shop/contracts/cms/cms.admin.contract';
import type { ArticleCategory } from '@shop/contracts/cms/schemas';
import { couponAdminDetail, couponAdminList } from '@shop/contracts/coupon/coupon.admin.contract';
import type { CouponTemplateListItem } from '@shop/contracts/coupon/schemas';
import {
  groupbuyAdminActivityDetail,
  groupbuyAdminActivityList,
} from '@shop/contracts/groupbuy/groupbuy.admin.contract';
import type { GroupbuyActivityListItem } from '@shop/contracts/groupbuy/schemas';

import { ApiError, callRoute } from '../api';
import { formatInstant, formatMoney } from '../kit';
import {
  listLabels,
  listProducts,
  productCategoryTree,
  resolveLabels,
  resolveProducts,
} from './catalog-source';
import type {
  DiyDataSource,
  DiyPickerItem,
  DiyPickerKind,
  DiyPickerQuery,
  DiyPickerResult,
  DiyTreeNode,
} from './data-source';

/**
 * The `DiyDataSource` the editor mounts: every picker kind, over the admin
 * contracts of the domain that owns the records.
 *
 * | kind          | records                  | offered                               |
 * | ------------- | ------------------------ | ------------------------------------- |
 * | `product`     | catalog products         | on shelf                              |
 * | `labels`      | 商品标签                  | enabled                               |
 * | `article`     | CMS articles             | published                             |
 * | `coupon`      | coupon templates         | claimable now, as the 领券中心 lists   |
 * | `combination` | group-buy activities     | active and running now                |
 *
 * The ids are the ones the storefront's DIY components send back to the
 * storefront API: an article id, a coupon *template* id (the uni-app coupon
 * mapper exposes `templateId` as `id`) and a group-buy activity id.
 *
 * Each kind is one entry of a `Record<DiyPickerKind, …>`, so a new kind does not
 * compile until it has a real list and resolve.
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

// ---------------------------------------------------------------------------
// shared
// ---------------------------------------------------------------------------

/**
 * One detail call per id. A record deleted since the page was saved answers
 * 404 and drops out; any other failure is the caller's, so an outage never
 * reads as "nothing was picked".
 */
async function resolveEach(
  ids: readonly string[],
  load: (id: string) => Promise<DiyPickerItem>,
): Promise<DiyPickerItem[]> {
  const rows = await Promise.all(
    ids.map(async (id) => {
      try {
        return [await load(id)];
      } catch (error) {
        if (ApiError.is(error) && error.status === 404) return [];
        throw error;
      }
    }),
  );
  return rows.flat();
}

const SCAN_PAGE_SIZE = 100;
/** 5 000 rows: far past any real shop's live coupons or group-buys. */
const SCAN_MAX_PAGES = 50;

/**
 * Pages through a whole admin list, keeps the rows `keep` accepts, and pages
 * the survivors itself.
 *
 * For the kinds whose "what the storefront shows" test depends on the clock
 * (a claim window, an activity's start and end), which the admin list routes
 * cannot filter on. Filtering one server page at a time would leave short
 * pages and a wrong total; these lists are small, so reading them whole is the
 * honest way to get both right.
 */
async function pageFiltered<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
  keep: (row: T) => boolean,
  query: DiyPickerQuery,
): Promise<{ items: T[]; total: number }> {
  const kept: T[] = [];
  for (let page = 1; page <= SCAN_MAX_PAGES; page += 1) {
    const batch = await fetchPage(page, SCAN_PAGE_SIZE);
    kept.push(...batch.items.filter(keep));
    if (batch.items.length < SCAN_PAGE_SIZE || page * SCAN_PAGE_SIZE >= batch.total) break;
  }
  const start = (query.page - 1) * query.pageSize;
  return { items: kept.slice(start, start + query.pageSize), total: kept.length };
}

const before = (instant: string | null, now: Date): boolean =>
  instant === null || new Date(instant).getTime() <= now.getTime();
const after = (instant: string | null, now: Date): boolean =>
  instant === null || new Date(instant).getTime() >= now.getTime();

// ---------------------------------------------------------------------------
// 文章
// ---------------------------------------------------------------------------

function toArticleItem(row: {
  id: string;
  title: string;
  coverImageUrl: string | null;
  categoryTitle: string | null;
  publishedAt: string | null;
}): DiyPickerItem {
  const subtitle = row.categoryTitle ?? formatInstant(row.publishedAt, 'date', '');
  return {
    id: row.id,
    name: row.title,
    ...(row.coverImageUrl ? { image: row.coverImageUrl } : {}),
    ...(subtitle ? { subtitle } : {}),
  };
}

/** Published only: the storefront serves nothing else, so nothing else may be linked. */
async function listArticles(query: DiyPickerQuery): Promise<DiyPickerResult> {
  const page = await callRoute(cmsArticleList, {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      status: 'published',
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    },
  });
  return { items: page.items.map(toArticleItem), total: page.total };
}

function resolveArticles(ids: readonly string[]): Promise<DiyPickerItem[]> {
  return resolveEach(ids, async (id) =>
    toArticleItem(await callRoute(cmsArticleDetail, { params: { id } })),
  );
}

/**
 * Visible 文章分类, nested. The route answers the two-level tree flat and
 * depth-first, children after their parent.
 */
async function articleCategoryTree(): Promise<DiyTreeNode[]> {
  const list = await callRoute(cmsCategoryList, { query: { status: 'visible' } });
  return nestArticleCategories(list.items);
}

export function nestArticleCategories(rows: readonly ArticleCategory[]): DiyTreeNode[] {
  const children = new Map<string, DiyTreeNode[]>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    const siblings = children.get(row.parentId) ?? [];
    siblings.push({ id: row.id, name: row.title });
    children.set(row.parentId, siblings);
  }
  return rows
    .filter((row) => row.parentId === null)
    .map((row) => {
      const kids = children.get(row.id);
      return { id: row.id, name: row.title, ...(kids ? { children: kids } : {}) };
    });
}

// ---------------------------------------------------------------------------
// 优惠券
// ---------------------------------------------------------------------------

/**
 * The storefront's 领券中心 test, row by row: active, claimed by hand, inside
 * its claim window, not sold out, and not already past its fixed validity.
 * The server applies the first two; the clock-bound rest is applied here.
 */
export function isClaimableNow(row: CouponTemplateListItem, now: Date): boolean {
  return (
    row.status === 'active' &&
    row.claimMode === 'manual' &&
    before(row.claimFrom, now) &&
    after(row.claimTo, now) &&
    (row.isUnlimitedSupply || (row.remainingCount ?? 0) > 0) &&
    after(row.validTo, now)
  );
}

function couponSubtitle(row: { discountAmount: string; minSpend: string }): string {
  const off = formatMoney(row.discountAmount);
  return Number(row.minSpend) > 0
    ? `满 ${formatMoney(row.minSpend)} 减 ${off}`
    : `无门槛 减 ${off}`;
}

function toCouponItem(row: {
  id: string;
  name: string;
  discountAmount: string;
  minSpend: string;
}): DiyPickerItem {
  return { id: row.id, name: row.name, subtitle: couponSubtitle(row) };
}

async function listCoupons(query: DiyPickerQuery, now: Date): Promise<DiyPickerResult> {
  const result = await pageFiltered(
    (page, pageSize) =>
      callRoute(couponAdminList, {
        query: {
          page,
          pageSize,
          status: 'active',
          claimMode: 'manual',
          ...(query.keyword ? { keyword: query.keyword } : {}),
        },
      }),
    (row) => isClaimableNow(row, now),
    query,
  );
  return { items: result.items.map(toCouponItem), total: result.total };
}

function resolveCoupons(ids: readonly string[]): Promise<DiyPickerItem[]> {
  return resolveEach(ids, async (id) =>
    toCouponItem(await callRoute(couponAdminDetail, { params: { id } })),
  );
}

// ---------------------------------------------------------------------------
// 拼团
// ---------------------------------------------------------------------------

/** What the storefront's 拼团 list shows: active, started, and not yet ended. */
export function isRunningNow(row: GroupbuyActivityListItem, now: Date): boolean {
  return (
    row.status === 'active' &&
    new Date(row.startAt).getTime() <= now.getTime() &&
    new Date(row.endAt).getTime() > now.getTime()
  );
}

function toGroupbuyItem(row: {
  id: string;
  title: string;
  imageUrl: string | null;
  price: string;
  seatsRequired: number;
}): DiyPickerItem {
  return {
    id: row.id,
    name: row.title,
    ...(row.imageUrl ? { image: row.imageUrl } : {}),
    subtitle: `${formatMoney(row.price)} · ${row.seatsRequired} 人团`,
  };
}

async function listGroupbuys(query: DiyPickerQuery, now: Date): Promise<DiyPickerResult> {
  const result = await pageFiltered(
    (page, pageSize) =>
      callRoute(groupbuyAdminActivityList, {
        query: {
          page,
          pageSize,
          status: 'active',
          ...(query.keyword ? { keyword: query.keyword } : {}),
        },
      }),
    (row) => isRunningNow(row, now),
    query,
  );
  return { items: result.items.map(toGroupbuyItem), total: result.total };
}

function resolveGroupbuys(ids: readonly string[]): Promise<DiyPickerItem[]> {
  return resolveEach(ids, async (id) =>
    toGroupbuyItem(await callRoute(groupbuyAdminActivityDetail, { params: { id } })),
  );
}
