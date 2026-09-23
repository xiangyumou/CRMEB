import { fixtureProducts } from '@shop/storefront-blocks/fixtures';

import type { DecorRecord, DecorRecordSource, DecorTreeNode } from '@/admin/decor';

/**
 * The sandbox's record source: the storefront-blocks fixture products (ids
 * 12–17), a few articles and labels and a small category tree, in memory.
 * The editor's pickers read it unchanged; nothing reaches a route.
 */

const PRODUCTS: DecorRecord[] = fixtureProducts.map((product) => ({
  id: product.id,
  name: product.title,
  image: product.image,
  subtitle: `¥${product.price}`,
}));

const ARTICLES: DecorRecord[] = Array.from({ length: 8 }, (_unused, index) => ({
  id: String(index + 1),
  name: `示例资讯 ${index + 1}`,
  subtitle: '2026-09-01',
}));

const LABELS: DecorRecord[] = [
  { id: '1', name: '新品' },
  { id: '2', name: '热卖' },
];

const CATEGORIES: DecorTreeNode[] = [
  {
    id: '1',
    name: '茶饮',
    children: [
      { id: '3', name: '普洱' },
      { id: '4', name: '白茶' },
    ],
  },
  { id: '2', name: '器具', children: [{ id: '5', name: '茶杯' }] },
];

function rowsOf(kind: string): DecorRecord[] {
  if (kind === 'product') return PRODUCTS;
  if (kind === 'article') return ARTICLES;
  if (kind === 'label') return LABELS;
  return [];
}

export function createDecorDemoRecordSource(): DecorRecordSource {
  return {
    async list(kind, query) {
      const keyword = query.keyword?.trim() ?? '';
      const all = rowsOf(kind).filter((row) => !keyword || row.name.includes(keyword));
      const start = (query.page - 1) * query.pageSize;
      return { items: all.slice(start, start + query.pageSize), total: all.length };
    },
    async resolve(kind, ids) {
      const byId = new Map(rowsOf(kind).map((row) => [row.id, row]));
      return ids.flatMap((id) => byId.get(id) ?? []);
    },
    async categories() {
      return CATEGORIES;
    },
  };
}
