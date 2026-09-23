'use client';

import { decorDocumentGet, decorDocumentList } from '@shop/contracts/decor/decor.admin.contract';
import {
  presaleAdminActivityDetail,
  presaleAdminActivityList,
} from '@shop/contracts/presale/presale.admin.contract';
import type { PresaleActivityListItem } from '@shop/contracts/presale/schemas';
import { createContext, useContext, type ReactNode } from 'react';

import { ApiError, callRoute } from '../api';
import type { DiyPickerKind } from '../diy/data-source';
import { createDiyDataSource } from '../diy/record-source';
import { formatMoney } from '../kit';

/**
 * The records a decorated page can point at, for the editor's pickers.
 *
 * | kind       | records                    | offered                                  |
 * | ---------- | -------------------------- | ---------------------------------------- |
 * | `product`  | catalog products           | on shelf                                 |
 * | `label`    | 商品标签                    | enabled                                  |
 * | `article`  | CMS articles               | published                                |
 * | `coupon`   | coupon templates           | claimable now, as the 领券中心 lists      |
 * | `groupbuy` | group-buy campaigns        | active and running now                   |
 * | `presale`  | presale campaigns          | active and not yet ended                 |
 * | `page`     | decor documents (微页面)    | every 微页面 (published or not: see below) |
 *
 * The first five reuse the legacy editor's data source (`admin/diy`, which
 * already answers them from each owning domain's admin contracts) rather
 * than growing a second copy; when the legacy editor is removed at the
 * cutover, `catalog-source.ts` and `record-source.ts` move here. 预售 and 微页面
 * are new with v2 and live here.
 *
 * A 微页面 link may point at a page that is not published yet: operators build
 * the landing page and the banner that links to it together. The server warns
 * about a link to an unpublished page when the linking page is saved
 * (DECOR-004); the storefront skips it until the page goes live.
 *
 * Like `DiyDataSource`, this is a port the pickers call inside a query, and
 * there is no default: a picker outside `<DecorRecordSourceProvider>` throws,
 * so nothing outside the shop can be picked into a stored page.
 */

export type DecorRecordKind =
  'product' | 'label' | 'article' | 'coupon' | 'groupbuy' | 'presale' | 'page';

export const RECORD_KIND_LABELS: Record<DecorRecordKind, string> = {
  product: '商品',
  label: '商品标签',
  article: '资讯',
  coupon: '优惠券',
  groupbuy: '拼团活动',
  presale: '预售活动',
  page: '微页面',
};

export interface DecorRecord {
  id: string;
  name: string;
  image?: string | undefined;
  subtitle?: string | undefined;
}

export interface DecorRecordQuery {
  keyword?: string | undefined;
  page: number;
  pageSize: number;
}

export interface DecorRecordPage {
  items: DecorRecord[];
  total: number;
}

export interface DecorTreeNode {
  id: string;
  name: string;
  children?: DecorTreeNode[] | undefined;
}

export interface DecorRecordSource {
  list(kind: DecorRecordKind, query: DecorRecordQuery): Promise<DecorRecordPage>;
  /**
   * Stored ids back into rows, in the order given. An id whose record is gone
   * drops out; any other failure throws, so an outage never reads as "nothing
   * is picked" and lets the operator overwrite the stored ids.
   */
  resolve(kind: DecorRecordKind, ids: readonly string[]): Promise<DecorRecord[]>;
  categories(kind: 'product' | 'article'): Promise<DecorTreeNode[]>;
}

const DIY_KIND: Partial<Record<DecorRecordKind, DiyPickerKind>> = {
  product: 'product',
  label: 'labels',
  article: 'article',
  coupon: 'coupon',
  groupbuy: 'combination',
};

export interface DecorRecordSourceOptions {
  /** The clock the time-window filters read. Tests pin it. */
  now?: (() => Date) | undefined;
}

export function createDecorRecordSource(options: DecorRecordSourceOptions = {}): DecorRecordSource {
  const now = options.now ?? (() => new Date());
  const diy = createDiyDataSource({ now });
  return {
    list(kind, query) {
      const legacy = DIY_KIND[kind];
      if (legacy) return diy.list(legacy, query);
      return kind === 'presale' ? listPresales(query, now()) : listPages(query);
    },
    resolve(kind, ids) {
      const legacy = DIY_KIND[kind];
      if (ids.length === 0) return Promise.resolve([]);
      if (legacy) return diy.resolve(legacy, ids);
      return kind === 'presale' ? resolvePresales(ids) : resolvePages(ids);
    },
    categories: (kind) => diy.categories(kind),
  };
}

// ---------------------------------------------------------------------------

async function resolveEach(
  ids: readonly string[],
  load: (id: string) => Promise<DecorRecord>,
): Promise<DecorRecord[]> {
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

function toPresaleRecord(row: {
  id: string;
  title: string;
  imageUrl: string | null;
  price: string;
  status: string;
}): DecorRecord {
  return {
    id: row.id,
    name: row.title,
    ...(row.imageUrl ? { image: row.imageUrl } : {}),
    subtitle: `${formatMoney(row.price)}${row.status === 'active' ? '' : ' · 未进行'}`,
  };
}

/** What the storefront's 预售 list can show: active and not yet ended (upcoming included). */
export function isPresaleShowable(row: PresaleActivityListItem, now: Date): boolean {
  return row.status === 'active' && new Date(row.endAt).getTime() > now.getTime();
}

async function listPresales(query: DecorRecordQuery, now: Date): Promise<DecorRecordPage> {
  // The list cannot filter on the clock, so read it whole (it is small) and
  // page the survivors here — the same approach as the 拼团 picker.
  const kept: PresaleActivityListItem[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const batch = await callRoute(presaleAdminActivityList, {
      query: {
        page,
        pageSize: 100,
        status: 'active',
        ...(query.keyword ? { keyword: query.keyword } : {}),
      },
    });
    kept.push(...batch.items.filter((row) => isPresaleShowable(row, now)));
    if (batch.items.length < 100 || page * 100 >= batch.total) break;
  }
  const start = (query.page - 1) * query.pageSize;
  return {
    items: kept.slice(start, start + query.pageSize).map(toPresaleRecord),
    total: kept.length,
  };
}

function resolvePresales(ids: readonly string[]): Promise<DecorRecord[]> {
  return resolveEach(ids, async (id) =>
    toPresaleRecord(await callRoute(presaleAdminActivityDetail, { params: { id } })),
  );
}

function toPageRecord(row: {
  id: string;
  name: string;
  title: string;
  published: unknown;
}): DecorRecord {
  return {
    id: row.id,
    name: row.name,
    subtitle: `${row.title}${row.published ? '' : ' · 未发布'}`,
  };
}

async function listPages(query: DecorRecordQuery): Promise<DecorRecordPage> {
  const page = await callRoute(decorDocumentList, {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      kind: 'custom',
      ...(query.keyword ? { keyword: query.keyword } : {}),
    },
  });
  return { items: page.items.map(toPageRecord), total: page.total };
}

function resolvePages(ids: readonly string[]): Promise<DecorRecord[]> {
  return resolveEach(ids, async (id) =>
    toPageRecord(await callRoute(decorDocumentGet, { params: { id } })),
  );
}

// ---------------------------------------------------------------------------

const DecorRecordSourceContext = createContext<DecorRecordSource | null>(null);

export function DecorRecordSourceProvider({
  source,
  children,
}: {
  source: DecorRecordSource;
  children: ReactNode;
}) {
  return <DecorRecordSourceContext value={source}>{children}</DecorRecordSourceContext>;
}

export function useDecorRecordSource(): DecorRecordSource {
  const source = useContext(DecorRecordSourceContext);
  if (!source) {
    throw new Error('useDecorRecordSource() needs a <DecorRecordSourceProvider> above it');
  }
  return source;
}
