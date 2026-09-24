'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type {
  DecorRecord,
  DecorRecordPage,
  DecorRecordQuery,
  DecorTreeNode,
} from '../decor/record-types';

/**
 * Everything a config panel needs from other domains.
 *
 * Panels never call a route. The editor installs the real implementation
 * (`createDiyDataSource`, over the admin contracts) and the panels programme
 * against the interface, so a panel never depends on another domain's routes
 * and every panel runs against an in-memory source in tests. The same
 * arrangement the kit uses for `AssetSource` and `LinkSource`.
 */

// The row shapes are the decor editor's (`admin/decor/record-types.ts`), which
// outlives this one; the legacy names stay for the legacy panels.
export type DiyPickerItem = DecorRecord;
export type DiyPickerQuery = DecorRecordQuery;
export type DiyPickerResult = DecorRecordPage;
export type DiyTreeNode = DecorTreeNode;

/**
 * The record types a DIY component can point at or embed.
 *
 * `labels` (商品标签) pages `catalog.adminLabelList`. **There is no `brand`**:
 * the shop has no 品牌 table, so there is no route and nothing to page
 * through. Two stored keys can still name brands, and neither gets a picker:
 *
 * - 商品列表's `brandList`, in the 筛选商品 branch. The key is in neither
 *   `goodList.default.ts` nor `goodList.schema.ts`; a node carrying one keeps it.
 * - the per-tab `brandConfig.brandVal` of 商品选项卡.
 *   `_fields/promotion-tabs.tsx` shows it read-only rather than dropping it, and
 *   still draws the 品牌 source branch when a tab says that is what it is.
 */
export type DiyPickerKind = 'product' | 'article' | 'coupon' | 'combination' | 'labels';

export interface DiyDataSource {
  list(kind: DiyPickerKind, query: DiyPickerQuery): Promise<DiyPickerResult>;
  /**
   * Resolves ids already stored in a saved page back into display rows, in
   * the order given.
   *
   * An id whose record no longer exists is left out. Any other failure
   * throws: a picker that took an outage for "nothing is picked" would let
   * the operator overwrite the saved ids with an empty list.
   */
  resolve(kind: DiyPickerKind, ids: readonly string[]): Promise<DiyPickerItem[]>;
  /** Product categories and article categories, as a tree. */
  categories(kind: 'product' | 'article'): Promise<DiyTreeNode[]>;
}

const DiyDataSourceContext = createContext<DiyDataSource | null>(null);

export function DiyDataSourceProvider({
  source,
  children,
}: {
  source: DiyDataSource;
  children: ReactNode;
}) {
  return <DiyDataSourceContext value={source}>{children}</DiyDataSourceContext>;
}

/**
 * The source the enclosing editor mounted.
 *
 * There is deliberately no fallback: a picker rendered without a provider
 * throws rather than offering rows that are not in the shop, because whatever
 * the operator picks is saved into the page and rendered by the storefront.
 * Tests mount `createStubDiyDataSource()` from `@/test/diy-data-source`.
 */
export function useDiyDataSource(): DiyDataSource {
  const source = useContext(DiyDataSourceContext);
  if (!source) {
    throw new Error('useDiyDataSource() needs a <DiyDataSourceProvider> above it');
  }
  return source;
}
