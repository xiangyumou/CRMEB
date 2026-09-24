import { catalogAdminProductList } from '@shop/contracts/catalog/catalog.product.admin.contract';
import { catalogAdminCategoryTree } from '@shop/contracts/catalog/catalog.category.admin.contract';

import { callRoute } from '../api';
import { formatMoney } from '../kit';
import type { LinkTargetResult } from '../kit';

// The picker kinds moved to the decor editor, which outlives this one.
export {
  listLabels,
  listProducts,
  productCategoryTree,
  resolveLabels,
  resolveProducts,
} from '../decor/catalog-records';

/**
 * The legacy editor's catalog links: the uni-app paths of a product and a
 * category, and the 商品 / 商品分类 tabs of `<LinkPicker>`. The picker kinds
 * (商品, 商品标签, 商品分类) live in `admin/decor/catalog-records.ts` and are
 * re-exported here for `record-source.ts`. Deleted with `admin/diy` at the
 * cutover.
 */

/** `/pages/goods_details/index?id=1` — what the uni renderer navigates to. */
export function productDetailPath(id: string): string {
  return `/pages/goods_details/index?id=${encodeURIComponent(id)}`;
}

/** `/pages/goods/goods_list/index?cid=1` — the category landing page. */
export function productCategoryPath(id: string): string {
  return `/pages/goods/goods_list/index?cid=${encodeURIComponent(id)}`;
}

/**
 * The 商品 and 商品分类 tabs of `<LinkPicker>`. `diyLinkTargets` in
 * `link-source.ts` routes each searchable tab to its owner.
 */
export async function catalogLinkTargets(
  type: 'product' | 'category',
  query: { keyword?: string | undefined; page: number; pageSize: number },
): Promise<LinkTargetResult> {
  if (type === 'product') {
    const page = await callRoute(catalogAdminProductList, {
      query: {
        page: query.page,
        pageSize: query.pageSize,
        tab: 'on_shelf',
        ...(query.keyword ? { keyword: query.keyword } : {}),
      },
    });
    return {
      items: page.items.map((row) => ({
        id: row.id,
        name: row.name,
        url: productDetailPath(row.id),
        thumb: row.imageUrl,
        subtitle: formatMoney(row.price),
      })),
      total: page.total,
    };
  }
  const tree = await callRoute(catalogAdminCategoryTree, { query: {} });
  const flat: { id: string; name: string; path: string }[] = [];
  const walk = (
    nodes: readonly { id: string; name: string; children?: readonly unknown[] }[],
    trail: readonly string[],
  ): void => {
    for (const node of nodes) {
      const here = [...trail, node.name];
      flat.push({ id: node.id, name: node.name, path: here.join(' / ') });
      walk(
        (node.children ?? []) as { id: string; name: string; children?: readonly unknown[] }[],
        here,
      );
    }
  };
  walk(tree.items, []);
  const keyword = query.keyword?.trim() ?? '';
  const matched = keyword ? flat.filter((row) => row.path.includes(keyword)) : flat;
  const start = (query.page - 1) * query.pageSize;
  return {
    items: matched.slice(start, start + query.pageSize).map((row) => ({
      id: row.id,
      name: row.name,
      url: productCategoryPath(row.id),
      subtitle: row.path,
    })),
    total: matched.length,
  };
}
