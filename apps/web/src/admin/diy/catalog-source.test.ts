import { afterEach, describe, expect, it } from 'vitest';

import { catalogAdminCategoryTree } from '@shop/contracts/catalog/catalog.category.admin.contract';
import {
  catalogAdminProductDetail,
  catalogAdminProductList,
} from '@shop/contracts/catalog/catalog.product.admin.contract';
import { catalogAdminLabelList } from '@shop/contracts/catalog/catalog.taxonomy.admin.contract';
import {
  adminProductDetailExample,
  adminProductListItemExample,
  type AdminProductListItem,
  productCategoryChildExample,
  productCategoryExample,
  type ProductCategoryNode,
  type ProductLabel,
} from '@shop/contracts/catalog/schemas';

import { on, respondWithError, stubRoutes } from '@/test/api';

import { resetApiConfig } from '../api';
import {
  catalogLinkTargets,
  listLabels,
  listProducts,
  productCategoryPath,
  productCategoryTree,
  productDetailPath,
  resolveProducts,
} from './catalog-source';

/**
 * The catalog's picker kinds, over the catalog contracts.
 *
 * The pickers are the only place a DIY node can gain a product, a category or a
 * 商品标签 id, so what this layer sends and what it maps back is as load-bearing
 * as the panels themselves. Tested through a stubbed `fetch` rather than a
 * mocked `callRoute`, so the query string the admin API actually builds is
 * part of the assertion.
 */

afterEach(() => resetApiConfig());

const product: AdminProductListItem = {
  ...adminProductListItemExample,
  id: '7',
  name: '牛仔外套',
  imageUrl: '/uploads/7.png',
  price: '199.00',
};

const label: ProductLabel = {
  id: '3',
  name: '包邮',
  style: 'text',
  fontColor: '#FFFFFF',
  backgroundColor: '#E93323',
  borderColor: null,
  imageUrl: null,
  categoryId: '1',
  categoryName: '促销',
  isVisible: true,
  isEnabled: true,
  sortOrder: 0,
  productCount: 12,
  createdAt: '2026-01-01T10:00:00+08:00',
};

const tree: { items: ProductCategoryNode[] } = {
  items: [
    {
      ...productCategoryExample,
      id: '7',
      name: '服饰',
      children: [
        { ...productCategoryChildExample, id: '17', parentId: '7', name: 'T恤', children: [] },
      ],
    },
  ],
};

describe('the catalog picker kinds', () => {
  it('pages 商品 through the admin list, on-shelf only, and formats the price', async () => {
    const calls = stubRoutes([
      on(catalogAdminProductList, { items: [product], total: 42, page: 2, pageSize: 10 }),
    ]);
    const result = await listProducts({ keyword: '外套', page: 2, pageSize: 10 });

    expect(calls[0]?.url).toContain('/admin-api/catalog/products');
    // 已上架 only: a DIY page must not advertise a product nobody can open.
    expect(calls[0]?.url).toContain('tab=on_shelf');
    expect(calls[0]?.url).toContain('page=2');
    expect(calls[0]?.url).toContain(`keyword=${encodeURIComponent('外套')}`);
    expect(result).toEqual({
      items: [{ id: '7', name: '牛仔外套', image: '/uploads/7.png', subtitle: '¥199.00' }],
      total: 42,
    });
  });

  it('pages 商品标签 through the label list, enabled only', async () => {
    const calls = stubRoutes([
      on(catalogAdminLabelList, { items: [label], total: 1, page: 1, pageSize: 10 }),
    ]);
    const result = await listLabels({ page: 1, pageSize: 10 });

    expect(calls[0]?.url).toContain('/admin-api/catalog/labels');
    expect(calls[0]?.url).toContain('isEnabled=true');
    // A label with no image contributes no `image` key rather than an empty one.
    expect(result.items).toEqual([{ id: '3', name: '包邮', subtitle: '促销' }]);
  });

  it('resolves stored product ids one detail call each, and survives a deleted one', async () => {
    const calls = stubRoutes([
      on(catalogAdminProductDetail, (call) =>
        call.params.id === '9'
          ? respondWithError(404, { code: 'NOT_FOUND', message: '资源不存在' })
          : { ...adminProductDetailExample, ...product },
      ),
    ]);
    const rows = await resolveProducts(['7', '9']);

    expect(calls).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: '7', name: '牛仔外套', subtitle: '¥199.00' });
    // The picker keeps rendering; the missing row shows its bare id.
    expect(rows[1]).toEqual({ id: '9', name: '#9' });
  });

  it('flattens the category tree into the picker tree, keeping the nesting', async () => {
    stubRoutes([on(catalogAdminCategoryTree, tree)]);
    const nodes = await productCategoryTree();
    expect(nodes).toEqual([{ id: '7', name: '服饰', children: [{ id: '17', name: 'T恤' }] }]);
  });
});

describe('catalogLinkTargets', () => {
  it('turns products into the storefront paths the uni renderer navigates to', async () => {
    stubRoutes([
      on(catalogAdminProductList, { items: [product], total: 1, page: 1, pageSize: 20 }),
    ]);
    const result = await catalogLinkTargets('product', { page: 1, pageSize: 20 });
    expect(result.items[0]).toEqual({
      id: '7',
      name: '牛仔外套',
      url: '/pages/goods_details/index?id=7',
      thumb: '/uploads/7.png',
      subtitle: '¥199.00',
    });
  });

  it('flattens categories, shows the trail and searches it', async () => {
    stubRoutes([on(catalogAdminCategoryTree, tree)]);
    const all = await catalogLinkTargets('category', { page: 1, pageSize: 20 });
    expect(all.total).toBe(2);
    expect(all.items.map((row) => row.subtitle)).toEqual(['服饰', '服饰 / T恤']);
    expect(all.items[1]?.url).toBe('/pages/goods/goods_list/index?cid=17');

    stubRoutes([on(catalogAdminCategoryTree, tree)]);
    const matched = await catalogLinkTargets('category', {
      keyword: 'T恤',
      page: 1,
      pageSize: 20,
    });
    expect(matched.total).toBe(1);
    expect(matched.items[0]?.id).toBe('17');
  });
});

describe('the storefront paths', () => {
  it('encodes the id rather than interpolating it raw', () => {
    expect(productDetailPath('a b')).toBe('/pages/goods_details/index?id=a%20b');
    expect(productCategoryPath('7')).toBe('/pages/goods/goods_list/index?cid=7');
  });
});
