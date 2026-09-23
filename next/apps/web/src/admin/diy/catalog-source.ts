import {
  catalogAdminProductDetail,
  catalogAdminProductList,
} from '@shop/contracts/catalog/catalog.product.admin.contract';
import { catalogAdminCategoryTree } from '@shop/contracts/catalog/catalog.category.admin.contract';
import { catalogAdminLabelList } from '@shop/contracts/catalog/catalog.taxonomy.admin.contract';

import { callRoute } from '../api';
import { formatMoney } from '../kit';
import type { LinkTargetResult } from '../kit';
import type { DiyPickerItem, DiyPickerQuery, DiyPickerResult, DiyTreeNode } from './data-source';

/**
 * The catalog's half of the DIY data source: 商品, 商品标签 and the 商品分类
 * tree, over the catalog admin contracts. `createDiyDataSource` in
 * `record-source.ts` composes these with the CMS and marketing kinds.
 *
 * Why plain functions over `callRoute` rather than hooks: `DiyDataSource` is a
 * port a panel calls inside a TanStack query, not a component. The caching is
 * the picker's `useQuery`; this layer only maps contract DTOs onto the
 * picker's `{id, name, image, subtitle}`.
 *
 * There is no `brand` kind. The shop has no 品牌 table, so there is no route to
 * page and nothing to pick; see `data-source.tsx`.
 */

/** `/pages/goods_details/index?id=1` — what the uni renderer navigates to. */
export function productDetailPath(id: string): string {
  return `/pages/goods_details/index?id=${encodeURIComponent(id)}`;
}

/** `/pages/goods/goods_list/index?cid=1` — the category landing page. */
export function productCategoryPath(id: string): string {
  return `/pages/goods/goods_list/index?cid=${encodeURIComponent(id)}`;
}

function flattenTree(
  nodes: readonly { id: string; name: string; children?: readonly unknown[] }[],
): DiyTreeNode[] {
  return nodes.map((node) => {
    const children = (node.children ?? []) as {
      id: string;
      name: string;
      children?: readonly unknown[];
    }[];
    return {
      id: node.id,
      name: node.name,
      ...(children.length > 0 ? { children: flattenTree(children) } : {}),
    };
  });
}

/** 商品: on-shelf products only, with the price as the second line. */
export async function listProducts(query: DiyPickerQuery): Promise<DiyPickerResult> {
  const page = await callRoute(catalogAdminProductList, {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      // 已上架 only: a DIY page must not advertise a product the shopper
      // cannot open.
      tab: 'on_shelf',
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    },
  });
  return { items: page.items.map(toProductItem), total: page.total };
}

/**
 * Stored product ids back into rows: one detail call per id. It runs only for
 * ids a saved page already carries — the pickers store the row whole (name,
 * image) — so the count stays small.
 */
export async function resolveProducts(ids: readonly string[]): Promise<DiyPickerItem[]> {
  return Promise.all(
    ids.map(async (id): Promise<DiyPickerItem> => {
      try {
        const detail = await callRoute(catalogAdminProductDetail, { params: { id } });
        return toProductItem({ ...detail, id });
      } catch {
        // A deleted product must not blank the whole picker.
        return { id, name: `#${id}` };
      }
    }),
  );
}

/** 商品标签: enabled labels only. */
export async function listLabels(query: DiyPickerQuery): Promise<DiyPickerResult> {
  const page = await callRoute(catalogAdminLabelList, {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      isEnabled: 'true',
      ...(query.keyword ? { keyword: query.keyword } : {}),
    },
  });
  return {
    items: page.items.map((label) => ({
      id: label.id,
      name: label.name,
      ...(label.imageUrl ? { image: label.imageUrl } : {}),
      ...(label.categoryName ? { subtitle: label.categoryName } : {}),
    })),
    total: page.total,
  };
}

export async function resolveLabels(ids: readonly string[]): Promise<DiyPickerItem[]> {
  // No by-id route for labels; the list is small and one page holds it.
  const page = await callRoute(catalogAdminLabelList, { query: { page: 1, pageSize: 100 } });
  const byId = new Map(page.items.map((label) => [label.id, label.name]));
  return ids.map((id) => ({ id, name: byId.get(id) ?? `#${id}` }));
}

/** The 商品分类 tree, nesting kept. */
export async function productCategoryTree(): Promise<DiyTreeNode[]> {
  const tree = await callRoute(catalogAdminCategoryTree, { query: {} });
  return flattenTree(tree.items);
}

function toProductItem(row: {
  id: string;
  name: string;
  imageUrl: string;
  price: string;
}): DiyPickerItem {
  return { id: row.id, name: row.name, image: row.imageUrl, subtitle: formatMoney(row.price) };
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
