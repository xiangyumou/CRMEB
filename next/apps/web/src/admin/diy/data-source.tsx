'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Everything a config panel needs from other domains.
 *
 * Panels never call a route. The shell installs one implementation here and the
 * panels programme against the interface, which is what lets stream G2 build
 * all sixty panels before the catalog (A), CMS (F2) and coupon streams have
 * shipped their list endpoints. Exactly the arrangement the kit uses for
 * `AssetSource` and `LinkSource`.
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

/** The record types a DIY component can point at or embed. */
export type DiyPickerKind = 'product' | 'article' | 'coupon' | 'combination';

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
