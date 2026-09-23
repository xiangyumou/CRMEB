import type { DiyDataSource, DiyPickerItem, DiyTreeNode } from '@/admin/diy/data-source';
import { fixtureProducts } from '@shop/storefront-blocks/fixtures';

/**
 * The spike page's `DiyDataSource`: the storefront-blocks fixture products
 * (ids 12–17) and a small category tree, in memory. The v1 editor's pickers
 * read it unchanged; nothing reaches a route or the shop's catalogue.
 */

const PRODUCTS: DiyPickerItem[] = fixtureProducts.map((product) => ({
  id: product.id,
  name: product.title,
  image: product.image,
  subtitle: `¥${product.price}`,
}));

const ARTICLES: DiyPickerItem[] = Array.from({ length: 8 }, (_unused, index) => ({
  id: String(index + 1),
  name: `示例资讯 ${index + 1}`,
  subtitle: '2026-09-01',
}));

const CATEGORIES: DiyTreeNode[] = [
  {
    id: '1',
    name: '服饰',
    children: [
      { id: '3', name: '女装' },
      { id: '4', name: '男装' },
    ],
  },
  {
    id: '2',
    name: '数码',
    children: [{ id: '5', name: '耳机' }],
  },
];

function rowsOf(kind: string): DiyPickerItem[] {
  if (kind === 'product') return PRODUCTS;
  if (kind === 'article') return ARTICLES;
  return [];
}

export function createDecorDemoDataSource(): DiyDataSource {
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
