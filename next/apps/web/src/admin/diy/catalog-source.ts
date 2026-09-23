import {
  catalogAdminProductDetail,
  catalogAdminProductList,
} from '@shop/contracts/catalog/catalog.product.admin.contract';
import { catalogAdminCategoryTree } from '@shop/contracts/catalog/catalog.category.admin.contract';
import { catalogAdminLabelList } from '@shop/contracts/catalog/catalog.taxonomy.admin.contract';

import { callRoute } from '../api';
import { formatMoney } from '../kit';
import type { LinkTargetResult, LinkTargetType } from '../kit';
import {
  createStubDiyDataSource,
  type DiyDataSource,
  type DiyPickerItem,
  type DiyPickerKind,
  type DiyTreeNode,
} from './data-source';

/**
 * The real `DiyDataSource`, over the catalog contracts.
 *
 * It answers the three kinds the catalog owns — 商品, 商品分类 and 商品标签 — and
 * delegates the rest (文章, 优惠券, 拼团) to the in-memory stub, so a panel that
 * needs one of those still renders while streams F2 / D finish. Replacing a
 * delegated kind is one case in `list` and one in `resolve`; no panel changes.
 *
 * Why a plain object built from `callRoute` rather than hooks: `DiyDataSource`
 * is a port a panel calls inside a TanStack query, not a component. The caching
 * is the picker's `useQuery`; this layer only maps contract DTOs onto the
 * picker's `{id, name, image, subtitle}`.
 *
 * There is no `brand` kind. The shop has no 品牌 table,
 * so there is no route to page and nothing to pick; see `data-source.tsx`.
 */

const CATALOG_KINDS = new Set<DiyPickerKind>(['product', 'labels']);

/** `/pages/goods_details/index?id=1` — what the uni renderer navigates to. */
export function productDetailPath(id: string): string {
  return `/pages/goods_details/index?id=${encodeURIComponent(id)}`;
}

/** `/pages/goods_list/index?cid=1` — the category landing page. */
export function productCategoryPath(id: string): string {
  return `/pages/goods_list/index?cid=${encodeURIComponent(id)}`;
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

export function createCatalogDiyDataSource(
  fallback: DiyDataSource = createStubDiyDataSource(),
): DiyDataSource {
  return {
    async list(kind, query) {
      if (!CATALOG_KINDS.has(kind)) return fallback.list(kind, query);

      if (kind === 'labels') {
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
    },

    async resolve(kind, ids) {
      if (!CATALOG_KINDS.has(kind)) return fallback.resolve(kind, ids);

      if (kind === 'labels') {
        // No by-id route for labels; the list is small and already cached.
        const page = await callRoute(catalogAdminLabelList, {
          query: { page: 1, pageSize: 100 },
        });
        const byId = new Map(page.items.map((label) => [label.id, label.name]));
        return ids.map((id) => ({ id, name: byId.get(id) ?? `#${id}` }));
      }

      // One detail call per id, and only for ids a saved page already carries —
      // the pickers store the row whole (name, image), so this runs only for
      // stored payloads that carry bare ids.
      const rows = await Promise.all(
        ids.map(async (id): Promise<DiyPickerItem> => {
          try {
            const detail = await callRoute(catalogAdminProductDetail, { params: { id } });
            return {
              id,
              name: detail.name,
              image: detail.imageUrl,
              subtitle: formatMoney(detail.price),
            };
          } catch {
            // A deleted product must not blank the whole picker.
            return { id, name: `#${id}` };
          }
        }),
      );
      return rows;
    },

    async categories(kind) {
      if (kind !== 'product') return fallback.categories(kind);
      const tree = await callRoute(catalogAdminCategoryTree, { query: {} });
      return flattenTree(tree.items);
    },
  };
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
 * The `targets` callback `createDiyLinkSource` wants, for the 商品 and 商品分类
 * tabs of `<LinkPicker>`. 文章 has no list here and stays empty.
 */
export async function catalogLinkTargets(
  type: Exclude<LinkTargetType, 'page' | 'custom'>,
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
  if (type === 'category') {
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
  return { items: [], total: 0 };
}
