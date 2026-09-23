'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Everything a config panel needs from other domains.
 *
 * Panels never call a route. The shell installs one implementation here and the
 * panels programme against the interface, so a panel never depends on another
 * domain's routes and every panel runs against a stub in tests. Exactly the
 * arrangement the kit uses for `AssetSource` and `LinkSource`.
 */

export interface DiyPickerItem {
  id: string;
  name: string;
  /** Thumbnail URL, when the record has one. */
  image?: string | undefined;
  /** Second line: price for a product, article date, coupon face value. */
  subtitle?: string | undefined;
}

export interface DiyPickerQuery {
  keyword?: string | undefined;
  /** Restricts to one category, where the record type has categories. */
  categoryId?: string | undefined;
  page: number;
  pageSize: number;
}

export interface DiyPickerResult {
  items: DiyPickerItem[];
  total: number;
}

export interface DiyTreeNode {
  id: string;
  name: string;
  children?: DiyTreeNode[] | undefined;
}

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
  /** Resolves ids already stored in a saved page back into display rows. */
  resolve(kind: DiyPickerKind, ids: readonly string[]): Promise<DiyPickerItem[]>;
  /** Product categories and article categories, as a tree. */
  categories(kind: 'product' | 'article'): Promise<DiyTreeNode[]>;
}

/**
 * In-memory stand-in so the editor and every panel run — and are testable —
 * before the owning domains ship. Replace by wrapping the shell in
 * `<DiyDataSourceProvider source={real}>`; no panel changes.
 */
export function createStubDiyDataSource(): DiyDataSource {
  const rows: Record<DiyPickerKind, DiyPickerItem[]> = {
    product: Array.from({ length: 24 }, (_unused, i) => ({
      id: String(i + 1),
      name: `示例商品 ${i + 1}`,
      image: '',
      subtitle: `¥${(i + 1) * 10}.00`,
    })),
    article: Array.from({ length: 12 }, (_unused, i) => ({
      id: String(i + 1),
      name: `示例文章 ${i + 1}`,
      subtitle: '2026-01-01',
    })),
    coupon: Array.from({ length: 8 }, (_unused, i) => ({
      id: String(i + 1),
      name: `示例优惠券 ${i + 1}`,
      subtitle: `满 100 减 ${i + 1}0`,
    })),
    combination: Array.from({ length: 6 }, (_unused, i) => ({
      id: String(i + 1),
      name: `示例拼团 ${i + 1}`,
      subtitle: `¥${(i + 1) * 9}.90`,
    })),
    labels: Array.from({ length: 6 }, (_unused, i) => ({
      id: String(i + 1),
      name: `示例标签 ${i + 1}`,
    })),
  };

  return {
    async list(kind, query) {
      const keyword = query.keyword?.trim() ?? '';
      const all = rows[kind].filter((row) => !keyword || row.name.includes(keyword));
      const start = (query.page - 1) * query.pageSize;
      return { items: all.slice(start, start + query.pageSize), total: all.length };
    },
    async resolve(kind, ids) {
      const byId = new Map(rows[kind].map((row) => [row.id, row]));
      return ids.map((id) => byId.get(id) ?? { id, name: `#${id}` });
    },
    async categories(kind) {
      return [
        {
          id: '1',
          name: kind === 'product' ? '全部商品分类' : '全部文章分类',
          children: [
            { id: '11', name: '示例一级分类' },
            { id: '12', name: '示例二级分类' },
          ],
        },
      ];
    },
  };
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

/** Falls back to the stub so a panel rendered in isolation still works. */
const fallback = createStubDiyDataSource();

export function useDiyDataSource(): DiyDataSource {
  return useContext(DiyDataSourceContext) ?? fallback;
}
